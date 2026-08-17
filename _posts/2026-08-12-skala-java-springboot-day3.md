---
title: "[SKALA] Java, SpringBoot, Rest API 구현 3일차 — 객체 설계에서 REST API 서버까지"
date: 2026-08-12 21:00:00 +0900
permalink: /posts/skala-java-springboot-day3/
categories:
  - SKALA
  - Backend
tags: [skala, solid, rest-api, springboot, http]
description: "생성 디자인 패턴과 SOLID 원칙에서 출발해 TCP 소켓 위에 HTTP가 구성되는 과정을 살펴보고, Spring Boot의 Controller-Service-Repository 구조로 REST API 서버의 골격을 정리한다."
---

> 이 날(8월 12일)은 정보처리기사 시험 응시로 교육에 참석하지 못했다. 따라서 이 글은 강의를 들은 기록이 아니라 **배포된 강의자료를 따로 읽고 정리한 내용**이다. 현장에서 오간 질문과 부연은 담기지 않았다.
{: .prompt-info }

## 객체 내부의 설계에서 웹 요청의 흐름까지

2일차에는 상속과 인터페이스로 구현을 교체하는 방법, 컬렉션과 스트림으로 데이터를 다루는 방법, 리플렉션과 애노테이션으로 런타임의 클래스 정보를 읽는 방법을 다뤘다. 하지만 언어 기능을 사용할 수 있다는 것만으로 변경에 강한 애플리케이션이 만들어지지는 않는다. 객체를 어디에서 생성하고, 각 클래스가 어느 책임을 맡으며, 서로 어떤 추상화에 의존할지를 결정하는 설계가 필요하다.

3일차의 흐름은 객체 생성 패턴과 SOLID 원칙에서 시작해 TCP 소켓과 HTTP를 거쳐 Spring Boot의 계층형 REST API로 이어진다. 언뜻 보면 객체지향 설계와 네트워크 프로그래밍은 서로 다른 주제처럼 보이지만, 서버 입장에서는 하나의 문제로 연결된다. 네트워크를 통해 들어온 요청을 해석한 다음, 적절한 객체에 책임을 분배하고, 처리 결과를 다시 HTTP 응답으로 반환해야 하기 때문이다.

```text
객체 생성 정책 분리
    ↓
클래스의 책임과 의존 관계 정리
    ↓
TCP 연결 위에서 HTTP 요청·응답 교환
    ↓
REST 원칙으로 자원과 행위 설계
    ↓
Spring MVC 계층에 요청 처리 책임 배치
```

## 객체 생성도 하나의 설계 책임이다

객체를 생성하는 가장 단순한 방법은 필요한 위치에서 생성자를 직접 호출하는 것이다. 객체의 필드가 적고 생성 규칙이 단순하다면 이것만으로 충분하다. 그러나 생성자 매개변수가 많아지거나 객체 종류에 따라 생성 절차가 달라지면 호출 코드가 생성 규칙을 지나치게 많이 알아야 한다.

```java
User user = new User("ji-seok", 30);
```

위와 같은 호출은 짧지만 두 번째 값이 무엇을 의미하는지 호출부만 보고 바로 파악하기 어렵다. 필수 값과 선택 값이 늘어날수록 인자의 순서를 바꾸는 실수도 발생하기 쉽다. 생성 디자인 패턴은 이처럼 객체를 만드는 정책이 사용 코드 전체로 퍼지는 문제를 해결한다.

### 빌더 패턴: 복잡한 생성자를 읽을 수 있는 과정으로 바꾸기

빌더(Builder)는 객체의 속성을 단계별로 설정하고 마지막에 `build()`를 호출해 객체를 완성한다. 각 메서드 이름이 값의 의미를 드러내기 때문에 매개변수가 많은 생성자보다 호출 의도가 명확하다.

```java
public class User {
    private final String name;
    private final int age;

    private User(Builder builder) {
        this.name = builder.name;
        this.age = builder.age;
    }

    public static class Builder {
        private String name;
        private int age;

        public Builder name(String name) {
            this.name = name;
            return this;
        }

        public Builder age(int age) {
            this.age = age;
            return this;
        }

        public User build() {
            return new User(this);
        }
    }
}
```

호출부에서는 속성 이름과 값이 나란히 나타난다.

```java
User user = new User.Builder()
    .name("ji-seok")
    .age(30)
    .build();
```

메서드가 `this`를 반환하므로 연속적인 메서드 체이닝이 가능하다. 완성된 `User`의 필드를 `final`로 두고 생성자를 `private`으로 제한하면 외부에서 불완전한 객체를 직접 만들거나 생성 이후 상태를 임의로 바꾸는 경로도 줄일 수 있다.

다만 빌더는 모든 객체에 자동으로 적용해야 하는 문법이 아니다. 생성해야 할 값이 적고 생성 규칙도 단순한 객체라면 별도의 빌더 클래스가 오히려 구조를 복잡하게 만든다. 빌더의 가치는 생성 과정에 이름을 붙여야 하거나, 필수 값과 선택 값을 구분해야 하거나, 불변 객체의 조립 과정이 길어질 때 커진다.

### 팩토리와 싱글톤: 생성 위치와 인스턴스 수를 통제하기

팩토리 메서드(Factory Method)는 어떤 구현 객체를 만들지 결정하는 책임을 사용 코드에서 분리한다. 객체를 사용하는 쪽이 구체 클래스의 생성 과정을 모두 알 필요가 없어지므로, 구현을 추가하거나 생성 정책을 바꿀 때 변경 범위를 줄일 수 있다. 추상 팩토리(Abstract Factory)는 서로 관련된 객체 묶음의 생성 책임까지 추상화하는 방향으로 확장된다.

싱글톤(Singleton)은 JVM 안에서 하나의 인스턴스만 생성되도록 제한하는 패턴이다. 생성자를 `private`으로 감추고 정적 인스턴스를 통해 접근 경로를 통제하는 방식이다. 인스턴스가 하나라는 특성은 편리하지만, 여러 스레드가 같은 객체를 공유한다는 뜻이기도 하다.

> 싱글톤 객체에 요청별 가변 상태를 저장하면 여러 스레드가 같은 필드를 동시에 변경할 수 있다. 따라서 싱글톤은 가능한 한 상태를 갖지 않는 무상태(stateless) 객체로 설계해야 한다.
{: .prompt-warning }

생성 패턴의 공통 목적은 `new`를 없애는 데 있지 않다. 객체가 어떻게 만들어지는지를 알아야 하는 코드의 범위를 제한하고, 생성 규칙이 바뀌었을 때 수정할 위치를 한곳으로 모으는 데 있다.

## SOLID: 변경의 파급 범위를 줄이는 다섯 가지 기준

SOLID는 클래스 수를 늘리기 위한 규칙이 아니라 변경이 들어왔을 때 어떤 코드가 함께 흔들리는지를 점검하는 기준이다. 높은 응집도와 낮은 결합도라는 목표를 객체 수준에서 구체적으로 판단할 수 있게 해 준다.

### SRP: 한 클래스에 변경 이유를 섞지 않는다

단일 책임 원칙(Single Responsibility Principle)은 하나의 클래스가 하나의 변경 이유를 가져야 한다는 원칙이다. 여기서 책임을 단순히 “메서드 하나”로 해석하면 클래스가 지나치게 잘게 쪼개질 수 있다. 중요한 것은 서로 다른 변화 축을 한 클래스에 섞지 않는 것이다.

예를 들어 HTTP 요청을 읽는 코드가 회원 규칙을 판단하고 데이터 저장까지 모두 담당한다면 다음 변경이 하나의 클래스에 집중된다.

```text
요청 형식 변경 ─┐
회원 정책 변경 ─┼→ 하나의 클래스 수정
저장 방식 변경 ─┘
```

이를 요청 처리, 비즈니스 로직, 데이터 접근 책임으로 분리하면 각 변경이 향하는 위치가 달라진다. 뒤에서 살펴볼 Controller-Service-Repository 구조가 바로 이 원칙을 웹 애플리케이션 계층에 적용한 형태다.

### OCP: 새 구현을 추가하되 기존 흐름은 덜 고친다

개방-폐쇄 원칙(Open-Closed Principle)은 확장에는 열려 있고 기존 코드 수정에는 닫혀 있어야 한다는 원칙이다. 결제 수단을 조건문으로 구분하면 새로운 결제 방식이 추가될 때마다 서비스의 분기문을 수정해야 한다.

```java
public interface Payment {
    void pay();
}

public class CardPayment implements Payment {
    @Override
    public void pay() {
        // 카드 결제 처리
    }
}

public class PaymentService {
    public void process(Payment payment) {
        payment.pay();
    }
}
```

`PaymentService`가 구체적인 결제 수단이 아니라 `Payment` 인터페이스를 사용하면 카드, 카카오페이, 네이버페이 구현을 추가하더라도 서비스의 핵심 호출 구조를 유지할 수 있다. 다형성이 문법을 넘어 변경 비용을 줄이는 설계 도구가 되는 지점이다.

### LSP: 상위 타입의 약속을 하위 타입이 깨지 않는다

리스코프 치환 원칙(Liskov Substitution Principle)은 하위 타입의 객체를 상위 타입 위치에 넣어도 프로그램이 기대한 규약이 유지되어야 한다는 원칙이다. 상속 문법이 허용된다는 사실만으로 올바른 하위 타입 관계가 성립하는 것은 아니다.

직사각형과 정사각형을 단순한 필드 재사용 관점에서 상속으로 연결하면 너비와 높이를 독립적으로 바꾼다는 직사각형의 기대와, 두 길이가 항상 같아야 한다는 정사각형의 제약이 충돌할 수 있다. 이 경우 두 도형을 억지로 부모·자식 관계로 만드는 대신 공통 동작을 `Shape` 인터페이스로 정의하고 각각 구현하는 편이 규약을 보존하기 쉽다.

LSP는 “현실에서 A가 B의 한 종류인가”만 묻는 원칙이 아니다. 코드에서 상위 타입이 약속한 상태 변화와 동작을 하위 타입이 그대로 지킬 수 있는지를 묻는다.

### ISP: 사용하지 않는 기능까지 의존하게 만들지 않는다

인터페이스 분리 원칙(Interface Segregation Principle)은 하나의 거대한 인터페이스보다 역할별로 작은 인터페이스를 제공해야 한다는 원칙이다. 구현 클래스가 사용하지 않는 메서드까지 억지로 구현한다면 인터페이스가 여러 책임을 한데 묶고 있다는 신호다.

```text
큰 장치 인터페이스
 ├─ 입력 기능
 ├─ 출력 기능
 └─ 사용하지 않는 기능까지 구현 강제

역할별 인터페이스
 ├─ InputDevice
 └─ OutputDevice
```

다만 인터페이스를 무조건 잘게 나누면 파일과 의존 관계만 늘어날 수 있다. 실제 사용자가 서로 다른 기능 묶음을 필요로 하는지, 독립적으로 변경될 가능성이 있는지를 기준으로 분리해야 한다.

### DIP: 정책이 세부 구현을 직접 알지 않게 한다

의존 역전 원칙(Dependency Inversion Principle)은 고수준 모듈이 저수준 구현 클래스가 아니라 추상화에 의존해야 한다는 원칙이다. 예를 들어 `Computer`가 특정 키보드나 모니터 클래스를 직접 생성하고 사용하면 장치 교체가 곧 `Computer`의 수정으로 이어진다.

```java
public class Computer {
    private final InputDevice inputDevice;
    private final OutputDevice outputDevice;

    public Computer(
        InputDevice inputDevice,
        OutputDevice outputDevice
    ) {
        this.inputDevice = inputDevice;
        this.outputDevice = outputDevice;
    }
}
```

`Computer`가 `InputDevice`와 `OutputDevice`라는 역할에 의존하면 세부 장치를 교체하더라도 고수준 로직의 변경을 줄일 수 있다. OCP가 확장 시 기존 코드를 덜 수정하는 결과에 가깝다면, DIP는 그 결과를 가능하게 만드는 의존 관계의 방향에 가깝다.

```text
고수준 정책 → 구체 구현
```

위 방향을 다음처럼 바꾸는 것이 핵심이다.

```text
고수준 정책 → 추상화 ← 구체 구현
```

SOLID는 서로 독립된 체크리스트가 아니다. SRP로 책임을 나누고, ISP로 역할의 경계를 작게 만들고, DIP로 추상화에 의존하면 새로운 구현을 추가할 때 OCP를 지키기 쉬워진다. 그리고 모든 구현이 상위 타입의 규약을 지켜야 LSP가 유지된다.

## TCP 소켓에서 HTTP 메시지까지

객체 설계를 서버로 확장하려면 먼저 클라이언트의 요청이 프로그램에 도착하는 과정을 이해해야 한다. TCP 소켓 프로그래밍에서는 프레임워크가 감춰 주는 연결과 입출력 스트림을 직접 다룬다.

서버는 `ServerSocket`으로 특정 포트를 열고 `accept()`에서 클라이언트 연결을 기다린다. 연결이 성립하면 통신용 `Socket`이 만들어지고, 서버는 `getInputStream()`과 `getOutputStream()`을 통해 데이터를 읽고 쓴다.

```text
클라이언트
   │ TCP 연결 요청
   ▼
ServerSocket.accept()
   │ 연결별 Socket 생성
   ▼
InputStream으로 요청 읽기
   │
요청 처리
   │
OutputStream으로 응답 쓰기
   ▼
스트림과 Socket 닫기
```

TCP가 제공하는 것은 연결된 양 끝 사이의 바이트 스트림이다. 이 바이트를 어떤 구조로 해석할지는 상위 프로토콜이 결정한다. HTTP 서버를 구현하려면 입력 스트림에서 읽은 내용을 HTTP 메시지 규칙에 맞춰 나누어야 한다.

```text
GET /users HTTP/1.1\r\n
Host: localhost:8080\r\n
\r\n
```

서버가 우선 읽어야 하는 시작 라인에는 HTTP 메서드, URI, 버전이 들어 있다. 이어지는 각 줄은 헤더이며, 빈 줄이 나오면 헤더가 끝났음을 알 수 있다. 본문이 있는 요청이라면 그 뒤의 데이터를 처리한다.

응답도 같은 방식으로 시작 라인, 헤더, 빈 줄, 본문의 순서를 맞춰 전송한다.

```text
HTTP/1.1 200 OK\r\n
Content-Type: application/json\r\n
\r\n
{"message":"ok"}
```

이 단순한 서버를 통해 HTTP가 특별한 함수 호출이 아니라, TCP 연결 위에서 정해진 형식의 문자열과 데이터를 교환하는 규약이라는 점을 확인할 수 있다. 브라우저가 요청을 보냈을 때 서버가 시작 라인과 헤더를 잘못 나누거나 빈 줄을 누락하면, 비즈니스 로직과 관계없이 올바른 HTTP 응답으로 해석되지 않는다.

> 소켓과 입출력 스트림은 사용 후 반드시 닫아야 한다. 닫지 않은 연결이 누적되면 파일 디스크립터가 계속 점유되어 새로운 연결을 처리하지 못할 수 있다.
{: .prompt-warning }

저수준 구현에서는 연결 수락, 메시지 파싱, 응답 조립, 자원 해제를 모두 직접 책임져야 한다. Spring Boot가 편리한 이유를 이해하려면 먼저 프레임워크가 이 반복 작업을 대신 처리하고 있다는 점을 알아야 한다.

## REST: URI와 HTTP 메서드에 역할을 나누는 방식

HTTP 서버를 만들 수 있어도 URI마다 임의의 규칙을 사용하면 클라이언트가 API의 의미를 예측하기 어렵다. REST는 HTTP의 표준 의미론을 활용해 분산 시스템의 인터페이스를 일관되게 만드는 아키텍처 스타일이다.

RESTful API는 자원(Resource), 행위(Verb), 표현(Representation)을 중심으로 설계한다.

| 구성요소 | 역할 | 예시 |
|---|---|---|
| 자원 | 서버가 제공하는 대상 | `/users` |
| 행위 | 자원에 수행할 작업 | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| 표현 | 자원의 상태를 주고받는 형식 | JSON |

URI에는 행위가 아니라 자원을 명사로 표현하고, 실제 행위는 HTTP 메서드에 맡긴다.

| 피해야 할 URI | 역할을 분리한 형태 |
|---|---|
| `GET /getUsers` | `GET /users` |
| `POST /createUser` | `POST /users` |
| `DELETE /deleteProduct` | `DELETE /products` |

자원 이름은 복수 명사를 사용하고, 계층은 슬래시로 나타내며, 소문자와 하이픈을 사용하는 것이 기본 규칙이다. 이러한 규칙을 따르면 URI만 보고도 어떤 자원을 다루는 API인지 파악할 수 있고, 메서드를 통해 수행할 행위를 구분할 수 있다.

REST의 핵심은 URI 모양만 다듬는 데 그치지 않는다.

- Client-Server 분리는 화면과 데이터 처리 책임을 분리해 서로 독립적으로 발전할 수 있게 한다.
- Stateless는 서버가 이전 요청의 상태에 의존하지 않고 각 요청을 독립적으로 처리하게 한다.
- Cacheable은 응답을 재사용할 수 있는지 명확하게 표현해 불필요한 통신을 줄이는 기반이 된다.
- Layered System은 클라이언트가 중간 계층의 존재를 모두 알지 않아도 요청을 처리할 수 있게 한다.
- Uniform Interface는 자원 접근 방식을 일관되게 만들어 클라이언트와 서버 사이의 결합을 낮춘다.

무상태성은 서버에 상태가 전혀 없다는 뜻이 아니다. 데이터는 서버에서 관리할 수 있지만, 특정 요청을 처리하는 데 필요한 정보가 이전 요청의 처리 흐름에 암묵적으로 기대서는 안 된다는 의미다. 각 요청이 독립적이면 여러 서버로 트래픽을 나누는 구조에서도 요청 처리 위치에 대한 제약을 줄일 수 있다.

## Spring Boot가 저수준 웹 서버를 감추는 방식

순수 소켓으로 HTTP 서버를 구현하면 통신 원리를 볼 수 있지만, 애플리케이션을 만들 때마다 연결 수락과 메시지 파싱을 반복해서 작성하는 것은 비효율적이다. Spring Framework는 POJO 기반으로 애플리케이션의 역할을 구성할 수 있게 하고, Spring Boot는 초기 설정과 실행 환경을 자동화해 웹 서버를 빠르게 시작할 수 있게 한다.

Spring Boot의 편의성은 크게 세 부분으로 볼 수 있다.

- Starter 의존성은 웹 애플리케이션에 함께 필요한 라이브러리 구성을 묶고 버전을 관리한다.
- Auto-Configuration은 클래스패스에 존재하는 라이브러리를 감지해 기본 구성을 자동으로 등록한다.
- 내장 톰캣은 별도의 외장 WAS 설치 없이 실행 가능한 Jar 형태로 서버를 구동할 수 있게 한다.

자동 설정은 설정이 사라졌다는 뜻이 아니다. 자주 사용하는 구성이 기본값으로 제공된다는 의미다. 기본값이 애플리케이션의 요구와 맞지 않을 때는 어떤 설정이 적용됐는지 이해하고 필요한 값을 명시적으로 바꿀 수 있어야 한다.

순수 소켓 서버와 Spring Boot 서버의 역할을 대응시키면 추상화의 경계가 선명해진다.

```text
[순수 소켓 서버]
연결 수락 → HTTP 파싱 → URI 분기 → 응답 문자열 조립

[Spring Boot]
내장 서버 → DispatcherServlet → Controller 선택 → 객체를 JSON으로 반환
```

개발자는 HTTP 메시지를 매번 문자열로 조립하는 대신, 어떤 요청을 어떤 메서드가 처리하고 어떤 객체를 응답할지 선언하는 데 집중한다.

## Spring MVC의 요청 처리와 계층형 아키텍처

Spring MVC는 Front Controller 패턴을 사용한다. 모든 HTTP 요청은 중앙의 `DispatcherServlet`을 거치고, `DispatcherServlet`은 HandlerMapping을 통해 요청을 처리할 컨트롤러를 찾는다.

```text
HTTP 요청
   ↓
DispatcherServlet
   ↓
HandlerMapping
   ↓
Controller
   ↓
Service
   ↓
Repository
   ↓
처리 결과
   ↓
JSON HTTP 응답
```

`@RestController`는 컨트롤러가 반환한 객체를 HTTP 응답 본문의 JSON으로 직렬화하는 역할을 포함한다. 요청 데이터는 위치에 따라 서로 다른 방식으로 메서드 인자에 연결된다.

- `@PathVariable`은 `/users/{id}`처럼 URI 경로에 포함된 값을 받는다.
- `@RequestParam`은 쿼리 파라미터를 받는다.
- `@RequestBody`는 JSON 요청 본문을 Java 객체로 역직렬화한다.

```java
@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/{id}")
    public UserResponse getUser(@PathVariable Long id) {
        return userService.findById(id);
    }
}
```

컨트롤러는 HTTP 요청을 Java 메서드 호출로 바꾸는 경계다. 따라서 경로와 입력값을 받고 서비스에 작업을 요청한 뒤, 결과를 HTTP 응답으로 반환하는 책임에 집중해야 한다. 회원 조회 규칙이나 상태 변경 규칙을 컨트롤러에 직접 작성하면 같은 로직을 다른 진입점에서 재사용하기 어려워지고 테스트 범위도 커진다.

서비스(Service)는 애플리케이션의 비즈니스 규칙과 작업 흐름을 담당한다. 여러 데이터 접근 작업을 어떤 순서로 조합할지, 요청이 도메인 규칙에 맞는지를 판단하는 위치다. 리포지토리(Repository)는 데이터 저장과 조회에 관한 접근 책임을 맡는다.

| 계층 | 주요 책임 | 피해야 할 책임 혼합 |
|---|---|---|
| Controller | HTTP 요청 수신, 파라미터 바인딩, 응답 반환 | 비즈니스 규칙과 데이터 접근 직접 구현 |
| Service | 비즈니스 로직과 작업 흐름 | HTTP 경로와 응답 형식에 직접 의존 |
| Repository | 데이터 조회·저장·수정·삭제 | 요청 처리와 비즈니스 판단 |

이 구분은 단지 폴더를 세 개 만드는 규칙이 아니다. 변경의 원인을 계층별로 분리하는 설계다.

```text
HTTP 형식 변경       → Controller
업무 규칙 변경       → Service
데이터 접근 방식 변경 → Repository
```

계층을 나눠 놓고 Controller가 Repository를 직접 호출하거나 Service가 HTTP 요청 형식을 처리하면 경계의 이점이 사라진다. 각 계층이 바로 아래 역할과 협력하도록 만들고, 데이터가 계층을 이동할 때 어떤 의미를 갖는지 분명히 해야 한다.

## 설계 원칙과 웹 계층의 연결

하루 동안 다룬 주제를 하나의 서버 구조로 연결하면 생성 패턴, SOLID, REST, Spring MVC가 각각 해결하는 문제가 구분된다.

| 문제 | 적용할 관점 |
|---|---|
| 객체를 만드는 코드가 호출부마다 반복된다 | Builder, Factory 등으로 생성 정책 캡슐화 |
| 한 클래스가 요청·규칙·저장을 모두 처리한다 | SRP에 따라 Controller-Service-Repository로 책임 분리 |
| 구현을 추가할 때 기존 서비스의 조건문을 계속 고친다 | OCP와 다형성 활용 |
| 고수준 로직이 특정 구현 클래스에 고정된다 | DIP에 따라 추상화에 의존 |
| API의 URI만 보고 의미를 파악하기 어렵다 | 자원은 URI, 행위는 HTTP 메서드로 표현 |
| TCP와 HTTP 처리를 매번 직접 구현해야 한다 | Spring Boot와 Spring MVC의 웹 추상화 활용 |

특히 SOLID와 계층형 아키텍처는 별개의 이론이 아니다. Controller가 요청 변환에 집중하고 Service가 비즈니스 로직을 담당하며 Repository가 데이터 접근을 맡는 구조는 SRP의 적용이다. 상위 계층이 역할의 추상화에 의존하도록 설계하면 DIP와 OCP를 적용할 기반도 만들어진다.

반대로 계층 수를 늘리는 것만으로 좋은 설계가 되지는 않는다. 실제 변경 이유가 분리되지 않았는데 인터페이스와 클래스를 기계적으로 추가하면 호출 경로만 길어진다. SOLID는 구조의 크기가 아니라 변경 가능성과 책임의 경계를 판단하기 위한 기준으로 사용해야 한다.

## 실습

3일차 실습은 객체 생성 코드에서 시작해 HTTP 요청이 계층형 애플리케이션으로 전달되는 구조까지 단계적으로 확장한다. 제출 코드가 제공되지 않았으므로 요구사항, 평가 기준과 구현 방향을 중심으로 정리한다.

### Builder 디자인 패턴

요구사항은 `User` 클래스 내부에 정적 내부 클래스 `Builder`를 만들고, 필수 속성과 선택 속성을 단계적으로 설정할 수 있는 불변 객체 생성 구조를 작성하는 것이다.

구현 방향은 다음과 같다.

1. `User`의 필드를 외부에서 직접 변경할 수 없도록 제한한다.
2. `User` 생성자는 외부에서 호출하지 못하도록 캡슐화한다.
3. `Builder`의 설정 메서드는 값을 저장한 뒤 `this`를 반환한다.
4. `build()`에서 완성된 `User` 객체를 생성한다.

평가 기준은 메서드 체이닝을 위한 `return this`가 올바르게 작성됐는지, 외부에서 생성자를 직접 호출하지 못하도록 생성 과정이 캡슐화됐는지다.

### SOLID 원칙 적용

SOLID 실습은 OCP, LSP, DIP를 각각 다른 예제로 점검한다.

- OCP 실습에서는 `Payment` 인터페이스와 카카오페이, 카드, 네이버페이 구현을 분리한다. 새 결제 수단을 추가해도 `PaymentService`의 처리 흐름을 수정하지 않는 구조가 목표다.
- LSP 실습에서는 `Shape` 인터페이스를 기준으로 `Rectangle`과 `Square`를 각각 구현해, 한 구현체의 제약이 다른 구현체의 기대 동작을 깨뜨리지 않도록 한다.
- DIP 실습에서는 `Computer`가 구체 장치 클래스 대신 `InputDevice`와 `OutputDevice` 인터페이스에 의존하도록 바꾼다.

평가의 핵심은 인터페이스를 선언했다는 사실이 아니라, 구체 구현을 교체하거나 추가할 때 고수준 서비스의 수정 범위가 실제로 줄어드는지다.

### TCP 소켓과 Simple HTTP Server

소켓 실습은 세 단계로 구성된다.

1. `InetAddress`를 사용해 도메인의 IP를 조회한다.
2. `ServerSocket`과 `Socket`으로 1:1 Echo 서버와 클라이언트를 구성한다.
3. 8080 포트에서 브라우저의 HTTP GET 요청을 받아 시작 라인과 헤더를 파싱하고, JSON 본문을 가진 HTTP 200 OK 응답을 전송한다.

구현할 때는 `accept()`로 얻은 연결용 소켓과 서버의 대기 소켓을 구분해야 한다. 입력에서는 HTTP 시작 라인, 헤더, 빈 줄의 경계를 식별하고, 출력에서는 상태 라인과 헤더 뒤에 빈 줄을 둔 다음 JSON 본문을 기록해야 한다. 처리가 끝난 스트림과 소켓을 닫는 것도 평가 대상에 포함된다.

### Spring Boot Hello World와 UserController

첫 번째 Spring Boot 실습은 프로젝트를 실행하고 `@RestController`에서 “Hello World” JSON 응답을 반환하는 API를 작성하는 것이다. 이 단계에서는 내장 서버가 요청을 받고 컨트롤러의 반환 객체를 HTTP 응답으로 변환하는 흐름을 확인한다.

다음으로 `UserController`에서 세 가지 입력 경로를 구분한다.

```text
/users/{id}       → @PathVariable
/users?name=value → @RequestParam
요청 JSON 본문     → @RequestBody
```

평가 기준은 각 데이터가 어디에서 전달되는지에 맞는 바인딩 애노테이션을 사용하고, 회원 조회와 등록 엔드포인트가 의도한 요청을 처리하도록 구성하는 것이다.

### Controller-Service-Repository와 H2

계층형 아키텍처 실습에서는 H2 인메모리 데이터베이스 환경을 바탕으로 회원 CRUD 흐름을 세 계층으로 나눈다.

```text
UserController
    ↓ 요청 전달
UserService
    ↓ 데이터 작업 요청
UserRepository
    ↓
H2
```

구현 방향은 Controller가 HTTP 입력과 응답을 담당하고, Service가 회원 관련 작업 흐름을 담당하며, Repository가 데이터 접근을 맡도록 제한하는 것이다. 평가할 때는 클래스 이름이나 패키지 배치보다 비즈니스 로직이 Controller에 들어가 있지 않은지, 데이터 접근 코드가 Service와 Controller에 흩어져 있지 않은지, 세 계층의 연결 방향이 일관적인지를 우선 확인해야 한다.

## 정리

3일차에는 객체 생성 정책을 패턴으로 분리하고, SOLID를 통해 책임과 의존 관계를 점검한 뒤, TCP 소켓 위에서 HTTP 요청과 응답이 오가는 구조를 살펴봤다. REST는 이 HTTP 인터페이스에 자원 중심의 일관성을 부여하고, Spring Boot와 Spring MVC는 저수준 통신 처리를 감춘 채 Controller-Service-Repository의 책임에 집중할 수 있게 한다.

다음 단계에서는 이 서버 골격 안의 객체들이 어떻게 관리되고, 공통 기능과 입력 검증 및 비동기 작업이 핵심 비즈니스 로직과 분리되는지를 이어서 다룬다.

---

이전 글: [2일차 — 다형성에서 메타프로그래밍까지](/posts/skala-java-springboot-day2/)

시리즈 안내: [Java, SpringBoot, Rest API 구현 — 5일 학습 로드맵](/posts/skala-java-springboot-roadmap/)

다음 글: [4일차 — Spring의 객체 관리와 부가 기능](/posts/skala-java-springboot-day4/)
