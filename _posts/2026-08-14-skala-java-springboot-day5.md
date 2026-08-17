---
title: "[SKALA] Java, SpringBoot, Rest API 구현 5일차 — 저장에서 운영까지"
date: 2026-08-14 21:00:00 +0900
permalink: /posts/skala-java-springboot-day5/
categories:
  - SKALA
  - Backend
tags: [skala, jpa, transaction, swagger, actuator]
description: "Spring Data JPA의 엔티티 매핑과 영속성 컨텍스트부터 트랜잭션·동시성 제어, Swagger 문서화와 Actuator 운영 모니터링까지 백엔드 서비스의 마지막 연결 고리를 정리한다."
---

## 메모리 밖으로 나간 서비스

앞선 일차까지는 HTTP 요청을 계층별로 나누고, 입력값을 검증하며, 공통 기능과 비동기 작업을 비즈니스 로직에서 분리하는 방법을 배웠다. 하지만 서버 메모리에만 존재하는 객체는 애플리케이션이 종료되면 사라진다. 여러 요청이 같은 데이터를 조회하고 수정해야 하는 서비스라면 객체의 상태를 관계형 데이터베이스에 안전하게 저장하는 영속 계층이 필요하다.

마지막 날에는 이 간극을 Spring Data JPA로 연결했다. 여기서 중요한 것은 단순히 CRUD 메서드를 호출하는 방법이 아니다. 객체와 테이블을 어떻게 대응시킬지, 조회한 엔티티가 어떤 범위에서 관리되는지, 여러 요청이 동시에 같은 행을 수정하면 어떻게 충돌을 막을지까지 함께 봐야 한다. 저장 기능을 만든 뒤에는 Swagger로 API 계약을 드러내고 Actuator로 실행 중인 애플리케이션의 상태를 관찰해야 비로소 개발 이후의 협업과 운영까지 이어진다.

```text
객체 모델
  ↓ 엔티티 매핑
Spring Data JPA
  ↓ 영속성 컨텍스트
관계형 데이터베이스
  ↓ 트랜잭션·락으로 무결성 보호
안전한 데이터 변경
  ↓ Swagger·Actuator
협업 가능한 API와 관찰 가능한 서비스
```

## 객체와 테이블 사이를 연결하는 엔티티

관계형 데이터베이스는 테이블과 외래키를 중심으로 데이터를 표현하지만, Java 애플리케이션은 객체와 객체 사이의 참조를 중심으로 동작한다. 이 표현 방식의 차이를 매번 SQL과 변환 코드로 직접 해결하면 데이터 접근 코드가 반복되고 비즈니스 로직이 저장 방식에 강하게 묶인다.

JPA(Java Persistence API)는 객체와 관계형 데이터베이스 사이의 불일치를 다루는 ORM(Object-Relational Mapping) 표준이다. Hibernate는 그 구현체이며, Spring Data JPA는 다시 그 위에서 저장소 계층을 추상화한다. 개발자는 어떤 객체를 어떤 테이블과 컬럼에 연결할지 선언하고, 프레임워크는 그 매핑 정보를 바탕으로 SQL 실행과 엔티티 관리를 담당한다.

예를 들어 상품을 저장하는 엔티티는 다음과 같은 형태로 구성할 수 있다.

```java
@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private long price;

    @Enumerated(EnumType.STRING)
    private ProductStatus status;
}
```

각 애노테이션은 서로 다른 매핑 책임을 가진다.

- `@Entity`는 해당 클래스를 JPA의 관리 대상으로 지정한다.
- `@Table`은 연결할 테이블 이름을 명시한다.
- `@Id`는 객체를 식별하는 필드를 기본키와 연결한다.
- `@GeneratedValue`는 기본키 생성 전략을 지정한다.
- `@Column`은 컬럼 이름, null 허용 여부, 문자열 길이와 같은 제약을 표현한다.
- `@Enumerated`는 Java Enum을 데이터베이스에 저장하는 방식을 결정한다.

Enum 매핑에서는 기본값에 의존하지 않는 것이 중요하다. `ORDINAL` 방식은 Enum 상수의 순서를 숫자로 저장한다. 중간에 새로운 상수를 추가하거나 선언 순서를 바꾸면 기존 숫자가 다른 의미로 해석되어 데이터가 오염될 수 있다. 따라서 의미 자체가 저장되도록 `EnumType.STRING`을 명시하는 편이 안전하다.

> 엔티티 매핑은 단순한 필드 이름 연결이 아니다. Java 객체의 변경과 데이터베이스 행의 변경을 이어 주는 규칙이므로, 기본키와 null 허용 여부, Enum 저장 방식처럼 데이터의 의미를 보존하는 설정을 명시적으로 선택해야 한다.
{: .prompt-warning }

## JpaRepository가 줄여 주는 것과 남겨 두는 것

Spring Data JPA에서는 `JpaRepository<T, ID>`를 상속한 인터페이스만 선언해도 기본적인 CRUD와 페이징 기능을 사용할 수 있다.

```java
public interface ProductRepository
        extends JpaRepository<Product, Long> {

    List<Product> findByName(String name);
}
```

구현 클래스를 직접 작성하지 않았는데도 저장, 단건 조회, 전체 조회, 수정, 삭제에 필요한 메서드가 제공된다. `findByEmailAndName(String email, String name)`처럼 정해진 규칙에 맞춰 메서드 이름을 선언하면 이름을 분석해 JPQL도 생성한다. 메서드 이름으로 표현하기 어려운 복잡한 조회는 `@Query`로 JPQL을 직접 작성할 수 있다.

이 추상화의 목적은 데이터베이스의 존재를 감추는 데 있지 않다. 반복적인 저장소 코드를 줄여 비즈니스 규칙에 집중하도록 돕는 것이다. 어떤 엔티티를 조회하는지, 조회 결과가 몇 건인지, 연관관계를 언제 따라가는지에 따라 실제 데이터베이스 작업량은 달라진다. Repository 호출이 한 줄이라고 해서 데이터베이스 비용까지 한 번으로 고정되는 것은 아니다.

JPA가 조회한 엔티티는 영속성 컨텍스트(persistence context)라는 관리 공간에 들어간다. 이 공간은 엔티티와 데이터베이스 사이에서 다음 역할을 수행한다.

```text
엔티티 조회
  ↓
영속성 컨텍스트의 1차 캐시 확인
  ├─ 이미 관리 중인 동일 PK 엔티티가 있음 → 캐시의 같은 객체 반환
  └─ 없음 → DB 조회 후 관리 대상으로 등록
             ↓
          객체 상태 변경
             ↓
       트랜잭션 커밋 시 변경 감지
             ↓
          UPDATE 실행
```

같은 트랜잭션에서 동일한 기본키를 다시 조회하면 1차 캐시를 통해 같은 엔티티를 반환할 수 있다. 이 특성은 같은 데이터가 서로 다른 객체로 취급되는 혼란을 줄이고 동일성을 보장한다.

또한 JPA는 영속 상태인 엔티티의 변화를 추적한다. 트랜잭션 안에서 관리 중인 엔티티의 필드를 변경하면 커밋 시점에 변경 감지(dirty checking)가 작동하고 필요한 `UPDATE`가 발생한다. 따라서 이미 조회해 관리 중인 엔티티를 수정한 뒤 `save()`를 다시 호출하는 패턴이 항상 필요한 것은 아니다.

반대로 영속성 컨텍스트가 관리하지 않는 객체에는 변경 감지가 적용되지 않는다. 객체의 값을 바꿨다는 사실만으로 모든 Java 객체가 자동 저장되는 것은 아니다. “엔티티인가?”와 함께 “현재 영속 상태인가?”를 구분해야 JPA의 동작을 정확히 예측할 수 있다.

## N:1 관계에서는 외래키의 위치부터 본다

상품 여러 개가 한 사용자를 참조한다면 관계형 데이터베이스에서는 상품 테이블이 `user_id` 외래키를 가진다. 객체 모델에서는 `Product`가 `User` 객체를 참조하도록 표현할 수 있다.

```java
@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;
}
```

`@ManyToOne`은 여러 상품이 하나의 사용자와 연결되는 다대일 관계를 나타낸다. 실제 외래키를 가진 `Product`가 연관관계의 주인이며, `@JoinColumn(name = "user_id")`으로 외래키 컬럼을 지정한다.

사용자 쪽에서도 상품 목록을 탐색해야 한다면 반대편 관계를 다음과 같이 표현할 수 있다.

```java
@OneToMany(mappedBy = "user")
private List<Product> products;
```

여기서 `mappedBy = "user"`는 이 컬렉션이 외래키를 직접 관리하는 주인이 아니라 `Product.user` 관계를 비추는 반대편임을 나타낸다. 양쪽 객체에 필드를 선언했다고 해서 두 곳이 각각 외래키를 관리하는 것은 아니다. 데이터베이스에서 외래키를 가진 쪽이 어디인지 먼저 확인하면 관계의 주인도 자연스럽게 정해진다.

연관관계 매핑에서는 조회 시점도 중요하다. `FetchType.EAGER`는 엔티티를 조회할 때 연관 객체까지 즉시 불러오지만, 현재 처리에 필요하지 않은 데이터까지 조인하거나 조회할 수 있다. `FetchType.LAZY`는 실제로 연관 객체에 접근하는 시점까지 조회를 미룬다. 불필요한 조인을 줄이기 위해 연관관계는 지연 로딩을 기본으로 두는 것이 권장된다.

그러나 지연 로딩만 지정한다고 모든 조회 문제가 해결되는 것은 아니다. 목록에서 N개의 상품을 조회한 뒤 각 상품의 사용자에 차례로 접근하면 최초 상품 조회 이후 연관 사용자를 위한 추가 쿼리가 반복되는 N+1 문제가 생길 수 있다. 연관관계를 객체 필드 하나로 표현했더라도 실제로 발생하는 조회 횟수는 별도로 살펴봐야 한다.

API 응답에서도 엔티티 자체를 그대로 반환하기보다 필요한 값을 DTO로 변환하는 방향을 고려해야 한다. 이번 실습 요구사항에도 `Product → User` 관계를 설정한 뒤 DTO 응답으로 변환하는 과정이 포함된다. 이는 데이터베이스 연관관계와 외부 API의 응답 구조를 같은 것으로 취급하지 않고, 각 계층의 책임을 분리하기 위한 단계다.

## 트랜잭션은 변경 작업의 경계를 만든다

상품 등록처럼 단일 저장으로 끝나는 기능도 있지만, 실제 비즈니스 작업은 여러 데이터 변경을 하나의 단위로 묶는 경우가 많다. 중간 단계에서 예외가 발생했는데 앞선 변경만 반영되면 데이터가 불완전한 상태로 남는다. 트랜잭션은 관련된 데이터베이스 작업을 하나의 논리적 작업 단위로 묶어 커밋하거나 롤백한다.

`@Transactional`을 적용하면 Spring의 프록시가 메서드 호출 전후에서 트랜잭션을 시작하고 종료한다. 정상적으로 끝나면 커밋하고, 롤백 대상 예외가 발생하면 변경을 되돌린다.

서비스 계층에서는 조회와 변경의 성격을 구분해 다음과 같이 경계를 잡을 수 있다.

```java
@Service
@Transactional(readOnly = true)
public class ProductService {

    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    public Product findById(Long id) {
        return productRepository.findById(id)
                .orElseThrow();
    }

    @Transactional
    public void changePrice(Long id, long price) {
        Product product = productRepository.findById(id)
                .orElseThrow();

        product.changePrice(price);
    }
}
```

클래스에는 `@Transactional(readOnly = true)`를 지정해 기본 조회 경계를 만들고, 등록·수정·삭제 메서드에는 쓰기 가능한 `@Transactional`을 개별 적용하는 구조다. 읽기 전용 트랜잭션은 변경 감지를 위한 스냅샷 생성을 생략하는 등 조회 작업에 맞는 최적화에 활용할 수 있다.

`changePrice()`에서는 영속 상태로 조회한 `Product`를 변경하기 때문에 커밋 시점의 변경 감지가 `UPDATE`를 만든다. 이처럼 트랜잭션은 단순히 예외가 발생했을 때 되돌리는 장치만이 아니라, 영속성 컨텍스트가 엔티티 변경을 추적하고 데이터베이스에 반영하는 범위이기도 하다.

롤백 규칙도 구분해야 한다. Unchecked Exception은 기본적으로 자동 롤백되지만 Checked Exception까지 같은 방식으로 롤백해야 한다면 `rollbackFor`를 지정해야 한다. 예외를 잡아서 무시하면 프록시는 작업이 정상 종료되었다고 판단할 수 있으므로, 오류를 어떻게 전파할지도 트랜잭션 설계에 포함된다.

또 하나의 함정은 내부 호출(self-invocation)이다. `@Transactional`은 프록시를 통과하는 외부 메서드 호출에 적용된다. 같은 클래스 안에서 `this.someMethod()`로 트랜잭션 메서드를 직접 호출하면 프록시를 거치지 않으므로 기대한 트랜잭션 경계가 만들어지지 않는다.

```text
외부 객체 → Spring 프록시 → @Transactional 메서드
                         └→ 트랜잭션 적용

같은 객체의 메서드 → this.@Transactional메서드
                    └→ 프록시 우회, 트랜잭션 적용 안 됨
```

> 애노테이션 자체가 트랜잭션을 실행하는 함수는 아니다. Spring이 애노테이션 메타데이터를 읽고 프록시를 구성한 뒤, 그 프록시를 통과하는 호출에 트랜잭션 시작·커밋·롤백 동작을 덧붙인다.
{: .prompt-info }

## 동시에 수정할 때는 락 전략이 필요하다

트랜잭션이 각 작업의 경계를 보장해도 여러 트랜잭션이 동시에 같은 데이터를 수정하면 충돌이 생길 수 있다. 예를 들어 두 요청이 같은 상품 재고를 동시에 읽고 각각 값을 변경하면, 나중에 커밋된 값이 먼저 반영된 변경을 덮어쓰는 갱신 손실(lost update)이 발생할 수 있다.

```text
초기 값: 10

트랜잭션 A: 10 조회 → 9로 변경 ─────────→ 커밋
트랜잭션 B:    10 조회 → 8로 변경 ─────→ 커밋

두 변경이 모두 보존되지 않고 마지막 값이 앞선 변경을 덮을 수 있음
```

이 문제를 제어하는 대표적인 선택지가 낙관적 락과 비관적 락이다.

| 구분 | 낙관적 락(Optimistic Lock) | 비관적 락(Pessimistic Lock) |
|---|---|---|
| 기본 가정 | 충돌이 자주 발생하지 않는다 | 충돌이 자주 발생할 수 있다 |
| 제어 방식 | 버전 값을 비교해 수정 충돌 감지 | 조회 시점에 DB 배타 락 획득 |
| 핵심 수단 | `@Version` 컬럼 | `LockModeType.PESSIMISTIC_WRITE` |
| 특징 | 평상시 잠금 비용을 줄이고 충돌을 사후 감지 | 다른 트랜잭션의 수정을 먼저 차단 |

낙관적 락은 엔티티에 버전 필드를 두고, 조회했을 때의 버전과 수정 시점의 버전이 같은지 확인한다.

```java
@Entity
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    private Long version;

    private long stock;
}
```

다른 트랜잭션이 먼저 같은 행을 수정했다면 버전이 증가하므로 뒤늦게 수정하려는 트랜잭션은 충돌을 감지할 수 있다. 충돌이 드문 환경에서 모든 요청을 미리 잠그지 않고 갱신 손실을 발견하는 방식이다.

비관적 락은 충돌 가능성이 높다고 보고 `LockModeType.PESSIMISTIC_WRITE`를 사용해 데이터베이스의 `SELECT FOR UPDATE` 배타 락을 획득한다. 한 트랜잭션이 작업하는 동안 다른 트랜잭션의 수정을 대기시키므로 충돌을 선제적으로 막을 수 있지만, 잠금 대기와 처리량을 함께 고려해야 한다.

따라서 두 방식 중 하나가 항상 우월한 것은 아니다. 충돌이 드물다면 낙관적 락의 가정이 잘 맞고, 동일 데이터에 대한 쓰기 경쟁이 잦다면 비관적 락으로 수정 순서를 통제하는 편이 적합할 수 있다. 핵심은 “트랜잭션을 붙였으니 동시성도 해결되었다”고 간주하지 않고, 같은 데이터를 동시에 바꾸는 경로를 별도로 식별하는 것이다.

## Swagger로 구현과 API 계약을 연결한다

백엔드 API는 구현만 동작한다고 끝나지 않는다. 프론트엔드나 다른 서비스가 URI, 요청 형식, 응답 코드와 DTO 구조를 이해할 수 있어야 한다. 문서를 코드와 별도로 관리하면 구현이 바뀌었는데 명세가 갱신되지 않는 문제가 생긴다.

`springdoc-openapi`는 컨트롤러와 관련 애노테이션을 바탕으로 OpenAPI 3.0 명세와 대화형 Swagger UI를 생성한다. 주요 애노테이션의 역할은 다음과 같다.

- `@Tag`: 컨트롤러의 API를 기능별로 그룹화한다.
- `@Operation`: 개별 API가 수행하는 기능을 설명한다.
- `@ApiResponse`: 상태 코드별 응답의 의미를 기록한다.
- `@Schema`: 요청·응답 DTO 필드의 의미를 명세한다.

```java
@Tag(name = "Products", description = "상품 API")
@RestController
@RequestMapping("/api/products")
public class ProductController {

    @Operation(summary = "상품 단건 조회")
    @ApiResponse(responseCode = "200", description = "상품 조회 성공")
    @GetMapping("/{id}")
    public ProductResponse getProduct(@PathVariable Long id) {
        return productService.findById(id);
    }
}
```

Swagger UI는 `/swagger-ui/index.html` 또는 `/swagger-ui.html` 경로에서 확인할 수 있고, 문서 화면에서 API 요청도 보낼 수 있다. 이 구조는 문서를 작성하는 비용을 줄이는 것보다 구현과 명세의 거리를 좁힌다는 점에서 의미가 크다.

다만 개발 편의 기능을 운영 환경에 그대로 노출해서는 안 된다. Swagger UI를 공개하면 API 구조와 테스트 기능이 외부에 드러날 수 있으므로 운영 환경에서는 접근을 차단하거나 별도 인증을 적용해야 한다.

## Actuator로 실행 중인 서비스를 관찰한다

Swagger가 외부 사용자를 위한 API 계약을 보여 준다면 Actuator는 실행 중인 애플리케이션의 내부 상태를 운영자에게 제공한다. 배포가 성공했다는 사실만으로 서비스가 정상이라고 판단할 수는 없다. 요청을 처리할 준비가 되었는지, 메트릭이 어떻게 변하는지, 장애 분석을 위해 특정 패키지의 로그를 더 자세히 볼 필요가 있는지 확인할 통로가 필요하다.

Spring Boot Actuator는 이러한 정보를 엔드포인트 형태로 제공한다.

| 엔드포인트 | 용도 |
|---|---|
| `/actuator/health` | 애플리케이션 상태 확인 |
| `/actuator/metrics` | 애플리케이션 메트릭 확인 |
| `/actuator/loggers` | 로거와 로그 레벨 조회·제어 |
| `/actuator/env` | 환경 정보 확인 |
| `/actuator/prometheus` | Prometheus 연동용 메트릭 제공 |

`/actuator/loggers/{packageName}`에 POST 요청을 보내면 서버를 다시 시작하지 않고 특정 패키지의 로그 레벨을 `DEBUG` 또는 `INFO`로 변경할 수 있다. 평상시에는 불필요한 상세 로그를 줄이고, 장애를 분석할 때 필요한 범위만 상세하게 관찰하는 방식으로 활용할 수 있다.

Kubernetes와 연결할 때는 생존 상태와 트래픽 수용 가능 상태를 나누어 판단한다.

```text
/actuator/health/liveness
  └→ 애플리케이션 내부 장애 여부
     └→ 실패 시 컨테이너 재시작 판단

/actuator/health/readiness
  └→ 현재 요청을 받을 준비가 되었는지
     └→ 실패 시 트래픽 라우팅 대상에서 제외
```

프로세스가 살아 있다는 사실과 정상적으로 요청을 받을 수 있다는 사실은 같지 않다. 애플리케이션이 기동 중이거나 일시적으로 트래픽을 처리할 준비가 되지 않았다면 재시작보다 라우팅 제외가 적절할 수 있다. Liveness와 Readiness를 구분하면 두 상태에 서로 다른 운영 대응을 연결할 수 있다.

Actuator 엔드포인트에는 환경 정보나 로깅 설정처럼 민감한 내용이 포함될 수 있다. 따라서 `management.endpoints.web.exposure.include` 설정으로 운영에 필요한 엔드포인트만 선별해 공개해야 한다. 모니터링 기능을 추가하는 것과 그 관리 기능을 안전하게 노출하는 것은 하나의 작업으로 봐야 한다.

## 실습

이번 일차의 실습은 JPA 영속 계층을 구성한 뒤 트랜잭션, 문서화, 모니터링을 차례로 연결하는 구조다. 제출 코드가 제공되지 않았으므로 구현 결과가 아니라 요구사항과 구현 방향을 기준으로 정리한다.

### Product CRUD와 N:1 연관관계

요구사항은 `Product` 엔티티와 `ProductRepository`를 만들고 상품 CRUD API를 구성하는 것이다. 이어서 상품과 사용자 사이에 `Product → User` 방향의 `@ManyToOne` 관계를 설정하고, `@JoinColumn(name = "user_id")`으로 외래키를 매핑해야 한다.

구현 방향은 다음 순서로 잡을 수 있다.

```text
Product 필드와 기본키 정의
  ↓
@Entity·@Table·@Column 매핑
  ↓
JpaRepository<Product, Long> 선언
  ↓
Service에 CRUD 작업과 트랜잭션 경계 배치
  ↓
Product.user에 @ManyToOne(fetch = LAZY) 적용
  ↓
@JoinColumn(name = "user_id")로 외래키 지정
  ↓
Controller 응답을 DTO로 변환
```

평가 기준은 엔티티와 테이블의 대응이 올바른지, 외래키를 보유한 `Product`를 연관관계의 주인으로 설정했는지, 불필요한 즉시 조회를 피하도록 `FetchType.LAZY`를 지정했는지다. 객체 참조를 추가한 뒤 실제 조회가 몇 번 발생하는지도 함께 확인해야 N+1 문제를 놓치지 않을 수 있다.

### 읽기·쓰기 트랜잭션 분리

`UserService`와 `ProductService` 클래스 레벨에는 `@Transactional(readOnly = true)`를 선언하고, 생성·수정·삭제 메서드에는 `@Transactional`을 별도로 지정하는 것이 요구사항이다.

구현 시에는 트랜잭션 범위를 Repository의 개별 호출이 아니라 하나의 비즈니스 작업 단위에 맞춰 Service 계층에 둔다. 수정 작업은 영속 상태의 엔티티를 조회하고 상태를 변경한 뒤, 커밋 시점의 변경 감지를 이용하는 흐름으로 구성할 수 있다.

평가 기준은 조회와 변경의 트랜잭션 속성을 구분했는지, 예외 발생 시 롤백 정책을 이해하고 있는지다. 같은 클래스 내부 호출이 프록시를 우회한다는 점도 메서드 분리 과정에서 확인해야 한다.

### Swagger API 문서화

`springdoc-openapi` 의존성을 추가하고 컨트롤러에 `@Tag`, `@Operation`, `@ApiResponse`를 적용해 Swagger UI 명세를 구성하는 것이 요구사항이다.

구현 방향은 컨트롤러 단위로 API를 그룹화하고, 각 엔드포인트에 기능과 상태 코드별 응답 의미를 기록하는 것이다. DTO에는 필요한 경우 `@Schema`를 적용해 필드 의미를 드러낼 수 있다. 평가 기준은 `/swagger-ui/index.html`에서 명세가 노출되는지와 UI를 통한 API 요청이 가능한지다. 운영 환경에서는 동일 UI를 그대로 공개하지 않도록 접근 제한도 설계에 포함해야 한다.

### Actuator 모니터링과 로그 레벨 제어

마지막 실습은 `spring-boot-starter-actuator`를 적용하고 `/actuator/health`, `/actuator/metrics`를 노출하는 것이다. 이어서 `/actuator/loggers` 엔드포인트에 POST 요청을 보내 특정 패키지의 로그 레벨을 런타임에 `DEBUG`에서 `INFO`로 변경하도록 구성한다.

구현 방향은 필요한 엔드포인트를 먼저 식별한 뒤 `management.endpoints.web.exposure.include`로 공개 범위를 제한하는 것이다. 평가 기준은 헬스와 메트릭 엔드포인트가 목적에 맞게 노출되는지, 애플리케이션 재시작 없이 로그 레벨이 변경되는지, 불필요하거나 민감한 관리 엔드포인트가 외부에 함께 공개되지 않는지다.

## 정리

JPA는 SQL을 감추는 도구라기보다 객체의 상태와 데이터베이스 행을 영속성 컨텍스트 안에서 연결하는 기술이었다. 연관관계에서는 외래키의 주인과 지연 로딩을 명시하고, 트랜잭션과 락에서는 작업 경계와 동시 수정 충돌을 별개의 문제로 다뤄야 했다. 여기에 Swagger로 API 계약을 코드와 연결하고 Actuator로 실행 상태를 관찰하면서, 요청 처리부터 저장·협업·운영까지 백엔드 서비스의 전체 흐름을 하나로 이어 볼 수 있었다.

---

이전 글: [4일차 — IoC/DI에서 비동기 처리까지](/posts/skala-java-springboot-day4/)

시리즈 안내: [Java, SpringBoot, Rest API 구현 — 5일 학습 로드맵](/posts/skala-java-springboot-roadmap/)
