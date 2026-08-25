---
title: "[SKALA] 컨테이너 2일차 ⑦ — 격리를 만드는 커널 기능들"
date: 2026-08-24 19:40:00 +0900
permalink: /posts/skala-container-day2-kernel/
categories:
  - SKALA
  - Infra
tags: [skala, docker, namespace, cgroup, overlayfs, capabilities, selinux]
description: "namespace·cgroup·OverlayFS·Capabilities가 각각 무엇을 격리하고 무엇을 제한하는지 정리한다. OverlayFS를 직접 마운트해 Copy-on-Write가 일어나는 것을 눈으로 확인하는 실습까지 따라간다."
---

## 컨테이너는 무엇으로 만들어져 있나

교재의 한 문장이 이 장 전체를 요약한다.

> 컨테이너는 **가상 머신이 아니라 Linux Kernel 기능들의 조합**으로 만들어진 격리 실행 환경

조합되는 기능은 여섯 가지다.

| 기능 | 하는 일 |
|---|---|
| **Namespace** | 프로세스마다 서로 다른 시스템 뷰를 제공 (PID, NET, MNT, IPC, USER, UTS) |
| **cgroups** | 자원 사용을 통제. 하나가 폭주해도 노드 전체 영향을 최소화 |
| **rootfs / OverlayFS** | 이미지 레이어를 재사용하고 컨테이너마다 독립 파일시스템을 제공 |
| **Netfilter** | 패킷을 가로채고 변경. 포트 포워딩, NAT, 컨테이너 간 통신 격리 |
| **Linux Capabilities** | root 권한을 세분화. "무엇을 할 수 있는가" |
| **SELinux / AppArmor** | 강제 접근 통제. "어떤 대상에 접근할 수 있는가" |

이 기능들을 직접 호출하는 코드가 **libcontainer**다. 리눅스 커널의 네임스페이스 생성, cgroups 자원 할당, pivot_root, Capabilities 드롭 같은 커널 시스템 콜을 직접 호출하는 순수 Go 패키지이고, Apache License 2.0으로 공개되어 리눅스 재단 산하 OCI 프로젝트에 속해 있다.

## Namespace — 보이는 세상을 나눈다

핵심은 **커널 레벨에서 보이는 세상(view)을 분리**하는 것이다. 하나의 커널에서 여러 논리적 OS 환경을 제공하고, 그 안에서 실행되는 프로세스는 자기 몫의 논리적 OS만 볼 수 있다.

| namespace | 격리 대상 |
|---|---|
| **PID** | 컨테이너마다 별도의 프로세스 테이블. 컨테이너 안에서 PID 1부터 시작하고, 다른 컨테이너의 프로세스에 접근할 수 없다 |
| **Network** | veth, IP 주소, 포트 번호, 라우팅 테이블, 필터링 테이블 |
| **UID/GID (USER)** | User ID와 Group ID 공간. 외부의 user·group이 내부를 보거나 건드릴 수 없다 |
| **Mount** | 파일시스템 트리. 컨테이너마다 특정 디렉터리를 루트(rootfs)로 보이게 한다 |
| **UTS** | hostname과 domain name. `/etc/hosts`, `/etc/resolv.conf`, `/etc/hostname` 분리 |
| **IPC** | 공유 메모리, 큐, 세마포어 등 프로세스 간 통신 자원 |

**PID 네임스페이스가 [1일차 ④](/posts/skala-container-day1-volume-signal/)의 PID 1 이야기와 이어진다.** 컨테이너 안에서 `ps -ef`를 쳤을 때 PID 1이 보이는 것은 그 컨테이너만의 프로세스 테이블이 따로 있기 때문이다. 호스트에서 보면 같은 프로세스가 전혀 다른 PID를 갖는다.

그리고 **Network 네임스페이스가 [1일차 ⑤](/posts/skala-container-day1-webservice/)의 포트 이야기와 이어진다.** 프런트엔드 컨테이너 두 개가 내부에서 똑같이 80번을 써도 충돌하지 않는 이유가 이것이다. 각자 자기 포트 공간을 갖는다.

[다음 편](/posts/skala-container-day2-runtime-runc/)에서 `config.json`의 네임스페이스 항목을 지워서 이 격리를 실제로 깨 본다.

## cgroups — 쓸 수 있는 양을 나눈다

namespace가 "무엇이 보이는가"라면 cgroups는 "얼마나 쓸 수 있는가"다. 동일 그룹에 속한 프로세스 집합에 대해 CPU, Memory, I/O 사용량을 제한·격리·모니터링한다.

| 항목 | 기능 |
|---|---|
| `cpu` | CPU 사용량 제한 |
| `cpuacct` | CPU 사용량 통계 제공 |
| `cpuset` | CPU와 메모리 배치 제어 |
| `memory` | 메모리와 swap 사용량 제한 |
| `devices` | 디바이스 액세스 허가 및 제한 |
| `freezer` | 그룹에 속한 프로세스 정지 및 재개 |
| `net_cls` | 네트워크 제어 태그 추가 |
| `blkio` | 블록 디바이스 입출력량 제어 |

계층 구조로 그룹화되며, **하위 cgroup에는 상위 cgroup의 제한이 그대로 적용된다.**

실제로 쓰는 방법은 간단하다.

```bash
docker run -d \
  --name my-resource-container \
  --cpus="2.0" \
  --memory="512m" \
  nginx
```

### 한도를 넘으면 무슨 일이 일어나나

교재가 메모리 초과 상황을 단계별로 적어 뒀다. 컨테이너에 `memory limit: 512M`가 걸려 있고 프로세스가 700MiB를 쓰려는 경우다.

1. 리눅스 커널의 **OOM Killer**가 동작해 프로세스를 강제 종료한다
2. **shim**이 PID 1 종료를 감지하고 컨테이너 종료 상태를 containerd에 알린다
3. containerd가 컨테이너 상태를 갱신한다. **Docker는 `Exited (137)`, 쿠버네티스는 `OOMKilled`**

`137`이라는 숫자에 의미가 있다. `128 + 9`이고 9는 SIGKILL이다. [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 Shell Form으로 만든 컨테이너가 `Exited (137)`로 죽는 것을 봤는데, 원인은 다르지만 **결말이 SIGKILL이라는 점은 같다.**

| 자원 | 컨트롤러 | 제어 방식 |
|---|---|---|
| CPU | `cpu` / `cpuacct` | cfs quota, period로 제한 |
| Memory | `memory` | limit 초과 시 OOM kill |
| I/O | `blkio` | 읽기/쓰기 속도 제한 |
| PID 수 | `pids` | 프로세스 개수 제한 |
| Network | 없음 | **cgroup만으로는 직접 제한 불가.** `tc` 등 필요 |

마지막 줄이 실무에서 걸리는 지점이다. 네트워크 대역폭은 cgroup으로 못 잡는다.

## 권한 — Capabilities와 SELinux

전통적 리눅스는 권한을 `UID 0(root)`과 나머지로만 나눴다. 교재가 지적하는 문제는 두 가지다.

**과도한 권한 부여.** 웹 서버가 80번 포트에 바인딩하려면 root로 실행해야 한다. 그런데 root면 시스템 전체를 할 수 있다. 포트 하나 쓰려고 전권을 준다.

**소유자 기반 통제(DAC)의 무력화.** 파일 소유자나 root는 권한을 임의로 바꿀 수 있으므로 악성 코드가 침투하면 보호가 안 된다.

### Linux Capabilities — 행위의 세분화

root 특권을 약 40개로 나눈 것이다. 특정 프로세스가 탈취되더라도 root 전권으로 승격되는 것을 막는다.

| Capability | 허용 범위 |
|---|---|
| `CAP_NET_BIND_SERVICE` | 1024 미만 포트 바인딩만 허용 |
| `CAP_SYS_ADMIN` | mount 등 시스템 관리성 작업 |
| `CAP_NET_ADMIN` | 네트워크 인터페이스 설정 및 라우팅 제어 |
| `CAP_KILL` | 프로세스 kill 권한 |

**[1일차 ③](/posts/skala-container-day1-dockerfile/)에서 `USER skala`가 80번 포트에 바인딩하지 못해 실패했던 그 문제의 해법이 `CAP_NET_BIND_SERVICE`다.** 그때는 nginx 설정을 8080으로 바꿔서 우회했다. 쿠버네티스에서는 이렇게 쓴다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: capability-demo
spec:
  containers:
    - name: nginx
      image: nginx:latest
      securityContext:
        runAsUser: 1000
        runAsNonRoot: true
        capabilities:
          drop:
            - ALL
          add:
            - NET_BIND_SERVICE
```

`drop: ALL`로 전부 떨어뜨린 뒤 필요한 것 하나만 다시 얹는다. 비root로 돌리면서 80번 포트는 쓸 수 있다.

### SELinux — 대상 접근의 강제 통제

Capabilities가 "무엇을 할 수 있는가"라면 SELinux는 **"어떤 대상에 접근할 수 있는가"**를 강제한다. 프로세스가 파일, 디렉터리, 포트에 대해 수행할 수 있는 작업을 정책으로 못박는다.

> 프로세스가 root(UID 0)이고 모든 Capability를 가지고 있더라도, **SELinux 정책에 명시적으로 allow가 정의되어 있지 않으면 커널 단에서 접근을 차단**한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: selinux-demo
spec:
  securityContext:
    seLinuxOptions:
      user: system_u
      role: system_r
      type: container_t
      level: "s0:c123,c456"
  containers:
    - name: nginx
      image: nginx:latest
```

두 방식은 배타적이지 않고 겹쳐 쓴다. Capabilities로 행위를 줄이고, SELinux로 대상을 묶는다.

## OverlayFS — 레이어를 하나로 합친다

[2일차 ⑥](/posts/skala-container-day2-image-anatomy/)에서 이미지가 여러 레이어의 tar라는 것을 확인했다. 그것이 실행 시점에 하나의 파일시스템으로 보이게 하는 것이 OverlayFS다. 리눅스 커널 3.18부터 정식 포함됐다.

### 구성 요소

```text
  merged (/) ← rootfs
       ↑
┌───────────────┐
│  upperdir     │  ← 컨테이너 변경 내용 (RW)
├───────────────┤
│  lowerdir N   │  ← image layer (RO)
│  lowerdir N-1 │
│  lowerdir 1   │
└───────────────┘
```

| 구성 | 역할 |
|---|---|
| **LowerDir** (읽기 전용) | 풀어진 컨테이너 이미지 레이어들. 수정·삭제 불가 |
| **UpperDir** (읽기 쓰기) | 컨테이너 실행 후 생성·수정·삭제된 파일이 물리적으로 저장되는 곳 |
| **MergedDir** | 위 둘을 병합한 실제 디렉터리. **해당 컨테이너의 rootfs(`/`)** |
| **workdir** | 디렉터리 생성·삭제·rename에 필요한 임시 작업 공간 |

### Copy-on-Write

핵심 전략이다. **파일을 수정하면 원본(lowerdir)은 그대로 두고 upperdir에 복사한 뒤 거기서 바꾼다.** 원본 불변성이 보장된다.

동일한 파일이 양쪽에 있으면 **upperdir이 우선**한다. 사용자에게는 하나의 디렉터리처럼 보이고, 실제로는 여러 레이어를 OverlayFS가 조합한다.

이것이 **여러 컨테이너가 같은 이미지를 공유하면서도 서로 간섭하지 않는 이유**다. lowerdir은 공유하고 upperdir만 각자 갖는다. 그래서 컨테이너 하나 더 띄우는 비용이 거의 없다.

### 파이썬 venv와는 무엇이 다른가

"공통 바탕 + 내 변경분을 겹친다"는 발상은 venv와 닮았다. 그런데 **동작하는 층이 다르고**,
그 차이가 성질을 갈라놓는다.

| | venv | OverlayFS |
|---|---|---|
| 동작하는 층 | **파이썬 인터프리터** | **리눅스 커널** |
| 하는 일 | `sys.path` 조작 — 어느 `site-packages`를 볼지 정한다 | 파일시스템 합성 — 프로세스가 보는 `/` 자체를 만든다 |
| 적용 범위 | 파이썬 모듈만 | **모든 파일** |
| 바탕 보호 | 없음. `sudo pip`로 시스템 것을 고칠 수 있다 | **lowerdir은 읽기 전용이 강제된다** |
| 변경 분리 | 수동 (어디에 설치할지 내가 정함) | **자동 (Copy-on-Write)** |

venv 안에서도 `/etc/hosts`나 `/usr/bin/ls`는 시스템 것을 그대로 본다. 파이썬 밖은 아무것도 안 바뀐다.
반면 컨테이너 안에서는 `/usr/bin/ls`부터 다른 파일이다.

특히 **lowerdir이 읽기 전용이라는 점**이 다르다. venv는 규율에 의존하지만 OverlayFS는 커널이 강제한다.
그래서 컨테이너를 아무리 망가뜨려도 이미지는 멀쩡하고, 같은 이미지로 새로 띄우면 처음 상태로 돌아온다.

굳이 대응시키자면 **컨테이너 = venv + chroot + 프로세스 격리 + 자원 제한**이고,
venv는 그중 "의존성 분리" 한 조각만 담당한다.

그래서 컨테이너 안에서 venv를 또 쓸 이유는 대개 없다. 컨테이너 하나에 애플리케이션 하나를 넣으면
의존성이 충돌할 상대가 없기 때문이다. 예외는 멀티스테이지 빌드다 —
**venv 디렉터리 하나만 다음 스테이지로 복사**하면 빌드 도구를 남기지 않고 의존성만 넘길 수 있다.

```dockerfile
FROM python:3.11 AS builder
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
```

이때 venv는 격리 수단이 아니라 **옮기기 쉬운 묶음**으로 쓰인다.

## 실습: OverlayFS를 직접 마운트해 보기

말로 들으면 추상적이므로 직접 마운트한다. 커널 기능을 만져야 하므로 `--privileged`가 필요하다.

```bash
docker run --rm -it --privileged ubuntu:24.04 /bin/bash
```

컨테이너 안에서 작업 공간을 만든다.

```bash
mkdir -p /mnt/ovtest
mount -t tmpfs tmpfs /mnt/ovtest      # p1: 파일시스템 종류, p2: 장치 식별자
df -T /mnt/ovtest
```

```text
Filesystem  Type   1K-blocks  Used  Available Use% Mounted on
tmpfs       tmpfs    4012648    12    4012636   1% /mnt/ovtest
```

네 개의 디렉터리를 만들고 lower에 파일을 넣는다.

```bash
mkdir -p /mnt/ovtest/{lower,upper,work,merged}

echo "AAA from lower" > /mnt/ovtest/lower/a.txt
echo "BBB from lower" > /mnt/ovtest/lower/b.txt
```

오버레이로 마운트한다.

```bash
mount -t overlay overlay \
  -o lowerdir=/mnt/ovtest/lower,upperdir=/mnt/ovtest/upper,workdir=/mnt/ovtest/work \
  /mnt/ovtest/merged
```

확인한다.

```bash
mountpoint /mnt/ovtest/merged
# /mnt/ovtest/merged is a mountpoint

ls /mnt/ovtest/lower     # a.txt  b.txt
ls /mnt/ovtest/merged    # a.txt  b.txt   ← lower가 그대로 비친다
ls /mnt/ovtest/upper     # 비어 있다
```

merged에는 lower의 파일이 보이는데 upper는 비어 있다. **아직 아무것도 안 바꿨기 때문이다.**

이제 merged에서 파일을 수정한다.

```bash
echo "add line test" >> /mnt/ovtest/merged/a.txt
```

세 곳을 비교한다.

```bash
cat /mnt/ovtest/lower/a.txt   # AAA from lower              ← 원본 그대로
cat /mnt/ovtest/upper/a.txt   # AAA from lower              ← 통째로 복사된 뒤
                              # add line test               ← 수정분이 추가됨
cat /mnt/ovtest/merged/a.txt  # upper 쪽 내용이 보인다
```

**Copy-on-Write가 눈에 보인다.** merged의 파일 하나를 건드렸을 뿐인데 upper에 전체 파일이 복사되고 거기에 수정이 적용됐다. lower는 손대지 않았다.

`b.txt`는 건드리지 않았으므로 upper에 나타나지 않는다. 필요할 때만 복사된다.

{: .prompt-info }
> 실제 컨테이너에서는 이 구조가 다음 경로에 만들어진다.
> ```text
> /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots/<id>/fs/
> ├── lowerdir/   ← 읽기 전용 레이어들 (이미지)
> ├── upperdir/   ← 컨테이너 실행 중 변경사항
> ├── workdir/    ← OverlayFS 내부 작업 공간
> └── merged/     ← 병합 결과 → 이것이 컨테이너의 rootfs
> ```
> `runc`는 `pivot_root`로 이 `merged` 디렉터리를 컨테이너의 루트(`/`)로 전환한다.

이 대목에서 **컨테이너를 지우면 데이터가 사라지는 이유**가 분명해진다. 변경분은 전부 upperdir에 있고, 컨테이너를 지우면 upperdir이 사라진다. lowerdir(이미지)은 남는다. [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 볼륨이 필요했던 이유가 이것이다. **볼륨은 이 오버레이 바깥에 붙는다.**

## 정리: 두 축

여섯 가지 기능이 두 축으로 갈린다.

| 축 | 기능 | 질문 |
|---|---|---|
| 격리 | Namespace, OverlayFS | 무엇이 **보이는가** |
| 제한 | cgroups, Capabilities, SELinux | 무엇을 **할 수 있는가** |

Netfilter는 네트워크 쪽에서 두 역할을 겸하는데, [2일차 ⑨](/posts/skala-container-day2-network/)에서 따로 다룬다.

## 이 장에서 남는 것

- 컨테이너는 커널 기능의 조합이다. namespace가 뷰를 나누고 cgroup이 양을 나눈다.
- PID 네임스페이스가 PID 1을, Network 네임스페이스가 포트 충돌 없음을 설명한다.
- Capabilities는 "할 수 있는 행위", SELinux는 "접근할 수 있는 대상"을 좁힌다. `CAP_NET_BIND_SERVICE`가 1일차의 80번 포트 문제에 대한 정공법이다.
- OverlayFS의 Copy-on-Write 때문에 컨테이너 변경분은 upperdir에만 쌓이고, 컨테이너를 지우면 함께 사라진다.

다음 편에서는 이 기능들을 실제로 호출하는 계층 — `dockerd`에서 `runc`까지 — 을 따라가고, `runc`를 손으로 직접 실행해 본다.
