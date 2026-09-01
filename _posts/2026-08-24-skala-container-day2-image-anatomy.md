---
title: "[SKALA] 컨테이너 2일차 ⑥ — 이미지를 tar로 뜯어보기"
date: 2026-08-24 19:00:00 +0900
permalink: /posts/skala-container-day2-image-anatomy/
categories:
  - SKALA
  - Infra
tags: [skala, docker, image-layer, oci, manifest, tar]
description: "docker save로 이미지를 tar로 내려 manifest.json과 blobs를 직접 열어 본다. 각 레이어를 풀어 Dockerfile의 어떤 명령이 그 레이어를 만들었는지 역추적하는 실습을 정리한다."
---

## 2일차의 방향

1일차는 컨테이너를 **밖에서** 다뤘다. 이미지를 만들고, 실행하고, 볼륨을 붙이고, 신호를 주고받았다. 2일차는 같은 것을 **안에서** 확인한다. 첫 순서는 이미지다.

교재의 정의부터 본다.

> 나의 프로세스를 실행하기 위한 **OS 루트 파일시스템(rootfs)**과 앱 실행 환경을 **tar 레이어 단위로 직렬화**하여 **메타데이터**와 함께 묶어 놓은 배포용 패키지 아카이브

풀어 보면 세 조각이다. 파일들(rootfs), 그것을 나눠 담은 tar 레이어들, 그리고 그 위의 메타데이터. 이 장은 이 세 조각을 실제 파일로 확인한다.

## tar부터

이미지가 tar 묶음과 유사한 구조라는 것을 먼저 손으로 확인한다.

```bash
cd 00.sample-container
tar cvf sample-container.tar *      # 묶기
tar tvf sample-container.tar        # 목록 보기
```

| 옵션 | 의미 |
|---|---|
| `c` | create, 새로 묶는다 |
| `t` | list, 내용 목록만 본다 |
| `x` | extract, 푼다 |
| `v` | verbose, 처리 내역을 출력 |
| `f` | file, 대상 파일 이름을 지정 |

**tar은 압축하지 않는다.** 이름 그대로 여러 파일을 하나로 묶기만 한다(Tape ARchive).
그래서 `.tar` 파일은 원본을 합친 것보다 오히려 조금 크다 — 파일마다 헤더가 붙는다.

압축은 별개의 도구가 한다.

```bash
tar cf  archive.tar     dir/    # 묶기만 한다
tar czf archive.tar.gz  dir/    # z = gzip 을 함께 부른다
tar cJf archive.tar.xz  dir/    # J = xz
```

`tar czf`는 사실상 `tar cf - dir | gzip > archive.tar.gz`와 같다.
**`z`가 gzip을 호출한 것이지 tar이 압축한 것이 아니다.**
두 일을 나눠 둔 덕분에 압축 알고리즘을 갈아 끼울 수 있고, 압축 없이 스트림으로 흘려보낼 수도 있다.

서버 간에 파일을 옮길 때 tar로 묶는 관례도 여기서 나온다. 이유는 세 가지다.

- **파일 개수** — 작은 파일 수만 개를 하나씩 보내면 파일마다 왕복이 생긴다. 묶으면 스트림 한 번이다
- **메타데이터 보존** — 권한, 소유자, 타임스탬프, 심볼릭 링크를 그대로 담는다.
  단순 복사로는 실행 권한이 사라져 배포가 깨지는 일이 생긴다
- **중간 파일 없이 흘려보낼 수 있다**

```bash
tar cf - /src | ssh host 'tar xf - -C /dst'
```

다만 tar 자체는 **손상을 검출하지 못한다.** 무결성이 필요하면 체크섬을 따로 확인한다.
서버 간 반복 동기화라면 변경분만 보내고 재시도가 내장된 `rsync`가 더 맞는다.
tar은 **한 덩어리로 떠서 옮기는** 상황의 도구다.

`t`로 먼저 보고 `x`로 푸는 순서가 안전하다. 어디에 풀릴지 모르는 tar를 바로 `x`하면 현재 디렉터리가 어질러진다.

## 실습: 이미지를 파일로 내려보기

대상 이미지는 1일차에서 만든 것과 같은 구조다.

```dockerfile
# 참고: 01.answer-code/07.in-images/Dockerfile
ARG UBUNTU_VERSION=22.04
FROM ubuntu:${UBUNTU_VERSION}

RUN apt-get update && apt-get install -y curl lsb-release nginx
ARG UBUNTU_VERSION
RUN echo "현재 빌드에 사용된 ubuntu version: ${UBUNTU_VERSION}"

LABEL maintainer="himang10@gmail.com"
LABEL description="SKALA Linux Version"

EXPOSE 8080/tcp
EXPOSE 80/tcp

WORKDIR /var/www/html
COPY index.html .

CMD ["nginx", "-g", "daemon off;"]
```

빌드하고 tar로 저장한다.

```bash
docker build --tag indepth-container:1.0 .

mkdir indepth-container && cd indepth-container
docker save indepth-container:1.0 -o indepth-container.tar
```

`docker save`는 이미지를 **레지스트리 없이 파일 하나로** 내보낸다. 다른 장비에 옮겨 `docker load`로 넣을 수 있다. 여기서는 안을 보는 용도로 쓴다.

```bash
tar tvf indepth-container.tar     # 먼저 목록
tar xvf indepth-container.tar     # 풀기
ls
file *                            # 각 파일의 유형 확인
```

## manifest.json — 이미지의 목차

풀린 것 중 `manifest.json`이 출발점이다.

```bash
cat manifest.json | jq
```

```json
[
  {
    "Config": "blobs/sha256/19e1da3667ffa7305b54fb0ec640b156d87e4b948e1614f2e6a5eee8b89fe3ed",
    "RepoTags": [
      "indepth-container:1.0"
    ],
    "Layers": [
      "blobs/sha256/119d19e001bafa21919289095e1dbfac64f1e16d2469dd14c2d2a520039d26d9",
      "blobs/sha256/0655737b94e69d8feaadb404d3c32bf6054788b8a7bd799836335a13252e7c1f",
      "blobs/sha256/4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1",
      "blobs/sha256/4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1",
      "blobs/sha256/a1b97ad067fc4da50b167f14c5b3f46da3db6906061e5c187fd30ea57bfb9a40"
    ]
  }
]
```

세 필드가 전부다.

- **`Config`**: 컨테이너 실행 설정이 담긴 JSON의 위치
- **`RepoTags`**: 이 이미지의 이름과 태그
- **`Layers`**: 파일시스템 레이어들의 위치, **아래에서 위 순서**

[1일차 ③](/posts/skala-container-day1-dockerfile/)에서 명령어를 "레이어를 만드는 것"과 "설정만 남기는 것"으로 갈랐다. **그 두 그룹이 여기서 `Layers`와 `Config`로 정확히 나뉘어 있다.**

{: .prompt-info }
> `Layers` 배열에 같은 해시가 **두 번** 들어 있는 것이 보인다. `4f4fb700ef54...`가 3번째와 4번째에 중복된다. 파일시스템을 바꾸지 않는 명령(`WORKDIR`, `LABEL` 등)이나 아무것도 바꾸지 않은 `RUN`이 만든 **빈 레이어**는 동일한 해시를 갖는다. 같은 내용이면 같은 해시이므로 실제 저장은 한 번만 된다.

## blobs — 실제 내용물

```bash
cd blobs/sha256
file *
```

```text
1f2b5b930d87...: JSON data
231032373bb3...: gzip compressed data, was "bf05b927...tar", max compression
4f4fb700ef54...: gzip compressed data, truncated
57068f897ddf...: JSON data
60235ca8ca5d...: gzip compressed data, original size modulo 2^32 1679068
67d0c8eab99d...: JSON data
84fd2ce5dec3...: JSON data
a757628d7a05...: JSON data
aae59993f049...: gzip compressed data, original size modulo 2^32 3584
c56b5750cb2b...: JSON data
```

**이 `docker save` 출력에는 두 종류가 보인다.** `gzip compressed data`가 파일시스템 레이어이고, `JSON data`가 메타데이터다. 원본이 `.tar`였다는 것도 `file` 출력에 남아 있다.

앞에서 본 구분이 여기서 확인된다. **이 아카이브의 이미지 레이어는 gzip으로 압축된 tar**이고,
`file` 출력의 `was "bf05b927....tar"` 가 원본이 tar였다는 흔적이다.
묶는 일(tar)과 줄이는 일(gzip)이 나뉘어 있다는 것이 파일 헤더에 그대로 남아 있다.
OCI 규격 자체는 압축하지 않은 tar와 zstd로 압축한 tar 레이어도 허용한다.

이름이 전부 sha256 해시인 것도 의미가 있다. **내용이 같으면 이름이 같다.** 그래서 서로 다른 이미지가 같은 베이스를 쓰면 그 레이어는 디스크에 한 번만 저장되고, 레지스트리에서도 한 번만 전송된다. [1일차 ②](/posts/skala-container-day1-image-registry/)에서 본 "중복 다운로드 불필요"가 이 이름 규칙에서 나온다.

설정 JSON을 열어 본다.

```bash
cat blobs/sha256/19e1da3667ff... | jq
```

`ENV`, `ENTRYPOINT`, `CMD`, `WORKDIR`, `EXPOSE`, `LABEL` 등 [1일차 ③](/posts/skala-container-day1-dockerfile/)에서 "설정만 남기는 명령"으로 분류했던 것들이 여기 모여 있다.

## 실습: 레이어에서 Dockerfile을 역추적하기

이 장에서 가장 재미있는 부분이다. 레이어를 하나씩 풀어서 **어떤 명령이 그 레이어를 만들었는지** 맞춰 본다.

```bash
tar tvf blobs/sha256/<레이어 해시>
```

`manifest.json`의 `Layers` 배열을 **아래에서 위로** 읽으면 Dockerfile의 순서와 맞아떨어진다.

| Layers 순서 | 풀었을 때 보이는 것 | 대응하는 Dockerfile 명령 |
|---|---|---|
| 1번째 (맨 아래) | Ubuntu 루트 파일시스템 전체 | `FROM ubuntu:${UBUNTU_VERSION}` |
| 2번째 | `usr/`, `etc/` 아래 curl·nginx 관련 파일 다수 | `RUN apt-get update && apt-get install -y curl lsb-release nginx` |
| 3번째 | 거의 비어 있음 | `RUN echo "현재 빌드에 사용된 ubuntu version: ..."` |
| 4번째 | 거의 비어 있음 | `WORKDIR /var/www/html` |
| 5번째 (맨 위) | `var/www/html/index.html` 하나 | `COPY index.html .` |

마지막 레이어를 풀면 파일이 딱 하나 나온다.

```bash
tar tvf blobs/sha256/a1b97ad067fc...
# -rw-r--r-- 0/0  ...  var/www/html/index.html
```

`COPY index.html .` 한 줄이 만든 것이 이것뿐임이 눈에 보인다.

**여기서 레이어 최적화의 근거가 확인된다.** 애플리케이션 코드만 바꿔 다시 빌드하면 1~4번 레이어는 해시가 같으므로 재사용되고, 5번 레이어 하나만 새로 만들어져 전송된다. 반대로 `FROM`을 바꾸면 그 위 전부가 새로 만들어진다. [1일차 ③](/posts/skala-container-day1-dockerfile/)에서 "자주 바뀌는 것을 뒤에 둔다"고 한 이유다.

## 실습: 남이 만든 이미지도 같은 구조인가

직접 만든 이미지만으로는 우연일 수 있으므로 공개 이미지로도 확인한다.

```bash
docker pull mariadb:10.11

mkdir indepth-mariadb && cd indepth-mariadb
docker save mariadb:10.11 -o mariadb.tar
tar xvf mariadb.tar
cat manifest.json | jq
```

```json
{
  "Config": "blobs/sha256/b5898e2f8654...",
  "RepoTags": ["mariadb:10.11"],
  "Layers": [
    "blobs/sha256/69c262fc30fc...",
    "blobs/sha256/4a585ea2a801...",
    "blobs/sha256/986b7028e52e...",
    "blobs/sha256/9bf0665a0c3d...",
    "blobs/sha256/94b6ebcad19f...",
    "blobs/sha256/570cbed76d34...",
    "blobs/sha256/de133d0ba737...",
    "blobs/sha256/6eb575037686..."
  ]
}
```

레이어가 8개다. 이 이미지의 Dockerfile은 공개되어 있다.

- 이미지: <https://hub.docker.com/_/mariadb>
- Dockerfile: <https://github.com/MariaDB/mariadb-docker/blob/master/10.11/Dockerfile>

Dockerfile을 옆에 놓고 대조하면 레이어 순서가 그대로 대응한다.

```text
FROM ubuntu:jammy
RUN groupadd …
RUN set -eux; apt-get …
RUN mkdir /docker-entrypoint-initdb.d
RUN set -e; echo dev…
```

마지막 레이어를 풀면 이렇게 나온다.

```bash
tar tvf blobs/sha256/6eb575037686...
```

```text
drwxr-xr-x 0/0  usr/
drwxr-xr-x 0/0  usr/local/
drwxr-xr-x 0/0  usr/local/bin/
-rwxr-xr-x 0/0  26472  usr/local/bin/docker-entrypoint.sh
```

**진입 스크립트 하나다.** [1일차 ①](/posts/skala-container-day1-virtualization/)에서 `docker ps` 결과의 COMMAND 칼럼에 `docker-entrypoint.s…`라고 잘려 나오던 그 파일이다. MariaDB 컨테이너가 환경변수 `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`를 읽어 초기 DB를 만드는 일도 이 스크립트가 한다.

## Push와 Pull이 하는 일

이 구조를 알면 레지스트리 동작도 자연스럽다. Push는 **로컬에 있고 레지스트리에 없는 레이어만** 올린다. Pull은 **레지스트리에 있고 로컬에 없는 레이어만** 내린다. 판단 기준은 sha256 해시다.

`docker pull`을 돌릴 때 어떤 줄은 `Pull complete`이고 어떤 줄은 `Already exists`인 이유가 이것이다.

## 이 장에서 남는 것

- 이 `docker save` 아카이브는 `manifest.json`(목차) + `blobs/sha256/`(레이어 + JSON 설정)의 조합이다. OCI Image Layout 자체는 `oci-layout` + `index.json` + `blobs/` 구조다.
- `Layers`는 파일시스템을, `Config`는 실행 설정을 담는다. Dockerfile 명령어의 두 분류가 그대로 대응한다.
- 레이어 이름은 내용의 해시다. 그래서 중복 저장과 중복 전송이 자동으로 사라진다.
- `docker save` + `tar` + `jq`만으로 남의 이미지 구성도 확인할 수 있다.

다음 편에서는 이 레이어들이 실행 시점에 **어떻게 하나의 파일시스템으로 합쳐지는지**, 그리고 격리를 만드는 커널 기능이 무엇인지를 본다.
