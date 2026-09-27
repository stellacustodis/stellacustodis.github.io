---
title: "[SKALA] 쿠버네티스 1장 — 선언형 운영과 핵심 리소스의 전체 그림"
date: 2026-09-07 09:00:00 +0900
permalink: /posts/skala-kubernetes-ch01-why-kubernetes/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, declarative, statefulset, eks, idempotency]
description: "쿠버네티스가 컨테이너 운영의 어떤 문제를 해결하는지 살펴보고, 선언형 API와 조정 루프, 개발자가 알아야 할 핵심 리소스 및 EKS 고가용성을 연결한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch02-container-image]
---

## 컨테이너 다음에 남는 운영 문제

컨테이너는 애플리케이션과 실행 의존성을 묶어 어디서나 같은 방식으로 시작하게 한다. 하지만 컨테이너 하나를 실행하는 것과 서비스를 운영하는 것은 다르다. 프로세스가 죽으면 다시 띄우고, 노드가 사라지면 다른 노드에 옮기고, 여러 복제본에 트래픽을 분배하고, 새 버전을 순서대로 교체해야 한다.

쿠버네티스는 이 판단을 사람이 반복 실행하는 명령에서 **클러스터가 계속 유지하는 상태**로 바꾼다. 사용자는 “Pod 세 개를 만들어라”가 아니라 “Pod가 세 개여야 한다”는 `spec`을 제출한다. 컨트롤러는 실제 상태인 `status`와 비교하고 차이가 없어질 때까지 반복한다. 이 반복이 조정 루프(reconciliation loop)다.

```text
desired state(spec): replicas = 3
             ↓ 비교
current state(status): readyReplicas = 2
             ↓ 조정
ReplicaSet이 Pod 1개 생성
             ↓
status가 spec에 수렴
```

Pod를 지웠는데 되살아나는 이유는 Pod가 불멸이어서가 아니다. Deployment가 원하는 개수를 세 개로 선언했고, ReplicaSet 컨트롤러가 현재 두 개뿐이라는 차이를 발견해 **새 Pod를 만든 것**이다.

## 명령형과 선언형

수업에서 가장 강조된 기준은 “긴급 상황이 아니면 선언형으로 운영한다”였다.

| 구분 | 명령형 | 선언형 |
|---|---|---|
| 질문 | 지금 어떤 동작을 시킬까 | 최종 상태가 무엇이어야 할까 |
| 예 | `kubectl scale`, `kubectl edit` | 파일 수정 후 `kubectl apply -f` |
| 반복 실행 | 이미 존재하거나 순서가 달라 실패할 수 있음 | 같은 상태를 반복 적용하면 같은 결과로 수렴 |
| 이력 | 별도로 기록하지 않으면 사라짐 | YAML과 Git diff가 변경 기록 |
| 복원 | 명령의 순서와 당시 조건을 재현해야 함 | 새 클러스터에도 같은 매니페스트 적용 가능 |

여기서 멱등성(idempotency)은 “명령을 두 번 실행해도 아무 일도 안 생긴다”는 뜻이 아니다. 같은 선언을 다시 적용했을 때 **목표 상태가 달라지지 않는다**는 뜻이다. 중간에 Pod가 하나 사라졌다면 두 번째 `apply`나 조정 루프가 필요한 변경을 수행할 수 있지만 최종 결과는 여전히 동일하다.

긴급하게 `kubectl scale deploy/shop-api --replicas=10`으로 용량을 늘렸다면 사고 대응으로는 타당할 수 있다. 그러나 Git의 YAML이 `replicas: 3`인 채로 남으면 다음 배포에서 다시 세 개가 된다. 따라서 긴급 변경도 안정화 후 매니페스트에 반영해야 한다.

> 선언형 운영의 가치는 YAML 자체가 아니라 재현성, 리뷰 가능한 변경 이력, 자동 복구가 함께 생기는 데 있다.
{: .prompt-tip }

## 개발자가 알아야 할 핵심 리소스 여덟 개

| 리소스 | 책임 | 기억할 경계 |
|---|---|---|
| Pod | 함께 배치할 컨테이너의 실행 단위 | 일반 서비스에서 직접 만들지 않는다 |
| Deployment | Pod 템플릿·복제 수·배포 전략 | 상태 없는 서버 앱의 기본 진입점 |
| Service | 변하지 않는 이름과 가상 주소, Pod 선택 | Ready Pod 목록으로 연결된다 |
| Ingress | HTTP(S)의 호스트·경로 라우팅 규칙 | Controller가 없으면 규칙만 있고 동작하지 않는다 |
| ConfigMap | 일반 설정을 이미지 밖으로 분리 | 환경변수 주입은 Pod 재시작 전까지 안 바뀐다 |
| Secret | 비밀값 전용 API 객체 | base64는 암호화가 아니다 |
| PVC | 필요한 저장 용량과 접근 모드의 요청 | 실제 볼륨은 PV, 생성 방식은 StorageClass |
| StatefulSet | 순서·이름·스토리지가 안정적인 Pod 집합 | DB·분산 시스템처럼 개별 복제본의 정체성이 필요할 때 |

앞의 네 개는 애플리케이션을 실행하고 연결하는 뼈대이고, 뒤의 네 개는 환경과 데이터, 상태 있는 워크로드를 다루는 장치다.

### 왜 Pod YAML을 직접 만들지 않는가

Pod 자체도 YAML로 만들 수 있지만 운영용 서버 애플리케이션에는 적합하지 않다. 네이키드 Pod는 노드 장애로 사라졌을 때 새로 만들 관리자가 없고, 복제·롤링 업데이트·롤백도 제공하지 않는다.

```text
직접 만든 Pod
  └─ 실패하면 종료: 원하는 개수를 지켜볼 상위 컨트롤러가 없음

Deployment
  └─ ReplicaSet
       └─ Pod × N: 실패·노드 교체 시 새 Pod로 목표 개수를 복구
```

예외는 짧은 디버깅용 Pod나 컨트롤러 동작을 배우는 실습 정도다. 실제 서비스는 Deployment를 선언하고 Pod는 그 결과로 다룬다.

## StatefulSet의 “IP 대신 이름을 쓴다”는 뜻

Pod IP는 재생성될 때 바뀔 수 있다. Deployment의 Pod는 이름도 바뀌므로 복제본 하나하나를 지속적으로 식별하지 않는다. 반면 StatefulSet은 `db-0`, `db-1`, `db-2`처럼 ordinal이 붙은 이름을 유지하고, `volumeClaimTemplates`를 사용하면 ordinal마다 연결된 PVC도 유지한다.

Headless Service를 함께 사용하면 다음과 같은 안정적인 DNS 이름을 얻는다.

```text
db-0.db-headless.default.svc.cluster.local
db-1.db-headless.default.svc.cluster.local
db-2.db-headless.default.svc.cluster.local
```

여기서 고정되는 것은 **IP가 아니라 네트워크 정체성(hostname/DNS)** 이다. `db-0` Pod가 다른 노드에 재생성되어 IP가 달라져도 같은 DNS 이름이 새 IP를 가리킨다. 리더·팔로워, shard 번호, 복제 순서처럼 “몇 번째 인스턴스인가”가 중요한 DB와 메시지 큐에서 이 특성이 필요하다.

순서가 고정된다는 말은 기본 정책에서 생성·확장 시 낮은 ordinal부터 Ready가 된 뒤 다음 Pod를 만들고, 축소 시 높은 ordinal부터 제거한다는 뜻이다. 모든 DB를 StatefulSet에 올리라는 의미는 아니며, 운영 부담 때문에 관리형 DB를 선택하는 경우도 많다.

## 핵심 리소스를 요청 흐름으로 연결하기

```text
사용자
  ↓ DNS
Load Balancer
  ↓
Ingress Controller ── Ingress 규칙(host/path)
  ↓ backend 참조
Service ── selector ── Ready EndpointSlice
  ↓
Pod ── Container ── Process
  ├─ ConfigMap / Secret
  └─ PVC ── PV ── StorageClass
```

수업 메모의 `Ingress → Service → Pod`는 이 논리적 흐름을 압축한 표현이다. Ingress가 Service 이름과 포트를 backend로 참조하고, Service는 라벨 셀렉터와 readiness 결과로 만든 EndpointSlice에 기록된 Pod를 찾는다. 따라서 Ingress가 정상이어도 Service selector가 틀리거나 Pod가 Ready가 아니면 요청은 목적지에 도달하지 못한다.

## EKS와 “3중화”, 그리고 SPOF

SPOF(single point of failure)는 한 구성 요소의 고장만으로 전체 기능이 멈추는 지점이다. 자체 구축 클러스터에서 API 서버나 etcd를 한 대에만 두면 그 서버가 바로 SPOF다. 특히 etcd는 클러스터 상태의 유일한 저장소이므로 보통 홀수 개 멤버로 quorum을 구성하고 장애 하나를 견딜 수 있게 한다.

EKS에서는 control plane을 AWS가 관리하고, 최소 두 개의 API 서버 노드를 서로 다른 Availability Zone에 운영하며 비정상 노드를 교체한다. 강의에서 말한 “요즘은 3중화”는 보통 다음 두 층을 구분해 이해해야 한다.

- control plane/etcd: 서비스 제공자가 여러 AZ와 복제본으로 관리한다. EKS 사용자가 정확히 세 대를 직접 만드는 구조가 아니다.
- data plane/workload: 워커 노드와 Pod 복제본을 여러 노드와 AZ에 분산해야 한다. `replicas: 3`만 적고 세 Pod가 한 AZ에 몰리면 AZ 장애는 견디지 못한다.

**복제본 수와 장애 도메인 분산이 함께 있어야 고가용성**이다. 한 노드에 Pod 세 개를 올리면 프로세스 장애에는 강해질 수 있어도 노드 장애에는 약하다. 한 AZ의 노드 여러 대에 분산해도 AZ 전체 장애는 막지 못한다. 실습 환경이 단일 AZ라면 교육 비용과 단순화를 위한 구성이며, 그대로 운영 HA 설계라고 보면 안 된다.

## 강의 실습 환경을 일반적인 EKS와 구분하기

강의 자료의 실습 클러스터는 개념을 빠르게 연결하기 위한 공유 환경이다. `skala-2026` EKS 클러스터를 서울 리전에 두고, 반별 namespace(`class-6`~`class-10`)를 공유한다. 공용 `ingress-nginx` Load Balancer 하나를 사용하고, Harbor registry와 `ebs-sc`·`efs-sc` StorageClass를 클러스터 외부 의존성으로 참조한다. 워커 노드는 단일 AZ에 배치된 교육용 규모이므로, 이 설정을 다중 AZ 운영 아키텍처로 일반화하면 안 된다.

```bash
aws eks update-kubeconfig --region ap-northeast-2 --name skala-2026
kubectl config set-context --current --namespace=class-7
kubectl get nodes -o wide
kubectl get ingressclass
kubectl get storageclass
kubectl get pods -n ingress-nginx -o wide
```

같은 namespace를 여러 학습자가 쓰는 환경에서는 `shop-api`처럼 일반적인 이름을 그대로 사용하지 않고 `shop-api-P000`처럼 식별자를 붙인다. namespace는 이름 충돌과 RBAC·quota 범위를 나눌 뿐 네트워크 격리를 자동으로 제공하지 않으며, 공용 Ingress와 Load Balancer는 다른 학습자의 rule과 비용에 영향을 줄 수 있다.

## 선언형 변경을 실제로 검증하는 순서

작은 실습에서도 `apply`를 무작정 실행하기보다 **문맥 확인 → 서버 검증 → 변경 비교 → 적용 → 수렴 확인** 순서를 반복하면 운영 습관을 만들 수 있다. 첫 번째 namespace 생성은 실습 환경을 만들기 위한 부트스트랩이고, 애플리케이션 리소스는 매니페스트 파일을 정본으로 둔다.

```bash
kubectl config current-context
kubectl create namespace demo --dry-run=client -o yaml | kubectl apply -f -
kubectl create deployment shop-api \
  --image=registry.example/shop-api:1.2.3 \
  --replicas=3 --namespace=demo \
  --dry-run=client -o yaml > deployment.yaml

kubectl diff --server-side --field-manager=platform -f deployment.yaml
kubectl apply --server-side --field-manager=platform -f deployment.yaml
kubectl wait --for=condition=available deployment/shop-api \
  --namespace=demo --timeout=120s
kubectl get deployment,replicaset,pod -n demo -o wide
kubectl get deployment shop-api -n demo \
  -o jsonpath='{.metadata.generation}{" / "}{.status.observedGeneration}{"\n"}'
```

`generation`은 사용자가 바꾼 `spec`의 세대이고 `observedGeneration`은 controller가 그 세대를 처리했다는 표시다. 두 값이 같아도 애플리케이션이 정상이라는 뜻은 아니므로 `availableReplicas`, probe와 실제 요청을 이어서 확인해야 한다. 반대로 `apply`가 성공했는데 `observedGeneration`이 뒤처져 있다면 API 저장은 끝났지만 조정이 아직 완료되지 않은 상태다.

## 정리

- 운영 변경은 목표 상태를 파일과 Git에 남기고 `apply`한다.
- Pod는 실행 단위지만 일반 서비스의 관리 단위는 Deployment다.
- 요청의 논리적 흐름은 Ingress → Service → Ready Pod다.
- StatefulSet은 바뀌지 않는 IP가 아니라 ordinal 기반 이름·DNS·스토리지 정체성을 제공한다.
- 고가용성은 “세 개”라는 숫자보다 노드와 AZ 같은 독립 장애 도메인에 분산했는지가 중요하다.

추가 확인: [Kubernetes 선언형 객체 관리](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/declarative-config/), [Kubernetes StatefulSet](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/), [EKS control plane](https://docs.aws.amazon.com/eks/latest/best-practices/control-plane.html)

---

이전 글: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [2장 — 컨테이너와 이미지](/posts/skala-kubernetes-ch02-container-image/)
