---
title: "[SKALA] 쿠버네티스 9장 — Service와 클러스터 네트워킹"
date: 2026-09-08 10:00:00 +0900
permalink: /posts/skala-kubernetes-ch09-service-networking/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, service, endpointslice, coredns, networking]
description: "변하는 Pod IP 앞에 Service가 제공하는 안정적 주소, EndpointSlice와 readiness의 관계, CoreDNS 및 Service 유형별 노출 범위를 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch08-deployment-rollout, skala-kubernetes-ch10-request-flow]
---

## Pod IP를 애플리케이션 설정에 쓰지 않는 이유

Pod는 rollout, scale, node failure로 재생성되고 IP가 달라진다. client가 Pod IP를 직접 저장하면 변경될 때마다 설정을 수정해야 한다. Service는 수명이 긴 virtual IP와 DNS name을 제공하고, 현재 Ready인 Pod 집합으로 연결한다.

```text
client → shop-api Service
             ↓ selector + readiness
         EndpointSlice
          ├─ Pod A IP
          ├─ Pod B IP
          └─ Pod C IP
```

Service selector에 맞는 Pod는 Ready가 아니어도 EndpointSlice에 주소가 남을 수 있다. 일반적인 Service 라우팅은 endpoint의 ready 조건을 확인해 정상 트래픽 대상을 고르므로, 주소의 존재와 요청을 받을 준비 상태를 구분한다. `publishNotReadyAddresses` 같은 예외 설정도 함께 확인한다. 연결이 안 될 때 `kubectl get endpoints` 또는 `kubectl get endpointslices`를 먼저 보는 이유다.

## Service는 가상 IP다

ClusterIP를 network interface가 직접 소유하고 server process가 listen하는 구조가 아니다. kube-proxy가 각 node의 kernel rule을 구성해 `ClusterIP:port` 목적지를 endpoint의 `PodIP:targetPort`로 변환한다. 따라서 ICMP ping보다 TCP/HTTP 요청으로 확인한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: shop-api
spec:
  selector: { app: shop-api }
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

`port`는 Service가 받는 port이고 `targetPort`는 container process가 실제 listen하는 port다. targetPort가 틀리면 endpoint IP가 존재해도 요청은 실패한다.

## Service 유형은 노출 범위다

| 유형 | 접근 범위 | 적합한 곳 |
|---|---|---|
| ClusterIP | cluster 내부 | 대부분의 내부 service |
| NodePort | 모든 node의 고정 port | 임시 진입점, 일부 on-prem 구성 |
| LoadBalancer | cloud load balancer를 통해 외부 | TCP 또는 독립 LB가 필요한 service |
| ExternalName | 외부 DNS name을 CNAME으로 노출 | 외부 managed service 별칭 |
| Headless | ClusterIP 없이 Pod 주소를 DNS로 반환 | StatefulSet, client-side discovery |

Headless Service는 `clusterIP: None`으로 만들며 load balancing virtual IP를 제공하지 않는다. DNS가 개별 Pod endpoint 주소를 반환하므로 client가 특정 StatefulSet replica를 선택하거나 자체 discovery를 수행할 수 있다.

## CoreDNS와 이름 규칙

Service를 만들면 cluster DNS에 이름이 등록된다.

```text
<service>.<namespace>.svc.cluster.local
```

같은 namespace에서는 `http://shop-api`, 다른 namespace에서는 `http://shop-api.class-7`처럼 줄여 쓸 수 있다. 완전한 이름을 사용할 수도 있다. container의 `/etc/resolv.conf`에 있는 search domain이 짧은 이름을 차례로 확장한다.

```bash
kubectl run nettest --rm -it --image=nicolaka/netshoot -- bash
nslookup shop-api
curl -s http://shop-api/actuator/health
```

application config에는 Pod IP나 ClusterIP보다 Service DNS name을 사용한다. Service를 삭제 후 재생성하면 ClusterIP가 달라질 수 있지만 name을 유지하면 client config는 바뀌지 않는다.

## EKS LoadBalancer Service

cloud integration이 설치된 EKS에서 `type: LoadBalancer`는 AWS load balancer 생성을 요청한다. `target-type: ip`를 쓰면 target group에 Pod IP가 직접 등록되어 NodePort hop을 줄일 수 있다. 반면 instance target은 node IP와 NodePort를 대상으로 한다.

load balancer는 Service마다 비용과 관리 지점을 만든다. HTTP(S) service 여러 개는 Ingress로 묶고, TCP처럼 L7 routing이 필요 없는 경우에 독립 LoadBalancer Service를 검토한다.

## session을 Pod memory에 두지 않는다

Service load balancing은 connection 단위로 다른 Pod를 선택할 수 있다. Pod도 언제든 종료된다. 로그인 session을 한 Pod의 memory에만 두면 다음 요청이나 rollout에서 사라진다. Redis·DB 같은 외부 store 또는 stateless token을 사용한다. sticky session은 임시 완화책이며 Pod failure와 uneven load 문제는 남는다.

## 계층별 진단

```text
1. PodIP:targetPort 직접 호출
2. Service ClusterIP:port 호출
3. Service DNS name 호출
4. EndpointSlice와 Ready Pod 수 확인
5. NetworkPolicy와 CNI 정책 확인
```

- Pod IP는 되는데 Service가 안 됨: selector, port, EndpointSlice, kube-proxy
- Service IP는 되는데 name이 안 됨: CoreDNS, namespace, search domain
- endpoint가 비어 있음: selector 불일치 또는 Pod가 Ready가 아님
- timeout: targetPort, bind address, policy route를 확인

## Service를 Pod까지 분해해 확인하기

Service는 자체 프로세스가 아니라 selector로 EndpointSlice를 만들고, kube-proxy 또는 eBPF data plane이 그 목록으로 패킷을 보낸다. 따라서 `Service` 객체만 `Running`인지 보는 것으로는 충분하지 않다.

```bash
kubectl get service shop-api -n demo -o wide
kubectl describe service shop-api -n demo
kubectl get service shop-api -n demo \
  -o jsonpath='{.spec.clusterIP}{" port="}{.spec.ports[0].port}{" targetPort="}{.spec.ports[0].targetPort}{"\n"}'
kubectl get endpointslice -n demo \
  -l kubernetes.io/service-name=shop-api -o wide
kubectl get pod -n demo -l app=shop-api \
  -o custom-columns='NAME:.metadata.name,READY:.status.containerStatuses[0].ready,IP:.status.podIP'

kubectl run dns-test -n demo --rm -i --restart=Never \
  --image=busybox:1.36 -- nslookup shop-api
kubectl run http-test -n demo --rm -i --restart=Never \
  --image=busybox:1.36 -- wget -qO- http://shop-api:80/actuator/health
```

`EndpointSlice`의 `ready`가 false인 주소는 정상적인 Service backend로 취급되지 않는다. Pod IP 직접 호출은 되는데 Service 호출이 실패하면 selector·port·data plane을, ClusterIP 호출은 되는데 DNS만 실패하면 CoreDNS와 namespace search path를 우선 본다. `kubectl run --rm` 디버그 Pod는 테스트가 끝나면 삭제되지만, 실행 중인 namespace의 NetworkPolicy와 DNS 정책을 그대로 적용받는다는 점이 오히려 장점이다.

## 정리

- Service는 변하는 Pod 집합 앞의 안정적인 name과 virtual IP다.
- 실제 목적지 목록은 Ready 조건을 반영한 EndpointSlice다.
- cluster 안 application config에는 Service DNS name을 쓴다.
- Headless Service는 stable Pod DNS가 필요한 StatefulSet과 연결된다.
- session과 영속 상태는 교체 가능한 Pod 밖에 둔다.

---

이전 글: [8장 — Deployment와 무중단 롤아웃](/posts/skala-kubernetes-ch08-deployment-rollout/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [10장 — 호출 흐름 추적](/posts/skala-kubernetes-ch10-request-flow/)
