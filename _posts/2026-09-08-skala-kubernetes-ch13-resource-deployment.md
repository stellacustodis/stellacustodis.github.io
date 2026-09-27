---
title: "[SKALA] 쿠버네티스 13장 — 리소스 설계와 운영 배포 점검"
date: 2026-09-08 14:00:00 +0900
permalink: /posts/skala-kubernetes-ch13-resource-deployment/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, resources, qos, spring-boot, operations]
description: "CPU·memory requests와 limits, QoS, Spring Boot probe·graceful shutdown을 하나의 Deployment에 연결하고 배포 전 및 장애 대응 점검표를 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch12-config-storage]
---

## requests와 limits는 사용하는 주체가 다르다

`requests`는 scheduler가 Pod를 어느 node에 놓을지 판단할 때 사용하는 예약 기준이고, `limits`는 실행 중 cgroup이 강제하는 상한이다. scheduler는 limits만 보고 자리를 예약하지 않는다.

| 자원 | limit 초과 시 |
|---|---|
| CPU | throttling되어 느려짐 |
| memory | OOM kill 대상이 되어 container 종료 |

```yaml
resources:
  requests:
    cpu: 200m
    memory: 512Mi
  limits:
    cpu: "1"
    memory: 1Gi
```

CPU `1000m`은 vCPU 하나에 해당하고, memory는 `Mi`, `Gi`처럼 binary unit을 명시한다. node 전체 memory와 Pod에 실제 할당 가능한 `Allocatable`은 system reservation 때문에 다르다.

강의자료의 percentile 배수는 초기 추정 기준일 뿐 보편적인 정답은 아니다. production 값은 representative load에서 측정한 usage, latency SLO, JVM off-heap과 peak, node overcommit 정책을 함께 보고 정한다.

## QoS는 직접 고르는 값이 아니다

Kubernetes는 각 container의 requests와 limits 설정 결과로 Pod QoS class를 계산한다.

- Guaranteed: 모든 container의 CPU·memory request와 limit가 지정되고 각 resource에서 서로 같음
- Burstable: 일부 request/limit가 있지만 Guaranteed 조건은 아님
- BestEffort: CPU·memory request와 limit가 모두 없음

node resource pressure에서는 BestEffort가 먼저 위험해지고, Burstable은 request 초과 사용량 등을 고려한다. 하지만 QoS만으로 중요한 workload의 가용성이 자동 보장되는 것은 아니다. priority, PDB, replica 분산과 application recovery도 필요하다.

## Kubernetes에 올리기 좋은 애플리케이션

교체 가능한 Pod를 전제로 application을 설계한다.

- config를 environment에서 읽는다.
- log를 stdout/stderr로 보낸다.
- session·upload·중요 state를 process 밖에 둔다.
- 짧은 startup과 idempotent initialization을 지향한다.
- liveness/readiness endpoint를 분리한다.
- SIGTERM에서 새 요청을 막고 진행 중 요청을 마친다.
- container의 주 process가 신호를 직접 받도록 exec ENTRYPOINT를 쓴다.

## Spring Boot management port와 probe

management endpoint를 application traffic port와 분리하면 Ingress/Service에서 내부 actuator 정보를 노출하지 않으면서 kubelet probe에 사용할 수 있다.

```yaml
management:
  endpoint:
    health:
      probes:
        enabled: true
      show-details: never
  server:
    port: 8081
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 25s
```

일반 `/actuator/health`가 DB를 포함할 수 있으므로 liveness에는 전용 liveness group을 사용한다. readiness에는 현재 traffic을 받을 수 있는지 판단하는 dependency를 신중하게 포함한다.

## 종료 시간의 포함 관계

```text
preStop 대기 5s
  + Spring graceful shutdown 최대 25s
  < terminationGracePeriodSeconds 40s
```

Kubernetes의 grace period는 preStop과 application shutdown 전체를 포함한다. 바깥 시간이 더 짧으면 정리 중 SIGKILL이 와서 graceful 설정이 무효가 된다. 실제 장기 요청 시간과 load balancer connection draining도 함께 측정한다.

## 운영 Deployment에 연결하기

```yaml
spec:
  replicas: 3
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  template:
    spec:
      terminationGracePeriodSeconds: 40
      containers:
        - name: app
          image: registry.example/shop-api:1.0.0-a3f9c21
          ports:
            - { name: http, containerPort: 8080 }
            - { name: mgmt, containerPort: 8081 }
          envFrom:
            - configMapRef: { name: shop-config }
            - secretRef: { name: shop-secret }
          resources:
            requests: { cpu: 300m, memory: 768Mi }
            limits: { cpu: "1", memory: 1Gi }
          lifecycle:
            preStop:
              exec: { command: ["sh", "-c", "sleep 5"] }
```

여기에 startup, liveness, readiness probe와 security context를 더한다. `readOnlyRootFilesystem: true`를 켠 image가 `/tmp`에 써야 한다면 writable `emptyDir`를 필요한 경로에만 mount한다.

## 배포 전 점검표

- image가 `latest`가 아닌 불변 version/commit으로 추적되는가
- non-root이고 privilege escalation을 막았는가
- requests와 limits가 측정 근거를 가지는가
- startup·liveness·readiness의 질문이 분리됐는가
- liveness가 DB 장애를 application 재시작으로 확대하지 않는가
- replica와 rollout strategy가 처리 용량을 유지하는가
- preStop, application shutdown, grace period 시간이 맞는가
- config와 secret이 image/Git 밖에 있는가
- management endpoint가 외부 Service에 노출되지 않는가
- Pod가 node/AZ 장애 도메인에 분산되고 PDB가 계획돼 있는가
- log·metric·alert가 Pod가 사라져도 남는가

## 장애 대응 순서

1. 영향 범위를 확인한다: 전체/일부, 어떤 namespace와 version인가.
2. 최근 deployment·config·infrastructure 변경을 확인한다.
3. 안전한 known-good rollback으로 사용자 영향을 줄인다.
4. 필요하면 scale out 또는 traffic 차단으로 blast radius를 제한한다.
5. 안정화 뒤 Events, logs, metrics와 변경 diff로 원인을 조사한다.
6. timeline, 판단, 복구 조치와 재발 방지를 postmortem에 남긴다.

상태 이름을 진단 route로 사용한다. Pending은 scheduler, ImagePullBackOff는 registry, CrashLoopBackOff는 직전 application log, OOMKilled는 memory limit와 JVM 영역, Running 0/1은 readiness를 먼저 본다. network는 endpoint → Service → DNS → Ingress → 외부 순으로 확인한다.

## 리소스·오토스케일·중단 예산을 함께 확인하기

`requests`와 `limits`를 선언했다고 scheduler가 항상 균등하게 배치하거나 장애 중 replica를 보장해 주는 것은 아니다. 실제 예약량, 사용량, priority와 voluntary disruption을 한 화면에서 확인한다.

```bash
kubectl top pod -n demo --containers --sort-by=memory
kubectl describe node <node> | sed -n '/Allocated resources:/,/Events:/p'
kubectl get pod -n demo -l app=shop-api \
  -o custom-columns='NAME:.metadata.name,QOS:.status.qosClass,CPU_REQ:.spec.containers[0].resources.requests.cpu,MEM_REQ:.spec.containers[0].resources.requests.memory'
kubectl get resourcequota,limitrange -n demo
kubectl get events -n demo --field-selector=reason=OOMKilling \
  --sort-by=.lastTimestamp

kubectl autoscale deployment shop-api -n demo \
  --cpu-percent=70 --min=3 --max=10
kubectl get hpa shop-api -n demo
kubectl describe hpa shop-api -n demo
```

`kubectl autoscale`은 실습용으로 HPA를 빠르게 만들 수 있지만, 운영에서는 `autoscaling/v2` 매니페스트에 metric·behavior·scale 정책을 명시한다. HPA가 replica 수를 소유한다면 Deployment 매니페스트가 고정 `spec.replicas`를 계속 덮어쓰지 않도록 책임을 분리한다. 위 `--cpu-percent` 예시처럼 CPU 사용률을 기준으로 하는 HPA는 resource metrics 제공 경로(보통 Metrics Server)와 컨테이너의 CPU request가 있어야 목표 사용률을 계산할 수 있다. custom·external metric을 기준으로 삼는 HPA에는 해당 metric API를 제공하는 adapter가 필요하다.

노드 drain이나 cluster upgrade처럼 자발적 중단에는 PDB를 별도로 선언한다.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: shop-api
  namespace: demo
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: shop-api
```

PDB는 node 장애나 OOM kill을 막는 방패가 아니며, controller가 지켜야 할 voluntary disruption의 하한이다. replica를 여러 AZ에 배치하는 topology spread, 적절한 PriorityClass와 함께 사용해야 “복제본 세 개”가 실제 장애 여유로 이어진다.

## 과정 전체를 한 문장으로

Kubernetes 운영은 컨테이너를 많이 실행하는 기술이라기보다 **desired state, 교체 가능한 workload, 안정적인 service identity, 외부화한 state와 계층별 관측을 하나의 선언으로 묶는 일**이다.

---

이전 글: [12장 — ConfigMap, Secret과 스토리지](/posts/skala-kubernetes-ch12-config-storage/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)
