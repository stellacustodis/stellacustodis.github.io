---
title: "[SKALA] 컨테이너 2일차 ⑧ — dockerd에서 runc까지, 그리고 직접 호출해 보기"
date: 2026-08-24 20:10:00 +0900
permalink: /posts/skala-container-day2-runtime-runc/
categories:
  - SKALA
  - Infra
tags: [skala, docker, runc, containerd, oci, shim, namespace]
description: "docker run 한 줄과 실제 프로세스 사이에 있는 dockerd·containerd·shim·runc의 역할을 나누고, OCI 표준이 무엇을 규정하는지 정리한다. runc를 손으로 호출해 네임스페이스를 하나씩 꺼 보는 실습까지 따라간다."
---

## `docker run`과 프로세스 사이

[앞 편](/posts/skala-container-day2-kernel/)에서 컨테이너가 커널 기능의 조합이라는 것을 봤다. 그러면 그 기능을 실제로 호출하는 것은 누구인가. `docker run` 한 줄과 리눅스 프로세스 사이에는 네 개의 계층이 있다.

```text
[ dockerd ]
     ↓  docker run 파라미터
[ containerd ]
     ↓  config.json, rootfs 경로
[ containerd-shim ]
     ↓  fork + exec (runc create ...)
[ runc ] ──┐
   │        └─→ [ namespace 생성 ]
   │            [ cgroup 설정 ]
   │            [ rootfs pivot ]
   ↓  fork + exec
[ init process (PID 1) ]   ← 컨테이너 내부 최상위 프로세스
     ├── [ user process 1 ]
     └── [ user process 2 ]
```

계층마다 하는 일이 다르다.

### dockerd (Docker Engine)

Docker의 진입점이면서 전체 운영을 관리한다. 이미지 실행 요청을 받으면 **containerd 데몬에 책임을 위임**한다.

### containerd

OCI 표준 번들(`config.json` + `rootfs`)을 직접 생성한다.

- OverlayFS 기반으로 rootfs(MergedDir)를 준비
- dockerd로부터 받은 실행 설정을 `config.json`으로 구성
- `containerd-shim`을 fork·exec하고 OCI 번들을 전달

쿠버네티스에서는 kubelet이 dockerd 없이 containerd(또는 CRI-O)와 직접 연동한다. Docker가 빠져도 컨테이너가 도는 이유다.

### containerd-shim

이름 그대로 "끼움쇠"다. podman과 CRI-O에서는 `conmon`이라는 경량 프로세스가 같은 역할을 한다.

- `runc`를 실행한다. 인자는 `config.json`과 rootfs 경로
- init process의 PID를 받아 **감시**하고, I/O 파이프라인을 연결·대기한다 (`docker exec`, `docker logs`가 여기로 붙는다)

shim이 별도로 있는 이유가 중요하다. **`runc`는 컨테이너를 만들고 나면 빠진다.** 컨테이너가 도는 동안 계속 붙어 있는 것은 shim이고, 그래서 dockerd를 재시작해도 컨테이너가 죽지 않는다.

[앞 편](/posts/skala-container-day2-kernel/)의 OOM 시나리오에서 "shim이 PID 1 종료를 감지"한다고 했던 것이 이 감시 역할이다.

### runc

실제로 커널을 부르는 층이다. 계보는 이렇다.

```text
LXC (LinuX Container) → libcontainer → runc (OCI 표준 Reference 구현체)
```

`runc`는 `libcontainer`를 감싼 CLI 도구이고, 하는 일은 다음과 같다.

- namespace 생성, cgroup 설정
- rootfs 마운트 및 교체(`pivot_root`)
- UID/GID 매핑
- Capability, seccomp, AppArmor 적용
- init 프로세스(PID 1) 실행 — `CMD`, `ENTRYPOINT` 기준

{: .prompt-info }
> 이 계층들은 대부분 **Unix Domain Socket(UDS)**으로 통신한다. TCP 소켓(`127.0.0.1:8080`)과 달리 파일 경로(`/var/run/docker.sock`)를 주소로 쓴다. IP 스택과 라우팅을 거치지 않아 빠르고, 소켓이 파일이라 권한으로 통제할 수 있으며, 외부 네트워크에서 접근 자체가 불가능하다. `containerd`는 `/run/containerd/containerd.sock`, CRI-O는 `/run/crio/crio.sock`을 쓴다.

## OCI — 무엇을 표준화했나

이 구조가 도구를 갈아 끼워도 동작하는 이유는 OCI(Open Container Initiative) 표준 때문이다. 세 갈래로 나뉜다.

**1. OCI Image Spec** — 어떤 도구든 이미지를 받아 해석할 수 있는 패키지 규격이다. 이미지 구조, tar 레이어, `manifest.json` 표준. [2일차 ⑥](/posts/skala-container-day2-image-anatomy/)에서 풀어 본 것이 이 규격의 산출물이다.

**2. OCI Runtime Spec** — 컨테이너 실행을 위한 OCI Bundle을 정의한다.

```text
OCI Bundle
├── config.json     ← 어떻게 실행할 것인가
└── rootfs/         ← 무엇을 실행할 것인가
    ├── bin/
    ├── usr/
    ├── lib/
    └── ...
```

**3. OCI Distribution Spec** — 레지스트리에 Push/Pull하기 위한 API 규격이다.

```text
manifest GET → GET /v2/library/nginx/manifests/latest
layer GET    → GET /v2/library/nginx/blobs/sha256:AAA...
```

표준을 지키면 벤더에 묶이지 않는다.

- **로컬 검증**: Docker나 Podman으로 즉시 실행·테스트
- **빌드**: BuildKit, Buildah, Kaniko
- **저장**: Harbor, Docker Hub 등 OCI 레지스트리
- **배포·실행**: docker, 쿠버네티스의 containerd나 CRI-O

`docker build`로 만든 이미지를 Harbor에 올리고 쿠버네티스가 containerd로 실행하는 흐름이 성립하는 근거다.

## 실습: runc를 손으로 호출하기

shim이 하는 일을 사람이 대신 해 본다. 목표는 세 가지 확인이다.

1. namespace와 cgroup을 설정하고
2. `pivot_root`로 rootfs를 바꾼 뒤
3. 그 환경에서 프로세스를 실행한다

### 준비: runc가 든 컨테이너 만들기

컨테이너 안에서 컨테이너를 다루므로 Docker 소켓을 공유하고 `--privileged`로 띄운다.

```dockerfile
# 참고: 01.answer-code/08.runc/Dockerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y curl lsb-release nginx
RUN apt-get install -y python3 python3-pip
RUN apt-get install -y jq vim net-tools lsof tar gzip runc
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY webserver.py .

# Docker CLI 설치
RUN install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    ... && apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

CMD ["python3", "webserver.py"]
```

```bash
# 참고: 01.answer-code/08.runc/run.sh
docker run -d \
  --name runc-test \
  -p 8888:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --group-add 0 \
  --privileged \
  runc-test:1.0 \
  sleep infinity
```

`-v /var/run/docker.sock:/var/run/docker.sock`이 요점이다. 호스트의 Docker 소켓을 컨테이너 안으로 넣어서, 컨테이너 안에서도 `docker` 명령이 **호스트의 데몬**에 붙는다.

{: .prompt-warning }
> `--privileged`와 `docker.sock` 마운트는 실습이라서 쓰는 것이다. 호스트 Docker 소켓을 컨테이너에 넣는다는 것은 그 컨테이너가 호스트의 컨테이너를 전부 조작할 수 있다는 뜻이고, 사실상 호스트 권한을 넘기는 것과 같다. 운영 환경에 그대로 옮기면 안 된다.

```bash
docker exec -it runc-test /bin/bash
runc --version
```

### 1단계: OCI Bundle 만들기

containerd가 하던 일을 손으로 한다.

```bash
mkdir -p ./mybundle/rootfs
cd ./mybundle

# Alpine 이미지의 rootfs 추출
docker export $(docker create alpine:latest) | tar -C rootfs -xf -
ls -al rootfs

# 기본 OCI spec 생성
runc spec

ls
# config.json  rootfs
```

`docker export`가 이미지를 **레이어 없이 통짜 tar로** 내보낸다. [2일차 ⑥](/posts/skala-container-day2-image-anatomy/)의 `docker save`와 다르다. `save`는 레이어와 메타데이터를 보존하고, `export`는 컨테이너의 최종 파일시스템만 평평하게 뽑는다. rootfs가 필요한 지금은 `export`가 맞다.

`runc spec` 한 줄이 기본 `config.json`을 만든다. 이것으로 Bundle이 완성됐다.

### 2단계: 실행

```bash
runc run mycontainer
```

```text
/ # ps -ef
PID   USER   TIME  COMMAND
    1 root   0:00  sh
    7 root   0:00  ps -ef
```

**dockerd도 containerd도 shim도 없이 컨테이너가 떴다.** PID 1이 잡혀 있고 프로세스 테이블이 격리되어 있다.

다른 터미널에서 확인한다.

```bash
docker exec -it runc-test /bin/bash
runc list
```

```text
ID            PID   STATUS    BUNDLE          CREATED   OWNER
mycontainer   230   running   /app/mybundle   Z         root
```

### 3단계: 볼륨 마운트

`docker run -v`가 실제로 무엇을 바꾸는지 확인한다. `config.json`의 `mounts`에 항목을 추가한다.

```bash
mkdir -p /mydata
echo "Hello from host" > /mydata/test.txt

cd /app/mybundle
cat config.json | jq '.mounts += [{
  "destination": "/data",
  "type": "bind",
  "source": "/mydata",
  "options": ["rbind", "rw"]
}]' > config_volume.json

cat config_volume.json | jq '.mounts[] | select(.destination == "/data")'
cp config_volume.json config.json
```

```bash
runc run mycontainer
```

```text
/ # cd /data
/data # ls
test.txt
/data # cat test.txt
Hello from host
```

**`-v` 옵션은 결국 이 JSON 항목 하나였다.** [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 `docker inspect`로 봤던 `Type: bind`, `Source`, `Destination`이 여기서 그대로 나온다.

### 4단계: PID 네임스페이스 꺼 보기

여기서부터가 이 실습의 핵심이다. **격리를 하나씩 없애 본다.**

```bash
vi config.json
```

`namespaces` 배열에서 `pid` 항목을 지운다.

```json
"namespaces": [
    { "type": "pid" },        ← 이 줄을 제거
    { "type": "uts" },
    { "type": "network" }
]
```

```bash
runc run mycontainer
```

```text
# ps -ef
PID   USER   TIME  COMMAND
    1 root   0:00  sleep infinity
  240 root   0:00  /bin/bash
  300 root   0:00  runc run mycontainer
  314 root   0:00  sh
```

**컨테이너 안에서 호스트의 프로세스 목록이 그대로 보인다.** `runc run mycontainer` 명령 자신도 보인다. PID 1은 컨테이너의 `sh`가 아니라 호스트의 `sleep infinity`다.

[앞 편](/posts/skala-container-day2-kernel/)에서 말로 설명한 PID 네임스페이스가 **한 줄 지우니 사라졌다.** 컨테이너의 "격리"가 마법이 아니라 이 설정 항목이었다는 것이 확인된다.

### 5단계: 네트워크 네임스페이스 꺼 보기

같은 방식으로 `network`를 지운다.

```json
"namespaces": [
    { "type": "uts" },
    { "type": "network" }     ← 이 줄을 제거
]
```

```bash
runc run mycontainer
```

```text
/ # ifconfig
eth0  Link encap:Ethernet  HWaddr 8A:63:9C:1E:23:23
      inet addr:172.17.0.2  Bcast:172.17.255.255  Mask:255.255.0.0
      UP BROADCAST RUNNING MULTICAST  MTU:65535  Metric:1
```

다른 터미널에서 `runc-test` 컨테이너에 붙어 `ifconfig`를 치면 **같은 인터페이스와 같은 IP**가 나온다. 네트워크 공간을 공유하게 된 것이다.

이것이 `docker run --network host`의 실체다. [다음 편](/posts/skala-container-day2-network/)에서 host 네트워크가 "veth 없음, NAT 없음"인 이유가 여기서 설명된다. **네트워크 네임스페이스를 안 만들면 만들 veth도 없다.**

### 6단계: init 프로세스 직접 지정하기

Dockerfile의 `CMD ["/bin/sh", "-c", "/init.sh"]`에 해당하는 일을 손으로 한다.

```bash
cd /app/mybundle

cat > rootfs/init.sh <<'EOF'
#!/bin/sh
echo "[init] hello from runc"
date
sleep 1
echo "[init] done"
sleep 3600
EOF

chmod +x rootfs/init.sh
```

`config.json`의 `process`를 수정한다.

```json
"process": {
    "terminal": false,              ← true에서 false로
    "user": { "uid": 0, "gid": 0 },
    "args": [ "sh", "/init.sh" ]    ← 실행할 명령
}
```

```bash
runc run -d mycontainer
runc list
```

```text
ID            PID    STATUS    BUNDLE          CREATED                        OWNER
mycontainer   1112   running   /app/mybundle   2026-02-25T22:37:27.852760555Z root
```

```bash
runc exec -t mycontainer /bin/sh
```

```text
/ # ps -ef
PID   USER   TIME  COMMAND
    1 root   0:00  sh /init.sh
    9 root   0:00  sleep 3600
   23 root   0:00  /bin/sh
```

**`config.json`의 `args`가 그대로 PID 1이 됐다.** [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 `CMD` 작성 방식에 따라 PID 1이 `python3`가 되기도 하고 `/bin/sh`가 되기도 했던 이유가 이것이다. `CMD`는 결국 이 `args` 배열로 번역된다.

### 정리

```bash
runc list
runc kill mycontainer KILL
runc list
# STATUS가 stopped로 바뀐다

runc delete mycontainer
runc list
```

`kill` 후 바로 사라지지 않고 `stopped` 상태로 남는다. `docker stop` 후 `docker ps -a`에 남아 있다가 `docker rm`으로 지워지는 것과 같은 생명주기다.

## 그래서 컨테이너는 실행 단위인가

교재가 이 실습 뒤에 던지는 질문이다. 답도 함께 적혀 있다.

> 컨테이너란 containerd나 dockerd 등의 컨테이너 런타임이 정의한 **논리적 그룹**이며, Linux 커널의 namespace와 cgroup 기능으로 프로세스 그룹을 격리·제한하여 구현된 것

> 컨테이너는 결국 **프로세스의 모음**이며, 그 실행은 일반 리눅스 프로세스와 같지만, 단지 런타임에 의해 격리되고 자원이 제한된 상태로 운영되는 것

호스트 관점에서 보면 이렇게 된다.

```text
HOST 루트 디렉토리                     Container 루트 디렉토리
  /bin                                 /
  /lib                                 /bin
  /usr           ── pivot_root ──▶     /lib
  /var/lib/.../storage/dir/xxx         /usr

HOST 프로세스                          Container 내 프로세스
  process  process                     process  process
        └──────── 같은 Host Linux Kernel ────────┘
```

컨테이너는 **호스트 환경의 파일 디렉터리와 프로세스로 동작한다.** 별도의 무언가가 아니다.

## 도구 지형

같은 규격을 구현한 도구가 여럿이다.

### 이미지 빌드 도구

| 도구 | 실행 방식 | 주요 용도 |
|---|---|---|
| Docker Build | Docker 데몬 사용 | 일반적인 로컬 빌드 |
| BuildKit | 독립 실행 가능 | 고속·병렬·캐시 기반 빌드 |
| Docker Buildx | BuildKit을 쓰는 플러그인 | 멀티 아키텍처 이미지 |
| Kaniko | 컨테이너 안에서 빌드 | Kubernetes CI 환경 |
| Buildah | 데몬 없이 빌드 | Podman 생태계, Rootless |
| Jib | Java 전용 | Maven·Gradle에서 바로 생성 |

실습에서 `docker buildx build`를 쓰고 `--platform linux/amd64,linux/arm64`를 주는 것이 멀티 아키텍처 빌드다. Apple Silicon과 x86 서버를 함께 쓰는 환경에서 필요하다.

### 컨테이너 런타임

**고수준** — 이미지를 가져오고 생명주기를 관리하며 저수준 런타임을 호출한다.

| 런타임 | 특징 |
|---|---|
| containerd | Docker와 Kubernetes에서 널리 사용 |
| CRI-O | Kubernetes 전용 경량 런타임 |
| Docker Engine | dockerd가 containerd를 통해 관리 |

**저수준** — namespace와 cgroup을 설정하고 프로세스를 실행한다.

| 런타임 | 특징 |
|---|---|
| runc | 가장 대표적인 OCI 저수준 런타임 |
| crun | C 기반, 빠르고 경량 |
| youki | Rust 기반 |
| runsc | gVisor의 런타임, 보안 격리 강화 |
| kata-runtime | 경량 VM 기반 격리 |

마지막 둘이 흥미롭다. 커널 공유가 보안상 부담이 되는 환경을 위해 **격리 수준을 VM 쪽으로 되돌린** 선택지다. [1일차 ①](/posts/skala-container-day1-virtualization/)의 VM과 컨테이너 대비가 양자택일이 아니라는 뜻이기도 하다.

## 수업 중 나온 질문

### kubelet은 무엇이고 이 계층 어디에 들어가나

이 장에서 본 계층에서 **`dockerd` 자리를 대신하는 것**이 kubelet이다.

```text
[ Docker ]                          [ Kubernetes ]
  dockerd                             kubelet          ← 노드마다 하나씩
     ↓                                   ↓  CRI
  containerd                          containerd (또는 CRI-O)
     ↓                                   ↓
  containerd-shim                     containerd-shim
     ↓                                   ↓
  runc                                runc
```

kubelet은 **각 노드에서 도는 에이전트**다. 하는 일은 이렇다.

- 컨트롤 플레인에서 "이 노드에 이 Pod를 띄워라"를 받는다
- **CRI**(Container Runtime Interface)로 containerd나 CRI-O에 실제 실행을 요청한다
- 컨테이너 상태와 노드 자원을 컨트롤 플레인에 보고한다
- **probe**를 주기적으로 찔러 보고 실패하면 재시작하거나 트래픽에서 뺀다

여기서 이 장의 내용이 이어진다. **kubelet은 dockerd를 거치지 않는다.**
containerd와 CRI로 직접 말한다. 쿠버네티스가 Docker 없이도 컨테이너를 돌리는 이유가 이것이고,
2020년의 "Kubernetes가 Docker를 버린다"는 소동도 여기서 나왔다.
버린 것은 dockerd라는 중간 계층이지 컨테이너나 이미지 형식이 아니다.
**OCI 표준을 지키므로 `docker build`로 만든 이미지는 그대로 돈다.**

### replica는 뭔가

**같은 Pod를 몇 개 띄울지**다. 보통 Deployment가 ReplicaSet을 통해 관리한다.

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 3        # 항상 3개를 유지한다
```

Compose의 `restart` 정책과 대비하면 성격이 분명해진다.

| | Compose `restart` | Kubernetes `replicas` |
|---|---|---|
| 관심사 | **이 컨테이너**가 살아 있는가 | **몇 개**가 살아 있는가 |
| 하나 죽으면 | 그 컨테이너를 다시 시작한다 | **새 Pod를 만든다** (죽은 것은 버린다) |
| 노드가 통째로 죽으면 | 방법이 없다 | 다른 노드에 새로 만든다 |
| 개수 조절 | 없음 | `kubectl scale`, 오토스케일링 |

**"되살린다"와 "개수를 맞춘다"의 차이**가 핵심이다.
쿠버네티스는 죽은 컨테이너를 고쳐 쓰지 않는다. 버리고 새로 만든다.
그래서 컨테이너에 상태를 두면 안 되고, 상태는 볼륨이나 외부 저장소로 빼야 한다.

이 사고방식이 [2일차 ⑩](/posts/skala-container-day2-compose/)에서 다루는 Compose의
**선언형** 설정과 이어진다. "무엇을 해라"가 아니라 "이런 상태였으면 좋겠다"를 적고,
그 상태를 유지하는 일은 시스템이 맡는다.

## 이 장에서 남는 것

- `dockerd` → `containerd` → `shim` → `runc` → init process. 각 층이 하는 일이 다르고, 컨테이너가 도는 동안 붙어 있는 것은 `runc`가 아니라 **shim**이다.
- OCI Bundle은 `config.json`(어떻게) + `rootfs/`(무엇을) 둘뿐이다.
- `docker run -v`는 `config.json`의 `mounts` 항목, `CMD`는 `process.args` 항목으로 번역된다.
- `namespaces`에서 한 줄을 지우면 격리가 실제로 사라진다. `--network host`는 network 네임스페이스를 안 만드는 것이다.

다음 편에서는 네트워크 네임스페이스 위에 올라가는 Docker 네트워크 유형과, 패킷이 실제로 어떻게 전달되는지를 본다.
