---
title: "[SKALA] 쿠버네티스 6장 — kubectl 운영·디버깅 도구"
date: 2026-09-07 14:00:00 +0900
permalink: /posts/skala-kubernetes-ch06-kubectl-operations/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, kubectl, debugging, jsonpath, k9s]
description: "port-forward, exec, debug, top과 API 탐색을 이용해 운영 중인 Kubernetes 리소스를 안전하게 관찰하고 문제를 좁히는 방법을 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch05-environment-kubectl, skala-kubernetes-ch07-pod]
---

## 클러스터 안쪽으로 안전하게 들어가기

`port-forward`는 외부 노출 없이 로컬 포트와 Pod 또는 Service를 임시로 연결한다. terminal을 닫으면 연결도 끝나므로 운영 ingress를 대신하는 기능이 아니라 디버깅 도구다.

```bash
kubectl port-forward svc/shop-api 8080:80
kubectl port-forward pod/<pod> 8080:8080
kubectl port-forward deploy/shop-api 8081:8081
```

Service로 연결하면 backend Pod 중 하나를 선택하고, 특정 Pod로 연결하면 Service와 load balancing을 건너뛴다. “Service로는 안 되지만 Pod로는 된다”면 애플리케이션보다 Service selector·port·EndpointSlice 영역을 의심할 수 있다.

## exec보다 먼저 describe와 logs

컨테이너 안으로 들어가면 많은 것을 볼 수 있지만, 수동 수정으로 증상을 가리기 쉽다. 먼저 현재 상태와 Events, 로그를 보고 마지막에 `exec`를 사용한다.

```bash
kubectl exec <pod> -- env | sort
kubectl exec -it <pod> -- sh
kubectl exec -it <pod> -c <container> -- sh
```

distroless 이미지에는 shell이나 `curl`이 없다. 이것은 결함이 아니라 공격면을 줄인 결과다. 원본 이미지에 도구를 추가하지 않고 ephemeral debug container를 붙인다.

```bash
kubectl debug -it <pod> --image=nicolaka/netshoot --target=app
```

`exec`로 고친 파일과 설정은 컨테이너 재시작 시 사라진다. 원인을 확인하는 용도로만 사용하고 영구 수정은 이미지 또는 매니페스트에 반영한다.

## 사용량은 순간값과 추세를 구분한다

```bash
kubectl top nodes
kubectl top pods --sort-by=memory
kubectl top pod <pod> --containers
```

`top`은 metrics-server가 제공하는 현재에 가까운 값이다. requests와 limits를 정하려면 하루의 순간값이 아니라 며칠 이상의 시계열과 peak를 봐야 한다. `top`은 이상 Pod를 찾는 시작점이지 capacity planning의 전부가 아니다.

## label과 annotation

label은 selector로 객체를 찾고 묶기 위한 작은 식별 정보다. annotation은 selector로 객체를 고르는 데 쓰지 않는 도구 설정이나 변경 이유 등의 메타데이터를 저장한다. 공개해도 되는 정보만 넣어야 한다.

```bash
kubectl label pod my-pod owner=P000
kubectl get pod -l owner=P000

kubectl annotate deployment shop-api \
  kubernetes.io/change-cause='1.1.0 deployment' --overwrite
```

Service와 Deployment는 label selector로 동작하고, Ingress Controller별 옵션은 annotation을 많이 사용한다. 구분 기준은 “이 값으로 대상을 고르는가”다.

## 수정 명령의 우선순위

| 방법 | 장점 | 위험 |
|---|---|---|
| `apply` | 파일과 실제 상태를 맞추고 이력을 남김 | 기본 선택 |
| `edit` | 즉시 수정 | Git과 drift 발생 |
| `patch` | 일부 필드를 자동화하기 쉬움 | 선언 파일과 어긋날 수 있음 |
| `set image` | 배포가 빠름 | 다음 apply에서 되돌아갈 수 있음 |
| `replace --force` | 불변 필드도 재생성 | 삭제 후 생성이라 중단 가능 |

삭제 명령의 `--all`, `--force`, `--grace-period=0`은 영향 범위가 크다. 같은 selector로 먼저 `get`을 실행해 실제 대상을 확인한다. 공유 namespace에서는 `--all`을 사용하지 않는다.

## API를 직접 읽는 법

`kubectl`은 Kubernetes REST API client다. `--v=8`로 실제 요청을 확인하고 `get --raw`로 discovery endpoint를 탐색할 수 있다.

```bash
kubectl get pods --v=8
kubectl get --raw /api
kubectl get --raw /apis
kubectl api-resources
kubectl api-versions
kubectl explain deployment.spec.strategy
```

인터넷 예시와 현재 cluster version이 다를 수 있다. `api-resources`, `api-versions`, `explain`은 지금 연결된 server가 지원하는 resource와 schema를 보여 준다는 점에서 가장 직접적인 기준이다.

## 관찰 도구 k9s

k9s는 여러 `get -w`, `describe`, `logs` 화면을 terminal UI로 묶는다. 관찰에는 편하지만 삭제 shortcut도 있으므로 공유 namespace에서는 현재 context와 대상을 계속 확인한다. 편의 도구가 RBAC이나 Kubernetes API를 우회하는 것은 아니다.

## 반복 가능한 관찰·대기·정리 명령

운영 스크립트에서는 사람이 화면을 보는 `watch`보다 종료 조건이 있는 `wait`와 구조화된 출력을 사용한다. 그래야 CI가 성공·실패를 판단할 수 있고, 복사한 출력도 다시 분석할 수 있다.

```bash
kubectl get pods -n demo -l app=shop-api \
  --field-selector=status.phase=Running -o wide
kubectl wait --for=condition=ready pod \
  -l app=shop-api -n demo --timeout=120s
kubectl get pods -n demo -l app=shop-api \
  -o custom-columns='NAME:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount'
kubectl get events -n demo --field-selector=type=Warning \
  --sort-by=.lastTimestamp

# 긴급 삭제가 아니라면 대상을 먼저 확인하고 grace period를 명시한다.
kubectl get pod <pod> -n demo -o yaml > /tmp/pod-before-delete.yaml
kubectl delete pod <pod> -n demo --grace-period=30 --wait=true
```

`-o jsonpath`와 `custom-columns`는 API 객체의 현재 상태를 읽는 도구이지 새로운 source of truth가 아니다. 출력값을 보고 수동으로 `edit`했다면 변경을 매니페스트에 반영한다. `patch`, `set image`, `scale`은 사고 대응이나 빠른 실험에는 유용하지만, 지속적인 운영 변경으로 남기지 않으면 다음 선언형 배포에서 되돌아갈 수 있다.

## 정리

- Service와 Pod 각각에 port-forward해 장애 계층을 분리한다.
- 원본 컨테이너는 `exec`로 고치지 않고 필요하면 debug container를 붙인다.
- 순간 사용량과 장기 capacity 추세를 구분한다.
- label은 선택, annotation은 설정·기록이다.
- 수정은 apply, 삭제는 같은 조건으로 get한 뒤 실행한다.
- 모르는 API와 field는 cluster의 discovery와 `explain`에 묻는다.

---

이전 글: [5장 — EKS 접속과 kubectl 기본 진단](/posts/skala-kubernetes-ch05-environment-kubectl/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [7장 — Pod 생명주기와 프로브](/posts/skala-kubernetes-ch07-pod/)
