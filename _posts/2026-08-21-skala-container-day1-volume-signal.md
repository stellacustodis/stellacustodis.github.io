---
title: "[SKALA] 컨테이너 1일차 ④ — 볼륨과 PID 1, CMD 한 줄이 만드는 차이"
date: 2026-08-21 20:40:00 +0900
permalink: /posts/skala-container-day1-volume-signal/
categories:
  - SKALA
  - Infra
tags: [skala, docker, volume, bind-mount, pid1, sigterm, graceful-shutdown]
description: "Named Volume·Bind Mount·Anonymous Volume의 차이를 inspect로 확인하고, CMD 작성 방식 세 가지가 SIGTERM 전달에 어떤 차이를 만드는지 실습으로 따라간다. Graceful shutdown이 깨지는 지점을 짚는다."
---

## 컨테이너는 일회성이다

교재의 전제가 명확하다.

> 컨테이너는 언제든 삭제될 수 있는 **일회성(Ephemeral)** 환경

[1일차 ①](/posts/skala-container-day1-virtualization/)에서 MariaDB를 띄우고 테이블을 만들었다. 그 컨테이너를 지우면 테이블도 사라진다. 컨테이너가 종료 후 재실행되더라도 데이터를 유지하려면 **바깥에 있는 무언가**에 연결해야 한다.

## 볼륨 세 가지

| 타입 | 설명 |
|---|---|
| **Named Volume** | 컨테이너 런타임이 관리하는 **이름 있는** 볼륨 |
| **Bind Mount** | 호스트의 디렉터리를 컨테이너 내부 디렉터리에 마운트 |
| **Anonymous Volume** | 이름 없이 임시 생성. Dockerfile의 `VOLUME` 명령으로 생성 |

말로는 구분이 잘 안 되므로 `docker inspect`로 실제 차이를 본다.

### Named Volume

```bash
docker run -it --name busybox -v demo:/usr/share busybox
```

컨테이너 안에서 마운트를 확인한다.

```text
/ # mount | grep /usr/share
/dev/vda1 on /usr/share type ext4 (rw,relatime,discard)
```

`inspect`로 보면 이렇게 나온다.

{% raw %}
```bash
docker inspect busybox --format '{{json .Mounts}}' | jq
```
{% endraw %}

```json
[
  {
    "Type": "volume",
    "Name": "demo",
    "Source": "/var/lib/docker/volumes/demo/_data",
    "Destination": "/usr/share",
    "Driver": "local",
    "Mode": "z",
    "RW": true
  }
]
```

`Source`가 `/var/lib/docker/volumes/demo/_data`다. **Docker가 관리하는 영역**에 만들어졌고, 사용자는 `demo`라는 이름으로만 참조한다. `Driver`가 `local`인데, 여기에 NFS나 AWS EFS 같은 다른 드라이버가 올 수 있다.

### Bind Mount

```bash
docker run -it --name busybox -v $(pwd):/usr/share busybox
```

```text
/ # mount | grep /usr/share
/run/host_mark/Users on /usr/share type fakeowner (rw,nosuid,nodev,relatime,fakeowner)
/ # touch /usr/share/bind-mount.txt
```

```json
[
  {
    "Type": "bind",
    "Source": "/Users/himang10/mydev/skala/.../04.volumes",
    "Destination": "/usr/share",
    "RW": true,
    "Propagation": "rprivate"
  }
]
```

`Type`이 `bind`이고 `Source`가 **호스트의 실제 경로**다. 컨테이너 안에서 만든 `bind-mount.txt`가 호스트에서도 바로 보인다.

```bash
ls bind-mount.txt   # 호스트에서 확인된다
```

### 실습: 파일이 양방향으로 보이는지 확인

```bash
mkdir -p ./data
echo "hello docker world" > ./data/info.txt

docker run -it --name hello -v $(pwd)/data:/app/data ubuntu:latest /bin/bash
```

```text
# cd /app/data
# ls
info.txt
# cat info.txt
hello docker world
# touch add.txt
# exit
```

```bash
ls ./data/
# add.txt  info.txt
```

호스트에서 만든 파일이 컨테이너에서 보이고, 컨테이너에서 만든 파일이 호스트에 남는다.

{: .prompt-warning }
> 교재가 `$(pwd)`와 `${PWD}`를 구분해 두라고 적는다. Windows 환경에서 `$(pwd)`가 동작하지 않으면 `${PWD}`를 쓴다. 그리고 **경로에 공백이 있으면 따옴표로 감싸야** 한다.

### MariaDB에 볼륨 붙이기

앞 편에서 띄운 DB를 이번에는 데이터가 남도록 다시 띄운다.

```bash
mkdir db-data

docker run -d \
  --name mariadb \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=skala \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=password \
  --network skala \
  -p 3306:3306 \
  -v $(pwd)/db-data:/var/lib/mysql \
  mariadb:latest
```

호스트의 `db-data`를 보면 MariaDB의 실제 데이터 파일이 들어와 있다.

```text
aria_log.00000001   ib_logfile0   ibdata1   mysql   skala   sys   undo001
aria_log_control    ib_buffer_pool  ibtmp1  performance_schema  tc.log
```

`/var/lib/mysql`이 MariaDB의 데이터 디렉터리이므로 여기를 바깥으로 빼면 컨테이너를 지워도 DB가 남는다.

{: .prompt-info }
> 실습 저장소의 `run-mariadb.sh`는 `-v $(pwd)/db-data:/db-data`로 되어 있어 **데이터 디렉터리가 아닌 곳**에 마운트된다. 데이터를 실제로 보존하려면 교재 본문처럼 `/var/lib/mysql`에 걸어야 한다.

## PID 1과 종료 신호

여기서부터가 이 장의 후반부이고, 1일차에서 가장 실무적인 내용이다.

교재가 제시하는 증상은 세 가지다.

1. 컨테이너가 즉시 종료되지 않고 멈춰 있다 강제 종료되는 문제
2. 트래픽을 처리하는 중에 Graceful shutdown 되지 않고 KILL 되는 현상
3. 이로 인한 트래픽 유실과 배포 속도 저하

그리고 원인을 한 줄로 못박는다.

> 이러한 문제는 **`CMD` 한 줄 잘못 사용하는 경우** 발생

### 왜 PID 1이 문제인가

`docker stop`은 컨테이너의 **PID 1 프로세스에게 SIGTERM을 보낸다.** 그 프로세스가 신호를 받아 정리하고 끝내면 정상 종료다. 일정 시간(기본 10초, 쿠버네티스는 보통 30초) 안에 안 끝나면 SIGKILL로 강제 종료된다.

문제는 **PID 1이 누구냐**에 따라 신호가 애플리케이션에 도달할 수도, 안 할 수도 있다는 것이다.

### 세 가지 CMD 작성 방식

| 명칭 | 작성 | 특징 |
|---|---|---|
| **Exec Form** (직접 실행) | `CMD ["python3", "webserver.py"]` | 셸 없이 앱이 직접 PID 1로 실행. **강력 권고** |
| **Shell Form** (포크 실행) | `CMD ["/bin/sh", "-c", "python3 webserver.py"]`<br>또는 `CMD python3 webserver.py` | `/bin/sh`가 PID 1, 앱은 자식 프로세스. **비권고** |
| **Shell with Exec** (치환 실행) | `CMD ["/bin/sh", "-c", "exec python3 webserver.py"]` | 셸이 환경변수를 처리한 뒤 `exec`로 자신을 앱으로 치환. **조건부 권고** |

### 실습 준비: SIGTERM 핸들러 등록

확인하려면 앱이 SIGTERM을 받았을 때 티를 내야 한다. 실습 코드의 `webserver.py`에 핸들러가 들어 있다.

```python
# 참고: 01.answer-code/04.volumes/webserver.py
import signal

def run_server(port=8080):
    server_address = ('', port)
    httpd = HTTPServer(server_address, SimpleHTTPRequestHandler)

    def handle_sigterm(signum, frame):
        print(f'[{datetime.now():%Y-%m-%d %H:%M:%S}] SIGTERM 신호 수신')
        time.sleep(1)
        print(f'[{datetime.now():%Y-%m-%d %H:%M:%S}] SIGTERM 처리 종료')
        httpd.server_close()
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_sigterm)

    print(f'Starting server on port {port}...')
    httpd.serve_forever()
```

### 실습 1 — Exec Form

```dockerfile
CMD ["python3", "webserver.py"]
```

컨테이너 안에서 프로세스 트리를 본다.

```text
# ps -ef
UID   PID  PPID  C STIME TTY      TIME CMD
root    1     0  0 23:34 ?    00:00:00 python3 webserver.py
root    7     0  0 23:35 pts/0 00:00:00 /bin/bash
```

**`python3`가 PID 1이다.** 이 상태에서 다른 터미널로 종료해 본다.

```bash
# terminal 1
docker logs -f linux-container

# terminal 2
docker stop linux-container
```

```text
Starting server on port 8080...
[2026-08-19 05:11:11] SIGTERM 신호 수신
[2026-08-19 05:11:12] SIGTERM 처리 종료
```

신호가 즉시 도달했다.

### 실습 2 — Shell Form

```dockerfile
CMD ["/bin/sh", "-c", "python3 -u webserver.py"]
```

```text
# ps -ef
UID   PID  PPID  C STIME TTY      TIME CMD
root    1     0  0 23:27 ?    00:00:00 /bin/sh -c python3 webserver.py
root    7     1  0 23:27 ?    00:00:00 python3 webserver.py
```

**PID 1이 `/bin/sh`가 되고 `python3`는 PID 7의 자식**이 됐다. 이 상태에서 `docker stop`을 하면 이렇게 된다.

```text
Starting server on port 8080...
# 아래 로그가 나오지 않는다. 대기 후 바로 SIGKILL
```

`/bin/sh`는 SIGTERM을 받아도 자식에게 전달하지 않는다. 애플리케이션은 신호를 못 받고 기다리다가 타임아웃 후 SIGKILL로 죽는다. **`docker stop`에서 10초, 쿠버네티스에서는 30초를 매번 그냥 버린다.**

교재의 문장이 이 실습의 요지다.

> Spring Boot와 FastAPI 등 프레임워크는 SIGTERM 수신 시 Graceful shutdown을 실행한다. 자원 해지, 연결 해지, 수신 처리 중 요청 처리 완료 등.

프레임워크가 우아하게 종료할 준비를 다 해 놨는데 **신호가 도달하지 않아서 무용지물이 되는 것**이다.

### 실습 3 — Shell with Exec

```dockerfile
CMD ["/bin/sh", "-c", "exec python3 -u webserver.py"]
```

```text
# ps -ef
UID   PID  PPID  C STIME TTY      TIME CMD
root    1     0  0 23:34 ?    00:00:00 python3 webserver.py
```

`exec`를 붙이자 **PID 1이 다시 `python3`가 됐다.**

```text
[2026-08-19 05:11:11] SIGTERM 신호 수신
[2026-08-19 05:11:12] SIGTERM 처리 종료
```

신호가 정상 도달한다.

### fork와 exec

교재가 이 차이를 한 문장으로 정리한다.

> **fork는 자기와 닮은 아이가 태어남. exec는 에어리언.**

`fork`는 자신을 복제해 자식 프로세스를 만든다. 부모는 남는다. `exec`는 **현재 프로세스의 메모리 이미지를 통째로 새 프로그램으로 갈아엎는다.** 프로세스 ID는 유지되고 내용물만 바뀐다.

그래서 `sh -c "exec python3 ..."`는 셸이 환경변수 확장 같은 일을 먼저 처리한 뒤, 자기 자신을 `python3`로 치환한다. 셸은 사라지고 PID 1 자리에 `python3`가 앉는다.

### 그러면 언제 Shell with Exec를 쓰나

Exec Form이 항상 최선이면 세 번째 형식은 필요 없을 것이다. 필요한 경우가 있다. **환경변수를 확장해야 할 때**다.

실습 저장소의 Spring Boot Dockerfile이 정확히 그 사례다.

```dockerfile
# 참고: 00.sample-container/01.spring-backend-v1.0/Dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
EXPOSE 8080
EXPOSE 8081
ENV JAVA_OPTS="-Xms256m -Xmx512m"
ADD ./target/*.jar app.jar
CMD ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
```

`$JAVA_OPTS`를 확장하려면 셸이 필요하다. Exec Form으로 쓰면 `$JAVA_OPTS`가 문자열 그대로 전달된다. 그래서 셸을 거치되 `exec`로 치환한다. **세 번째 형식이 "조건부 권고"인 이유가 이것이다.**

그리고 이 애플리케이션의 설정을 보면 왜 이것이 중요한지가 분명해진다.

```yaml
# 참고: 00.sample-container/01.spring-backend-v1.0/src/main/resources/application.yaml
spring:
  lifecycle:
    timeout-per-shutdown-phase: 20s   # graceful shutdown 최대 대기 시간
server:
  shutdown: graceful                  # SIGTERM 수신 시 진행 중인 요청을 마무리하고 종료
```

애플리케이션은 이미 Graceful shutdown을 켜 뒀다. **`CMD`에서 `exec`를 빠뜨리면 이 설정 두 줄이 전부 죽는다.** 코드는 멀쩡한데 배포할 때마다 요청이 유실된다.

## 터미널을 연다는 것의 의미

`-it` 옵션의 정체를 여기서 정리한다.

```bash
docker exec -it container /bin/bash
```

| 옵션 | 의미 |
|---|---|
| `-i` (Keep STDIN open) | 로컬 터미널 셸의 STDIN을 컨테이너 내부 프로세스의 STDIN으로 연결. 없으면 입력이 전달되지 않는다 |
| `-t` (Allocate a pseudo-TTY) | 컨테이너 내부에 가상 터미널(pty)을 생성 |

터미널을 연다는 것은 결국 **STDIN·STDOUT과 연결된 셸 프로세스를 실행한다**는 뜻이다. 그 셸이 명령을 받으면 `fork` → `exec` → `wait` 순으로 처리한다. 앞에서 본 fork/exec가 여기서도 그대로 나온다.

## 실습: 볼륨으로 파이썬 웹서버 띄우기

볼륨과 PID 1을 한꺼번에 확인하는 실습이다. 먼저 볼륨으로 코드를 밀어 넣어 수동 실행해 본다.

```bash
mkdir -p ./mydata

docker run -d \
  --name linux-container \
  -p 8080:8080 \
  -p 8888:80 \
  -v $(pwd)/mydata:/mydata \
  linux-container:1.0
```

터미널 두 개를 나란히 놓는다.

```bash
# terminal 1 — 컨테이너 내부
docker exec -it linux-container /bin/bash
# cd mydata && ls        ← 아무것도 없다

# terminal 2 — 호스트
cp webserver.py ./mydata
ls ./mydata               # webserver.py
```

다시 터미널 1로 돌아오면 파일이 보인다. 볼륨이 살아 있다는 확인이다.

```text
# apt-get update && apt-get install -y python3 python3-pip
# python3 /mydata/webserver.py
Starting server on port 8080...
```

그다음 이 수동 과정을 Dockerfile로 옮긴다.

```dockerfile
# 참고: 01.answer-code/04.volumes/Dockerfile.python
RUN apt-get install -y python3 python3-pip

WORKDIR /app
COPY webserver.py .

CMD ["python3", "webserver.py"]
```

```bash
docker build --tag linux-container:1.0 .
docker run -d --name linux-container -p 8080:8080 linux-container:1.0
```

**볼륨으로 밀어 넣던 것을 이미지 안에 넣는 것**으로 바뀌었다. 어느 쪽이 맞는지는 대상에 따라 다르다.

| 대상 | 넣는 곳 | 이유 |
|---|---|---|
| 애플리케이션 코드 | 이미지 (`COPY`) | 버전과 함께 고정되어야 한다 |
| 데이터베이스 데이터 | 볼륨 | 컨테이너보다 오래 살아야 한다 |
| 설정 파일 | 볼륨 또는 환경변수 | 환경마다 달라야 한다 |
| 로그 | 볼륨 또는 표준 출력 | 컨테이너가 사라져도 남아야 한다 |

## 수업 중 나온 질문

### Graceful shutdown이 정확히 뭔가

**종료 신호를 받고 즉시 죽지 않고, 하던 일을 마무리한 뒤 끝내는 것**이다.
서버 애플리케이션에서는 보통 이 순서를 밟는다.

1. SIGTERM을 받는다
2. **새 요청 받기를 멈춘다** — 리스닝 소켓을 닫거나 로드밸런서에서 빠진다
3. **처리 중인 요청을 끝까지 응답한다**
4. DB 커넥션 풀, 파일 핸들, 큐 컨슈머를 정리한다
5. 프로세스를 종료한다

반대가 강제 종료다. SIGKILL은 프로세스에게 전달조차 되지 않고 커널이 즉시 죽인다.
그 순간 처리 중이던 요청은 응답 없이 끊기고, 클라이언트는 오류를 본다.

실제로 얼마나 차이가 나는지 보면 이렇다. 배포 때 컨테이너를 한 대씩 교체한다고 하자.

| | 진행 중이던 요청 | 사용자가 보는 것 |
|---|---|---|
| Graceful | 응답까지 마치고 종료 | 아무 일 없음 |
| 강제 종료 | 중간에 끊김 | 502 / 연결 끊김 |

배포가 하루에 여러 번이고 트래픽이 있으면 이 차이가 매번 쌓인다.

Spring Boot는 설정 두 줄로 켠다.

```yaml
server:
  shutdown: graceful                      # SIGTERM 받으면 진행 중 요청을 마무리
spring:
  lifecycle:
    timeout-per-shutdown-phase: 20s       # 최대 20초까지 기다린다
```

FastAPI/uvicorn은 기본으로 처리 중인 요청을 기다리고, `lifespan`의 shutdown 훅에서 정리한다.

**그런데 이 설정은 SIGTERM이 애플리케이션에 도달해야만 의미가 있다.**
이 장의 앞부분에서 본 대로, `CMD`를 Shell Form으로 쓰면 PID 1이 셸이 되고
신호가 거기서 멈춘다. 프레임워크는 우아하게 종료할 준비를 다 해 놓고
**신호를 못 받아서** 유예 시간이 지난 뒤 SIGKILL로 죽는다.

> 애플리케이션 설정과 컨테이너 정의는 분리된 관심사가 아니다.
> `CMD` 한 줄이 틀리면 `server.shutdown: graceful` 두 줄이 통째로 무용지물이 된다.

유예 시간도 알아 두면 좋다. `docker stop`은 기본 **10초**, 쿠버네티스의
`terminationGracePeriodSeconds`는 기본 **30초**를 기다린 뒤 SIGKILL을 보낸다.
애플리케이션의 종료 타임아웃은 이 값보다 **짧게** 잡아야 한다. 길게 잡으면
정리를 끝내기 전에 강제 종료된다.

## 이 장에서 남는 것

- Named Volume은 Docker가 관리하는 영역에, Bind Mount는 호스트 경로에 연결된다. `inspect`의 `Type`과 `Source`로 구분한다.
- `docker stop`은 **PID 1에게** SIGTERM을 보낸다. PID 1이 셸이면 신호가 앱까지 가지 않는다.
- Exec Form이 기본이고, 환경변수 확장이 필요하면 `sh -c "exec ..."`를 쓴다.
- 프레임워크의 Graceful shutdown 설정은 **`CMD`가 올바를 때만** 동작한다.

다음 편에서는 지금까지 만든 조각으로 프런트엔드·백엔드·DB 세 컨테이너를 실제로 이어 본다.
