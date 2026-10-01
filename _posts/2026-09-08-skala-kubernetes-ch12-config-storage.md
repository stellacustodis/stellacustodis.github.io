---
title: "[SKALA] 쿠버네티스 12장 — ConfigMap, Secret과 스토리지"
date: 2026-09-08 13:00:00 +0900
permalink: /posts/skala-kubernetes-ch12-config-storage/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, configmap, secret, pvc, storage]
description: "환경별 설정과 비밀값을 이미지 밖으로 분리하고, ConfigMap 갱신 방식과 PV·PVC·StorageClass 및 EBS·EFS 선택 기준을 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch11-ingress, skala-kubernetes-ch13-resource-deployment]
---

## 빌드는 한 번, 설정은 배포 시 주입한다

환경마다 다른 `application-prod.yml`을 image 안에 넣어 다시 build하면 staging에서 검증한 image와 production image가 달라진다. application artifact는 같게 유지하고 endpoint, log level, feature flag, credential은 외부에서 주입한다.

- 일반 설정: ConfigMap
- 비밀값: Secret과 별도 secret manager
- 영속 데이터: PVC 또는 외부 managed storage

ConfigMap과 Secret의 값은 문자열이라는 점을 의식한다. YAML이 숫자나 boolean으로 해석하지 않도록 필요한 값은 따옴표로 감싼다.

## 환경변수와 volume mount

환경변수는 container 시작 시점에 process environment로 고정된다. ConfigMap을 수정해도 이미 실행 중인 process의 값은 바뀌지 않는다.

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef: { name: shop-secret, key: db-password }
envFrom:
  - configMapRef: { name: shop-config }
```

ConfigMap을 일반 projected volume으로 mount하면 kubelet이 변경 내용을 지연 후 반영한다. 단, `subPath`로 mount한 파일은 ConfigMap 변경을 자동 반영하지 않는다. 하지만 application이 file change를 감지하고 다시 읽어야 실제 동작이 바뀐다. “file이 바뀜”과 “application config가 reload됨”은 서로 다른 단계다.

```yaml
volumes:
  - name: config
    configMap: { name: shop-config }
containers:
  - name: app
    volumeMounts:
      - { name: config, mountPath: /config, readOnly: true }
```

mountPath에 원래 있던 directory는 mount에 가려진다. application binary가 있는 `/app` 같은 경로를 config volume으로 덮지 않는다.

## 설정 변경이 rollout을 일으키게 한다

ConfigMap object 변경은 Deployment의 Pod template 변경이 아니므로 자동 rollout이 발생하지 않는다. 선택지는 다음과 같다.

- 실습·수동 운영: `kubectl rollout restart`
- template annotation에 config content hash 반영
- versioned ConfigMap name 사용
- Reloader 같은 controller 사용
- volume file 갱신과 application hot reload 사용

선언형 pipeline에서는 config hash가 바뀌면 Pod template도 바뀌도록 만들어 어떤 config version으로 실행됐는지 revision에 남기는 방식이 명확하다.

## Secret의 base64는 암호화가 아니다

Secret의 `data`는 base64 encoding일 뿐 권한이 있으면 즉시 원문을 복원할 수 있다. 보호의 첫 단계는 Secret read RBAC을 최소화하고 Git과 log에 값을 남기지 않는 것이다. production에서는 etcd encryption at rest, KMS, External Secrets와 Secrets Manager/Vault 같은 외부 저장소를 함께 검토한다.

환경변수는 process inspection, crash dump나 실수로 출력한 log에 노출될 수 있다. 민감도와 application 지원 여부에 따라 read-only file mount를 고려한다. 그러나 mount했다고 자동으로 암호화되거나 유출 가능성이 사라지는 것은 아니다.

## volume의 수명

| 유형 | 수명 | 용도 |
|---|---|---|
| container writable layer | container 재생성 전까지 | 버려도 되는 임시 변경 |
| emptyDir | Pod 수명 | Pod 안 컨테이너 간 임시 공유 |
| PVC | Pod와 독립 | database·필요한 영속 파일 |
| hostPath | node 수명과 filesystem | 제한된 node agent 용도 |
| ConfigMap/Secret volume | API object 기반 read-only config | 설정 주입 |

`hostPath`는 host filesystem을 container에 노출해 보안과 이동성을 크게 낮춘다. 일반 application storage로 사용하지 않는다.

## PVC, PV, StorageClass의 역할

```text
Pod → PVC: 10Gi, ReadWriteOnce 필요
         ↓
StorageClass: 어떤 provisioner와 정책으로 만들 것인가
         ↓
PV: 실제 EBS/EFS volume과 binding
```

application team은 PVC로 요구사항을 선언하고 infrastructure team은 StorageClass로 구현을 추상화한다. `WaitForFirstConsumer` binding mode는 Pod가 배치될 node/AZ가 정해진 뒤 volume을 만들어 잘못된 AZ에 고정되는 일을 줄인다. 그래서 PVC가 잠시 Pending인 것이 정상일 수 있다.

## EBS, EFS, object storage

- EBS: 낮은 latency의 block storage. 일반적으로 RWO이며 AZ 제약이 있다.
- EFS: 여러 node에서 RWX 공유 가능. network filesystem latency와 비용을 고려한다.
- S3 같은 object storage: upload, backup, 대규모 blob에 적합하며 filesystem semantics와 다르다.

“파일이 필요하다”는 이유만으로 PVC를 선택하지 않는다. log는 stdout, user upload는 object storage, 재생성 가능한 cache는 emptyDir나 Redis가 더 적합할 수 있다. volume이 붙을수록 Pod의 placement와 failover 제약이 커진다.

PVC 삭제가 실제 volume 삭제로 이어지는지는 PV reclaim policy에 달려 있다. 실습 정리에서는 비용, 운영에서는 데이터 보존 정책을 먼저 확인한다.

## 설정과 볼륨을 명령으로 검증하기

Secret 값 자체를 출력하지 않고 object의 연결 상태와 volume binding만 확인한다. 실습에서 `--from-literal`을 사용할 때도 shell history와 CI 로그에 비밀값이 남지 않도록 환경변수·외부 secret manager를 사용한다.

```bash
kubectl create configmap shop-config -n demo \
  --from-literal=LOG_LEVEL=info --from-literal=FEATURE_CHECKOUT=true \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl get configmap shop-config -n demo -o yaml

kubectl describe secret shop-secret -n demo
kubectl get pod -n demo -l app=shop-api \
  -o jsonpath='{range .items[*]}{.metadata.name}{" config="}{.spec.volumes[*].configMap.name}{"\n"}{end}'

kubectl get pvc,pv,storageclass -n demo
kubectl describe pvc shop-data -n demo
kubectl get pvc shop-data -n demo \
  -o jsonpath='{.status.phase}{" volume="}{.spec.volumeName}{"\n"}'
```

ConfigMap을 바꾼 뒤 환경변수 주입 방식의 Pod가 계속 이전 값을 사용하면 정상이다. template annotation이나 `rollout restart`로 새 Pod를 만들었는지 확인해야 한다. PVC가 `Pending`이면 StorageClass provisioner, access mode, resource size와 Events를 순서대로 본다. `Bound`여도 애플리케이션이 실제로 읽고 쓸 수 있다는 뜻은 아니므로 mount 경로와 파일 권한, AZ 제약까지 별도로 검증한다.

## 정리

- 같은 image를 환경마다 재사용하고 설정만 외부에서 주입한다.
- 환경변수는 Pod 재시작, volume config는 application reload까지 필요하다.
- Secret은 권한이 필요한 base64 object이지 그 자체로 암호화가 아니다.
- PVC는 요청, PV는 실체, StorageClass는 생성 방법이다.
- 영속 storage는 데이터 요구와 접근 모드, AZ·backup 책임까지 보고 선택한다.

---

이전 글: [11장 — Ingress와 외부 노출](/posts/skala-kubernetes-ch11-ingress/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [13장 — 리소스와 배포 실전](/posts/skala-kubernetes-ch13-resource-deployment/)
