---
title: "[SKALA] 쿠버네티스 3장 — 컨트롤 플레인, 워커 노드와 네트워크"
date: 2026-09-07 11:00:00 +0900
permalink: /posts/skala-kubernetes-ch03-architecture/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, architecture, control-plane, cni, eks]
description: "컨트롤 플레인과 워커 노드의 구성 요소를 역할별로 나누고, apply 이후 Pod가 뜨는 과정과 CNI·오버레이 네트워크의 의미를 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch02-container-image, skala-kubernetes-ch04-cluster-internals]
---

## 결정하는 쪽과 실행하는 쪽

쿠버네티스 클러스터는 크게 control plane과 worker node로 나뉜다. control plane은 어떤 상태가 필요하고 어느 노드에 배치할지를 결정한다. worker node는 전달받은 Pod 명세대로 컨테이너를 실행하고 네트워크·볼륨을 연결한다.

```text
kubectl / controller / kubelet
             ↓ 모든 API 요청
        kube-apiserver
             ↕
            etcd

control plane: scheduler · controller manager
worker node  : kubelet · container runtime · CNI · kube-proxy
```

컴포넌트가 etcd를 직접 읽고 쓰는 구조가 아니라 API server를 공통 관문으로 사용한다. 그래서 API server가 일시적으로 멈춰도 이미 실행 중인 Pod와 기존 데이터 패킷은 곧바로 사라지지 않는다. 다만 조회·배포·새 스케줄링 같은 제어 작업은 막힌다.

## Control plane 구성 요소

| 구성 요소 | 역할 | 멈췄을 때 먼저 보이는 증상 |
|---|---|---|
| kube-apiserver | 인증·인가·검증 후 API 객체 저장 | `kubectl` 요청 실패 |
| etcd | API 객체의 상태 저장 | 클러스터 상태 변경 불가 |
| kube-scheduler | 새 Pod를 실행할 노드 선택 | Pod가 Pending에 머묾 |
| kube-controller-manager | Deployment·ReplicaSet·Node 등 조정 루프 | 복구·스케일·롤아웃 정지 |
| cloud-controller-manager | Node·LoadBalancer 등 클라우드 연동 | LB 같은 외부 자원 생성 실패 |

EKS에서는 이 영역을 AWS가 관리하므로 control plane 인스턴스에 직접 접속하지 않는다. 필요한 경우 API audit/authenticator/controller-manager 등의 control plane 로그를 CloudWatch로 내보내 관찰한다.

## Worker node 구성 요소

| 구성 요소 | 역할 | 장애와 연결되는 상태 |
|---|---|---|
| kubelet | 자기 노드의 Pod를 명세대로 맞추고 probe 실행 | ContainerCreating, probe failure |
| container runtime | 이미지 pull과 컨테이너 실행 | ImagePullBackOff, runtime error |
| CNI plugin | Pod에 IP를 할당하고 네트워크 인터페이스 구성 | sandbox/network setup failure |
| kube-proxy | Service 가상 IP를 위한 커널 규칙 구성 | Service 연결 실패 |
| CSI driver | 외부 볼륨 attach/mount | PVC·mount 관련 Pending |
| DaemonSet agent | 노드별 로그·메트릭·보안 수집 | 특정 노드 관측 공백 |

Docker는 이미지 빌드 도구로 계속 사용할 수 있지만 Kubernetes 노드의 런타임이 Docker라는 뜻은 아니다. kubelet은 CRI 규격으로 containerd 같은 런타임과 통신하고, 노드에서 확인할 때는 `crictl`을 사용한다. 이미지 형식인 OCI와 런타임 인터페이스인 CRI는 서로 다른 계층이다.

## 오버레이 네트워크는 무엇인가

수업 메모에서 놓치기 아쉬운 부분이 오버레이 네트워크였다. 먼저 두 층을 구분한다.

```text
underlay network
  └─ 실제 노드가 연결된 VPC/subnet/route

Pod network
  └─ 모든 Pod가 서로 통신할 수 있도록 CNI가 만든 논리 네트워크

Service network
  └─ ClusterIP라는 가상 주소를 Pod endpoint로 변환하는 별도 계층
```

일반적인 overlay CNI는 Pod 전용 주소 공간을 만들고, 다른 노드로 가는 Pod 패킷을 VXLAN 같은 방식으로 감싸 underlay를 통과시킨다. 장점은 물리 네트워크와 독립적인 Pod 주소 체계이고, 대가는 encapsulation overhead와 MTU·추적 복잡성이다.

그러나 **EKS의 기본 Amazon VPC CNI는 전형적인 overlay가 아니다.** Pod가 VPC subnet의 실제 주소를 ENI에서 할당받아 VPC 네트워크에 직접 나타난다. 이 방식은 경로가 단순하고 AWS 네트워크 기능과 잘 연결되지만, subnet IP와 인스턴스별 ENI/IP 한도가 Pod 밀도의 제약이 된다.

따라서 “쿠버네티스 Pod 네트워크는 overlay”는 흔한 구현을 설명하는 문장이지 Kubernetes의 필수 조건이 아니다. 정확한 표현은 **CNI가 Pod 네트워크를 구현하며, 구현 방식은 overlay일 수도 native routing일 수도 있다**이다.

## `kubectl apply` 이후의 여덟 단계

1. `kubectl`이 YAML을 API 객체로 변환해 API server로 보낸다.
2. API server가 인증·인가·스키마와 정책을 검증하고 etcd에 저장한다.
3. Deployment controller가 새 ReplicaSet을 만든다.
4. ReplicaSet controller가 필요한 Pod 객체를 만든다.
5. scheduler가 조건을 만족하는 worker node를 선택한다.
6. 해당 노드의 kubelet이 runtime과 CNI·CSI에 실행 준비를 요청한다.
7. 컨테이너가 시작되고 probe 결과에 따라 Ready가 된다.
8. Ready Pod가 Service의 EndpointSlice에 등록된다.

상태 이름은 이 단계의 관측값이다. `Pending`이면 scheduler의 Events, `ImagePullBackOff`면 이미지 경로와 인증, `CrashLoopBackOff`면 직전 컨테이너 로그, `Running 0/1`이면 readiness를 본다.

## 오브젝트 구조와 느슨한 연결

객체 매니페스트는 `apiVersion`, `kind`, `metadata`로 종류와 이름을 밝힌다. Deployment처럼 원하는 상태를 선언하는 객체는 `spec`을 갖고, 컨트롤러가 관찰한 결과는 `status`에 나타난다. ConfigMap이나 Secret처럼 이 두 필드가 없는 객체도 있다. 리소스들은 이름을 서로 하드코딩하기보다 label과 selector로 연결된다.

Deployment의 selector와 Pod template label, Service selector가 일치해야 한다. Pod 이름은 매번 바뀌지만 label은 의도한 역할을 표현하므로 연결이 유지된다. Deployment selector는 생성 후 변경할 수 없으므로 처음 설계할 때 안정적인 label을 골라야 한다.

Namespace는 이름 충돌과 RBAC·quota의 범위지만 그 자체로 네트워크 보안 경계는 아니다. 기본 상태에서는 namespace 사이 통신이 가능하며, 격리가 필요하면 NetworkPolicy와 이를 집행하는 CNI 기능이 필요하다.

## control plane과 node를 명령으로 관찰하기

관리형 클러스터에서는 control plane 프로세스에 접속하지 못하므로 API가 노출하는 상태와 kube-system workload를 관찰한다. 아래 명령은 특정 구현의 내부 파일이 아니라 Kubernetes API와 label을 기준으로 한다.

```bash
kubectl get --raw='/readyz?verbose'
kubectl get nodes -o custom-columns='NAME:.metadata.name,READY:.status.conditions[?(@.type=="Ready")].status,TAINTS:.spec.taints[*].effect'
kubectl get pods -n kube-system -o wide
kubectl get daemonset -n kube-system
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl get events -A --sort-by=.lastTimestamp | tail -30
```

EKS에서는 control plane의 상세 로그를 별도로 활성화해 CloudWatch로 보내야 하며, `kubectl get pods -n kube-system`에 control plane Pod가 보이지 않는 것이 정상이다. 반면 worker node의 kubelet·CNI·CSI agent는 보통 DaemonSet과 Node 상태로 간접 확인한다. `Ready=True`인 노드도 `NetworkUnavailable`, pressure condition, taint 때문에 특정 Pod를 받지 못할 수 있으므로 한 열만 보고 판단하지 않는다.

추가 확인: [Amazon VPC CNI](https://docs.aws.amazon.com/eks/latest/best-practices/vpc-cni.html)

---

이전 글: [2장 — 컨테이너 이미지와 재현 가능한 빌드](/posts/skala-kubernetes-ch02-container-image/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [4장 — 클러스터 내부 동작](/posts/skala-kubernetes-ch04-cluster-internals/)
