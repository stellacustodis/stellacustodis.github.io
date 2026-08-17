---
title: "[SKALA] 데이터 분석을 위한 Python — 2일 학습 로드맵"
date: 2026-08-06 08:00:00 +0900
categories:
  - SKALA
  - Python
tags: [skala, python, pydantic, asyncio, pandas, polars, duckdb, learning-log]
description: "Python 실행 구조와 자료구조·타입 힌트·비동기 수집 파이프라인(1일차), Pandas 2.x·Polars·DuckDB와 시각화·통계·자동화(2일차)로 이어지는 SKALA 데이터 분석 Python 과정의 2일 학습 로드맵"
permalink: /posts/skala-python-roadmap/
pin: false
---

SKALA 부트캠프 **AI의 서비스화 — 데이터 분석 및 AIOps** 트랙의 첫 모듈인 **데이터 분석을 위한 Python 이해**는 8월 6일(목)과 7일(금) 이틀에 걸쳐 진행됐다.

이 과정을 정리하는 방식은 앞선 시리즈들과 조금 다르다. Python은 내 주 언어이고 문법과 환경 설정은 이미 손에 익어 있어서, 강의 내용을 순서대로 옮기는 것은 나에게도 읽는 사람에게도 의미가 없다고 판단했다. 대신 다음 세 가지에 초점을 맞췄다.

1. **아는 것은 압축하고, 새로 배운 것에 지면을 준다** — 문법·제어문·자료구조 기초는 표 한두 개로 줄이고, 데이터 계층(Pydantic 스키마 검증, Parquet·Arrow, Polars Lazy, DuckDB)에 분량을 몰았다
2. **"왜 이 도구인가"를 남긴다** — 도구 사용법은 문서를 보면 되지만, 어떤 실패를 겪고 이 도구로 옮겨왔는지는 기록해 두지 않으면 사라진다
3. **직접 측정한 값과 슬라이드의 주장을 대조한다** — 종합실습에서 CSV와 Parquet의 저장·읽기 성능을 직접 쟀는데, 결과가 강의자료의 일반론과 반대로 나왔다. 이런 지점을 얼버무리지 않고 그대로 남긴다

> 강의자료는 개념 지도를 잡는 참고 자료로 쓰고, 설명·예제·수치는 공식 문서와 직접 실행 결과로 확인해 재구성했다. 본문에서 "직접 확인해 보니"로 시작하는 대목은 슬라이드의 서술을 실제 실행 결과와 대조해 바로잡은 부분이다.
{: .prompt-info }

## 전체 흐름

| 일차 | 날짜 | 핵심 주제 | 도달 목표 |
|---|---|---|---|
| 1일차 | 8/6 (목) | 실행 구조, 자료구조·컴프리헨션, 함수·파일·예외, 타입 힌트와 Pydantic, 코드 품질, 비동기·병렬 | **신뢰할 수 있는 수집·검증 파이프라인**을 혼자 만들 수 있다 |
| 2일차 | 8/7 (금) | Pandas 2.x, Polars·DuckDB·Arrow, 시각화, 기초 통계와 ML 파이프라인, 분석 자동화 | 수집한 데이터를 **분석하고 결과를 재현 가능하게 전달**한다 |

두 날의 관계는 데이터가 흘러가는 방향 그대로다.

```text
[1일차]  데이터를 "믿을 수 있게" 만든다
   실행 구조를 이해한다              인터프리터 · 바이트코드 · PVM · venv
     → 메모리 안에서 다룬다          list/dict/set/deque · 컴프리헨션 · 제너레이터
       → 파일과 예외를 다룬다        pathlib · CSV/JSON/Parquet · logging · .env
         → 경계에서 검증한다         타입 힌트 → Pydantic v2
           → 품질을 고정한다         Ruff · pytest · pre-commit
             → 빠르게 수집한다       asyncio + httpx (GIL을 피해서)

[2일차]  믿을 수 있는 데이터를 "쓸모 있게" 만든다
   탐색한다                        Pandas 2.x (EDA · 결측치 · groupby)
     → 규모를 키운다                Polars Lazy · DuckDB · Arrow
       → 보여준다                   Matplotlib · Seaborn · Plotly · Altair
         → 검정하고 모델에 넘긴다     scipy.stats · sklearn Pipeline
           → 자동화하고 공유한다      schedule · Jinja2 · 프로젝트 구조 · README
```

1일차의 마지막 화살표가 이 과정의 설계 의도를 보여준다. 비동기 수집을 **맨 뒤에** 배치한 것은 순서상 우연이 아니다. 검증되지 않은 데이터를 100배 빠르게 모아 봐야 100배 빠르게 쓰레기가 쌓일 뿐이라, **경계에서의 검증(Pydantic)을 먼저 세우고 그다음에 처리량을 올린다**는 순서다. 실제로 1일차 종합실습은 이 순서를 그대로 따라간다.

2일차의 구도는 다르다. **여섯 주제가 전부 "같은 데이터를 다른 도구로 다시 다루는" 반복**이다. Pandas로 하던 집계를 Polars Lazy로, 다시 DuckDB SQL로 옮겨 쓰고 실행 시간을 비교한다. 도구를 늘리는 것이 목적이 아니라 **언제 무엇을 고를지에 대한 기준**을 만드는 것이 목적이다.

## 다루는 범위

**1일차 — 신뢰할 수 있는 파이프라인 만들기**

- 실행 구조: 소스 → AST → 바이트코드 → PVM, `dis`·`ast` 모듈, `__pycache__`가 생기는 이유, 참조 카운팅과 GC
- 개발 환경: venv 격리, `requirements.txt`, `.gitignore`에 무엇을 넣고 무엇을 빼는가
- 자료구조: list/tuple/set/dict/deque의 내부 구조와 복잡도, `collections`(Counter·defaultdict), heapq·bisect
- 컴프리헨션과 제너레이터: 메모리 프로파일 차이, 스트리밍 처리 패턴
- 함수: 일급 객체, 클로저, `*args`/`**kwargs`, 데코레이터와 `functools.wraps`, `lru_cache`
- 파일과 예외: `pathlib`, CSV/JSON/Parquet, 사용자 정의 예외, `logging` 핸들러 구성, `.env`와 비밀값 분리
- **타입 힌트와 Pydantic v2**: `Optional`/`Union`/`Literal`/`Protocol`/`Generic`, mypy, `BaseModel`·`Field`·`model_validator`, 판별자 union
- 코드 품질: Ruff, pytest와 `MockTransport`, pre-commit, GitHub Actions
- 비동기와 병렬: 동시성 vs 병렬성, GIL이 걸리는 지점과 풀리는 지점, `asyncio.gather`, `ProcessPoolExecutor`, `timeit`·`cProfile`
- **종합실습**: 공개 API 3개 비동기 수집 → Pydantic 검증 → CSV·Parquet 저장 및 성능 비교

**2일차 — 분석하고 전달하기**

- Pandas 2.x/3.x: 기초 EDA, 결측치와 IQR 이상치, `groupby`+named aggregation, `pivot_table`, `merge`, **Copy-on-Write**, `apply` vs 벡터화
- Polars: Eager vs Lazy, `scan_csv`와 predicate/projection pushdown, Pandas 문법 대응표
- DuckDB: 파일에 직접 SQL, 와일드카드 스캔, `.df()`/`.pl()` 변환
- Apache Arrow: 컬럼형 인메모리 포맷과 제로카피, Parquet이 빠른 이유
- 시각화: Matplotlib의 Figure/Axes 모델, Seaborn, Plotly Express, Altair, 도구 선택 기준
- 기초 통계와 ML: 기술통계와 왜도·첨도, t-test와 카이제곱, CRISP-DM, `sklearn` Pipeline과 `ColumnTransformer`, joblib
- 자동화와 구조화: `schedule`, Jinja2 리포트, ETL 단계 분리, 분석 프로젝트 폴더 구조와 README
- **종합실습**: 공개 데이터셋 하나로 로딩 → EDA → 시각화 → 검정 → ML Pipeline → 리포트 자동 생성

## 이 시리즈에서 바로잡은 것들

강의자료를 공식 문서·실행 결과와 대조하면서 몇 군데를 수정해 적었다. 세부 근거는 각 글에 달아 두었고, 목록만 먼저 정리한다.

**1일차**

| 구분 | 슬라이드 | 확인 결과 |
|---|---|---|
| 개념 | Python 활용 불가 사유로 "Garbage Collection으로 인한 오류 발생 가능 多 (Global Interpreter Lock이 걸릴 때…)" | GC와 GIL은 **서로 다른 메커니즘**이다. GC는 메모리 회수, GIL은 바이트코드 실행 직렬화이며 인과관계가 없다 |
| 개념 | deque의 구현을 "Doubly Linked List" | 노드 하나에 값 하나가 아니라 **고정 크기 배열 블록들의 이중 연결 리스트**다. 같은 자료에 뒤이어 나오는 [참고] 슬라이드가 이 점을 바로잡고 있다 |
| 수치 | 8코어 `ProcessPoolExecutor` → "이론상 8× 속도 향상" | 프로세스 생성과 직렬화 비용을 빼야 한다. 작업당 계산량이 작으면 오히려 느려진다 |

**2일차**

| 구분 | 슬라이드 | 확인 결과 |
|---|---|---|
| 버전 | "Copy-on-Write는 Pandas 2.0부터 기본 활성화" | 2.0에서는 **옵트인**(`pd.options.mode.copy_on_write = True`)이었고, **기본값이 된 것은 3.0**이다 |
| 코드 | `df_seoul = df[mask]` 다음 줄 `df_seoul['amount'] = ...`에 "# 경고!" | CoW에서는 이 코드가 **경고 없이 정상 동작**한다. `ChainedAssignmentError`는 `df[mask]['amount'] = ...`처럼 실제로 체이닝했을 때 나온다 (pandas 3.0.3에서 직접 확인) |
| 수치 | Parquet은 "CSV 대비 10× 빠른 읽기, 5× 작은 파일" | 대용량 기준의 일반론이다. 1일차 종합실습에서 72행을 측정했더니 쓰기·읽기·파일 크기 **모두 CSV가 우세**했다 |
| API | Polars 집계 예제의 `pl.count()` | 현재 권장 API는 `pl.len()`이다. `pl.count()`는 deprecated |

이 외에도 자료구조 비교표의 라벨 오기(set 슬라이드 제목이 `tuple`), 섹션 번호 중복(비동기 파트 슬라이드가 "11. 병렬처리" 머리말을 달고 있는데 정작 11번은 "기초 통계와 ML") 같은 편집상의 문제가 있었으나, 내용 이해에 지장이 없어 본문에서는 다루지 않았다.

> 이 자료는 2일에 320쪽을 소화해야 하는 밀도의 교육용 슬라이드다. 위 정정은 자료의 품질을 문제 삼는 것이 아니라, **압축 과정에서 생긴 부정확함을 현재 버전 기준으로 되돌려 놓는 작업**에 가깝다. 실제로 Ruff를 2026년 표준으로 제시하거나, Polars·DuckDB·Arrow를 Pandas의 대안이 아니라 **한 생태계**로 묶어 설명한 대목은 시의적절하고 정확했다.
{: .prompt-tip }

## 실습 환경

- macOS + VS Code, Python 3.11.15 (프로젝트별 `.venv`)
- 주요 패키지: httpx 0.28.1, pydantic 2.13.4, pandas 3.0.3, pyarrow 21.0.0, pytest 9.0.3, ruff 0.15.1
- 코드 품질: Ruff(`E`, `F`, `I`, `UP`, `B` 규칙), pytest, Git

강의자료의 예제는 Pandas 2.x를 기준으로 하지만 실제 실습 환경에는 **pandas 3.0.3**이 설치되어 있었다. Copy-on-Write처럼 두 버전 사이에서 동작이 달라진 항목은 3.0 기준으로 다시 확인해 적었다.

## 글을 정리하는 기준

- 문법·제어문 같은 기초는 **표와 요약으로 압축**한다. 지면은 새로 배운 것에 쓴다.
- 실습 코드는 **실제로 제출한 것만** 싣는다. 2일차 종합실습은 이 글을 쓰는 시점에 진행 중이라, 요구사항과 접근 방향까지만 적고 결과는 비워 뒀다.
- 성능 수치는 **내가 측정한 값**과 **자료가 인용한 일반론**을 구분해 표기한다.

## 이어지는 글

다음 글: [1일차 — 실행 구조부터 비동기 수집 파이프라인까지](/posts/skala-python-day1/)

이어 읽기: [2일차 — Pandas·Polars·DuckDB와 분석 파이프라인](/posts/skala-python-day2/)

관련 시리즈: [스마트 데이터 이해 및 활용 — 4일 학습 로드맵](/posts/skala-smart-data-roadmap/) · [데이터 분석 개요 및 기초통계 — 2일 학습 로드맵](/posts/skala-statistics-roadmap/)
