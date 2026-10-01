---
title: "[SKALA] 쿠버네티스 8장 — Deployment와 무중단 롤아웃"
date: 2026-09-08 09:00:00 +0900
permalink: /posts/skala-kubernetes-ch08-deployment-rollout/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, deployment, replicaset, rollout, rollback]
description: "Deployment·ReplicaSet·Pod의 관계를 바탕으로 rolling update, rollout 관찰과 rollback, 무중단 배포에 필요한 조건을 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch07-pod, skala-kubernetes-ch09-service-networking]
---

## Deployment가 Pod를 직접 관리하지 않는 이유

Deployment는 version과 rollout strategy를 관리하고, ReplicaSet은 특정 Pod template hash의 복제본 수를 유지한다. 새 image나 Pod template이 적용되면 새 ReplicaSet이 생기고 이전 ReplicaSet은 `replicas: 0`으로 남는다.

```text
배포 전: Deployment → RS-v1(3) → Pod v1 × 3
배포 중: Deployment → RS-v1(2) + RS-v2(1)
배포 후: Deployment → RS-v1(0) + RS-v2(3)
```

rollback은 삭제된 과거 Pod를 되살리는 것이 아니라 이전 Pod template을 가진 ReplicaSet을 다시 scale up하는 일이다. `revisionHistoryLimit`은 이 재료를 몇 개 보존할지 정한다.

## RollingUpdate의 두 숫자

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

- `maxSurge`: 목표 replica보다 임시로 더 만들 수 있는 Pod 수
- `maxUnavailable`: rollout 중 unavailable이어도 허용할 Pod 수

replicas가 3이고 위 설정이면 새 Pod 하나를 추가로 만들고 Ready가 된 뒤 기존 Pod 하나를 내리는 과정을 반복한다. readiness probe가 없으면 process가 시작되자마자 Ready로 간주될 수 있어 아직 초기화 중인 instance로 요청이 전달된다.

## apply 성공과 rollout 성공은 다르다

`kubectl apply`가 성공했다는 것은 새 desired state가 API server에 저장됐다는 뜻이다. 배포 완료는 비동기다.

```bash
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/shop-api --timeout=180s
kubectl rollout history deployment/shop-api
```

CI/CD pipeline은 `rollout status`의 종료 코드를 확인해야 한다. apply만 성공한 뒤 pipeline을 녹색으로 끝내면 ImagePullBackOff나 readiness 실패로 멈춘 rollout을 성공으로 기록하게 된다.

## 멈춘 배포는 기존 서비스를 보존할 수 있다

`maxUnavailable: 0`에서 새 Pod가 Ready가 되지 않으면 기존 Pod를 내리지 않고 rollout이 멈춘다. 이때 새 Pod의 상태를 기준으로 원인을 나눈다.

- Pending: resources, taint, affinity, volume AZ
- ImagePullBackOff: image tag, registry auth, architecture
- CrashLoopBackOff: application startup log와 config
- Running 0/1: readiness path, port, timeout

새 배포가 멈췄다고 곧바로 기존 서비스가 중단된 것은 아니다. 기존 version의 endpoint 수를 확인하고, 원인을 고치거나 rollback한다.

## rollback의 범위

```bash
kubectl rollout undo deployment/shop-api
kubectl rollout undo deployment/shop-api --to-revision=3
```

rollback으로 돌아오는 것은 Pod template이다. DB schema, 외부 queue message, 이미 변경된 data, Git repository는 돌아오지 않는다. schema migration은 old/new application version이 동시에 동작할 수 있도록 backward-compatible하게 나누는 전략이 필요하다.

긴급 rollback 뒤 Git을 그대로 두면 다음 declarative apply가 문제 version을 다시 배포한다. cluster 복구와 source of truth 복구를 함께 수행한다.

## 무중단 배포의 조건

무중단은 `RollingUpdate` 한 줄이 아니라 다음 조건의 조합이다.

1. readiness probe가 준비된 Pod만 endpoint에 넣는다.
2. `maxUnavailable: 0`이 rollout 중 처리 용량을 보존한다.
3. 복제본을 둘 이상 유지하면 장애 내성이 좋아진다. 다만 계획된 rolling update에서 기존 endpoint를 유지하기 위한 필수 조건은 아니다. `replicas: 1`도 `maxSurge: 1`, `maxUnavailable: 0`과 추가 스케줄링 용량, 올바른 readiness를 갖추면 새 Pod가 준비된 뒤 기존 Pod를 내릴 수 있다.
4. preStop이 endpoint 제거 전파 시간을 확보한다.
5. application이 SIGTERM을 받고 진행 중 요청을 마친다.
6. grace period가 preStop과 application 종료 시간을 포함한다.
7. node drain 같은 voluntary disruption에는 PDB를 별도로 둔다.

분 단위 평균 metric으로는 rollout 순간의 짧은 5xx가 사라져 보일 수 있다. 배포 품질은 초 단위 error rate와 endpoint 수 변화로 확인한다.

## HPA와 선언형 replica 충돌

HPA가 replica 수를 자동 조정하는 Deployment에 고정 `spec.replicas`를 계속 적용하면 deploy 시마다 replica 수가 파일 값으로 되돌아갈 수 있다. 자동 scaling의 소유권을 HPA에 줄 것인지 manifest에 둘 것인지 명확히 한다.

## rollout을 멈추고 확인하는 명령

롤아웃은 한 번의 `apply`가 아니라 새 ReplicaSet이 Ready가 되고 이전 ReplicaSet이 줄어드는 시간적 과정이다. CI에서는 명령의 종료 코드와 revision을 함께 기록한다.

```bash
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/shop-api -n demo --timeout=180s
kubectl rollout history deployment/shop-api -n demo
kubectl get rs,pod -n demo -l app=shop-api -o wide

# 위험한 변경을 발견하면 새 ReplicaSet 생성을 잠시 멈춘다.
kubectl rollout pause deployment/shop-api -n demo
kubectl describe deployment/shop-api -n demo
kubectl rollout resume deployment/shop-api -n demo

# 검증된 revision으로만 되돌린다.
kubectl rollout undo deployment/shop-api -n demo --to-revision=3
kubectl rollout status deployment/shop-api -n demo --timeout=180s
```

`pause`는 이미 생성된 Pod를 멈추는 명령이 아니라 Deployment controller가 추가 rollout을 진행하지 않게 하는 명령이다. `undo`는 Pod template을 이전 revision으로 바꾸는 것이므로, 이미지뿐 아니라 환경변수·probe·리소스 설정도 함께 되돌아간다. DB schema처럼 애플리케이션 밖의 변경은 이 명령만으로 복구되지 않으므로 backward-compatible migration과 별도 복구 계획이 필요하다.

## 정리

- Deployment는 revision, ReplicaSet은 특정 revision의 복제 수를 관리한다.
- rollout은 Ready 확인 뒤 old Pod를 종료하는 과정이다.
- CI는 apply가 아니라 `rollout status`까지 확인한다.
- rollback은 application manifest만 되돌리므로 Git과 DB compatibility를 별도로 처리한다.
- 무중단 배포는 probe, strategy, replica, 종료 처리가 모두 맞아야 한다.

---

이전 글: [7장 — Pod 생명주기와 프로브](/posts/skala-kubernetes-ch07-pod/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [9장 — Service와 클러스터 네트워킹](/posts/skala-kubernetes-ch09-service-networking/)
