---
title: "[SKALA] 스마트 데이터 이해 및 활용 1일차 — 관계형 데이터베이스와 모델링"
date: 2026-07-27 09:00:00 +0900
categories:
  - SKALA
  - Database
tags: [skala, database, rdbms, erd, schema, ddl, dml, postgresql]
description: "DB의 발전 과정과 ACID·WAL·격리 수준부터 관계형 모델, 정규화, ERD, 물리 모델, RDBMS 비교, PostgreSQL DDL·DML까지 한 번에 정리한다."
permalink: /posts/skala-smart-data-day1/
---

1일차의 핵심은 SQL 문법보다 먼저 **현실의 데이터를 어떤 구조로 저장하고, DBMS가 그 구조를 어떻게 안전하게 지키는지** 이해하는 것이다. 파일 시스템에서 관계형 데이터베이스로 발전한 이유부터 트랜잭션, 관계형 모델, 정규화, ERD, 물리 설계, DDL·DML까지 하나의 쇼핑몰과 학사 시스템 예제로 연결해 정리한다.

## 파일 대신 데이터베이스를 사용하는 이유

작은 고객 명단은 스프레드시트 하나로도 충분하다. 하지만 데이터와 사용자가 늘어나면 다음 문제가 생긴다.

- 같은 고객 정보가 여러 파일에 중복된다.
- 한 파일만 수정되어 서로 다른 값이 남는다.
- 여러 사람이 동시에 수정할 때 작업이 충돌한다.
- 유효하지 않은 값의 입력을 일관되게 막기 어렵다.
- 대량의 데이터를 조건별로 검색하고 집계하기 어렵다.

데이터베이스는 단순한 파일 모음이 아니다. **데이터뿐 아니라 구조, 관계, 제약조건을 함께 관리하는 저장소**다. 이 저장소를 생성하고 조회하며 동시 접근, 권한, 백업을 관리하는 소프트웨어가 DBMS(Database Management System)다.

예를 들어 PostgreSQL은 DBMS이고, 그 안에 우리가 만든 `skala_shop` 데이터베이스와 테이블이 존재한다.

## 데이터베이스의 발전 과정

데이터베이스 기술의 변화는 “어떻게 저장할까?”보다 **일관성, 확장성, 가용성 사이에서 어떤 균형을 잡을까?**라는 문제에 가깝다.

| 시대 | 대표 방식 | 장점 | 한계 |
|---|---|---|---|
| 파일 시스템 | 애플리케이션별 파일 | 단순하고 시작이 빠름 | 중복·불일치, 동시 접근과 복구가 어려움 |
| 계층형 DB | IBM IMS 같은 트리 구조 | 정해진 경로 탐색이 빠름 | 1:N에는 강하지만 N:M 표현과 구조 변경이 어려움 |
| 관계형 DBMS | Oracle, MySQL, PostgreSQL | SQL 표준, 무결성, 트랜잭션, 유연한 JOIN | 대규모 수평 확장과 JOIN 비용 |
| NoSQL | MongoDB, Redis, Cassandra | 유연한 모델과 수평 확장 | 제품과 설정에 따라 강한 일관성·복잡한 JOIN이 제한됨 |
| 분산·Cloud DB | Spanner, Aurora, CockroachDB | 관리 자동화, 고가용성, 분산 트랜잭션 | 네트워크 지연, 비용, 운영 복잡도 |

관계형 DB가 등장한 중요한 이유는 애플리케이션마다 저장 형식을 직접 관리하지 않고, 여러 사용자가 같은 데이터를 **통합된 규칙 아래 동시에 다루기 위해서**다. NoSQL이나 분산 DB는 관계형 DB의 단순한 후계자가 아니라, 데이터 형태와 확장 요구가 달라지면서 등장한 다른 선택지다.

## 트랜잭션과 ACID

트랜잭션은 논리적으로 하나의 작업 단위다. 계좌 이체는 출금과 입금이라는 두 SQL로 구성되더라도, 업무 관점에서는 둘이 함께 성공하거나 함께 실패해야 한다.

```sql
BEGIN;

UPDATE accounts
SET balance = balance - 10000
WHERE account_id = 'A'
  AND balance >= 10000;

UPDATE accounts
SET balance = balance + 10000
WHERE account_id = 'B';

COMMIT;
```

실제 애플리케이션에서는 첫 번째 `UPDATE`의 영향 행 수가 1인지 확인하고, 그렇지 않으면 잔액 부족으로 판단해 `ROLLBACK`해야 한다. 트랜잭션이 보장해야 하는 네 성질을 ACID라고 부른다.

| 속성 | 의미 | 계좌 이체 예시 |
|---|---|---|
| Atomicity, 원자성 | 전부 수행하거나 전부 취소 | 출금만 되고 입금이 누락되면 안 됨 |
| Consistency, 일관성 | 트랜잭션 전후에 정의된 규칙을 만족 | 잔액·FK·CHECK 같은 불변식을 지킴 |
| Isolation, 격리성 | 동시에 실행되는 트랜잭션의 간섭을 제어 | 다른 이체가 중간 상태를 잘못 읽지 않음 |
| Durability, 지속성 | 커밋된 결과는 장애 뒤에도 보존 | 성공 응답 뒤 서버가 꺼져도 이체 결과 복구 |

여기서 일관성은 “모든 복제본이 즉시 같은 값”이라는 분산 시스템의 consistency와 문맥이 다르다. ACID의 일관성은 제약조건과 업무 불변식이 유효한 상태에서 다음 유효한 상태로 이동한다는 뜻이다. DBMS가 PK·FK·CHECK를 지켜 주더라도, “총 출금액은 승인 한도를 넘을 수 없다” 같은 업무 규칙은 애플리케이션이나 프로시저가 올바르게 구현해야 한다.

MySQL에서는 저장 엔진에 따라서도 보장 수준이 달라진다. 현대 MySQL의 기본인 InnoDB는 Redo/Undo Log와 MVCC로 트랜잭션을 지원하지만, 과거 MyISAM은 롤백과 FK를 지원하지 않았다. PostgreSQL은 MVCC와 WAL, Serializable에서 SSI를 사용한다. 따라서 “RDBMS니까 ACID”라고 끝내지 말고 엔진, 격리 수준, 동기 커밋, 복제 설정까지 확인해야 한다.

## WAL이 커밋을 지키는 방법

WAL(Write-Ahead Logging)은 데이터 페이지보다 **변경 로그를 먼저 영구 저장**하는 원칙이다. PostgreSQL의 흐름을 단순화하면 다음과 같다.

```text
UPDATE 실행
  → 변경 내용을 WAL 버퍼에 기록
  → 메모리의 데이터 페이지(shared buffer)를 변경
  → COMMIT 레코드를 WAL 파일에 fsync
  → 클라이언트에 성공 응답
  → 이후 checkpoint가 dirty page를 데이터 파일에 기록
```

데이터 파일을 매번 즉시 기록하면 작은 랜덤 I/O가 많이 발생한다. WAL은 로그를 순차적으로 먼저 기록해 커밋 지연을 줄이고, 장애가 나면 로그를 재생해 데이터 파일을 일관된 상태로 복구한다.

```sql
SHOW wal_level;
SHOW synchronous_commit;
SHOW checkpoint_timeout;
```

- `wal_level`은 복제와 논리 디코딩에 필요한 WAL 정보량을 결정한다.
- `synchronous_commit = on`은 커밋 레코드의 내구성을 우선한다.
- checkpoint는 WAL 이후에 수정된 데이터 페이지를 데이터 파일로 밀어내 복구 시작 지점을 앞당긴다.

엄밀히 말해 PostgreSQL 장애 복구는 커밋된 WAL 레코드를 재적용하는 Redo 중심이다. 미커밋 버전은 MVCC 가시성 규칙상 보이지 않으며 이후 VACUUM 대상이 된다. “모든 DB가 장애 복구 때 똑같이 Undo한다”라고 일반화하면 구현 차이를 놓칠 수 있다.

### WAL과 분산 합의는 해결하는 범위가 다르다

WAL은 한 DB 인스턴스의 내구성과 복구를 위한 메커니즘이다. 분산 DB에서는 여러 노드가 같은 변경 순서에 동의해야 하므로 Raft나 Paxos 같은 합의 알고리즘이 추가된다.

```text
클라이언트 요청
  → Leader가 로그에 기록
  → Follower에 로그 전파
  → 과반수 노드가 수락
  → Commit 확정
```

| 구분 | WAL | Consensus |
|---|---|---|
| 중심 범위 | 단일 인스턴스의 로그와 복구 | 여러 노드의 동일한 상태 |
| 핵심 목적 | 내구성, crash recovery | 강한 일관성, 리더 장애 대응 |
| 비용 | 디스크 동기화 | 디스크 I/O + 네트워크 왕복 |
| 대표 사례 | PostgreSQL WAL, InnoDB Redo Log | Raft, Paxos, Spanner 합의 |

분산 합의는 가용성을 높일 수 있지만 공짜는 아니다. 특히 멀티 리전 쓰기는 과반수 합의의 네트워크 왕복 시간만큼 지연이 커진다.

## 격리 수준과 동시성 이상 현상

여러 트랜잭션을 완전히 순차 실행하면 안전하지만 처리량이 크게 떨어진다. 격리 수준은 동시성을 얼마나 허용할지 정하는 정책이다.

| 이상 현상 | 설명 |
|---|---|
| Dirty Read | 다른 트랜잭션이 아직 커밋하지 않은 값을 읽음 |
| Non-repeatable Read | 같은 행을 다시 읽었더니 다른 트랜잭션의 UPDATE·DELETE 때문에 값이 달라짐 |
| Phantom Read | 같은 조건을 다시 조회했더니 INSERT·DELETE 때문에 행 집합이 달라짐 |

ANSI SQL의 전통적인 구분은 다음과 같다.

| 격리 수준 | Dirty Read | Non-repeatable Read | Phantom Read |
|---|---:|---:|---:|
| Read Uncommitted | 허용 | 허용 | 허용 |
| Read Committed | 방지 | 허용 | 허용 |
| Repeatable Read | 방지 | 방지 | 표준상 허용 |
| Serializable | 방지 | 방지 | 방지 |

그러나 표만 외우면 실제 제품 동작을 오해하기 쉽다. PostgreSQL의 기본값은 Read Committed이며 **문장마다 새 스냅샷**을 얻는다. Repeatable Read는 트랜잭션 동안 같은 스냅샷을 보고, Serializable은 SSI가 위험한 직렬화 패턴을 감지하면 한 트랜잭션을 실패시켜 재시도를 요구한다. MySQL InnoDB의 기본값은 Repeatable Read이며 consistent read와 next-key lock으로 팬텀을 억제한다. Oracle의 기본값은 Read Committed이고, SQL Server는 기본적으로 잠금 기반 Read Committed지만 `READ_COMMITTED_SNAPSHOT` 옵션으로 행 버전을 사용할 수 있다.

```sql
-- PostgreSQL 세션 A
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT COUNT(*) FROM orders WHERE status = 'PENDING';

-- 세션 B에서 PENDING 주문을 INSERT하고 COMMIT한 뒤,
-- 세션 A에서 같은 SELECT를 반복해도 같은 스냅샷을 본다.

COMMIT;
```

격리 수준을 높인다고 언제나 더 좋은 것은 아니다. 대기, 충돌, 롤백 가능성이 커질 수 있으므로 업무가 요구하는 정합성과 처리량을 함께 판단해야 한다.

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

키를 조금 더 엄밀하게 나누면 다음과 같다.

| 용어 | 의미 |
|---|---|
| Super Key | 행을 유일하게 식별할 수 있는 모든 컬럼 조합 |
| Candidate Key | 불필요한 컬럼을 제거해도 유일성을 잃는 최소 Super Key |
| Primary Key | 후보키 중 대표로 선택한 키 |
| Alternate Key | 선택되지 않은 나머지 후보키, 보통 `UNIQUE`로 구현 |
| Natural Key | 이메일·학번처럼 업무 의미가 있는 키 |
| Surrogate Key | `customer_id`처럼 식별만을 위해 만든 대체키 |
| Composite Key | 둘 이상의 컬럼으로 이루어진 키 |

대체키는 작고 안정적이어서 JOIN과 참조에 유리하지만, 대체키만 만들고 자연키의 중복 규칙을 잊어서는 안 된다. 예를 들어 `customer_id`가 있더라도 이메일 중복이 금지되는 업무라면 `UNIQUE (email)`을 별도로 선언해야 한다.

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

부모 행이 삭제·수정될 때 자식 행을 어떻게 처리할지도 모델의 일부다.

| 옵션 | 동작 | 적합한 예 |
|---|---|---|
| `ON DELETE CASCADE` | 부모 삭제 시 자식도 삭제 | 주문 삭제 시 주문 항목 삭제 |
| `ON DELETE SET NULL` | 자식 FK를 `NULL`로 변경 | 담당자 퇴사 후 담당자 미지정 |
| `RESTRICT` / `NO ACTION` | 자식이 있으면 부모 삭제 거부 | 상품이 남은 카테고리 삭제 방지 |
| `ON UPDATE CASCADE` | 부모 키 변경을 자식에 전파 | 변경 가능한 자연키를 참조한 경우 |

```sql
CREATE TABLE order_items (
    order_id   BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (order_id, product_id),
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id)
        REFERENCES orders (order_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id)
        REFERENCES products (product_id)
        ON DELETE RESTRICT
);
```

`CASCADE`는 편리하지만 삭제 범위를 숨길 수 있으므로 소유 관계가 분명할 때 사용한다. FK가 있다고 자식 쪽 인덱스가 모든 DBMS에서 자동 생성되는 것은 아니다. 부모 삭제 검사와 JOIN이 잦다면 `order_items(order_id)` 같은 FK 인덱스도 검토해야 한다.

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

### 함수 종속성으로 정규화를 이해하기

정규화의 이론적 바탕은 함수 종속성(Functional Dependency)이다. `X → Y`는 X 값이 같으면 Y 값도 반드시 같다는 뜻이다.

```text
customer_id → customer_name, customer_email
product_id  → product_name, current_price
order_id    → customer_id, ordered_at, status
(order_id, product_id) → quantity, unit_price
```

주문 항목의 키가 `(order_id, product_id)`라면 `quantity`는 키 전체에 종속된다. 반면 고객 이름이 `order_id`를 통해 `customer_id`에 종속된다면 주문 테이블에 고객 이름을 반복 저장하는 것은 이행 종속을 만든다.

| 정규형 | 핵심 조건 | 분해가 필요한 대표 상황 |
|---|---|---|
| 1NF | 한 셀에 하나의 원자값, 반복 그룹 제거 | `phone_numbers = '010..., 02...'` |
| 2NF | 1NF + 복합키의 일부에만 종속된 속성 제거 | `(order_id, product_id)`에서 `product_name`이 `product_id`에만 종속 |
| 3NF | 2NF + 비키 속성 사이의 이행 종속 제거 | `employee_id → dept_id → dept_name` |
| BCNF | 모든 결정자가 후보키 | 후보키가 겹치는 특수한 종속성 |

1NF의 “원자값”은 절대적인 물리 단위가 아니라 현재 데이터 모델에서 더 쪼개 조회할 필요가 없는 값이라는 의미다. 주소를 문자열 하나로 둘지 시·구·도로명으로 나눌지는 사용 요구사항에 따라 달라진다.

```sql
-- 정규화 전: 한 행에 상품 목록이 반복되는 구조
CREATE TABLE bad_orders (
    order_id      BIGINT PRIMARY KEY,
    customer_name TEXT,
    product_ids   TEXT  -- '101,205,319'
);

-- 정규화 후: 주문과 주문 항목을 분리
CREATE TABLE orders (
    order_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers (customer_id),
    ordered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    order_id   BIGINT REFERENCES orders (order_id),
    product_id BIGINT REFERENCES products (product_id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL,
    PRIMARY KEY (order_id, product_id)
);
```

좋은 분해는 원래 테이블을 JOIN했을 때 거짓 행이 생기지 않는 **무손실 분해(lossless decomposition)**여야 한다. 또한 중요한 함수 종속성을 각 분해된 테이블의 제약조건만으로 검사할 수 있는 **종속성 보존(dependency preservation)**도 바람직하다. 정규형 이름만 맞추는 것보다 이 두 성질과 실제 업무 규칙을 확인하는 것이 중요하다.

BCNF보다 더 높은 정규형도 있다. 4NF는 서로 독립인 다치 종속을 분리하고, 5NF는 여러 테이블의 조인 종속 때문에 생기는 중복을 다룬다. 일반적인 OLTP 설계는 3NF 또는 BCNF까지가 중심이고, 4NF·5NF는 복잡한 다대다 관계에서 필요성을 검토한다.

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

### 엔티티와 속성의 종류

엔티티는 독립적으로 식별하고 관리할 대상이다. 물리적 사람·상품뿐 아니라 주문, 결제, 수강처럼 사건도 엔티티가 될 수 있다.

- **강한 엔티티**는 자체 키로 식별된다. `customers.customer_id`가 예다.
- **약한 엔티티**는 소유자 없이는 식별되거나 존재하기 어렵다. `order_items`는 주문 키와 상품 키를 조합해 식별된다.
- **연관 엔티티**는 N:M 관계를 두 개의 1:N 관계로 풀면서 관계의 속성을 보관한다. 수강의 신청일·성적, 주문 항목의 수량·주문 당시 가격이 대표적이다.

속성도 역할에 따라 구분할 수 있다.

| 속성 종류 | 예 | 설계 시 생각할 점 |
|---|---|---|
| 단순 속성 | 이름 | 현재 업무에서 더 나눌 필요가 없음 |
| 복합 속성 | 주소 | 우편번호·도로명 등 검색 단위로 분리 가능 |
| 단일값 속성 | 생년월일 | 엔티티 하나에 보통 값 하나 |
| 다중값 속성 | 여러 전화번호 | 별도 자식 테이블로 분리하는 것이 일반적 |
| 유도 속성 | 주문 총액 | 저장할지 조회 시 계산할지 결정 |
| 선택 속성 | 고객 보조 연락처 | `NULL` 허용 여부와 의미 정의 |

### 카디널리티와 선택성

Crow's Foot 또는 IE 표기법은 최소·최대 참여 수를 함께 나타낸다.

```text
|  정확히 하나
O  0개, 선택적
<  여러 개

Customer |──O< Order
```

위 관계는 “고객은 주문이 없거나 여러 개일 수 있고, 각 주문은 정확히 한 고객에 속한다”라고 읽는다. 최소 카디널리티는 FK의 `NULL` 허용 여부, 최대 카디널리티는 `UNIQUE` 또는 교차 테이블 여부로 구현되는 경우가 많다.

```sql
-- 한 사용자에게 프로필은 최대 하나: FK + UNIQUE로 1:1 구현
CREATE TABLE customer_profiles (
    customer_id BIGINT PRIMARY KEY
        REFERENCES customers (customer_id)
        ON DELETE CASCADE,
    introduction TEXT
);
```

### DBML로 ERD를 코드처럼 관리하기

dbdiagram.io에서는 DBML로 논리 구조를 빠르게 그릴 수 있다.

```dbml
Table customers {
  customer_id bigint [pk, increment]
  name varchar(50) [not null]
  email varchar(255) [not null, unique]
}

Table orders {
  order_id bigint [pk, increment]
  customer_id bigint [not null]
  ordered_at timestamptz [not null]
}

Ref: orders.customer_id > customers.customer_id
```

ERD가 완성되면 다음을 역으로 검증한다.

- 모든 테이블에 안정적인 식별자가 있는가?
- 필수·선택 관계가 FK의 `NULL` 정책과 일치하는가?
- N:M 관계에 교차 엔티티가 있고, 관계 속성을 담았는가?
- 삭제 정책이 업무 수명주기와 일치하는가?
- 파생값을 중복 저장한다면 갱신 책임이 명확한가?
- 개인정보·민감정보가 불필요하게 여러 테이블에 복제되지 않았는가?

## 모델과 스키마는 같은 말일까?

비슷하게 사용되지만 관점이 다르다.

- **개념 모델**: 고객, 주문, 상품처럼 업무의 큰 대상을 표현한다.
- **논리 모델**: 속성, PK, FK, 관계를 구체화한다.
- **물리 모델**: 실제 DBMS의 자료형, 인덱스, 파티션 등을 결정한다.
- **스키마**: DB에 구현된 테이블, 열, 제약조건 등 구조의 정의다.

세 단계는 산출물 이름만 다른 것이 아니라 의사결정의 추상도가 다르다.

| 단계 | 중심 질문 | 주요 산출물 |
|---|---|---|
| 개념 모델 | 어떤 업무 대상과 관계가 있는가? | 핵심 엔티티, 업무 관계 |
| 논리 모델 | 각 대상의 속성·식별자·카디널리티는? | PK, FK, 정규화된 테이블 |
| 물리 모델 | 선택한 DBMS에 어떻게 구현할 것인가? | 자료형, 인덱스, 파티션, 이름 규칙 |

물리 모델에서는 조회 패턴, 예상 데이터량, 보존 기간, 동시 수정 방식까지 고려한다. 예를 들어 금액은 부동소수점 `REAL`보다 `NUMERIC(12, 2)`가 안전하고, 시각은 시스템 전체의 시간대 정책에 맞춰 `TIMESTAMPTZ`를 선택한다.

### 약한 엔티티와 N:M 관계

약한 엔티티는 부모 키를 식별자의 일부로 사용한다.

```sql
CREATE TABLE order_items (
    order_id   BIGINT NOT NULL
        REFERENCES orders (order_id) ON DELETE CASCADE,
    line_no    SMALLINT NOT NULL,
    product_id BIGINT NOT NULL
        REFERENCES products (product_id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (order_id, line_no)
);
```

`line_no`는 전체 시스템에서 유일하지 않지만 한 주문 안에서는 유일하다. 따라서 `(order_id, line_no)`가 완전한 식별자다. 반면 같은 상품이 주문에 한 번만 등장한다는 규칙이라면 `(order_id, product_id)`를 PK로 둘 수도 있다. 어느 키가 맞는지는 업무 규칙에 달려 있다.

### 낙관적 잠금과 비관적 잠금

동시에 같은 행을 수정할 수 있다면 물리 설계에서 충돌 전략도 생각해야 한다.

```sql
-- 낙관적 잠금: 읽을 때 얻은 version이 그대로일 때만 수정
UPDATE products
SET price = 25000,
    version = version + 1
WHERE product_id = 10
  AND version = 7;
```

영향받은 행이 0개면 다른 트랜잭션이 먼저 수정한 것이므로 새 값을 읽어 재시도한다. 충돌이 드문 환경에 적합하다.

```sql
BEGIN;

SELECT stock
FROM products
WHERE product_id = 10
FOR UPDATE;

UPDATE products
SET stock = stock - 1
WHERE product_id = 10
  AND stock > 0;

COMMIT;
```

비관적 잠금은 먼저 행을 잠가 다른 트랜잭션을 기다리게 한다. 충돌 가능성이 높고 반드시 순서를 보장해야 할 때 유용하지만, 대기와 교착상태를 관리해야 한다.

PostgreSQL에서 `schema`는 데이터베이스 내부 객체를 묶는 **이름 공간(namespace)**이라는 더 구체적인 의미도 가진다.

```sql
CREATE SCHEMA ecom;

CREATE TABLE ecom.customers (
    customer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(50) NOT NULL
);
```

`ecom.customers`처럼 스키마 이름을 함께 쓰면 같은 데이터베이스 안에서 도메인별 객체를 구분하고 이름 충돌을 피할 수 있다.

멀티 프로젝트에서는 한 데이터베이스에 모든 테이블을 `public`으로 몰아넣기보다 경계를 의도적으로 만든다.

```sql
CREATE SCHEMA app;
CREATE SCHEMA audit;
CREATE SCHEMA analytics;

SET search_path = app, public;
```

- 프로젝트별 데이터 격리가 매우 중요하면 **데이터베이스 분리**가 강하다.
- 같은 트랜잭션과 JOIN이 필요하지만 이름·권한 경계를 나누고 싶으면 **스키마 분리**가 적합하다.
- 접두사만 붙이는 방식은 단순하지만 DB 수준 권한과 이름 공간의 이점을 얻기 어렵다.

PostgreSQL의 `search_path`는 편리하지만 같은 이름의 악성 객체가 앞선 스키마에 만들어지면 의도하지 않은 객체를 실행할 수 있다. 보안이 중요한 함수나 운영 SQL은 `app.orders`처럼 스키마를 명시하는 편이 안전하다.

## RDBMS를 비교할 때 볼 기준

PostgreSQL, MySQL, Oracle 같은 RDBMS는 모두 관계형 모델과 SQL을 사용하지만 세부 문법과 운영 방식은 다르다. 단순히 “무엇이 더 좋은가”보다 다음 기준으로 선택해야 한다.

- 필요한 SQL 기능과 자료형을 지원하는가?
- 예상 읽기·쓰기 패턴과 데이터 규모에 맞는가?
- 고가용성, 백업, 복구 도구가 요구사항에 맞는가?
- 팀의 운영 경험과 생태계가 충분한가?
- 라이선스와 Cloud 비용은 적절한가?

이번 과정에서는 PostgreSQL을 기준으로 학습한다. 표준 SQL에 가까운 문법과 풍부한 기능을 제공하므로 관계형 DB의 개념을 익히기에 좋다. 제품별 차이는 개념을 익힌 뒤 비교하는 것이 효율적이다.

| DBMS | 강점 | 확인할 점 |
|---|---|---|
| MySQL / MariaDB | 웹 생태계, 쉬운 운영, 넓은 호스팅 지원 | 버전·엔진별 기능 차이, JSON·CHECK 구현 |
| PostgreSQL | 표준 SQL, 확장성, JSONB·GIS·고급 SQL | MVCC 특성상 VACUUM 관리 필요 |
| Oracle | 대규모 엔터프라이즈 기능, 안정적인 도구 | 라이선스·운영 비용, 벤더 종속 문법 |
| SQL Server | Microsoft·BI 생태계 통합 | Windows/Azure 중심 기능과 라이선스 |
| 관리형 Cloud DB | 자동 백업·패치·장애조치 | 루트 권한 제한, 네트워크·비용·종속성 |

ANSI SQL은 `SELECT`, `JOIN`, 제약조건, Window Function 같은 공통 기반을 제공하지만, 실제 이식성은 자료형·자동 증가·날짜 함수·페이지네이션·프로시저 문법에서 깨진다. 먼저 표준적인 표현을 사용하고, 필요한 기능만 제품별 마이그레이션 스크립트로 분리하는 전략이 현실적이다.

## DDL과 DML

SQL은 역할에 따라 구분할 수 있다.

| 분류 | 역할 | 대표 명령 |
|---|---|---|
| DDL | 구조를 정의·변경 | `CREATE`, `ALTER`, `DROP` |
| DML | 데이터를 조회·변경 | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| DCL | 권한을 제어 | `GRANT`, `REVOKE` |
| TCL | 트랜잭션을 제어 | `COMMIT`, `ROLLBACK` |

앞에서 사용한 `CREATE TABLE`은 DDL이다. 만들어진 테이블에 데이터를 넣고 조회하는 작업은 DML이다.

### 데이터베이스와 스키마 생성

PostgreSQL에서 서버 인스턴스는 여러 데이터베이스를 가질 수 있고, 각 데이터베이스 안에 여러 스키마가 있다.

```sql
-- 현재 접속한 DB가 아니라 관리 DB에서 실행
CREATE DATABASE skala_db
WITH ENCODING = 'UTF8'
     TEMPLATE = template0;

-- skala_db에 다시 접속한 뒤 실행
CREATE SCHEMA app;
CREATE SCHEMA audit;
SET search_path = app, public;
```

인코딩과 collation은 문자열의 저장뿐 아니라 비교·정렬·인덱스 동작에 영향을 준다. 운영 후 변경은 전체 데이터 재작성으로 이어질 수 있으므로 프로젝트 초기에 확정한다. MySQL은 데이터베이스가 스키마와 거의 동의어지만, PostgreSQL과 SQL Server는 데이터베이스 안에 여러 스키마를 둔다. Oracle에서는 전통적으로 사용자와 스키마의 관계가 밀접하다.

### 자료형은 업무 의미를 담는다

| 목적 | PostgreSQL 권장 예 | 이유 |
|---|---|---|
| 식별자 | `BIGINT ... AS IDENTITY` | 표준에 가까운 자동 증가 |
| 금액 | `NUMERIC(12, 2)` | 부동소수점 오차 방지 |
| 일반 문자열 | `VARCHAR(n)` 또는 `TEXT` | 길이 규칙이 업무 제약인지 판단 |
| 시각 | `TIMESTAMPTZ` | 순간을 UTC로 정규화하고 세션 시간대로 표시 |
| 날짜 | `DATE` | 시각이 필요 없는 생일·영업일 |
| 참/거짓 | `BOOLEAN` | 의미가 명확함 |
| 반정형 속성 | `JSONB` | 검색·인덱싱 가능한 이진 표현 |
| 이진 데이터 | `BYTEA` | 파일 본문보다 객체 스토리지 경로 저장도 검토 |

```sql
CREATE TABLE products (
    product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    price      NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    attrs      JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_attrs_color
ON products ((attrs ->> 'color'));
```

`NUMERIC(12, 2)`는 전체 12자리 중 소수부 2자리를 사용한다. `JSONB`는 유연하지만 자주 조회하고 무결성이 중요한 속성까지 모두 넣는 용도가 아니다. `color`가 핵심 검색 조건이라면 정규 컬럼으로 승격하거나 표현식 인덱스를 만든다.

제품별 대응은 서로 다르다.

| 의미 | PostgreSQL | MySQL | SQL Server | Oracle |
|---|---|---|---|---|
| 자동 증가 | `IDENTITY` | `AUTO_INCREMENT` | `IDENTITY(1,1)` | 12c+ `IDENTITY` |
| 유니코드 문자열 | `VARCHAR`/`TEXT` | `VARCHAR` + `utf8mb4` | `NVARCHAR` | `VARCHAR2(... CHAR)` |
| 날짜·시각 | `TIMESTAMPTZ` | `DATETIME`, `TIMESTAMP` | `DATETIME2` | `TIMESTAMP WITH TIME ZONE` |
| 불리언 | `BOOLEAN` | `TINYINT(1)` 별칭 | `BIT` | 버전에 따라 `NUMBER(1)+CHECK` |
| JSON | `JSONB`/`JSON` | 네이티브 `JSON` | `NVARCHAR` + JSON 함수 | 버전별 `IS JSON`/JSON 타입 |

상태값은 `ENUM`으로 고정할 수도 있지만 변경이 잦거나 설명·정렬 순서 같은 속성이 붙는다면 lookup 테이블이 유연하다.

```sql
CREATE TABLE order_status_types (
    status_code VARCHAR(20) PRIMARY KEY,
    description VARCHAR(100) NOT NULL,
    display_order SMALLINT NOT NULL
);

CREATE TABLE orders (
    order_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status_code VARCHAR(20) NOT NULL
        REFERENCES order_status_types (status_code)
);
```

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

### SELECT의 논리적 실행 순서와 기본 함수

SQL의 작성 순서와 논리적 평가 순서는 다르다.

```text
FROM → JOIN → WHERE → GROUP BY → HAVING
→ SELECT → DISTINCT → ORDER BY → LIMIT/OFFSET
```

따라서 `SELECT`에서 만든 별칭을 같은 단계보다 먼저 평가되는 `WHERE`에서 사용할 수 없다. `ORDER BY`는 뒤에서 평가되므로 별칭을 사용할 수 있다.

```sql
SELECT
    s.student_no,
    UPPER(s.email) AS email_upper,
    EXTRACT(YEAR FROM s.created_at) AS joined_year,
    COALESCE(s.phone, '미등록') AS phone_display,
    CASE
        WHEN s.grade = 1 THEN '신입생'
        WHEN s.grade = 4 THEN '졸업반'
        ELSE s.grade || '학년'
    END AS grade_label
FROM students AS s
WHERE s.enrolled = TRUE
  AND s.grade BETWEEN 1 AND 4
ORDER BY grade_label, s.student_no
LIMIT 20;
```

- `COALESCE(a, b, c)`는 왼쪽부터 첫 번째 `NULL`이 아닌 값을 반환한다.
- `NULLIF(a, b)`는 두 값이 같으면 `NULL`, 다르면 `a`를 반환해 0으로 나누기 방지 등에 쓸 수 있다.
- `CASE`는 조건에 따라 파생값을 만든다.
- `EXTRACT`와 `DATE_TRUNC`는 날짜 구성요소 추출과 기간 버킷에 사용한다.

`NULL`은 0이나 빈 문자열이 아니라 “알 수 없음 또는 값 없음”을 표현한다. SQL은 TRUE/FALSE뿐 아니라 UNKNOWN을 포함하는 3값 논리를 사용한다.

```sql
-- 틀린 표현: NULL과의 비교 결과는 UNKNOWN
SELECT * FROM customers WHERE phone = NULL;

-- 올바른 표현
SELECT * FROM customers WHERE phone IS NULL;
```

`NOT IN` 목록이나 서브쿼리에 `NULL`이 섞일 때 예상치 못한 빈 결과가 나오는 이유도 3값 논리 때문이다.

## 제약조건은 데이터의 규칙을 코드로 옮기는 일

테이블을 잘 설계했다는 것은 열을 나눠 놓았다는 뜻만은 아니다. 어떤 값이 들어올 수 있는지, 어떤 값은 절대 들어오면 안 되는지까지 명시해야 한다.

| 제약조건 | 역할 | 예시 |
|---|---|---|
| `NOT NULL` | 반드시 값이 있어야 한다 | `name` |
| `UNIQUE` | 같은 값의 중복을 막는다 | `email` |
| `CHECK` | 표현식으로 값 범위를 검증한다 | `price >= 0` |
| `DEFAULT` | 값이 없을 때 기본값을 넣는다 | `joined_at DEFAULT CURRENT_DATE` |
| `FOREIGN KEY` | 다른 테이블과의 참조 무결성을 지킨다 | `orders.customer_id` |

`PRIMARY KEY`는 사실상 `UNIQUE + NOT NULL`을 동시에 만족하는 식별자라고 생각하면 이해하기 쉽다.
`email`처럼 업무적으로는 식별자처럼 보이는 값도 변경될 수 있다면, 보통은 숫자 ID를 별도로 두는 편이 안전하다.

```sql
ALTER TABLE products
ADD CONSTRAINT chk_products_price
CHECK (price >= 0);
```

이런 제약조건은 단순히 “에러를 내기 위한 장치”가 아니라, 잘못된 데이터를 애초에 저장하지 않게 하는 방어선이다.

## 정규화에서 자주 보는 이상현상

정규화는 중복을 줄이는 과정이지만, 실제로는 “무엇을 한 번만 저장할 것인가”를 정하는 일에 가깝다.
중복이 심한 테이블에서는 세 가지 이상현상이 자주 생긴다.

| 이상현상 | 무엇이 문제인가 | 예 |
|---|---|---|
| 갱신 이상 | 같은 정보를 여러 행에서 동시에 고쳐야 한다 | 고객 이메일 변경 시 주문 행을 전부 수정해야 함 |
| 삽입 이상 | 어떤 정보를 넣으려면 다른 정보도 강제로 필요하다 | 고객만 등록하고 싶어도 주문이 없으면 저장하기 어려움 |
| 삭제 이상 | 어떤 행을 지우면 필요했던 다른 정보까지 함께 사라진다 | 마지막 주문을 지우면 고객 정보까지 잃는 상황 |

이런 문제를 막기 위해 고객 정보는 `customers`, 주문 정보는 `orders`에 나누어 저장하고 FK로 연결한다.
정규화의 목표는 테이블을 많이 만드는 것이 아니라, 데이터의 의미를 분리해서 관리 가능하게 만드는 것이다.

## ERD를 그릴 때 더 확인할 것

ERD는 “테이블이 어떤 모양이어야 하는가”를 미리 검증하는 작업이다.
이 단계에서 특히 자주 놓치는 포인트는 다음과 같다.

- 관계가 선택적인가, 필수적인가
- 한쪽이 여러 개를 가질 수 있는가
- 관계 자체가 속성을 가지는가
- 자기 자신을 참조하는 관계가 있는가

예를 들어 직원-관리자 구조는 자기 자신을 참조하는 관계로 표현할 수 있다.

```sql
CREATE TABLE employees (
    employee_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    manager_id  BIGINT REFERENCES employees (employee_id)
);
```

이런 구조는 조직도, 댓글의 대댓글, 카테고리의 상하위 관계처럼 여러 곳에서 나타난다.
ERD를 그릴 때는 “선 하나”보다 “업무 의미가 정말 맞는지”를 더 중요하게 봐야 한다.

## DDL과 DML, 그리고 실수하기 쉬운 SQL들

앞에서 `CREATE TABLE`은 DDL이라고 했다. 그 밖에도 구조를 바꾸는 명령은 모두 DDL에 가깝다.

- `ALTER TABLE`: 열 추가, 제약조건 변경
- `DROP TABLE`: 테이블 자체 삭제
- `CREATE INDEX`: 검색 속도 개선을 위한 구조 생성
- `TRUNCATE`: 테이블의 모든 행 제거

DML은 데이터를 실제로 넣고 바꾸는 SQL이다.

```sql
BEGIN;

INSERT INTO customers (name, email)
VALUES ('김지훈', 'jihoon@example.com');

UPDATE customers
SET email = 'new-address@example.com'
WHERE customer_id = 1;

ROLLBACK;
```

이처럼 변경 작업은 트랜잭션과 함께 생각해야 한다.
실습 때는 특히 `UPDATE`, `DELETE`의 `WHERE`를 먼저 확인하고, 정말 필요한 행만 건드리는 습관이 중요하다.

### ALTER TABLE과 운영 DDL

테이블을 만든 뒤 구조를 바꾸는 작업은 데이터량이 많을수록 신중해야 한다.

```sql
-- nullable 컬럼 추가는 비교적 단순하다.
ALTER TABLE students
ADD COLUMN phone VARCHAR(20);

-- 기존 행을 채운 뒤 검증하고 NOT NULL로 전환한다.
UPDATE students
SET phone = '미등록'
WHERE phone IS NULL;

ALTER TABLE students
ALTER COLUMN phone SET NOT NULL;

-- 제약조건을 이름 붙여 추가한다.
ALTER TABLE students
ADD CONSTRAINT chk_students_email
CHECK (email LIKE '%@%');
```

컬럼 타입 변경, 기본값을 가진 `NOT NULL` 컬럼 추가, 컬럼 삭제는 버전과 조건에 따라 테이블 재작성이나 강한 잠금을 일으킬 수 있다. PostgreSQL에서 운영 중 큰 인덱스를 만들 때는 쓰기 차단을 줄이는 `CONCURRENTLY`를 검토한다.

```sql
CREATE INDEX CONCURRENTLY idx_students_grade
ON students (grade);
```

`CREATE INDEX CONCURRENTLY`는 일반 생성보다 오래 걸리고 트랜잭션 블록 안에서 실행할 수 없으며 실패한 invalid index 정리가 필요할 수 있다. “무잠금”이라기보다 읽기·쓰기와 병행하기 위한 별도 절차라고 이해하는 편이 정확하다.

`TRUNCATE`와 `DELETE`도 목적이 다르다.

| 명령 | 범위 | WHERE | 일반적 특성 |
|---|---|---:|---|
| `DELETE` | 선택 행 또는 전체 행 | 가능 | 행 단위 처리, DELETE trigger 실행 |
| `TRUNCATE` | 전체 테이블 | 불가 | 빠른 페이지 단위 제거, 강한 잠금 |
| `DROP TABLE` | 데이터와 구조 | 불가 | 객체 자체 제거 |

PostgreSQL에서는 `TRUNCATE`도 트랜잭션 안에서 롤백할 수 있다. “DDL은 모든 DB에서 무조건 자동 커밋” 같은 규칙은 제품별 차이가 크므로 사용 DBMS 문서를 확인해야 한다.

### 이식 가능한 SQL을 위한 기준

- `INTEGER`, `NUMERIC(p,s)`, `VARCHAR(n)`, `DATE`, `TIMESTAMP` 같은 표준형을 우선한다.
- 예약어를 객체 이름으로 쓰지 않고 소문자 `snake_case`를 사용한다.
- 자동 증가, 날짜 함수, JSON 연산, 프로시저는 DBMS별 스크립트로 분리한다.
- `CHECK`나 ENUM에 변동이 잦은 업무 목록을 과도하게 고정하지 않는다.
- 시간은 저장 기준(보통 UTC)과 사용자 표시 시간대를 구분한다.
- collation과 문자셋을 처음부터 일관되게 정한다.
- JSON은 스키마가 없는 것이 아니라 스키마 검증 책임이 이동한 것임을 기억한다.

## 물리 모델에서 자주 붙는 컬럼

논리 모델이 “무엇을 저장할까”를 정한다면, 물리 모델은 “DB에 어떻게 저장할까”를 정한다.
이 단계에서 자주 같이 검토하는 컬럼이 있다.

- `created_at`: 생성 시각
- `updated_at`: 수정 시각
- `deleted_at`: 소프트 삭제 시각
- `status`: 현재 상태
- `version`: 낙관적 잠금이나 변경 버전

특히 `status`는 문자열 하나로 끝내기보다, 허용 가능한 값이 정해져 있다면 `CHECK` 제약조건과 함께 관리하는 편이 더 안전하다.

## 종합 실습: 학사관리 시스템 설계와 구축

교재의 1일차 종합 실습은 학생, 학과, 강좌, 수강 신청을 하나의 모델로 연결한다. 핵심은 SQL을 많이 쓰는 것이 아니라 **요구사항 → ERD → 제약조건이 있는 DDL → 검증용 DML**의 흐름을 경험하는 것이다.

```text
majors 1 ───< students
students 1 ───< enrollments >─── 1 courses
```

```sql
CREATE SCHEMA IF NOT EXISTS school;
SET search_path = school, public;

CREATE TABLE majors (
    major_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE students (
    student_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_no VARCHAR(20) NOT NULL UNIQUE,
    name       VARCHAR(50) NOT NULL,
    email      VARCHAR(255) NOT NULL UNIQUE,
    major_id   BIGINT REFERENCES majors (major_id),
    grade      SMALLINT NOT NULL CHECK (grade BETWEEN 1 AND 4),
    enrolled   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
    course_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code      VARCHAR(20) NOT NULL UNIQUE,
    title     VARCHAR(100) NOT NULL,
    credits   SMALLINT NOT NULL CHECK (credits BETWEEN 1 AND 6)
);

CREATE TABLE enrollments (
    student_id BIGINT NOT NULL
        REFERENCES students (student_id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL
        REFERENCES courses (course_id) ON DELETE RESTRICT,
    enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
    grade CHAR(1) CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
    PRIMARY KEY (student_id, course_id)
);
```

`enrollments`는 학생과 강좌의 N:M 관계를 해소하는 연관 엔티티다. 복합 PK는 같은 학생이 같은 강좌에 중복 수강 신청하는 것을 막는다. 재수강 이력까지 필요하다면 `term_id`를 키에 포함하거나 별도 수강 인스턴스 ID를 두어야 한다.

```sql
INSERT INTO majors (name)
VALUES ('컴퓨터공학'), ('경영학');

INSERT INTO courses (code, title, credits)
VALUES
    ('DB101', '데이터베이스', 3),
    ('AL201', '알고리즘', 3);

INSERT INTO students
    (student_no, name, email, major_id, grade)
SELECT
    '2026001',
    '홍길동',
    'hong@skala.ai',
    major_id,
    1
FROM majors
WHERE name = '컴퓨터공학';
```

마지막 `INSERT ... SELECT`는 사람이 내부 `major_id`를 외워 하드코딩하지 않고 업무키인 학과 이름으로 FK를 찾는다. 샘플 데이터를 입력한 뒤에는 단순 조회뿐 아니라 누락값과 파생값도 확인한다.

```sql
SELECT
    s.student_no,
    s.name,
    m.name AS major_name,
    COALESCE(s.email, '미등록') AS email_display,
    CASE
        WHEN s.grade = 1 THEN '신입생'
        WHEN s.grade = 4 THEN '졸업예정'
        ELSE s.grade || '학년'
    END AS grade_label
FROM students AS s
LEFT JOIN majors AS m
  ON m.major_id = s.major_id
WHERE s.enrolled = TRUE
ORDER BY s.grade, s.student_no;
```

ERD에는 카디널리티, 선택 관계, PK·FK 범례를 표시하고, 구현 결과에는 PostgreSQL 접속 확인, DDL, 최소 10건 이상의 샘플 데이터, 조회 SQL과 결과를 함께 남긴다. 설계와 실행 결과가 연결되어야 “그림만 맞는 ERD”가 아니라 실제 제약조건으로 검증된 모델이 된다.


---

시리즈 안내: [스마트 데이터 이해 및 활용 — 4일 학습 로드맵](/posts/skala-smart-data-roadmap/)

다음 글: [2일차 — JOIN부터 Window Function까지](/posts/skala-smart-data-day2/)
