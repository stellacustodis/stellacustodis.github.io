---
title: "[SKALA] 쿠버네티스 이해 및 애플리케이션 배포 — 2일·13장 학습 로드맵"
date: 2026-09-07 08:00:00 +0900
permalink: /posts/skala-kubernetes-roadmap/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, eks, deployment, networking, kubectl]
description: "컨테이너 이미지를 EKS의 Deployment로 실행하고 Service와 Ingress로 노출하기까지, 쿠버네티스 13개 장의 학습 흐름과 장애 진단 기준을 정리한다."
---

## 이 과정의 자리

앞선 컨테이너 과정에서는 애플리케이션을 이미지라는 재현 가능한 실행 단위로 만드는 법을 배웠다. 이번 과정은 그 이미지를 여러 서버에 배치하고, 개수를 유지하고, 새 버전으로 교체하고, 네트워크와 설정·스토리지를 연결하는 단계다.

전체 목표는 Spring Boot 애플리케이션을 컨테이너 이미지로 만든 뒤 EKS에 배포하고, 외부 도메인으로 호출하며, 서비스 중단 없이 새 버전으로 교체할 수 있는 상태다. 명령어 자체보다 다음 질문에 답할 수 있는지가 중요하다.

> 매니페스트 한 장을 적용했을 때 어떤 컨트롤러가 움직이고, 요청은 어느 주소들을 거쳐 프로세스에 도착하며, 실패했을 때 어느 계층부터 확인해야 하는가?
{: .prompt-info }

## 이틀과 13장의 흐름

| 일차 | 장 | 핵심 질문 |
|---|---:|---|
| 1일차 | 1 | 왜 컨테이너만으로 부족하며 선언형 운영이 필요한가 |
| 1일차 | 2 | 재현 가능하고 안전한 애플리케이션 이미지는 어떻게 만드는가 |
| 1일차 | 3 | 컨트롤 플레인과 워커 노드는 역할을 어떻게 나누는가 |
| 1일차 | 4 | `apply` 이후 컨테이너가 뜨기까지 내부에서 무슨 일이 일어나는가 |
| 1일차 | 5 | EKS 접속과 기본 진단에 필요한 `kubectl` 문법은 무엇인가 |
| 1일차 | 6 | 운영 중인 리소스를 안전하게 조회·수정·디버깅하려면 어떻게 하는가 |
| 1일차 | 7 | Pod의 생명주기와 세 프로브는 어떻게 다른가 |
| 2일차 | 8 | Deployment는 어떻게 롤링 업데이트와 롤백을 수행하는가 |
| 2일차 | 9 | 계속 바뀌는 Pod를 Service와 DNS가 어떻게 연결하는가 |
| 2일차 | 10 | 외부 요청이 프로세스까지 가는 경로를 어떻게 추적하는가 |
| 2일차 | 11 | Ingress와 Ingress Controller는 무엇이 다른가 |
| 2일차 | 12 | 설정과 비밀값, 영속 데이터를 Pod 밖으로 어떻게 분리하는가 |
| 2일차 | 13 | 리소스·프로브·종료 처리를 묶어 운영 가능한 배포를 어떻게 만드는가 |

```text
이미지
  ↓
Deployment → ReplicaSet → Pod → Container → Process
                              ↑
외부 → Load Balancer → Ingress → Service → EndpointSlice
                              ↑
                    ConfigMap · Secret · PVC
```

화살표는 단순한 리소스 목록이 아니다. 제어 흐름과 데이터 흐름이 섞여 있다. Deployment는 Pod를 직접 실행하지 않고 ReplicaSet을 통해 원하는 개수를 유지한다. Ingress는 라우팅 규칙이고, 실제 패킷은 Ingress Controller 또는 클라우드 로드밸런서가 처리한다. Service는 안정적인 이름과 가상 주소를 제공하지만 실제 목적지는 Ready 상태인 Pod 목록이다.

## 수업 메모에서 잡은 네 가지 중심축

첫째, 운영 변경은 선언형으로 남긴다. 긴급 대응에서 `scale`, `set image`, `edit`를 쓸 수는 있지만 최종 상태를 YAML과 Git에 반영하지 않으면 다음 `apply`가 긴급 변경을 되돌린다. 선언형의 핵심은 단순히 YAML을 쓰는 것이 아니라 **재실행해도 같은 상태로 수렴하고, 변경 근거와 복구 방법이 남는 것**이다.

둘째, Pod를 직접 만들지 않는다. Pod는 실행 최소 단위지만 자기 자신을 복제하거나 복구하지 못한다. 일반적인 서버 애플리케이션은 Deployment를 만들고, 그 결과로 생성된 Pod를 관찰한다.

셋째, 네트워크는 요청 경로로 이해한다. 외부 HTTP 요청의 논리적 흐름은 `Ingress → Service → Pod`이고, 내부 호출은 `Service DNS → ClusterIP → EndpointSlice의 Pod IP`로 좁혀진다. 다만 EKS에서 ALB의 `target-type: ip`를 쓰면 데이터 패킷은 Service의 ClusterIP를 거치지 않고 Pod IP로 바로 갈 수 있다. 리소스 관계와 실제 패킷 경로를 구분해야 한다.

넷째, 장애는 상태 이름과 경계로 진단한다. `Pending`은 스케줄링, `ImagePullBackOff`는 이미지, `CrashLoopBackOff`는 애플리케이션, `READY 0/1`은 readiness 영역을 먼저 본다. 네트워크는 Pod IP, Service, DNS, Ingress, 외부 DNS 순으로 한 계층씩 확인한다.

## 명령을 읽는 기준

13개 장은 이미지 생성에서 Pod 실행, 네트워크 연결과 운영 점검까지 순서대로 읽는다. 실습 명령에서는 입력 문법과 **실행 후 확인할 상태**를 함께 본다. 클러스터 이름·namespace·스토리지·Ingress controller는 환경마다 다르므로 실행 전에 확인해야 한다. 본문의 예상 상태는 학습용 예시이며, 직접 실행해 얻은 운영 성과는 아니다.

---

다음 글: [1장 — 왜 쿠버네티스인가](/posts/skala-kubernetes-ch01-why-kubernetes/)
