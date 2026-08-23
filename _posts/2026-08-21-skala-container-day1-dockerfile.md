---
title: "[SKALA] 컨테이너 1일차 ③ — Dockerfile, 레이어를 만드는 명령과 설정만 남기는 명령"
date: 2026-08-21 20:10:00 +0900
permalink: /posts/skala-container-day1-dockerfile/
categories:
  - SKALA
  - Infra
tags: [skala, docker, dockerfile, multi-stage, entrypoint, security]
description: "FROM부터 ENTRYPOINT까지 Dockerfile 명령어를 레이어를 만드는 것과 설정만 남기는 것으로 갈라 정리한다. 멀티스테이지 빌드와 USER 전환 실습에서 실제로 발생하는 권한 오류까지 원인을 따라간다."
---

## Dockerfile은 명세서다

교재의 정의가 간결하다.

> 컨테이너 이미지 **빌드 절차 명세서**. 컨테이너 이미지를 생성하기 위한 명령어/지시문 집합.

문법 규칙은 두 가지만 기억하면 된다.

- Dockerfile은 반드시 `FROM`으로 시작한다.
- `FROM` 앞에 올 수 있는 것은 `ARG`뿐이다.

첫 예제는 Ubuntu에 nginx를 올린 이미지다.

```dockerfile
# 참고: 01.answer-code/03.dockerfile/01.nginx/Dockerfile
FROM ubuntu:latest

LABEL maintainer="Foo Bar <himang10@gmail.com>"

RUN apt-get update
RUN apt-get install -y nginx
RUN echo "\ndaemon off;" >> /etc/nginx/nginx.conf
RUN chown -R www-data:www-data /var/lib/nginx

VOLUME ["/data", "/etc/nginx/site-enabled", "/var/log/nginx"]

WORKDIR /etc/nginx

CMD ["nginx"]

EXPOSE 80
EXPOSE 443
```

빌드하고 실행한다.

```bash
docker build --tag myhello:0.1 .
docker run --name hello-nginx -d --net bridge -p 8080:80 \
  -v $(pwd)/data:/data myhello:0.1
```

`--tag`로 이름과 태그를 준다. 이름만 주면 태그는 `latest`가 된다. 마지막 `.`은 **빌드 컨텍스트**로, `COPY`가 파일을 찾는 기준 디렉터리다.

## 이 장의 핵심 분류

명령어를 하나씩 외우기 전에, 교재가 뒤쪽에서 제시하는 분류를 먼저 보는 편이 낫다. **명령어는 두 종류로 갈린다.**

### 이미지 레이어를 만드는 명령

읽기 전용 레이어(RootFS.Layers)를 실제로 생성하는 것들이다.

| 명령 | 생성 대상 |
|---|---|
| `RUN` | 패키지 설치, 빌드, 스크립트 실행의 **결과로 생성·변경된 파일**을 새 레이어로 저장 |
| `COPY` | 빌드 컨텍스트의 파일을 이미지 내부로 복사, 복사된 파일로 새 레이어 생성 |
| `ADD` | `COPY`와 유사하되 tar 자동 해제와 원격 URL 다운로드를 추가로 수행 |

### 컨테이너 실행 설정만 남기는 명령

파일시스템을 바꾸지 않고 `config.json`에 기록되는 것들이다.

```text
ENTRYPOINT, CMD, ENV, WORKDIR, EXPOSE, USER, VOLUME, LABEL …
```

이 구분이 왜 중요한가. **이미지 크기를 줄이려면 앞 그룹만 신경 쓰면 된다.** `EXPOSE`를 열 줄 써도 이미지는 1바이트도 안 커진다. 반면 `RUN`을 한 줄 잘못 나누면 수백 MB가 늘어난다.

2일차 ⑥에서 이미지를 tar로 풀면 이 두 그룹이 각각 `blobs/`의 레이어 파일과 `manifest.json`의 설정으로 갈라져 있는 것을 눈으로 확인하게 된다.

## 명령어별로 보기

### FROM — 베이스 이미지

모든 것의 출발점이다. 그리고 **멀티스테이지 빌드**의 열쇠이기도 하다.

```dockerfile
# ── 빌드 스테이지 ────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── 배포 스테이지 ────────────────────────────
FROM nginx:stable-alpine
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=builder /app/dist .
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`FROM`을 두 번 쓰고 두 번째 스테이지에서 `COPY --from=builder`로 **결과물만** 가져온다. 효과는 명확하다.

- Node.js 개발 도구, 소스코드, `node_modules`가 최종 이미지에 포함되지 않는다
- 공격 표면이 줄어 보안이 강화된다
- 이미지 크기가 수백 MB에서 수십 MB로 줄어든다

Java 쪽 예시도 같은 구조다. 실습 저장소의 `Dockerfile.maven`이 그렇다.

```dockerfile
# 참고: 00.sample-container/01.spring-backend-v1.0/Dockerfile.maven
FROM ubuntu:24.04 AS builder
RUN apt-get update && apt-get install -y openjdk-21-jdk maven \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:25-jre
WORKDIR /app
ENV SPRING_PROFILES_ACTIVE=local
COPY --from=builder /build/target/*.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
```

`pom.xml`만 먼저 복사해서 `dependency:go-offline`을 돌리고, 그다음에 `src`를 복사하는 순서가 의도적이다. 소스만 바뀌면 의존성 다운로드 레이어는 캐시에서 재사용된다. **자주 바뀌는 것을 뒤에 두는 것**이 레이어 캐시를 쓰는 기본 원칙이다.

### RUN — 빌드 시점 실행

```dockerfile
# 샘플 A. Shell 폼 — 여러 명령을 &&로 묶어 레이어 하나만 생성
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 샘플 B. Exec 폼 — /bin/sh를 거치지 않고 바이너리 직접 호출
RUN ["mkdir", "-p", "/var/www/html"]
```

교재가 강조하는 세 가지다.

- **이미지 빌드 시점의 실행**: 이미지에 영구 반영될 기초 환경을 다질 때 쓴다
- **레이어 생성**: `RUN`마다 새 레이어가 붙는다. 무분별하게 나누면 용량이 비대해진다
- **캐싱**: 동일한 `RUN`은 기존 레이어를 재사용한다

`rm -rf /var/lib/apt/lists/*`를 같은 줄에 붙이는 이유도 레이어 때문이다. 다음 줄에서 지우면 이미 앞 레이어에 파일이 박혀 있어 크기가 안 준다. **레이어 안에서 생기고 레이어 안에서 지워져야** 실제로 줄어든다.

### ARG — 빌드 시점 변수

```dockerfile
ARG UBUNTU_VERSION=22.04

FROM ubuntu:${UBUNTU_VERSION}

RUN apt-get update && apt-get install -y curl lsb-release
ARG UBUNTU_VERSION
RUN echo "현재 빌드에 사용된 ubuntu version: ${UBUNTU_VERSION}"
```

```bash
docker buildx build --tag linux-container:1.0 --build-arg UBUNTU_VERSION=24.04 .
```

**`ARG UBUNTU_VERSION`이 두 번 나오는 것이 오타가 아니다.** `FROM` 앞에 선언한 `ARG`는 `FROM` 줄에서만 유효하다. `FROM` 이후 스테이지 안에서 다시 쓰려면 스테이지 안에서 한 번 더 선언해야 한다. 멀티스테이지 구조를 깨지 않기 위한 규칙이다.

확인은 컨테이너 안에서 한다.

```text
# lsb_release -a
Distributor ID: Ubuntu
Description:    Ubuntu 24.04.4 LTS
Release:        24.04
```

`--build-arg`로 넘긴 24.04가 실제로 반영됐다.

{: .prompt-info }
> `ENV`와의 차이가 자주 헷갈린다. `ARG`는 **빌드 시점에만** 살아 있고 최종 이미지에 남지 않는다. `ENV`는 빌드 시점부터 런타임(`docker run`)까지 유지된다. 비밀값을 `ENV`에 넣으면 이미지에 그대로 박힌다.

### LABEL — 메타데이터

```dockerfile
LABEL maintainer="himang10@gmail.com"
LABEL description="SKALA Linux Version"

# 백슬래시로 여러 줄
LABEL vendor="Acme Corporation" \
      version="1.0.3" \
      release-date="2026-07-10" \
      is-production="true"
```

빌드와 실행에 아무 영향이 없는 순수 주석용 데이터다. 그런데 쓸모가 있다. `docker inspect`로 조회할 수 있고, 쿠버네티스나 사내 레지스트리가 **이미지를 분류하는 기준**으로 쓴다.

```bash
docker inspect linux-container:1.0
```

### CMD — 실행 시점 기본 명령

```dockerfile
CMD ["executable", "param1", "param2"]   # Exec 폼 (권장)
CMD executable param1 param2             # Shell 폼
```

세 가지 성질이 있다.

- 컨테이너가 실행될 때(`docker run`)의 기본 명령과 인자를 정의한다
- `CMD`가 여러 개면 **마지막 하나만** 유효하다
- `docker run 이미지 새명령`처럼 뒤에 인자를 주면 **완전히 무시되고 대체**된다

`CMD` 작성 방식이 종료 신호 처리에 직접 영향을 준다. 이 주제는 분량이 있어 [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 따로 다룬다.

### EXPOSE — 문서화

```dockerfile
EXPOSE 80
EXPOSE 8080/tcp
```

프로토콜을 생략하면 TCP다. 중요한 것은 **이 명령이 포트를 열지 않는다**는 점이다.

- **문서화 역할**: 이 컨테이너가 런타임에 어떤 포트를 Listen하는지 안내만 한다
- **호스트 포트 개방 없음**: 실제 연결은 `docker run -p`로 해야 한다

{% raw %}
```bash
docker image inspect --format='{{.Config.ExposedPorts}}' linux-container:1.0
```
{% endraw %}

```bash
docker run -d -p 80:3000 my-node-image   # 호스트 80 → 컨테이너 3000
docker run -d -P my-node-image           # EXPOSE된 포트를 랜덤 호스트 포트에 연결
```

### COPY — 파일 복사

```dockerfile
COPY [--chown=<user>:<group>] <src>... <dest>
```

- **빌드 컨텍스트 기준**: `<src>`는 `docker build`를 실행한 디렉터리 기준 상대 경로다. **`../`로 상위 디렉터리 파일을 가져올 수 없다.**
- **`--from` 지원**: 멀티스테이지에서 이전 스테이지의 산출물을 가져오는 **유일한** 명령이다

```dockerfile
COPY --chown=node:node package.json .
COPY --from=builder /app/dist ./dist
```

`ADD`는 `COPY`에 tar 자동 해제와 URL 다운로드가 붙은 것이다. 그 두 기능이 필요 없으면 `COPY`를 쓰는 편이 예측 가능하다.

### WORKDIR — 작업 디렉터리

```dockerfile
ENV APP_ROOT=/var/www
WORKDIR $APP_ROOT     # /var/www (없으면 자동 생성)
WORKDIR html          # 상대 경로는 직전 경로에 이어 붙는다 → /var/www/html
RUN pwd               # /var/www/html
```

세 가지 성질이 있다. 이후의 `RUN`, `CMD`, `ENTRYPOINT`, `COPY`, `ADD`가 모두 이 경로를 기준으로 동작하고, 지정한 경로가 없으면 자동 생성되며, `ENV` 변수를 쓸 수 있다.

### ENV — 환경변수

```dockerfile
ENV APP_HOME=/opt/myapp \
    SPRING_PROFILES_ACTIVE=prod \
    JAVA_OPTS="-Xms512m -Xmx1024m"

WORKDIR $APP_HOME
COPY target/*.jar app.jar
CMD ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

런타임까지 유지되고, `docker run --env key=value`로 덮어쓸 수 있다.

마지막 줄이 `["sh", "-c", ...]` 형태인 이유가 있다. **Exec 폼은 셸을 거치지 않으므로 `$JAVA_OPTS`가 확장되지 않는다.** 환경변수를 써야 하면 셸을 한 번 거쳐야 한다. 이 선택의 대가는 [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 다룬다.

### ENTRYPOINT — 고정된 메인 명령

```dockerfile
FROM alpine:latest
ENTRYPOINT ["ping"]              # 컨테이너의 본질을 고정
CMD ["-c", "3", "localhost"]     # 사용자가 아무것도 안 주면 쓰일 기본 인자
```

```bash
docker build --tag check-ping -f Dockerfile.entrypoint .

docker run --rm check-ping              # → ping -c 3 localhost
docker run --rm check-ping google.com   # → ping google.com
```

두 번째 실행에서 사용자가 입력한 `google.com`이 **`CMD`를 밀어내고** 고정된 `ENTRYPOINT` 뒤에 붙었다.

| 구분 | ENTRYPOINT | CMD |
|---|---|---|
| 개념 | 컨테이너가 실행할 **메인 명령**(본질) | 실행할 **기본 인자**(기본값) |
| `docker run` 뒤 인자 입력 | 입력값이 뒤에 매개변수로 추가됨 | 내용이 완전히 무시되고 대체됨 |
| 강제 오버라이딩 | `--entrypoint` 플래그 필요 | 이미지 이름 뒤에 명령 입력 시 자동 대체 |
| 흔한 실무 형태 | `ENTRYPOINT ["nginx"]`, `ENTRYPOINT ["python"]` | `CMD ["--help"]`, `CMD ["app.py"]` |

교재에 눈으로 답하는 문제가 하나 있다.

```dockerfile
FROM python:3.10-alpine
ENTRYPOINT ["echo", "This"]
CMD ["is", "the", "default", "command"]
```

```bash
docker run --rm test-image
docker run --rm test-image "is the custom CMD"
```

첫 번째는 `This is the default command`, 두 번째는 `CMD`가 통째로 대체되어 `This is the custom CMD`가 된다. `ENTRYPOINT`의 `This`는 두 경우 모두 남는다.

### USER — 실행 권한

보안에서 가장 중요한 명령이면서, 실습에서 가장 확실하게 실패하는 명령이다.

```dockerfile
USER <user>[:<group>]
USER <uid>[:<gid>]
```

- **최소 권한 원칙**: 컨테이너는 기본적으로 root로 실행되므로 보안에 취약하다
- **계정 자동 생성 없음**: `RUN useradd` 등으로 계정을 먼저 만들어야 한다

## 실습: USER 전환은 왜 실패하는가

교재는 일부러 **실패하는 Dockerfile**을 먼저 만들게 한다. 이 실습이 이 장에서 가장 배울 것이 많다.

```dockerfile
# 참고: 01.answer-code/03.dockerfile/02.command/Dockerfile.user-permissionerror
ARG UBUNTU_VERSION=22.04
FROM ubuntu:${UBUNTU_VERSION}

RUN apt-get update && apt-get install -y curl lsb-release nginx
...
WORKDIR /var/www/html
COPY index.html .

RUN groupadd skala && \
    useradd -m -s /bin/bash -g skala skala

USER skala

CMD ["nginx", "-g", "daemon off;"]
```

실행하면 이렇게 된다.

```text
nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)
[warn] the "user" directive makes sense only if the master process runs with super-user privileges
[emerg] mkdir() "/var/lib/nginx/body" failed (13: Permission denied)
```

원인이 **두 가지가 겹쳐 있다.**

1. nginx가 런타임에 쓰는 디렉터리(`/var/lib/nginx`, `/var/log/nginx`, `/run`)가 root 소유다
2. `skala` 계정은 **1024 미만의 특권 포트(80)에 바인딩할 수 없다**

둘 다 고쳐야 뜬다.

```dockerfile
# 참고: 01.answer-code/03.dockerfile/02.command/Dockerfile.user
RUN groupadd skala && \
    useradd --create-home --shell /bin/bash --gid skala skala

# nginx가 런타임에 쓰는 디렉터리 소유권 변경
RUN chown -R skala:skala /var/lib/nginx /var/log/nginx /run

# 80번 특권 포트를 못 쓰므로 기본 사이트 설정을 8080으로 변경
RUN sed -i \
    -e 's/listen 80 default_server;/listen 8080 default_server;/' \
    -e 's/listen \[::\]:80 default_server;/listen [::]:8080 default_server;/' \
    /etc/nginx/sites-enabled/default

USER skala

CMD ["nginx", "-g", "daemon off;"]
```

**이 실습의 결론은 "USER를 쓰지 말자"가 아니다.** 비특권 계정으로 내리려면 파일 소유권과 포트 번호를 함께 설계해야 한다는 것이다. root로 돌리면 이 두 가지를 고민할 필요가 없고, 그래서 편하고, 그래서 위험하다.

`USER skala` 줄만 주석 처리하면 다시 뜬다. 무엇이 원인이었는지 확인하는 데 쓸 수 있다.

{: .prompt-info }
> 특권 포트 제약은 리눅스의 오래된 규칙이고, 이것을 세분화한 것이 `CAP_NET_BIND_SERVICE`라는 Capability다. root 권한을 통째로 주지 않고 "1024 미만 포트 바인딩"만 허용하는 방식이다. 이 개념은 2일차 ⑦에서 다룬다.

실습 저장소에는 권한을 미리 점검하고 실패 시 이유를 출력하는 진입 스크립트도 들어 있다.

```bash
# 참고: 01.answer-code/03.dockerfile/02.command/entrypoint.user.sh
if [ ! -x /var/www/html ]; then
    echo "[ERROR] 권한 오류: '$(id -un)' 사용자는 /var/www/html 디렉토리에 접근할 수 없습니다."
    ls -la /var/www/ 2>&1
    exit 1
fi
...
exec nginx -g "daemon off;"
```

마지막 줄의 `exec`가 중요하다. 이유는 [다음 편](/posts/skala-container-day1-volume-signal/)에서 다룬다.

## 자주 만나는 에러

```text
docker: Error response from daemon: Conflict. The container name "/linux-container"
is already in use by container "a999c503ae51...". You have to remove (or rename)
that container to be able to reuse that name.
```

같은 이름의 컨테이너가 남아 있다는 뜻이다. 순서대로 확인한다.

```bash
docker ps -a                    # 정지된 것까지 확인
docker stop linux-container     # 돌고 있으면 정지
docker rm linux-container       # 삭제
```

`docker run --rm`을 쓰면 종료 시 자동 삭제되므로 반복 실습에서 이 충돌을 피할 수 있다.

## 이 장에서 남는 것

- 명령어는 **레이어를 만드는 것**(`RUN`, `COPY`, `ADD`)과 **설정만 남기는 것**(`CMD`, `ENV`, `EXPOSE`, `USER`, `LABEL` 등)으로 갈린다.
- 멀티스테이지 빌드는 빌드 도구를 최종 이미지에서 빼서 **크기와 공격 표면을 동시에** 줄인다.
- `ARG`는 빌드 시점까지, `ENV`는 런타임까지. 비밀값을 `ENV`에 넣으면 이미지에 남는다.
- `EXPOSE`는 포트를 열지 않는다. 여는 것은 `-p`다.
- 비특권 계정 전환은 **파일 소유권과 포트 번호**를 함께 손봐야 성립한다.

다음 편에서는 컨테이너를 지워도 데이터가 남게 하는 볼륨과, 컨테이너가 곱게 종료되게 하는 `CMD` 작성법을 다룬다.
