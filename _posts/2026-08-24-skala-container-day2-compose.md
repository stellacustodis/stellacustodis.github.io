---
title: "[SKALA] 컨테이너 2일차 ⑩ — Docker Compose, 순서와 경계를 선언하기"
date: 2026-08-24 21:10:00 +0900
permalink: /posts/skala-container-day2-compose/
categories:
  - SKALA
  - Infra
tags: [skala, docker-compose, healthcheck, depends-on, network, orchestration]
description: "docker run 세 줄을 하나의 yaml로 옮기고, healthcheck와 depends_on으로 기동 순서를, 네트워크 분리로 접근 경계를 선언한다. 종합 실습의 완성 구조와 검증 절차까지 정리한다."
---

## 왜 필요했나

[1일차 ⑤](/posts/skala-container-day1-webservice/)에서 세 컨테이너를 띄우고 나서 남은 불편이 있었다. 교재가 Compose를 도입하며 드는 이유가 정확히 그 목록이다.

- 컨테이너가 많아질수록 명령어가 복잡
- 네트워크/볼륨/환경변수 반복 설정
- 실행 순서 관리 어려움

Docker Compose는 **단일 노드 내에서 여러 컨테이너를 조율하는 오케스트레이션 도구**다. 여러 컨테이너로 이루어진 애플리케이션을 하나의 yaml로 정의하고 한 번의 명령으로 실행·중지·관리한다.

| 역할 | 설명 |
|---|---|
| 서비스 정의 | 컨테이너를 '서비스'로 선언 |
| 네트워크 구성 | **custom bridge를 자동 생성** |
| 볼륨 관리 | 데이터 영속성 |
| 실행 순서 | `depends_on` |
| 환경 설정 | env, secrets |
| 전체 수명주기 | `up` / `down` / `restart` |

"custom bridge를 자동 생성"이 [앞 편](/posts/skala-container-day2-network/)과 이어진다. `docker network create --driver bridge skala`를 손으로 칠 일이 없어지고, **서비스 이름이 그대로 DNS에 등록**된다.

주요 용도는 로컬 개발 환경, 교육·실습 환경, 통합 테스트 환경 구성이다. 단일 노드용이라는 점이 중요하다. 여러 노드는 쿠버네티스의 영역이다.

### 셸 스크립트를 yaml로 옮긴 것과는 다르다

`docker run` 세 줄을 파일 하나로 묶는 것처럼 보이지만, **성격이 바뀐다.**

셸 스크립트는 **무엇을 할지 순서대로** 적는다.

```bash
docker network create skala
docker run -d --name mariadb ... mariadb:latest
docker run -d --name backend ... backend:1.0
```

Compose 파일은 **어떤 상태였으면 좋겠는지**를 적는다.

```yaml
services:
  mariadb: { image: mariadb:latest, ... }
  backend: { build: ./backend, ... }
```

차이는 **두 번 실행해 보면** 드러난다.

| | 두 번째 실행 |
|---|---|
| 셸 스크립트 | 이름 충돌로 실패하거나 두 벌이 뜬다 |
| `docker compose up -d` | **아무 일도 일어나지 않는다.** 이미 원하는 상태이므로 |

이것을 **멱등(idempotent)**하다고 한다. 셸 스크립트로 같은 성질을 만들려면
"이미 있으면 건너뛴다"를 전부 손으로 써야 한다.
[1일차 ①](/posts/skala-container-day1-virtualization/)에서 쓴 이 한 줄이 그 예다.

```bash
docker network inspect skala >/dev/null 2>&1 || docker network create --driver bridge skala
```

서비스가 셋만 돼도 이런 조건문이 사방에 생긴다. Compose는 그 일을 대신한다.

선언형이라 따라오는 것이 더 있다.

- **차이만 반영한다** — 한 서비스만 고치고 `up -d` 하면 그것만 재생성된다
- **의존 관계를 순서가 아니라 조건으로 적는다** — `depends_on` + `condition: service_healthy`
- **현재 상태를 물어볼 수 있다** — `docker compose ps`

그리고 이 사고방식이 그대로 쿠버네티스로 이어진다. `kubectl apply -f`도
"이 명령을 실행해라"가 아니라 "이 상태로 만들어라"이고,
[2일차 ⑧](/posts/skala-container-day2-runtime-runc/)의 `replicas`도 "3개를 띄워라"가 아니라
"3개인 상태를 유지해라"다.

## 기본 구조

```yaml
services:
  db:
    image: postgres:15
    volumes:
      - ./data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: postgres

  backend:
    image: my-backend
    depends_on:
      - db

  frontend:
    image: my-frontend
    ports:
      - "8080:80"
```

`db`, `backend`, `frontend`가 **서비스 이름**이고, 이것이 컨테이너 간 통신과 DNS의 단위가 된다.

## 실습: 최소 구성부터

```yaml
# 참고: 01.answer-code/09.docker-compose/01.start/docker-compose.yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
    ports:
      - 5432:5432
    restart: always
```

여기에 백엔드를 얹는다.

```yaml
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.backend
    ports:
      - 9090:8080
```

```bash
cd 01.answer-code/09.docker-compose/01.start

docker compose up --build -d      # backend 이미지를 빌드하고 db와 함께 실행
# http://localhost:9090 접속
docker compose down               # 종료 및 네트워크 삭제
```

`image:` 대신 `build:`를 쓰면 Compose가 이미지를 직접 빌드한다. `docker build`와 `docker run`이 한 명령으로 합쳐진다.

백엔드는 FastAPI다.

```dockerfile
# 참고: 01.answer-code/09.docker-compose/01.start/backend/Dockerfile.backend
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn psycopg2-binary
COPY app.py app.py
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```

```python
# 참고: 01.answer-code/09.docker-compose/01.start/backend/app.py
DB_CONFIG = {
    "host": "db",          # ← 서비스 이름으로 접속
    "port": 5432,
    "database": "postgres",
    "user": "postgres",
    "password": "postgres"
}
```

`host`가 `"db"`다. **Compose가 만든 네트워크의 DNS가 서비스 이름을 풀어 준다.** [1일차 ⑤](/posts/skala-container-day1-webservice/)에서 `--network skala`를 손으로 붙여야 했던 일을 Compose가 알아서 한다.

## 명령어

### 빌드와 실행

```bash
docker compose build                    # 전체 빌드
docker compose build --no-cache         # 캐시 없이 완전 빌드
docker compose build backend            # 특정 서비스만

docker compose up                       # 포그라운드 실행
docker compose up -d                    # 백그라운드
docker compose up -d db backend         # 특정 서비스만
docker compose up -d --build            # 빌드 후 실행
```

### 중지와 시작

```bash
docker compose stop
docker compose start
docker compose restart
docker compose restart backend
```

### 상태 확인

```bash
docker compose ps                # 실행 중인 컨테이너
docker compose ps -a             # 정지된 것까지
docker compose logs -f           # 모든 서비스 로그
docker compose logs -f backend   # 대상 지정

docker inspect <container-name> | less
```

`docker inspect`로 볼 수 있는 것은 컨테이너 상태, 종료 코드, OOM 여부, IP와 연결된 네트워크, 볼륨/바인드 마운트 경로, 환경변수, `CMD`/`ENTRYPOINT`, restart 정책, healthcheck 결과 등이다.

### 리소스 제거

```bash
docker compose rm         # 컨테이너만 제거 (네트워크는 남는다)
docker compose down       # 컨테이너 + 네트워크
docker compose down -v    # 컨테이너 + 네트워크 + 볼륨
```

**`down`과 `down -v`의 차이가 실습에서 자주 문제가 된다.** `-v`를 붙이면 DB 데이터까지 지워진다. 초기화하고 싶을 때는 붙이고, 데이터를 남기려면 빼야 한다.

### 장애 복구와 디버깅

```bash
docker compose up -d --force-recreate backend    # 설정 반영을 위해 재생성

docker compose down && docker compose up -d --build   # 네트워크까지 초기화

docker compose exec backend sh      # 컨테이너 내부 셸 (alpine 계열)
docker compose exec backend bash    # ubuntu/debian 계열

docker compose exec backend cat /etc/resolv.conf
docker compose exec backend ping db
```

마지막 두 줄이 유용하다. **이름이 안 풀릴 때 DNS 설정과 실제 도달 여부를 컨테이너 안에서 직접 확인**할 수 있다.

### 여러 프로젝트 다루기

```bash
docker compose -f docker-compose-app1.yaml ps
docker compose -f docker-compose-app2.yaml logs -f

docker compose -p app1 ps
docker compose -p app2 logs -f
```

`docker compose up`은 기본적으로 **현재 디렉터리 이름**을 프로젝트 이름으로 쓴다. `-p myapp`을 주면 그 이름을 쓴다. 네트워크 이름도 `<프로젝트명>_<네트워크명>` 형태로 만들어진다.

## 주요 필드

### command / entrypoint

Dockerfile의 `CMD`를 덮어쓴다. **`ENTRYPOINT`는 유지된다.**

```yaml
services:
  web:
    image: nginx
    command: ["nginx", "-g", "daemon off;"]
```

`ENTRYPOINT`까지 바꾸려면 둘 다 적어야 한다.

```yaml
services:
  web:
    image: nginx
    entrypoint: ["docker-entrypoint.sh"]
    command: ["nginx", "-g", "daemon off;"]
```

`entrypoint`를 지정하면 Dockerfile의 `CMD`가 무시되므로 다시 선언해야 한다.

### restart — 재시작 정책

```yaml
services:
  db:
    image: postgres:9.6.1
    restart: always
```

| 값 | 의미 | 용도 |
|---|---|---|
| `no` | 재시작 안 함 (기본값) | 일회성 작업, 마이그레이션 도구 |
| `on-failure` | 비정상 종료 시 | 정상 종료될 수 있는 배치 작업, 테스트 |
| `always` | 항상 | 상시 구동 서비스 |
| `unless-stopped` | 사용자가 수동 중지(`docker stop`)한 경우엔 재시작 안 함 | stop이 아닌 경우는 `always`와 동일 |

두 정책 모두 다음 경우에 재시작한다.

- 메인 프로세스(PID 1)가 비정상 종료 — OOM, crash, SIGKILL
- Docker 데몬 재시작
- 서버 재부팅

차이는 하나다. **`always`는 내가 일부러 멈춰도 서버 재부팅 시 다시 살아나고, `unless-stopped`는 멈춘 상태를 기억한다.**

여기서 PID 1이 또 나온다. [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 본 대로 `CMD`를 잘못 쓰면 PID 1이 셸이 되고, 애플리케이션이 죽어도 셸은 살아 있어 **컨테이너가 안 죽으므로 재시작 정책이 발동하지 않는다.** 정책을 걸어 뒀는데 복구가 안 되는 상황이 여기서 나온다.

### healthcheck

주기적으로 상태를 확인해 `healthy` / `unhealthy`로 표시한다.

```yaml
services:
  db:
    image: postgres:9.6.1
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s       # 체크 주기
      timeout: 5s         # 명령 제한 시간
      retries: 5          # 연속 실패 허용 횟수
      start_period: 10s   # 초기 기동 유예 시간
```

{: .prompt-warning }
> Compose의 healthcheck는 **상태를 표시할 뿐 종료나 복구를 하지 않는다.** 쿠버네티스의 probe(liveness/readiness)는 재시작과 트래픽 차단까지 한다. 이름이 비슷해서 같은 것으로 오해하기 쉬운 지점이다.

`start_period`가 실무에서 중요하다. DB나 JVM처럼 기동에 시간이 걸리는 서비스는 이 유예가 없으면 뜨는 도중에 `unhealthy` 판정을 받는다.

### depends_on — 기동 순서

```yaml
services:
  db:
    image: postgres:9.6.1
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s

  backend:
    image: my-backend
    depends_on:
      db:
        condition: service_healthy
```

**`condition: service_healthy`가 있고 없고가 크게 다르다.**

- `depends_on: [db]`만 쓰면 **컨테이너가 시작된 것**까지만 보장한다. Postgres 프로세스가 아직 초기화 중이어도 백엔드가 뜬다
- `condition: service_healthy`를 붙이면 **healthcheck가 통과할 때까지** 기다린다

그래서 `depends_on`은 healthcheck와 짝으로 써야 의미가 있다. 그렇지 않으면 백엔드가 DB 연결 실패로 죽고, `restart` 정책으로 재시도하다가 우연히 성공하는 식이 된다.

### 환경변수 주입

**방법 A — `environment`**

```yaml
services:
  web:
    image: nginx
    environment:
      APP_ENV: production       # Key-Value 딕셔너리 (가독성이 좋다)
      PORT: 8080
```

```yaml
    environment:
      - APP_ENV=production      # List 형태
      - PORT=8080
```

**방법 B — `env_file`**

```text
# env.dev
DB_HOST=localhost
DB_USER=admin
DB_PASS=secret123
```

```yaml
services:
  backend:
    image: node:18
    env_file:
      - env.dev
```

**방법 C — `.env` 파일 + 변수 치환**

```text
# .env
PORT=3000
DB_PASSWORD=my_secure_password
```

```yaml
services:
  web:
    image: nginx
    ports:
      - "${PORT}:80"
    environment:
      DATABASE_PASS: ${DB_PASSWORD}
```

**방법 D — 실행 시 지정**

```bash
docker compose --env-file .env.production up -d
docker compose --env-file config/my.env up -d
```

`.env`는 기본으로 자동 로딩되고, `--env-file`로 다른 파일을 지정할 수 있다. 환경별로 파일을 나눠 두는 방식이 흔하다.

### 이미지 빌드 인자

```yaml
services:
  app:
    build:
      context: ./app
      dockerfile: Dockerfile.prod
      args:
        APP_ENV: prod
    ports:
      - "8080:8080"
```

```dockerfile
# Dockerfile.prod
FROM eclipse-temurin:17-jre
ARG APP_ENV
ENV APP_ENV=$APP_ENV
```

`docker build --build-arg APP_ENV=prod`에 해당한다. [1일차 ③](/posts/skala-container-day1-dockerfile/)에서 본 `ARG`/`ENV` 구분이 그대로 적용된다.

## 네트워크

### 서비스 이름으로 호출한다

```yaml
services:
  frontend:
    build:
      context: ./frontend
    ports:
      - "8080:80"
  backend:
    build:
      context: ./backend
    expose:
      - 8080
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
    restart: always
```

호출 경로는 이렇게 된다.

```text
[ Browser ]
    │ http://localhost:8080
    ▼
[ Frontend 컨테이너 ]
    │ http://backend:8080
    ▼
[ Backend 컨테이너 ]
    │ jdbc:postgresql://db:5432/postgres
    ▼
[ DB 컨테이너 ]
```

브라우저는 `localhost:8080`으로 붙지만, **컨테이너끼리는 서비스 이름과 컨테이너 내부 포트**로 붙는다. `localhost`로는 서로를 부를 수 없다. 각자 다른 네트워크 네임스페이스를 갖기 때문이다([2일차 ⑦](/posts/skala-container-day2-kernel/)).

컨테이너 IP로도 호출은 되지만 **컨테이너를 삭제하거나 재생성하면 IP가 바뀌므로** 서비스 이름을 쓰는 것이 권장된다.

### 외부 노출

```yaml
# 1. ports — 호스트 포트에 공개 (가장 일반적)
ports:
  - "8080:80"            # 0.0.0.0:8080 → container:80

# 2. 특정 IP에만 바인딩 (로컬 전용)
ports:
  - "127.0.0.1:8080:80"  # 같은 호스트에서만 접근 가능
```

두 번째가 유용하다. 외부 PC의 접근을 막고 로컬에서만 열어 둘 때 쓴다.

### 외부 차단

```yaml
# 1. ports 미지정 → 외부 노출 없음
services:
  db:
    image: postgres
    # ports 없음 — 같은 네트워크의 다른 서비스만 db:5432로 접근

# 2. expose — 내부 서비스에만 알리기
services:
  backend:
    image: my-backend
    expose:
      - "8080"
```

`expose`는 [1일차 ③](/posts/skala-container-day1-dockerfile/)의 `EXPOSE`처럼 **문서화 성격**이다. 외부 노출은 되지 않고, 같은 네트워크의 컨테이너가 접근할 포트를 명시할 뿐이다.

### 네트워크 분리

가장 강한 방법이다.

```yaml
services:
  frontend:
    image: my-frontend
    ports:
      - "8080:80"
    networks:
      - public

  backend:
    image: my-backend
    networks:
      - public
      - private

  db:
    image: postgres:15
    networks:
      - private

networks:
  public:
  private:
    internal: true      # 컨테이너 → 외부로 나가는 것을 차단
```

결과는 이렇게 된다.

- 외부 노출은 `frontend`만 가능
- `frontend`는 `backend`와 통신 가능, **`db`와는 통신 불가**
- `backend`는 `db`와 통신 가능

`internal: true`는 기본이 `false`이며, 그 네트워크에 속한 컨테이너가 **외부로 나가는 것**을 막는다.

구조를 그리면 이렇다.

```text
   frontend              backend                  db
  NET Namespace        NET Namespace         NET Namespace
   172.20.0.2       172.20.0.3  172.30.0.3    172.30.0.2
      eth0            eth0        eth1           eth0
       │               │           │              │
  veth-front      veth-back1  veth-back2      veth-db
       │               │           │              │
  ┌────┴───────────────┴───┐   ┌───┴──────────────┴───┐
  │  Public bridge network │   │ Private bridge network│
  └────────┬───────────────┘   └───────────────────────┘
       8080 → 80
     host: eth0
```

**`backend`만 인터페이스가 두 개(`eth0`, `eth1`)다.** 두 네트워크에 동시에 속하기 때문이다. `db`는 private에만 있으므로 외부에서 닿을 경로 자체가 없다.

기존 네트워크를 쓰려면 `external: true`를 준다.

```bash
docker network create my-network
```

```yaml
networks:
  my-network:
    external: true
```

## 종합 실습

교재의 마지막 실습이다. `01.start`를 확장해 db·backend·frontend를 완성 구조로 만든다.

### 요구사항

**1. 네트워크를 public과 private으로 분리**

- `networks.private.internal: true`로 private 전용 브리지 구성
- `db`는 private에만, `backend`는 public과 private 모두

**2. db 서비스**

- `volumes` 추가로 재실행 시 데이터 유지: `./db_data:/var/lib/postgresql/data`
- private 네트워크에만 연결
- healthcheck: `["CMD", "pg_isready", "-U", "postgres"]`, 10초 주기, 대기 5초, 5회 반복, 시작 10초 뒤부터

**3. backend 서비스**

- `./backend`의 `Dockerfile.backend`로 빌드
- 포트: 외부 `9090` → 컨테이너 `8080`
- 네트워크: public + private
- 재시작 정책은 "죽으면 다시 살아나되, 내가 일부러 멈추면 그대로 멈춤"
- healthcheck: `["CMD", "wget", "-qO-", "http://localhost:8080/health"]`
- **DB가 healthy가 된 이후에 실행**

**4. frontend 서비스**

- `./frontend`의 `Dockerfile.frontend`로 빌드
- 포트: 외부 `8080` → 컨테이너 `80`
- 네트워크: public
- `volumes`: `./nginx.conf:/etc/nginx/conf.d/default.conf:ro`
- **backend가 healthy가 된 이후에 실행**

### 완성

```yaml
# 참고: 01.answer-code/09.docker-compose/02.services/docker-compose.yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
    restart: always
    volumes:
      - ./db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - private

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.backend
    ports:
      - 9090:8080
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
    networks:
      - public
      - private

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.frontend
    ports:
      - 8080:80
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - public

networks:
  public:
    driver: bridge
  private:
    driver: bridge
    internal: true
```

```text
시작 순서: db (healthy) → backend (healthy) → frontend

네트워크:
  db       ←→ private
  backend  ←→ private + public
  frontend ←→ public
```

`db`의 `volumes` 뒤에 `:ro`가 없고 `frontend`의 `nginx.conf`에는 있다. **읽기 전용 마운트**다. 설정 파일을 컨테이너가 고치지 못하게 막는다.

nginx 설정은 이렇게 된다.

```nginx
# 참고: 01.answer-code/09.docker-compose/02.services/nginx.conf
server {
    listen 80;

    location / {
        root  /usr/share/nginx/html;
        index index.html;
    }

    # 백엔드 API 프록시: /api/* → backend:8080/*
    location /api/ {
        proxy_pass         http://backend:8080/;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

| 지시어 | 의미 |
|---|---|
| `proxy_pass` | 전달할 대상 |
| `$host` | 요청을 받은 도메인 주소 (예: `example.com`) |
| `$remote_addr` | 클라이언트 IP 주소 (예: `12.45.67.89`) |

{: .prompt-info }
> [1일차 ⑤](/posts/skala-container-day1-webservice/)의 nginx 설정과 달리 `resolver`와 변수 `proxy_pass`가 없다. 이 구성은 `depends_on`으로 backend가 먼저 healthy가 된 뒤에 frontend가 뜨므로 기동 시점 이름 해석이 성공한다. 다만 backend를 단독 재시작해 IP가 바뀌면 frontend도 재시작해야 한다. 운영에서는 1일차 방식이 더 안전하다.

### 검증

{% raw %}
```bash
docker compose up --build -d
docker compose ps
docker compose logs -f backend

# 헬스체크 상태 확인
docker inspect <container_name> --format '{{json .State.Health}}'
```
{% endraw %}

네트워크가 분리됐는지 확인한다.

```bash
docker network ls
```

```text
NETWORK ID     NAME                DRIVER   SCOPE
549f521bd787   03anwsers_private   bridge   local
55b8770bc0b4   03anwsers_public    bridge   local
f9040b5d647b   bridge              bridge   local
bf307fd8d9c7   host                host     local
3bd1eb6f2217   none                null     local
```

앞에 붙은 `03anwsers`가 프로젝트 이름(디렉터리 이름)이다.

```bash
docker network inspect 03anwsers_public     # backend의 IP 확인
docker network inspect 03anwsers_private    # backend의 IP 확인
```

**backend가 양쪽에서 서로 다른 IP로 잡히는 것**을 확인한다. 인터페이스가 둘이라는 앞의 그림이 여기서 증명된다.

브라우저로 확인한다.

```text
localhost:8080
localhost:8080/health
localhost:8080/users
```

{: .prompt-warning }
> backend의 healthcheck는 컨테이너 안에서 `wget`을 실행한다. `Dockerfile.backend`는 `python:3.11-slim` 위에 `fastapi`, `uvicorn`, `psycopg2-binary`만 설치하고 `wget`이나 `curl`을 설치하지 않는다. 베이스 이미지에 해당 바이너리가 없으면 healthcheck가 계속 실패하고, `depends_on: condition: service_healthy` 때문에 **frontend가 영영 뜨지 않는다.** `docker compose ps`에서 backend가 `unhealthy`로 머물면 이 지점을 먼저 확인한다. 필요하면 Dockerfile에 설치를 추가하거나, 파이썬으로 대체한다.
>
> ```dockerfile
> RUN apt-get update && apt-get install -y --no-install-recommends curl \
>     && rm -rf /var/lib/apt/lists/*
> ```
>
> 참고로 저장소의 `guide.md`는 본문에서 `curl -f http://localhost:8080/health`라고 적고 있어 실제 yaml(`wget -qO-`)과 다르다.

## 종합 실습 — 자신의 서비스로

과정의 마지막 과제는 자신의 API 서버(Spring 또는 FastAPI)와 프런트엔드, 데이터베이스를 Compose로 구조화하는 것이다. 직접 만든 코드가 없으면 [1일차 ⑤](/posts/skala-container-day1-webservice/)에서 다룬 `00.sample-container`의 코드를 그대로 쓸 수 있다.

1일차에 `docker run` 세 줄로 했던 것을 yaml 하나로 옮기면 이런 형태가 된다.

```yaml
services:
  mariadb:
    image: mariadb:latest
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: skala
      MYSQL_USER: user
      MYSQL_PASSWORD: password
    volumes:
      - ./db-data:/var/lib/mysql
    networks:
      - private

  spring-backend:
    build:
      context: ./01.spring-backend-v1.0
    environment:
      SPRING_PROFILES_ACTIVE: local-mariadb
    ports:
      - 8080:8080
    depends_on:
      mariadb:
        condition: service_healthy
    networks:
      - public
      - private

  frontend:
    build:
      context: ./03.frontend
    ports:
      - 9090:80
    networks:
      - public

networks:
  public:
  private:
    internal: true
```

바뀐 것이 눈에 보인다. `--network skala`가 `networks:`로, `-e`가 `environment:`로, `-p`가 `ports:`로, `-v`가 `volumes:`로 옮겨졌다. **손으로 만들던 네트워크는 아예 사라졌다.**

{: .prompt-info }
> `depends_on: condition: service_healthy`를 쓰려면 `mariadb` 서비스에도 healthcheck를 정의해야 한다. 정의하지 않으면 그 조건이 성립하지 않는다. MariaDB는 `healthcheck.sh` 또는 `mariadb-admin ping`을 쓴다.

## 2일 과정을 마치며

이틀 동안 같은 대상을 두 번 봤다. 1일차에는 `docker run`, `docker build`, `-v`, `-p`를 썼고, 2일차에는 그 옵션들이 `config.json`의 어느 항목으로 번역되는지를 봤다.

세 지점이 특히 기억에 남는다.

**`CMD` 한 줄과 PID 1.** Spring Boot의 `server.shutdown: graceful` 설정 두 줄은 `CMD`가 올바를 때만 동작한다. 애플리케이션 코드를 아무리 잘 써도 컨테이너 정의가 틀리면 배포마다 요청이 유실된다. 애플리케이션과 인프라가 분리된 관심사가 아니라는 것을 가장 명확히 보여 준 예였다.

**`namespaces`에서 한 줄 지우기.** 컨테이너의 격리가 특별한 기술이 아니라 `config.json`의 배열 항목이라는 것을, 지워 보는 것보다 확실하게 알려 주는 방법은 없었다. 실습 순서를 이렇게 짠 이유가 있다고 본다.

**커스텀 브리지의 DNS.** 1일차에 이유 없이 따라 친 `docker network create` 한 줄이, 2일차 네트워크 장에 가서야 `127.0.0.11`이라는 구체적인 주소로 설명됐다. 그 사이에 nginx의 `resolver` 설정과 `jdbc:mariadb://mariadb:3306`이 전부 같은 이야기였다는 것이 정리됐다.

2주 뒤 쿠버네티스 과정에서는 이 구조가 다시 등장한다. Pod가 컨테이너의 묶음이고, CNI가 Docker 네트워크를 대체하며, probe가 healthcheck를 대체한다. 이번 과정의 내용이 그때 어디에 대응하는지 확인하는 것이 다음 목표다.

## 이 장에서 남는 것

- Compose는 **custom bridge를 자동 생성**하고 서비스 이름을 DNS에 등록한다. `docker network create`가 사라진다.
- `depends_on`은 **healthcheck와 짝으로** 써야 의미가 있다. `condition: service_healthy`가 없으면 "컨테이너 시작"까지만 보장한다.
- `internal: true`로 나눈 private 네트워크는 DB를 외부에서 **닿을 경로 자체가 없게** 만든다.
- healthcheck는 상태 표시일 뿐 복구하지 않는다. 복구는 `restart` 정책이, 그리고 쿠버네티스에서는 probe가 한다.
