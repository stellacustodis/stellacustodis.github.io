---
title: "[SKALA] 스마트 데이터 이해 및 활용 2일차 — JOIN부터 Window Function까지"
date: 2026-07-29 09:00:00 +0900
categories:
  - SKALA
  - Database
tags: [skala, database, sql, join, subquery, cte, view, window-function, postgresql]
description: "집계와 그룹화, JOIN 종류와 알고리즘, 서브쿼리, 집합 연산자, CTE, View, Materialized View, Window Function을 주문 데이터 예제로 정리한다."
permalink: /posts/skala-smart-data-day2/
---

## 오늘의 질문

1일차에는 현실의 요구사항을 테이블과 관계로 표현했다. 2일차에는 나누어 저장한 데이터를 다시 연결해 **업무에서 필요한 정보로 만드는 방법**을 배운다.

예를 들어 다음 질문에 SQL로 답하는 것이 오늘의 목표다.

- 고객별 주문 횟수와 총구매액은 얼마인가?
- 한 번도 주문하지 않은 고객은 누구인가?
- 각 고객의 가장 최근 주문은 무엇인가?
- 월별 매출과 누적 매출은 어떻게 계산하는가?
- 각 카테고리에서 매출이 높은 상품 3개는 무엇인가?

단순히 문법을 나열하기보다 1일차에 만든 쇼핑몰 모델을 계속 사용해 각 기능이 어떤 문제를 해결하는지 살펴본다.

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


---

이전 글: [1일차 — 관계형 데이터베이스와 모델링](/posts/skala-smart-data-day1/)

시리즈 안내: [스마트 데이터 이해 및 활용 — 4일 학습 로드맵](/posts/skala-smart-data-roadmap/)
