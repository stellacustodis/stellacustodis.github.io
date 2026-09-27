---
title: "[SKALA] 쿠버네티스 10장 — 외부 요청의 호출 흐름 추적"
date: 2026-09-08 11:00:00 +0900
permalink: /posts/skala-kubernetes-ch10-request-flow/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, ingress, service, networking, troubleshooting]
description: "도메인에서 load balancer, Ingress, Service, Pod와 process까지 요청이 지나는 구간을 나누고 장애를 역추적하는 순서를 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch09-service-networking, skala-kubernetes-ch11-ingress]
---

## 요청 경로를 여섯 구간으로 나눈다

“Ingress → Service → Pod”는 리소스 관계를 이해하는 좋은 출발점이지만, 실제 장애를 찾으려면 주소가 바뀌는 지점을 더 잘게 나눠야 한다.

```text
1. Domain → Load Balancer
2. Load Balancer → Ingress Controller 또는 Pod target
3. Service DNS → ClusterIP
4. ClusterIP → PodIP:targetPort
5. Pod network → container port
6. container port → listening process
```

각 구간은 서로 다른 관리 주체와 관측 방법을 가진다. 외부 DNS는 `kubectl`만으로 확인할 수 없고, Service virtual IP 변환에는 access log를 남기는 process가 없으며, 마지막 구간은 application bind address가 결정한다.

## 1구간: 도메인에서 load balancer까지

DNS record가 load balancer 주소를 가리키고 인증서가 유효해야 한다. wildcard DNS를 사용하면 등록하지 않은 host도 load balancer까지 도착할 수 있으며, 최종 차단은 Ingress host rule이 담당한다.

```bash
dig +short api.example.com
kubectl get ingress
curl -v https://api.example.com/health
```

cluster 내부 probe만으로는 외부 DNS, certificate expiration, public route 문제를 발견하지 못한다. 외부 위치에서 endpoint를 주기적으로 호출하는 synthetic monitoring이 별도로 필요하다.

## 2구간: load balancer의 target

AWS load balancer target 유형에 따라 경로가 달라진다.

```text
target-type: ip
LB → PodIP:targetPort

target-type: instance
LB → NodeIP:NodePort → PodIP
```

`target-type: ip`에서는 실제 data packet이 Service ClusterIP를 거치지 않을 수 있다. 그래도 Ingress backend는 Service name/port를 참조하고 controller가 그 관계에서 Pod target을 구성한다. 즉, **논리적 리소스 흐름과 실제 packet hop은 다를 수 있다.**

LB health check가 통과한 target만 요청을 받는다. Kubernetes readiness와 LB health check 경로가 서로 다르면 Pod는 Ready지만 LB에서는 unhealthy이거나 그 반대가 될 수 있다.

## 3·4구간: 보이지 않는 주소 변환

cluster 내부 호출은 CoreDNS가 Service name을 ClusterIP로 바꾸고, kube-proxy가 설치한 rule이 ClusterIP를 endpoint Pod IP로 바꾼다.

```bash
kubectl get service shop-api -o wide
kubectl get endpointslices -l kubernetes.io/service-name=shop-api
```

이 구간에는 일반 application access log가 없다. endpoint가 비어 있는지, Service `port/targetPort`, selector와 Pod Ready 상태를 API object로 확인한다.

## 5·6구간: Pod에 도착한 뒤

Pod IP까지 packet이 도착했는데 응답이 없다면 process가 실제 port와 address에 listen하는지 본다. application이 `127.0.0.1`에만 bind하면 같은 container 안에서는 호출되지만 Pod 밖에서는 접근할 수 없다. 일반 server는 `0.0.0.0:<port>` 또는 Pod IP에 bind해야 한다.

```bash
kubectl debug -it <pod> --image=nicolaka/netshoot --target=app
ss -ltnp
```

Service의 `targetPort`와 process listen port가 일치하는지도 대조한다. `containerPort` 필드는 주로 문서와 named port를 위한 metadata이며 그 자체가 socket을 열지는 않는다.

## 복구와 원인 조사를 분리한다

최근 deployment나 config 변경 직후 장애가 시작됐다면 먼저 known-good version으로 되돌려 사용자 영향을 줄인다. service가 살아난 뒤 evidence를 보존하고 원인을 조사한다.

```text
0. 최근 rollout/config change 확인 → 관련 있으면 rollback
1. Pod IP 직접 호출
2. EndpointSlice 확인
3. Service name으로 cluster 내부 호출
4. Ingress address/rule/controller 확인
5. 외부 DNS 확인
6. 외부에서 실제 호출
```

아래 계층이 정상임을 확인하고 한 단계씩 바깥으로 나가면 추측을 줄일 수 있다. 다만 보안 사고나 데이터 손상처럼 단순 rollback이 증거를 없애거나 위험을 키울 수 있는 상황은 incident procedure를 우선한다.

## 운영 전에 준비할 관측점

- rollout revision과 Git commit 연결
- Ready endpoint 수 metric
- Ingress/LB target health
- application bind address와 startup log
- 외부 DNS·TLS 만료·HTTP synthetic check
- Pod별 request/error/latency metric

이 관측점이 없으면 장애 중에 확인 도구부터 설치하게 된다. 호출 흐름의 각 경계마다 최소 하나의 확인 방법을 미리 둔다.

## 요청 한 건을 안쪽에서 바깥쪽으로 검증하기

외부에서 502가 보인다고 해서 바로 Ingress 설정을 고치지 않는다. 같은 요청을 Pod, Service, Ingress 순으로 재현하면 실패한 경계를 좁힐 수 있다.

```bash
# 1) Endpoint와 Pod가 실제로 준비됐는지
kubectl get endpointslice -n demo \
  -l kubernetes.io/service-name=shop-api -o wide
kubectl get pod -n demo -l app=shop-api -o wide

# 2) 클러스터 내부에서 Service DNS와 HTTP를 확인
kubectl run request-debug -n demo --rm -i --restart=Never \
  --image=nicolaka/netshoot -- curl -sv http://shop-api.demo.svc.cluster.local/health

# 3) 특정 Pod를 거쳐 application 자체를 확인
kubectl port-forward -n demo pod/<pod> 18080:8080
curl -sv http://127.0.0.1:18080/health

# 4) 마지막으로 Ingress의 주소·규칙·Events를 확인
kubectl get ingress -n demo -o wide
kubectl describe ingress shop -n demo
curl -vk --resolve api.example.com:443:<load-balancer-ip> \
  https://api.example.com/health
```

내부 테스트가 Pod IP와 Service 모두에서 성공하지만 외부 호출만 실패하면 DNS, Load Balancer target health, TLS 또는 Ingress rule을 본다. 반대로 Pod 직접 호출부터 실패하면 외부 계층을 수정해도 해결되지 않는다. 이 순서는 packet hop을 정확히 재현하는 절차가 아니라, 각 Kubernetes 객체와 실제 proxy 경계를 빠르게 분리하는 진단 절차다.

## 정리

- 외부 요청을 DNS, LB, Ingress, Service, Pod, process 경계로 나눈다.
- Ingress → Service → Pod는 논리적 흐름이고 cloud target mode에 따라 packet hop은 달라질 수 있다.
- Service 주소 변환은 process log가 아니라 EndpointSlice와 object 상태로 확인한다.
- Pod까지 도달했다면 targetPort와 `0.0.0.0` bind 여부를 본다.
- 최근 변경이 원인이면 서비스 복구를 먼저 하고 조사는 안정화 뒤 진행한다.

---

이전 글: [9장 — Service와 클러스터 네트워킹](/posts/skala-kubernetes-ch09-service-networking/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [11장 — Ingress와 외부 노출](/posts/skala-kubernetes-ch11-ingress/)
