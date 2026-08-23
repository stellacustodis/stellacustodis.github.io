---
title: "[SKALA] 스마트 데이터 이해 및 활용 4일차 — Stored Procedure부터 Cloud DB 운영까지"
date: 2026-07-30 09:00:00 +0900
categories:
  - SKALA
  - Database
tags: [skala, database, stored-procedure, trigger, cloud-db, distributed-database, data-warehouse, vector-db, security, backup, monitoring, postgresql]
description: "Stored Procedure와 Trigger부터 Cloud·분산 DB, DW, Vector·시계열 DB, 보안·RLS, PITR·고가용성, 모니터링까지 운영 관점에서 정리한다."
permalink: /posts/skala-smart-data-day4/
---

1, 2, 3일차에서는 데이터를 저장하고 조회하며 최적화하는 방법을 다뤘다. 4일차는 여기서 범위를 넓혀 **DB 내부 로직, Cloud·분산 아키텍처, 분석 플랫폼, 최신 데이터 기술, 보안, 복구와 운영**을 하나의 시스템 관점에서 연결한다.

## DB 안에서 로직을 돌리는 이유

애플리케이션에서 모든 로직을 처리하는 것이 기본이지만, 어떤 일은 DB 안에서 처리하는 편이 더 자연스럽다.

예를 들면 다음과 같다.

- 계산 규칙이 여러 서비스에서 반복될 때
- 데이터 변경과 함께 반드시 남겨야 할 이력이 있을 때
- 대량 배치 작업을 한 번에 처리해야 할 때
- 데이터 정합성을 DB 차원에서 지켜야 할 때

이때 자주 등장하는 것이 Function, Procedure, Trigger다.

## Stored Procedure와 Function

둘 다 “DB 안에 저장된 실행 단위”라는 점은 비슷하다.
하지만 목적은 조금 다르다.

대체로 함수(Function)는 값을 돌려주는 데 중심이 있고,
프로시저(Stored Procedure)는 작업을 수행하는 데 중심이 있다.

PostgreSQL 기준으로 보면 함수는 `SELECT`처럼 값이 필요한 자리에 자연스럽게 들어가고, 프로시저는 `CALL`로 실행하는 경우가 많다.

### Function은 계산에 가깝다

```sql
CREATE OR REPLACE FUNCTION order_total(p_order_id BIGINT)
RETURNS NUMERIC
LANGUAGE SQL
AS $$
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  FROM order_items
  WHERE order_id = p_order_id;
$$;
```

사용 예시는 다음과 같다.

```sql
SELECT order_total(1001);
```

이렇게 작성하면 주문 금액 계산 규칙을 여러 곳에서 다시 쓰지 않아도 된다.

### Procedure는 작업 흐름에 가깝다

```sql
CREATE OR REPLACE PROCEDURE archive_completed_orders(p_cutoff_date DATE)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE orders
  SET status = 'ARCHIVED'
  WHERE status = 'COMPLETED'
    AND created_at < p_cutoff_date;
END;
$$;
```

호출은 이렇게 한다.

```sql
CALL archive_completed_orders(DATE '2025-07-29');
```

이런 프로시저는 대량 정리, 배치성 변경, 운영 작업에 잘 맞는다.

### 둘을 언제 나눠 생각하면 좋을까

- 결과값을 표현하는 로직이면 Function
- 여러 행을 바꾸는 작업이면 Procedure
- 다른 SQL 안에서 재사용하고 싶으면 Function
- 운영용 절차나 일괄 처리가 핵심이면 Procedure

실무에서는 둘의 경계가 명확히 딱 떨어지기보다, 어떤 일을 맡길지 기준으로 보는 편이 더 유용하다.

### DBMS별 차이

| 구분 | PostgreSQL | MySQL | SQL Server | Oracle |
|---|---|---|---|---|
| 함수 호출 | `SELECT fn()` | `SELECT fn()` | `SELECT dbo.fn()` | SQL/PLSQL에서 호출 |
| 프로시저 호출 | `CALL proc()` | `CALL proc()` | `EXEC proc` | `BEGIN proc; END;` |
| 함수의 DML | 실행 문맥과 변동성에 제약 | 제한 존재 | 함수의 부작용 강하게 제한 | PL/SQL 규칙 적용 |
| 트랜잭션 제어 | procedure 호출 문맥에 따라 가능 | procedure에서 가능 | procedure에서 가능 | procedure에서 가능 |

동일한 이름이라도 반환 방식, transaction control, result set, 예외 문법이 다르다. DB 이식성을 원하면 핵심 업무 규칙은 애플리케이션 계층에 두고 DB 함수는 데이터에 가까운 계산·제약에 제한하는 전략도 고려한다.

### 같은 계산도 행마다 호출하면 비쌀 수 있다

```sql
CREATE OR REPLACE FUNCTION add_vat(p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
RETURN ROUND(p_amount * 1.10, 2);
```

- `IMMUTABLE`은 같은 입력이면 항상 같은 결과임을 뜻해 상수 접기와 표현식 인덱스에 사용할 수 있다.
- `STABLE`은 한 SQL 문 안에서 결과가 안정적이지만 DB 조회 등을 할 수 있다.
- `VOLATILE`은 호출마다 달라질 수 있으며 PostgreSQL의 기본값이다.
- `STRICT`는 입력 중 `NULL`이 있으면 함수를 실행하지 않고 `NULL`을 반환한다.
- `PARALLEL SAFE`는 병렬 worker에서 실행해도 안전하다는 선언이다.

이 속성을 거짓으로 선언하면 성능이 좋아지는 것이 아니라 잘못된 결과가 나올 수 있다. 함수가 실제로 지키는 성질만 표시한다.

### SECURITY DEFINER와 INVOKER

기본적인 `SECURITY INVOKER` 함수는 호출자의 권한으로 객체에 접근한다. `SECURITY DEFINER`는 함수 소유자의 권한으로 실행되므로 제한된 작업 API를 만들 수 있지만 권한 상승 공격에 주의해야 한다.

```sql
CREATE OR REPLACE FUNCTION app.get_order_total(p_order_id BIGINT)
RETURNS NUMERIC
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
    SELECT COALESCE(SUM(quantity * unit_price), 0)
    FROM app.order_items
    WHERE order_id = p_order_id
$$;

REVOKE ALL ON FUNCTION app.get_order_total(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_order_total(BIGINT) TO app_reader;
```

`search_path`를 안전한 스키마로 고정하고 객체를 schema-qualified name으로 참조한다. `PUBLIC`의 기본 실행 권한도 검토한다.

### 예외 처리와 원자적 주문 생성

```sql
CREATE OR REPLACE PROCEDURE app.create_order(
    p_customer_id BIGINT,
    p_product_id  BIGINT,
    p_quantity    INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_order_id BIGINT;
    v_price    NUMERIC(12, 2);
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'quantity must be positive'
            USING ERRCODE = '22023';
    END IF;

    UPDATE app.products
    SET stock = stock - p_quantity
    WHERE product_id = p_product_id
      AND stock >= p_quantity
    RETURNING price INTO v_price;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient stock for product %', p_product_id
            USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO app.orders (customer_id, status, ordered_at)
    VALUES (p_customer_id, 'CREATED', now())
    RETURNING order_id INTO v_order_id;

    INSERT INTO app.order_items (
        order_id, product_id, quantity, unit_price
    )
    VALUES (
        v_order_id, p_product_id, p_quantity, v_price
    );

EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'unknown customer or product';
END;
$$;
```

재고 차감 `UPDATE`가 성공한 행만 `RETURNING`하므로 “재고 조회 후 별도 UPDATE”의 경쟁 조건을 피한다. 예외가 procedure 바깥으로 전파되면 호출 트랜잭션이 실패해 변경이 함께 취소된다. 에러를 잡고 무시하면 부분 성공을 만들 수 있으므로, 복구 가능한 예외만 처리하고 나머지는 호출자가 알 수 있게 다시 발생시킨다.

## Trigger와 Event Processing

Trigger는 특정 이벤트가 발생했을 때 자동으로 반응하는 장치다.
`INSERT`, `UPDATE`, `DELETE` 같은 변경 이벤트에 자주 붙는다.

가장 단순한 예는 `updated_at` 자동 갱신이다.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
```

이렇게 해두면 애플리케이션이 매번 시간을 넣지 않아도 된다.

### Trigger가 유용한 이유

- 공통 규칙을 한 곳에 모을 수 있다
- 데이터 변경 이력을 남기기 쉽다
- 사람이 깜빡해도 규칙이 유지된다

### Trigger가 조심스러운 이유

- 눈에 잘 안 보인다
- 디버깅이 어려워질 수 있다
- 연쇄적으로 다른 작업을 부를 수 있다
- 성능 문제의 원인이 될 수 있다

그래서 트리거는 편리하지만, 많이 넣을수록 시스템이 보이지 않게 복잡해질 수 있다.

### 감사 로그 Trigger

```sql
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE audit.order_changes (
    audit_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    changed_by  TEXT NOT NULL DEFAULT session_user,
    operation   TEXT NOT NULL,
    order_id    BIGINT,
    old_row     JSONB,
    new_row     JSONB
);

CREATE OR REPLACE FUNCTION audit.log_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
AS $$
BEGIN
    INSERT INTO audit.order_changes (
        operation,
        order_id,
        old_row,
        new_row
    )
    VALUES (
        TG_OP,
        COALESCE(NEW.order_id, OLD.order_id),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_orders_audit
AFTER INSERT OR UPDATE OR DELETE ON app.orders
FOR EACH ROW
EXECUTE FUNCTION audit.log_order_change();
```

`TG_OP`는 실행 원인이 된 연산이고 `OLD`·`NEW`는 변경 전후 행이다. 같은 트랜잭션에서 감사 로그도 저장되므로 본문 변경이 롤백되면 로그도 롤백된다. 규제 요건상 변조 방지·독립 보존이 필요하다면 DB trigger만으로 충분한지 별도 append-only 감사 시스템과 비교해야 한다.

대량 UPDATE에서 row-level trigger는 행마다 실행되어 병목이 될 수 있다. PostgreSQL transition table을 지원하는 AFTER statement trigger라면 변경 행 집합을 한 번에 처리하는 방법도 있다.

### Trigger의 실행 시점과 DBMS 차이

- `BEFORE ROW`는 `NEW` 값을 검증·보정하기 좋다.
- `AFTER ROW`는 최종 변경을 감사하거나 관련 행을 추가하기 좋다.
- statement-level은 한 SQL당 한 번 실행되어 배치 후처리에 적합하다.
- `INSTEAD OF` trigger는 복잡한 View에 대한 DML을 원본 테이블 작업으로 바꾼다.

MySQL은 row-level trigger 중심이고, SQL Server의 `inserted`·`deleted`는 여러 행을 담는 논리 테이블이므로 trigger를 반드시 set-based로 작성해야 한다. Oracle은 row/statement trigger와 compound trigger를 제공한다. 제품별로 재귀 trigger, 실행 순서, mutating table 제한이 다르다.

### Trigger에서 직접 외부 API를 호출하지 않는 이유

외부 네트워크 호출은 느리고 실패할 수 있으며 DB transaction의 잠금 시간을 늘린다. DB가 commit에 실패했는데 외부 알림만 먼저 전송되면 정합성도 깨진다. Trigger나 애플리케이션 transaction에서 outbox 행을 남기고 별도 worker·CDC가 전송하는 방식이 안전하다.

```sql
CREATE OR REPLACE FUNCTION app.enqueue_order_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO app.outbox_events (
        event_id,
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        created_at
    )
    VALUES (
        gen_random_uuid(),
        'Order',
        NEW.order_id,
        'OrderStatusChanged',
        jsonb_build_object(
            'orderId', NEW.order_id,
            'oldStatus', OLD.status,
            'newStatus', NEW.status
        ),
        now()
    );
    RETURN NEW;
END;
$$;
```

CDC가 WAL에서 outbox insert를 읽으면 업무 변경과 이벤트 기록의 원자성을 유지할 수 있다. 소비자는 at-least-once 전달의 중복을 처리해야 한다.

### LISTEN/NOTIFY와 Event Trigger

```sql
-- 알림 발행
SELECT pg_notify(
    'order_events',
    json_build_object('orderId', 1001, 'status', 'PAID')::text
);

-- 별도 세션
LISTEN order_events;
```

PostgreSQL `NOTIFY`는 commit 뒤 listener에 작은 payload 알림을 전달한다. durable queue가 아니므로 listener가 끊겼을 때 재생, 대량 메시지 보관, 정확한 전달이 필요하면 Kafka·메시지 브로커·outbox를 사용한다.

Event Trigger는 행 DML이 아니라 `CREATE`, `ALTER`, `DROP` 같은 DDL 이벤트에 반응한다.

```sql
CREATE TABLE audit.ddl_events (
    event_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_time  TIMESTAMPTZ NOT NULL,
    username    TEXT NOT NULL,
    command_tag TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION audit.log_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO audit.ddl_events(event_time, username, command_tag)
    VALUES (clock_timestamp(), session_user, tg_tag);
END;
$$;

CREATE EVENT TRIGGER trg_ddl_audit
ON ddl_command_end
EXECUTE FUNCTION audit.log_ddl();
```

운영 안전장치에 유용하지만 잘못 작성하면 필요한 DDL까지 막을 수 있으므로 관리자 권한과 비상 해제 절차를 마련한다.

## Cloud DB 개요

Cloud DB는 단순히 “데이터베이스를 클라우드에 올린 것”이 아니다.
대부분은 운영 부담을 줄이기 위한 **관리형 데이터베이스 서비스**를 뜻한다.

보통 이런 기능을 제공한다.

- 생성과 삭제가 쉽다
- 백업과 복구가 자동화된다
- 패치와 버전 관리가 편하다
- 장애 조치와 복제가 지원된다
- 모니터링 도구가 함께 제공된다

운영자가 직접 모든 서버를 손보는 대신, 핵심 운영 기능을 서비스가 대신 맡아준다.

하지만 장점만 있는 것은 아니다.

- 비용이 올라갈 수 있다
- 세부 설정 자유도가 제한될 수 있다
- 특정 서비스에 종속될 수 있다

그래서 Cloud DB는 “무조건 쓰는 것”이 아니라, 운영 편의성과 자유도 사이의 선택으로 보는 게 맞다.

### On-Prem, DBaaS, Cloud-Native DB

| 구분 | 사용자가 맡는 범위 | 장점 | 제한 |
|---|---|---|---|
| On-Prem/VM 직접 설치 | OS부터 DB·HA·백업 | 최대 제어권, 특수 확장 | 운영 인력과 장애 책임 |
| DBaaS | 스키마·SQL·튜닝 중심 | 패치, 백업, 장애조치 자동화 | superuser·파일 시스템 제한 |
| Cloud-Native 분산 DB | 논리 모델·쿼리·비용 정책 | 자동 분산·탄력 확장·멀티 리전 | 종속성, 분산 지연, 예측 어려운 비용 |

DBaaS가 대신하는 일은 인스턴스 프로비저닝, 하드웨어 교체, 자동 백업, 일부 패치, Multi-AZ failover다. 사용자는 여전히 잘못된 SQL, 인덱스·스키마, 접근 권한, 데이터 보존, 비용, 복구 목표와 애플리케이션 재연결을 책임진다. “관리형”은 “무관리”가 아니다.

### AWS RDS와 Aurora

RDS는 PostgreSQL, MySQL, MariaDB, Oracle, SQL Server 등 기존 엔진을 관리형으로 제공한다. 호환성과 기존 운영 지식을 유지하기 쉽다. Aurora는 MySQL/PostgreSQL 호환 compute와 다중 AZ 분산 storage를 분리하고 replica·failover·storage 확장을 서비스에 통합한다.

Aurora를 선택할 때는 벤치마크의 “몇 배 빠름”보다 실제 workload, 호환되지 않는 확장, I/O 과금, replica lag, failover 시 connection 복구, 버전 정책을 검증해야 한다.

GCP Cloud SQL과 Azure Database도 관리형 MySQL/PostgreSQL/SQL Server 계열을 제공하며, BigQuery·Dataflow 또는 Entra ID·Power BI 같은 각 cloud 생태계 통합이 강점이다.

### Cloud DB 선택 프레임워크

1. **정합성·트랜잭션**: 다중 행 ACID, 격리 수준, FK가 필요한가?
2. **접근 패턴**: point lookup, range scan, JOIN, 분석, vector 중 무엇이 중심인가?
3. **규모와 지역**: 단일 region인가, global write인가, peak가 얼마나 변하는가?
4. **가용성 목표**: SLA, RPO, RTO, failover 방식은?
5. **호환성**: extension, SQL 문법, driver, migration 도구가 맞는가?
6. **보안**: private network, IAM, encryption, audit, residency 요구를 충족하는가?
7. **운영성**: upgrade, observability, restore, capacity planning을 누가 맡는가?
8. **비용**: compute뿐 아니라 storage, IOPS, backup, cross-AZ/region traffic을 포함했는가?
9. **Exit plan**: 표준 dump·CDC로 다른 환경에 이동할 수 있는가?

PoC는 평균 latency만 측정하지 않고 failover, connection storm, backup restore, peak write, schema migration을 함께 시험한다.

## 분산 DB와 확장성

데이터가 커지고 사용자가 늘어나면 한 대의 서버만으로는 버티기 어려워진다.
그때 등장하는 개념이 수평 확장, 즉 scale-out이다.

대체로 다음 두 방식이 대비된다.

- Scale-up: 더 큰 서버로 바꾼다
- Scale-out: 여러 서버로 나눠 처리한다

분산 DB는 여러 서버에 데이터를 나누어 저장하고 처리하는 구조를 말한다.
하지만 데이터가 분산된다고 해서 무조건 빨라지는 것은 아니다.

- 네트워크 비용이 생긴다
- 조인이 복잡해진다
- 일관성 관리가 어려워진다

즉, 분산은 확장의 해법이지만 동시에 새로운 복잡성을 만든다.

### CAP와 합의의 현실적인 의미

네트워크 partition이 발생했을 때 분산 시스템은 모든 요청을 계속 받아들이는 availability와 모든 노드가 같은 최신 값을 보장하는 consistency를 동시에 완벽히 만족할 수 없다. CAP는 평상시 “C/A/P 중 두 개 고르기” 표가 아니라 **partition 상황에서 어떤 실패 동작을 선택하는가**를 설명한다.

Raft/Paxos 계열 quorum write는 과반수 복제본이 로그를 수락한 뒤 commit해 강한 일관성을 제공하지만, quorum에 도달하지 못하면 쓰기를 거부할 수 있다. eventual consistency 시스템은 쓰기를 더 받아들이고 나중에 충돌을 합칠 수 있다. 업무별로 계좌 잔액과 추천 클릭 로그의 요구가 같지 않다.

### Serverless와 분산 Cloud DB

서버리스 DB는 요청량에 따라 compute를 자동 조정하고 사용량 기반 과금을 제공한다. 유휴 비용을 줄이는 대신 cold start, 최소·최대 capacity, 급격한 scale 시 latency, connection 제한을 확인해야 한다.

대표 선택지를 개념적으로 나누면 다음과 같다.

| 계열 | 예 | 데이터 모델·특징 |
|---|---|---|
| 서버리스 관계형 | Aurora Serverless, Neon 계열 | PostgreSQL/MySQL 호환, compute·storage 분리 |
| 글로벌 분산 SQL | Spanner, CockroachDB | SQL·ACID와 수평 분산, 합의 지연 |
| 분산 key-value/document | DynamoDB, Cosmos DB | partition key 중심, 예측 가능한 point access |
| 분산 wide-column | Cassandra 계열 | 대규모 쓰기, query-first 모델 |

분산 key-value DB에서 가장 중요한 설계 중 하나가 partition key다. low cardinality 키나 시간 단일 키는 hot partition을 만들 수 있다. 관계형 DB의 정규화된 모델을 그대로 옮기기보다 필요한 쿼리에서 시작해 denormalized item과 secondary index를 설계한다.

### MSA의 Database-per-Service

각 서비스가 자체 DB를 소유하면 독립 배포와 장애 격리를 얻지만 다른 서비스 DB에 직접 JOIN할 수 없다.

- 동기 API composition은 최신성이 좋지만 fan-out latency와 연쇄 장애가 생긴다.
- 이벤트로 local read model을 만들면 빠르지만 eventual consistency와 재처리가 필요하다.
- Saga는 여러 서비스 transaction을 보상 동작으로 연결한다.
- 공유 DB는 초기에는 단순하지만 schema와 배포 결합도가 커진다.

서비스 경계를 기술 유행으로 나누기보다 업무 transaction과 데이터 소유권 경계를 먼저 정한다.

## 데이터웨어하우스와 OLAP

서비스 운영용 데이터베이스와 분석용 데이터베이스는 역할이 다르다.

운영용은 주문, 결제, 회원 같은 짧고 잦은 트랜잭션에 맞춰진다.
분석용은 월별 매출, 고객 세그먼트, 장기 추세처럼 큰 범위를 한 번에 보는 데 맞춰진다.

| 종류 | 주된 질문 | 특징 |
|---|---|---|
| OLTP | 지금 이 주문은 처리됐는가? | 짧은 트랜잭션, 높은 정합성 |
| OLAP / Data Warehouse | 지난 분기 매출은 얼마나 늘었는가? | 대량 집계, 큰 스캔, 분석 중심 |

데이터웨어하우스는 보통 분석에 최적화된 저장 방식과 쿼리 패턴을 가진다.
그래서 운영 DB와 분석 DB를 분리하는 경우가 많다.

### MPP를 왜 쓰는가

대용량 분석은 한 대의 서버가 모든 스캔을 처리하면 버거울 수 있다.
이럴 때 여러 노드가 일을 나누는 MPP 방식이 도움이 된다.

핵심은 “한 서버를 더 빠르게”가 아니라 “일을 나누어 같이 처리”하는 데 있다.

### Row Store와 Column Store

OLTP row store는 한 주문의 여러 컬럼을 가까이 저장해 한 행 INSERT·UPDATE와 PK lookup에 유리하다. 분석용 column store는 같은 컬럼 값을 묶어 필요한 컬럼만 읽고, 유사한 값의 압축률을 높이며 vectorized execution을 사용한다.

```sql
SELECT region, SUM(net_amount)
FROM fact_sales
WHERE sold_at >= DATE '2026-01-01'
GROUP BY region;
```

수십억 행 중 `region`, `net_amount`, `sold_at` 세 컬럼만 필요한 쿼리는 columnar storage의 이점이 크다. 반면 한 주문의 상태를 자주 갱신하는 업무에는 일반적으로 row store가 자연스럽다.

### 스타 스키마와 grain

```text
             dim_date
                |
dim_customer — fact_sales — dim_product
                |
             dim_store
```

Fact를 설계할 때 가장 먼저 정할 것은 **한 행이 무엇을 의미하는가(grain)**다. “주문 한 건”과 “주문 상품 한 줄”은 다른 grain이며 섞으면 수량과 주문 수가 중복 집계된다.

```sql
CREATE TABLE fact_sales (
    sale_sk      BIGINT,
    date_sk      INTEGER NOT NULL,
    customer_sk  BIGINT NOT NULL,
    product_sk   BIGINT NOT NULL,
    order_id     BIGINT NOT NULL,
    quantity     INTEGER NOT NULL,
    gross_amount NUMERIC(14, 2) NOT NULL,
    discount_amount NUMERIC(14, 2) NOT NULL,
    net_amount   NUMERIC(14, 2) NOT NULL
);
```

Dimension은 분석 축과 설명 속성을, Fact는 foreign key와 additive measure를 가진다. 금액은 모든 차원에서 더할 수 있지만 재고 snapshot이나 비율은 시간에 대해 단순 합산할 수 없는 semi/non-additive measure일 수 있다.

고객 등급이 바뀌어도 과거 매출을 당시 등급으로 보고 싶다면 SCD Type 2 dimension의 surrogate key를 fact에 저장한다.

### ETL과 ELT

- ETL은 원본을 추출해 변환한 뒤 warehouse에 적재한다.
- ELT는 원본을 warehouse/lakehouse에 먼저 적재하고 SQL engine에서 변환한다.

현대 cloud warehouse의 큰 compute를 활용하면서 ELT가 널리 쓰이지만, 개인정보 마스킹·품질 검증·중복 제거가 사라지는 것은 아니다. pipeline은 재실행 가능하고 멱등적이어야 하며, source-to-target lineage와 지연 시간을 관찰해야 한다.

### 분석 DB의 핵심 기술

1. **Columnar storage와 compression**: 필요한 컬럼만 읽고 반복값을 압축한다.
2. **MPP**: scan·join·aggregate를 여러 worker에 분산한다.
3. **Partition pruning과 clustering/sort key**: 읽을 파일·block을 줄인다.

BigQuery 예시는 날짜 partition과 고객 cluster를 함께 둘 수 있다.

```sql
CREATE TABLE analytics.fact_orders
PARTITION BY DATE(ordered_at)
CLUSTER BY customer_id, status
AS
SELECT * FROM staging.orders;
```

partition filter가 없으면 많은 데이터를 scan해 비용이 커진다. cluster는 같은 키를 가까이 배치해 block pruning을 돕지만 OLTP B-tree 인덱스와 같은 구조는 아니다.

ClickHouse의 MergeTree 계열은 partition key, `ORDER BY` primary sort key, background merge를 중심으로 설계한다. 작은 insert를 지나치게 자주 보내면 part 수가 늘어 merge 부담이 커질 수 있어 batch insert가 유리하다.

### 제품을 고르는 기준

| 계열 | 대표 예 | 강점 |
|---|---|---|
| Cloud warehouse | BigQuery, Snowflake, Redshift, Synapse | 탄력 compute, 관리형 분석 |
| 실시간 OLAP | ClickHouse, Druid, Pinot | 낮은 지연의 이벤트 집계 |
| Lakehouse query | Databricks, Trino 계열 | object storage와 개방형 포맷 |
| PostgreSQL 확장형 | Citus 등 | 익숙한 SQL과 분산 기능 |

데이터량만으로 선택하지 않는다. query concurrency, freshness, join 복잡도, update/delete, open format, cloud 종속성, 비용 예측과 운영 역량을 함께 본다.

## 트렌드: 하나의 DB로 모든 문제를 풀 수는 없다

이번 날의 트렌드 파트는 이 메시지를 강하게 주었다.
모든 문제를 관계형 DB 하나로만 해결하려고 하면, 어느 순간 한계가 보인다.

그래서 최근에는 데이터의 성격에 따라 저장소를 나누어 쓰는 일이 많다.

| 계열 | 잘 맞는 일 | 핵심 특징 |
|---|---|---|
| 관계형 DB | 주문, 결제, 회원 | 정합성, 조인, 트랜잭션 |
| 데이터웨어하우스 | 리포트, 지표, 분석 | 대량 집계, 컬럼 지향, MPP |
| Vector DB | 의미 기반 검색, 추천 | 임베딩, 유사도 탐색 |
| Graph DB | 관계 경로 탐색 | 노드와 엣지, 연결성 |

여기서 중요한 점은 “새로운 DB가 기존 DB를 완전히 대체한다”가 아니다.
대부분은 서로 다른 강점을 가진 도구를 조합하는 방향으로 간다.

예를 들어 서비스 본체는 PostgreSQL 같은 관계형 DB를 유지하고,
검색이나 추천, 대규모 분석은 별도 시스템으로 분리하는 식이다.

Graph DB는 사람·계정·상품 같은 node와 친구·송금·구매 같은 edge를 일급 구조로 저장한다. 사기 거래의 다단계 연결, 권한 상속 경로, 지식 그래프처럼 깊이가 가변적인 관계 탐색에 적합하다. 관계형 DB도 재귀 CTE로 경로를 찾을 수 있으므로, 탐색 깊이·그래프 규모·경로 질의 빈도가 전용 시스템의 운영 비용을 정당화하는지 비교한다.

### 성능은 결국 사용 패턴의 문제다

트렌드 파트에서 가장 인상 깊었던 것은, 데이터가 커진다고 해서 무조건 더 큰 서버 하나로 해결되지 않는다는 점이었다.

- 어떤 문제는 수직 확장으로 충분하다
- 어떤 문제는 분산이 필요하다
- 어떤 문제는 저장소 자체를 바꿔야 한다

그래서 DB 설계는 기술 선택이면서 동시에 사용 패턴 분석이다.

### NewSQL

NewSQL은 관계형 SQL과 ACID를 유지하면서 합의·샤딩으로 수평 확장을 제공하려는 계열이다. Spanner, CockroachDB 같은 시스템이 대표적이다.

데이터를 range 또는 hash로 분산하고 각 range의 replica가 합의를 거쳐 commit한다. 데이터 지역성이 좋으면 확장하기 쉽지만 cross-shard transaction과 global secondary index write는 여러 노드·region을 거쳐 latency가 커질 수 있다. “RDBMS 문법 그대로 무한 확장”이 아니라 분산 비용을 모델링해야 한다.

### 시계열 DB와 TimescaleDB

시계열 데이터는 timestamp 순으로 계속 추가되고 최근 구간 조회, 시간 bucket 집계, retention과 downsampling이 중요하다.

```sql
CREATE TABLE sensor_metrics (
    measured_at TIMESTAMPTZ NOT NULL,
    device_id   BIGINT NOT NULL,
    temperature DOUBLE PRECISION,
    humidity    DOUBLE PRECISION
);

-- TimescaleDB extension이 설치된 환경
SELECT create_hypertable(
    'sensor_metrics',
    by_range('measured_at')
);

SELECT
    time_bucket('1 hour', measured_at) AS bucket,
    device_id,
    AVG(temperature) AS avg_temperature
FROM sensor_metrics
WHERE measured_at >= now() - INTERVAL '7 days'
GROUP BY bucket, device_id
ORDER BY bucket;
```

hypertable은 시간 chunk로 데이터를 관리하고 continuous aggregate, compression, retention policy를 제공한다. 단순히 timestamp 컬럼이 있다는 이유만으로 전용 DB가 필요한 것은 아니며 ingest rate, 보존량, 집계 latency를 측정한다.

### Vector 검색과 pgvector

텍스트·이미지를 embedding model로 고정 길이 벡터로 변환하면 의미가 가까운 항목을 거리로 찾을 수 있다.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
    document_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id   BIGINT NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    embedding   vector(1536) NOT NULL
);

CREATE INDEX idx_documents_embedding_hnsw
ON documents
USING hnsw (embedding vector_cosine_ops);
```

```sql
SELECT
    document_id,
    title,
    1 - (embedding <=> :query_vector) AS cosine_similarity
FROM documents
WHERE tenant_id = :tenant_id
ORDER BY embedding <=> :query_vector
LIMIT 20;
```

`<=>`는 cosine distance operator다. 정확한 차원 수와 연산자 class는 사용한 embedding과 거리 정의에 맞춰야 한다. HNSW는 검색 품질·latency가 좋지만 메모리와 build/update 비용이 크고, IVFFlat은 학습과 list/probe tuning이 필요하다. approximate nearest neighbor는 일부 정확도를 속도와 교환한다.

### RAG의 하이브리드 검색

RAG(Retrieval-Augmented Generation)는 질문과 가까운 문서 chunk를 검색해 모델 입력 context에 넣는다.

```text
문서 수집 → 정제 → chunk 분할 → embedding → 저장
질문 → embedding → 권한 필터 + keyword/vector 검색
     → 점수 결합·reranking → context 구성 → 답변 생성
```

벡터 검색만 쓰면 정확한 제품 코드·고유명사에 약할 수 있다. 전문 검색(BM25 계열)과 vector score를 결합하고 reranker로 재정렬한다. 가장 중요한 SQL 조건은 tenant와 문서 권한 필터다. 검색 품질을 높인다는 이유로 권한이 없는 chunk를 모델 context에 넣으면 정보 유출이다.

평가는 retrieval recall@k, MRR/nDCG, 답변의 근거성·정확성, latency, 비용을 별도로 측정한다.

### AI/ML과 DB 통합 패턴

1. 애플리케이션이 DB에서 데이터를 읽어 외부 model API를 호출한다.
2. warehouse 내 ML/SQL 기능으로 학습·예측한다.
3. DB extension 또는 UDF가 vector·모델 연산을 제공한다.

모델 호출을 row trigger 안에서 직접 실행하면 transaction latency와 실패 결합이 커진다. 보통 outbox/queue로 비동기화하고 결과에 model version, input version, 생성 시각을 저장해 재현 가능하게 만든다.

### GraphQL과 N+1

GraphQL은 client가 필요한 필드를 선언하는 API query language이지 DB 자체가 아니다. resolver가 각 부모 행마다 자식 SQL을 실행하면 N+1 문제가 생긴다.

```text
customers 1회 조회
→ 고객 100명 각각 orders 조회 100회
→ 총 101 query
```

DataLoader로 key를 모아 `WHERE customer_id = ANY(:ids)`로 batch 조회하거나 적절한 JOIN·preload를 사용한다. client query depth와 복잡도를 제한하고 DB 권한을 GraphQL 필드 권한만으로 대체하지 않는다.

### Edge DB

사용자 가까운 region에 데이터를 배치하면 read latency와 offline 경험을 개선할 수 있다. 반면 multi-region write conflict, 데이터 주권, 중앙 source of truth와 동기화가 어려워진다. 읽기 캐시인지 지역별 partition인지 globally consistent DB인지 요구를 먼저 구분한다.

### DB 엔지니어 역할의 변화

AI 시대에도 핵심은 데이터 모델·정합성·성능·보안·복구다. 여기에 pipeline, cloud cost, observability, vector 품질, 데이터 거버넌스가 더해진다. 자연어 SQL 도구는 초안과 탐색을 빠르게 하지만 잘못된 JOIN grain, 민감 데이터 노출, 비효율적 full scan을 자동으로 책임지지 않는다. 생성 SQL도 실행 계획, 권한, 샘플 결과로 검증해야 한다.

## 보안과 권한 관리

DB는 데이터가 모이는 곳이므로 권한 관리가 중요하다.
가장 기본 원칙은 최소 권한 원칙이다.

```sql
GRANT SELECT, INSERT ON orders TO app_writer;
GRANT SELECT ON orders TO reporting_reader;
REVOKE DELETE ON orders FROM reporting_reader;
```

권한 관리에서 기억할 점은 다음과 같다.

- 앱 계정과 관리자 계정은 분리한다
- 읽기 전용 계정은 쓰기 권한을 주지 않는다
- 필요한 테이블과 스키마에만 권한을 준다
- 비밀번호와 접속 정보는 코드에 직접 넣지 않는다

보안은 기능이 아니라 기본값이어야 한다.

### 인증, 인가, 감사

- **인증(Authentication)**은 접속 주체가 누구인지 확인한다.
- **인가(Authorization)**는 그 주체가 어떤 객체·행·연산을 사용할 수 있는지 결정한다.
- **감사(Auditing)**는 누가 언제 무엇을 수행했는지 추적한다.
- 암호화는 전송·저장 중 데이터 노출을 줄인다.

한 기능만 켠다고 전체 보안이 완성되지 않는다. 네트워크 경계, IAM, DB role, row policy, secret rotation, 로그와 데이터 분류를 층별로 적용한다.

### PostgreSQL Role과 RBAC

PostgreSQL은 사용자와 그룹을 모두 role로 표현하며 `LOGIN` 속성으로 접속 가능 여부를 나눈다.

```sql
-- 직접 권한을 담는 그룹 role
CREATE ROLE app_readonly NOLOGIN;
CREATE ROLE app_readwrite NOLOGIN;

GRANT USAGE ON SCHEMA app TO app_readonly, app_readwrite;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO app_readonly;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO app_readwrite;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO app_readwrite;

-- 실제 로그인 role
CREATE ROLE api_service
LOGIN
PASSWORD 'temporary-secret-managed-outside-code';

GRANT app_readwrite TO api_service;
```

새로 생성될 테이블에도 권한을 적용하려면 객체를 만드는 owner role 기준으로 default privilege를 설정한다.

```sql
ALTER DEFAULT PRIVILEGES
FOR ROLE app_owner
IN SCHEMA app
GRANT SELECT ON TABLES TO app_readonly;

ALTER DEFAULT PRIVILEGES
FOR ROLE app_owner
IN SCHEMA app
GRANT SELECT, INSERT, UPDATE ON TABLES TO app_readwrite;
```

`ALL TABLES`는 현재 객체만 대상으로 하고 future table에는 자동 적용되지 않는다는 점이 흔한 실수다. 애플리케이션 role에 `CREATEDB`, `CREATEROLE`, object owner 권한을 주지 않는다. migration owner와 runtime role도 분리한다.

권한 상태를 조회할 수 있다.

```sql
SELECT
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'app'
ORDER BY grantee, table_name, privilege_type;
```

### View 기반 최소 노출

```sql
CREATE VIEW reporting.customer_order_summary
WITH (security_barrier = true)
AS
SELECT
    c.customer_id,
    c.name,
    COUNT(o.order_id) AS order_count,
    COALESCE(SUM(o.amount), 0) AS total_amount
FROM app.customers AS c
LEFT JOIN app.orders AS o USING (customer_id)
GROUP BY c.customer_id, c.name;

REVOKE ALL ON app.customers, app.orders FROM reporting_reader;
GRANT SELECT ON reporting.customer_order_summary TO reporting_reader;
```

이메일·전화번호 같은 민감 컬럼을 노출하지 않은 안정적인 조회 인터페이스를 제공한다. View owner와 security invoker/definer 동작은 DB 버전과 옵션을 확인한다.

### Row-Level Security

멀티테넌트 테이블에서는 같은 SQL role이 접속하더라도 현재 tenant 행만 보도록 RLS를 적용할 수 있다.

```sql
ALTER TABLE app.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.orders FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_tenant_policy
ON app.orders
FOR ALL
TO app_runtime
USING (
    tenant_id = current_setting('app.tenant_id', true)::BIGINT
)
WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::BIGINT
);
```

```sql
BEGIN;
SET LOCAL app.tenant_id = '42';
SELECT * FROM app.orders; -- tenant_id=42 행만
COMMIT;
```

`USING`은 보거나 수정 대상으로 삼을 기존 행, `WITH CHECK`는 INSERT·UPDATE 뒤 허용할 새 행을 검사한다. table owner와 `BYPASSRLS` role은 policy를 우회할 수 있으므로 runtime 계정이 owner가 되지 않게 한다. connection pool에서는 tenant context를 transaction마다 `SET LOCAL`하고 반드시 reset되는지 시험한다.

### SQL Injection

다음 코드는 사용자 입력을 SQL 문자열에 붙여 취약하다.

```python
# 취약: 입력값이 SQL 구조를 바꿀 수 있다.
sql = "SELECT * FROM users WHERE email = '" + email + "'"
cursor.execute(sql)
```

값은 parameter로 전달한다.

```python
cursor.execute(
    "SELECT user_id, email FROM users WHERE email = %s",
    (email,),
)
```

Prepared statement/parameter binding은 값과 SQL 구조를 분리한다. 테이블명, 컬럼명, 정렬 방향은 일반 parameter로 바인딩할 수 없으므로 허용 목록에서 안전한 identifier만 선택한다.

```python
allowed_sort = {
    "created": "created_at",
    "amount": "amount",
}
sort_column = allowed_sort.get(requested_sort, "created_at")
sql = f"""
    SELECT order_id, amount, created_at
    FROM orders
    ORDER BY {sort_column} DESC
    LIMIT %s
"""
cursor.execute(sql, (limit,))
```

ORM도 값 바인딩을 정상 사용하면 안전하지만 raw SQL, 문자열 조합, 동적 identifier, 잘못된 filter API 사용은 여전히 취약할 수 있다. 입력 검증은 injection 방어의 보조 수단이며 parameter binding을 대체하지 않는다.

### 암호화

| 구간 | 기술 | 막는 위협 |
|---|---|---|
| 전송 중 | TLS | 네트워크 도청·중간자 공격 |
| 저장 장치 | disk encryption, TDE | 분실한 디스크·snapshot 노출 |
| 민감 컬럼 | application/column encryption | DB dump·관리자 노출 범위 축소 |
| 비밀번호 | 강한 password hash | 원문 비밀번호 복원 방지 |

TDE는 DB가 읽을 때 자동 복호화하므로 정상 권한의 SQL injection이나 관리자 조회를 막지 못한다. 컬럼 암호화는 키를 DB 밖 KMS/HSM에서 관리할 수 있지만 동등 검색·정렬·인덱싱·키 회전이 어려워진다. 비밀번호는 복호화 가능한 암호화가 아니라 Argon2id/bcrypt 같은 salt가 있는 단방향 password hash를 사용한다.

### Cloud DB 보안

- public endpoint를 기본으로 열지 않고 private subnet·VPC peering을 사용한다.
- security group/firewall에서 필요한 source와 port만 허용한다.
- 정적 비밀번호 대신 가능한 경우 IAM/managed identity와 짧은 수명 token을 사용한다.
- secret manager에서 자격증명을 저장하고 자동 회전한다.
- KMS key, backup/snapshot 공유, cross-account 권한을 감사한다.
- database audit log와 cloud control-plane log를 중앙 보관한다.
- 개발·운영 계정과 네트워크를 분리하고 운영 데이터의 개발 복사를 마스킹한다.

가장 흔한 사고는 과도한 `GRANT`, 공유 관리자 계정, 코드에 포함된 secret, public network 허용, 오래된 계정, 마스킹 없는 dump에서 시작한다.

### 주요 DBMS의 역할 문법 관점

| DBMS | 역할·사용자 관점 | 행 보안 |
|---|---|---|
| PostgreSQL | role에 `LOGIN` 속성, role membership | `CREATE POLICY` RLS |
| MySQL 8 | user와 role, `SET DEFAULT ROLE` | native RLS 대신 View·애플리케이션 패턴 검토 |
| SQL Server | login → database user → database role | security policy + predicate function |
| Oracle | user와 role, system/object privilege | VPD/FGAC 계열 |

문법이 달라도 원칙은 같다. 개인·서비스 identity를 구분하고 권한은 group role에 부여하며, 운영 DDL owner와 runtime DML 계정을 분리하고, 직접 grant보다 review 가능한 RBAC 스크립트를 관리한다.

## 백업과 복구

백업은 “있으면 안심”이 아니라, **복구할 수 있어야** 의미가 있다.

기본적으로 확인해야 할 것은 다음이다.

- 전체 백업이 있는가
- 변경 이력을 복구할 수 있는가
- 특정 시점으로 되돌릴 수 있는가
- 실제 복구 테스트를 해봤는가

### RPO와 RTO

운영에서는 두 가지 용어가 자주 나온다.

| 용어 | 의미 |
|---|---|
| RPO | 어디까지의 데이터 손실을 허용할 수 있는가 |
| RTO | 얼마나 빨리 서비스를 복구해야 하는가 |

RPO와 RTO를 정해야 백업 주기와 복구 방식을 설계할 수 있다.

### 백업과 복제는 다르다

복제본이 있다고 해서 자동으로 백업이 되는 것은 아니다.
실수로 삭제한 데이터도 복제되면 같이 사라질 수 있기 때문이다.

그래서 보통은 다음을 함께 생각한다.

- 백업
- 로그 보관
- point-in-time recovery
- 복구 리허설

### 백업 유형

| 유형 | 내용 | 장점 | 단점 |
|---|---|---|---|
| Full | 전체 데이터 | 복구 단순 | 시간·공간 큼 |
| Incremental | 마지막 백업 이후 변경 | 백업 빠르고 작음 | 복구 체인이 길어질 수 있음 |
| Differential | 마지막 full 이후 변경 | incremental보다 복구 단순 | 시간이 갈수록 커짐 |
| Logical | SQL/object 논리 표현 | 선택 복구·이식성 | 대용량 복구 느림 |
| Physical | 데이터 파일·block | 전체 복구 빠름 | 엔진·버전·플랫폼 종속 |

PostgreSQL `pg_dump`는 논리 백업이며 특정 테이블·schema 단위 복구와 migration에 좋다.

```bash
pg_dump -Fc -d skala_db -f skala_db_20260729.dump
createdb skala_restore_test
pg_restore --clean --if-exists -d skala_restore_test skala_db_20260729.dump
```

물리 base backup과 WAL archive는 큰 cluster의 PITR·standby 구성에 사용한다.

```text
base backup 시각 T0
  + T0 이후 연속 보관한 WAL
  → 원하는 복구 목표 시각 T1 직전까지 replay
```

실수로 테이블을 삭제한 14:32:10 직전으로 복구하려면 별도 서버에서 PITR하고 필요한 데이터를 원본에 선택적으로 되돌릴 수 있다. 원본 서버를 바로 과거로 되돌리면 정상적인 이후 변경도 잃는다.

### RPO와 RTO에서 정책으로

“RPO 5분, RTO 30분”이라면 다음을 구체화한다.

- WAL/log가 5분보다 짧은 간격으로 원격 보관되는가?
- 백업 저장소가 DB와 다른 장애 domain·계정에 있는가?
- 30분 안에 restore할 compute와 자동화가 준비되어 있는가?
- 암호화 key와 비밀번호도 재해 상황에서 접근 가능한가?
- 가장 큰 실제 데이터로 restore 시간을 측정했는가?

3-2-1 원칙처럼 여러 복사본, 서로 다른 매체/서비스, 한 개 이상의 off-site 또는 격리 사본을 두고 immutable retention을 검토한다.

### 복제와 고가용성

PostgreSQL streaming replication은 primary의 WAL을 standby가 받아 replay한다.

```text
Primary → WAL sender → network → WAL receiver → Standby replay
```

비동기 복제는 primary latency가 낮지만 장애 시 전송되지 않은 WAL만큼 손실될 수 있다. 동기 복제는 지정 standby가 WAL을 확인할 때까지 commit을 기다려 RPO를 줄이지만 network와 standby 장애가 write latency·availability에 영향을 준다.

HA는 장애 감지, leader 선출/승격, virtual endpoint 또는 DNS 전환, client 재연결, split-brain 방지까지 포함한다. replica가 있다고 자동 failover가 완성되는 것은 아니다.

| DBMS | 로그·복구 | 대표 HA |
|---|---|---|
| PostgreSQL | WAL, PITR | streaming replication, Patroni 계열 |
| MySQL InnoDB | binlog, redo/undo | Group Replication, InnoDB Cluster |
| SQL Server | transaction log | Always On Availability Groups |
| Oracle | redo/archive log | Data Guard, RAC |
| Cloud DB | service snapshot/log | Multi-AZ, managed failover |

replica는 실수한 `DELETE`와 논리 손상도 복제하므로 백업을 대체하지 않는다.

### 복구 검증

복구 훈련에서는 “restore 명령 성공”보다 다음을 확인한다.

- 핵심 테이블 row count와 checksum/업무 합계가 맞는가?
- PK·FK·index·sequence·function·role이 복구되었는가?
- 애플리케이션 smoke test가 통과하는가?
- 실제 RPO·RTO가 목표 안에 드는가?
- 절차의 수동 단계와 권한 병목이 무엇인가?
- 원본과 격리되어 실수로 운영에 쓰지 않는가?

## 모니터링과 운영

운영은 문제가 생기기 전에 먼저 보는 일이다.
DB에서 자주 보는 항목은 다음과 같다.

- 연결 수
- CPU와 메모리 사용량
- 디스크 공간
- 느린 쿼리
- 잠금과 대기
- 복제 지연
- 오류 로그

즉, 성능 문제는 쿼리만 보는 것이 아니라 시스템 전체를 같이 봐야 한다.

운영 관점에서는 “잘 돌아간다”보다 “문제가 나기 전에 신호를 잡는다”가 더 중요하다.

### TPS, QPS, Latency, Throughput

- TPS는 초당 완료된 transaction 수다.
- QPS는 초당 query 수다. 한 transaction에 여러 query가 있을 수 있다.
- latency는 요청 한 건이 끝나는 시간이며 평균보다 p95·p99가 사용자 체감을 잘 드러낸다.
- throughput은 단위 시간에 처리한 작업량이다.
- error rate와 saturation은 실패 비율과 CPU·connection·I/O 같은 자원의 포화 정도다.

부하가 늘어 throughput은 더 이상 증가하지 않는데 latency가 급격히 오르면 포화 지점에 도달한 것이다.

### PostgreSQL에서 보는 관측 지점

```sql
-- connection/state/wait
SELECT
    state,
    wait_event_type,
    wait_event,
    COUNT(*)
FROM pg_stat_activity
GROUP BY state, wait_event_type, wait_event
ORDER BY COUNT(*) DESC;

-- database 단위 transaction과 block
SELECT
    datname,
    xact_commit,
    xact_rollback,
    blks_read,
    blks_hit,
    temp_files,
    temp_bytes,
    deadlocks
FROM pg_stat_database;

-- replica replay 지연의 한 관점
SELECT
    application_name,
    client_addr,
    state,
    sync_state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS replay_byte_lag
FROM pg_stat_replication;
```

replication lag는 byte lag와 time lag를 함께 보고, primary가 쓰지 않는 조용한 시간에는 time 계산이 오해를 줄 수 있음을 고려한다.

### 증상에서 원인 후보로

| 증상 | 가능한 원인 | 확인 항목 |
|---|---|---|
| latency 급증 | lock, I/O, bad plan, connection queue | wait event, slow query, plan |
| CPU 높음 | full scan, 과도한 sort/hash, connection 과다 | top query, rows, parallelism |
| IOPS 높음 | cache miss, 큰 scan, checkpoint | buffers, `blks_read`, checkpoint |
| connection 고갈 | leak, pool 과대, 긴 transaction | state, xact age, pool metrics |
| disk 증가 | WAL, bloat, temp, log, backup | relation/WAL/log 크기 |
| replica lag | 대량 write, network, slow replay | WAL rate, byte lag, standby I/O |
| deadlock | 자원 순서 불일치 | DB log, transaction trace |

상관관계만으로 원인을 확정하지 않는다. 같은 시간대의 deploy, traffic, schema migration, batch, cloud event를 함께 놓고 본다.

### 도구 구성

- PostgreSQL 내부: `pg_stat_activity`, `pg_stat_statements`, `pg_locks`, `pg_stat_database`
- metric 수집: postgres_exporter와 Prometheus
- 시각화·alert: Grafana
- log 분석: Cloud logging, ELK/OpenSearch 계열
- APM: 요청 trace와 SQL span 연결
- Cloud DB: CloudWatch, Cloud Monitoring, Azure Monitor와 성능 대시보드

관리형 서비스에서는 OS root metric 대신 제공 지표와 enhanced monitoring을 사용하고, parameter 변경·failover·storage autoscaling 같은 control-plane event도 함께 본다.

### Alert 설계

단일 순간값보다 지속 시간과 서비스 영향에 기반한다.

```text
Critical:
  p99 DB latency > 500 ms for 10 min
  AND application error rate > 2%

Warning:
  connection usage > 80% for 15 min
  replication byte lag > threshold for 5 min
  disk free < 20% with projected exhaustion < 3 days
```

모든 경고에는 owner, severity, dashboard, runbook, 확인 SQL, escalation 경로가 있어야 한다. 너무 민감한 alert는 피로로 무시되고, 너무 느슨하면 장애를 놓친다. 정기적으로 threshold와 실제 incident 적중률을 검토한다.

### On-Prem과 Cloud 운영의 차이

On-Prem은 hardware, RAID, OS, filesystem, DB까지 직접 관찰하고 교체한다. Cloud DB는 hardware·일부 HA를 provider가 맡지만 service quota, IOPS 과금, storage autoscaling, maintenance window, IAM, cross-AZ traffic과 provider status를 사용자가 관리한다. 책임의 범위가 사라지는 것이 아니라 경계가 바뀐다.

## 종합 실습: E-Commerce 매출과 운영 분석

교재의 마지막 실습은 E-Commerce 데이터팀의 주니어 엔지니어라는 시나리오다. 채널은 web·mobile·marketplace, 주문 상태는 created·paid·shipped·delivered·cancelled·refunded이며, 가격 이력은 SCD Type 2, 카테고리는 재귀 트리, 재고는 `reorder_point`로 관리한다고 가정한다.

아래 예시는 다음 핵심 컬럼을 전제로 한다.

```text
orders(order_id, customer_id, ordered_at, status, channel,
       coupon_code, total_amount)
order_items(order_id, product_id, quantity, unit_price)
products(product_id, category_id, name, stock_quantity, reorder_point)
categories(category_id, parent_category_id, name)
reviews(review_id, product_id, rating)
product_prices(product_id, price, valid_from, valid_to)
```

### 지난 한 달 GMV

```sql
SELECT
    COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS gmv
FROM orders AS o
JOIN order_items AS oi USING (order_id)
WHERE o.status IN ('paid', 'shipped', 'delivered')
  AND o.ordered_at >= CURRENT_DATE - INTERVAL '1 month'
  AND o.ordered_at < CURRENT_DATE + INTERVAL '1 day';
```

`total_amount`를 source of truth로 관리한다면 그 컬럼을 합산할 수 있다. 주문 항목에서 다시 계산한다면 할인·세금·배송비·환불을 GMV 정의에 어떻게 반영할지 먼저 정해야 한다.

### 월별 주문 수·매출·AOV

```sql
SELECT
    DATE_TRUNC('month', ordered_at)::date AS month,
    COUNT(*) AS order_count,
    SUM(total_amount) AS revenue,
    SUM(total_amount) / NULLIF(COUNT(*), 0) AS aov
FROM orders
WHERE status IN ('paid', 'shipped', 'delivered')
GROUP BY DATE_TRUNC('month', ordered_at)
ORDER BY month;
```

`NULLIF(COUNT(*), 0)`는 분모가 0이면 `NULL`로 바꿔 division by zero를 막는다. 이 query에서는 결과 그룹에 행이 있어 count가 0이 아니지만, outer join 기반 비율에서는 안전한 패턴이 된다.

### 최근 90일 카테고리 Top 10

```sql
SELECT
    c.category_id,
    c.name,
    SUM(oi.quantity * oi.unit_price) AS revenue
FROM orders AS o
JOIN order_items AS oi USING (order_id)
JOIN products AS p USING (product_id)
JOIN categories AS c USING (category_id)
WHERE o.status IN ('paid', 'shipped', 'delivered')
  AND o.ordered_at >= now() - INTERVAL '90 days'
GROUP BY c.category_id, c.name
ORDER BY revenue DESC
LIMIT 10;
```

상위 카테고리까지 매출을 roll-up해야 한다면 재귀 CTE로 각 leaf category의 ancestor를 펼친 뒤 매출을 집계한다. 카테고리 깊이가 고정되어 있지 않으므로 단순 self join 한 번으로는 전체 조상을 구할 수 없다.

### 제품별 누적 매출 Top 20

```sql
WITH product_sales AS (
    SELECT
        p.product_id,
        p.name,
        SUM(oi.quantity * oi.unit_price) AS revenue
    FROM products AS p
    JOIN order_items AS oi USING (product_id)
    JOIN orders AS o USING (order_id)
    WHERE o.status IN ('paid', 'shipped', 'delivered')
    GROUP BY p.product_id, p.name
),
ranked AS (
    SELECT
        *,
        RANK() OVER (ORDER BY revenue DESC) AS revenue_rank,
        SUM(revenue) OVER (
            ORDER BY revenue DESC, product_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_revenue
    FROM product_sales
)
SELECT *
FROM ranked
WHERE revenue_rank <= 20
ORDER BY revenue_rank, product_id;
```

`RANK <= 20`은 20위 동점 상품을 모두 포함해 20행을 넘을 수 있다. 정확히 20개가 요구되면 `ROW_NUMBER`를 사용한다.

### 고객 RFM

```sql
WITH customer_rfm AS (
    SELECT
        customer_id,
        CURRENT_DATE - MAX(ordered_at)::date AS recency_days,
        COUNT(*) AS frequency,
        SUM(total_amount) AS monetary
    FROM orders
    WHERE status IN ('paid', 'shipped', 'delivered')
    GROUP BY customer_id
)
SELECT
    *,
    6 - NTILE(5) OVER (ORDER BY recency_days) AS r_score,
    NTILE(5) OVER (ORDER BY frequency) AS f_score,
    NTILE(5) OVER (ORDER BY monetary) AS m_score
FROM customer_rfm;
```

Recency는 작을수록 좋기 때문에 score 방향을 뒤집었다. `NTILE`은 고객 수를 균등 그룹으로 나누므로 절대 업무 기준이 필요하면 “30일 이내” 같은 threshold를 별도로 정의한다.

### 첫 구매 후 30일 이내 재구매율

```sql
WITH paid_orders AS (
    SELECT customer_id, ordered_at
    FROM orders
    WHERE status IN ('paid', 'shipped', 'delivered')
),
sequenced AS (
    SELECT
        customer_id,
        ordered_at,
        ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY ordered_at
        ) AS rn,
        LEAD(ordered_at) OVER (
            PARTITION BY customer_id
            ORDER BY ordered_at
        ) AS next_ordered_at
    FROM paid_orders
),
first_orders AS (
    SELECT customer_id, ordered_at, next_ordered_at
    FROM sequenced
    WHERE rn = 1
)
SELECT
    COUNT(*) FILTER (
        WHERE next_ordered_at <= ordered_at + INTERVAL '30 days'
    )::NUMERIC
    / NULLIF(COUNT(*), 0) AS repurchase_rate_30d
FROM first_orders;
```

분모에 아직 첫 구매 후 30일의 관찰 기간이 지나지 않은 신규 고객을 포함하면 비율이 낮아지는 right censoring 문제가 있다. 분석 기준일 30일 이전에 첫 구매한 고객만 분모에 넣는 방식도 함께 검토한다.

### 재고 임계치 이하 상품

```sql
SELECT
    product_id,
    name,
    stock_quantity,
    reorder_point,
    reorder_point - stock_quantity AS shortage_to_target
FROM products
WHERE stock_quantity <= reorder_point
ORDER BY shortage_to_target DESC, product_id;
```

재고 수량만 보면 판매 속도를 놓친다. 최근 일평균 판매량을 함께 계산해 `days_of_supply = stock / daily_sales`를 구하면 실제 품절 위험을 더 잘 추정할 수 있다.

### 리뷰 4.5 이상·50개 이상 상품

```sql
SELECT
    p.product_id,
    p.name,
    COUNT(*) AS review_count,
    ROUND(AVG(r.rating), 2) AS average_rating
FROM products AS p
JOIN reviews AS r USING (product_id)
GROUP BY p.product_id, p.name
HAVING COUNT(*) >= 50
   AND AVG(r.rating) >= 4.5
ORDER BY average_rating DESC, review_count DESC;
```

평균만으로 순위를 매기면 표본 수 차이를 제대로 반영하지 못한다. 실무 추천에서는 Bayesian average나 Wilson score 같은 신뢰도 보정도 고려한다.

### 쿠폰 사용과 미사용 주문의 AOV

```sql
SELECT
    CASE
        WHEN coupon_code IS NULL THEN 'no_coupon'
        ELSE 'coupon'
    END AS coupon_group,
    COUNT(*) AS order_count,
    AVG(total_amount) AS aov
FROM orders
WHERE status IN ('paid', 'shipped', 'delivered')
GROUP BY
    CASE
        WHEN coupon_code IS NULL THEN 'no_coupon'
        ELSE 'coupon'
    END;
```

이 결과는 상관관계다. 고액 고객에게 쿠폰을 주었거나 최소 구매 금액이 있다면 쿠폰이 AOV를 높였다는 인과 결론을 낼 수 없다. 캠페인 대상, 기간, 고객 성향을 통제하거나 A/B test가 필요하다.

### 상위 1% 고객의 최근 60일 매출

```sql
WITH customer_sales AS (
    SELECT
        customer_id,
        SUM(total_amount) AS revenue_60d
    FROM orders
    WHERE status IN ('paid', 'shipped', 'delivered')
      AND ordered_at >= now() - INTERVAL '60 days'
    GROUP BY customer_id
),
ranked AS (
    SELECT
        *,
        CUME_DIST() OVER (ORDER BY revenue_60d DESC) AS top_fraction
    FROM customer_sales
)
SELECT
    COUNT(*) AS top_customer_count,
    SUM(revenue_60d) AS top_1pct_revenue
FROM ranked
WHERE top_fraction <= 0.01;
```

고객 수가 작거나 경계 동점이 있으면 결과가 비거나 1%를 초과할 수 있다. “최소 한 명”, “동점 포함”, “정확히 ceil(N×0.01)명” 중 어떤 정의인지 정한다.

### 안전한 나눗셈 함수

```sql
CREATE OR REPLACE FUNCTION safe_divide(
    p_numerator NUMERIC,
    p_denominator NUMERIC,
    p_default NUMERIC DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT COALESCE(p_numerator / NULLIF(p_denominator, 0), p_default)
$$;

SELECT safe_divide(100, 4);       -- 25
SELECT safe_divide(100, 0);       -- NULL
SELECT safe_divide(100, 0, 0);    -- 0
```

분모가 0일 때 `NULL`과 0은 의미가 다르다. 계산 불가능을 숨기지 않으려면 기본값을 `NULL`로 유지하는 편이 낫다.

### Materialized View와 실행 계획 개선

```sql
CREATE MATERIALIZED VIEW analytics.mv_daily_gmv AS
SELECT
    o.ordered_at::date AS sales_date,
    SUM(oi.quantity * oi.unit_price) AS gmv,
    COUNT(DISTINCT o.order_id) AS order_count
FROM app.orders AS o
JOIN app.order_items AS oi USING (order_id)
WHERE o.status IN ('paid', 'shipped', 'delivered')
GROUP BY o.ordered_at::date
WITH DATA;

CREATE UNIQUE INDEX uq_mv_daily_gmv_date
ON analytics.mv_daily_gmv (sales_date);

REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_daily_gmv;
```

`CONCURRENTLY` refresh에는 모든 행을 유일하게 식별하는 적합한 unique index가 필요하고, 일반 refresh보다 추가 비용이 든다. 교재 시나리오처럼 매일 15시 갱신한다면 리포트에 “데이터 기준 시각”을 표시한다.

실습 결과에는 원본 쿼리의 `EXPLAIN (ANALYZE, BUFFERS)`, 인덱스·Materialized View 적용 후 계획, 실행 시간과 읽은 block 수, freshness trade-off를 함께 기록한다. Hash Join·Nested Loop·Bitmap Heap Scan은 이름만 비교하지 말고 실제 입력 행 수와 I/O가 왜 달라졌는지 설명한다.

---

이전 글: [3일차 — 인덱스, 실행 계획, SQL 튜닝, Lock](/posts/skala-smart-data-day3/)

시리즈 안내: [스마트 데이터 이해 및 활용 — 4일 학습 로드맵](/posts/skala-smart-data-roadmap/)
