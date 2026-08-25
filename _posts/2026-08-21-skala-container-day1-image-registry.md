---
title: "[SKALA] 컨테이너 1일차 ② — 이미지 레이어와 레지스트리"
date: 2026-08-21 19:40:00 +0900
permalink: /posts/skala-container-day1-image-registry/
categories:
  - SKALA
  - Infra
tags: [skala, docker, container, image-layer, registry, harbor]
description: "이미지가 읽기 전용 레이어로 쪼개져 있는 이유와, 그 구조가 배포 시간에 어떤 차이를 만드는지 정리한다. 레지스트리·프로젝트·이미지·태그로 이어지는 이름 규칙과 기본 명령 라이프사이클도 함께 짚는다."
---

## 이미지 이름부터 읽는다

`docker images`를 찍으면 나오는 줄을 제대로 읽는 것에서 시작한다.

```text
REPOSITORY                                            TAG   IMAGE ID       CREATED      SIZE
skala-registry.skala-ai.com/class-0/skala-webserver   2.0   b66bb516ce6d   9 days ago   569MB
skala-registry.skala-ai.com/class-0/skala-webserver   1.0   ed8a42c68454   9 days ago   831MB
```

이름은 네 조각으로 나뉜다.

```text
skala-registry.skala-ai.com / class-0 / skala-webserver : 1.0
└── Registry Domain ──────┘  └ Project ┘  └ Image Name ┘  └ Tag ┘
```

여기서 두 단어를 구분해 두면 이후가 편하다.

- **Registry**: 여러 이미지를 저장하고 제공하는 전체 서비스 또는 서버
- **Repository**: Registry 안에서 **특정 이미지 계열**을 관리하는 개별 저장소 단위

위 출력에서 `skala-webserver`가 하나의 Repository이고, 그 안에 `1.0`과 `2.0` 두 태그가 들어 있다.

### 그러면 `nginx`는 왜 그냥 되나

`docker pull nginx` 한 줄이면 받아진다. 앞의 규칙대로면 도메인도 프로젝트도 없다.

```text
nginx → docker.io/library/nginx:latest
```

레지스트리 이름과 프로젝트 이름이 없으면 기본값에서 찾는다. Docker는 이 기본값이 내장되어 있다. 반면 podman이나 buildah는 설정 파일로 노출한다.

```bash
cat /etc/containers/registries.conf
# unqualified-search-registries = ["docker.io", "quay.io", "registry.fedoraproject.org"]
```

**같은 `nginx`가 도구에 따라 다른 곳에서 받아질 수 있다**는 뜻이다. 본 과정은 Docker Hub 대신 사내 Private Registry(`skala-registry.skala-ai.com`, Harbor)를 쓴다. 이 경우 이름을 전부 적어야 한다.

{: .prompt-warning }
> 태그를 생략하면 `latest`가 붙는다. `latest`는 "최신"이라는 뜻의 **약속이 아니라 그냥 기본 태그 이름**이다. 어제의 `latest`와 오늘의 `latest`가 다른 이미지일 수 있으므로, 교재도 명시적으로 버전을 지정하기를 권고한다.

## 레이어가 있는 이유

이미지는 하나의 덩어리가 아니라 **여러 개의 읽기 전용 레이어**로 구성된다. Dockerfile의 각 줄이 레이어 하나에 대응한다.

```dockerfile
FROM ubuntu:22.04                                       # 레이어 1
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx    # 레이어 2
COPY ./src /var/www/html                                # 레이어 3
CMD ["nginx", "-g", "daemon off;"]                      # 레이어 아님 (설정)
```

왜 굳이 쪼개는가. 교재의 그림이 답을 준다.

```text
이미지 A     이미지 B     이미지 C     이미지 D     이미지 E
레이어 3     레이어 3C    레이어 8     레이어 8     레이어 8
레이어 2     레이어 2B    레이어 6     레이어 6     레이어 7
레이어 1     레이어 1A    레이어 5     레이어 5     레이어 5
```

두 가지 효과가 나온다.

**중복 전송이 사라진다.** 이미지 C를 이미 받아 둔 상태라면, 이미지 D는 레이어 8만 새로 받으면 된다. 이미지 E는 아예 받을 것이 없다. 배포에서 실제로 체감되는 지점이다. 애플리케이션 코드만 바꾼 새 버전을 올릴 때, 베이스 이미지와 의존성 레이어는 그대로이므로 마지막 레이어 하나만 오간다.

**공유 레이어는 함부로 지워지지 않는다.** 이미지 A를 삭제해도 레이어 1, 2, 3은 남는다. 다른 이미지가 같은 레이어를 참조하고 있을 수 있기 때문이다. `docker rmi`를 했는데 디스크가 안 줄어드는 이유가 여기 있다.

{: .prompt-info }
> 이 레이어 구조가 실제 파일로 어떻게 생겼는지는 [2일차 ⑥](/posts/skala-container-day2-image-anatomy/)에서 `docker save`로 tar를 풀어 직접 확인한다. 그리고 그것이 실행 시점에 어떻게 하나의 파일시스템으로 합쳐지는지는 [2일차 ⑦](/posts/skala-container-day2-kernel/)의 OverlayFS에서 다룬다.

이 사실은 Dockerfile 작성 방식에 곧바로 영향을 준다. `RUN`을 여러 줄로 나누면 레이어가 그만큼 늘어난다. 그래서 `&&`로 묶는 관례가 생긴다. 자세한 내용은 [다음 편](/posts/skala-container-day1-dockerfile/)에서 다룬다.

## 이미지 라이프사이클

이미지를 다루는 흐름은 정해져 있다.

```text
프로그램 개발 → 로컬 실행·단위 테스트 → Dockerfile 작성
     ↓
이미지 빌드 → 이미지 로컬 실행(compose) → 이미지 배포(Registry)
```

이 순환이 CI/CD에서 그대로 자동화된다. 남이 만든 이미지를 쓰는 것도 좋지만 필요한 이미지가 없는 경우가 있으므로, 만들고 등록하는 방법을 익히는 것이 이 과정의 목표라고 교재는 적는다.

## 기본 명령

### 검색과 내려받기

```bash
docker search ubuntu
docker pull ubuntu          # 태그 생략 시 latest
docker pull ubuntu:22.04
docker images               # 로컬 이미지 목록
docker images ubuntu        # 이름은 같고 태그가 다른 것들
```

`docker search` 결과에서 `OFFICIAL` 표시가 붙은 것이 공식 이미지다. 보통 `ubuntu`, `centos`, `redis`처럼 **사용자명이 붙지 않은** 이름이 공식이고, `pyrasis/ubuntu`처럼 `/` 앞에 사용자명이 있으면 개인이 올린 이미지다.

호스트에 깔린 리눅스 배포판과 이미지의 배포판은 달라도 된다. CentOS 호스트에서 Ubuntu 컨테이너를 실행할 수 있다. 커널만 공유하면 되기 때문이다.

### 실행과 상태 확인

```bash
docker run -it --name hello ubuntu:latest /bin/bash
```

| 옵션 | 의미 |
|---|---|
| `-i` (interactive) | STDIN을 열어 둔다 |
| `-t` (pseudo-tty) | 가상 터미널을 할당한다 |
| `--name` | 이름 지정. 생략하면 Docker가 자동 생성 |

`-it`을 붙여야 셸에 입력이 전달된다. 이 두 옵션이 실제로 무엇을 연결하는지는 [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 PID 1과 함께 다시 나온다.

컨테이너 안에서 `exit`을 치면 `/bin/bash`가 끝나므로 **컨테이너도 정지**한다. 컨테이너의 수명은 그 안에서 실행한 프로세스의 수명과 같다.

```bash
docker ps        # 실행 중인 것만
docker ps -a     # 정지된 것까지 전부
```

```text
CONTAINER ID   IMAGE           COMMAND        CREATED         STATUS
0885c28b8583   ubuntu:latest   /bin/bash      6 minutes ago   Exited (0) 4 minutes ago
e5e081049b81   mariadb:latest  docker-entry…  59 minutes ago  Up 59 minutes
```

### 생명주기 명령

```bash
docker start hello       # 정지된 것을 다시 시작
docker restart hello     # 재부팅에 해당
docker stop hello        # 정지
docker rm hello          # 삭제 (정지 상태여야 함)
docker rmi ubuntu:latest # 이미지 삭제
```

`docker rmi ubuntu`처럼 태그 없이 이름만 주면 **그 이름을 가진 모든 태그가 삭제**된다.

### 밖에서 안의 명령 실행하기

```bash
docker exec hello echo "Hello World"      # 명령 하나만
docker exec -it hello /bin/bash           # 셸로 접속
```

`docker exec`는 **실행 중인 컨테이너에만** 쓸 수 있다. 정지된 컨테이너에는 안 된다.

`docker run`과의 차이를 헷갈리기 쉽다. `run`은 이미지로부터 **새 컨테이너를 만들어** 프로세스를 시작하고, `exec`는 **이미 도는 컨테이너 안에** 프로세스를 추가로 띄운다.

### 운영에서 쓰는 명령

| 명령 | 설명 |
|---|---|
| `docker container prune` | 중지된 모든 컨테이너 제거 |
| `docker image prune` | 태그 없는 이미지 제거. `-a`는 미사용 이미지 전부 |
| `docker system prune -a` | 이미지·컨테이너·볼륨·네트워크 중 미사용분 전부 |
| `docker stats` | 컨테이너 자원 사용 현황 |
| `docker network ls` | 네트워크 목록 |
| `docker inspect <ID>` | 메타데이터 전체를 JSON으로 |

`docker inspect`는 나중까지 계속 쓰인다. 컨테이너 ID, 이미지 정보, 환경변수, 네트워크 설정, 마운트 정보, 상태, 실행 명령, 로그 경로, restart 정책까지 Docker가 관리하는 설정이 전부 나온다. Docker Desktop의 화면에 보이는 정보도 결국 이 JSON이다.

```bash
docker ps
docker inspect ${CONTAINER_ID}
```

## 수업 중 나온 질문

### 이미지는 알겠는데 AppImage는 뭔가

이름이 닮았고 푸는 문제도 비슷하지만 **격리가 없다는 점이 결정적으로 다르다.**

AppImage는 리눅스 애플리케이션 배포 형식이다. 앱과 의존 라이브러리를 **파일 하나**로 묶어,
배포판을 가리지 않고 실행 권한만 주면 설치 없이 돌아가게 한다.

```bash
chmod +x MyApp-x86_64.AppImage
./MyApp-x86_64.AppImage
```

동작 방식도 컨테이너와 겹치는 데가 있다. AppImage 파일은 SquashFS 이미지이고,
실행하면 FUSE로 임시 마운트한 뒤 그 안의 진입점을 실행한다.
**"이미지를 마운트해서 실행한다"**는 뼈대는 같다.

| | 컨테이너 이미지 | AppImage |
|---|---|---|
| 푸는 문제 | 의존성을 함께 묶어 "내 PC에선 되는데"를 없앤다 | 같다 |
| 실행 형태 | 레이어를 OverlayFS로 합쳐 rootfs로 삼는다 | SquashFS를 FUSE로 마운트한다 |
| **격리** | namespace + cgroup으로 **격리한다** | **없다.** 호스트의 평범한 프로세스다 |
| 보는 파일시스템 | 자기 rootfs | **호스트 것 그대로** |
| 주 용도 | 서버 애플리케이션 배포 | 데스크톱 앱 배포 |

AppImage로 실행한 프로그램은 홈 디렉터리도, 네트워크도, 프로세스 목록도 전부 호스트 것을 본다.
격리가 목적이 아니라 **"설치 없이 어디서든 실행"**이 목적이기 때문이다.

같은 계열의 Flatpak과 Snap은 중간쯤에 있다. 이쪽은 namespace와 seccomp로 어느 정도 격리한다.
Flatpak은 bubblewrap이라는 도구를 쓰는데, [2일차 ⑦](/posts/skala-container-day2-kernel/)에서 다루는
namespace를 그대로 활용한다. **커널 기능은 같고 어디까지 쓰느냐가 다를 뿐이다.**

## 이 장에서 남는 것

- 이미지 이름은 `레지스트리 / 프로젝트 / 이미지 : 태그` 네 조각이다. 앞 두 조각이 없으면 기본 레지스트리에서 찾는다.
- 레이어는 **중복 전송을 없애고**, 그 대가로 **삭제해도 디스크가 바로 안 준다.**
- 컨테이너의 수명 = 그 안에서 실행한 프로세스의 수명.
- `run`은 새로 만들고, `exec`는 도는 것에 붙는다.

다음 편에서는 그 레이어를 실제로 만드는 Dockerfile 명령어를 하나씩 본다. 어떤 명령이 레이어를 만들고 어떤 명령이 설정만 남기는지가 핵심이다.
