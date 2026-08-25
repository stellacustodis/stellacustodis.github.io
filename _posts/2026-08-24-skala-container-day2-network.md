---
title: "[SKALA] 컨테이너 2일차 ⑨ — Docker 네트워크, 이름이 풀리는 이유"
date: 2026-08-24 20:40:00 +0900
permalink: /posts/skala-container-day2-network/
categories:
  - SKALA
  - Infra
tags: [skala, docker, network, bridge, nat, dns, calico, cidr]
description: "bridge·host·custom bridge 세 유형의 차이를 정리하고, 호스트 포트에서 컨테이너까지 패킷이 전달되는 경로를 단계별로 따라간다. 커스텀 브리지에만 DNS가 있는 이유와 쿠버네티스 CNI와의 차이도 함께 짚는다."
---

## 1일차에 미뤄 둔 질문

[1일차 ⑤](/posts/skala-container-day1-webservice/)에서 Spring Boot가 DB에 이렇게 붙었다.

```yaml
url: jdbc:mariadb://mariadb:3306/skala
```

호스트 자리에 IP가 아니라 컨테이너 이름이 들어갔다. 그리고 `--network skala`가 필요했다. 이 편은 그 이유를 다룬다.

## 네트워크 유형 세 가지

| 유형 | 생성 방식 | 목적 |
|---|---|---|
| **bridge** | 기본값 (`docker0`) | 커널에 생성된 가상 브리지(L2 스위치). `docker0` 기반 통신 |
| **host** | `docker run --network host` | 호스트 네트워크를 직접 사용. **브리지 생성 안 함, veth 없음, NAT 없음** |
| **custom bridge** | `docker network create my-bridge` | 새 브리지 네트워크를 별도 생성 |

특성을 비교하면 선택 기준이 분명해진다.

| 유형 | 격리 | DNS | 성능 | 사용 목적 |
|---|---|---|---|---|
| bridge | O | ✗ | 보통 | 단순 테스트 |
| custom bridge | O | ✓ | 보통 | **실무 기본** |
| host | ✗ | ✗ | 최고 | 성능 최우선 |

**DNS 열이 이 표의 핵심이다.** 기본 `bridge`에는 DNS가 없고 custom bridge에만 있다. 교재의 문장이 정확하다.

> Custom Bridge는 DNS를 지원하는데 이것은 **Docker Network 내부에 DNS 서버가 자동으로 동작**하기 때문

이 내장 DNS의 주소가 `127.0.0.11`이다. [1일차 ⑤](/posts/skala-container-day1-webservice/)의 nginx 설정에서 봤던 그 주소다.

```nginx
location /api {
    resolver 127.0.0.11 valid=10s;
    set $backend "spring-backend:8080";
    proxy_pass http://$backend;
}
```

nginx는 자체 리졸버를 쓰므로 이 주소를 명시해 줘야 컨테이너 이름을 풀 수 있다.

{: .prompt-info }
> `host` 유형이 왜 veth도 NAT도 없는지는 [앞 편](/posts/skala-container-day2-runtime-runc/)의 실습에서 이미 확인했다. `config.json`의 `namespaces`에서 `network`를 지우면 컨테이너가 호스트의 인터페이스를 그대로 본다. 네트워크 네임스페이스를 안 만드는 것이므로 만들 가상 인터페이스도 없다.

## 브리지 구조

Docker는 컨테이너마다 가상 NIC를 할당하고, 기본 게이트웨이로 리눅스 브리지 `docker0`를 만든다.

```text
     Internet
        │
     Router
        │
    enp0s3 (L2 NIC)
        │
  Host IP stack (NAPT 처리)
        │
     docker0 (bridge)
        │
      veth (L2 가상 이더넷)
        │
      eth0 (L2 이더넷)
   Container 172.17.0.2
```

`docker0`가 하는 일은 둘이다.

- 외부 네트워크와 교환하는 패킷에 **NAT 작업 수행**
- **컨테이너 간 네트워크 연결**

각 컨테이너는 격리된 네트워크 공간을 갖고 `eth0`에 IP를 할당받는다. `docker0`를 포함한 브리지는 **L2 스위치 역할**을 하며 MAC 기반으로 `vethXX`와 `eth0`를 잇는다.

## 패킷은 어떻게 전달되는가

`-p 8888:8080` 한 줄이 실제로 무엇을 하는지 단계별로 따라간다. 호스트 `192.168.1.22:8888`로 들어온 요청이 컨테이너 `172.17.0.3:8080`에 닿는 경로다.

### 1. 호스트 물리 NIC 진입 → Netfilter가 낚아챈다

```text
외부 Client → eth0 → Netfilter PREROUTING → iptables NAT 규칙
             → 8888을 172.17.0.3:8080으로 DNAT
```

**Netfilter**가 [2일차 ⑦](/posts/skala-container-day2-kernel/)에서 나열한 커널 기능 중 하나다. 패킷을 가로채고 검사하고 변경한다. `-p` 옵션은 결국 여기에 iptables 규칙을 하나 넣는 일이다.

### 2. 커널 라우팅 테이블 조회 → docker0 결정

```text
DST IP: 172.17.0.3 → 커널 라우팅 테이블 조회
                   → 172.17.0.0/16 dev docker0
```

`172.17.0.0/16` 대역은 `docker0`로 보내라는 규칙이 있다.

### 3. docker0에 연결된 veth로 중계

```text
① 호스트 커널이 ARP/Neighbor 테이블에서 172.17.0.3의 MAC 주소
   (02:42:ac:11:00:03)를 확인
② 그 MAC을 destination으로 이더넷 프레임을 구성해 docker0로 전달
③ docker0가 FDB에서 해당 MAC의 브리지 포트(vethxxx)를 검색
④ docker0 → veth220960a → Container eth0 로 프레임 전달
```

용어 셋을 정리해 둔다.

- **Bridge Port**: 브리지에 연결되어 있는 네트워크 인터페이스
- **ARP(Neighbor) Table**: IP ↔ MAC 주소 매핑 테이블
- **FDB(Forwarding Database)**: MAC 주소 → 브리지 포트(veth) 매핑 테이블

L3(IP)로 어디로 보낼지 정하고, L2(MAC)로 어느 포트에 넣을지 정한다. 일반적인 스위치와 라우터의 동작을 커널 안에서 하는 것이다.

{: .prompt-info }
> 이 구조는 집의 무선 공유기와 같다. 공유기가 DHCP로 각 기기에 IP·서브넷 마스크·게이트웨이·DNS를 나눠 주고, 내부 사설 IP를 공인 IP로 NAPT 변환해서 인터넷에 내보낸다. `docker0`가 컨테이너에게 하는 일이 그것과 같다.

## CIDR 읽기

네트워크 대역 표기가 계속 나오므로 정리해 둔다.

```text
192.168.0.0/24

  192       168        0          0
   ↓         ↓         ↓          ↓
11000000 . 10101000 . 00000000 . 00000000

/24 → 11111111.11111111.11111111.00000000
      │←──────── 네트워크 ────────→│← 호스트 →│
```

- `192.168.0.0`: 네트워크 시작 주소
- `/24`: 앞의 24비트가 네트워크 부분
- 뒤 8비트가 호스트 → `00000000`~`11111111`, 총 256개
- 네트워크 주소와 브로드캐스트를 빼면 **실사용 254개**

예전에는 A/B/C 클래스로 나눴는데 비효율적이어서, CIDR은 **필요한 크기만큼 유연하게** 나누기 위해 쓴다.

`docker0`의 `172.17.0.0/16`은 앞 16비트가 네트워크이므로 뒤 16비트, 약 6만 5천 개 주소를 쓸 수 있다는 뜻이다.

## 컨테이너 간 통신 vs 외부 통신

Docker Network는 **단일 노드에서의 통신만** 정의한다. 이 한계가 뒤에서 중요해진다.

| 구분 | 방식 |
|---|---|
| **컨테이너 간 통신** | 동일 호스트 내 `docker0`에 접속한 컨테이너끼리 링크 |
| **컨테이너 ↔ 외부** | `docker0`와 호스트 물리 NIC 사이에서 DNAT (IP + PORT 변환) |

```bash
docker run -d -p 8080:80 nginx
```

이 한 줄이 DNAT 규칙을 만든다.

## 네트워크 다루기

```bash
docker network ls                        # 목록
docker network inspect <network-name>    # 어떤 컨테이너가 연결됐는지
docker network create --driver bridge skala

docker network rm <network-name>         # 특정 네트워크 삭제
docker network prune                     # 연결된 컨테이너가 없는 네트워크 삭제
docker network prune -f                  # 강제
```

컨테이너가 어느 네트워크에 붙었는지 확인한다.

```bash
docker inspect <container-name> | grep -i network -n
```

`grep`의 `-i`는 대소문자 무시, `-n`은 줄 번호 표시다.

## 쿠버네티스는 어떻게 다른가

Docker Network가 단일 노드용이라는 한계 때문에, 여러 노드에 퍼진 Pod를 잇는 별도 계층이 필요하다. 그것이 CNI(Container Network Interface)이고 대표 구현이 Calico다.

| 항목 | Docker Network | Calico |
|---|---|---|
| 대상 | 컨테이너 | Kubernetes Pod |
| 범위 | **단일 노드 중심** | **멀티 노드 기본** |
| 네트워크 생성 주체 | Docker Engine | Kubernetes + CNI |
| 서비스 디스커버리 | Docker DNS | CoreDNS |
| 보안 정책 | 제한적 | NetworkPolicy |

경로도 달라진다.

```text
단일 노드 내 통신:   eth0:veth → caliXXX:VR
외부 노드와 통신:    eth0:veth → caliXXX:VR → tunl0 → eth0
```

- **tunl0**: 리눅스 커널이 제공하는 IP-in-IP 터널 인터페이스. 다른 노드로 보낼 때 컨테이너 IP를 캡슐화하고 노드 IP 기반으로 통신한다
- **Virtual Router (BGP daemon)**: Pod IP CIDR 대역이 어느 노드에 있는지 알려 준다. 예: `10.1.2.0/24 → 192.168.100.20 eth0`
- **BGP(Border Gateway Protocol)**: L3(IP) 기반 경로 정보를 교환하는 라우팅 프로토콜

AWS는 VPC 네트워크를 쓰며 Calico도 함께 적용할 수 있다.

이 내용은 2주 뒤 쿠버네티스 과정의 예고편에 가깝다. 지금 단계에서는 **"Docker 네트워크는 한 대짜리"**라는 것만 확실히 해 두면 된다.

## 다시, 1일차의 질문으로

이제 처음 질문에 답할 수 있다.

```yaml
url: jdbc:mariadb://mariadb:3306/skala
```

이 설정이 동작하려면,

1. `mariadb`와 `spring-backend`가 **같은 커스텀 브리지**(`skala`)에 있어야 한다
2. 커스텀 브리지에는 Docker 내장 DNS(`127.0.0.11`)가 붙어 있어 `mariadb`라는 이름을 IP로 풀어 준다
3. 기본 `bridge`였다면 이름이 안 풀려서 접속에 실패했을 것이다

**IP를 직접 쓰지 않는 이유**도 분명하다. 컨테이너를 지우고 다시 만들면 IP가 바뀐다. 이름은 안 바뀐다. 그래서 nginx 설정에서도 `set $backend`로 변수를 거쳐 매 요청 이름을 다시 풀게 했다.

[다음 편](/posts/skala-container-day2-compose/)의 Docker Compose는 이 커스텀 브리지를 **자동으로 만들고 서비스 이름을 DNS에 등록**한다. `docker network create`를 손으로 칠 일이 없어진다.

## 수업 중 나온 질문

### Docker로 네트워크를 깊게 설계할 수도 있나

**가능하다.** 다만 한계가 뚜렷해서 실무에서는 어느 선까지만 간다.

할 수 있는 것부터 보면 이 정도다.

| 기능 | 쓰임 |
|---|---|
| 커스텀 브리지 여러 개 | 서비스 그룹별 망 분리 |
| `internal: true` | 외부로 나가는 경로 차단 |
| IPAM 지정 | 서브넷·게이트웨이·컨테이너 IP 고정 |
| `macvlan` / `ipvlan` | 컨테이너에 **물리망 IP를 직접** 부여 |
| `overlay` (Swarm) | **여러 노드**에 걸친 컨테이너 통신 |

IP를 고정하고 싶으면 이렇게 한다.

```bash
docker network create --driver bridge \
  --subnet 172.28.0.0/16 --gateway 172.28.0.1 mynet

docker run -d --name db --network mynet --ip 172.28.0.10 postgres:15
```

`macvlan`은 더 나아가서, 컨테이너가 **물리 스위치에서 별도 장비처럼** 보이게 한다.
레거시 시스템이 컨테이너를 일반 서버로 취급해야 할 때 쓴다.

```bash
docker network create -d macvlan \
  --subnet 192.168.1.0/24 --gateway 192.168.1.1 \
  -o parent=eth0 lan
```

### 그런데 왜 실무에서는 깊게 안 가나

**이식되지 않기 때문이다.**

이 장에서 본 대로 Docker Network는 **단일 노드**용이다.
여러 노드로 넘어가는 순간 쿠버네티스와 CNI(Calico, Cilium 등)가 그 역할을 가져간다.
그리고 CNI의 모델은 Docker Network와 다르다. Pod마다 IP가 있고,
접근 통제는 `NetworkPolicy`로 선언하며, 서비스 디스커버리는 CoreDNS가 맡는다.

Docker Network로 정교하게 설계해 둔 것이 쿠버네티스로 옮길 때 대부분 다시 쓰이지 못한다.
그래서 로컬 개발과 단일 노드 운영에서는 **커스텀 브리지 + 네트워크 분리** 정도로 끊고,
그 이상은 배포 플랫폼에 맡기는 것이 일반적이다.

`macvlan`처럼 물리망에 직접 붙이는 방식은 예외적으로 쓰인다.
IoT 게이트웨이, 방송 장비, 레거시 연동처럼 **컨테이너가 진짜 장비처럼 보여야 하는** 경우다.
클라우드에서는 대개 막혀 있다.

## 이 장에서 남는 것

- 기본 `bridge`에는 DNS가 없다. **커스텀 브리지에만 있다.** 실무 기본이 커스텀 브리지인 이유다.
- `-p 8888:8080`은 Netfilter에 DNAT 규칙을 넣는 일이다. 그 뒤로 라우팅 테이블이 `docker0`를, FDB가 veth를 고른다.
- `--network host`는 네트워크 네임스페이스를 만들지 않는 것이다. 그래서 격리도 없다.
- Docker Network는 **단일 노드**용이다. 멀티 노드는 CNI(Calico 등)의 영역이다.
