---
title: "[SKALA] 스마트 데이터 이해 및 활용 3일차 — 인덱스, 실행 계획, SQL 튜닝, Lock"
date: 2026-07-29 09:00:00 +0900
categories:
  - SKALA
  - Database
tags: [skala, database, sql, index, execution-plan, tuning, mvcc, partitioning, lock, deadlock, postgresql]
description: "인덱스 내부 구조와 실행 계획, 느린 쿼리·파티셔닝, MVCC·격리 수준·Lock, 고급 정규화와 분산 설계까지 정리한다."
permalink: /posts/skala-smart-data-day3/
---

1, 2일차에는 데이터를 어떻게 저장하고 연결할지 배웠다. 3일차는 한 걸음 더 나아가 **왜 어떤 쿼리는 느리고, 어떻게 빨라지는지**를 읽는 날이다.

예제는 계속 주문 시스템을 사용한다. 같은 SQL도 데이터량·분포·캐시·동시 트랜잭션에 따라 성능이 달라질 수 있으므로, 인덱스와 실행 계획을 읽고 측정하는 방법부터 MVCC, 격리 수준, Lock, 파티셔닝과 분산 설계까지 연결한다.

```text
customers 1 ─────< orders 1 ─────< order_items >───── 1 products
```

쿼리를 잘 쓰는 것에서 끝나지 않고, DB가 그 쿼리를 어떻게 해석하는지까지 읽을 수 있어야 한다.

## 느리다는 말의 의미

“쿼리가 느리다”는 말은 사실 여러 가지를 포함한다.

- 테이블을 너무 많이 읽는다
- 정렬이 너무 크다
- 조인이 비효율적이다
- 조건이 인덱스를 못 탄다
- 통계가 오래되어 planner가 잘못 판단한다
- 다른 트랜잭션이 락을 잡고 있다

그래서 성능 문제를 볼 때는 감으로 추측하기보다, 먼저 실제로 무엇이 병목인지 확인해야 한다.

## 인덱스는 검색을 빠르게 하지만 공짜는 아니다

인덱스는 책의 목차와 비슷하다. 원하는 내용을 바로 찾게 도와준다.
하지만 목차를 유지하는 데도 비용이 든다.

인덱스의 대표적인 장점은 다음과 같다.

- 조건 검색을 빠르게 한다
- 조인 키 탐색을 돕는다
- 정렬과 범위 검색에 유리하다

반대로 인덱스의 비용도 분명하다.

- 저장 공간이 늘어난다
- INSERT, UPDATE, DELETE가 느려질 수 있다
- 너무 많은 인덱스는 오히려 관리 부담을 키운다

PostgreSQL에서는 기본적으로 B-tree 인덱스가 가장 널리 쓰인다.
정확한 값 찾기, 범위 검색, 정렬에 자주 활용된다.

```sql
CREATE INDEX idx_orders_customer_created_at
ON orders (customer_id, created_at DESC);
```

이 인덱스는 다음처럼 자주 조회하는 패턴에 잘 맞는다.

```sql
SELECT order_id, created_at, status
FROM orders
WHERE customer_id = 42
  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 20;
```

여기서 중요한 점은 컬럼 순서다.

- `customer_id`처럼 값이 딱 맞아 떨어지는 조건을 먼저 두는 편이 유리하다
- `created_at`처럼 범위 검색이나 정렬에 쓰이는 조건은 그 뒤에 오는 경우가 많다

즉, 인덱스는 “있으면 좋다”가 아니라 **어떤 질의 패턴을 빠르게 할 것인지**를 기준으로 설계해야 한다.

### 인덱스가 잘 안 타는 경우

아래처럼 컬럼에 함수를 씌우면 인덱스를 활용하기 어려워질 수 있다.

```sql
-- 비추천
SELECT order_id
FROM orders
WHERE DATE(created_at) = CURRENT_DATE;
```

이런 조건은 보통 범위 조건으로 바꾸는 편이 낫다.

```sql
-- 추천
SELECT order_id
FROM orders
WHERE created_at >= CURRENT_DATE
  AND created_at < CURRENT_DATE + INTERVAL '1 day';
```

이 차이는 단순한 문법 취향이 아니라, DB가 검색 범위를 바로 좁힐 수 있느냐와 연결된다.

### 모든 컬럼에 인덱스를 만들면 안 되는 이유

인덱스는 많을수록 좋지 않다.
읽기 성능은 좋아질 수 있지만 쓰기 성능과 저장 공간은 희생된다.

그래서 보통은 다음 기준으로 우선순위를 잡는다.

- 자주 검색되는 조건
- 조인에 반복적으로 쓰이는 키
- 정렬이나 범위 조회에 자주 쓰이는 컬럼
- 데이터가 충분히 많고 선택도가 높은 컬럼

한마디로, 많이 쓰이는 경로에만 인덱스를 둔다.

### B-tree 내부 구조

B-tree 인덱스는 키를 정렬된 트리로 저장한다. root page에서 시작해 internal page를 거쳐 leaf page에 도달하며, PostgreSQL leaf entry는 보통 heap tuple의 위치를 가리키는 TID를 가진다.

```text
Root
 ├─ Internal: key < 1000
 │   ├─ Leaf: 1 ... 500
 │   └─ Leaf: 501 ... 999
 └─ Internal: key >= 1000
     ├─ Leaf: 1000 ... 1500
     └─ Leaf: 1501 ...
```

트리 높이가 낮게 유지되어 검색은 대략 `O(log N)`이고, leaf가 키 순서로 연결되어 범위 검색과 정렬에도 적합하다. 페이지가 차면 split이 발생하고, INSERT·UPDATE·DELETE 때 인덱스도 갱신된다. 랜덤한 키의 대량 입력은 페이지 분할과 캐시 지역성 비용을 키울 수 있다.

PostgreSQL의 MVCC 구조에서는 인덱스가 가리키는 heap tuple이 현재 트랜잭션에 보이는지 다시 확인해야 할 수 있다. `Index Only Scan`도 visibility map이 해당 heap page의 모든 튜플이 모두 보인다고 표시할 때 heap 방문을 피할 수 있다. 그래서 인덱스만 잘 만들어도 VACUUM이 뒤처지면 기대한 Index Only Scan의 효과가 줄 수 있다.

### 인덱스 종류와 연산자

| 종류 | 잘 맞는 데이터·연산 | 예 |
|---|---|---|
| B-tree | `=`, `<`, `>`, `BETWEEN`, 정렬, prefix | ID·날짜·금액 |
| Hash | `=` | 제한적인 동등 비교 |
| GIN | 한 값 안의 여러 키를 역색인 | JSONB, 배열, 전문 검색 |
| GiST | 확장 가능한 탐색 트리 | 범위 겹침, 지리·거리, k-NN |
| BRIN | 물리 순서와 값이 상관된 거대 테이블 | 시간순 로그의 날짜 범위 |

```sql
-- JSONB 포함 연산
CREATE INDEX idx_products_attrs_gin
ON products USING GIN (attrs);

-- 대용량 append-only 이벤트의 시간 범위
CREATE INDEX idx_events_created_at_brin
ON events USING BRIN (created_at)
WITH (pages_per_range = 128);
```

BRIN은 각 페이지 범위의 최소·최대 같은 요약만 저장하므로 매우 작지만, 값이 물리적 저장 순서와 무관하면 불필요한 heap 범위를 많이 읽는다. 특수 인덱스는 이름이 아니라 쿼리의 연산자와 데이터 분포에 맞춰 선택한다.

### 복합·부분·표현식·커버링 인덱스

```sql
-- 등가 조건 → 범위/정렬 조건 순서
CREATE INDEX idx_orders_customer_ordered
ON orders (customer_id, ordered_at DESC, order_id DESC);
```

B-tree 복합 인덱스는 선두 컬럼이 특히 중요하다. 위 인덱스는 `customer_id = ?`와 주문 시각 범위에 잘 맞지만, `ordered_at`만 검색할 때는 모든 고객 구간을 넓게 훑을 수 있다.

```sql
-- 완료 주문만 자주 조회한다면 더 작은 부분 인덱스
CREATE INDEX idx_orders_completed_recent
ON orders (ordered_at DESC)
WHERE status = 'COMPLETED';

-- 대소문자 무시 이메일 검색
CREATE UNIQUE INDEX uq_customers_email_lower
ON customers (LOWER(email));

-- 검색 키 외 반환 컬럼을 leaf에 포함
CREATE INDEX idx_orders_customer_cover
ON orders (customer_id, ordered_at DESC)
INCLUDE (status, amount);
```

부분 인덱스는 쿼리 조건이 인덱스 predicate를 논리적으로 만족할 때만 사용된다. `INCLUDE` 컬럼은 검색 순서에는 참여하지 않고 결과 반환을 도와 Index Only Scan 가능성을 높인다. 포함 컬럼을 너무 많이 넣으면 인덱스가 커져 캐시·쓰기 비용이 증가한다.

### DBMS별 생성과 물리 구조 차이

- PostgreSQL은 heap과 보조 인덱스가 분리되어 있고 `CREATE INDEX CONCURRENTLY`를 제공한다.
- MySQL InnoDB의 PK는 clustered index라 실제 행이 PK 순서의 B+tree leaf에 저장된다. 보조 인덱스 leaf는 PK를 포함하므로 큰 복합 PK는 모든 보조 인덱스를 키운다.
- SQL Server는 clustered/nonclustered index와 `INCLUDE`를 제공하며 보통 테이블당 clustered index 하나를 둔다.
- Oracle은 B-tree, bitmap, function-based index 등을 제공한다. Bitmap index는 낮은 카디널리티 분석 데이터에 유리하지만 동시 쓰기가 많은 OLTP에는 부적합할 수 있다.

운영 중 인덱스 생성은 잠금·로그·복제 지연·임시 공간을 소비한다. 온라인 옵션이 있어도 “비용 없음”은 아니므로 시간대와 모니터링 계획이 필요하다.

### 사용하지 않는 인덱스 찾기

```sql
SELECT
    schemaname,
    relname AS table_name,
    indexrelname AS index_name,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan, pg_relation_size(indexrelid) DESC;
```

`idx_scan = 0`만 보고 바로 삭제해서는 안 된다. 통계 reset 이후 기간이 짧을 수 있고, 월말 배치·장애 복구·유일성 보장용 인덱스일 수 있다. 중복 인덱스인지, 제약조건이 의존하는지, 충분한 관찰 기간이 지났는지를 확인한 뒤 제거한다.

## 실행 계획은 DB가 문제를 푸는 방식이다

쿼리는 내가 쓰지만, 실제로 풀어내는 건 DBMS다.
실행 계획은 그 답안지를 보는 일에 가깝다.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.order_id, o.created_at, c.name
FROM orders AS o
JOIN customers AS c
  ON c.customer_id = o.customer_id
WHERE o.customer_id = 42
  AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY o.created_at DESC
LIMIT 20;
```

`EXPLAIN`은 DB가 어떤 계획을 선택했는지 보여주고, `ANALYZE`는 실제 수행 결과를 함께 보여준다.
`BUFFERS`를 붙이면 디스크와 메모리 사용 힌트도 볼 수 있다.

실행 계획을 읽을 때는 다음을 먼저 본다.

- 어떤 스캔을 하는가
- 어떤 조인 방식을 쓰는가
- 정렬이 큰 비용을 차지하는가
- 추정 행 수와 실제 행 수가 얼마나 다른가

예를 들어 아래처럼 단순화해서 볼 수 있다.

```text
Limit
  ->  Sort
        ->  Hash Join
              ->  Seq Scan on orders
              ->  Seq Scan on customers
```

이 계획은 인덱스를 못 쓰고 전체를 훑은 뒤 정렬까지 한다는 뜻에 가깝다.
반대로 적절한 인덱스가 있으면 이런 모습이 나올 수 있다.

```text
Limit
  ->  Index Scan using idx_orders_customer_created_at on orders
        Index Cond: (customer_id = 42)
```

물론 실행 계획은 정답지가 아니라 현재 데이터 분포와 통계에 따라 달라지는 판단 결과다.
그래서 쿼리가 바뀌지 않았는데도 데이터가 쌓이면 계획이 바뀔 수 있다.

### cost, rows, width, actual, loops 읽기

```text
Index Scan using idx_orders_customer_ordered on orders
  (cost=0.43..24.57 rows=18 width=40)
  (actual time=0.071..0.193 rows=20 loops=1)
  Index Cond: (customer_id = 42)
  Buffers: shared hit=8 read=2
```

- `cost=0.43..24.57`은 시작 비용과 전체 예상 비용이다. 밀리초가 아니라 Planner가 비교하는 상대 단위다.
- `rows=18`은 이 노드가 한 loop마다 반환할 것으로 예상한 행 수다.
- `width=40`은 행 하나의 평균 예상 바이트다.
- `actual time`과 `actual rows`는 `ANALYZE`가 실제 실행해 측정한 값이다.
- `loops`가 여러 번이면 실제 총 작업량을 이해할 때 `actual rows × loops`를 함께 본다.
- `shared hit`은 shared buffer에서 찾은 블록, `read`는 OS 또는 스토리지에서 읽도록 요청한 블록이다.

`EXPLAIN ANALYZE`는 실제 DML을 실행한다. 운영의 `UPDATE`·`DELETE`를 검사하려면 안전한 복제 환경에서 실행하거나, 필요 시 명시적 트랜잭션에서 실행 후 `ROLLBACK`하되 trigger·외부 부작용을 주의한다.

### 자주 보는 스캔과 조인 노드

| 노드 | 해석 포인트 |
|---|---|
| Seq Scan | 테이블의 큰 비율을 읽으면 오히려 합리적 |
| Index Scan | 선택도가 높고 heap 방문이 적을 때 유리 |
| Index Only Scan | 필요한 컬럼이 인덱스에 있고 visibility map 상태가 중요 |
| Bitmap Index/Heap Scan | 중간 정도 행 수나 여러 인덱스 조건 결합 |
| Nested Loop | 바깥 행 수 × 안쪽 반복 비용 확인 |
| Hash Join | `=` 조인, hash의 `Batches`와 메모리 spill 확인 |
| Merge Join | 정렬된 입력, 앞선 Sort 비용 확인 |
| Sort | sort method, memory, disk spill 확인 |
| Aggregate | HashAggregate와 GroupAggregate, 메모리 확인 |

```sql
EXPLAIN (
    ANALYZE,
    BUFFERS,
    WAL,
    SETTINGS,
    VERBOSE,
    FORMAT TEXT
)
SELECT ...;
```

`WAL`은 변경 쿼리가 생성한 WAL 양을, `SETTINGS`는 기본값과 다른 Planner 관련 설정을 보여준다. 실무에서는 실행 시간 하나만 보지 않고 행 수 추정 오차, 읽은 블록, 정렬·해시 spill, 반복 횟수를 함께 본다.

### 통계와 데이터 편향

`ANALYZE`는 샘플을 바탕으로 distinct 수, 가장 흔한 값(MCV), histogram, NULL 비율 등을 수집한다. `status='COMPLETED'`가 99%인데 Planner가 균등 분포로 오해하면 인덱스와 Seq Scan 선택이 틀릴 수 있다.

```sql
ANALYZE orders;

ALTER TABLE orders
ALTER COLUMN customer_id SET STATISTICS 500;

CREATE STATISTICS st_orders_customer_status
    (dependencies, mcv)
ON customer_id, status
FROM orders;

ANALYZE orders;
```

통계 target을 높이면 샘플과 계획 정확도가 좋아질 수 있지만 분석 비용과 통계 저장량이 늘어난다. 확장 통계는 여러 컬럼 사이 상관관계를 Planner에 알려 준다.

## 조인은 결국 planner의 선택 문제다

조인 자체는 day2에서 배웠지만, day3에서는 왜 그 조인 방식이 선택됐는지를 본다.

대표적인 조인 방식은 다음과 같다.

- Nested Loop
- Hash Join
- Merge Join

작은 결과를 다른 테이블에 반복적으로 찔러보는 구조라면 Nested Loop가 유리할 수 있다.
큰 집합끼리 빠르게 비교하려면 Hash Join이 잘 맞을 수 있다.
정렬된 상태로 범위 비교를 이어가야 하면 Merge Join이 유리할 수 있다.

중요한 건 “어떤 조인이 최고인가”가 아니라 “현재 데이터와 조건에서 무엇이 선택됐는가”다.

## SQL 튜닝은 문법이 아니라 습관이다

튜닝은 특별한 마법이 아니다.
대부분은 쿼리가 DB에게 불필요한 일을 시키지 않도록 고치는 과정이다.

자주 보는 개선 포인트는 다음과 같다.

- 필요한 컬럼만 조회한다
- 조건을 인덱스 친화적으로 쓴다
- 불필요한 정렬을 줄인다
- 조인 전에 최대한 행 수를 줄인다
- 같은 계산을 여러 번 반복하지 않는다

예를 들어 이런 쿼리는 결과는 맞더라도 비효율적일 수 있다.

```sql
SELECT *
FROM orders
WHERE status = 'COMPLETED'
ORDER BY created_at DESC;
```

실제로 필요한 컬럼만 가져오면 전송량도 줄고, 실행 계획도 더 단순해질 수 있다.

```sql
SELECT order_id, customer_id, created_at, total_amount
FROM orders
WHERE status = 'COMPLETED'
ORDER BY created_at DESC;
```

### 통계가 틀리면 계획도 틀린다

DB는 현재 데이터 분포를 보고 계획을 세운다.
그런데 통계가 오래되면 planner가 잘못된 선택을 할 수 있다.

그래서 성능 문제가 생겼을 때는 다음도 같이 본다.

- 데이터가 최근에 많이 바뀌었는가
- 통계가 갱신되었는가
- 특정 값에 데이터가 몰려 있는가

쿼리만 바꿔서는 해결되지 않는 문제도 여기서 많이 나온다.

## 느린 쿼리를 찾는 순서

실무에서는 보통 다음 순서로 접근한다.

1. 느린 쿼리를 재현한다
2. `EXPLAIN (ANALYZE, BUFFERS)`로 실제 계획을 본다
3. 어떤 단계가 가장 비싼지 찾는다
4. 조건, 인덱스, 조인 순서, 정렬 여부를 점검한다
5. 다시 측정한다

이 과정에서 중요한 건 감으로 결론 내리지 않는 것이다.
“아마 인덱스가 문제겠지”보다 “실제로 여기서 Seq Scan이 발생한다”가 훨씬 가치 있다.

### 느린 쿼리를 수집하는 방법

PostgreSQL의 `pg_stat_statements`는 정규화된 쿼리별 호출 수와 누적 실행 시간을 모은다.

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT
    queryid,
    calls,
    ROUND(total_exec_time::NUMERIC, 2) AS total_ms,
    ROUND(mean_exec_time::NUMERIC, 2) AS mean_ms,
    rows,
    shared_blks_hit,
    shared_blks_read,
    temp_blks_written,
    LEFT(query, 300) AS sample_query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

- 누적 시간이 큰 쿼리는 작은 지연이 매우 자주 발생하는 경우를 찾는다.
- 평균 시간이 큰 쿼리는 한 번의 긴 요청을 찾는다.
- `temp_blks_written`이 크면 sort/hash가 메모리를 넘었을 가능성이 있다.
- 평균만 보면 p95·p99 tail latency를 놓치므로 APM과 로그도 함께 본다.

`log_min_duration_statement`, `auto_explain`, MySQL slow query log와 Performance Schema, SQL Server Query Store도 비슷한 역할을 한다. 민감한 SQL parameter와 개인정보가 로그에 남지 않도록 보안 정책을 함께 정한다.

### 자주 만나는 튜닝 안티패턴

| 패턴 | 왜 느릴 수 있는가 | 대안 |
|---|---|---|
| `SELECT *` | 넓은 행, 네트워크·heap I/O 증가 | 필요한 컬럼만 선택 |
| 인덱스 컬럼에 함수 | 일반 B-tree 탐색이 어려움 | 범위 조건 또는 표현식 인덱스 |
| 앞 `%` LIKE | 정렬된 prefix 사용 불가 | `pg_trgm`, 전문 검색 |
| 큰 `OFFSET` | 앞 행을 읽고 버림 | Keyset pagination |
| 다중 OR | 선택도 추정·인덱스 결합 복잡 | `UNION ALL` 비교 |
| 상관 서브쿼리 반복 | 바깥 행마다 내부 작업 | JOIN·사전 집계·LATERAL 비교 |
| 불필요한 DISTINCT | sort/hash로 중복 원인을 숨김 | JOIN cardinality 수정 |
| 암묵적 타입 변환 | 오류 또는 인덱스 조건 손실 | 같은 타입으로 비교 |

쿼리 변환은 결과 동치성을 먼저 검증하고, 동일한 데이터와 warm/cold cache 조건을 구분해 여러 번 측정한다. 한 번 빨랐다는 사실보다 블록 I/O와 실행 계획이 왜 개선됐는지 설명할 수 있어야 한다.

## 파티셔닝: 큰 테이블의 관리 단위를 나누기

파티셔닝은 한 논리 테이블을 키 규칙에 따라 여러 물리 파티션으로 나눈다.

| 방식 | 분할 기준 | 적합한 예 |
|---|---|---|
| Range | 값 구간 | 월별 주문·로그 |
| List | 명시 값 목록 | 국가·테넌트 그룹 |
| Hash | hash 나머지 | 시간 편향 없이 쓰기 분산 |

```sql
CREATE TABLE order_events (
    event_id   BIGINT GENERATED ALWAYS AS IDENTITY,
    occurred_at TIMESTAMPTZ NOT NULL,
    order_id   BIGINT NOT NULL,
    event_type TEXT NOT NULL,
    payload    JSONB
) PARTITION BY RANGE (occurred_at);

CREATE TABLE order_events_2026_07
PARTITION OF order_events
FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE order_events_2026_08
PARTITION OF order_events
FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

다음 조건은 7월 파티션만 읽도록 partition pruning할 수 있다.

```sql
SELECT event_id, order_id, event_type
FROM order_events
WHERE occurred_at >= TIMESTAMPTZ '2026-07-01 00:00:00+09'
  AND occurred_at <  TIMESTAMPTZ '2026-08-01 00:00:00+09';
```

파티션 키를 조건에서 숨기거나 함수로 감싸면 pruning이 제한될 수 있다. 파티셔닝은 모든 쿼리를 자동으로 빠르게 하지 않는다. 너무 많은 파티션은 plan time, catalog, autovacuum 작업을 늘린다.

운영 장점도 중요하다.

- 오래된 파티션을 `DROP`하거나 detach해 빠르게 보존 정책을 적용한다.
- 새 파티션을 미리 만들고 default partition을 관리한다.
- 파티션별 인덱스·VACUUM·백업 단위를 나눌 수 있다.
- 전역 유일성은 제품과 파티션 키 제약에 따라 제한될 수 있다.

MySQL, Oracle, SQL Server도 range/list/hash 계열 파티셔닝을 제공하지만 키·유일 인덱스·온라인 관리 문법이 다르다. 파티션은 샤딩과 달리 보통 하나의 DB 인스턴스 안에서 투명하게 관리된다.

## MVCC: 읽기와 쓰기를 덜 막는 행 버전 관리

MVCC(Multi-Version Concurrency Control)는 하나의 논리 행에 여러 버전을 두고 트랜잭션 스냅샷에 보이는 버전을 선택한다. 읽기가 현재 수정 중인 행의 과거 커밋 버전을 볼 수 있어 일반 SELECT와 UPDATE가 서로를 덜 막는다.

PostgreSQL 튜플에는 개념적으로 생성 트랜잭션 ID `xmin`과 삭제·대체 트랜잭션 ID `xmax`가 있다.

```text
UPDATE 전: [price=10000, xmin=Tx10, xmax=0]
UPDATE 후: [price=10000, xmin=Tx10, xmax=Tx20]
           [price=12000, xmin=Tx20, xmax=0]
```

Tx20이 커밋되기 전의 다른 스냅샷은 이전 버전을 보고, 커밋 이후 새 스냅샷은 새 버전을 볼 수 있다. PostgreSQL UPDATE는 원래 tuple을 제자리에서 덮어쓰기보다 새 tuple version을 만든다.

MySQL InnoDB는 현재 레코드와 Undo Log를 이용해 필요한 과거 버전을 재구성한다. 구현은 다르지만 스냅샷 읽기로 동시성을 높인다는 목적은 같다.

### PostgreSQL Read Committed와 Repeatable Read

```sql
-- 세션 A
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT amount FROM orders WHERE order_id = 1; -- 100

-- 세션 B
UPDATE orders SET amount = 120 WHERE order_id = 1;
COMMIT;

-- 세션 A: 새 문장이므로 새 스냅샷, 120을 볼 수 있다.
SELECT amount FROM orders WHERE order_id = 1;
COMMIT;
```

```sql
-- 세션 A
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT amount FROM orders WHERE order_id = 1; -- 100

-- 세션 B가 120으로 바꾸고 COMMIT해도
-- 세션 A는 트랜잭션 스냅샷의 100을 계속 본다.
SELECT amount FROM orders WHERE order_id = 1;
COMMIT;
```

Repeatable Read가 모든 업무 이상 현상을 없애는 것은 아니다. 서로 다른 행을 읽고 쓰는 write skew가 스냅샷 격리에서 발생할 수 있다.

```text
당직 의사 A와 B가 모두 “다른 의사가 당직 중”임을 읽음
→ A도 자신의 당직을 해제
→ B도 자신의 당직을 해제
→ 각 행 충돌은 없지만 당직자가 0명이 되는 업무 불변식 위반
```

PostgreSQL Serializable은 SSI(Serializable Snapshot Isolation)가 위험한 의존 관계를 감지해 한 트랜잭션을 `serialization_failure`로 중단한다. 애플리케이션은 전체 트랜잭션을 재시도해야 한다.

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
-- read/write business transaction
COMMIT;
-- SQLSTATE 40001이면 짧은 backoff 후 전체 단위를 재시도
```

| DBMS | 일반 기본값 | 구현상 특징 |
|---|---|---|
| PostgreSQL | Read Committed | MVCC, RR은 snapshot isolation 성격, Serializable SSI |
| MySQL InnoDB | Repeatable Read | consistent read, next-key/gap lock |
| Oracle | Read Committed | statement-level read consistency |
| SQL Server | Read Committed | 기본 잠금 기반, snapshot 옵션 제공 |

격리 수준 이름이 같아도 실제 잠금과 스냅샷 의미가 같다고 가정하면 안 된다.

## Lock은 동시성의 비용이다

데이터베이스는 여러 사용자가 동시에 접근하는 환경을 전제로 한다.
그래서 서로의 작업을 완전히 무시할 수 없고, 일정 부분은 잠금이 필요하다.

잠금이 생기는 대표적인 상황은 다음과 같다.

- 같은 행을 동시에 수정할 때
- 긴 트랜잭션이 열려 있을 때
- 외래키가 걸린 행을 건드릴 때
- 명시적으로 `FOR UPDATE`를 사용했을 때

```sql
BEGIN;

SELECT balance
FROM accounts
WHERE account_id = 1
FOR UPDATE;

UPDATE accounts
SET balance = balance - 100
WHERE account_id = 1;

COMMIT;
```

이렇게 하면 다른 트랜잭션이 같은 행을 동시에 바꾸는 일을 막을 수 있다.
대신 너무 오래 잡고 있으면 다른 작업이 기다리게 된다.

### Dead Lock은 서로를 기다리는 교착 상태다

Dead Lock은 두 트랜잭션이 서로 상대가 가진 자원을 기다리는 상태다.

예를 들어 이런 흐름이 생길 수 있다.

- 트랜잭션 A가 고객 1의 행을 잡고 고객 2를 기다린다
- 트랜잭션 B가 고객 2의 행을 잡고 고객 1을 기다린다

이런 경우에는 누구도 끝나지 못한다.
DBMS는 보통 이 상황을 감지하면 하나의 트랜잭션을 취소해서 교착을 푼다.

### 교착을 줄이는 방법

- 항상 같은 순서로 자원을 잡는다
- 트랜잭션을 짧게 유지한다
- 불필요한 대기 중 작업을 트랜잭션 밖으로 뺀다
- 잠그는 행의 수를 줄인다

Lock은 나쁜 것이 아니라, 동시성을 지키기 위해 필요한 장치다.
문제는 잠금이 길어질 때 발생한다.

### PostgreSQL의 잠금 범위

PostgreSQL은 행 잠금뿐 아니라 테이블, transaction ID, advisory lock 등 여러 잠금 대상을 관리한다. 일반 SELECT는 테이블에 `ACCESS SHARE`, UPDATE·DELETE는 `ROW EXCLUSIVE`, `ALTER TABLE` 같은 강한 DDL은 `ACCESS EXCLUSIVE` 계열 잠금을 얻는다. 이름만 보고 “ROW EXCLUSIVE는 행만 잠근다”라고 이해하면 안 된다. 이는 테이블 수준 lock mode 이름이며 실제 수정 행에는 tuple/transaction 수준 충돌도 발생한다.

```sql
-- 비관적 행 잠금
SELECT *
FROM orders
WHERE order_id = 1001
FOR UPDATE;

-- FK 참조 키 변경은 막되 일반적인 일부 갱신은 더 허용
SELECT *
FROM products
WHERE product_id = 10
FOR NO KEY UPDATE;

-- 읽은 키가 변경·삭제되지 않도록 공유 잠금
SELECT *
FROM products
WHERE product_id = 10
FOR KEY SHARE;
```

### 낙관적 잠금

잠금을 미리 잡지 않고 버전이 그대로일 때만 수정한다.

```sql
UPDATE products
SET stock = stock - 1,
    version = version + 1
WHERE product_id = 10
  AND version = :version_read_before
  AND stock > 0;
```

영향 행 수가 0이면 재조회 후 다시 판단한다. 충돌이 드물고 짧은 요청에 유리하지만, 재시도와 사용자 충돌 메시지가 필요하다.

### SKIP LOCKED 작업 큐

```sql
WITH picked AS (
    SELECT job_id
    FROM jobs
    WHERE status = 'READY'
    ORDER BY priority DESC, created_at, job_id
    FOR UPDATE SKIP LOCKED
    LIMIT 10
)
UPDATE jobs AS j
SET status = 'PROCESSING',
    worker_id = :worker_id,
    started_at = now()
FROM picked
WHERE j.job_id = picked.job_id
RETURNING j.*;
```

선택과 상태 변경을 한 SQL로 묶어 여러 worker가 같은 일을 가져가는 경쟁 조건을 줄인다. `SKIP LOCKED`는 전체적으로 공정한 순서를 보장하지 않으며, 오래 잠긴 행이 계속 건너뛰어질 수 있으므로 timeout과 재수집 정책이 필요하다.

### Advisory Lock

DB 행으로 직접 표현하기 어려운 “고객별 정산 한 번만 실행” 같은 애플리케이션 자원에 advisory lock을 사용할 수 있다.

```sql
BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('settlement:2026-07', 0));

-- 같은 키의 정산 작업은 트랜잭션 종료까지 직렬화
CALL run_monthly_settlement(DATE '2026-07-01');

COMMIT;
```

advisory lock은 DB가 무결성을 자동 연결해 주지 않으므로 모든 코드 경로가 같은 키 규칙을 지켜야 한다. 세션 수준과 트랜잭션 수준 함수의 해제 시점도 구분한다.

### 대기 세션과 blocking query 찾기

```sql
SELECT
    blocked.pid AS blocked_pid,
    blocked.query AS blocked_query,
    blocker.pid AS blocker_pid,
    blocker.query AS blocker_query,
    now() - blocker.xact_start AS blocker_xact_age
FROM pg_stat_activity AS blocked
JOIN pg_locks AS bl
  ON bl.pid = blocked.pid
 AND NOT bl.granted
JOIN pg_locks AS kl
  ON kl.locktype = bl.locktype
 AND kl.database IS NOT DISTINCT FROM bl.database
 AND kl.relation IS NOT DISTINCT FROM bl.relation
 AND kl.page IS NOT DISTINCT FROM bl.page
 AND kl.tuple IS NOT DISTINCT FROM bl.tuple
 AND kl.transactionid IS NOT DISTINCT FROM bl.transactionid
 AND kl.classid IS NOT DISTINCT FROM bl.classid
 AND kl.objid IS NOT DISTINCT FROM bl.objid
 AND kl.objsubid IS NOT DISTINCT FROM bl.objsubid
 AND kl.granted
JOIN pg_stat_activity AS blocker
  ON blocker.pid = kl.pid;
```

실무에서는 `pg_blocking_pids(blocked.pid)`를 이용해 더 간결하게 blocker를 찾을 수도 있다. 연결을 강제 종료하기 전에 장기 트랜잭션의 업무 중요도, 롤백 비용, 애플리케이션 재시도를 확인한다.

### 교착상태를 전제로 한 재시도

자원 획득 순서를 `ORDER BY id`로 통일하고 트랜잭션을 짧게 해도 교착을 완전히 없애기는 어렵다. PostgreSQL은 한 트랜잭션을 `deadlock_detected`(SQLSTATE `40P01`)로 취소한다. 애플리케이션은 같은 트랜잭션 전체를 제한된 횟수로 재시도하고, 즉시 몰리지 않도록 지수 backoff와 jitter를 둔다. 부분 SQL만 재시도하면 앞선 판단과 상태가 어긋날 수 있다.

## 고급 설계는 정규화와 성능 사이의 균형이다

1일차에서는 정규화가 중복을 줄이고 이상현상을 막아준다는 것을 봤다.
3일차에서는 여기에 성능과 운영을 함께 본다.

실무에서는 다음 같은 선택이 등장한다.

- 자주 읽는 요약 값은 별도 집계 테이블로 둔다
- 큰 이력 테이블은 날짜 기준으로 나눈다
- 반복 조회가 많은 결과는 materialized view로 저장한다
- 분석용 조회와 거래용 조회를 분리한다

모든 것을 한 테이블에 우겨 넣는 것도, 무조건 분해하는 것도 답은 아니다.
핵심은 조회 패턴과 데이터 증가 속도를 함께 보는 것이다.

### BCNF, 4NF, 5NF

3NF는 후보키가 아닌 속성의 이행 종속을 제거한다. BCNF는 더 엄격하게 **모든 비자명한 함수 종속 `X → Y`에서 X가 super key**일 것을 요구한다.

예를 들어 한 과목에 여러 교수가 있을 수 있고, 각 교수는 한 과목만 담당하며 학생은 교수에게 수강 신청한다고 가정한다.

```text
enrollment(student, course, professor)
함수 종속:
(student, course) → professor
professor → course
```

후보키는 `(student, course)`와 `(student, professor)`가 될 수 있다. `professor → course`에서 professor는 super key가 아니므로 BCNF를 위반한다. 다음처럼 분해할 수 있다.

```text
professor_course(professor, course)
student_professor(student, professor)
```

4NF는 한 엔티티에 서로 독립적인 다중값이 함께 저장되어 생기는 조합 중복을 분리한다. 직원의 기술 목록과 사용 언어 목록이 서로 독립이라면 `employee_skill`과 `employee_language`로 나눈다. 5NF는 세 개 이상의 관계를 다시 JOIN할 때만 표현되는 join dependency를 다룬다. 실제 OLTP에서는 고차 정규형보다 업무 의미·무손실 분해를 먼저 검증한다.

### 반정규화

반정규화는 성능을 이유로 의도적으로 중복이나 파생값을 저장하는 설계다.

```sql
ALTER TABLE orders
ADD COLUMN total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;
```

주문 총액을 매번 `order_items`에서 합산하지 않아도 되지만, 항목 변경과 `orders.total_amount` 갱신을 하나의 트랜잭션에서 보장해야 한다. 반정규화 전에는 다음을 문서화한다.

- 느린 쿼리와 빈도를 측정했는가?
- 어떤 값이 source of truth인가?
- 동기 갱신, trigger, 비동기 CDC 중 누가 중복값을 갱신하는가?
- 실패 시 재계산·정합성 검사 방법이 있는가?
- Materialized View나 캐시로 더 안전하게 해결할 수 없는가?

### SCD: 차원 이력 관리

분석 시스템의 Slowly Changing Dimension은 고객 등급·주소 같은 차원 속성 변화를 보존하는 패턴이다.

| 유형 | 방식 | 특성 |
|---|---|---|
| Type 1 | 기존 값을 덮어씀 | 현재값만 필요, 이력 없음 |
| Type 2 | 새 행과 유효 기간 생성 | 완전한 시점 이력 |
| Type 3 | 이전값 컬럼 보관 | 제한된 한 단계 이력 |

```sql
CREATE TABLE dim_customer (
    customer_sk  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  BIGINT NOT NULL,
    grade        TEXT NOT NULL,
    valid_from   DATE NOT NULL,
    valid_to     DATE NOT NULL DEFAULT DATE '9999-12-31',
    is_current   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (customer_id, valid_from)
);

CREATE UNIQUE INDEX uq_dim_customer_current
ON dim_customer (customer_id)
WHERE is_current;
```

Type 2 변경 시 기존 current 행의 `valid_to`와 `is_current`를 닫고 새 surrogate key 행을 삽입한다. fact가 당시의 `customer_sk`를 참조하면 과거 보고서가 현재 등급으로 왜곡되지 않는다.

### 샤딩

샤딩은 데이터를 여러 DB 노드로 수평 분산한다.

| 전략 | 장점 | 단점 |
|---|---|---|
| Range | 범위 조회·지역 배치가 쉬움 | hot shard, 재분배 |
| Hash | 쓰기와 데이터가 비교적 균등 | 범위 조회·확장 시 이동 |
| Directory | 임의 배치와 이동 유연 | 라우팅 메타데이터 의존 |

좋은 shard key는 높은 카디널리티와 균등 분포를 가지며, 대부분의 쿼리·트랜잭션을 한 shard에 가둔다. 고객별 서비스라면 `tenant_id`가 후보지만 대형 tenant가 하나의 hot shard를 만들 수 있다. cross-shard JOIN, 전역 unique, 분산 트랜잭션, 재샤딩과 장애 복구 비용이 커지므로 단일 노드·read replica·partitioning 한계를 측정한 뒤 도입한다.

### CDC와 MSA 데이터 패턴

CDC(Change Data Capture)는 WAL/binlog 같은 변경 로그에서 insert·update·delete 이벤트를 읽어 검색 인덱스, 분석 플랫폼, 다른 서비스로 전달한다. 테이블을 주기적으로 전체 조회하는 방식보다 원본 DB 부하와 지연을 줄일 수 있지만 schema evolution, 순서, 중복 전달을 처리해야 한다.

MSA에서 서비스마다 DB를 소유하면 하나의 ACID 트랜잭션으로 전체 업무를 묶기 어렵다.

- **Saga**는 로컬 트랜잭션들과 실패 시 보상 동작을 연결한다. 보상은 과거를 지우는 rollback이 아니라 취소라는 새 업무 행위다.
- **CQRS**는 쓰기 모델과 읽기 모델을 분리해 각각 최적화한다. 읽기 모델은 보통 eventual consistency를 가진다.
- **Outbox**는 업무 변경과 발행할 이벤트를 같은 로컬 트랜잭션에 저장하고 별도 relay가 이벤트를 전송한다.

```sql
BEGIN;

INSERT INTO orders (customer_id, status, amount)
VALUES (42, 'CREATED', 120000)
RETURNING order_id;

INSERT INTO outbox_events (
    aggregate_type,
    aggregate_id,
    event_type,
    payload
)
VALUES (
    'Order',
    :order_id,
    'OrderCreated',
    jsonb_build_object('orderId', :order_id, 'amount', 120000)
);

COMMIT;
```

메시지 전송과 DB commit 사이의 dual-write 문제를 피한다. relay가 같은 이벤트를 다시 보낼 수 있으므로 consumer는 event ID를 기준으로 멱등 처리해야 한다.

## 실습하면서 확인한 감각

이번 날의 실습은 단순히 인덱스를 만드는 연습이 아니라, **왜 이 인덱스가 필요한지 설명할 수 있는지**를 확인하는 시간이었다.

예를 들어 아래 같은 질문에 답해보면 좋다.

- 어떤 조건이 가장 자주 쓰이는가?
- 어느 부분에서 행 수가 급격히 늘어나는가?
- 조인 전에 먼저 줄일 수 있는 데이터는 없는가?
- 계획이 기대와 다르면 이유가 무엇인가?

이 질문에 답할 수 있으면 쿼리를 보는 눈이 한 단계 올라간다.

## 자주 헷갈리는 지점

| 질문 | 기억할 점 |
|---|---|
| 인덱스가 많을수록 좋은가? | 아니다. 읽기에는 도움 되지만 쓰기와 저장 공간에 비용이 든다 |
| `EXPLAIN`은 실제 실행 시간인가? | 아니다. 계획을 보여주는 도구이고 `ANALYZE`를 함께 봐야 한다 |
| 쿼리가 빠르면 항상 좋은 설계인가? | 아니다. 적은 데이터에서는 빨라도 규모가 커지면 달라질 수 있다 |
| Lock과 Dead Lock은 같은가? | 아니다. Lock은 정상적인 대기이고 Dead Lock은 서로가 서로를 기다리는 교착이다 |
| 통계가 왜 중요한가? | planner가 현재 데이터 분포를 보고 계획을 세우기 때문이다 |

## 인덱스 설계에서 더 보는 요소

인덱스는 “있다/없다”보다 “어떤 패턴을 빠르게 할 것인가”가 더 중요하다.
설계할 때 함께 보는 요소는 다음과 같다.

| 요소 | 생각할 질문 |
|---|---|
| 선택도(selectivity) | 이 컬럼이 얼마나 잘 걸러주는가? |
| 복합 인덱스 순서 | 앞 컬럼이 자주 고정되는가? |
| 부분 인덱스(partial index) | 전체가 아니라 특정 조건에만 쓰이는가? |
| 커버링 여부 | 필요한 조회 열을 인덱스만으로 대부분 해결할 수 있는가? |
| 유지 비용 | 쓰기 성능과 저장 공간을 감당할 수 있는가? |

복합 인덱스는 보통 앞쪽 컬럼의 조건을 먼저 타기 때문에, 자주 고정되는 조건을 앞에 두는 편이 유리하다.
반대로 거의 모든 쿼리에서 쓰이지 않는 컬럼까지 무작정 묶으면 인덱스만 커지고 효용은 떨어진다.

## PostgreSQL에서 자주 보이는 인덱스 종류

이번 과정에서는 B-tree 인덱스가 가장 중요하지만, PostgreSQL에는 다른 선택지도 있다.

| 종류 | 떠올리면 좋은 상황 |
|---|---|
| B-tree | 동등 비교, 범위 검색, 정렬 |
| Hash | 동등 비교 중심의 특수한 경우 |
| GIN | 배열, JSON, 전문 검색처럼 여러 키를 한 번에 다뤄야 할 때 |
| GiST | 거리, 범위, 일부 공간 데이터처럼 확장성이 필요할 때 |
| BRIN | 매우 큰 순차형 테이블에서 범위가 자연스럽게 묶일 때 |

모든 인덱스를 외울 필요는 없지만, “기본은 B-tree이고 나머지는 특수 목적에 가깝다”는 감각은 도움이 된다.

## 실행 계획에서 자주 보는 노드

실행 계획은 텍스트 덩어리처럼 보이지만, 자주 반복해서 보는 노드만 익히면 읽는 속도가 빨라진다.

| 노드 | 의미 |
|---|---|
| `Seq Scan` | 테이블을 순차적으로 훑는다 |
| `Index Scan` | 인덱스를 따라 필요한 행을 찾는다 |
| `Bitmap Heap Scan` | 여러 인덱스 조건을 묶어 효율적으로 찾는다 |
| `Sort` | 정렬 비용이 들어간다 |
| `Aggregate` | 집계가 수행된다 |
| `Nested Loop` | 바깥 행마다 안쪽을 반복 탐색한다 |
| `Hash Join` | 해시 테이블을 만들어 비교한다 |
| `Merge Join` | 정렬된 입력을 병합한다 |

`Seq Scan`이 보였다고 무조건 나쁜 것은 아니다.
데이터가 적거나, 조건이 너무 느슨하거나, 전체를 읽는 편이 더 저렴할 수도 있다. 중요한 것은 “왜 이 노드가 선택됐는가”다.

## Lock을 피하는 것보다 잘 다루는 것이 중요하다

잠금은 동시성 문제를 해결하기 위해 필요하지만, 오래 잡고 있으면 병목이 된다.
자주 쓰는 패턴은 다음과 같다.

```sql
SELECT order_id
FROM orders
WHERE status = 'PENDING'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

이 패턴은 작업 큐처럼 “아직 처리되지 않은 일”을 여러 워커가 나눠 가져갈 때 유용하다.
`SKIP LOCKED`를 쓰면 이미 누군가 잡고 있는 행은 건너뛰고 다음 행으로 넘어갈 수 있다.

반대로 정말 충돌이 나면 빨리 실패하도록 `NOWAIT`를 쓰는 경우도 있다.

```sql
SELECT *
FROM orders
WHERE order_id = 1001
FOR UPDATE NOWAIT;
```

이렇게 하면 오래 기다리지 않고 즉시 에러를 받아서 다른 처리로 넘길 수 있다.

## 트랜잭션 격리 수준은 대기와 일관성의 균형이다

모든 동시성 문제를 락 하나로만 설명할 수는 없다. 트랜잭션 격리 수준도 함께 본다.

| 격리 수준 | 감각적으로 이해하면 |
|---|---|
| `READ COMMITTED` | 가장 흔한 기본값, 커밋된 내용만 본다 |
| `REPEATABLE READ` | 한 트랜잭션 안에서 같은 조회는 더 안정적으로 보인다 |
| `SERIALIZABLE` | 가장 강한 수준, 충돌을 더 엄격하게 막는다 |

격리 수준이 강해질수록 일관성은 좋아지지만, 대기나 재시도 비용이 늘 수 있다.
그래서 “무조건 강하게”가 아니라 업무 요구에 맞는 수준을 선택해야 한다.

## PostgreSQL에서는 VACUUM과 ANALYZE도 성능 관리의 일부다

PostgreSQL은 MVCC 방식 때문에 오래된 행 정보와 통계 관리가 중요하다.

- `ANALYZE`는 planner가 참고할 통계를 갱신한다
- `VACUUM`은 오래된 행 흔적을 정리하고 공간 재사용을 돕는다

실무에서 성능이 갑자기 흔들릴 때는 쿼리만 보기보다, 통계와 테이블 상태도 함께 보는 습관이 필요하다.

MVCC에서 이전 행 버전은 오래된 스냅샷이 더 이상 필요로 하지 않을 때 dead tuple이 된다. 일반 `VACUUM`은 공간을 테이블 내부에서 재사용 가능하게 하고 visibility map을 갱신하지만, 보통 OS에 파일 크기를 즉시 반환하지 않는다. `VACUUM FULL`은 테이블을 재작성해 파일을 줄이지만 강한 잠금을 잡으므로 운영 중 무심코 실행하면 안 된다.

```sql
SELECT
    relname,
    n_live_tup,
    n_dead_tup,
    last_autovacuum,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

긴 트랜잭션과 `idle in transaction` 세션은 오래된 tuple 제거를 막아 table/index bloat와 transaction ID wraparound 위험을 키울 수 있다.

```sql
SELECT
    pid,
    usename,
    state,
    now() - xact_start AS transaction_age,
    wait_event_type,
    wait_event,
    LEFT(query, 200) AS query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
```

autovacuum threshold와 scale factor는 테이블 크기·변경률별로 조정할 수 있다. 변경이 매우 잦은 큰 테이블은 기본 scale factor 때문에 vacuum 시작이 늦을 수 있다.

## 연결 풀과 pgBouncer

PostgreSQL의 server connection은 backend process와 메모리를 사용한다. 애플리케이션 인스턴스가 늘어 각자 수백 connection을 만들면 쿼리보다 context switching과 메모리가 병목이 될 수 있다.

pgBouncer는 클라이언트 connection과 PostgreSQL server connection 사이를 multiplexing한다.

| 모드 | server connection 반환 시점 | 주의점 |
|---|---|---|
| session | client 연결 종료 | 호환성 높지만 multiplexing 효과가 작음 |
| transaction | 트랜잭션 종료 | 일반 웹 요청에 유용, session state 제한 |
| statement | 문장 종료 | 다중 문장 트랜잭션과 호환되지 않아 제한적 |

transaction pooling에서는 임시 테이블, session-level advisory lock, 세션별 `SET`, 일부 prepared statement 사용이 기대와 다를 수 있다. 애플리케이션 pool 크기 × 인스턴스 수와 DB의 실제 동시 처리 능력을 함께 산정한다.

## 백업과 복구 미리 보기

```bash
pg_dump -Fc -d skala_db -f skala_db.dump
pg_restore --clean --if-exists -d restored_db skala_db.dump
```

`pg_dump`는 논리 백업으로 버전 이동과 객체 단위 복원에 편리하지만 대규모 DB 전체 복구는 느릴 수 있다. `pg_basebackup` 같은 물리 base backup과 연속 WAL archive를 결합하면 특정 시점 복구(PITR)가 가능하다. 백업 성공 로그만으로는 충분하지 않으며 별도 환경에서 실제 restore 시간과 데이터 검증을 반복해야 한다.

## 운영 모니터링 쿼리

```sql
-- 현재 세션과 wait
SELECT state, wait_event_type, wait_event, COUNT(*)
FROM pg_stat_activity
GROUP BY state, wait_event_type, wait_event
ORDER BY COUNT(*) DESC;

-- DB 캐시 적중률의 한 관점
SELECT
    datname,
    blks_hit,
    blks_read,
    ROUND(
        100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0),
        2
    ) AS hit_ratio
FROM pg_stat_database;

-- 큰 테이블·인덱스
SELECT
    relname,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

캐시 적중률 하나로 성능을 판단해서는 안 된다. TPS/QPS, p50/p95/p99 latency, CPU, IOPS, WAL 생성량, checkpoint, connection, lock wait, replication lag, bloat를 서비스 SLO와 함께 본다.

## 성능 최적화의 네 단계

1. **관찰**: 사용자 지연과 DB 지표, slow query를 함께 수집한다.
2. **분해**: 실행 계획에서 스캔·조인·정렬·잠금 중 병목을 찾는다.
3. **개선**: SQL, 인덱스, 통계, 모델, 설정 가운데 가장 작은 안전한 변경을 선택한다.
4. **검증**: 같은 조건에서 실행 계획과 latency를 재측정하고 쓰기·저장 공간 부작용을 확인한다.

DB 설정을 먼저 크게 바꾸기보다 쿼리와 데이터 모델, 행 수 추정 오차를 먼저 확인한다. `work_mem` 같은 설정은 연산 노드와 동시 세션마다 여러 번 할당될 수 있어 전역으로 과도하게 올리면 메모리 고갈을 만들 수 있다.

## 느린 쿼리 점검 체크리스트

- 조건절이 인덱스를 잘 타는가
- 불필요한 `SELECT *`가 없는가
- 조인 전에 줄일 수 있는 행을 줄였는가
- `ORDER BY`가 꼭 필요한가
- 통계가 오래되지 않았는가
- 동일한 쿼리를 실데이터 규모로 확인했는가

## 종합 실습: HR DB 느린 쿼리 최적화

교재 실습은 HR 데이터의 느린 쿼리를 추측이 아니라 Before/After 증거로 개선하는 흐름이다.

```sql
-- 1. 확장과 통계를 준비한다.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
ANALYZE;

-- 2. 대상 쿼리의 실제 계획을 저장한다.
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)
SELECT
    e.employee_id,
    e.first_name,
    e.last_name,
    d.department_name,
    j.job_title
FROM employees AS e
JOIN departments AS d
  ON d.department_id = e.department_id
JOIN jobs AS j
  ON j.job_id = e.job_id
WHERE e.department_id = 50
ORDER BY e.hire_date DESC
LIMIT 20;
```

필터·JOIN·정렬 패턴에 맞는 후보 인덱스를 세운다.

```sql
CREATE INDEX idx_employees_department_hired
ON employees (department_id, hire_date DESC)
INCLUDE (employee_id, first_name, last_name, job_id);

ANALYZE employees;
```

같은 `EXPLAIN (ANALYZE, BUFFERS)`를 다시 실행해 다음을 비교한다.

- 총 실행 시간뿐 아니라 읽은 블록 수가 줄었는가?
- `Seq Scan + Sort`가 적절한 Index Scan으로 바뀌었는가?
- 추정 rows와 actual rows의 차이가 줄었는가?
- 새 인덱스 크기와 INSERT·UPDATE 비용을 감당할 수 있는가?
- 다른 중요한 쿼리의 계획이 나빠지지 않았는가?

실습 보고서에는 원본 SQL, Before 계획, 원인 가설, 변경 DDL·SQL, After 계획, 수치 비교, 부작용과 롤백 방법을 함께 기록한다. 성능 튜닝은 “더 빠른 문법”을 찾는 일이 아니라 **DB가 어떤 방식으로 답을 만들었는지 관찰하고, 더 적은 작업으로 같은 결과를 내도록 유도하는 일**이다.

---

이전 글: [2일차 — JOIN부터 Window Function까지](/posts/skala-smart-data-day2/)

시리즈 안내: [스마트 데이터 이해 및 활용 — 4일 학습 로드맵](/posts/skala-smart-data-roadmap/)

다음 글: [4일차 — Stored Procedure부터 Cloud DB 운영까지](/posts/skala-smart-data-day4/)
