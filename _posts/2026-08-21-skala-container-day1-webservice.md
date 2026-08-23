---
title: "[SKALA] 컨테이너 1일차 ⑤ — 세 컨테이너로 웹 서비스 세우기"
date: 2026-08-21 21:10:00 +0900
permalink: /posts/skala-container-day1-webservice/
categories:
  - SKALA
  - Infra
tags: [skala, docker, springboot, nginx, vue, multi-stage, bridge-network]
description: "Spring Boot 백엔드·nginx 프런트엔드·MariaDB를 각각 컨테이너로 만들어 하나의 브리지 네트워크로 잇는다. nginx 프록시 설정과 SPA 멀티스테이지 빌드까지 실제 코드로 따라간다."
---

## 1일차의 종착점

지금까지 만든 조각을 모은다. 이미지를 만들 줄 알고([③](/posts/skala-container-day1-dockerfile/)), 볼륨을 붙일 줄 알고([④](/posts/skala-container-day1-volume-signal/)), 네트워크를 만들어 뒀다([①](/posts/skala-container-day1-virtualization/)). 이제 실제 웹 서비스를 세 컨테이너로 세운다.

교재의 실습 시나리오는 다섯 단계다.

1. Spring Boot 컨테이너 빌드 및 실행
2. `skala` 브리지 네트워크 기반으로 MariaDB 연동
3. 정적 HTML 프런트엔드 컨테이너 빌드 및 실행
4. Vue.js 프런트엔드 컨테이너 빌드 및 실행
5. 자신의 웹 서비스를 구성

## 구성도

로컬에서는 이런 모양이 된다.

```text
                 Local PC
  Browser
     │  http://localhost:9090/          ┌─────────────────────┐
     ├──────── static resource ────────▶│  nginx 컨테이너       │
     │                                  │  /usr/share/nginx/  │
     │                                  │    html/index.html  │
     │  http://localhost:9090/api/xxx   │    css, javascript  │
     └──────────── json ───────────────▶└──────────┬──────────┘
                                                   │ /api 프록시
                                        ┌──────────▼──────────┐
                                        │  Spring Boot 컨테이너 │
                                        │  /api/xxx, /swagger │
                                        └──────────┬──────────┘
                                                   │ jdbc
                                        ┌──────────▼──────────┐
                                        │  MariaDB 컨테이너     │
                                        └─────────────────────┘
```

용어를 하나 정리해 둔다.

- **static resource**: HTML, CSS, image, video 등 서버가 그대로 내려 주는 파일
- **javascript**: 브라우저에서 실행되며 데이터를 동적으로 갱신하는 코드

실무 배포에서는 앞단이 인터넷망, 뒷단이 쿠버네티스 내부망으로 갈리고 그 사이를 도메인과 내부 IP가 잇는다. 로컬 실습은 그 구조를 포트로 축약한 것이다.

## 1. Spring Boot 컨테이너

소스는 `00.sample-container/01.spring-backend-v1.0`에 있다. JPA로 주문·결제·배송을 다루는 API 서버다.

```dockerfile
# 참고: 00.sample-container/01.spring-backend-v1.0/Dockerfile
FROM eclipse-temurin:21-jre

WORKDIR /app

EXPOSE 8080
EXPOSE 8081

# JVM 힙 메모리 고정 설정
ENV JAVA_OPTS="-Xms256m -Xmx512m"

ADD ./target/*.jar app.jar

CMD ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
```

베이스가 `jre`(런타임)이지 `jdk`가 아니다. 컴파일은 밖에서 끝났으므로 실행에 필요한 것만 담는다. 마지막 줄의 `sh -c "exec ..."`는 [앞 편](/posts/skala-container-day1-volume-signal/)에서 다룬 형식이다. `$JAVA_OPTS`를 확장해야 해서 셸을 거치되, `exec`로 PID 1 자리를 JVM에게 넘긴다.

빌드는 두 단계다.

```bash
mvn clean install -DskipTests
docker buildx build --tag spring-backend:1.0 .
```

**`ADD ./target/*.jar`이므로 `mvn`을 먼저 돌려야 한다.** jar가 없으면 빌드가 실패한다. 이 의존을 없애는 방법이 뒤에 나온다.

### DB 연결

실행 전에 MariaDB와 네트워크를 확인한다.

```bash
docker ps
# 865c08b411ca  mariadb:latest  ...  0.0.0.0:3306->3306/tcp  mariadb

docker network ls
# 8c04df2f4086  skala  bridge  local
```

그리고 백엔드를 같은 네트워크에 붙여 실행한다.

```bash
docker run -d \
  --name spring-backend \
  --network skala \
  -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=local-mariadb \
  spring-backend:1.0
```

`-e SPRING_PROFILES_ACTIVE=local-mariadb`가 어떤 설정을 켜는지 보면 `--network skala`가 왜 필요한지 알 수 있다.

```yaml
# 참고: src/main/resources/application-local-mariadb.yaml
spring:
  datasource:
    url: jdbc:mariadb://mariadb:3306/skala
    driver-class-name: org.mariadb.jdbc.Driver
    username: user
    password: password
  jpa:
    hibernate:
      ddl-auto: create-drop
```

**`jdbc:mariadb://mariadb:3306/skala`** — 호스트 자리에 IP가 아니라 `mariadb`라는 **컨테이너 이름**이 들어간다. 이 이름이 풀리려면 두 컨테이너가 같은 **커스텀 브리지** 네트워크에 있어야 한다. 기본 `bridge`에는 DNS가 없어서 이름이 풀리지 않는다.

[1일차 ①](/posts/skala-container-day1-virtualization/)에서 그냥 따라 쳤던 `docker network create --driver bridge skala` 한 줄이 여기서 전제가 된다. 이 DNS가 어디서 오는지는 [2일차 ⑨](/posts/skala-container-day2-network/)에서 다룬다.

{: .prompt-warning }
> `ddl-auto: create-drop`은 애플리케이션이 뜰 때 스키마를 새로 만들고 내려갈 때 지운다. 실습용으로는 편하지만, **컨테이너를 재시작할 때마다 데이터가 사라진다.** 볼륨을 붙였더라도 이 설정이 켜져 있으면 데이터는 남지 않는다.

확인한다.

```bash
docker ps
docker logs spring-backend
```

브라우저로 `http://localhost:8080/`에 접속해 사용자를 등록하고, DBeaver로 `localhost:3306`에 붙어 `users` 테이블에 실제로 들어갔는지 본다. 접속 정보는 `user` / `password` / `skala`다.

### 빌드까지 컨테이너 안에서

`mvn`을 먼저 돌려야 하는 의존이 불편하면 멀티스테이지로 합친다.

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

빌드 도구(JDK, Maven, 의존성 캐시)와 소스가 최종 이미지에서 전부 빠진다. 로컬에 JDK나 Maven이 없어도 이미지가 만들어진다는 것도 장점이다.

## 2. 정적 프런트엔드 컨테이너

Spring Boot의 Thymeleaf 화면을 SPA 구조로 떼어 내 별도 컨테이너로 배포한다.

```dockerfile
# 참고: 00.sample-container/03.frontend/Dockerfile
FROM nginx:alpine

# 기본 nginx 설정 파일 제거
RUN rm /etc/nginx/conf.d/default.conf

# 커스텀 설정 복사 (정적 서빙 + /api 프록시)
COPY default.conf /etc/nginx/conf.d/

# 정적 파일을 nginx 기본 디렉토리로 복사
COPY src/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

빌드 단계가 없다. 순수 HTML/CSS/JS라 컴파일할 것이 없기 때문이다.

핵심은 nginx 설정이다.

```nginx
# 참고: 00.sample-container/03.frontend/default.conf
server {
    listen 80;

    # 정적 파일 서빙
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;

        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        add_header Pragma "no-cache";
    }

    # Spring Boot API 프록시
    location /api {
        resolver 127.0.0.11 valid=10s;
        set $backend "spring-backend:8080";
        proxy_pass http://$backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

세 줄을 짚어 둘 만하다.

**`try_files $uri $uri/ /index.html;`** — 요청한 경로에 파일이 없으면 `index.html`을 돌려준다. SPA는 라우팅을 브라우저에서 하므로 `/users` 같은 경로에 실제 파일이 없다. 이 줄이 없으면 새로고침할 때 404가 난다.

**`resolver 127.0.0.11 valid=10s;`** — `127.0.0.11`은 **Docker의 내장 DNS 서버 주소**다. 앞에서 본 "컨테이너 이름으로 통신"을 nginx가 쓰려면 이 리졸버를 명시해야 한다. `valid=10s`는 캐시 유효 시간이다. 컨테이너가 재생성되면서 IP가 바뀌어도 10초 안에 따라간다.

**`set $backend "spring-backend:8080"; proxy_pass http://$backend;`** — 변수로 한 번 받아서 넘긴다. `proxy_pass`에 이름을 직접 쓰면 nginx가 **기동 시점에 한 번만** 이름을 풀고 그 결과를 고정한다. 백엔드 컨테이너가 재시작되어 IP가 바뀌면 계속 옛 IP로 보낸다. 변수로 쓰면 매 요청마다 리졸버를 탄다.

빌드하고 실행한다.

```bash
docker buildx build --tag frontend:1.0 .

docker run -d \
  --name frontend \
  --network skala \
  -p 9090:80 \
  frontend:1.0
```

`http://localhost:9090/`에서 사용자 관리와 등록이 동작하면 세 컨테이너가 이어진 것이다.

## 3. Vue 프런트엔드 컨테이너

Vue는 빌드 과정이 있다는 점만 다르다.

```text
vue code          npm run build         static resource        Frontend container
App.vue      ─────────────────────▶    index.html        ────▶  nginx + static
main.js                                app.js
```

그래서 멀티스테이지를 쓴다.

```dockerfile
# 참고: 00.sample-container/04.vue-frontend/Dockerfile
# 1단계: Vue 프로젝트를 빌드해서 정적 파일(dist/)을 생성
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# 2단계: 빌드된 정적 파일만 nginx 이미지에 담아 서빙
FROM nginx:alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY default.conf /etc/nginx/conf.d/
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`default.conf`는 정적 프런트엔드와 동일하다. **빌드 결과물이 결국 정적 파일이므로 서빙 방식은 같아진다.**

```bash
docker buildx build --tag vue-frontend:1.0 .

docker run -d \
  --name vue-frontend \
  --network skala \
  -p 8090:80 \
  vue-frontend:1.0
```

`.dockerignore`가 함께 들어 있다.

```text
node_modules
dist
```

로컬의 `node_modules`가 빌드 컨텍스트로 전송되는 것을 막는다. 없으면 수백 MB를 데몬에 넘기고 나서 어차피 `npm install`로 다시 만든다. 로컬 것을 그대로 복사하면 OS가 달라 깨질 수도 있다.

{: .prompt-info }
> 교재 슬라이드는 `node:22-alpine` 또는 `node:20-alpine`에 `RUN npm ci`로 되어 있고, 저장소 코드는 `node:22-alpine`에 `RUN npm install`이다. `npm ci`는 `package-lock.json`을 그대로 따르므로 빌드 재현성이 더 높지만, lock 파일이 없으면 실패한다.

## 포트 정리

컨테이너가 늘어나면 포트가 헷갈린다.

| 컨테이너 | 호스트 포트 | 컨테이너 포트 | 접속 |
|---|---|---|---|
| `mariadb` | 3306 | 3306 | DBeaver |
| `spring-backend` | 8080 | 8080 | `http://localhost:8080/` |
| `frontend` | 9090 | 80 | `http://localhost:9090/` |
| `vue-frontend` | 8090 | 80 | `http://localhost:8090/` |

프런트엔드 두 개가 컨테이너 내부에서는 똑같이 80을 쓰지만 호스트 포트가 달라 충돌하지 않는다. **컨테이너마다 네트워크 네임스페이스가 분리되어 있기 때문**인데, 이 구조는 [2일차 ⑦](/posts/skala-container-day2-kernel/)에서 다룬다.

## 이 실습이 남기는 문제

세 컨테이너가 떴다. 그런데 이 상태에는 불편이 남아 있다.

- `docker run` 명령이 세 개고, 각각 옵션이 길다
- 순서가 있다. DB가 먼저 떠야 백엔드가 붙는다. 그런데 그 순서를 강제할 방법이 없다
- 네트워크를 매번 손으로 만들어야 한다
- 하나를 고쳐 다시 올리려면 stop → rm → build → run을 반복해야 한다

교재가 Docker Compose를 도입하는 이유로 정확히 이 목록을 든다.

> 컨테이너가 많아질수록 명령어가 복잡 / 네트워크·볼륨·환경변수 반복 설정 / 실행 순서 관리 어려움

Compose는 [2일차 ⑩](/posts/skala-container-day2-compose/)에서 다룬다. 그 전에 2일차는 지금까지 쓴 `docker run`이 실제로 무엇을 하는지를 안쪽에서 확인하는 순서로 이어진다.

## 이 장에서 남는 것

- 컨테이너 이름으로 통신하려면 **커스텀 브리지**가 필요하다. `jdbc:mariadb://mariadb:3306`이 성립하는 이유다.
- nginx로 SPA를 서빙할 때는 `try_files`(새로고침 404 방지)와 `resolver` + 변수 `proxy_pass`(IP 고정 방지)를 함께 챙긴다.
- Vue처럼 빌드가 필요한 앱은 멀티스테이지로 빌드 도구를 최종 이미지에서 뺀다.
- 컨테이너가 셋을 넘어가면 `docker run`으로 관리하기 어려워진다. 다음 도구가 필요한 지점이다.
