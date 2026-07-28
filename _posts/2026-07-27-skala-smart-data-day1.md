---
title: "[SKALA] 스마트 데이터 이해 및 활용 1일차 — 관계형 데이터베이스와 모델링"
date: 2026-07-26 09:00:00 +0900
categories:
  - SKALA
  - Database
tags: [skala, database, rdbms, erd, schema, ddl, dml, postgresql]
description: "파일과 DB의 차이, 관계형 모델, PK와 FK, ERD, 정규화, PostgreSQL 스키마, DDL과 DML을 주문 시스템 예제로 정리한다."
permalink: /posts/skala-smart-data-day1/
---

## 오늘의 질문

1일차의 핵심은 SQL 문법보다 먼저 **현실의 데이터를 어떤 구조로 저장할 것인가**를 결정하는 것이다.

엑셀에서도 데이터를 표로 관리할 수 있는데 왜 데이터베이스가 필요할까? 고객과 주문을 왜 서로 다른 테이블로 나눌까? 나눈 데이터는 어떻게 다시 연결할까? 이 질문에 답할 수 있어야 이후의 JOIN과 성능 최적화도 자연스럽게 이해할 수 있다.

## 파일 대신 데이터베이스를 사용하는 이유

작은 고객 명단은 스프레드시트 하나로도 충분하다. 하지만 데이터와 사용자가 늘어나면 다음 문제가 생긴다.

- 같은 고객 정보가 여러 파일에 중복된다.
- 한 파일만 수정되어 서로 다른 값이 남는다.
- 여러 사람이 동시에 수정할 때 작업이 충돌한다.
- 유효하지 않은 값의 입력을 일관되게 막기 어렵다.
- 대량의 데이터를 조건별로 검색하고 집계하기 어렵다.

데이터베이스는 단순한 파일 모음이 아니다. **데이터뿐 아니라 구조, 관계, 제약조건을 함께 관리하는 저장소**다. 이 저장소를 생성하고 조회하며 동시 접근, 권한, 백업을 관리하는 소프트웨어가 DBMS(Database Management System)다.

예를 들어 PostgreSQL은 DBMS이고, 그 안에 우리가 만든 `skala_shop` 데이터베이스와 테이블이 존재한다.

## 관계형 모델의 기본 단위

관계형 데이터베이스는 데이터를 테이블 형태로 표현한다.

| 용어 | 의미 | 고객 테이블의 예 |
|---|---|---|
| 테이블(Table) | 같은 종류의 데이터를 모은 구조 | `customers` |
| 행(Row) | 하나의 데이터 항목 | 고객 한 명 |
| 열(Column) | 데이터가 가진 속성 | 이름, 이메일 |
| 도메인(Domain) | 열에 들어갈 수 있는 값의 범위 | 이메일 문자열, 가입 날짜 |

여기서 중요한 점은 표처럼 **보인다**는 것보다 각 열의 의미와 허용되는 값이 정의되어 있다는 것이다. DB는 자료형과 제약조건을 이용해 잘못된 상태가 저장되지 않도록 막는다.

## Primary Key와 Foreign Key

### Primary Key

Primary Key(PK)는 테이블의 각 행을 유일하게 식별한다.

```sql
CREATE TABLE customers (
    customer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    joined_at   DATE NOT NULL DEFAULT CURRENT_DATE
);
```

`customer_id`는 중복될 수 없고 `NULL`일 수도 없다. 이메일도 유일할 수 있지만 변경될 가능성이 있는 업무 데이터다. 따라서 일반적으로 별도의 숫자 ID를 식별자로 두면 다른 테이블에서 안정적으로 참조하기 쉽다.

### Foreign Key

Foreign Key(FK)는 다른 테이블의 행을 가리킨다.

```sql
CREATE TABLE orders (
    order_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    ordered_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers (customer_id)
);
```

존재하지 않는 고객의 `customer_id`로 주문을 만들면 FK 제약조건이 입력을 거부한다. 이처럼 PK와 FK는 테이블을 연결하는 표시에 그치지 않고 **참조 무결성**을 지키는 규칙이다.

## 관계의 종류

테이블 사이의 관계는 크게 세 가지다.

### 1:1 관계

고객 한 명이 고객 상세 정보 하나만 가지는 경우다. 자주 조회하는 기본 정보와 크거나 민감한 상세 정보를 분리할 때 사용할 수 있다.

### 1:N 관계

고객 한 명이 여러 주문을 만드는 관계다. `orders`의 여러 행이 같은 `customer_id`를 가질 수 있다.

```text
customers 1 ─────< N orders
```

### N:M 관계

주문 하나에는 여러 상품이 있고, 상품 하나도 여러 주문에 포함될 수 있다. 관계형 DB에서는 이를 직접 저장하지 않고 중간 테이블로 풀어낸다.

```text
orders 1 ─────< order_items >───── 1 products
```

```sql
CREATE TABLE products (
    product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    price      NUMERIC(12, 2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE order_items (
    order_id   BIGINT NOT NULL REFERENCES orders (order_id),
    product_id BIGINT NOT NULL REFERENCES products (product_id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, product_id)
);
```

`order_items`는 주문과 상품을 잇는 동시에 수량과 주문 당시 가격처럼 **관계 자체의 속성**도 저장한다.

## 정규화: 데이터를 왜 나누는가

고객 이름과 이메일을 주문 행마다 반복해서 저장한다고 가정해 보자.

| order_id | customer_name | customer_email | product |
|---:|---|---|---|
| 101 | 김지훈 | jihoon@example.com | 키보드 |
| 102 | 김지훈 | jihoon@example.com | 마우스 |

이메일이 바뀌면 모든 주문 행을 수정해야 한다. 일부만 수정되면 같은 고객에게 서로 다른 이메일이 생긴다. 이를 갱신 이상(update anomaly)이라고 한다.

고객 정보는 `customers`, 주문 정보는 `orders`에 한 번씩 저장하고 FK로 연결하면 중복과 불일치를 줄일 수 있다. 이것이 정규화의 핵심 목적이다.

다만 정규화는 무조건 테이블을 많이 쪼개는 일이 아니다. **각 사실을 어디에 한 번만 저장할지 결정하는 과정**으로 이해하는 편이 좋다.

## ERD로 구현 전에 검증하기

ERD(Entity-Relationship Diagram)는 엔티티와 속성, 엔티티 사이의 관계를 표현한다. 바로 `CREATE TABLE`을 작성하기 전에 다음 순서로 생각해 볼 수 있다.

1. 관리해야 하는 대상은 무엇인가?  
   고객, 주문, 상품
2. 각 대상을 구별하는 값은 무엇인가?  
   `customer_id`, `order_id`, `product_id`
3. 각 대상은 어떤 정보를 가지는가?  
   고객의 이메일, 주문 시각, 상품 가격
4. 대상 사이의 관계는 무엇인가?  
   고객은 여러 주문을 만들고, 주문은 여러 상품을 포함한다.
5. 반드시 지켜야 할 규칙은 무엇인가?  
   이메일은 중복되지 않고, 수량과 가격은 음수가 될 수 없다.

이 질문에 답하면 다음과 같은 논리 모델이 나온다.

```text
CUSTOMERS
- customer_id (PK)
- name
- email (UNIQUE)
- joined_at

ORDERS
- order_id (PK)
- customer_id (FK)
- ordered_at
- status

PRODUCTS
- product_id (PK)
- name
- price

ORDER_ITEMS
- order_id (PK, FK)
- product_id (PK, FK)
- quantity
- unit_price
```

ERD를 읽을 때는 선의 모양을 외우는 데 그치지 않고 “주문은 고객 없이 존재할 수 있는가?”, “한 상품이 한 주문에 두 번 나타날 수 있는가?”처럼 업무 규칙을 문장으로 되돌려 확인해야 한다.

## 모델과 스키마는 같은 말일까?

비슷하게 사용되지만 관점이 다르다.

- **개념 모델**: 고객, 주문, 상품처럼 업무의 큰 대상을 표현한다.
- **논리 모델**: 속성, PK, FK, 관계를 구체화한다.
- **물리 모델**: 실제 DBMS의 자료형, 인덱스, 파티션 등을 결정한다.
- **스키마**: DB에 구현된 테이블, 열, 제약조건 등 구조의 정의다.

PostgreSQL에서 `schema`는 데이터베이스 내부 객체를 묶는 **이름 공간(namespace)**이라는 더 구체적인 의미도 가진다.

```sql
CREATE SCHEMA ecom;

CREATE TABLE ecom.customers (
    customer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
```

`ecom.customers`처럼 스키마 이름을 함께 쓰면 같은 데이터베이스 안에서 도메인별 객체를 구분하고 이름 충돌을 피할 수 있다.

## RDBMS를 비교할 때 볼 기준

PostgreSQL, MySQL, Oracle 같은 RDBMS는 모두 관계형 모델과 SQL을 사용하지만 세부 문법과 운영 방식은 다르다. 단순히 “무엇이 더 좋은가”보다 다음 기준으로 선택해야 한다.

- 필요한 SQL 기능과 자료형을 지원하는가?
- 예상 읽기·쓰기 패턴과 데이터 규모에 맞는가?
- 고가용성, 백업, 복구 도구가 요구사항에 맞는가?
- 팀의 운영 경험과 생태계가 충분한가?
- 라이선스와 Cloud 비용은 적절한가?

이번 과정에서는 PostgreSQL을 기준으로 학습한다. 표준 SQL에 가까운 문법과 풍부한 기능을 제공하므로 관계형 DB의 개념을 익히기에 좋다. 제품별 차이는 개념을 익힌 뒤 비교하는 것이 효율적이다.

## DDL과 DML

SQL은 역할에 따라 구분할 수 있다.

| 분류 | 역할 | 대표 명령 |
|---|---|---|
| DDL | 구조를 정의·변경 | `CREATE`, `ALTER`, `DROP` |
| DML | 데이터를 조회·변경 | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| DCL | 권한을 제어 | `GRANT`, `REVOKE` |
| TCL | 트랜잭션을 제어 | `COMMIT`, `ROLLBACK` |

앞에서 사용한 `CREATE TABLE`은 DDL이다. 만들어진 테이블에 데이터를 넣고 조회하는 작업은 DML이다.

```sql
INSERT INTO customers (name, email)
VALUES ('김지훈', 'jihoon@example.com');

SELECT customer_id, name, email
FROM customers
WHERE joined_at = CURRENT_DATE;
```

데이터를 변경할 때는 먼저 같은 조건의 `SELECT`로 대상 행을 확인하는 습관이 안전하다.

```sql
SELECT customer_id, name, email
FROM customers
WHERE customer_id = 1;

UPDATE customers
SET email = 'new-address@example.com'
WHERE customer_id = 1;
```

`UPDATE`나 `DELETE`에서 `WHERE`를 빠뜨리면 모든 행이 대상이 된다. 실습 환경에서도 변경 범위를 항상 확인해야 한다.

## 1일차 종합 실습 아이디어

작은 쇼핑몰 DB를 직접 설계해 본다.

1. 고객, 상품, 주문, 주문 항목의 요구사항을 문장으로 적는다.
2. 엔티티와 속성을 찾는다.
3. PK, FK와 관계의 카디널리티를 표시한다.
4. PostgreSQL 자료형과 제약조건을 정한다.
5. DDL로 테이블을 생성한다.
6. 테스트 데이터를 DML로 입력한다.
7. 잘못된 이메일 중복, 음수 수량, 존재하지 않는 고객 주문을 넣어 제약조건이 동작하는지 확인한다.

정상 데이터만 입력해 보는 것보다 **실패해야 하는 데이터가 실제로 실패하는지** 확인할 때 설계의 의도가 선명해진다.

## 자주 헷갈린 부분

- 데이터베이스는 데이터 저장소이고, DBMS는 그 저장소를 관리하는 소프트웨어다.
- PK는 행을 식별하고, FK는 다른 테이블의 행을 참조한다.
- N:M 관계는 두 개의 1:N 관계와 중간 테이블로 구현한다.
- 정규화의 목적은 테이블 수를 늘리는 것이 아니라 데이터 중복과 이상 현상을 줄이는 것이다.
- ERD의 관계선에는 업무 규칙이 담겨 있다.
- PostgreSQL의 스키마는 데이터베이스 내부의 이름 공간이라는 의미도 가진다.
- DDL은 구조를, DML은 데이터를 다룬다.

## 수업 후 체크리스트

- [ ] DB와 DBMS의 차이를 설명할 수 있다.
- [ ] 테이블, 행, 열, 도메인을 예로 설명할 수 있다.
- [ ] PK와 FK가 필요한 이유를 설명할 수 있다.
- [ ] 1:1, 1:N, N:M 관계를 구분할 수 있다.
- [ ] 간단한 요구사항을 ERD와 테이블로 바꿀 수 있다.
- [ ] PostgreSQL의 database와 schema를 구분할 수 있다.
- [ ] `CREATE`, `INSERT`, `SELECT`, `UPDATE` 문을 작성할 수 있다.
- [ ] 제약조건을 위반하는 테스트로 설계를 검증할 수 있다.

## 나의 수업 메모

> 수업 중 인상 깊었던 설명, 실습에서 발생한 오류, 강사님의 팁을 여기에 추가한다.
{: .prompt-tip }

- 오늘 새롭게 이해한 것:
- 실습 중 막혔던 부분:
- 다시 확인할 개념:
- 다음 실습에서 시도할 것:

---

시리즈 안내: [스마트 데이터 이해 및 활용 — 4일 학습 로드맵](/posts/skala-smart-data-roadmap/)

