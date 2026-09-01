---
title: "[SKALA] Full-Stack Engineering 1일차 — 웹 동작 원리와 HTML"
date: 2026-07-23 09:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, html, http, web, semantic-html, form, accessibility]
description: "인터넷과 웹의 차이, TCP/IP 계층과 HTTP 요청·응답 구조에서 출발해 HTML Element와 Attribute, Form, 미디어, 시맨틱 태그와 접근성까지 정리한다."
permalink: /posts/skala-frontend-day1/
---

1일차의 핵심은 태그를 외우는 것이 아니라 **브라우저가 무엇을 받아서 무엇을 그리는지** 이해하는 것이다. 주소창에 URL을 입력한 순간부터 화면에 글자가 나타나기까지의 경로를 따라가고, 그 경로의 마지막에 놓인 HTML 문서를 어떻게 구조화하는지를 정리한다.

## 인터넷과 웹은 같은 말이 아니다

일상에서는 두 단어를 섞어 쓰지만 계층이 다르다.

| 구분 | 인터넷 (Internet) | 웹 (World Wide Web) |
|---|---|---|
| 정의 | 전 세계 컴퓨터를 연결한 물리적 통신망 (인프라) | 그 위에서 정보를 공유하기 위해 만든 정보 공간 (서비스) |
| 구성 요소 | 케이블, 라우터, 스위치, 단말 (하드웨어) | HTML, HTTP, URL, 브라우저 (소프트웨어) |
| TCP/IP 기준 계층 | 하위 계층 중심 (인터넷·전송 계층) | 최상위 응용 계층 |
| 포함 관계 | 전체 인프라 | 인프라 위에서 도는 여러 서비스 중 하나 |

인터넷 위에서 도는 서비스는 웹만이 아니다. 이메일(SMTP), 파일 전송(FTP), 원격 접속(SSH)도 같은 인프라를 쓴다. 웹은 그중 **하이퍼링크로 문서를 연결하는 서비스**를 가리킨다.

웹은 세 가지 개념 위에 서 있다.

- **어떻게 주고받는가** → HTTP (HyperText Transfer Protocol)
- **어디에 있는가** → URL (Uniform Resource Locator)
- **무엇을 주고받는가** → HTML (HyperText Markup Language)

1일차의 내용은 정확히 이 세 가지를 순서대로 훑는 구성이다.

## 인터넷을 구성하는 물리적 요소

추상적인 "네트워크"라는 말 아래에는 세 종류의 실체가 있다.

**종단 시스템 (End System)**
네트워크의 가장자리에 있는 기기다. 서비스를 요청하는 쪽이 클라이언트(PC, 스마트폰), 요청에 응답하는 쪽이 서버(웹 서버, DB 서버)다. 각각 고유한 IP 주소를 할당받아 식별된다. 중요한 것은 클라이언트와 서버가 **하드웨어의 종류가 아니라 역할의 이름**이라는 점이다. 내 노트북에서 Live Server를 띄우면 그 노트북이 곧 서버다.

**전송 매체 (Transmission Media)**
신호가 실제로 이동하는 통로다. 유선은 광케이블·이더넷 케이블·해저 케이블, 무선은 Wi-Fi·5G/LTE·위성통신이다.

**네트워크 장비 (Network Equipment)**
데이터 조각(패킷)의 헤더를 읽고 다음 목적지로 넘겨주는 중계 장비다.

- **라우터(Router)**: 서로 **다른** 네트워크를 연결하고 최적 경로를 결정한다
- **스위치(Switch)**: **하나의** 네트워크 안에서 여러 기기를 연결하고 데이터를 분배한다

"다른 네트워크 간"인지 "같은 네트워크 안"인지가 둘을 가르는 기준이다.

## 프로토콜은 계층으로 나뉜다

네트워크 기능을 한 덩어리로 설계하면 일부만 바꾸기가 어렵다. 그래서 기능을 계층(Layer)으로 쪼개고, 각 계층이 바로 아래 계층의 서비스만 사용하도록 정의한다.

| 모델 | 성격 |
|---|---|
| OSI 7 Layer | 학술적·이론적 표준 모델. 구조를 이해하기 좋다 |
| TCP/IP 4 Layer | 실무 모델. 인터넷의 사실상 표준 |

TCP/IP 4계층과 각 계층의 데이터 단위(PDU, Protocol Data Unit)는 다음과 같다.

| 계층 | 역할 | 대표 프로토콜 | PDU |
|---|---|---|---|
| Application | 사용자 앱과 직접 상호작용 | HTTP, DNS, FTP, SMTP | Data / Message |
| Transport | 프로세스 간 통신과 port 기반 multiplexing | TCP, UDP | Segment (TCP) / Datagram (UDP) |
| Internet | 최적 경로 탐색과 논리 주소 부여 | IP, ICMP | Packet |
| Network Access | 물리 매체로 신호 전송 | Ethernet, Wi-Fi | Frame |

데이터는 위에서 아래로 내려가며 각 계층의 헤더가 하나씩 덧붙고(캡슐화), 수신 측에서는 반대로 하나씩 벗겨진다.

### Network Access Layer

OSI의 물리 계층과 데이터 링크 계층을 합친 계층이다. 데이터를 전기 신호로 바꿔 실제로 전송한다. 핵심 프로토콜은 유선의 **Ethernet**, 무선의 **Wi-Fi(IEEE 802.11)**다.

이 계층의 주소가 **MAC(Media Access Control) 주소**다. IP 주소가 "논리적 위치"라면 MAC 주소는 **하드웨어에 새겨진 물리적 식별자**다. 48비트(6바이트)를 16진수 12자리로 표기한다.

```text
IP 주소  : 논리적 · 네트워크 환경에 따라 바뀜   (예: 172.16.20.59)
MAC 주소 : 물리적 · 장비에 고정                (예: 8C-B0-E9-D8-30-A8)
```

### Internet Layer

논리 주소인 IP로 서로 다른 네트워크 간 통신을 가능하게 한다.

**IPv4와 IPv6**

- IPv4: `192.168.0.1`처럼 점으로 구분된 4개 숫자. 32비트로 약 43억 개 주소이며 사실상 고갈 상태다
- IPv6: `2001:0db8:85a3:0000:0000:8a2e:0370:7334` 형식. 128비트로 주소 고갈 문제를 해소했다

**공인 IP와 사설 IP**

- **공인 IP (Public IP)**: 전 세계 인터넷에서 유일하게 식별되는 주소
- **사설 IP (Private IP)**: 폐쇄된 내부 네트워크(LAN) 안에서만 유효한 주소
- **NAT (Network Address Translation)**: 라우터가 사설 IP를 공인 IP로 바꿔주는 기술. 하나의 공인 IP를 여러 기기가 나눠 쓸 수 있게 한다

터미널에서 `ipconfig /all`(Windows) 또는 `ifconfig`(macOS/Linux)로 확인되는 주소는 대개 **사설 IP**이고, "what is my IP" 같은 사이트가 알려주는 주소는 **공인 IP**다. 두 값이 다른 이유가 바로 NAT다.

### Transport Layer — TCP와 UDP

프로세스 사이의 종단 간 통신을 담당하는 계층이며, 여기서 TCP와 UDP가 갈린다. 신뢰성·순서 보장은 TCP가 제공하는 기능이고 UDP는 이를 보장하지 않는다.

| 구분 | TCP | UDP |
|---|---|---|
| 연결 | 연결 지향 (3-way handshake) | 비연결형 |
| 신뢰성 | 유실 시 재전송, 순서 보장 | 보장하지 않음 |
| 속도 | 상대적으로 느림, 오버헤드 큼 | 빠름, 헤더가 가벼움 |
| 용도 | HTTP/1.1·HTTP/2, 파일 전송(FTP), 이메일(SMTP) | HTTP/3의 QUIC, 실시간 스트리밍, 온라인 게임, DNS 질의 |

**TCP 3-way Handshake**는 데이터를 주고받기 전에 통신 통로를 확립하는 3단계다.

```text
Client → Server : SYN      (연결 요청)
Client ← Server : SYN + ACK (수락 + 역방향 연결 요청)
Client → Server : ACK      (연결 확립)
```

두 번이 아니라 세 번인 이유는 **양방향** 연결이기 때문이다. 클라이언트→서버 방향과 서버→클라이언트 방향 각각에 대해 "보낼 준비가 됐다"와 "받을 준비가 됐다"가 모두 확인되어야 한다.

현재 열려 있는 연결과 포트는 `netstat -an`(Windows) 또는 `lsof -i TCP -P -n`(macOS)으로 확인할 수 있다.

### Application Layer

사용자가 쓰는 앱과 직접 맞닿는 계층이다.

- **HTTP / HTTPS**: 브라우저와 서버 사이의 자원(HTML, CSS, JS, 이미지) 전송
- **DNS**: 도메인 이름을 IP 주소로 변환
- **FTP / SSH**: 파일 전송, 보안 원격 접속
- **SMTP / POP3 / IMAP**: 이메일 송수신

DNS 조회 결과는 `nslookup <도메인>`으로 직접 확인할 수 있다.

## 주소창에 URL을 입력하면 벌어지는 일

앞의 계층들을 하나의 시나리오로 이으면 다음과 같다.

```text
1. 사용자가 브라우저에 www.example.com 입력
2. 브라우저 → DNS 서버 : "이 도메인의 IP가 뭐야?"
   DNS 서버 → 브라우저 : "93.184.216.34"
3. 브라우저 ↔ 웹 서버   : HTTP/1.1·HTTP/2라면 TCP 연결, HTTP/3라면 UDP 기반 QUIC 연결 수립
4. 브라우저 → 웹 서버   : HTTP 요청 전송
5. 브라우저 ← 웹 서버   : HTTP 응답 (HTML/CSS/JS)
6. 브라우저 내부        : HTML/CSS/JS 파싱 및 렌더링
7. 사용자에게 화면 표시
```

개발자 도구의 **Network 탭**을 열고 아무 사이트나 들어가 보면 이 과정이 요청 단위로 기록된다. 문서 하나를 여는데도 수십 개의 요청이 발생하고, 각 요청마다 Headers/Preview/Response/Timing 탭에서 세부 내용을 볼 수 있다. 페이지가 느릴 때 "무엇이 느린가"를 판단하는 출발점이 이 탭이다.

## URL의 구조

URL은 자원의 위치를 나타내는 규약이며, 각 부분에 이름이 있다.

```text
http://www.codns.com:80/codns/codns.jsp?id=1
└─┬─┘  └──────┬──────┘└┬┘└────┬────┘└─┬─┘└─┬─┘
 프로토콜      호스트   포트  디렉터리  파일  쿼리스트링
```

- **프로토콜(scheme)**: `http`, `https` 등 통신 방식
- **호스트/도메인**: 서버의 위치. `www`(3차)·`codns`(2차)·`com`(최상위, TLD)로 나뉜다
- **포트**: 서버 내 어떤 프로세스인지. HTTP는 80, HTTPS는 443이 기본값이라 생략되는 경우가 많다
- **경로(path)**: 서버 내 자원의 위치
- **쿼리스트링**: `?key=value` 형식의 매개변수. `&`로 여러 개를 연결한다

쿼리스트링은 뒤에서 다룰 `<form method="get">`과 직접 연결된다. GET으로 폼을 전송하면 입력값이 이 자리에 붙는다.

## HTTP 요청과 응답

HTTP는 **클라이언트가 요청(Request)을 보내면 서버가 응답(Response)을 돌려주는** 단순한 구조다.

### Request

요청 메시지는 세 부분으로 구성된다.

1. **Request Line**: 메서드, URL, HTTP 버전
2. **Request Header**: `User-Agent`, `Content-Type`, `Accept` 등 부가 정보
3. **Request Body**: 서버로 보낼 데이터 (GET에는 보통 없음)

```text
POST /test/demo_form.php HTTP/1.1
Host: w3schools.com
Content-Type: application/x-www-form-urlencoded

name1=value1&name2=value2
```

**주요 HTTP 메서드**

| 메서드 | 의미 |
|---|---|
| GET | 지정한 자원을 조회한다 |
| POST | 서버로 데이터를 보내 자원을 생성/변경한다 |
| PUT | 자원을 통째로 교체한다 |
| PATCH | 자원의 일부를 수정한다 |
| DELETE | 자원을 삭제한다 |
| HEAD | 본문 없이 헤더만 조회한다 |
| OPTIONS | 사용 가능한 메서드를 조회한다 |

실무에서 압도적으로 자주 쓰는 것은 GET과 POST다. 결정적 차이는 메서드의 의미다. GET은 자원을 안전하게 조회하기 위한 메서드이고 HTML form의 GET 데이터는 URL 쿼리스트링에 인코딩된다. POST는 보통 본문(body)에 데이터를 담아 서버에 처리를 요청한다. 그래서 비밀번호를 GET으로 보내면 주소창과 서버 접근 로그에 그대로 남는다.

### Response와 상태 코드

응답 메시지도 세 부분이다.

1. **Status Line**: HTTP 버전, 상태 코드, 상태 메시지
2. **Response Header**: `Content-Type`, `Server` 등
3. **Response Body**: HTML, JSON 등 실제 내용

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Connection: keep-alive

{ "userId": 1, "id": 1, "completed": false }
```

**상태 코드는 첫 자리가 곧 분류**다.

| 분류 | 의미 | 예시 |
|---|---|---|
| 1xx | 정보 (처리 중) | 100 Continue |
| 2xx | 성공 | 200 OK, 201 Created |
| 3xx | 리다이렉션 | 301 Moved Permanently, 304 Not Modified |
| 4xx | 요청을 처리할 수 없는 클라이언트 오류 상태 | 400 Bad Request, 401 Unauthorized, 404 Not Found |
| 5xx | 서버가 요청 처리에 실패한 상태 | 500 Internal Server Error, 503 Service Unavailable |

4xx와 5xx를 구분하는 습관이 중요하다. 4xx는 요청이나 인증·권한·대상 자원을 먼저 확인하고, 5xx는 서버가 요청 처리에 실패한 원인을 먼저 확인한다.

### HTTPS는 무엇을 숨기고 무엇을 숨기지 못하는가

HTTPS는 HTTP에 SSL/TLS 암호화를 적용한 것이다. 여기서 흔히 오해하는 지점이 있다.

**암호화되는 것**

- Request Header, Request Body
- Response Header, Response Body
- 즉 URL의 경로, 쿼리스트링, 쿠키, 폼 입력값 전부

**기본적으로 노출될 수 있는 것**

- **목적지 IP 주소**
- 일반 DNS 질의와 TLS의 SNI에 포함된 호스트 이름. 다만 암호화 DNS와 ECH 사용 여부에 따라 가려질 수 있다

패킷을 배달하려면 목적지 IP 주소는 읽을 수 있어야 하기 때문이다. 정리하면 HTTPS는 경로·쿼리·헤더·본문을 가리지만 연결의 목적지에 관한 일부 정보까지 항상 모두 숨기지는 않는다고 이해하면 된다.

> 브라우저는 HTTPS를 쓰지 않는 사이트에 "안전하지 않음" 경고를 표시한다. Live Server로 여는 `127.0.0.1:5500`도 HTTP이므로 같은 경고가 뜨는데, 로컬 개발 환경에서는 정상이다.
{: .prompt-info }

## HTML이라는 언어

HTML은 웹 페이지를 만드는 표준 **마크업 언어**다. 이름 자체가 성격을 설명한다.

- **Hyper-text**: 링크를 통해 문서 사이를 이동할 수 있다
- **Markup Language**: 태그로 문서의 구조를 정의한다

여기서 자주 혼동되는 것이 Markdown과의 관계다.

| 구분 | Markup (HTML, XML) | Markdown |
|---|---|---|
| 목적 | 콘텐츠의 구조화와 표현 제어 | 텍스트 중심의 간단한 서식 |
| 문법 | 태그 기반, 상대적으로 복잡 | 기호 기반, 직관적 |
| 예시 | `<h1>제목</h1>` | `# 제목` |

Markdown은 Markup의 축약형 경량 언어이고, 결국 렌더링 단계에서 HTML로 변환된다. 지금 이 글도 Markdown으로 작성되어 HTML로 변환된 결과다.

### HTML의 역사

| 연도 | 사건 |
|---|---|
| 1989 | Tim Berners-Lee가 WWW 고안 |
| 1991 | HTML 최초 개발 |
| 1995 | HTML 2.0 표준화 (기본 폼·테이블 요소 추가) |
| 1997 | W3C 관리 시작, HTML 3.2 |
| 1999 | HTML 4.01 |
| 2000 | XHTML 1.0 |
| 2014 | **HTML5** — 멀티미디어 기본 지원, 시맨틱 태그 체계화 |
| 2017 | HTML 5.2 |

HTML5가 분기점인 이유는 두 가지다. 첫째, `<video>`·`<audio>`로 플러그인 없이 멀티미디어를 다룰 수 있게 됐다. 둘째, `<header>`·`<nav>`·`<article>` 같은 **시맨틱 태그**가 도입되어 `<div>` 범벅이던 마크업에 의미를 부여할 수 있게 됐다.

### 문서의 기본 골격

```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>프로그래밍 기초 - HTML</title>
  </head>
  <body>
    <h1>HTML 개요</h1>
  </body>
</html>
```

각 부분의 역할은 다음과 같다.

- `<!DOCTYPE html>`: 문서 형식 정의(DTD). 이 문서가 HTML5임을 선언한다
- `<html lang="ko">`: 문서의 시작과 끝. `lang` 속성은 스크린 리더의 발음과 번역 기능에 영향을 준다
- `<head>`: 문서에 **대한** 정보(메타데이터). 화면에 표시되지 않는다
- `<body>`: 브라우저에 실제로 표시할 내용

`<meta charset="UTF-8">`이 빠지면 한글이 깨질 수 있고, viewport 메타 태그가 빠지면 모바일 브라우저가 데스크톱 폭의 layout viewport를 가정해 페이지를 축소해서 보여줄 수 있다. 미디어 쿼리 자체가 멈추는 것은 아니지만 의도한 모바일 폭을 기준으로 동작하지 않게 된다. 둘 다 관례가 아니라 기능이다.

VS Code에서 `.html` 파일에 `!`를 입력하고 Tab을 누르면 Emmet이 이 뼈대를 자동 생성한다. Emmet은 이 외에도 `>`(자식), `+`(형제), `*`(반복), `.`/`#`(클래스/ID)를 조합할 수 있다.

```text
ul>li.item*3    →   <ul>
                      <li class="item"></li>
                      <li class="item"></li>
                      <li class="item"></li>
                    </ul>
```

## HTML Element와 Attribute

### Element

요소는 **시작 태그 + 내용 + 종료 태그**로 구성된다.

| 시작 태그 | 내용 | 종료 태그 |
|---|---|---|
| `<h1>` | My First Heading | `</h1>` |
| `<p>` | My first paragraph. | `</p>` |
| `<br>` | 없음 | 없음 |

`<br>`, `<hr>`, `<img>`, `<input>`처럼 내용이 없는 요소를 **빈 요소(empty element)**라 하고 종료 태그가 없다.

요소는 중첩될 수 있으며, HTML 태그 이름은 **대소문자를 구분하지 않는다**. 다만 관례상 소문자로 통일한다.

### Attribute

속성은 요소에 추가 정보를 준다.

- 모든 요소가 속성을 가질 수 있다
- 속성은 **항상 시작 태그에만** 쓴다
- 보통 `name="value"` 쌍으로 쓴다

```html
<a href="https://www.example.com">Visit Example</a>
<img src="cat.jpg" alt="창가에 앉은 고양이">
<p style="color:red;">This is a red paragraph.</p>
```

값을 감쌀 때는 큰따옴표가 일반적이지만 작은따옴표도 가능하다. 값 안에 따옴표가 들어가야 하면 서로 다른 종류를 섞어 쓴다.

```html
<p title="John 'ShotGun' Nelson">…</p>
```

### Global Attributes

모든 요소에서 쓸 수 있는 속성들이다.

| 속성 | 설명 |
|---|---|
| `id` | 문서 내 **고유** 식별자 |
| `class` | 여러 요소에 공유 가능한 이름 (공백으로 여러 개 지정) |
| `style` | 인라인 스타일 |
| `title` | 마우스를 올리면 툴팁으로 표시되는 부가 설명 |
| `lang` | 해당 요소 텍스트의 언어 |
| `hidden` | 렌더링하지 않음 |
| `tabindex` | 키보드 Tab 이동 순서 |
| `contenteditable` | 사용자가 내용을 편집 가능하게 함 |
| `draggable` | 드래그 가능 여부 |
| `spellcheck` | 맞춤법 검사 여부 |
| `dir` | 텍스트 방향 (`ltr`, `rtl`, `auto`) |
| `data-*` | 개발자가 임의로 정의하는 사용자 정의 데이터 |

`data-*`는 나중에 JavaScript에서 `element.dataset`으로 읽을 수 있어서, DOM 요소에 상태를 붙여두는 용도로 자주 쓰인다.

```html
<p data-name="spiderMan" data-hero="true">…</p>
```

### id와 class는 무엇이 다른가

문법이 아니라 **의도**가 다르다.

- `id`: 문서 내에서 **유일해야 한다**. "이 페이지의 그 요소 하나"를 가리킬 때 쓴다
- `class`: **중복 가능하다**. "같은 성격을 가진 요소들"을 묶을 때 쓴다

CSS에서는 `#id`와 `.class`로 각각 선택한다.

```html
<style>
  #myHeader { background-color: lightblue; padding: 40px; }
  .note     { font-size: 120%; color: red; }
</style>

<h1 id="myHeader">My Header</h1>
<p>This is some <span class="note">important</span> text.</p>
```

실무 기준은 단순하다. **스타일은 class로, JavaScript로 특정 요소 하나를 잡을 때는 id로.** id를 스타일에 쓰면 뒤에서 다룰 CSS 우선순위(specificity)가 불필요하게 높아져서 나중에 덮어쓰기 어려워진다.

## 텍스트를 구조화하는 태그

### 제목과 단락

`<h1>`부터 `<h6>`까지가 제목이고 숫자가 작을수록 상위다. 여기서 중요한 것은 크기가 아니라 **문서의 개요(outline)**다. 검색 엔진과 스크린 리더는 제목 태그의 계층으로 문서 구조를 파악한다. 글씨를 크게 하려고 `<h1>`을 쓰는 것은 잘못된 사용이고, 그건 CSS `font-size`가 할 일이다.

`<p>`는 단락이다. HTML은 소스 코드의 **연속된 공백과 줄바꿈을 하나의 공백으로 축약**한다.

```html
<p>
    이 문단은
    소스 코드에서 줄바꿈이 많지만
    브라우저는 이를 무시한다.
</p>
```

위 코드는 한 줄로 렌더링된다. 의도적으로 줄을 바꾸려면 `<br>`을, 공백과 줄바꿈을 그대로 보존하려면 `<pre>`를 쓴다.

`<hr>`은 주제의 전환을 나타내며 대개 수평선으로 그려진다. `<br>`과 `<hr>` 모두 빈 요소다.

### 서식 태그: 시각적 의미 vs 구조적 의미

여기가 초보자가 가장 많이 헷갈리는 지점이다. 화면상 결과가 같아 보이는 태그 쌍이 있다.

| 태그 | 렌더링 | 의미 |
|---|---|---|
| `<b>` | 굵게 | 단순히 시각적으로 굵게 |
| `<strong>` | 굵게 | **중요한** 내용 |
| `<i>` | 기울임 | 단순히 시각적으로 기울임 |
| `<em>` | 기울임 | **강조되는** 내용 |

`<strong>`과 `<em>`은 중요도와 강조의 의미를 접근성 트리에 전달하지만, 실제로 억양을 바꿔 읽는지는 스크린 리더와 설정에 따라 다르다. 의미상 강조라면 `<strong>`/`<em>`을 쓰는 것이 맞다.

그 외 자주 쓰는 서식 태그들이다.

```html
<p><small>작은 글씨</small></p>
<p>오늘 <mark>우유</mark> 사는 것 잊지 말 것.</p>
<p>내가 좋아하는 색은 <del>파랑</del> <ins>빨강</ins>.</p>
<p>H<sub>2</sub>O 와 x<sup>2</sup></p>
<p><code>console.log()</code> 는 코드 조각</p>
<blockquote cite="https://example.com">인용 문단</blockquote>
```

`<del>`/`<ins>`는 단순한 취소선·밑줄이 아니라 **삭제된 내용과 추가된 내용**이라는 편집 이력의 의미를 갖는다.

## Block과 Inline

모든 요소는 기본 `display` 값을 가지며, 이 값이 배치 방식을 결정한다.

| 구분 | Block | Inline |
|---|---|---|
| 배치 | 항상 새 줄에서 시작 | 같은 줄에 나란히 |
| 너비 | 기본적으로 가로 전체 차지 | 내용 크기만큼만 |
| `width`/`height` | 적용됨 | **무시됨** |
| `margin`/`padding` | 상하좌우 모두 반영 | 좌우만 레이아웃에 반영 |
| 대표 태그 | `div`, `p`, `h1~h6`, `ul`, `li`, `table`, `form`, `section` | `span`, `a`, `strong`, `em`, `img`, `input`, `label`, `button` |
| 용도 | 레이아웃 구성, 큰 영역 | 텍스트 일부 강조, 링크 |

인라인 요소에 세로 `padding`을 주면 배경색은 위아래로 넓어지지만 **주변 줄의 높이를 밀어내지 않아** 앞뒤 줄과 겹쳐 보인다. 인라인 요소의 크기를 조절해야 한다면 CSS `display: inline-block`을 써야 하는데, 이건 2일차에서 다룬다.

### div와 span

둘은 **의미가 없는 컨테이너**다. 스타일링이나 스크립트를 적용할 대상을 묶는 것이 유일한 목적이다.

- `<div>`: 블록 레벨 컨테이너. 영역을 나눌 때
- `<span>`: 인라인 컨테이너. 텍스트 일부를 감쌀 때

```html
<div style="background-color:#FFF4A3;">
  <h2>London</h2>
  <p>London is the capital city of England.</p>
</div>

<p>어머니는 <span style="color:blue;">파란</span> 눈을 가지셨다.</p>
```

의미가 없다는 것이 단점이기도 해서, 뒤에서 다룰 시맨틱 태그로 대체할 수 있으면 대체하는 것이 좋다.

## 링크

`<a>`는 하이퍼링크를 만든다. 웹을 웹답게 만드는 태그다.

```html
<a href="https://www.example.com/">Visit Example</a>
<a href="https://www.example.com/" target="_blank">새 탭에서 열기</a>
<a href="#chapter4">4장으로 이동</a>
...
<h2 id="chapter4">Chapter 4</h2>
```

- `href`: 링크의 목적지
- `target`: 문서가 열릴 위치
  - `_self` (기본값): 같은 탭
  - `_blank`: 새 탭/창
  - `_parent`, `_top`: 프레임 구조에서 사용

`href="#id"` 형식은 **북마크 링크**로, 같은 페이지 안의 특정 요소로 스크롤한다. 긴 문서의 목차를 만들 때 쓴다.

## 목록

**순서 없는 목록**은 `<ul>`, **순서 있는 목록**은 `<ol>`, 각 항목은 `<li>`다.

```html
<ol>
  <li>Coffee</li>
  <li>Tea
    <ul>
      <li>Black tea</li>
      <li>Green tea</li>
    </ul>
  </li>
  <li>Milk</li>
</ol>
```

목록은 이처럼 중첩할 수 있고, 중첩 목록은 부모 `<li>` **안에** 넣어야 한다. `<ol>`의 `type` 속성으로 마커를 바꿀 수 있고(`1`, `A`, `a`, `I`, `i`), `<ul>`의 마커는 CSS `list-style-type`(`disc`, `circle`, `square`, `none`)으로 바꾼다.

**설명 목록**은 용어와 정의의 쌍을 표현한다.

```html
<dl>
  <dt>HTML</dt>
  <dd>웹 페이지를 만드는 데 사용되는 마크업 언어</dd>
  <dt>CSS</dt>
  <dd>웹 페이지의 스타일을 정의하는 언어</dd>
</dl>
```

- `<dl>`: 목록 전체 (Description List)
- `<dt>`: 용어 (Term)
- `<dd>`: 설명 (Description)

## 표

표는 행과 열로 이루어진 셀의 집합이다.

| 태그 | 역할 |
|---|---|
| `<table>` | 표 전체 |
| `<thead>` | 머리글 영역 |
| `<tbody>` | 본문 데이터 영역 |
| `<tfoot>` | 바닥글 (합계·요약) |
| `<tr>` | 행 (Table Row) |
| `<th>` | 머리글 셀 (기본 굵은 글씨 + 가운데 정렬) |
| `<td>` | 데이터 셀 |

```html
<table>
  <thead>
    <tr>
      <th>이름</th>
      <th>나이</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>홍길동</td>
      <td>30</td>
    </tr>
  </tbody>
</table>
```

소규모 표는 `<tr>`/`<th>`/`<td>`만으로도 그려지지만, **접근성·유지보수·스타일링** 측면에서 `<thead>`/`<tbody>`/`<tfoot>`을 구분하는 편이 낫다. 스크린 리더가 머리글과 데이터를 연결해 읽어주고, CSS로 본문 행만 선택하기도 쉬워진다.

셀 병합은 `colspan`(가로), `rowspan`(세로) 속성으로 한다.

**표 스타일링은 HTML 속성이 아니라 CSS로 한다.**

| 항목 | HTML 속성 (지양) | CSS (권장) |
|---|---|---|
| 테두리 | `border` | `border`, `border-collapse` |
| 셀 간격 | `cellspacing` | `border-spacing` |
| 셀 여백 | `cellpadding` | `padding` |
| 정렬 | `align` | `text-align`, `margin` |
| 배경색 | `bgcolor` | `background-color` |

```css
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 8px; }
tr:nth-child(even) { background-color: #D6EEEE; }
```

`cellspacing` 같은 표현용 속성은 구식(deprecated)이며, 구조와 표현을 분리한다는 원칙에도 어긋난다.

## Form: 사용자 입력을 받는 유일한 표준 수단

`<form>`은 사용자 입력을 모아 서버로 전송하기 위한 컨테이너다.

### form 자체의 속성

| 속성 | 설명 |
|---|---|
| `action` | 폼 데이터를 전송할 목적지 URL |
| `method` | 전송에 사용할 HTTP 메서드 (`get` / `post`) |
| `enctype` | 데이터 인코딩 방식 (`method="post"`일 때만 유효) |
| `name` | 폼의 이름 |
| `novalidate` | 브라우저 기본 검증을 하지 않음 |
| `target` | 응답을 표시할 위치 |
| `autocomplete` | 자동완성 사용 여부 |

`method="get"`이면 입력값이 URL 쿼리스트링에 붙고, `method="post"`면 본문에 실린다. 앞서 URL 구조에서 본 쿼리스트링이 여기서 만들어진다. 파일 업로드를 하려면 `method="post"`와 `enctype="multipart/form-data"`가 함께 필요하다.

### input의 type

`<input>` 하나가 `type` 속성에 따라 전혀 다른 컨트롤이 된다.

| type | 설명 |
|---|---|
| `text` | 일반 텍스트 |
| `password` | 입력 내용을 가림 |
| `email` | 이메일 형식 검증 제공 |
| `number` | 숫자. `min`, `max`, `step` 사용 가능 |
| `tel` | 전화번호 (형식 검증은 없음) |
| `url` | URL 형식 검증 제공 |
| `date` | 날짜 선택기 |
| `color` | 색상 선택기 |
| `checkbox` | 다중 선택 |
| `radio` | 같은 `name` 그룹 내 단일 선택 |
| `range` | 슬라이더 |
| `file` | 파일 선택 |
| `hidden` | 화면에 보이지 않는 데이터 전송용 |

`radio`는 **`name` 속성이 같은 것들끼리 하나의 그룹**이 된다. 이름이 다르면 서로 배타적으로 동작하지 않으므로, 라디오 버튼이 여러 개 동시에 선택되는 버그는 대개 `name`이 달라서 생긴다.

### input의 검증 속성

HTML만으로도 상당한 수준의 입력 검증이 가능하다.

| 속성 | 설명 |
|---|---|
| `required` | 필수 입력 |
| `placeholder` | 입력 예시 힌트 |
| `value` | 초기값 |
| `minlength` / `maxlength` | 글자 수 제한 |
| `min` / `max` | 값의 범위 |
| `step` | 허용 간격 |
| `pattern` | 정규표현식 검증 |
| `readonly` | 읽기 전용 (값은 전송됨) |
| `disabled` | 비활성화 (값이 전송되지 **않음**) |
| `autofocus` | 로드 시 자동 포커스 |
| `list` | `<datalist>`와 연결해 자동완성 제공 |

`readonly`와 `disabled`의 차이는 **전송 여부**다. 값은 보여주되 서버로 보내야 한다면 `readonly`를 써야 한다.

> HTML 검증은 사용자 편의를 위한 1차 방어선일 뿐이다. 개발자 도구로 속성을 지우면 그만이므로, **서버 측 검증은 반드시 별도로 해야 한다.**
{: .prompt-warning }

`placeholder`는 라벨의 대체품이 아니다. 입력을 시작하면 사라지기 때문에 무엇을 입력하는 칸인지 알 수 없게 된다.

### label을 반드시 연결해야 하는 이유

`<label>`은 입력 필드의 설명이며, `for` 속성으로 `<input>`의 `id`와 연결한다.

```html
<label for="userId">아이디: </label>
<input type="text" id="userId" name="userId" required placeholder="4~15자 영문/숫자">
```

또는 `<label>`로 감싸는 방식도 가능하다.

```html
<label><input type="radio" name="gender" value="male" checked> 남성</label>
```

연결이 필요한 이유는 두 가지다.

1. **접근성**: 스크린 리더가 입력 필드에 포커스가 갔을 때 "무엇을 적는 칸인지" 읽어준다. 눈으로만 가까이 배치하는 것은 코드상 연결이 아니다
2. **사용성**: 라벨 텍스트를 클릭해도 해당 입력 필드가 포커스되거나 체크된다. 체크박스처럼 클릭 영역이 작은 컨트롤에서 특히 유용하다

### 그 외 폼 요소

| 태그 | 설명 |
|---|---|
| `<textarea>` | 여러 줄 텍스트 입력 (`rows`, `cols`) |
| `<select>` / `<option>` | 드롭다운 목록 |
| `<fieldset>` | 관련 입력 필드 그룹화 |
| `<legend>` | `<fieldset>`의 제목 |
| `<datalist>` | `<input>`에 자동완성 후보 제공 |
| `<output>` | 계산 결과 출력용 |

`<fieldset>`과 `<legend>`는 시각적 테두리 이상의 역할을 한다. 스크린 리더가 "이 입력들은 하나의 그룹"이라고 인식하게 해준다.

```html
<form action="signUpResult.html" method="get">
  <fieldset>
    <legend>계정 정보</legend>
    <p>
      <label for="userId">아이디: </label>
      <input type="text" id="userId" name="userId"
             minlength="4" maxlength="15" required placeholder="4~15자 영문/숫자">
      <small>(필수)</small>
    </p>
    <p>
      <label for="userEmail">이메일: </label>
      <input type="text" id="userEmail" name="userEmail" placeholder="example">
      @
      <select name="emailDomain">
        <option value="direct">직접 입력</option>
        <option value="naver.com">naver.com</option>
        <option value="gmail.com">gmail.com</option>
      </select>
    </p>
  </fieldset>

  <input type="submit" value="동의하고 회원가입">
  <input type="reset" value="다시 작성">
</form>
```

### button의 type 함정

`<button>`의 `type` 기본값은 **`submit`**이다.

- `type="submit"`: 폼을 전송한다 (기본값)
- `type="reset"`: 모든 폼 필드를 초기화한다
- `type="button"`: 아무것도 하지 않는다. JavaScript로 동작을 붙일 때 사용

`<form>` 안에 `type`을 지정하지 않은 버튼을 넣고 JavaScript 클릭 핸들러를 달면, 핸들러가 실행되는 동시에 폼이 전송되어 페이지가 새로고침된다. 이때 원인을 못 찾고 헤매기 쉽다. **폼 안의 일반 버튼에는 `type="button"`을 명시하는 습관**이 안전하다.

## 미디어 삽입

### img

```html
<img src="cat.jpg" alt="창가에 앉은 고양이" style="width:104px;height:142px;">
```

`<img>`의 필수 속성은 두 개다.

- `src`: 이미지 경로
- `alt`: 대체 텍스트

`alt`는 선택이 아니다. 이미지가 로드되지 않았을 때 대신 표시되고, 스크린 리더가 이미지를 설명하는 유일한 근거이며, 검색 엔진이 이미지를 이해하는 수단이다. 순수 장식용 이미지라면 `alt=""`로 비워서 "읽지 않아도 되는 이미지"임을 명시한다.

`width`/`height` 속성으로 이미지의 고유 크기와 종횡비를 알려주면 브라우저가 로딩 전에 공간을 예약할 수 있다. 반응형 표현은 `max-width: 100%; height: auto;` 같은 CSS로 조절한다.

### picture

화면 크기나 기기에 따라 다른 이미지를 제공한다.

```html
<picture>
  <source media="(min-width: 650px)" srcset="img_food.jpg">
  <source media="(min-width: 465px)" srcset="img_car.jpg">
  <img src="img_girl.jpg" alt="기본 이미지">
</picture>
```

브라우저는 위에서부터 조건을 검사해 **처음 만족하는 `<source>`**를 사용한다. `<picture>`의 **마지막 자식은 반드시 `<img>`**여야 한다. 조건을 아무것도 만족하지 못했을 때의 기본값이자, `<picture>`를 지원하지 않는 브라우저의 대비책이다.

### audio와 video

```html
<audio controls>
  <source src="horse.ogg" type="audio/ogg">
  <source src="horse.mp3" type="audio/mpeg">
  이 브라우저는 audio 요소를 지원하지 않습니다.
</audio>

<video width="320" height="240" controls poster="thumbnail.jpg">
  <source src="movie.mp4" type="video/mp4">
  <source src="movie.ogg" type="video/ogg">
  이 브라우저는 video 요소를 지원하지 않습니다.
</video>
```

공통 속성은 다음과 같다.

- `controls`: 재생/일시정지/볼륨 기본 컨트롤 표시
- `autoplay`: 자동 재생 (대부분의 브라우저가 소리 있는 자동 재생을 차단한다)
- `loop`: 반복 재생
- `muted`: 음소거
- `poster` (video): 로딩 전 표시할 대표 이미지

여러 `<source>`를 두는 이유는 브라우저마다 지원 코덱이 다르기 때문이다. 브라우저는 **처음으로 인식 가능한 형식**을 사용한다. 태그 사이의 텍스트는 요소를 지원하지 않는 브라우저에서만 표시되는 대체 문구다.

## Semantic Tag

시맨틱 요소란 **이름 자체가 역할을 설명하는 요소**다.

- 비시맨틱: `<div>`, `<span>` — 아무 의미 없음
- 시맨틱: `<table>`, `<article>`, `<nav>` — 무엇인지 드러남

| 태그 | 역할 |
|---|---|
| `<header>` | 문서나 섹션의 머리글 |
| `<nav>` | 내비게이션 링크 영역 |
| `<main>` | 문서의 주요 콘텐츠 (문서당 하나) |
| `<section>` | 주제로 묶이는 영역 |
| `<article>` | 그 자체로 독립적으로 의미가 성립하는 콘텐츠 |
| `<aside>` | 본문과 간접적으로 관련된 부가 콘텐츠 (사이드바) |
| `<footer>` | 문서나 섹션의 바닥글 |
| `<figure>` | 이미지·도표·코드 등 삽입 콘텐츠 묶음 |
| `<figcaption>` | `<figure>`의 캡션 |

같은 레이아웃을 두 방식으로 표현하면 차이가 분명해진다.

```html
<!-- 비시맨틱 -->
<div id="header">...</div>
<div id="nav">...</div>
<div id="main">
  <div class="article">...</div>
</div>
<div id="footer">...</div>

<!-- 시맨틱 -->
<header>...</header>
<nav>...</nav>
<main>
  <article>...</article>
</main>
<footer>...</footer>
```

렌더링 결과는 동일하지만 얻는 것이 다르다.

1. **가독성**: 구조가 코드에 드러나 유지보수가 쉽다
2. **접근성**: 스크린 리더가 "본문으로 건너뛰기", "내비게이션 영역" 같은 탐색을 지원한다
3. **SEO**: 검색 엔진이 어느 부분이 핵심 콘텐츠인지 파악한다

`<section>`과 `<article>`의 구분은 자주 헷갈리는데, 기준은 **떼어놔도 말이 되는가**다. 블로그 글 하나, 뉴스 기사 하나, 댓글 하나는 독립적으로 배포해도 의미가 성립하므로 `<article>`이다. "관련 글 목록"처럼 주변 맥락이 있어야 의미가 있는 묶음은 `<section>`이다.

## 인용과 약어

```html
<p>WWF 웹사이트의 인용:</p>
<blockquote cite="http://www.worldwildlife.org/who/index.html">
  For 60 years, WWF has worked to help people and nature thrive.
</blockquote>

<p><abbr title="World Health Organization">WHO</abbr>는 1948년에 설립되었다.</p>
```

- `<blockquote>`: 다른 출처에서 인용한 문단. `cite` 속성에 출처 URL을 남긴다
- `<abbr>`: 약어. `title`에 전체 표현을 적으면 마우스 오버 시 표시된다

## head에 들어가는 것들

`<head>`는 문서에 **대한** 정보를 담는 컨테이너이며 화면에 표시되지 않는다.

| 요소 | 역할 |
|---|---|
| `<title>` | 브라우저 탭에 표시되는 제목 (**필수**) |
| `<meta>` | 문자셋, 페이지 설명, 키워드, viewport 등 메타데이터 |
| `<link>` | 외부 리소스 연결 (주로 CSS) |
| `<style>` | 문서 내부 스타일 정의 |
| `<script>` | JavaScript 삽입 또는 외부 스크립트 연결 |
| `<base>` | 문서 내 모든 상대 URL의 기준 경로 |

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="검색 결과에 표시될 페이지 설명">
  <title>페이지 제목</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
```

`<title>`과 `<meta name="description">`은 검색 결과의 제목과 설명을 정할 때 쓰이는 후보 신호다. 검색 엔진이 검색어와 페이지 내용에 따라 제목이나 설명을 다시 작성할 수도 있다.

주석은 `<!-- -->`로 작성하며, 브라우저에 표시되지 않지만 **소스 보기로는 그대로 노출된다**. 민감한 정보를 주석에 남기면 안 된다.

## 접근성

웹 접근성(Web Accessibility)은 시각·청각·지체 장애가 있는 사용자를 포함해 **누구도 웹사이트 이용에서 배제되지 않도록** 문서를 표준에 맞게 작성하는 것이다. 1일차 내용을 접근성 관점으로 다시 묶으면 다음과 같다.

- **시맨틱 태그를 쓴다** — 스크린 리더가 문서 구조를 정확히 파악한다
- **제목 태그로 계층을 만든다** — `h1` 다음에 `h3`로 건너뛰지 않는다
- **`<img>`에 `alt`를 반드시 적는다** — 이미지의 내용을 말로 설명한다
- **`<label>`과 `<input>`을 `for`/`id`로 연결한다** — 눈으로만 가까이 두는 것은 연결이 아니다

접근성은 별도의 기능을 추가하는 일이 아니다. **HTML을 원래 용도대로 쓰면 대부분 자동으로 따라온다.** 반대로 모든 것을 `<div>`로 만들고 CSS로 모양만 흉내 내면, 그때부터 접근성을 위한 별도 작업이 필요해진다. 이것이 시맨틱 마크업을 강조하는 실질적인 이유다.

## 정리

1일차를 한 줄로 요약하면 **"HTML은 꾸미는 언어가 아니라 의미를 부여하는 언어"**다.

- 인터넷은 인프라, 웹은 그 위의 서비스다. 웹은 HTTP·URL·HTML 세 축으로 동작한다
- 브라우저 주소창의 한 번의 입력 뒤에는 DNS 조회 → TCP 또는 QUIC 연결 → HTTP 요청·응답 → 렌더링이 있다
- HTTPS는 내용을 가리지만 목적지 IP는 가리지 못하고, 호스트 이름 노출은 암호화 DNS·ECH 사용 여부에 따라 달라진다
- 태그 선택의 기준은 "어떻게 보이는가"가 아니라 "무엇인가"다. `<b>`가 아니라 `<strong>`, `<div>`가 아니라 `<article>`
- 폼의 검증 속성은 편의 기능이고, 실제 방어는 서버에서 한다
- 접근성은 부가 기능이 아니라 올바른 마크업의 부산물이다

지금까지의 문서는 구조만 있고 표현이 없다. 브라우저 기본 스타일에 의존하고 있어서 어떤 페이지든 비슷하게 생겼다. 2일차에서는 여기에 CSS로 표현을 입히고 JavaScript로 동작을 붙인다.

---

시리즈 안내: [Full-Stack Engineering: HTML, CSS, JavaScript — 2일 학습 로드맵](/posts/skala-frontend-roadmap/)

다음 글: [2일차 — CSS 레이아웃과 JavaScript](/posts/skala-frontend-day2/)
