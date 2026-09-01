---
title: "[SKALA] Java, SpringBoot, Rest API 구현 4일차 — 선언에서 동작까지, IoC·AOP·검증·비동기"
date: 2026-08-13 21:00:00 +0900
permalink: /posts/skala-java-springboot-day4/
categories:
  - SKALA
  - Backend
tags: [skala, spring, ioc, aop, annotation, proxy]
description: "Spring이 객체의 생성과 연결을 관리하는 IoC/DI 원리를 살펴보고, 프록시 기반 AOP와 애노테이션이 실제 동작으로 이어지는 과정을 정리한다. Bean Validation과 @Async를 이용해 입력 경계와 장시간 작업을 분리하는 방법도 함께 다룬다."
---

## 애노테이션은 누가 실행하는가

3일차에는 HTTP 요청이 계층형 애플리케이션의 Controller, Service, Repository를 따라 이동하도록 서버의 골격을 나눴다. 4일차에는 그 구조를 Spring이 실제로 어떻게 조립하고 확장하는지 살펴볼 차례다. 객체를 누가 생성하고 연결하는지, 비즈니스 메서드 앞뒤에 공통 기능이 어떻게 끼어드는지 이해해야 Spring 애노테이션을 단순히 외워서 붙이는 단계에서 벗어날 수 있다.

Python을 기준점으로 Java를 배우면서 나는 애노테이션(annotation)이 왜 함수가 아닌지 질문했다. Python의 데코레이터(decorator)처럼 대상 위에 붙어 동작을 바꾸는 것처럼 보이지만, 데코레이터는 호출 가능한 객체인 반면 Java 애노테이션은 그 자체로 실행되는 함수가 아니다. 그렇다면 어떤 기준으로 애노테이션을 찾고, 어느 시점에 관련 코드가 실행되는지가 궁금했다. 애노테이션을 키로 조회할 수 있는 메타데이터로 이해해도 되는지도 함께 질문했다.

4일차의 IoC와 프록시, AOP는 이 질문을 하나의 흐름으로 연결해 주었다. 애노테이션은 코드에 메타데이터를 남긴다. Spring 컨테이너와 AOP 같은 외부 처리기가 그 정보를 읽어 객체를 등록하거나 프록시를 만들고, 정해진 시점에 부가 기능을 호출한다. 즉, 애노테이션이 스스로 실행되는 것이 아니라 애노테이션을 해석하는 프레임워크가 동작한다.

```text
애노테이션 선언
    ↓
Spring이 클래스와 메서드의 메타데이터를 판독
    ↓
빈 등록·의존성 주입·프록시 생성 등의 처리 결정
    ↓
애플리케이션 실행 중 해당 규칙에 맞는 동작 수행
```

애노테이션을 dictionary와 완전히 같은 자료구조라고 볼 수는 없다. 다만 `isAnnotationPresent()`나 `getAnnotation()`처럼 런타임에 존재 여부와 값을 조회할 수 있다는 점에서는 “조회 가능한 메타데이터”라는 비유가 이해에 도움이 된다. 이 조회가 가능하려면 런타임 처리가 필요한 애노테이션의 유지 범위가 `RUNTIME`이어야 한다.

> Python 데코레이터와 Java 애노테이션은 모두 선언부 가까이에 부가 동작의 의도를 표현할 수 있다. 차이는 Java 애노테이션에는 실행 로직이 들어 있지 않으며, 리플렉션이나 Spring 같은 별도의 처리 주체가 메타데이터를 해석한다는 점이다.
{: .prompt-info }

## Lombok으로 줄일 코드와 남겨야 할 설계

Spring 애플리케이션에서는 DTO와 서비스처럼 비슷한 형태의 클래스가 반복해서 등장한다. Getter, Setter, 생성자, 로거 선언을 매번 직접 작성하면 핵심 로직보다 보일러플레이트 코드가 더 많은 공간을 차지한다. Lombok은 애노테이션을 바탕으로 컴파일 시점에 이러한 코드를 생성한다.

주요 애노테이션의 역할은 다음과 같이 나눌 수 있다.

| 애노테이션 | 생성하거나 제공하는 것 | 적용할 때 확인할 점 |
|---|---|---|
| `@Getter` | 필드의 Getter | 외부에 읽기 접근을 열어도 되는 필드인지 확인한다. |
| `@Setter` | 필드의 Setter | 객체 상태가 아무 제약 없이 변경되어도 되는지 확인한다. |
| `@RequiredArgsConstructor` | `final` 필드를 받는 생성자 | 생성자 주입과 함께 사용하면 의존성을 불변으로 유지할 수 있다. |
| `@Builder` | 빌더 기반 객체 생성 코드 | 생성 규칙과 필수값 검증이 사라지지 않도록 주의한다. |
| `@Slf4j` | 로거 필드 | 로그를 직접 출력하는 반복 선언을 줄인다. |

서비스 클래스에서 `@RequiredArgsConstructor`를 사용하면 생성자 코드를 직접 작성하지 않고도 `final` 의존성을 생성자로 주입받을 수 있다.

```java
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
}
```

코드가 짧아졌지만 의존 관계가 사라진 것은 아니다. `UserService`가 `UserRepository`를 필요로 한다는 사실은 `final` 필드에 그대로 드러난다. Lombok은 설계를 대신하는 도구가 아니라 이미 결정한 설계를 간결하게 표현하는 도구에 가깝다.

특히 `@Data`를 무분별하게 적용하는 것은 피해야 한다. 필요하지 않은 Setter까지 공개될 수 있고, 연관된 객체를 문자열로 변환하는 과정에서 `toString()` 순환 참조가 발생할 수 있기 때문이다. 클래스마다 필요한 기능만 골라 애노테이션을 붙여야 캡슐화 경계가 흐려지지 않는다.

## 프로퍼티를 코드 밖으로 분리하는 이유

같은 애플리케이션이라도 로컬 환경과 운영 환경의 설정은 다를 수 있다. 이 차이를 Java 코드의 조건문으로 처리하면 환경이 추가될 때마다 코드를 수정하고 다시 빌드해야 한다. 프로퍼티 관리는 실행 환경에 따라 달라지는 값을 코드 밖으로 옮기고, 프로파일(profile)은 환경별 설정 묶음을 선택하는 방법이다.

Spring에서는 단일 값을 `@Value`로 주입하거나, 동일한 접두사를 가진 설정을 `@ConfigurationProperties`로 묶을 수 있다.

```java
@Component
@ConfigurationProperties(prefix = "app")
@Getter
@Setter
public class AppProperties {

    private String name;
    private String environment;
}
```

`@Value("${property.key}")`는 한두 개의 값을 빠르게 주입할 때 단순하다. 반면 관련 설정이 여러 개라면 `@ConfigurationProperties(prefix = "app")`로 하나의 클래스에 모으는 편이 설정 구조를 파악하기 쉽다.

프로파일은 기본 설정과 환경별 설정을 파일 단위로 분리한다.

```text
application.yml
├── 활성 프로파일 선택
├── application-local.yml
│   └── 로컬 환경의 포트와 설정
└── application-prod.yml
    └── 운영 환경의 포트와 설정
```

`application.yml`에서 `spring.profiles.active` 값을 지정하면 선택한 환경의 설정 파일이 적용된다. 이 구조의 핵심은 환경을 전환할 때 비즈니스 코드를 수정하지 않는 것이다. 환경별 차이를 프로퍼티 경계 안에 격리하면 서비스 로직은 같은 형태로 유지할 수 있다.

## IoC와 DI: 객체 조립의 제어권을 넘기기

계층을 나누는 것만으로 결합도가 자동으로 낮아지는 것은 아니다. 서비스가 저장소 구현체를 직접 생성한다면 두 클래스는 여전히 강하게 묶여 있다.

```java
public class UserService {

    private final UserRepository userRepository = new UserRepository();
}
```

이 코드에서는 객체 생성 정책이 `UserService` 내부에 고정된다. 다른 저장소 구현이나 테스트용 객체로 바꾸려면 서비스 코드까지 수정해야 한다. IoC(Inversion of Control)는 객체 생성과 생명주기 제어를 Spring 컨테이너에 넘겨 이 문제를 풀고, DI(Dependency Injection)는 컨테이너가 객체에 필요한 의존성을 외부에서 전달하도록 한다.

```text
직접 제어
UserService ──new──> UserRepository

IoC/DI 적용
Spring Container
├── UserRepository 빈 생성·관리
├── UserService 빈 생성·관리
└── UserService 생성자에 UserRepository 주입
```

Spring 컨테이너가 관리하는 객체를 빈(Bean)이라고 한다. 기본 스코프는 싱글톤이므로 컨테이너 안에서 하나의 인스턴스를 생성해 공유한다. 따라서 빈에 요청별 가변 상태를 쌓는 방식은 여러 실행 흐름이 같은 객체를 함께 사용한다는 점을 고려해야 한다.

의존성 주입에는 생성자, 필드, Setter 주입 방식이 있다. 이 가운데 생성자 주입은 객체가 만들어질 때 필요한 의존성을 빠뜨릴 수 없고, 필드를 `final`로 유지할 수 있으며, 테스트에서 대체 객체를 전달하기도 쉽다.

```java
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
}
```

반대로 다음과 같은 필드 주입은 의존성이 클래스 내부에 숨는다.

```java
@Autowired
private UserRepository userRepository;
```

필드 주입은 외부에서 의존성을 변경하거나 테스트용 구현을 전달하기 어렵다. 생성자 시그니처만 보고 객체가 요구하는 의존성을 파악하기도 어렵기 때문에 생성자 주입을 기본 선택으로 두는 편이 구조를 명확하게 만든다.

### 미니 IoC 컨테이너로 보는 내부 흐름

실습에서는 Spring을 그대로 사용하는 데서 멈추지 않고, 순수 Java 리플렉션으로 간단한 IoC 컨테이너를 구성하도록 요구한다. `@CustomService`가 붙은 클래스를 찾고, `@CustomAutowired`를 판독해 객체 생성과 생성자 주입을 수행하는 구조다.

```text
클래스 스캔
    ↓
@CustomService가 붙은 클래스 식별
    ↓
리플렉션으로 생성자와 필요한 타입 조회
    ↓
의존 객체 생성 및 등록
    ↓
생성자를 호출해 의존성 주입
    ↓
완성된 객체를 컨테이너에서 관리
```

이 흐름에서 애노테이션은 실행 명령이 아니라 컨테이너가 판단할 근거다. 실제 생성자를 찾고 호출하는 작업은 리플렉션과 컨테이너 코드가 담당한다. Spring의 `@Service`나 의존성 주입 애노테이션도 같은 관점으로 보면, 짧은 선언 뒤에 객체 탐색과 조립 과정이 있다는 점을 이해할 수 있다.

## 프록시가 원본 객체 앞에 서는 이유

IoC 컨테이너가 객체 생성을 담당하면, 원본 객체를 그대로 전달하는 대신 같은 호출 규약을 가진 대리 객체를 전달할 수도 있다. 프록시(proxy)는 원본 객체를 감싸고 메서드 호출 전후에 부가 기능을 실행한 뒤 실제 대상에게 호출을 위임한다.

예를 들어 여러 서비스에서 실행 시간을 측정한다고 가정하면, 모든 메서드에 같은 측정 코드를 넣는 방식은 비즈니스 로직과 로깅을 섞는다.

```text
프록시가 없을 때
서비스 메서드 = 실행 시간 측정 + 핵심 로직 + 결과 기록

프록시가 있을 때
호출자 → 프록시 → 원본 서비스
          ├── 호출 전 처리
          ├── 원본 메서드 실행
          └── 호출 후 처리
```

Spring은 인터페이스를 기반으로 하는 JDK Dynamic Proxy와 클래스를 기반으로 하는 CGLIB 방식으로 프록시를 생성할 수 있다. 호출자는 프록시를 통해 메서드를 호출하지만, 핵심 기능은 Target인 원본 객체에 남는다.

프록시를 수동으로 작성하면 호출을 위임하는 메서드마다 전후 처리 코드를 반복해야 한다. 이 구조를 선언적으로 일반화한 것이 Spring AOP(Aspect-Oriented Programming)다.

## AOP로 공통 관심사를 분리하기

AOP는 여러 계층과 클래스에 반복해서 나타나는 로깅, 실행 시간 측정, 보안 같은 횡단 관심사(Cross-Cutting Concerns)를 핵심 비즈니스 로직에서 떼어 낸다. 적용할 코드와 적용 범위를 각각 정의해 두면 Spring이 프록시를 통해 두 부분을 결합한다.

| 용어 | 의미 |
|---|---|
| Target | 핵심 기능을 구현한 원본 객체 |
| Aspect | 횡단 관심사를 모듈화한 단위 |
| Advice | 실제로 실행되는 부가 기능 |
| Pointcut | Advice를 적용할 메서드를 선별하는 조건 |

Advice는 실행 시점에 따라 `@Before`, `@After`, `@Around`, `@AfterReturning`, `@AfterThrowing` 등으로 나뉜다. 이 가운데 `@Around`는 원본 메서드 실행 전후를 모두 감싸며, `ProceedingJoinPoint.proceed()`를 호출해야 실제 Target 메서드로 제어가 넘어간다.

```java
@Aspect
@Component
@Slf4j
public class LoggingAspect {

    @Around("execution(* com.example.service..*(..))")
    public Object logExecutionTime(ProceedingJoinPoint joinPoint)
            throws Throwable {

        long start = System.currentTimeMillis();

        try {
            return joinPoint.proceed();
        } finally {
            long elapsed = System.currentTimeMillis() - start;
            log.info("execution time: {}", elapsed);
        }
    }
}
```

`execution(...)` Pointcut은 패키지와 메서드 시그니처를 기준으로 적용 대상을 고른다. 특정 애노테이션이 붙은 메서드만 대상으로 삼으려면 `@annotation(...)` 표현식을 사용할 수 있다. 이 경우에도 애노테이션 자체가 실행되는 것이 아니다. AOP가 메타데이터를 읽어 대상 메서드를 선택하고 프록시의 Advice를 호출한다.

```text
메서드에 애노테이션 부착
    ↓
Pointcut이 애노테이션을 기준으로 대상 선별
    ↓
Spring이 프록시 구성
    ↓
외부 호출이 프록시를 통과
    ↓
Advice 실행 → Target 메서드 실행
```

### 내부 호출에서 AOP가 사라지는 이유

Spring AOP에서 특히 주의할 부분은 같은 클래스 안의 내부 호출(Self-Invocation)이다.

```java
public void outer() {
    this.inner();
}
```

외부 객체가 `outer()`를 호출할 때는 프록시를 통과할 수 있다. 하지만 `outer()` 내부에서 `this.inner()`를 호출하면 원본 객체가 자기 메서드를 직접 부르는 경로가 된다. 이 호출은 프록시를 다시 거치지 않으므로 `inner()`에 설정한 AOP가 적용되지 않는다.

```text
외부 호출자 → Spring Proxy → Target.outer()
                              └── this.inner()
                                  프록시를 통과하지 않음
```

> 애노테이션이 붙어 있다는 사실만으로 AOP 실행이 보장되지는 않는다. 실제 호출 경로가 Spring 프록시를 통과하는지까지 확인해야 한다.
{: .prompt-warning }

이 제약은 `@Async`처럼 프록시를 기반으로 작동하는 다른 기능을 이해할 때도 그대로 이어진다.

## Bean Validation으로 입력 경계를 세우기

외부에서 받은 데이터는 비즈니스 로직에 전달하기 전에 형식과 필수 조건을 검증해야 한다. 검증을 서비스 메서드 곳곳에서 반복하면 핵심 로직과 입력 형식 확인이 섞이고, API마다 오류 처리 방식이 달라질 수 있다.

Bean Validation은 `jakarta.validation` 애노테이션을 DTO에 선언해 입력 조건을 데이터 구조 가까이에 둔다.

```java
@Getter
@Setter
public class UserRequest {

    @NotBlank(message = "이름은 필수입니다")
    private String name;

    @Email(message = "이메일 형식이 아닙니다")
    private String email;
}
```

`@NotNull`, `@NotEmpty`, `@NotBlank`, `@Size`, `@Min`, `@Max`, `@Email`, `@Pattern` 등을 사용해 값의 존재 여부와 크기, 범위, 형식을 표현할 수 있다. 문자열이 공백으로만 구성된 경우까지 막아야 한다면 `@NotBlank`를 선택해야 한다.

컨트롤러의 요청 본문 DTO에는 `@Valid`를 붙여 표준 검증을 실행한다.

```java
@PostMapping
public UserResponse createUser(
        @Valid @RequestBody UserRequest request) {
    return userService.create(request);
}
```

검증 흐름은 다음과 같다.

```text
HTTP 요청
    ↓
JSON 본문을 DTO로 변환
    ↓
@Valid로 Bean Validation 수행
    ├── 성공 → Controller와 Service 로직 진행
    └── 실패 → MethodArgumentNotValidException 발생
                    ↓
             400 Bad Request 응답 구성
```

`@Valid`는 주로 `@RequestBody` DTO 검증에 사용한다. `@PathVariable`이나 `@RequestParam` 같은 메서드 파라미터 또는 그룹 검증에는 Spring의 `@Validated`를 사용할 수 있다.

검증 실패를 그대로 두면 프레임워크 예외가 API 응답으로 노출된다. `@ExceptionHandler`나 `@RestControllerAdvice`에서 `MethodArgumentNotValidException`을 처리해 클라이언트가 이해할 수 있는 400 응답으로 변환해야 한다. 중요한 점은 잘못된 값을 서비스 계층까지 전달한 뒤 처리하는 것이 아니라, HTTP 입력 경계에서 차단하는 것이다.

## `@Async`로 요청 스레드와 작업 스레드를 분리하기

외부 I/O, 이메일 발송, 대량 배치처럼 완료까지 시간이 걸리는 작업을 요청 스레드에서 끝까지 기다리면 그동안 해당 스레드는 다른 요청을 처리하지 못한다. Spring의 `@Async`는 메서드 실행을 별도 스레드 풀로 넘겨 호출자가 작업 완료를 기다리지 않고 다음 흐름을 진행할 수 있게 한다.

```text
요청 스레드
    ↓
@Async 프록시 호출
    ├── 호출자에게 제어권 또는 CompletableFuture 반환
    └── ThreadPoolTaskExecutor에 작업 전달
                            ↓
                       별도 스레드에서 실행
```

비동기 기능은 `@EnableAsync`로 활성화하고 `ThreadPoolTaskExecutor` 빈을 등록해 실행 자원을 관리한다. 메서드에는 `@Async`를 붙이며, 결과가 필요하지 않다면 `void`, 이후 결과를 받아야 한다면 `CompletableFuture<T>`를 반환할 수 있다.

```java
@Async
public CompletableFuture<Void> sendNotification() {
    // 별도 스레드에서 수행할 작업
    return CompletableFuture.completedFuture(null);
}
```

여기서 `@Async`가 작업 자체의 실행 시간을 줄이는 것은 아니다. 요청 스레드가 오래 걸리는 작업을 직접 기다리지 않도록 실행 경로를 분리하는 것이다. 결과가 필요하다면 `CompletableFuture`를 통해 완료 이후의 흐름을 연결해야 한다.

Spring Boot는 기본적으로 `ThreadPoolTaskExecutor`를 자동 구성하고, 가상 스레드를 활성화했을 때는 `SimpleAsyncTaskExecutor`를 사용한다. 순수 Spring Framework의 `@EnableAsync` fallback과 Boot 자동 구성을 구분해야 하며, 어느 쪽이든 운영 부하에 맞는 자원 경계를 확인해야 한다.

`@Async` 역시 AOP와 같은 프록시 기반 기능이다. 같은 클래스 안에서 비동기 메서드를 `this.asyncMethod()`로 호출하면 프록시를 거치지 않으므로 별도 스레드에서 실행되지 않는다.

```text
다른 빈에서 호출 → @Async Proxy → 별도 스레드 실행
같은 객체의 this 호출 ──────────→ 현재 스레드에서 직접 실행
```

따라서 비동기로 분리할 작업은 별도의 빈으로 나누고, Spring 컨테이너가 주입한 객체를 통해 호출해야 한다. 이 구조는 비동기 책임을 분명히 하고 호출 경로도 확인하기 쉽게 만든다.

## 실습

4일차 실습은 Spring 기능을 붙이는 데서 끝나지 않고, 각 기능을 담당하는 처리 주체와 호출 경로를 설명할 수 있는지를 확인하도록 구성된다. 제출 코드가 제공되지 않았으므로 여기서는 요구사항과 구현 방향을 정리한다.

### Lombok과 프로파일 분리

도메인과 DTO에는 `@Getter`, 서비스에는 `@RequiredArgsConstructor`, 로그가 필요한 클래스에는 `@Slf4j`를 적용한다. 생성자 주입 대상은 `final` 필드로 선언하고, 모든 기능을 한 번에 여는 `@Data` 대신 필요한 애노테이션만 선택하는 방향이 적절하다.

설정은 `application.yml`, `application-local.yml`, `application-prod.yml`로 나누고 활성 프로파일에 따라 포트와 환경별 설정이 달라지도록 구성한다. 평가 기준은 반복 코드가 실제로 줄었는지뿐 아니라, 환경 전환을 위해 Java 코드를 수정하지 않아도 되는지에 있다.

### 리플렉션 기반 Simple IoC Container

`@CustomService`와 `@CustomAutowired`를 정의하고, 런타임에 리플렉션으로 애노테이션이 붙은 클래스를 판독한다. 이후 필요한 객체를 생성해 컨테이너에 등록하고 생성자를 통해 의존성을 전달한다.

구현 순서는 다음과 같이 잡을 수 있다.

```text
커스텀 애노테이션 정의
    → 대상 클래스 스캔
    → 빈 후보 식별
    → 생성자와 의존 타입 조회
    → 의존 객체 생성
    → 생성자 주입
    → 완성된 객체 등록
```

평가의 핵심은 애노테이션이 객체를 직접 생성한다고 오해하지 않고, 메타데이터를 읽는 컨테이너 코드가 생성과 주입을 수행하도록 만드는 것이다.

### 수동 프록시에서 Spring AOP로 전환

먼저 `UserService` 호출을 감싸는 프록시를 수동 빈으로 등록하고, 메서드 호출 전후의 실행 시간을 측정한다. 이 단계에서는 프록시가 Target과 같은 호출 규약을 제공하면서 실제 작업을 원본 객체에 위임하도록 구성해야 한다.

그다음 수동 프록시의 반복 코드를 `@Aspect`, `@Around`, `@Before` Advice로 옮긴다. `execution(...)` Pointcut이 의도한 서비스 메서드만 선택하는지, `@Around` 내부에서 `proceed()`를 호출해 원본 메서드가 실행되는지를 확인하는 것이 평가 기준이다. 같은 클래스의 내부 호출이 프록시를 우회한다는 점도 함께 점검해야 한다.

### DTO 입력값 검증

`UserRequest` DTO에 `@NotBlank`, `@Email` 등의 제약을 선언하고 컨트롤러의 `@RequestBody` 앞에 `@Valid`를 적용한다. 유효하지 않은 값이 들어오면 서비스 로직이 실행되기 전에 검증 실패가 발생해야 한다.

`MethodArgumentNotValidException`은 `@ExceptionHandler` 또는 `@RestControllerAdvice`에서 받아 400 Bad Request로 변환한다. 평가 기준은 애노테이션 부착 자체가 아니라 잘못된 요청이 비즈니스 계층으로 넘어가지 않는지와 오류 응답이 일관되게 구성되는지다.

### `@Async`와 스레드 풀

`@EnableAsync`로 비동기 처리를 활성화하고 `ThreadPoolTaskExecutor` 빈을 정의한 뒤, 별도 빈의 메서드에 `@Async`를 적용한다. 결과가 필요한 작업은 `CompletableFuture`로 반환해 호출자가 완료 결과를 이어서 처리할 수 있도록 설계한다.

실행 시간 단축 검증에서는 작업 하나의 처리 시간이 빨라졌다고 해석하기보다, 요청 스레드가 작업 완료까지 점유되지 않는지와 여러 작업이 별도 실행 흐름으로 분리되는지를 확인해야 한다. 기본 실행기에 의존하지 않고 커스텀 스레드 풀을 사용했는지, 내부 호출로 인해 비동기가 무효화되지 않았는지도 평가 기준에 포함된다.

## 정리

4일차에는 Spring 애노테이션 뒤에서 컨테이너와 프록시가 어떤 일을 수행하는지 연결해 보았다. IoC/DI는 객체 생성과 조립의 책임을 컨테이너로 옮기고, AOP는 프록시를 이용해 핵심 로직과 공통 관심사를 분리한다. Bean Validation은 잘못된 데이터를 입력 경계에서 차단하며, `@Async`는 오래 걸리는 작업을 요청 스레드와 분리한다. 다음 일차에는 이렇게 구성한 서비스에 데이터 영속성과 운영에 필요한 기능을 더한다.

---

이전 글: [3일차 — 설계 원칙에서 Spring Boot REST API까지](/posts/skala-java-springboot-day3/)

시리즈 안내: [Java, SpringBoot, Rest API 구현 — 5일 학습 로드맵](/posts/skala-java-springboot-roadmap/)

다음 글: [5일차 — JPA 영속성, 동시성 제어와 운영 준비](/posts/skala-java-springboot-day5/)
