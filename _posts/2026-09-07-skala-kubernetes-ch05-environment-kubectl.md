---
title: "[SKALA] 쿠버네티스 5장 — EKS 접속과 kubectl 기본 진단"
date: 2026-09-07 13:00:00 +0900
permalink: /posts/skala-kubernetes-ch05-environment-kubectl/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, eks, kubectl, kubeconfig, rbac]
description: "EKS kubeconfig과 context를 안전하게 관리하고, kubectl의 기본 문법 및 get·describe·logs를 이용한 진단 순서를 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch04-cluster-internals, skala-kubernetes-ch06-kubectl-operations]
---

## 접속 전에 확인할 것

실습에 필요한 기본 도구는 `kubectl`, AWS CLI v2, Docker이며 Helm은 패키지 설치가 필요할 때 사용한다. client와 server의 Kubernetes minor version 차이가 너무 크면 일부 API·필드가 맞지 않을 수 있으므로 먼저 버전을 확인한다.

```bash
kubectl version --client -o yaml
aws --version
docker --version
helm version --short
aws sts get-caller-identity
```

마지막 명령은 현재 셸이 어느 AWS account와 IAM identity를 사용하는지 확인한다. 클러스터 권한 문제를 조사하기 전에 인증 주체부터 확정해야 한다.

## kubeconfig는 클러스터가 아니라 접속 설정이다

```bash
aws eks update-kubeconfig \
  --region ap-northeast-2 \
  --name skala-2026 \
  --profile skala-2026
```

이 명령은 EKS cluster를 생성하지 않는다. 로컬 kubeconfig에 endpoint, certificate 정보와 인증 명령을 기록한다. 고정 비밀번호를 저장하는 대신 호출 시점마다 AWS IAM 기반 token을 얻는다.

```bash
kubectl config current-context
kubectl config get-contexts
kubectl cluster-info
kubectl get nodes -o wide
kubectl config set-context --current --namespace=class-7
```

여러 cluster를 하나의 전역 kubeconfig에 섞으면 잘못된 운영 cluster에 명령을 실행하기 쉽다. 환경별 파일을 나누고 프롬프트에 current context와 namespace를 표시하는 습관이 안전하다.

강의 환경은 한 namespace를 반 전체가 공유하므로 context와 리소스 이름이 특히 중요하다. 현재 namespace가 맞는지, 공용 Ingress와 StorageClass가 어느 이름인지 먼저 확인한다.

```bash
kubectl config view --minify --output='jsonpath={.contexts[0].context.namespace}{"\n"}'
kubectl get namespace class-7
kubectl get ingressclass
kubectl get storageclass ebs-sc efs-sc
kubectl get pods -n ingress-nginx -o wide
```

`get namespace`나 `get storageclass`가 실패하면 명령 문법보다 강의 클러스터의 실제 리소스 이름과 권한을 확인한다. 자료의 이름은 실습 시점의 전제이고, 다른 클러스터에서는 `kubectl get ...` discovery 결과가 최종 기준이다.

## 명령형으로 구조를 확인한 뒤 정리하기

강의에서는 매니페스트를 배우기 전에 명령형 Deployment를 한 번 만들어 `Deployment → ReplicaSet → Pod` 계층을 눈으로 확인한다. 공유 namespace이므로 예시 이름의 `P000` 부분은 자신의 식별자로 바꾼다.

```bash
# 1) 구조를 확인하기 위한 임시 Deployment
kubectl create deployment hello-P000 --image=nginx:1.27 --replicas=3
kubectl get deployment,replicaset,pod -o wide

# 2) 조정 루프 확인: Pod 하나를 지우면 새 이름으로 다시 생긴다.
kubectl get pod -l app=hello-P000
kubectl delete pod <pod-name>
kubectl get pod -l app=hello-P000 -w

# 3) 임시 리소스 정리
kubectl delete deployment hello-P000
kubectl get all
kubectl get ingress,configmap,secret,pvc,hpa
```

이 실습의 `create`와 Pod 삭제는 조정 루프를 관찰하기 위한 예외다. 운영 리소스는 같은 구조를 YAML에 남겨 `kubectl apply -f`로 관리한다. Deployment를 삭제해도 별도로 만든 Service·Ingress·PVC는 남을 수 있으므로, 실습 종료 시 `get`으로 비용이 발생할 수 있는 LoadBalancer와 volume을 확인한다.

## 인증과 인가를 분리한다

EKS에서 IAM 주체로 접속할 때는 IAM 자격증명으로 신원을 확인한다. Kubernetes API의 작업 권한은 클러스터 설정에 따라 EKS access entry에 연결된 access policy 또는 Kubernetes RBAC으로 부여한다. IAM에 EKS 조회 권한이 있다고 해서 Pod를 만들 권한까지 생기는 것은 아니다.

```bash
kubectl auth can-i create deployments
kubectl auth can-i delete nodes
kubectl auth can-i get pods -n class-6
```

token 생성이나 identity가 잘못되면 Unauthorized, 신원은 확인됐지만 권한이 없으면 Forbidden이 된다. 권한 오류에서는 추측보다 `auth can-i` 결과를 먼저 확인하고, 필요한 경우 access entry의 범위·정책 또는 RoleBinding을 점검한다. 자세한 설정 방식은 [EKS access entries](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html)를 참고한다.

## kubectl 문법은 네 칸이다

```text
kubectl <verb> <resource> <name> <options>
```

- verb: `get`, `describe`, `logs`, `apply`, `delete`, `exec`, `rollout`
- resource: `pod`, `deployment`, `service`, `configmap`
- name: 생략하면 목록, 지정하면 한 객체
- options: namespace, label selector, output format, watch 등

명령 이름을 전부 외우기보다 이 구조와 `--help`, shell completion을 활용한다.

## 진단의 기본 순서

`get`은 넓게 상태를 보고, `describe`는 한 객체의 조건과 Events를 설명한다. 컨테이너가 실행된 뒤에야 `logs`가 의미가 있다.

```bash
kubectl get pod -o wide
kubectl describe pod <pod>
kubectl logs <pod> --tail=100
kubectl logs <pod> --previous
```

`Pending`에는 실행된 컨테이너가 없을 수 있으므로 logs보다 Events가 우선이다. `CrashLoopBackOff`에서는 새 컨테이너 로그가 비어 있을 수 있어 `--previous`로 직전 실패 로그를 본다.

정렬과 selector를 사용하면 문제 후보를 빠르게 줄일 수 있다.

```bash
kubectl get pods --sort-by='.status.containerStatuses[0].restartCount'
kubectl get pods --field-selector=status.phase!=Running
kubectl get events --field-selector=type=Warning
kubectl get pods -l app=shop-api --show-labels
```

## 출력값을 운영 입력으로 바꾸기

사람이 읽을 때는 `-o wide`와 YAML, script에서는 JSONPath와 custom columns가 유용하다.

```bash
kubectl get deploy shop-api \
  -o jsonpath='{.spec.template.spec.containers[0].image}'

kubectl get pods -o custom-columns=\
'NAME:.metadata.name,NODE:.spec.nodeName,IP:.status.podIP'
```

JSONPath에서 annotation이나 ConfigMap key처럼 점이 포함된 key는 escape가 필요하다. 필드 경로가 기억나지 않으면 먼저 `-o yaml`로 실제 객체 구조를 본다.

## 변경 전에 diff, 변경 뒤에 상태 확인

```bash
kubectl diff -f k8s/
kubectl apply --dry-run=server -f k8s/
kubectl apply -f k8s/
```

운영 변경은 파일과 `apply`가 기준이다. 디버깅 과정에서 `scale`이나 `set image`를 사용했다면 같은 변경을 파일에도 반영한다. 삭제할 때도 이름을 하나씩 적기보다 생성에 사용한 파일을 기준으로 `kubectl delete -f`를 실행하면 누락을 줄일 수 있다.

`kubectl get all`은 이름과 달리 Ingress, ConfigMap, Secret, PVC를 모두 보여 주지 않는다. 정리할 때는 비용을 만드는 LoadBalancer와 volume이 남았는지도 별도로 확인한다.

## kubeconfig를 안전하게 다루는 명령

`kubectl`의 대부분의 실수는 명령어 문법보다 잘못된 context에서 발생한다. 특히 운영 context를 현재 context로 둔 채 실습 명령을 실행하지 않도록 명령 시작 전에 대상과 namespace를 출력하는 습관을 둔다.

```bash
kubectl config get-contexts
kubectl config current-context
kubectl config view --minify --raw
kubectl cluster-info
kubectl auth can-i --list --namespace=demo
kubectl config set-context --current --namespace=demo

# API server를 로컬 프록시로만 노출해 discovery를 확인한다.
kubectl proxy --port=8001
curl -s http://127.0.0.1:8001/version
```

`config view --raw`는 token·client certificate를 출력할 수 있으므로 터미널 캡처나 로그에 남기지 않는다. context의 namespace 설정은 권한 경계를 만들지 않는다. 실수 방지용 기본값일 뿐이며, 중요한 변경에는 여전히 `-n`을 명시하고 `current-context`를 확인한다. 조직에서는 read-only와 write context를 분리하거나 admission policy로 production 변경을 추가로 제한한다.

## 정리

- current context, namespace, AWS identity를 명령 전에 확인한다.
- 권한 문제는 `auth can-i`, 객체 문제는 `describe`의 Events에서 시작한다.
- 진단 순서는 상태 → Events → 현재/직전 로그다.
- 운영 변경은 `diff`와 server-side dry-run 뒤 선언형으로 적용한다.
- `get all`이 정말 모든 리소스를 의미하지는 않는다.

---

이전 글: [4장 — API 요청부터 컨테이너 실행까지](/posts/skala-kubernetes-ch04-cluster-internals/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [6장 — kubectl 실무](/posts/skala-kubernetes-ch06-kubectl-operations/)
