---
title: "[SKALA] 쿠버네티스 7장 — Pod 생명주기와 프로브"
date: 2026-09-07 15:00:00 +0900
permalink: /posts/skala-kubernetes-ch07-pod/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, pod, probe, lifecycle, debugging]
description: "Pod가 공유하는 네트워크·볼륨·생명주기를 이해하고, startup·liveness·readiness probe 및 정상 종료와 디버깅 순서를 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch06-kubectl-operations, skala-kubernetes-ch08-deployment-rollout]
---

## Pod는 컨테이너와 다르다

Pod는 반드시 같은 노드에 배치되어 네트워크 namespace와 volume을 공유해야 하는 컨테이너들의 묶음이다. 대부분의 애플리케이션 Pod에는 주 컨테이너 하나만 있지만, sidecar처럼 생명주기를 함께해야 하는 보조 기능을 붙일 수 있다.

같은 Pod의 컨테이너는 Pod IP 하나와 port 공간을 공유하므로 `localhost`로 통신한다. 같은 port를 동시에 listen할 수 없고, 서로 다른 image의 filesystem은 volume으로 연결한 경로를 제외하면 분리된다.

## Running과 Ready는 다른 상태다

`Running`은 Pod가 노드에 배정되고 모든 컨테이너가 생성되었으며, 적어도 하나의 컨테이너가 실행 중이거나 시작·재시작 중인 phase다. 이 phase만으로 요청을 받을 준비가 됐다고 판단할 수는 없다. 일반 Service 트래픽 대상 여부는 endpoint의 ready 조건과 관련 설정을 함께 확인한다.

| 표시 | 의미 | 먼저 볼 것 |
|---|---|---|
| Pending | 노드 미배정 또는 준비 중 | `describe` Events |
| ContainerCreating | network·volume·config 준비 | CNI·CSI·ConfigMap·Secret Events |
| ImagePullBackOff | image pull 재시도 | image/tag/platform/registry auth |
| Running 0/1 | 실행됐지만 Ready 아님 | readiness probe |
| CrashLoopBackOff | 실행 후 반복 종료 | `logs --previous` |
| Evicted | 노드 자원 압박으로 축출 | node condition과 QoS |

BackOff는 포기했다는 뜻이 아니라 재시도 간격을 늘리는 상태다. 근본 원인을 고쳐도 다음 재시도까지 시간이 걸릴 수 있다.

## 세 probe의 질문

| Probe | 묻는 질문 | 실패 결과 |
|---|---|---|
| startup | 애플리케이션 기동이 끝났는가 | 아직 기동 못 했다고 보고 재시작 기준 적용 |
| liveness | 스스로 회복할 수 없는 정지 상태인가 | 컨테이너 재시작 |
| readiness | 지금 새 요청을 받아도 되는가 | 일반 Service 트래픽 대상에서 제외하며 EndpointSlice의 ready 조건으로 상태 표시 |

느린 JVM 애플리케이션은 startup probe로 기동 시간을 보호하고, 그 전에는 liveness/readiness 평가를 미룬다. liveness에 DB 연결 상태를 넣으면 DB의 일시 장애가 모든 application Pod의 동시 재시작으로 확대될 수 있다. liveness는 프로세스 자체의 생존, readiness는 요청 처리 가능성과 필요한 의존성을 본다.

```yaml
startupProbe:
  httpGet: { path: /actuator/health/liveness, port: 8081 }
  periodSeconds: 5
  failureThreshold: 30
livenessProbe:
  httpGet: { path: /actuator/health/liveness, port: 8081 }
  timeoutSeconds: 3
readinessProbe:
  httpGet: { path: /actuator/health/readiness, port: 8081 }
  timeoutSeconds: 3
```

## 초기화 컨테이너의 멱등성

init container는 선언된 순서대로 실행되고 각 단계가 성공해야 main container가 시작된다. dependency wait, config generation 같은 작업에 적합하다. 실패하면 다시 실행될 수 있으므로 여러 번 수행해도 같은 결과가 되도록 설계해야 한다.

DB migration을 각 application replica의 init container에서 무조건 수행하면 여러 Pod가 동시에 같은 migration을 실행할 수 있다. migration 도구가 concurrency와 idempotency를 보장하는지 확인하거나 별도의 Job·배포 단계로 분리한다.

## 종료는 즉시가 아니라 절차다

Pod 삭제가 시작되면 EndpointSlice의 `terminating=true`·`ready=false` 상태 전파와 컨테이너 종료 절차가 비동기적으로 진행된다. endpoint 주소가 즉시 삭제되는 것은 아니며, 종료 중 연결 정리가 필요하면 `serving` 조건도 함께 확인한다. 이미 전달된 요청과 늦게 갱신된 routing 정보 때문에 종료 직전 Pod로 새 요청이 들어갈 수 있다.

```text
deletionTimestamp
  ├─ EndpointSlice 종료·ready 상태 전파
  └─ preStop hook
       ↓
     SIGTERM
       ↓
     애플리케이션 graceful shutdown
       ↓ grace period 만료
     SIGKILL
```

짧은 `preStop` 대기는 routing 상태 변경이 load balancer와 kube-proxy에 전파될 시간을 준다. 주소가 즉시 제거됨을 전제로 하지는 않는다. `terminationGracePeriodSeconds`는 preStop 시간과 애플리케이션 종료 유예의 합보다 커야 한다.

## 멀티 컨테이너 패턴과 경계

sidecar, ambassador, adapter는 주 애플리케이션과 배치·네트워크·생명주기를 공유해야 할 때 사용한다. 독립적으로 배포하거나 scale해야 하는 API와 worker를 같은 Pod에 넣으면 한쪽만 교체하거나 확장할 수 없으므로 각각 Deployment로 분리한다.

## Pod를 직접 만들지 않는 이유

Pod manifest는 Deployment template을 이해하고 디버깅하는 데 필요하다. 그러나 직접 만든 Pod는 노드 장애 후 다시 생성할 controller가 없고 rolling update와 rollback도 없다. 일반적인 stateless application은 Deployment, 안정적인 ordinal identity가 필요한 workload는 StatefulSet, 노드마다 하나가 필요한 agent는 DaemonSet, 완료되는 작업은 Job을 사용한다.

## 디버깅 순서

```bash
kubectl get pod -o wide
kubectl describe pod <pod>
kubectl logs <pod> --tail=100
kubectl logs <pod> --previous
kubectl exec <pod> -- env | sort
kubectl debug -it <pod> --image=busybox:1.36 --target=app
```

상태 → Events → logs → 내부 확인 순서를 유지하면 아직 컨테이너도 없는 Pending Pod에 logs를 찾거나, readiness 문제를 application crash로 오인하는 일을 줄일 수 있다.

## probe와 종료를 한 Pod에서 관찰하기

probe는 “프로세스가 떠 있는가”, “트래픽을 받아도 되는가”, “아직 시작 중인가”를 서로 다른 질문으로 나눈다. 세 질문을 모두 같은 liveness endpoint에 연결하면 느린 기동이나 일시적인 DB 장애가 재시작 폭풍으로 확대될 수 있다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: probe-demo
  namespace: demo
spec:
  terminationGracePeriodSeconds: 20
  containers:
    - name: app
      image: busybox:1.36
      command: ["/bin/sh", "-c"]
      args: ["touch /tmp/started /tmp/ready /tmp/alive; trap 'exit 0' TERM INT; sleep 3600"]
      startupProbe:
        exec: { command: ["/bin/sh", "-c", "test -f /tmp/started"] }
        failureThreshold: 30
        periodSeconds: 2
      readinessProbe:
        exec: { command: ["/bin/sh", "-c", "test -f /tmp/ready"] }
        periodSeconds: 5
      livenessProbe:
        exec: { command: ["/bin/sh", "-c", "test -f /tmp/alive"] }
        failureThreshold: 3
        periodSeconds: 10
```

```bash
kubectl apply -f probe-demo.yaml
kubectl wait --for=condition=Ready pod/probe-demo -n demo --timeout=90s
kubectl get pod probe-demo -n demo -o wide
kubectl describe pod probe-demo -n demo
kubectl delete pod probe-demo -n demo
```

실제 HTTP 서비스에서는 `httpGet` probe의 `port`가 containerPort와 같을 필요는 없지만, Pod 안에서 listen하는 실제 포트여야 한다. `startupProbe`가 통과하기 전에는 liveness·readiness가 시작되지 않으므로 느린 초기화 시간을 보호할 수 있다. readiness 실패는 endpoint에서 제외하는 신호이고, liveness 실패는 컨테이너 재시작 신호라는 차이를 운영 설계에 반영한다.

---

이전 글: [6장 — kubectl 운영·디버깅 도구](/posts/skala-kubernetes-ch06-kubectl-operations/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [8장 — Deployment와 롤아웃](/posts/skala-kubernetes-ch08-deployment-rollout/)
