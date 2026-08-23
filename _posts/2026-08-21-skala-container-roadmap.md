---
title: "[SKALA] 컨테이너 이해 및 애플리케이션 컨테이너화 — 2일 학습 로드맵"
date: 2026-08-21 08:00:00 +0900
permalink: /posts/skala-container-roadmap/
categories:
  - SKALA
  - Infra
tags: [skala, docker, container, dockerfile, docker-compose, oci, runc]
description: "Docker를 명령어 모음이 아니라 리눅스 커널 기능의 조합으로 읽는 2일 과정을 정리한다. 이미지 레이어에서 출발해 Dockerfile·볼륨·시그널을 거쳐 namespace·cgroup·runc와 Docker Compose까지 이어지는 흐름을 미리 그려 둔다."
---

## 이 과정의 자리

컨테이너 과정은 8월 21일(금)과 24일(월) 이틀간 진행됐다. 바로 앞이 Spring AI 3일 과정이었고, 그 앞이 Java·Spring Boot와 Vue였다. 지금까지는 **애플리케이션을 만드는 쪽**이었다면, 이 과정부터는 만든 것을 **어떻게 담아서 옮기는가**로 관심이 옮겨 간다.

이 배치에는 이유가 있다. 같은 시간표에서 2주 뒤인 9월 7일과 8일에 "쿠버네티스 이해 및 애플리케이션 배포"가 이어진다. 쿠버네티스는 컨테이너를 다루는 플랫폼이므로, 컨테이너가 무엇인지 모르는 상태로는 그 위에서 할 수 있는 일이 명령어를 외우는 것밖에 없다. 이 2일은 그 바닥을 까는 시간이다.

## 이 과정이 다루는 질문

교재 270쪽을 관통하는 질문은 하나로 좁혀진다.

> **컨테이너는 가상 머신이 아니다. 그러면 무엇인가?**

과정의 답은 2일차 마지막에 명시적으로 나온다.

> 컨테이너는 결국 **프로세스의 모음**이며, 그 실행은 일반 리눅스 프로세스와 같지만, 단지 런타임에 의해 격리(namespace)되고 자원이 제한(cgroup)된 상태로 운영되는 것

1일차는 이 결론을 **밖에서** 확인한다. 이미지를 만들고, 실행하고, 볼륨을 붙이고, 신호를 주고받는다. 2일차는 같은 것을 **안에서** 확인한다. 이미지를 tar로 풀어 헤치고, 커널 기능을 하나씩 꺼 보고, `runc`를 손으로 직접 호출한다.

`docker run`이 편의 문법이었다는 것을 2일차에 알게 되는 구조다.

## 이틀의 흐름

| | 1일차 (8/21) | 2일차 (8/24) |
|---|---|---|
| | 환경 구성하기 | 컨테이너 이미지 구조 |
| | 컨테이너의 이해 | 컨테이너 구조 |
| | 나의 데이터베이스 만들기 | 컨테이너 플랫폼 |
| | 컨테이너 기본 활용 | docker compose 이해 |
| | Dockerfile 작성 | docker compose 명령어 |
| | 컨테이너 볼륨 연결하기 | 조별 토론하기 |
| | CMD 명령 최적화 | Quiz |
| | 실습: 나의 서비스 컨테이너 만들기 | 실습: 나의 서비스 docker compose화하기 |

목차의 "조별 토론하기"와 "Quiz"는 배포된 교재에 해당 슬라이드가 없다. 현장에서 진행하는 항목으로 보인다.

## 글을 나눈 기준

하루치를 한 편에 담으면 명령어 나열이 되기 쉽다. 그래서 **하나의 질문에 답이 끝나는 단위**로 끊었다.

| 편 | 다루는 질문 |
|---|---|
| [1일차 ① 가상화에서 컨테이너로](/posts/skala-container-day1-virtualization/) | VM으로 충분하지 않았던 것은 무엇인가 |
| [1일차 ② 이미지와 레지스트리](/posts/skala-container-day1-image-registry/) | 이미지는 왜 레이어로 쪼개져 있는가 |
| [1일차 ③ Dockerfile 명령어](/posts/skala-container-day1-dockerfile/) | 어떤 명령이 레이어를 만들고 어떤 명령이 설정만 남기는가 |
| [1일차 ④ 볼륨과 PID 1](/posts/skala-container-day1-volume-signal/) | 컨테이너를 지워도 데이터가 남으려면, 그리고 곱게 죽으려면 |
| [1일차 ⑤ 웹 서비스 컨테이너화](/posts/skala-container-day1-webservice/) | 프런트·백엔드·DB 세 컨테이너를 어떻게 잇는가 |
| 2일차 ⑥ 이미지를 tar로 뜯어보기 | 이미지 파일 안에는 실제로 무엇이 들어 있는가 |
| 2일차 ⑦ 커널 기능으로 본 컨테이너 | 격리는 어떤 커널 기능이 만드는가 |
| 2일차 ⑧ 런타임 계층과 runc | `docker run`과 실제 프로세스 사이에 무엇이 있는가 |
| 2일차 ⑨ Docker 네트워크 | 컨테이너 이름으로 통신이 되는 이유는 무엇인가 |
| 2일차 ⑩ Docker Compose | 여러 컨테이너의 순서와 경계를 어떻게 선언하는가 |

2일차 다섯 편은 해당 수업일 이후에 순서대로 올린다.

## 실습 코드를 먼저 정리해 둘 것

교재는 실습 코드를 GitHub에서 받아 쓴다.

```bash
mkdir -p ~/workspace/cloud && cd ~/workspace/cloud
git clone https://github.com/himang10/skala-container.git
cd skala-container
```

받아 놓고 보면 **교재가 인용하는 경로와 저장소의 실제 경로가 여러 군데 어긋난다.** 실습 중에 "참고" 문구를 따라갔다가 파일을 못 찾는 일이 생기므로, 시작 전에 대응표를 만들어 두는 편이 낫다.

| 교재가 적은 경로 | 저장소의 실제 경로 |
|---|---|
| `01.answer-code/10.docker-compose/01.base` | `01.answer-code/09.docker-compose/01.start` |
| `10.docker-compose/03.full` | `01.answer-code/09.docker-compose/02.services` |
| `01.answer-code/runc/` | `01.answer-code/08.runc/` |
| `06.execise-source/vue-frontend/` | `00.sample-container/04.vue-frontend/` |
| `01.training-code/execise-source/Dockerfile.multi-stage` | `00.sample-container/01.spring-backend-v1.0/Dockerfile.maven` |

저장소의 `README.md`도 실제 구조와 다르다. README는 `01.training-code/`, `02.answer-code/`, `03.myapp-containers/` 세 디렉터리를 설명하지만, 실제 최상위에는 `00.sample-container/`와 `01.answer-code/` 둘뿐이다. **README보다 실제 트리를 믿는 편이 안전하다.**

```bash
# 실제 구조
skala-container/
├── 00.sample-container/    # 웹 서비스 컨테이너화용 완성 코드
│   ├── 01.spring-backend-v1.0/   # Spring Boot + JPA 주문 관리 API
│   ├── 02.fastapi-backend-v2.0/  # FastAPI 백엔드
│   ├── 03.frontend/              # 정적 HTML/JS + nginx
│   └── 04.vue-frontend/          # Vue.js + 멀티스테이지 빌드
└── 01.answer-code/         # 실습별 정답 (01.mariadb ~ 09.docker-compose)
```

## 환경에서 미리 막아 둘 것

교재가 실습 앞에 배치한 주의 사항 중 실제로 자주 걸리는 것 세 가지다.

**Docker Desktop의 쿠버네티스는 설치하지 않는다.** 컨트롤 플레인 컴포넌트가 전부 컨테이너로 뜨기 때문에 실습 내내 자원을 잡아먹는다. 쿠버네티스는 2주 뒤 과정에서 별도 환경으로 다룬다.

**8080 포트를 미리 비워 둔다.** 실습 대부분이 8080을 쓴다. `Bind for 0.0.0.0:8080 failed: port is already allocated`가 뜨면 점유 프로세스를 정리한다.

```bash
lsof -ti :8080 | xargs kill -9
```

**Docker Hub에 로그인해 둔다.** 익명 상태로는 이미지 pull 횟수 제한에 걸린다. 다만 본 과정의 이미지는 Docker Hub가 아니라 사내 Private Registry(`skala-registry.skala-ai.com`)를 쓴다.

## 이 시리즈의 태도

컨테이너는 명령어를 외워도 당장은 돌아간다. `docker run`을 치면 뜨고 `docker stop`을 치면 멈춘다. 그래서 안을 들여다보지 않아도 한동안은 불편하지 않다.

그 상태로 넘어가면 곤란해지는 지점이 이 과정에 두 번 나온다. 하나는 **`CMD` 한 줄 때문에 종료 신호가 애플리케이션에 도달하지 않는 문제**이고, 다른 하나는 **컨테이너 이름으로 DB에 접속하려는데 이름이 풀리지 않는 문제**다. 둘 다 명령어를 더 외워서는 풀리지 않고, 각각 PID 1과 커스텀 브리지 네트워크의 DNS를 알아야 풀린다.

그래서 이 시리즈는 명령어 목록을 옮겨 적는 대신, **그 명령이 커널 수준에서 무엇을 바꾸는가**를 확인할 수 있는 지점마다 멈춰 서기로 했다. 2일차에 `runc`를 직접 호출해 보는 실습이 있는 것도 같은 의도라고 본다.
