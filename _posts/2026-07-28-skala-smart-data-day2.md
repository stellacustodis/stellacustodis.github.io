---
title: "[SKALA] 스마트 데이터 이해 및 활용 2일차 — JOIN부터 Window Function까지"
date: 2026-07-28 09:00:00 +0900
categories:
  - SKALA
  - Database
tags: [skala, database, sql, join, subquery, cte, view, window-function, postgresql, recursive-cte]
description: "집계와 ROLLUP·CUBE, JOIN과 실행 알고리즘, 서브쿼리, 재귀 CTE, View, 고급 Window Function, LATERAL·UPSERT까지 예제로 정리한다."
permalink: /posts/skala-smart-data-day2/
---

1일차에는 현실의 요구사항을 테이블과 관계로 표현했다. 2일차에는 나누어 저장한 데이터를 다시 연결해 **업무에서 필요한 정보로 만드는 방법**을 배운다.

단순히 문법을 나열하기보다 1일차에 만든 쇼핑몰 모델을 계속 사용해 고객별 구매액, 미주문 고객, 최근 주문, 누적 매출, 카테고리별 상위 상품 같은 질문을 해결한다. 이어서 교재의 심화 범위인 재귀 CTE, `LATERAL`, UPSERT, 고급 Window Function과 실무 SQL 패턴까지 함께 살펴본다.

```text
customers 1 ─────< orders 1 ─────< order_items >───── 1 products
```

2일차 예제에서는 카테고리별 집계와 `NULL` 처리도 연습할 수 있도록 1일차 모델에 선택 속성 두 개를 추가한다.

```sql
ALTER TABLE customers
ADD COLUMN phone VARCHAR(20);

ALTER TABLE products
ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'UNCATEGORIZED';
```

## DBMS, Data Warehouse, Data Mining의 역할

세 용어는 같은 계층이 아니다.

| 개념 | 중심 역할 | 대표 질문 |
|---|---|---|
| DBMS | 데이터를 저장·조회하고 트랜잭션과 권한을 관리 | 주문을 안전하게 생성했는가? |
| Data Warehouse | 여러 원천의 이력을 분석하기 좋은 형태로 통합 | 분기별 지역 매출 추세는? |
| Data Mining | 통계·ML로 패턴과 예측을 발견 | 이탈 가능성이 높은 고객은? |

운영 DB에서 분석 SQL을 실행할 수도 있지만 큰 스캔이 거래 요청과 자원을 경쟁한다. 규모가 커지면 CDC·ETL/ELT로 warehouse에 복제하고, 정제된 분석 데이터 위에서 mining·ML을 수행한다.

## SQL의 논리적 실행 순서

SQL은 작성 순서와 논리적으로 처리되는 순서가 다르다.

```sql
SELECT   c.customer_id, c.name, SUM(oi.quantity * oi.unit_price) AS total_amount
FROM     customers AS c
JOIN     orders AS o USING (customer_id)
JOIN     order_items AS oi USING (order_id)
WHERE    o.status = 'COMPLETED'
GROUP BY c.customer_id, c.name
HAVING   SUM(oi.quantity * oi.unit_price) >= 100000
ORDER BY total_amount DESC
LIMIT    10;
```

위 쿼리의 논리적 처리 순서는 다음과 같다.

```text
FROM / JOIN
  → WHERE
  → GROUP BY
  → HAVING
  → SELECT
  → ORDER BY
  → LIMIT
```

이 순서를 알면 `WHERE`에서 `SELECT`의 별칭을 사용할 수 없는 이유나 `WHERE`와 `HAVING`의 차이를 이해하기 쉽다. 다만 이것은 결과를 이해하기 위한 **논리적 순서**이며, DBMS는 같은 결과를 더 효율적으로 만들기 위해 실제 실행 순서를 바꿀 수 있다.

## 집계와 그룹화

집계 함수는 여러 행을 하나의 값으로 요약한다.

| 함수 | 의미 |
|---|---|
| `COUNT` | 행 또는 값의 개수 |
| `SUM` | 합계 |
| `AVG` | 평균 |
| `MIN` | 최솟값 |
| `MAX` | 최댓값 |

전체 완료 주문 수와 최근 주문 시각은 다음처럼 구할 수 있다.

```sql
SELECT
    COUNT(*)        AS order_count,
    MAX(ordered_at) AS latest_ordered_at
FROM orders
WHERE status = 'COMPLETED';
```

### GROUP BY

`GROUP BY`는 지정한 열의 값이 같은 행을 하나의 그룹으로 묶는다.

```sql
SELECT
    status,
    COUNT(*) AS order_count
FROM orders
GROUP BY status
ORDER BY order_count DESC;
```

집계 쿼리의 `SELECT`에는 일반적으로 다음 두 종류만 올 수 있다.

- `GROUP BY`에 포함된 열
- `SUM`, `COUNT` 같은 집계 함수의 결과

고객별 구매액을 계산하려면 주문 항목의 수량과 주문 당시 단가를 곱한 뒤 고객별로 합한다.

```sql
SELECT
    o.customer_id,
    COUNT(DISTINCT o.order_id)        AS order_count,
    SUM(oi.quantity * oi.unit_price)  AS total_amount
FROM orders AS o
JOIN order_items AS oi
  ON oi.order_id = o.order_id
WHERE o.status = 'COMPLETED'
GROUP BY o.customer_id;
```

`orders`와 `order_items`를 JOIN하면 주문 하나가 상품 종류 수만큼 여러 행으로 늘어난다. 그래서 주문 수는 `COUNT(*)`가 아니라 `COUNT(DISTINCT o.order_id)`로 세었다. **집계 전 데이터가 어느 단위의 한 행인지** 확인하는 것이 중요하다.

### WHERE와 HAVING

`WHERE`는 그룹을 만들기 전의 행을 필터링하고, `HAVING`은 집계된 그룹을 필터링한다.

```sql
SELECT
    o.customer_id,
    SUM(oi.quantity * oi.unit_price) AS total_amount
FROM orders AS o
JOIN order_items AS oi
  ON oi.order_id = o.order_id
WHERE o.status = 'COMPLETED'
GROUP BY o.customer_id
HAVING SUM(oi.quantity * oi.unit_price) >= 100000;
```

가능한 조건을 `WHERE`에서 먼저 줄이면 불필요한 행이 집계에 참여하지 않는다. 그룹 결과에 대한 조건만 `HAVING`에 둔다.

### NULL과 COUNT

`COUNT(*)`는 행을 세지만 `COUNT(column)`은 해당 열이 `NULL`이 아닌 행만 센다.

```sql
SELECT
    COUNT(*)          AS all_customers,
    COUNT(phone)      AS customers_with_phone
FROM customers;
```

`SUM`, `AVG`, `MIN`, `MAX`도 일반적으로 `NULL`을 제외하고 계산한다. 모든 입력이 `NULL`이거나 입력 행 자체가 없으면 `SUM`이 `NULL`을 반환할 수 있으므로, 필요한 경우 `COALESCE`로 기본값을 정한다.

```sql
SELECT COALESCE(SUM(quantity * unit_price), 0) AS total_amount
FROM order_items
WHERE order_id = 999999;
```

### 조건부 집계와 FILTER

조건에 따라 여러 지표를 한 번의 스캔으로 계산할 수 있다.

```sql
SELECT
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_orders,
    COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled_orders,
    SUM(
        CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END
    ) AS completed_orders_portable
FROM orders;
```

`FILTER`는 PostgreSQL에서 조건과 집계의 관계를 명확하게 표현한다. 다른 DBMS와의 이식성이 중요하면 `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` 패턴을 사용할 수 있다.

### ROLLUP, CUBE, GROUPING SETS

`GROUP BY`가 지정한 한 가지 차원의 집계를 만든다면, `ROLLUP`과 `CUBE`는 상세·소계·총계를 한 번에 만든다.

```sql
CREATE TABLE sales_summary (
    region  TEXT,
    product TEXT,
    amount  NUMERIC(12, 2)
);

INSERT INTO sales_summary VALUES
    ('East', 'A', 100),
    ('East', 'B', 150),
    ('West', 'A', 200),
    ('West', 'B',  50);

SELECT
    CASE
        WHEN GROUPING(region) = 1 THEN '전체 지역'
        ELSE region
    END AS region,
    CASE
        WHEN GROUPING(product) = 1 THEN '소계'
        ELSE product
    END AS product,
    SUM(amount) AS total
FROM sales_summary
GROUP BY ROLLUP (region, product)
ORDER BY GROUPING(region), region, GROUPING(product), product;
```

`ROLLUP(region, product)`는 `(region, product)`, `(region)`, `()` 순의 계층적 집계를 만든다. 결과의 `NULL`이 실제 데이터의 `NULL`인지 총계 표시인지 구분할 때 `GROUPING()`을 쓴다.

```sql
-- 모든 차원 조합: 지역×상품, 지역별, 상품별, 전체
SELECT region, product, SUM(amount)
FROM sales_summary
GROUP BY CUBE (region, product);

-- 필요한 집합만 명시
SELECT region, product, SUM(amount)
FROM sales_summary
GROUP BY GROUPING SETS (
    (region, product),
    (region),
    ()
);
```

`CUBE`는 n개 차원에서 최대 `2^n`개의 그룹 조합을 만들기 때문에 차원이 늘면 결과와 연산량이 급증한다. 필요한 집계 조합이 정해져 있다면 `GROUPING SETS`가 더 정확하다.

## JOIN: 나누어 둔 데이터를 연결하기

JOIN은 두 테이블의 행을 조건에 따라 결합한다. 보통 PK와 FK를 사용하지만, SQL 문법상 임의의 조건으로도 연결할 수 있다.

### INNER JOIN

양쪽에서 조건이 일치하는 행만 반환한다.

```sql
SELECT
    o.order_id,
    c.name,
    o.ordered_at
FROM orders AS o
INNER JOIN customers AS c
  ON c.customer_id = o.customer_id;
```

`INNER`는 생략할 수 있으므로 실무에서는 보통 `JOIN`이라고 쓴다.

### LEFT JOIN

왼쪽 테이블의 모든 행을 유지하고, 오른쪽에서 일치하는 행이 없으면 오른쪽 열을 `NULL`로 채운다.

```sql
SELECT
    c.customer_id,
    c.name,
    COUNT(o.order_id) AS order_count
FROM customers AS c
LEFT JOIN orders AS o
  ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.name;
```

주문이 없는 고객도 결과에 남는다. 이때 `COUNT(*)`를 사용하면 주문이 없는 고객도 LEFT JOIN 결과의 행 하나를 세어 `1`이 되므로, 오른쪽 테이블의 `NOT NULL` 열인 `o.order_id`를 세어야 한다.

주문이 한 번도 없는 고객만 찾으려면 다음처럼 작성할 수 있다.

```sql
SELECT c.customer_id, c.name
FROM customers AS c
LEFT JOIN orders AS o
  ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL;
```

### OUTER JOIN에서 ON과 WHERE의 차이

다음 두 쿼리는 비슷해 보이지만 결과가 다르다.

```sql
-- 모든 고객을 남기고, 완료 주문만 연결
SELECT c.name, o.order_id
FROM customers AS c
LEFT JOIN orders AS o
  ON  o.customer_id = c.customer_id
  AND o.status = 'COMPLETED';
```

```sql
-- JOIN 후 완료 주문이 없는 행을 제거
SELECT c.name, o.order_id
FROM customers AS c
LEFT JOIN orders AS o
  ON o.customer_id = c.customer_id
WHERE o.status = 'COMPLETED';
```

두 번째 쿼리에서는 주문이 없는 고객의 `o.status`가 `NULL`이므로 `WHERE` 조건을 통과하지 못한다. 결과적으로 INNER JOIN처럼 동작한다. 오른쪽 테이블의 조건을 `ON`과 `WHERE` 중 어디에 두는지는 문법 취향이 아니라 **결과 집합의 의미**를 바꾸는 선택이다.

### RIGHT JOIN과 FULL OUTER JOIN

`RIGHT JOIN`은 오른쪽 테이블의 모든 행을, `FULL OUTER JOIN`은 양쪽 테이블의 모든 행을 보존한다.

```sql
SELECT
    a.product_id AS old_product_id,
    b.product_id AS new_product_id
FROM old_products AS a
FULL OUTER JOIN new_products AS b
  ON b.product_id = a.product_id;
```

`RIGHT JOIN`은 테이블 순서를 바꾼 `LEFT JOIN`으로 표현할 수 있어 상대적으로 덜 사용된다. `FULL OUTER JOIN`은 두 데이터셋의 누락 항목을 양쪽 모두 확인할 때 유용하다.

### CROSS JOIN과 SELF JOIN

`CROSS JOIN`은 양쪽 행의 모든 조합을 만든다. 색상 3개와 크기 4개를 연결하면 12행이 나온다.

```sql
SELECT c.color, s.size
FROM colors AS c
CROSS JOIN sizes AS s;
```

조합 수가 곱셈으로 늘어나므로 큰 테이블에서는 특히 주의해야 한다.

SELF JOIN은 하나의 테이블을 서로 다른 별칭으로 두 번 사용한다. 직원 테이블의 관리자도 직원인 경우가 대표적이다.

```sql
SELECT
    e.name AS employee_name,
    m.name AS manager_name
FROM employees AS e
LEFT JOIN employees AS m
  ON m.employee_id = e.manager_id;
```

SELF JOIN이라는 별도의 JOIN 명령이 있는 것은 아니다. 같은 테이블을 JOIN 대상으로 다시 사용한 패턴을 뜻한다.

### Semi Join과 Anti Join

SQL 문법에 `SEMI JOIN`이라는 키워드가 있는 것은 아니지만, `EXISTS`나 `IN`으로 “오른쪽에 일치 행이 존재하는 왼쪽 행”만 반환하는 논리 연산을 Semi Join이라고 한다. 오른쪽 열을 출력하지 않고 왼쪽 행도 중복시키지 않는다.

```sql
-- 주문이 한 건 이상 있는 고객: Semi Join
SELECT c.customer_id, c.name
FROM customers AS c
WHERE EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
);

-- 주문이 없는 고객: Anti Join
SELECT c.customer_id, c.name
FROM customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
);
```

일반 JOIN으로 존재 여부를 구하면 고객의 주문 수만큼 행이 늘어 `DISTINCT`가 필요할 수 있다. 존재 여부만 필요하다면 `EXISTS`가 의도를 더 정확히 나타낸다.

## JOIN 알고리즘

SQL에서 `JOIN`을 작성하면 **무엇을 연결할지** 지정한다. **어떻게 연결할지**는 보통 PostgreSQL의 Query Planner가 데이터 통계와 비용을 바탕으로 선택한다.

### Nested Loop Join

바깥쪽의 각 행마다 안쪽에서 일치하는 행을 찾는다.

```text
for each outer row:
    find matching inner rows
```

바깥쪽 결과가 작고 안쪽 JOIN 열에 적절한 인덱스가 있을 때 효율적일 수 있다. 반대로 양쪽이 모두 큰데 반복 탐색 비용이 크면 느려질 수 있다.

### Hash Join

한쪽 입력으로 JOIN 키의 해시 테이블을 만들고, 다른 쪽 입력을 읽으며 일치하는 키를 찾는다. 인덱스가 없는 큰 입력의 동등 조건(`=`) JOIN에 유리한 경우가 많다. 해시 테이블을 만들 메모리가 필요하며 범위 조건에는 사용할 수 없다.

### Merge Join

양쪽 입력을 JOIN 키 순서로 읽으면서 일치하는 값을 병합한다. 입력이 이미 인덱스 순서로 제공되거나 정렬 비용을 감수할 가치가 있을 때 사용될 수 있다.

| 알고리즘 | 핵심 방식 | 유리할 수 있는 상황 |
|---|---|---|
| Nested Loop | 바깥 행마다 안쪽 탐색 | 작은 결과 + 인덱스 탐색 |
| Hash Join | 해시 테이블로 키 매칭 | 큰 데이터의 동등 JOIN |
| Merge Join | 정렬된 두 입력을 병합 | 이미 정렬됨, 큰 입력 |

알고리즘 이름만으로 좋고 나쁨을 판단할 수는 없다. 실제 선택은 행 수 추정, 인덱스, 메모리 설정, 데이터 분포 등에 따라 달라진다. 3일차에는 `EXPLAIN`과 `EXPLAIN ANALYZE`로 이 선택을 확인한다.

MySQL에서는 전통적으로 Block Nested Loop(BNL)가 여러 바깥 행을 조인 버퍼에 모아 안쪽 테이블을 반복 스캔하는 비용을 줄였고, Batched Key Access(BKA)는 키를 모아 인덱스를 배치 조회한다. MySQL 8.0.18부터 Hash Join이 도입되었으며 세부 선택은 버전에 따라 달라진다. SQL Server는 실행 중 입력 행 수를 보고 Nested Loop와 Hash 계열을 선택하는 Adaptive Join을 제공하고, Oracle은 힌트와 adaptive plan 기능을 제공한다.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT s.name, c.title, e.grade
FROM students AS s
JOIN enrollments AS e ON e.student_id = s.student_id
JOIN courses AS c ON c.course_id = e.course_id
WHERE s.grade = 3;
```

3일차 전이라도 다음 항목은 읽어 둘 수 있다.

- `Hash Join`, `Nested Loop`, `Merge Join` 중 무엇을 골랐는가?
- `rows` 추정치와 `actual rows`가 크게 다른가?
- `Seq Scan`이 정말 문제인지, 큰 비율을 읽으므로 합리적인 선택인지?
- `Buffers: shared hit/read`에서 메모리 적중과 디스크 읽기는 얼마인가?
- Hash의 `Batches`가 1보다 커 메모리 부족으로 spill했는가?

JOIN FK에는 인덱스를 검토하되 “FK면 무조건 인덱스”도 절대 규칙은 아니다. 작은 테이블이나 쓰기 중심 테이블에서는 유지 비용이 더 클 수 있다. 실제 JOIN·부모 삭제 패턴과 실행 계획으로 판단한다.

## 서브쿼리

서브쿼리는 다른 SQL 문 안에 포함된 쿼리다. 반환 형태와 바깥 쿼리와의 관계에 따라 이해하면 쉽다.

### 스칼라 서브쿼리

하나의 행과 하나의 열, 즉 값 하나를 반환한다.

```sql
SELECT
    product_id,
    name,
    price
FROM products
WHERE price > (SELECT AVG(price) FROM products);
```

값이 두 행 이상 반환되면 오류가 발생한다.

### 여러 행을 반환하는 서브쿼리

`IN`을 사용해 서브쿼리가 반환한 값의 집합과 비교할 수 있다.

```sql
SELECT customer_id, name
FROM customers
WHERE customer_id IN (
    SELECT customer_id
    FROM orders
    WHERE status = 'CANCELLED'
);
```

`ANY`와 `ALL`은 여러 행과의 비교 조건을 더 세밀하게 표현한다.

```sql
-- 어떤 전자제품보다라도 비싸다 = 전자제품 최솟값보다 비싸다
SELECT product_id, name, price
FROM products
WHERE price > ANY (
    SELECT price
    FROM products
    WHERE category = 'ELECTRONICS'
);

-- 모든 전자제품보다 비싸다 = 전자제품 최댓값보다 비싸다
SELECT product_id, name, price
FROM products
WHERE price > ALL (
    SELECT price
    FROM products
    WHERE category = 'ELECTRONICS'
);
```

빈 집합과 `NULL`이 포함된 집합에서의 3값 논리까지 고려해야 한다. 단순 최솟값·최댓값 비교라면 `MIN`·`MAX`를 사용한 스칼라 서브쿼리가 의도를 더 쉽게 드러낼 수도 있다.

### EXISTS

`EXISTS`는 서브쿼리 결과의 값이 아니라 **조건을 만족하는 행의 존재 여부**를 확인한다.

```sql
SELECT c.customer_id, c.name
FROM customers AS c
WHERE EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
      AND o.status = 'COMPLETED'
);
```

주문이 없는 고객은 `NOT EXISTS`로 표현할 수 있다.

```sql
SELECT c.customer_id, c.name
FROM customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
);
```

`NOT IN (subquery)`은 서브쿼리 결과에 `NULL`이 포함되면 예상과 다른 결과를 만들 수 있다. 부재 여부를 검사할 때는 `NOT EXISTS`가 의도를 더 명확하게 표현하는 경우가 많다.

### 상관 서브쿼리

서브쿼리가 바깥 쿼리의 현재 행을 참조하면 상관 서브쿼리라고 한다.

```sql
SELECT
    c.customer_id,
    c.name,
    (
        SELECT MAX(o.ordered_at)
        FROM orders AS o
        WHERE o.customer_id = c.customer_id
    ) AS last_ordered_at
FROM customers AS c;
```

논리적으로는 고객마다 서브쿼리를 평가하는 형태다. 실제 실행 방식은 Planner가 최적화할 수 있지만, 큰 데이터에서는 JOIN이나 Window Function으로 바꾼 쿼리와 실행 계획을 비교할 필요가 있다.

## 집합 연산자

집합 연산자는 두 SELECT 결과를 행 단위로 결합한다. 양쪽 쿼리의 열 개수가 같고 대응하는 열의 자료형이 호환되어야 한다.

| 연산자 | 결과 |
|---|---|
| `UNION` | 합집합, 중복 제거 |
| `UNION ALL` | 합집합, 중복 유지 |
| `INTERSECT` | 교집합 |
| `EXCEPT` | 첫 결과에만 있는 행 |

```sql
SELECT email
FROM newsletter_subscribers

UNION

SELECT email
FROM customers;
```

중복 제거가 필요 없다면 `UNION ALL`이 의도를 더 정확히 드러내며 중복 제거 작업도 피할 수 있다.

```sql
SELECT customer_id
FROM orders
WHERE ordered_at >= DATE '2026-07-01'

INTERSECT

SELECT customer_id
FROM reviews
WHERE created_at >= DATE '2026-07-01';
```

최종 결과를 정렬하려면 마지막 집합 결과 전체에 `ORDER BY`를 적용한다.

```sql
SELECT name, 'CUSTOMER' AS source
FROM customers

UNION ALL

SELECT name, 'PRODUCT' AS source
FROM products

ORDER BY name;
```

JOIN은 열을 옆으로 결합하고, 집합 연산자는 호환되는 행을 위아래로 결합한다.

DBMS별 지원과 문법에는 차이가 있다. PostgreSQL, Oracle, SQL Server는 주요 집합 연산을 제공하지만 Oracle은 전통적으로 `EXCEPT` 대신 `MINUS`를 사용해 왔다. MySQL은 버전에 따라 `INTERSECT`·`EXCEPT` 지원 여부가 달라지므로 배포 버전을 확인한다. 중복 제거가 있는 연산은 sort/hash 비용이 들 수 있으므로 의도가 허용하면 `UNION ALL`을 우선한다.

## CTE

CTE(Common Table Expression)는 `WITH`로 이름 붙인 임시 결과다. 복잡한 쿼리를 의미 있는 단계로 나누고 중복되는 표현을 줄일 수 있다.

```sql
WITH order_totals AS (
    SELECT
        o.order_id,
        o.customer_id,
        o.ordered_at,
        SUM(oi.quantity * oi.unit_price) AS order_amount
    FROM orders AS o
    JOIN order_items AS oi
      ON oi.order_id = o.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY o.order_id, o.customer_id, o.ordered_at
),
customer_totals AS (
    SELECT
        customer_id,
        COUNT(*)          AS order_count,
        SUM(order_amount) AS total_amount
    FROM order_totals
    GROUP BY customer_id
)
SELECT
    c.customer_id,
    c.name,
    ct.order_count,
    ct.total_amount
FROM customer_totals AS ct
JOIN customers AS c
  ON c.customer_id = ct.customer_id
ORDER BY ct.total_amount DESC;
```

CTE는 현재 SQL 문이 끝나면 사라지며 데이터를 별도로 저장하는 테이블이 아니다. 또한 CTE를 사용했다고 항상 빨라지거나 느려지는 것은 아니다. PostgreSQL 버전, 참조 횟수, `MATERIALIZED` 지정 여부 등에 따라 Planner의 처리 방식이 달라질 수 있으므로 성능은 실행 계획으로 확인해야 한다.

### 재귀 CTE로 계층 탐색하기

재귀 CTE는 자기 자신을 참조하면서 조직도, 카테고리 트리, 댓글 계층, 그래프 경로를 탐색한다. 앵커 쿼리가 시작 행을 만들고, 재귀 쿼리가 앞 단계 결과에서 다음 행을 확장한다.

```sql
WITH RECURSIVE org_tree AS (
    -- Anchor: 최상위 직원
    SELECT
        employee_id,
        manager_id,
        name,
        0 AS depth,
        ARRAY[employee_id] AS visited_ids,
        name::TEXT AS path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive term: 직속 부하를 한 단계씩 연결
    SELECT
        e.employee_id,
        e.manager_id,
        e.name,
        t.depth + 1,
        t.visited_ids || e.employee_id,
        t.path || ' > ' || e.name
    FROM employees AS e
    JOIN org_tree AS t
      ON e.manager_id = t.employee_id
    WHERE NOT e.employee_id = ANY (t.visited_ids)
)
SELECT employee_id, name, depth, path
FROM org_tree
ORDER BY path;
```

`visited_ids`는 잘못된 순환 관계가 있을 때 무한 재귀를 막는다. 재귀 CTE의 종료 조건을 빠뜨리면 결과가 폭증할 수 있고, 깊은 그래프는 애플리케이션의 최대 깊이 제한도 함께 두는 편이 안전하다.

### PostgreSQL 12+ CTE 인라인과 MATERIALIZED

PostgreSQL 12 이상에서는 한 번 참조되고 부작용 없는 CTE를 바깥 쿼리에 인라인할 수 있다. 필터를 CTE 내부까지 밀어 넣는 최적화가 가능해진다.

```sql
WITH recent_orders AS NOT MATERIALIZED (
    SELECT *
    FROM orders
    WHERE ordered_at >= CURRENT_DATE - INTERVAL '1 year'
)
SELECT *
FROM recent_orders
WHERE customer_id = 10;
```

반대로 비싼 결과를 여러 번 참조하거나 평가를 한 번으로 고정하려면 `MATERIALIZED`를 선택할 수 있다.

```sql
WITH expensive_result AS MATERIALIZED (
    SELECT customer_id, SUM(amount) AS total
    FROM payments
    GROUP BY customer_id
)
SELECT *
FROM expensive_result
WHERE total >= 1000000;
```

이는 영구 저장되는 Materialized View와 다르다. CTE의 물질화 결과는 해당 SQL 실행 동안만 존재한다.

## View와 Materialized View

### View

View는 저장된 SELECT 문에 이름을 붙인 가상 테이블이다.

```sql
CREATE VIEW completed_order_totals AS
SELECT
    o.order_id,
    o.customer_id,
    o.ordered_at,
    SUM(oi.quantity * oi.unit_price) AS order_amount
FROM orders AS o
JOIN order_items AS oi
  ON oi.order_id = o.order_id
WHERE o.status = 'COMPLETED'
GROUP BY o.order_id, o.customer_id, o.ordered_at;
```

사용할 때는 테이블처럼 조회한다.

```sql
SELECT *
FROM completed_order_totals
WHERE order_amount >= 100000;
```

일반 View는 조회 결과를 저장하지 않는다. 조회할 때 View의 정의를 바탕으로 원본 테이블에서 결과를 계산한다.

View의 주요 목적은 다음과 같다.

- 복잡한 JOIN과 계산을 재사용한다.
- 사용자에게 일관된 조회 인터페이스를 제공한다.
- 필요한 열과 행만 노출해 접근 범위를 제한한다.

다만 View 하나만으로 완전한 보안이 보장되는 것은 아니다. 소유자, 실행 권한, 행 수준 보안 등도 함께 설계해야 한다.

### Materialized View

Materialized View는 쿼리 **결과를 물리적으로 저장**한다.

```sql
CREATE MATERIALIZED VIEW monthly_sales AS
SELECT
    DATE_TRUNC('month', o.ordered_at) AS sales_month,
    SUM(oi.quantity * oi.unit_price)  AS sales_amount
FROM orders AS o
JOIN order_items AS oi
  ON oi.order_id = o.order_id
WHERE o.status = 'COMPLETED'
GROUP BY DATE_TRUNC('month', o.ordered_at);
```

저장된 결과는 원본 데이터가 바뀌어도 자동으로 갱신되지 않는다.

```sql
REFRESH MATERIALIZED VIEW monthly_sales;
```

| 구분 | View | Materialized View |
|---|---|---|
| 저장 대상 | SQL 정의 | SQL 정의와 조회 결과 |
| 데이터 최신성 | 조회 시 원본 반영 | 새로고침 시점 기준 |
| 조회 비용 | 원본 쿼리 실행 필요 | 저장 결과를 바로 조회 |
| 관리 포인트 | 원본 쿼리 성능 | 저장 공간과 갱신 주기 |

계산 비용이 큰 통계가 자주 조회되고 약간의 지연을 허용할 수 있다면 Materialized View가 유용하다. 실시간 최신성이 필요하다면 갱신 정책까지 포함해 판단해야 한다.

## Window Function

`GROUP BY`는 여러 행을 그룹당 한 행으로 줄인다. Window Function은 **기존 행을 유지한 채** 관련 행의 순위, 누계, 이전 값 등을 계산한다.

```text
GROUP BY        여러 주문 → 고객별 한 행
Window Function 여러 주문 → 주문 행 유지 + 고객별 계산 결과
```

기본 형태는 다음과 같다.

```sql
함수() OVER (
    PARTITION BY 그룹을 나눌 열
    ORDER BY 그룹 안의 순서
    ROWS BETWEEN 윈도우 범위
)
```

### ROW_NUMBER, RANK, DENSE_RANK

상품 카테고리별로 매출 순위를 매겨 보자.

```sql
WITH product_sales AS (
    SELECT
        p.category,
        p.product_id,
        p.name,
        SUM(oi.quantity * oi.unit_price) AS sales_amount
    FROM products AS p
    JOIN order_items AS oi
      ON oi.product_id = p.product_id
    JOIN orders AS o
      ON o.order_id = oi.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY p.category, p.product_id, p.name
)
SELECT
    category,
    product_id,
    name,
    sales_amount,
    ROW_NUMBER() OVER (
        PARTITION BY category
        ORDER BY sales_amount DESC, product_id
    ) AS row_number,
    RANK() OVER (
        PARTITION BY category
        ORDER BY sales_amount DESC
    ) AS rank,
    DENSE_RANK() OVER (
        PARTITION BY category
        ORDER BY sales_amount DESC
    ) AS dense_rank
FROM product_sales;
```

동점이 있을 때 결과가 달라진다.

```text
점수:          100, 100, 90
ROW_NUMBER:      1,   2,  3
RANK:            1,   1,  3
DENSE_RANK:      1,   1,  2
```

`ROW_NUMBER`로 한 행만 고를 때는 동점에서도 결과가 결정되도록 `product_id` 같은 고유한 열을 마지막 정렬 기준으로 추가하는 것이 좋다.

### 그룹별 Top N

Window Function의 결과는 같은 SELECT 문의 `WHERE`에서 바로 사용할 수 없다. 논리적으로 `WHERE`가 Window Function보다 먼저 처리되기 때문이다. CTE나 서브쿼리로 한 단계를 감싼다.

```sql
WITH product_sales AS (
    SELECT
        p.category,
        p.product_id,
        p.name,
        SUM(oi.quantity * oi.unit_price) AS sales_amount
    FROM products AS p
    JOIN order_items AS oi
      ON oi.product_id = p.product_id
    JOIN orders AS o
      ON o.order_id = oi.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY p.category, p.product_id, p.name
),
ranked_products AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY category
            ORDER BY sales_amount DESC, product_id
        ) AS sales_rank
    FROM product_sales
)
SELECT category, product_id, name, sales_amount, sales_rank
FROM ranked_products
WHERE sales_rank <= 3
ORDER BY category, sales_rank;
```

PostgreSQL에서는 같은 문제를 다른 방식으로도 풀 수 있다.

아래 두 예시는 앞에서 만든 `product_sales` 집계 결과를 CTE나 View로 사용할 수 있다고 가정한다.

```sql
-- 그룹별 Top 1: DISTINCT ON
SELECT DISTINCT ON (category)
    category,
    product_id,
    name,
    sales_amount
FROM product_sales
ORDER BY category, sales_amount DESC, product_id;
```

`DISTINCT ON`의 첫 표현과 `ORDER BY` 선두 표현을 맞추고, 이후 정렬로 그룹에서 남길 행을 결정한다. PostgreSQL 전용이지만 Top 1에는 간결하다.

```sql
-- 그룹별 Top 3: 카테고리마다 LATERAL 서브쿼리
SELECT
    c.category,
    top_product.product_id,
    top_product.name,
    top_product.sales_amount
FROM (
    SELECT DISTINCT category
    FROM product_sales
) AS c
CROSS JOIN LATERAL (
    SELECT product_id, name, sales_amount
    FROM product_sales AS ps
    WHERE ps.category = c.category
    ORDER BY sales_amount DESC, product_id
    LIMIT 3
) AS top_product;
```

적절한 `(category, sales_amount DESC, product_id)` 인덱스와 적은 그룹 수라면 유리할 수 있다. Window 방식은 전체를 순위화하고, LATERAL 방식은 그룹별 제한 탐색을 반복한다. 데이터 분포와 계획으로 비교한다.

### LAG와 LEAD

`LAG`는 이전 행, `LEAD`는 다음 행의 값을 가져온다. 고객의 주문 간격을 계산할 수 있다.

```sql
WITH order_history AS (
    SELECT
        customer_id,
        order_id,
        ordered_at,
        LAG(ordered_at) OVER (
            PARTITION BY customer_id
            ORDER BY ordered_at, order_id
        ) AS previous_ordered_at
    FROM orders
    WHERE status = 'COMPLETED'
)
SELECT
    customer_id,
    order_id,
    ordered_at,
    previous_ordered_at,
    ordered_at - previous_ordered_at AS interval_from_previous
FROM order_history;
```

고객별 첫 주문은 이전 행이 없으므로 `previous_ordered_at`이 `NULL`이다.

### 누적 합계와 Window Frame

월별 매출과 누적 매출을 함께 표시한다.

```sql
WITH monthly_sales AS (
    SELECT
        DATE_TRUNC('month', o.ordered_at) AS sales_month,
        SUM(oi.quantity * oi.unit_price)  AS sales_amount
    FROM orders AS o
    JOIN order_items AS oi
      ON oi.order_id = o.order_id
    WHERE o.status = 'COMPLETED'
    GROUP BY DATE_TRUNC('month', o.ordered_at)
)
SELECT
    sales_month,
    sales_amount,
    SUM(sales_amount) OVER (
        ORDER BY sales_month
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_sales
FROM monthly_sales
ORDER BY sales_month;
```

`PARTITION BY`가 없으므로 전체 결과가 하나의 파티션이다. `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`는 첫 행부터 현재 행까지를 계산 범위로 명시한다.

Window Function에서 `ORDER BY`를 쓰면 기본 Window Frame이 함수와 DBMS 규칙에 따라 예상과 다르게 동작할 수 있다. 특히 정렬 값이 같은 행이 있을 때 누적 결과를 행 단위로 계산하려면 `ROWS` 범위를 명시하는 편이 안전하다.

### ROWS와 RANGE의 차이

`ROWS`는 정렬 후 물리적인 행 수를 기준으로 하고, `RANGE`는 정렬 키가 같은 peer 행을 하나의 값 범위로 취급한다.

```sql
SELECT
    order_id,
    ordered_at::date AS order_date,
    amount,
    SUM(amount) OVER (
        ORDER BY ordered_at::date, order_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_by_row,
    SUM(amount) OVER (
        ORDER BY ordered_at::date
        RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_by_date
FROM orders;
```

같은 날짜의 주문이 세 건이면 `ROWS` 누계는 행마다 증가하지만 `RANGE` 누계는 같은 날짜 세 행에서 동일한 합계를 보일 수 있다. 원하는 의미가 행 기준인지 값 구간 기준인지 명시해야 한다.

### 이동 평균과 이전 시점 대비 변화

```sql
WITH daily_sales AS (
    SELECT
        ordered_at::date AS sales_date,
        SUM(amount) AS sales
    FROM orders
    WHERE status = 'COMPLETED'
    GROUP BY ordered_at::date
)
SELECT
    sales_date,
    sales,
    LAG(sales) OVER (ORDER BY sales_date) AS previous_sales,
    sales - LAG(sales) OVER (ORDER BY sales_date) AS change_amount,
    AVG(sales) OVER (
        ORDER BY sales_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS moving_avg_7_rows
FROM daily_sales
ORDER BY sales_date;
```

여기서 “7일 이동 평균”이라고 부르려면 날짜가 매일 한 행씩 존재해야 한다. 누락 날짜가 있으면 7행이 7일과 같지 않다. `generate_series`로 달력 행을 만들고 0매출 날짜를 채운 뒤 계산해야 정확한 달력 기준 이동 평균이 된다.

### NTILE, PERCENT_RANK, CUME_DIST

```sql
SELECT
    customer_id,
    total_amount,
    NTILE(4) OVER (ORDER BY total_amount DESC) AS quartile,
    PERCENT_RANK() OVER (ORDER BY total_amount) AS percent_rank,
    CUME_DIST() OVER (ORDER BY total_amount) AS cumulative_distribution
FROM customer_totals;
```

- `NTILE(4)`는 정렬된 행을 가능한 균등한 네 그룹으로 나눈다.
- `PERCENT_RANK()`는 `(rank - 1) / (rows - 1)`로 상대 순위를 0~1로 표현한다.
- `CUME_DIST()`는 현재 값 이하 행의 누적 비율을 구한다.

동점과 표본 수에 따라 값이 달라지므로 “상위 25% 고객”이 행 수 기준인지 매출 기여도 기준인지 업무 정의를 먼저 정해야 한다.

### Gap & Island: 연속 구간 찾기

연속 로그인 날짜처럼 붙어 있는 행의 구간(island)과 끊긴 지점(gap)을 찾는 대표 패턴이다.

```sql
WITH login_days AS (
    SELECT DISTINCT user_id, logged_at::date AS login_date
    FROM user_logins
),
numbered AS (
    SELECT
        user_id,
        login_date,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY login_date
        ) AS rn
    FROM login_days
),
grouped AS (
    SELECT
        user_id,
        login_date,
        login_date - rn::INTEGER AS island_key
    FROM numbered
)
SELECT
    user_id,
    MIN(login_date) AS started_at,
    MAX(login_date) AS ended_at,
    COUNT(*) AS consecutive_days
FROM grouped
GROUP BY user_id, island_key
ORDER BY user_id, started_at;
```

날짜가 하루씩 증가할 때 `login_date - row_number`는 같은 연속 구간에서 일정하다는 성질을 이용한다.

### 코호트 유지율

코호트 분석은 사용자의 최초 활동 시점을 기준으로 그룹을 만들고 이후 기간의 재방문 비율을 본다.

```sql
WITH first_orders AS (
    SELECT
        customer_id,
        DATE_TRUNC('month', MIN(ordered_at))::date AS cohort_month
    FROM orders
    GROUP BY customer_id
),
activities AS (
    SELECT DISTINCT
        o.customer_id,
        f.cohort_month,
        DATE_TRUNC('month', o.ordered_at)::date AS activity_month
    FROM orders AS o
    JOIN first_orders AS f USING (customer_id)
),
cohort_counts AS (
    SELECT
        cohort_month,
        activity_month,
        (
            EXTRACT(YEAR FROM AGE(activity_month, cohort_month)) * 12
          + EXTRACT(MONTH FROM AGE(activity_month, cohort_month))
        )::INTEGER AS month_number,
        COUNT(*) AS active_customers
    FROM activities
    GROUP BY cohort_month, activity_month
)
SELECT
    *,
    active_customers::NUMERIC
      / FIRST_VALUE(active_customers) OVER (
            PARTITION BY cohort_month
            ORDER BY month_number
        ) AS retention_rate
FROM cohort_counts
ORDER BY cohort_month, month_number;
```

분모는 코호트 최초 고객 수이고 분자는 각 월에 다시 활동한 고유 고객 수다. 주문 건수를 세면 유지율이 아니라 활동량을 측정하게 되므로 집계 단위를 주의한다.

## JOIN 결과 행 수를 예측하는 습관

JOIN은 “두 테이블을 붙이는 것”처럼 보이지만, 실제로는 행 수가 어떻게 바뀌는지를 먼저 예측해야 한다.

| 관계 | 결과 특징 |
|---|---|
| 1:1 | 보통 행 수가 크게 늘지 않는다 |
| 1:N | 왼쪽 한 행이 오른쪽 여러 행으로 복제될 수 있다 |
| N:M | 조인 후 행 수가 급격히 늘어날 수 있다 |

예를 들어 고객 1명이 주문 3개를 했고, 그 주문마다 주문 항목이 4개씩 있다면 단순 조인 결과는 12행으로 늘어난다.
그래서 `COUNT(*)`를 썼는데 기대보다 값이 커졌다면, JOIN 전에 어느 단위의 행을 세고 있었는지 다시 확인해야 한다.

## USING과 ON

`USING`은 조인 키 이름이 양쪽 테이블에서 같을 때 간단하게 쓸 수 있다.

```sql
SELECT o.order_id, c.name
FROM orders AS o
JOIN customers AS c USING (customer_id);
```

`USING`은 문장을 짧게 만들어 주지만, 조건이 복잡하거나 컬럼 이름이 다르면 `ON`이 더 유연하다.

```sql
SELECT o.order_id, c.name
FROM orders AS o
JOIN customers AS c
  ON c.customer_id = o.customer_id
 AND c.joined_at <= o.ordered_at::date;
```

실무에서는 “가능하면 짧게”보다 “의도가 명확하게”가 더 중요하다.
조건이 한 줄로 끝나지 않으면 `ON`이 결과 의미를 드러내는 데 더 낫다.

## 서브쿼리를 더 실전적으로 읽는 법

서브쿼리는 위치보다 반환 형태를 먼저 보는 것이 편하다.

| 형태 | 무엇을 반환하는가 | 보통 함께 쓰는 연산자 |
|---|---|---|
| 스칼라 서브쿼리 | 값 하나 | 비교 연산자 |
| 다중 행 서브쿼리 | 값의 집합 | `IN`, `ANY`, `ALL` |
| 상관 서브쿼리 | 바깥 행마다 다시 평가되는 서브쿼리 | `EXISTS`, 집계 |

```sql
SELECT product_id, name
FROM products
WHERE price > (SELECT AVG(price) FROM products);
```

이 쿼리는 평균보다 비싼 상품을 찾는다.
반대로 고객마다 마지막 주문일을 구하는 상관 서브쿼리는 바깥 행을 참조하므로 표현은 직관적이지만, 데이터가 커질수록 다른 방식과 실행 계획을 비교해 볼 가치가 있다.

```sql
SELECT
    c.customer_id,
    c.name,
    (
        SELECT MAX(o.ordered_at)
        FROM orders AS o
        WHERE o.customer_id = c.customer_id
    ) AS last_ordered_at
FROM customers AS c;
```

부재 여부를 확인할 때는 `NOT IN`보다 `NOT EXISTS`를 우선 떠올리는 편이 안전하다.
서브쿼리 결과에 `NULL`이 섞이면 `NOT IN`은 예상과 다른 결과를 만들 수 있기 때문이다.

## CTE는 단계가 많은 쿼리를 이해시키는 도구다

CTE는 단순히 쿼리를 “짧게” 만드는 도구가 아니라, 단계별 사고를 코드로 옮기는 도구다.

```sql
WITH recent_orders AS (
    SELECT order_id, customer_id, ordered_at
    FROM orders
    WHERE ordered_at >= CURRENT_DATE - INTERVAL '30 days'
),
recent_sales AS (
    SELECT
        ro.customer_id,
        COUNT(*) AS order_count
    FROM recent_orders AS ro
    GROUP BY ro.customer_id
)
SELECT
    c.customer_id,
    c.name,
    COALESCE(rs.order_count, 0) AS order_count
FROM customers AS c
LEFT JOIN recent_sales AS rs
  ON rs.customer_id = c.customer_id;
```

이런 식으로 나누면 중간 결과를 읽기 쉬워지고, 각 단계가 무엇을 책임지는지도 분명해진다.
다만 CTE를 썼다고 항상 성능이 좋아지는 것은 아니므로, 이해를 위한 분해와 성능은 별도로 판단해야 한다.

## Window Function은 행을 잃지 않는다는 점이 핵심이다

`GROUP BY`는 행을 줄이지만 Window Function은 기존 행을 유지한다.
이 차이를 이해하면 “왜 누적합은 Window Function이 더 자연스러운가”가 보인다.

| 방식 | 결과 행 수 | 잘 맞는 질문 |
|---|---|---|
| `GROUP BY` | 줄어든다 | 고객별 총합, 월별 매출 |
| Window Function | 유지된다 | 각 주문의 순위, 누계, 이전 값 |

예를 들어 같은 고객 안에서 주문이 전체에서 얼마나 큰 비중을 차지하는지도 계산할 수 있다.

```sql
SELECT
    o.order_id,
    o.customer_id,
    SUM(oi.quantity * oi.unit_price) AS order_amount,
    SUM(SUM(oi.quantity * oi.unit_price)) OVER (
        PARTITION BY o.customer_id
    ) AS customer_total_amount
FROM orders AS o
JOIN order_items AS oi
  ON oi.order_id = o.order_id
WHERE o.status = 'COMPLETED'
GROUP BY o.order_id, o.customer_id;
```

같은 결과를 서브쿼리로도 만들 수 있지만, Window Function은 “현재 행을 유지한 채 비교하는 작업”에 더 잘 맞는다.

## 자주 쓰는 윈도우 패턴

윈도우 함수를 읽을 때는 이름보다 용도를 먼저 떠올리면 쉽다.

| 함수 | 떠올리면 좋은 상황 |
|---|---|
| `ROW_NUMBER()` | 그룹 안에서 순서대로 하나씩 번호를 붙이고 싶을 때 |
| `RANK()` | 동점이 있으면 같은 순위를 주고 다음 순위를 건너뛸 때 |
| `DENSE_RANK()` | 동점이 있어도 순위를 연속적으로 매기고 싶을 때 |
| `LAG()` | 이전 시점과 차이를 보고 싶을 때 |
| `LEAD()` | 다음 시점을 미리 보고 싶을 때 |

`ROWS`는 물리적인 행 기준 범위를 뜻하고, `RANGE`는 정렬 값 기준으로 묶이는 느낌이 강하다.
누적합처럼 행 단위로 정확히 계산하고 싶다면 `ROWS`를 명시하는 편이 보통 더 안전하다.

## LATERAL JOIN: 왼쪽 행마다 실행되는 테이블식

`LATERAL`은 오른쪽 서브쿼리가 왼쪽의 현재 행을 참조하게 한다. 고객별 최근 주문 3개처럼 “각 부모별 제한된 자식 행”을 찾을 때 유용하다.

```sql
SELECT
    c.customer_id,
    c.name,
    latest.order_id,
    latest.ordered_at,
    latest.amount
FROM customers AS c
LEFT JOIN LATERAL (
    SELECT o.order_id, o.ordered_at, o.amount
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
    ORDER BY o.ordered_at DESC, o.order_id DESC
    LIMIT 3
) AS latest ON TRUE
ORDER BY c.customer_id, latest.ordered_at DESC;
```

`ON TRUE`는 매칭 조건이 이미 서브쿼리 안에 있음을 나타낸다. `LEFT JOIN LATERAL`이므로 주문이 없는 고객도 남는다. `(customer_id, ordered_at DESC, order_id DESC)` 인덱스가 있으면 고객마다 상위 몇 행을 빠르게 찾을 수 있다.

PostgreSQL의 set-returning function도 암묵적으로 LATERAL처럼 왼쪽 행을 참조할 수 있다.

```sql
SELECT p.product_id, tag
FROM products AS p
CROSS JOIN LATERAL jsonb_array_elements_text(p.attrs -> 'tags') AS tag;
```

## UPSERT: 중복이면 갱신하기

“없으면 INSERT, 있으면 UPDATE”를 애플리케이션에서 두 문장으로 나누면 확인 직후 다른 트랜잭션이 삽입하는 경쟁 조건이 생긴다. PostgreSQL은 유일 제약조건을 충돌 판정 기준으로 삼는 원자적 UPSERT를 제공한다.

```sql
CREATE TABLE daily_product_stats (
    stat_date  DATE NOT NULL,
    product_id BIGINT NOT NULL REFERENCES products (product_id),
    view_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (stat_date, product_id)
);

INSERT INTO daily_product_stats (stat_date, product_id, view_count)
VALUES (CURRENT_DATE, 10, 1)
ON CONFLICT (stat_date, product_id)
DO UPDATE
SET view_count = daily_product_stats.view_count + EXCLUDED.view_count;
```

`EXCLUDED`는 삽입하려다 충돌한 새 행을 가리킨다. MySQL은 `INSERT ... ON DUPLICATE KEY UPDATE`, SQL Server와 Oracle은 `MERGE`를 사용할 수 있지만 동시성·트리거 동작 등 제품별 의미를 확인해야 한다.

## 문자열·배열·JSON 집계

여러 행을 하나의 표현으로 모을 때 PostgreSQL은 다양한 집계 함수를 제공한다.

```sql
SELECT
    o.order_id,
    STRING_AGG(p.name, ', ' ORDER BY p.name) AS product_names,
    ARRAY_AGG(p.product_id ORDER BY p.product_id) AS product_ids,
    JSONB_AGG(
        JSONB_BUILD_OBJECT(
            'productId', p.product_id,
            'name', p.name,
            'quantity', oi.quantity
        )
        ORDER BY p.product_id
    ) AS items
FROM orders AS o
JOIN order_items AS oi USING (order_id)
JOIN products AS p USING (product_id)
GROUP BY o.order_id;
```

집계 안의 `ORDER BY`를 생략하면 배열이나 JSON 요소의 순서를 보장할 수 없다. API 응답을 DB에서 바로 JSON으로 만들 수 있지만, 표현 계층까지 DB에 과도하게 넣으면 SQL 재사용과 테스트가 어려워질 수 있다.

## 트랜잭션 제어와 SAVEPOINT

```sql
BEGIN;

UPDATE products
SET stock = stock - 1
WHERE product_id = 10
  AND stock > 0;

SAVEPOINT after_stock;

INSERT INTO audit_logs (event_type, payload)
VALUES ('ORDER_CREATED', '{"productId": 10}');

-- 감사 로그만 다시 시도해야 한다면
ROLLBACK TO SAVEPOINT after_stock;

COMMIT;
```

`SAVEPOINT`는 전체 트랜잭션을 취소하지 않고 특정 지점 이후 작업만 되돌린다. 하지만 이미 다른 세션과 획득한 잠금, 외부 API 호출 같은 DB 밖의 부작용을 모두 되돌리는 장치는 아니다.

autocommit 정책도 제품과 클라이언트 도구에 따라 다르다. PostgreSQL 서버는 각 단독 문장을 암묵적 트랜잭션으로 실행하지만, `psql`·JDBC·ORM의 설정에 따라 명시적 트랜잭션 범위가 달라진다. MySQL 클라이언트는 일반적으로 autocommit이 켜져 있다. 실습에서는 “내 도구가 자동 커밋하는가?”를 먼저 확인한다.

## 정렬과 페이지네이션

`NULL`의 정렬 위치는 DBMS 기본값에 따라 다르다. PostgreSQL에서는 명시할 수 있다.

```sql
SELECT customer_id, name, last_ordered_at
FROM customer_summary
ORDER BY last_ordered_at DESC NULLS LAST,
         customer_id;
```

두 번째 정렬 키인 고유 ID는 같은 시각 행의 순서를 결정해 페이지 결과를 안정적으로 만든다.

```sql
-- OFFSET 방식: 앞의 100,000행을 읽고 버릴 수 있다.
SELECT order_id, ordered_at, amount
FROM orders
ORDER BY ordered_at DESC, order_id DESC
LIMIT 20 OFFSET 100000;

-- Keyset 방식: 마지막으로 본 키 이후를 인덱스로 탐색
SELECT order_id, ordered_at, amount
FROM orders
WHERE (ordered_at, order_id)
    < (:last_ordered_at, :last_order_id)
ORDER BY ordered_at DESC, order_id DESC
LIMIT 20;
```

Keyset 페이지네이션은 깊은 페이지에서도 빠르고 중간 INSERT에 비교적 안정적이다. 임의 페이지 번호로 바로 이동하기 어렵고, 정렬 키와 방향을 커서에 안전하게 인코딩해야 한다.

## PIVOT과 조건부 집계

행을 열로 펼치는 PIVOT은 조건부 집계로 이식성 있게 표현할 수 있다.

```sql
SELECT
    DATE_TRUNC('month', ordered_at)::date AS month,
    SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END) AS completed,
    SUM(CASE WHEN status = 'CANCELLED' THEN amount ELSE 0 END) AS cancelled,
    SUM(CASE WHEN status = 'PENDING'   THEN amount ELSE 0 END) AS pending
FROM orders
GROUP BY DATE_TRUNC('month', ordered_at)
ORDER BY month;
```

상태 종류가 동적으로 늘어나는 경우 정적 SQL의 컬럼도 동적으로 바뀌어야 한다. 그때는 행 형태로 반환해 시각화 도구에서 피벗하거나 안전한 동적 SQL을 별도로 구성하는 편이 낫다.

## JSONB, 날짜, 문자열 실전 패턴

```sql
-- JSONB 부분 갱신과 조건 검색
UPDATE products
SET attrs = jsonb_set(
    COALESCE(attrs, '{}'::jsonb),
    '{color}',
    '"navy"'::jsonb,
    true
)
WHERE product_id = 10;

SELECT product_id, name
FROM products
WHERE attrs @> '{"color": "navy"}'::jsonb;
```

`@>` 포함 검색을 자주 사용하면 GIN 인덱스를 검토한다.

```sql
CREATE INDEX idx_products_attrs_gin
ON products USING GIN (attrs);
```

날짜 조건은 컬럼에 함수를 씌우기보다 반열린 구간으로 쓰면 인덱스를 활용하기 쉽고 경계도 명확하다.

```sql
-- 권장: 2026년 7월 전체
WHERE ordered_at >= TIMESTAMPTZ '2026-07-01 00:00:00+09'
  AND ordered_at <  TIMESTAMPTZ '2026-08-01 00:00:00+09'
```

```sql
-- 문자열 정제
SELECT
    TRIM(name) AS clean_name,
    LOWER(email) AS normalized_email,
    REGEXP_REPLACE(phone, '[^0-9]', '', 'g') AS digits_only,
    CONCAT_WS(' / ', city, district, street) AS address
FROM customers;
```

이메일의 대소문자 규칙처럼 정규화된 표현으로 유일성을 보장해야 한다면 애플리케이션 정제만 믿지 말고 `LOWER(email)` 표현식 유일 인덱스 또는 PostgreSQL `citext`를 검토한다.

## SQL 표준의 최근 흐름과 AI 데이터

SQL:2016 이후의 표준은 JSON 질의, row pattern recognition, 시간 데이터 기능을 확장했고 이후 판본에서도 property graph와 JSON 기능이 발전했다. 다만 제품별 지원 시점과 문법이 다르므로 “표준에 있다”와 “현재 DB에서 동작한다”를 구분해야 한다.

자연어로 SQL을 생성하거나 IDE에서 쿼리를 보완하는 AI 도구는 탐색 속도를 높일 수 있다. 하지만 schema의 업무 의미, row grain, 민감 정보 권한과 비용을 자동으로 보장하지는 않는다. 생성된 SQL에는 최소한 다음 검증이 필요하다.

- 존재하지 않는 테이블·컬럼을 만들지 않았는가?
- 1:N JOIN으로 금액과 행 수가 중복되지 않았는가?
- `NULL`, 시간대, 동점, 취소·환불 상태 정의가 맞는가?
- parameter binding을 사용하고 허용 범위 이상의 데이터를 읽지 않는가?
- `EXPLAIN`에서 full scan·큰 sort·Cartesian product가 없는가?
- 샘플 정답 데이터에서 예상 결과와 일치하는가?

AI 서비스에서는 관계형 조건과 벡터 유사도를 함께 사용하는 하이브리드 검색이 자주 등장한다.

```sql
-- pgvector가 설치되고 embedding vector 컬럼이 있다는 가정
SELECT
    document_id,
    title,
    1 - (embedding <=> :query_embedding) AS cosine_similarity
FROM documents
WHERE tenant_id = :tenant_id
  AND category = :category
ORDER BY embedding <=> :query_embedding
LIMIT 10;
```

구조화 필터는 테넌트·권한·카테고리를 제한하고, 벡터 거리는 의미상 가까운 문서를 정렬한다. 검색 결과 품질은 SQL 문법만이 아니라 embedding 모델, chunk 크기, 거리 함수, 재정렬과 평가 데이터에 달려 있다.

## 모든 문제는 한 가지 방법으로만 풀리지 않는다

같은 결과를 얻더라도 표현 방식은 다양할 수 있다.
실무에서는 다음 기준으로 선택하는 경우가 많다.

- 의미가 가장 분명한가
- 동작을 읽기 쉬운가
- 동점, `NULL`, 중복에 안전한가
- 실행 계획이 감당 가능한가

예를 들어 “카테고리별 상위 3개 상품”은 `ROW_NUMBER()`로 풀 수도 있고, 다른 방식의 조합으로도 표현할 수 있다.
중요한 건 정답 하나를 외우는 것이 아니라, 상황에 맞는 도구를 고를 수 있는가이다.

## 하나의 문제를 여러 방식으로 풀기

“주문이 없는 고객”은 LEFT JOIN, NOT EXISTS, 집합 연산자로 모두 표현할 수 있다.

```sql
-- LEFT JOIN
SELECT c.customer_id, c.name
FROM customers AS c
LEFT JOIN orders AS o
  ON o.customer_id = c.customer_id
WHERE o.order_id IS NULL;
```

```sql
-- NOT EXISTS
SELECT c.customer_id, c.name
FROM customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
);
```

```sql
-- EXCEPT로 ID 집합을 구한 뒤 고객 정보 조회
SELECT customer_id, name
FROM customers
WHERE customer_id IN (
    SELECT customer_id FROM customers
    EXCEPT
    SELECT customer_id FROM orders
);
```

정답은 하나가 아니다. 먼저 쿼리가 업무 의미를 정확히 표현하는지 확인하고, 읽기 쉬운 방식을 선택한다. 성능 차이가 중요한 규모에서는 추측하지 않고 실제 데이터와 실행 계획으로 비교한다.

## SQL 안티패턴과 개선 기준

| 안티패턴 | 문제 | 개선 방향 |
|---|---|---|
| `SELECT *` | 불필요한 I/O, 스키마 변경 영향 | 필요한 컬럼만 명시 |
| `WHERE EXTRACT(YEAR FROM ordered_at)=2026` | 컬럼 함수로 일반 인덱스 활용 제한 | 날짜 범위 조건 |
| 루프 안의 N개 조회 | N+1 네트워크 왕복 | JOIN, `IN`, batch loading |
| `NOT IN` + nullable 결과 | UNKNOWN 때문에 빈 결과 가능 | `NOT EXISTS` |
| `LIKE '%keyword%'` | 일반 B-tree 사용 어려움 | 전문 검색 또는 `pg_trgm` GIN |
| 큰 `OFFSET` | 앞 행을 계속 읽고 버림 | Keyset pagination |
| 문자열과 숫자의 암묵 변환 | 오류·인덱스 손실 가능 | 같은 자료형으로 비교 |
| 원인 모르는 `DISTINCT` | 잘못된 JOIN 중복을 가림 | 먼저 행 grain과 JOIN 조건 수정 |

집계 쿼리에서 비집계 컬럼은 원칙적으로 `GROUP BY`에 포함해야 한다. MySQL의 `ONLY_FULL_GROUP_BY`, PostgreSQL, Oracle은 이 규칙을 엄격하게 검사한다. 임의의 한 값을 고르는 함수로 오류만 피하기 전에, 그 컬럼이 그룹 안에서 정말 하나인지 함수 종속성을 확인해야 한다.

## 종합 실습: JOIN에서 분석 함수까지

교재 실습은 `student`, `enroll`, `customers`, `orders`, `emp` 데이터로 SQL 표현을 단계적으로 확장한다.

1. INNER·LEFT·RIGHT·FULL OUTER JOIN으로 수강 학생, 미수강 학생, 고아 수강을 구분한다.
2. `NOT EXISTS`로 DB 과목을 듣지 않은 학생을 찾는다.
3. 고객별 주문 건수·총액과 상위 10명을 집계한다.
4. SELF JOIN으로 직원과 매니저를 연결한다.
5. CROSS JOIN으로 학생×과목 추천 후보를 만들되 결과 크기를 제한한다.
6. `ROLLUP`과 `GROUPING`으로 학과·GPA 구간별 소계와 총계를 만든다.
7. 재귀 CTE로 CEO부터 직원까지 `depth`와 `path`를 만든다.
8. 학과별 GPA 상위 3명을 `ROW_NUMBER`, `RANK`, `DENSE_RANK`로 비교한다.
9. `LAG`로 이전 수강 과목 대비 성적 변화를 구한다.
10. 주문의 누적 합, 3개 주문 이동 평균, 고객별 누적 구매액을 구한다.

학과별 GPA 상위 3명 쿼리는 다음처럼 작성할 수 있다.

```sql
WITH ranked AS (
    SELECT
        student_id,
        name,
        major,
        gpa,
        ROW_NUMBER() OVER (
            PARTITION BY major
            ORDER BY gpa DESC, student_id
        ) AS row_no,
        RANK() OVER (
            PARTITION BY major
            ORDER BY gpa DESC
        ) AS rank_no,
        DENSE_RANK() OVER (
            PARTITION BY major
            ORDER BY gpa DESC
        ) AS dense_rank_no,
        COUNT(*) OVER (
            PARTITION BY major
        ) AS total_in_major
    FROM student
)
SELECT *
FROM ranked
WHERE row_no <= 3
ORDER BY major, row_no;
```

`ROW_NUMBER`는 정확히 세 명을 고르며 `student_id`로 동점 순서를 결정한다. `RANK <= 3`으로 필터링하면 3위 동점 때문에 세 명을 초과할 수 있다. 요구사항이 “세 명”인지 “3위까지 모두”인지에 따라 함수를 선택해야 한다.

```sql
WITH scored AS (
    SELECT
        student_id,
        course,
        CASE grade
            WHEN 'A' THEN 4
            WHEN 'B' THEN 3
            WHEN 'C' THEN 2
            WHEN 'D' THEN 1
            ELSE 0
        END AS score
    FROM enroll
),
compared AS (
    SELECT
        *,
        LAG(score) OVER (
            PARTITION BY student_id
            ORDER BY course
        ) AS previous_score,
        MAX(score) OVER (PARTITION BY student_id)
          - MIN(score) OVER (PARTITION BY student_id) AS score_range
    FROM scored
)
SELECT
    *,
    score - previous_score AS difference,
    CASE
        WHEN previous_score IS NULL THEN '첫 과목'
        WHEN score > previous_score THEN '상승'
        WHEN score = previous_score THEN '유지'
        ELSE '하락'
    END AS trend
FROM compared
ORDER BY student_id, course;
```

제출물에는 쿼리만이 아니라 결과 화면과 해석을 함께 남긴다. 특히 OUTER JOIN에서 `ON`과 `WHERE` 위치를 바꿨을 때 행 수가 어떻게 달라지는지, 순위 함수의 동점 처리와 Window Frame이 결과에 어떤 영향을 주는지를 설명할 수 있어야 한다.


---

이전 글: [1일차 — 관계형 데이터베이스와 모델링](/posts/skala-smart-data-day1/)

시리즈 안내: [스마트 데이터 이해 및 활용 — 4일 학습 로드맵](/posts/skala-smart-data-roadmap/)

다음 글: [3일차 — 인덱스, 실행 계획, SQL 튜닝, Lock](/posts/skala-smart-data-day3/)
