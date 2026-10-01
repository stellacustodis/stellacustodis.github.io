---
title: "[SKALA] 쿠버네티스 4장 — API 요청부터 컨테이너 실행까지"
date: 2026-09-07 12:00:00 +0900
permalink: /posts/skala-kubernetes-ch04-cluster-internals/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, apiserver, scheduler, kubelet, troubleshooting]
description: "API server의 요청 처리 관문, controller와 scheduler의 조정, kubelet·CRI·kube-proxy의 역할을 장애 증상과 연결해 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch03-architecture, skala-kubernetes-ch05-environment-kubectl]
---

## API 요청이 저장되기까지

`kubectl apply`는 곧바로 컨테이너를 실행하는 명령이 아니다. 먼저 API server의 여러 관문을 통과해 유효한 desired state로 저장된다.

| 순서 | 관문 | 실패 신호 |
|---:|---|---|
| 1 | HTTP 요청 디코딩 | 400 Bad Request |
| 2 | 인증(authentication) | Unauthorized |
| 3 | 인가(authorization, RBAC) | Forbidden |
| 4 | Mutating admission | webhook 오류 또는 기본값 주입 |
| 5 | Schema validation | unknown field, cannot unmarshal |
| 6 | Validating admission | quota·보안 정책 이름과 함께 거부 |
| 7 | etcd 저장 | 객체 생성 성공 |

`Unauthorized`는 “누구인지 증명하지 못함”, `Forbidden`은 “누구인지는 알지만 이 작업 권한이 없음”이다. RBAC을 통과한 요청도 admission policy에서 거부될 수 있으므로 오류 메시지가 가리키는 관문을 구분한다.

## 컨트롤러는 각자의 리소스를 감시한다

controller manager 안에는 Deployment, ReplicaSet, Node, EndpointSlice, Namespace 등 여러 controller가 있다. 구현 대상은 다르지만 패턴은 동일하다.

```text
watch API state
  ↓
현재 상태와 원하는 상태 비교
  ↓
차이가 있으면 생성·삭제·갱신
  ↓
다시 watch
```

readiness가 실패한 Pod가 Service 대상에서 빠지는 것도 이 구조의 결과다. EndpointSlice controller가 Ready 조건 변화를 보고 endpoint 목록을 갱신한다.

## Scheduler의 filter와 score

scheduler는 먼저 실행 불가능한 노드를 제거(filter)하고, 남은 노드에 점수(score)를 매긴다.

- hard constraint: requests를 수용할 공간, nodeSelector, taint/toleration, 볼륨 AZ, Pod 수 상한
- soft preference: affinity 선호, topology spread, 자원 분산

모든 노드가 filter에서 탈락하면 Pod는 Pending이다. 이때 애플리케이션 로그는 아직 존재하지 않는다.

```bash
kubectl describe pod <pod>
# Events의 "0/N nodes are available" 뒤 이유를 확인
```

## Kubelet, runtime, CNI와 CSI

scheduler가 `nodeName`을 정하면 해당 노드의 kubelet이 Pod를 실제 상태로 만든다. kubelet은 이미지를 직접 실행하지 않고 CRI로 container runtime에 요청한다. 네트워크 namespace와 Pod IP는 CNI, 영속 볼륨 연결은 CSI가 담당한다. kubelet은 세 probe도 직접 호출하고 결과를 API server에 보고한다.

Probe 실패는 Service나 Ingress가 probe 요청을 중계한 결과가 아니다. kubelet에서 Pod IP와 지정 포트로 직접 확인한다. 외부 트래픽은 정상인데 probe만 실패하거나 그 반대인 상황이 가능한 이유다.

## Service의 실체는 커널 규칙이다

전통적인 kube-proxy iptables 모드에서 Service ClusterIP를 listen하는 프로세스는 없다. kube-proxy가 각 노드에 목적지 변환 규칙을 설치하고 실제 패킷 처리는 커널이 한다.

```text
ClusterIP:80
  ├─ Pod-A-IP:8080
  ├─ Pod-B-IP:8080
  └─ Pod-C-IP:8080
```

kube-proxy 프로세스가 패킷을 사용자 공간에서 한 번씩 중계하는 구조가 아니다. 이 때문에 Service 문제를 확인할 때는 프로세스 로그보다 Service selector, EndpointSlice와 노드의 규칙을 본다.

## 컴포넌트 장애의 영향 범위

| 멈춘 구성 요소 | 계속되는 것 | 새로 안 되는 것 |
|---|---|---|
| API server | 기존 Pod와 기존 트래픽 | 조회·배포·상태 변경 |
| etcd | 잠시 기존 workload | control plane의 일관된 상태 관리 |
| scheduler | 이미 배치된 Pod | 새 Pod의 노드 배치 |
| controller manager | 기존 Pod | 자동 복구·스케일·롤아웃 |
| 한 노드의 kubelet | 다른 노드의 Pod | 해당 노드 상태 보고와 Pod 관리 |
| CoreDNS | IP 직접 통신 | Service·외부 도메인 이름 해석 |

장애 대응에서 control plane 경보와 사용자 트래픽 장애를 동일하게 취급하면 안 된다. 먼저 실제 요청이 끊겼는지 확인하고, 이어 어떤 제어 기능이 멈췄는지 범위를 좁힌다.

## 한 번의 변경을 API부터 Endpoint까지 추적하기

리소스 하나를 만들고 바로 Pod만 조회하면 어느 controller 단계에서 멈췄는지 놓치기 쉽다. 이름과 label을 기준으로 아래처럼 부모–자식 관계를 따라간다.

```bash
kubectl apply --server-side --field-manager=lab -f deployment.yaml
kubectl get deployment shop-api -n demo -o yaml
kubectl get replicaset -n demo -l app=shop-api -o wide
kubectl get pod -n demo -l app=shop-api -o wide
kubectl get pod -n demo -l app=shop-api \
  -o jsonpath='{range .items[*]}{.metadata.name}{" owner="}{.metadata.ownerReferences[0].kind}/{.metadata.ownerReferences[0].name}{"\n"}{end}'
kubectl get events -n demo --sort-by=.lastTimestamp
kubectl get endpointslice -n demo \
  -l kubernetes.io/service-name=shop-api -o wide
```

Deployment의 `generation`이 증가했더라도 replicas만 바꾼 경우에는 Pod template이 그대로인 것이 정상이다. 새 rollout은 `spec.template`이 변경될 때 시작된다. 먼저 어떤 spec 필드가 바뀌었는지 확인하고, controller의 관찰 여부는 `generation`과 `observedGeneration`을 비교한다. Pod가 있는데 Service 대상에서 빠졌다면 readiness, Service selector와 EndpointSlice를 함께 확인한다. 이처럼 `metadata`, `status`, `ownerReferences`, Events를 연결해 원인을 좁힌다.

## 정리

- API 오류 문구는 요청이 인증·인가·스키마·정책 중 어디서 막혔는지 알려 준다.
- Pending은 scheduler Events, ContainerCreating은 kubelet·CNI·CSI를 먼저 본다.
- kubelet은 자기 노드의 실행과 probe를 책임지고 runtime은 실제 컨테이너를 실행한다.
- Service는 EndpointSlice를 목적지로 삼는 커널 규칙으로 동작한다.
- control plane 일부 장애가 곧 기존 사용자 트래픽 중단을 뜻하지는 않는다.

---

이전 글: [3장 — 컨트롤 플레인, 워커 노드와 네트워크](/posts/skala-kubernetes-ch03-architecture/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [5장 — 실습 환경과 kubectl](/posts/skala-kubernetes-ch05-environment-kubectl/)
