---
title: "[SKALA] 컨테이너 1일차 ① — 가상화에서 컨테이너로"
date: 2026-08-21 19:00:00 +0900
permalink: /posts/skala-container-day1-virtualization/
categories:
  - SKALA
  - Infra
tags: [skala, docker, container, virtualization, hypervisor, mariadb]
description: "하이퍼바이저와 VM이 해결한 것과 남긴 것을 정리하고, 컨테이너가 그 빈 자리를 어떻게 메우는지 확인한다. 첫 컨테이너로 MariaDB를 띄우며 --network 옵션이 왜 필요한지까지 짚는다."
---

## VM은 무엇을 해결했나

과정의 첫 장은 Docker가 아니라 가상화에서 시작한다. 순서를 건너뛰면 컨테이너가 "가벼운 VM"으로 잘못 이해되기 때문이다.

물리 서버 한 대는 비싸다. 교재는 High End 장비가 수억에서 수십억, Mid Range가 수억이라고 적는다. 그런데 **평균 사용률은 6% 수준**이다. 남는 94%를 그냥 두는 것이 아까워서 나온 것이 가상화다. 물리 하드웨어를 추상화해서 한 대를 독립된 여러 대처럼 쓴다.

그 일을 하는 소프트웨어 계층이 하이퍼바이저다. 하는 일은 다음과 같다.

- 물리 하드웨어(CPU, Memory, Disk, NIC)를 관리
- VM을 생성 / 삭제 / Snapshot / Migration
- 각 VM에 자원 할당, VM 간 자원 충돌 방지
- VM이 요청하는 하드웨어 명령을 중재하고 스케줄

핵심은 하이퍼바이저가 **실제 하드웨어를 직접 노출하지 않는다**는 점이다. 추상화한 가상 하드웨어를 각 Guest OS에 제공한다.

### Type 1과 Type 2

| | Type 1 (Bare metal) | Type 2 (Hosted) |
|---|---|---|
| 위치 | 하드웨어 위에 직접 | 기존 OS 위에서 동작 |
| 오버헤드 | OS 오버헤드 없음 | OS 오버헤드 존재 |
| 용도 | 클라우드 IDC, 데이터 센터 | 데스크탑 테스트/개발 |
| 솔루션 | VMware ESXi, Hyper-V, KVM, Xen | VMware Workstation, VirtualBox, Parallels |

교재가 든 대비 예시가 이해에 도움이 된다.

```text
AWS EC2 서버                     개발자 맥북
└── ESXi Hypervisor            └── macOS (주 작업 환경)
    ├── 웹서버 VM (24시간 가동)       ├── Chrome, Slack, VSCode 사용
    ├── DB 서버 VM (24시간 가동)      └── VirtualBox 실행
    └── 캐시 서버 VM (24시간 가동)         └── Ubuntu VM (테스트용, 필요할 때만)
```

Windows의 Hyper-V는 이 분류에서 조금 특이하다. Type 1 방식이되 관리 OS 기능과 관리 도구를 별도 VM(Root Partition)이 전담하도록 쪼갠 구조다.

```text
ESXi 완전체              Hyper-V 분리형
├── 하이퍼바이저           ├── 하이퍼바이저 (순수 가상화만)
├── OS 커널 기능 (내장)     └── Root Partition (Windows)
└── 관리 도구 (내장)            └── OS 커널 기능 + 관리 도구 (WSL)
```

## VM이 남긴 문제

여기서 이 장의 방향이 정해진다. 교재의 문장이 정확하다.

> Virtualization Machine은 물리 서버를 서비스화하여 동적 할당을 지원.
> **But, 애플리케이션의 설치 및 운영은 기존 전통적인 물리 서버 환경과 동일한 구조**

서버를 쪼개는 문제는 풀렸다. 그런데 **쪼갠 서버 안에서 애플리케이션을 올리는 일은 하나도 안 바뀌었다.** 여전히 OS에 로그인해서 패키지를 깔고 설정을 만진다.

여기서 세 가지가 따라온다.

| 문제 | 내용 |
|---|---|
| 거대한 이미지 크기 | VM 이미지는 OS와 가상 하드웨어를 포함한다. 수 GB~수십 GB |
| 느린 시작 시간 | Hypervisor → OS → M/W → Appl 순으로 단계적 부팅. 수십 초~수 분 |
| VM 간 환경 불일치 | VM은 OS까지만 같다. 앱 실행 환경은 별도 구성이라 어긋난다 |

세 번째가 가장 성가시다. VM 이미지를 아무리 똑같이 떠도 그 위에 앱을 손으로 올리는 순간 "내 PC에선 되는데 서버에선 에러"가 다시 나온다.

## 컨테이너가 자른 지점

컨테이너의 발상은 단순하다. **배포 단위에서 OS 이미지를 뺀다.**

```text
VM        : [ 앱 + 라이브러리 + Guest OS + 가상 하드웨어 ] 를 통째로 배포
컨테이너   : [ 앱 + 라이브러리 ] 만 배포, 커널은 호스트 것을 공유
```

대신 조건이 붙는다. **Host OS는 Linux Kernel로 통일된다.** 커널을 공유하는 구조이므로 이기종 OS를 올릴 수 없다. VM에서는 되던 것이 컨테이너에서는 안 되는 대표적인 항목이다.

그 조건을 받아들이면 앞의 세 문제가 한 번에 정리된다.

| | VM | 컨테이너 |
|---|---|---|
| 이미지 크기 | 수 GB~수십 GB | 수십 MB~수백 MB |
| 기동 속도 | 수십 초~수 분 | 수 밀리초~수 초 |
| 이식성 | 동일 하이퍼바이저 간에만 | 물리·가상·클라우드 간 |
| 이기종 OS | 가능 | 불가능 (Host와 동일 커널 계열) |
| 집적도 | 물리 서버당 4~6 VM | 물리 서버당 20~30 컨테이너 |
| OS Cost | VM 당 | Host 당 |
| 베어메탈 대비 성능 | 50~80% | 98% |
| 개발 환경 구축 | 보통 하루 이상 | 수 분~수십 분 |

기동 속도가 "수 밀리초"인 이유가 중요하다. 부팅이 빨라진 것이 아니라 **부팅이 없다.** 커널은 이미 떠 있고, 컨테이너를 실행한다는 것은 그 커널 위에서 프로세스를 하나 실행하는 것이다. 2일차에 이 문장이 그대로 결론으로 돌아온다.

## 그래서 현실에서는 무엇을 쓰나

표만 보면 컨테이너가 모든 면에서 낫다. 그런데 클라우드에서 서버를 빌리면 대개 VM이 나온다.
둘 중 하나를 고르는 문제가 아니기 때문이다.

**빌리는 단위가 다르다.**

| 형태 | 예 | 빌리는 것 |
|---|---|---|
| IaaS | AWS EC2, GCP Compute Engine | **VM 한 대.** OS부터 내가 고른다 |
| 관리형 컨테이너 | AWS ECS/Fargate, Cloud Run | **컨테이너 실행 자체.** 호스트는 안 보인다 |
| 관리형 쿠버네티스 | EKS, GKE | 컨테이너를 올릴 **클러스터.** 노드는 대개 VM이다 |

세 번째가 실무의 표준이다. **VM 위에 컨테이너를 올린다.** EKS 노드는 EC2 인스턴스이고
그 위에서 컨테이너가 돈다. 컨테이너가 VM을 대체한 것이 아니라 VM 안으로 들어갔다.

이유는 방금 본 "커널을 공유한다"에 있다. 커널을 공유한다는 것은
**커널 취약점 하나로 옆 컨테이너나 호스트로 넘어갈 수 있다**는 뜻이기도 하다(container escape).
남의 코드를 같은 물리 서버에서 돌리는 환경에서는 하이퍼바이저라는 더 두꺼운 경계가 필요하다.

보안만은 아니다. VM 층은 하드웨어 추상화, 라이브 마이그레이션, 노드별 커널 버전 분리,
과금 단위의 명확함을 함께 준다. 반대로 신뢰하는 코드만 돌리는 온프렘에서는
**베어메탈 쿠버네티스**도 실제로 쓴다. 그쪽이 빠르다.

정리하면 VM과 컨테이너는 양자택일이 아니라 **격리 강도와 성능 사이의 눈금**이다.
그 눈금 중간에 gVisor나 Kata Containers 같은 선택지가 있는데,
컨테이너 인터페이스는 유지하면서 격리를 VM 쪽으로 되돌린 런타임이다.

### GPU는 왜 '몇 장' 단위로 빌려주나

커널 공유가 만드는 또 하나의 결과다. GPU는 PCIe 장치라서 CPU·메모리처럼 잘게 쪼개기 어렵다.

**VM에 붙일 때**는 **PCI passthrough**로 물리 카드를 통째로 넘긴다.
호스트가 그 카드를 포기하고 게스트가 직접 잡으므로 자연히 **장 단위**가 된다.

**컨테이너에 붙일 때**는 다르다. 커널을 공유하므로 **드라이버는 호스트에 한 벌만** 있고,
컨테이너에는 디바이스 파일(`/dev/nvidia*`)과 사용자 공간 라이브러리만 넘긴다.
그 일을 NVIDIA Container Toolkit이 한다.

```bash
docker run --gpus all nvidia/cuda:12.4.0-base nvidia-smi
```

여기서 제약이 하나 따라온다. **컨테이너 안에는 드라이버가 없다.**
호스트 드라이버가 컨테이너의 CUDA 버전을 감당하지 못하면 이미지를 아무리 잘 만들어도 돌지 않는다.
"내 PC에선 되는데"를 없애려고 컨테이너를 쓰는데, GPU에서는 호스트 의존이 남는 셈이다.

A100·H100의 MIG(Multi-Instance GPU)는 카드 하나를 하드웨어 수준에서 최대 7조각으로 나눈다.
"1/7장"처럼 파는 서비스가 이것을 쓴다.

{: .prompt-info }
> Colab 런타임은 VM 위에서 동작하고 노트북 프로세스는 그 안의 컨테이너에서 돈다고 알려져 있다.
> 직접 확인할 수 있다 — 런타임에서 `!cat /proc/1/cgroup` 을 찍어 보면 컨테이너 식별자가 보인다.
> 런타임을 초기화하면 설치한 패키지가 통째로 사라지는 것도 컨테이너의 성질이다.
> 변경분이 어디에 쌓였다가 사라지는지는 [2일차 ⑦](/posts/skala-container-day2-kernel/)에서 다룬다.

## 이미지는 선언적으로 만든다

앱 실행 환경을 이미지에 담는다면, 그 이미지는 어떻게 만드나. Docker는 `Dockerfile`이라는 DSL로 **무엇을 이미지화할지 선언**한다.

```dockerfile
FROM python:3.10-alpine

RUN apk add --no-cache bash curl gcc musl-dev linux-headers jq

# FastAPI 및 기타 라이브러리 설치
RUN pip install fastapi uvicorn psutil python-multipart prometheus-client

COPY fastserver.py fastserver.py

CMD ["python3", "fastserver.py"]
```

"이 순서로 설치해라"가 아니라 "이런 상태의 이미지가 필요하다"를 적는다. 각 줄이 이미지의 레이어를 하나씩 기술한다. 레이어 이야기는 [다음 편](/posts/skala-container-day1-image-registry/)에서 이어진다.

## 첫 컨테이너: MariaDB

이론을 확인하는 첫 실습은 데이터베이스를 컨테이너로 띄우는 것이다. 설치 없이 DB가 뜨는 경험이 앞의 표를 체감시키기 때문에 첫 실습으로 배치된 것으로 보인다.

```bash
# 참고: 01.answer-code/01.mariadb/run-mariadb.sh
docker network inspect skala >/dev/null 2>&1 || \
  docker network create --driver bridge skala

docker run -d \
  --name mariadb \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=skala \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=password \
  --network skala \
  -p 3306:3306 \
  mariadb:latest
```

옵션을 하나씩 읽어 둘 필요가 있다.

| 옵션 | 의미 |
|---|---|
| `-d` | 백그라운드(detached) 실행 |
| `--name mariadb` | 컨테이너 이름 지정. 이후 명령에서 ID 대신 쓴다 |
| `-e` | 환경변수 주입. MariaDB 이미지가 이 값으로 초기 DB와 계정을 만든다 |
| `--network skala` | 미리 만든 커스텀 브리지 네트워크에 연결 |
| `-p 3306:3306` | 호스트 3306 → 컨테이너 3306 포워딩 |

**첫 줄이 왜 있는지가 이 실습의 숨은 요점이다.** `docker network create --driver bridge skala`로 커스텀 브리지를 먼저 만든다. 기본 `bridge`를 그냥 써도 컨테이너는 뜬다. 그런데 나중에 백엔드 컨테이너가 이 DB에 붙을 때 `jdbc:mariadb://mariadb:3306/skala`처럼 **컨테이너 이름으로 접속**하게 되는데, 기본 브리지에는 이름을 풀어 줄 DNS가 없다. 커스텀 브리지에만 있다.

지금 단계에서는 그냥 따라 치는 한 줄이지만, [1일차 ⑤](/posts/skala-container-day1-webservice/)에서 세 컨테이너를 이을 때 이 한 줄이 전제가 된다. 네트워크 유형별 차이는 [2일차 ⑨](/posts/skala-container-day2-network/)에서 따로 다룬다.

{: .prompt-info }
> `docker network inspect skala >/dev/null 2>&1 || docker network create ...` 형태는 "없으면 만든다"를 한 줄로 처리하는 관용구다. 스크립트를 여러 번 돌려도 안전하다.

### 컨테이너 안으로 들어가 보기

컨테이너가 떴으면 안에 들어가서 확인한다.

```bash
docker exec -it mariadb /bin/bash
```

```text
# mariadb -u root -p
Enter password:
Welcome to the MariaDB monitor.
Server version: 11.6.2-MariaDB-ubu2404 mariadb.org binary distribution

MariaDB [(none)]> SHOW DATABASES;
+--------------------+
| Database           |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| skala              |
| sys                |
+--------------------+

MariaDB [(none)]> USE skala;
Database changed
```

`-e MYSQL_DATABASE=skala`로 넘긴 값이 실제 DB로 만들어져 있다. 테이블을 하나 만들어 본다.

```sql
CREATE TABLE key_value (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_column VARCHAR(255) NOT NULL UNIQUE,
  value_column TEXT NOT NULL
);

INSERT INTO key_value (key_column, value_column)
VALUES ('example_key', 'example_value');

SELECT * FROM key_value;
```

호스트에서는 DBeaver로 `localhost:3306`에 붙어 같은 데이터를 볼 수 있다. `-p 3306:3306`이 그 통로다.

{: .prompt-warning }
> 이 시점의 MariaDB에는 볼륨이 붙어 있지 않다. 컨테이너를 지우면 방금 만든 테이블도 같이 사라진다. 데이터를 남기는 방법은 [1일차 ④](/posts/skala-container-day1-volume-signal/)에서 다룬다.

### 정리하고 넘어가기

실습 사이에 환경을 비워 두지 않으면 다음 실습에서 이름 충돌과 포트 충돌이 난다.

```bash
docker ps                       # 실행 중인 컨테이너
docker stop mariadb
docker rm mariadb

# 사용하지 않는 컨테이너·네트워크·빌드 캐시·이미지 정리
docker system prune -a

# 미사용 볼륨 강제 삭제
docker volume prune -f
```

`docker ps`에 안 보인다고 없는 것이 아니다. **정지된 컨테이너는 `docker ps -a`로만 보인다.** 이름 충돌 에러가 나면 대부분 여기에 남아 있다.

## 이 장에서 남는 것

- 하이퍼바이저는 **서버를 쪼개는** 문제를 풀었고, 그 안에서 **앱을 올리는** 문제는 그대로 남겼다.
- 컨테이너는 배포 단위에서 OS를 빼서 그 문제를 푼다. 대가는 **호스트와 같은 커널 계열만 가능**하다는 제약이다.
- "기동 수 밀리초"는 부팅이 빨라진 것이 아니라 부팅이 없기 때문이다.
- 컨테이너 이름으로 서로를 부르려면 **커스텀 브리지 네트워크**가 필요하다.

다음 편에서는 이미지가 왜 레이어로 쪼개져 있는지, 그리고 `skala-registry.skala-ai.com/class-0/skala-webserver:1.0` 같은 이름이 어떤 구조인지를 본다.
