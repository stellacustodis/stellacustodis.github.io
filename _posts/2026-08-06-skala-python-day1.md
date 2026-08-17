---
title: "[SKALA] 데이터 분석 Python 1일차 — 실행 구조부터 비동기 수집 파이프라인까지"
date: 2026-08-06 09:00:00 +0900
categories:
  - SKALA
  - Python
tags: [skala, python, pydantic, asyncio, httpx, gil, generator, decorator, ruff, pytest]
description: "인터프리터 실행 구조와 자료구조·제너레이터, 데코레이터와 예외·로깅, 타입 힌트와 Pydantic v2 검증, Ruff·pytest 품질 도구, 그리고 GIL을 기준으로 갈라지는 비동기·병렬 처리를 거쳐 세 개의 공개 API를 수집·검증·저장하는 파이프라인을 만들기까지 정리한다."
permalink: /posts/skala-python-day1/
mermaid: true
---

이 글은 Python 입문 정리가 아니다. Python은 내 주 언어이고, 이 과정의 문법·제어문·환경 설정 파트는 확인하며 넘기는 수준으로 읽었다. 그래서 이미 아는 것은 표로 압축하고, **이 과정에서 실제로 새로 얻은 것** — 경계에서의 스키마 검증, 비동기 수집, 그리고 그 둘을 하나의 파이프라인으로 묶는 설계 — 에 지면을 몰았다.

하루의 구성 자체가 그 순서를 그대로 따라간다.

```text
실행 구조 → 자료구조 → 함수·파일·예외 → 타입 힌트/Pydantic → 코드 품질 → 비동기
                                                                        ↓
                                            [종합실습] 공개 API 3종 수집·검증·저장 파이프라인
```

비동기 수집이 **맨 마지막**에 온다는 점이 이 커리큘럼의 설계 의도를 보여준다. 검증 없이 처리량만 올리면 잘못된 데이터가 더 빨리 쌓일 뿐이므로, 경계 검증을 먼저 세우고 나서 속도를 붙이는 순서다.

## Python은 어떻게 실행되는가

### 인터프리터라는 말이 가리는 것

"Python은 인터프리터 언어"라는 설명은 절반만 맞다. CPython은 소스를 한 줄씩 해석하는 것이 아니라 **먼저 전부 컴파일한 뒤 바이트코드를 실행**한다.

```text
소스코드(.py)
   ↓ 파싱(Parser)
AST (Abstract Syntax Tree)
   ↓ 컴파일
바이트코드 (.pyc)
   ↓ 실행
PVM (Python Virtual Machine, 스택 기반)
   ↓
실행 결과
```

이 구조를 직접 눈으로 확인할 수 있다는 점이 Python의 좋은 특성이다.

```python
import ast, dis

# 1. AST: 소스의 구조
tree = ast.parse("x = a + b")
print(ast.dump(tree, indent=2))

# 2. 바이트코드: PVM이 실제로 실행하는 명령
def add(x, y):
    return x + y

dis.dis(add)
#   LOAD_FAST    0 (x)
#   LOAD_FAST    1 (y)
#   BINARY_OP    0 (+)
#   RETURN_VALUE
```

PVM은 **스택 머신**이다. `LOAD_FAST`가 값을 스택에 올리고, `BINARY_OP`가 두 개를 꺼내 더한 결과를 다시 올리고, `RETURN_VALUE`가 그것을 반환한다. 레지스터 할당이 없으므로 명령 하나하나는 단순하지만 그만큼 명령 수가 많다.

`__pycache__/*.pyc`가 생기는 이유도 여기서 나온다. **모듈을 임포트할 때 컴파일 결과를 캐시**해 두는 것이라, 다음 실행에서 파싱·컴파일 단계를 건너뛴다. 직접 실행하는 최상위 스크립트는 캐시되지 않는다.

```bash
python -m py_compile hello.py
# __pycache__/hello.cpython-311.pyc 생성
```

바이트코드를 볼 줄 알면 "왜 이게 더 빠른가"에 대해 추측 대신 근거를 댈 수 있다. 컴프리헨션이 `for` 루프보다 빠른 이유는 마법이 아니라, 루프마다 반복되던 `LOAD_METHOD append` / `CALL` 쌍이 전용 명령으로 대체되고 이름 조회 횟수가 줄기 때문이다.

### 메모리 모델과 GC — 그리고 GIL과의 혼동

Python의 모든 값은 객체이고, 객체는 최소한 세 가지를 들고 있다.

| 필드 | 내용 |
|---|---|
| `type` | 자료형 정보 포인터 |
| `refcount` | 이 객체를 가리키는 참조의 수 |
| `value` | 실제 데이터 |

메모리 회수는 두 겹이다. **참조 카운팅**이 즉시 회수를 담당하고, 참조 카운팅이 잡지 못하는 **순환 참조**를 세대별 GC가 주기적으로 수거한다.

> 강의자료는 Python을 쓰기 어려운 분야를 설명하면서 "Garbage Collection으로 인한 오류 발생 가능 多 (Global Interpreter Lock이 걸릴 때…)"라고 적고 있다. 확인해 보니 이 두 가지는 **서로 다른 메커니즘**이다. GC는 도달 불가능한 객체의 메모리를 회수하는 일이고, GIL은 인터프리터 상태를 보호하기 위해 바이트코드 실행을 직렬화하는 락이다. 실시간 시스템에서 Python이 불리한 것은 사실이지만 그 이유는 **GC의 stop-the-world 구간이 예측하기 어렵다**는 것이고, GIL은 그와 별개로 **CPU 바운드 멀티스레딩의 확장을 막는다**는 다른 문제다. 원인을 하나로 합쳐 두면 나중에 둘 중 어느 쪽을 손봐야 할지 판단할 수 없게 된다.
{: .prompt-warning }

### venv를 쓰는 실질적 이유

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

이 세 줄의 실질적 효과는 "패키지 정리"가 아니라 **`sys.path`와 인터프리터 경로의 고정**이다. `ModuleNotFoundError`의 대다수는 패키지가 없어서가 아니라 다른 인터프리터를 보고 있어서 발생하고, 그래서 진단의 첫 줄이 항상 `which python`이다.

`.gitignore`와 `requirements.txt`의 역할 분담도 명확하다.

```gitignore
.venv/            # 환경 자체는 커밋하지 않는다 (플랫폼 종속)
__pycache__/
*.py[cod]
.env              # 비밀값
data/*.csv        # 원본 데이터
data/*.parquet
```

**환경은 커밋하지 않고 환경을 만드는 방법을 커밋한다.** `.venv/`는 무시하되 `requirements.txt`는 반드시 올린다.

## 자료구조 — 복잡도로 고르기

기초 자료구조는 표로 압축한다. 실무에서 실제로 결정에 쓰이는 것은 특징 나열이 아니라 **내부 구조와 복잡도**다.

| 자료형 | 내부 구조 | 접근 | 삽입/삭제 | 고르는 기준 |
|---|---|---|---|---|
| `list` | 동적 배열 | O(1) | 끝 O(1) amortized / 앞·중간 O(n) | 순서가 있고 인덱싱이 필요할 때 |
| `tuple` | 고정 배열 | O(1) | 불가 | 해시 가능해야 할 때 (dict 키, set 원소) |
| `set` | 해시 테이블 | — | O(1) 평균 | 중복 제거, 멤버십 검사 |
| `dict` | 해시 테이블 | O(1) 평균 | O(1) 평균 | 키-값, 3.7+ 삽입 순서 보장 |
| `deque` | 배열 블록의 이중 연결 | O(n) | 양 끝 O(1) | 큐·스택·슬라이딩 윈도우 |

`list.insert(0, x)`와 `list.pop(0)`이 O(n)인 것은 동적 배열의 성질 때문이다. 앞에 자리를 만들려면 뒤의 원소를 전부 한 칸씩 밀어야 한다. 큐가 필요하면 `deque`를 쓴다.

> 슬라이드는 `deque`의 구현을 "Doubly Linked List"라고 적었다가, 바로 다음 [참고] 슬라이드에서 **"실제로는 linked list of arrays"**라고 스스로 정정한다. 후자가 정확하다. CPython의 `deque`는 노드 하나에 값 하나를 담는 연결 리스트가 아니라 **고정 크기 배열 블록을 이중으로 연결한 구조**여서, 양 끝 O(1)을 보장하면서도 순회할 때 캐시 지역성을 잃지 않는다. 인덱싱이 O(n)인 것은 블록을 건너뛰며 찾아가야 하기 때문이다.
{: .prompt-info }

### collections — 집계 코드가 짧아지는 지점

```python
from collections import Counter, defaultdict

# 빈도 계산
Counter(["a", "b", "a", "c", "b", "a"]).most_common(2)
# [('a', 3), ('b', 2)]

# 그룹핑: 키 존재 확인이 사라진다
by_category = defaultdict(list)
for row in sales:
    by_category[row["category"]].append(row["amount"])
```

`defaultdict`의 가치는 코드가 짧아지는 것보다 **`if key not in d` 분기가 사라진다**는 데 있다. 분기가 없으면 그 분기에서 생길 버그도 없다.

`heapq`(우선순위 큐)와 `bisect`(정렬된 리스트의 이진 탐색)도 함께 다뤘다. 둘 다 리스트를 그대로 쓰면서 알고리즘만 얹는 형태라 별도 자료구조 클래스를 만들 필요가 없다.

```python
import heapq
heap = []
heapq.heappush(heap, 5)
heapq.heappush(heap, 2)
heapq.heappop(heap)   # 2 — 최소 힙

# 최대 힙은 부호를 뒤집는다
max_heap = []
heapq.heappush(max_heap, -5)
-heapq.heappop(max_heap)   # 5
```

## 컴프리헨션과 제너레이터

컴프리헨션은 문법 설탕이 아니라 **바이트코드 수준에서 다른 코드**다. 그리고 제너레이터는 그 컴프리헨션을 메모리에서 떼어낸 것이다.

```python
import sys

lst = [x ** 2 for x in range(10_000_000)]   # 리스트: 수백 MB
gen = (x ** 2 for x in range(10_000_000))   # 제너레이터: 수백 바이트

sys.getsizeof(lst)   # 리스트 객체 크기 (원소 객체는 별도)
sys.getsizeof(gen)   # 상수 — 원소 수와 무관
```

`sys.getsizeof`는 **얕은(shallow) 크기**만 잰다. 리스트의 경우 포인터 배열의 크기이고 원소 객체 자체는 포함되지 않으므로, 실제 사용량은 이보다 크다. 그럼에도 두 값의 차이는 명확한데, 제너레이터는 **원소 수와 무관하게 상수**이기 때문이다.

스트리밍 처리의 기본형은 이렇게 생겼다.

```python
def read_rows(path):
    with open(path) as f:
        next(f)                       # 헤더 스킵
        for line in f:
            yield line.strip().split(",")

# 파일 전체를 메모리에 올리지 않고 한 행씩
total = sum(float(r[2]) for r in read_rows("large.csv"))
```

### [실습 1] 자료구조 집계 · 컴프리헨션 · 제너레이터

첫 실습은 판매 데이터 JSON을 대상으로 네 가지를 요구했다. ① 컴프리헨션으로 필터링 후 지역별 총매출 집계, ② `Counter`와 `defaultdict` 활용, ③ 제너레이터와 리스트의 메모리 비교, ④ 월·카테고리 기준 그룹핑과 상위 3개 추출.

문제 자체는 어렵지 않았고, 오히려 신경 쓴 부분은 **체크포인트를 어떻게 의미 있게 만들 것인가**였다. 제출 코드에서 1번 체크포인트를 다음처럼 바꿨다.

```python
# 컴프리헨션으로 계산한 결과
regional_sales = {
    d["region"]: sum(
        item["amount"] for item in filtered_data if item["region"] == d["region"]
    )
    for d in filtered_data
}

# 같은 값을 누적 방식으로 독립 계산
expected_sales: defaultdict[str, int] = defaultdict(int)
for d in filtered_data:
    expected_sales[d["region"]] += d["amount"]

# 두 계산 방식이 독립적이므로, 집계가 틀리면 실제로 assert가 깨진다
assert regional_sales == dict(expected_sales)
```

원래 과제 예시는 계산 결과를 그대로 다시 출력하는 형태였는데, 그러면 **자기 자신과 비교하는 셈이라 어떤 오류도 잡히지 않는다**. 서로 다른 두 방법으로 같은 값을 구해 비교해야 검증이 성립한다. 다만 위 컴프리헨션 자체는 지역 수만큼 전체를 다시 훑으므로 O(n·k)다. 검증용 대조군으로는 적절하지만 실제 집계에는 `defaultdict` 쪽을 쓰는 것이 맞다.

3번의 메모리 비교에서는 채점 기준에 "제너레이터를 list로 변환해 비교하면 감점"이라는 항목이 있었다. 당연한데, `list(generator())`로 바꾸는 순간 측정 대상이 리스트가 되어 비교의 의미가 사라진다.

```python
generator_size = sys.getsizeof(generator())      # 제너레이터 객체 그대로
list_size = sys.getsizeof(list_version())
assert generator_size < list_size
```

데이터 경로도 실행 위치가 아니라 **스크립트 위치 기준**으로 고정했다.

```python
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_PATH = BASE_DIR / "Python_Practice1_Data.json"
```

`Path("data.json")`은 현재 작업 디렉터리를 기준으로 하므로 어디서 실행하느냐에 따라 결과가 달라진다. 채점자가 다른 디렉터리에서 실행할 수 있는 과제라면 이 차이가 곧 실행 실패다.

> 평소 손이 잘 가지 않던 `Counter`와 `defaultdict`를 실제로 써 보니 집계 코드의 분기가 눈에 띄게 줄었다. 제너레이터와 리스트의 메모리를 직접 재 본 것도, 개념으로만 알던 차이를 수치로 확인하는 계기가 됐다.
{: .prompt-tip }

## 함수 — 일급 객체에서 데코레이터까지

Python에서 함수는 일급 객체다. 변수에 담기고, 인자로 전달되고, 반환값이 된다. 이 성질 위에 클로저와 데코레이터가 올라간다.

```python
# 클로저: 내부 함수가 외부 스코프의 변수를 붙잡는다
def make_multiplier(n):
    def multiply(x):
        return x * n        # n을 기억
    return multiply

double = make_multiplier(2)
double(5)   # 10
```

데코레이터는 "함수를 받아 함수를 반환하는 함수"에 `@` 문법을 붙인 것뿐이다. 실무에서 가치가 있는 것은 **분석 파이프라인의 공통 관심사를 본체에서 분리**할 수 있다는 점이다.

```python
import time
from functools import wraps, lru_cache

def timer(func):
    @wraps(func)                     # 원본의 __name__·__doc__ 보존
    def wrapper(*args, **kwargs):
        t = time.perf_counter()
        result = func(*args, **kwargs)
        print(f"{func.__name__}: {time.perf_counter() - t:.3f}s")
        return result
    return wrapper

@timer
def load_data(path):
    return pd.read_parquet(path)

@lru_cache(maxsize=128)              # 같은 인자면 재계산 생략
def expensive_stats(key): ...
```

`functools.wraps`를 빼면 `load_data.__name__`이 `"wrapper"`가 된다. 로깅·디버깅·문서 생성이 전부 이 메타데이터를 읽으므로, 빼먹으면 데코레이터를 붙인 함수만 추적이 끊긴다. 데코레이터를 체이닝할 때는 더 중요해진다.

시간 측정에 `time.time()` 대신 `time.perf_counter()`를 쓴 이유는 전자가 벽시계라 NTP 보정이나 시스템 시각 변경에 영향을 받기 때문이다. **경과 시간 측정에는 단조 증가가 보장되는 `perf_counter`**를 쓴다.

`lru_cache`는 인자를 키로 쓰므로 인자가 해시 가능해야 하고, 캐시가 참조를 붙들고 있어 큰 객체를 반환하는 함수에 붙이면 메모리가 계속 늘어난다. `maxsize`를 명시하는 이유다.

## 파일·예외·로깅·환경변수

### 경로와 포맷

```python
from pathlib import Path
import json, csv
import pandas as pd

data_dir = Path("data")

with open(data_dir / "resp.json") as f:      # / 연산자로 경로 결합
    data = json.load(f)

with open(data_dir / "sales.csv") as f:
    rows = list(csv.DictReader(f))            # 헤더를 키로

df = pd.read_parquet(data_dir / "sales.parquet")
```

`csv.reader`가 아니라 `csv.DictReader`를 쓰면 열 순서 변경에 코드가 깨지지 않는다. CSV를 열 때 `newline=""`을 지정하는 것도 관례가 아니라 필수인데, 빼면 플랫폼에 따라 빈 줄이 끼어든다.

### 예외 — 계층으로 잡는다

```python
class DataValidationError(ValueError):        # 의미 있는 부모를 고른다
    def __init__(self, col, val):
        super().__init__(f"{col}={val} 검증 실패")

def safe_load(path):
    try:
        df = pd.read_parquet(path)
        if df.empty:
            raise DataValidationError("rows", "0")
        return df
    except FileNotFoundError:
        logger.error(f"파일 없음: {path}")
        return None
    except DataValidationError as e:
        logger.warning(str(e))
        return None
    finally:
        logger.info(f"로딩 시도: {path}")
```

핵심은 세 가지다. **`except Exception`으로 뭉뚱그리지 않는다** — 예상한 실패만 잡고 예상 못 한 것은 위로 올려보내야 버그가 드러난다. **사용자 정의 예외는 의미 있는 부모를 상속한다** — 위에서 `ValueError`를 고른 것은 호출자가 `except ValueError`로도 잡을 수 있게 하기 위해서다. **`finally`는 성공/실패와 무관하게 실행된다.**

### 로깅 — print를 대체하는 이유

`print`가 안 되는 이유는 취향이 아니라 기능이다. 레벨 구분이 없고, 출력 대상을 바꿀 수 없고, 시각·파일명·줄번호 같은 맥락이 붙지 않는다.

```python
import logging
from logging.handlers import TimedRotatingFileHandler

logger = logging.getLogger("pipeline")
logger.setLevel(logging.DEBUG)

console = logging.StreamHandler()                    # 콘솔: INFO 이상
console.setLevel(logging.INFO)

file_handler = TimedRotatingFileHandler(             # 파일: DEBUG 이상, 자정마다 회전
    "logs/pipeline.log", when="midnight",
    backupCount=7, encoding="utf-8")
file_handler.setLevel(logging.DEBUG)

error_handler = logging.FileHandler("logs/error.log")  # 에러만 따로
error_handler.setLevel(logging.ERROR)
```

**로거의 레벨과 핸들러의 레벨이 따로 있다**는 점이 처음에는 헷갈리는 부분이다. 로거 레벨이 1차 관문이고, 통과한 레코드가 각 핸들러의 레벨로 다시 걸러진다. 그래서 로거를 `DEBUG`로 열어 두고 핸들러별로 조절하는 구성이 나온다.

라이브러리·모듈 코드에서는 `logging.basicConfig()`나 루트 로거를 건드리지 않고 `logging.getLogger(__name__)`만 쓰는 것이 맞다. 설정은 애플리케이션 진입점의 몫이다.

### .env — 비밀값 분리

```python
from dotenv import load_dotenv
import os

load_dotenv()
api_key = os.getenv("API_KEY")
env = os.getenv("ENV", "development")   # 기본값
```

`.env`는 `.gitignore`에, `.env.example`은 커밋한다. 후자는 **어떤 키가 필요한지에 대한 문서**이자 팀원이 환경을 재현하는 출발점이다. GitHub Actions에서는 Secrets가 같은 역할을 한다.

## 타입 힌트와 Pydantic v2

여기부터가 이 과정에서 내가 실제로 얻어 간 부분이다.

### 타입 힌트는 런타임에 아무것도 하지 않는다

```python
def compute_avg(values: list[float]) -> float:
    return sum(values) / len(values)

compute_avg(["a", "b"])   # 런타임에 그대로 실행되고 TypeError로 터진다
```

타입 힌트는 **주석에 가깝다.** mypy나 Pylance 같은 정적 검사기가 읽을 때만 의미가 생긴다. 이 사실이 중요한 이유는, 외부에서 들어오는 데이터(API 응답, CSV 행, 사용자 입력)에 대해 **타입 힌트만으로는 아무 보장도 얻지 못한다**는 뜻이기 때문이다. 그 자리가 Pydantic의 자리다.

자주 쓰는 표기를 정리하면 이렇다.

| 표기 | 의미 | 비고 |
|---|---|---|
| `list[str]`, `dict[str, Any]` | 컨테이너 | 3.9+ 내장 제네릭 |
| `Optional[int]` = `int \| None` | 값이 없을 수 있음 | 결측치 표현 |
| `Union[str, int]` = `str \| int` | 여러 타입 중 하나 | 3.10+ `\|` 문법 |
| `Literal["mean", "median"]` | 정해진 값만 | enum의 가벼운 대안 |
| `Callable[[int, int], int]` | 함수 시그니처 | 고차 함수 인자 |
| `Protocol` | 구조적 타이핑 | 상속 없이 인터페이스 |
| `Any` | 검사 포기 | 최소한으로 |

`Protocol`은 상속 관계 없이 "이 메서드를 가진 객체"를 타입으로 표현한다. 덕 타이핑을 정적으로 검사할 수 있게 만든 것이라, 외부 라이브러리 객체를 받는 함수에 특히 쓸모가 있다.

```python
from typing import Protocol

class SupportsWrite(Protocol):
    def write(self, s: str) -> None: ...

def write_hello(writer: SupportsWrite) -> None:
    writer.write("Hello\n")

class FileLike:                       # Protocol을 상속하지 않아도 통과
    def write(self, s: str) -> None:
        print(f"Writing: {s}")

write_hello(FileLike())
```

### Pydantic v2 — 경계에서 한 번만 검증한다

Pydantic의 설계 원칙은 한 문장으로 요약된다. **신뢰할 수 없는 데이터는 시스템 경계에서 한 번 검증하고, 내부에서는 검증된 모델만 다닌다.**

```python
from pydantic import BaseModel, Field, ValidationError

class SalesRecord(BaseModel):
    month: str = Field(min_length=1)
    region: str = Field(min_length=1)
    amount: float = Field(gt=0)
    category: str | None = None       # 없어도 됨

r = SalesRecord.model_validate({"month": "2024-01", "region": "서울", "amount": 1500})
r.model_dump()   # dict로

SalesRecord(month="", region="서울", amount=-100)
# ValidationError: 어느 필드가 왜 실패했는지 필드별로 보고
```

`ValidationError`가 **모든 실패를 모아서** 보고한다는 점이 실무에서 유용하다. 첫 오류에서 멈추지 않으므로 한 번의 실행으로 문제를 전부 볼 수 있다.

### [실습 2] 파일 I/O · 예외 처리 · Pydantic 검증 파이프라인

두 번째 실습은 ① `safe_load_csv()`로 안전한 파일 읽기, ② `SalesRecord` 모델 정의, ③ 유효/오류 분리 파이프라인, ④ CSV·JSON 저장 후 재로딩 검증이었다.

첫 실습에서는 문제마다 독립적인 함수를 만들었는데, 이번에는 그 방식이 잘 맞지 않았다. 로딩 → 검증 → 저장 → 재로딩이 앞 단계의 출력을 뒤가 그대로 받는 구조라, 함수를 병렬로 늘어놓으니 데이터를 주고받는 배선이 복잡해졌다. 그래서 **하나의 파이프라인 함수로 묶고 각 단계를 그 안에서 호출**하는 형태로 다시 짰다.

```python
def run_pipeline(data_path, valid_output_path, errors_output_path):
    """JSON 로딩 → Pydantic 검증 → 결과 저장 → 재로딩을 한 번에 실행합니다."""
    loaded_data = safe_load_csv(data_path)
    if loaded_data is None:
        print(f"[중단] 데이터 파일을 읽지 못했습니다: {data_path}")
        return None                          # 예외가 아니라 반환값으로 신호
    raw_data = build_checkpoint_raw_data(loaded_data)
    valid_records, errors = validate_records(raw_data)
    return save_and_reload(valid_records, errors, valid_output_path, errors_output_path)
```

로딩 함수는 실패를 예외가 아니라 `None`으로 표현하도록 과제가 지정했다. 이 계약을 지키려면 잡을 예외를 명시적으로 나열해야 한다.

```python
def safe_load_csv(file_path: Path) -> list[dict[str, Any]] | None:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list) or not all(isinstance(row, dict) for row in data):
            logger.error("JSON data must be a list of dictionaries: %s", file_path)
            return None
        logger.info("Successfully loaded data from %s", file_path)
        return data
    except FileNotFoundError:
        logger.error("File not found: %s", file_path)
        return None
    except json.JSONDecodeError as e:
        logger.error("JSON decode error in %s: %s", file_path, e)
        return None
    except OSError as e:
        logger.error("Failed to read %s: %s", file_path, e)
        return None
    finally:
        print("로딩 종료")
```

**타입이 파싱에 성공했다고 스키마가 맞는 것은 아니다.** `json.load()`는 최상위가 스칼라든 객체든 통과시키므로, 리스트-오브-딕셔너리인지를 따로 확인해야 뒤 단계가 `AttributeError`로 터지지 않는다.

검증 단계는 성공과 실패를 나눠 담는다. 실패한 행 때문에 전체가 멈추면 안 되고, 그렇다고 조용히 버려도 안 된다.

```python
def validate_records(raw_data):
    valid_records, errors = [], []
    for row in raw_data:
        try:
            valid_records.append(SalesRecord.model_validate(row))
        except ValidationError as e:
            errors.append({"row": row, "error": e.errors(include_url=False)})
    return valid_records, errors
```

`e.errors(include_url=False)`로 pydantic 문서 URL을 뺀 것은 저장할 오류 리포트의 잡음을 줄이기 위해서다. 기본값이면 모든 오류 항목마다 문서 링크가 붙어 파일이 불필요하게 커진다.

저장 단계에서는 두 가지를 지켰다. 필드명을 **모델에서 끌어와** CSV 헤더로 쓰고, 한글이 깨지지 않도록 `ensure_ascii=False`를 지정했다.

```python
writer = csv.DictWriter(f, fieldnames=list(SalesRecord.model_fields))
writer.writerows(record.model_dump() for record in valid_records)
...
json.dump(errors, f, ensure_ascii=False, indent=2)
```

`fieldnames`를 문자열로 하드코딩하면 모델을 고칠 때 CSV 헤더가 조용히 어긋난다. `SalesRecord.model_fields`에서 가져오면 **모델이 곧 스키마의 단일 출처**가 된다.

> Pydantic v2의 모델 정의와 검증, `ValidationError` 처리, CSV/JSON 저장과 재로딩을 한 번에 연습할 수 있었다. 평소 쓰지 않던 라이브러리를 파고들 계기가 됐고, 무엇보다 함수를 파이프라인으로 재구성하면서 **함수의 역할과 책임을 어디서 끊을 것인가**를 고민하게 된 게 남았다.
{: .prompt-tip }

## 코드 품질 — Ruff, pytest, pre-commit

강의자료는 black + flake8 + isort 조합을 먼저 소개한 뒤, 마지막에 **Ruff가 2026년 표준**이라고 정리한다. 실습에서도 Ruff를 썼다.

```toml
# pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["B", "E", "F", "I", "UP"]
```

규칙 코드가 각각 무엇을 잡는지 알아 두면 선택이 쉬워진다.

| 코드 | 출처 | 잡는 것 |
|---|---|---|
| `E` | pycodestyle | PEP 8 스타일 |
| `F` | Pyflakes | 미사용 임포트·변수, 정의되지 않은 이름 |
| `I` | isort | 임포트 정렬 |
| `UP` | pyupgrade | 구버전 문법을 현재 문법으로 |
| `B` | flake8-bugbear | 버그를 유발하기 쉬운 패턴 |

`B`를 넣은 이유는 나머지가 스타일 검사인 반면 **`B`만 실제 버그를 잡기 때문**이다. 가변 기본 인자(`def f(x=[])`), 루프 안에서의 클로저 늦은 바인딩 같은 것들이 여기 걸린다.

pytest는 규칙이 단순하다. 파일명 `test_*.py`, 함수명 `test_*`, 실행 위치 이하를 재귀 탐색.

```toml
[tool.pytest.ini_options]
addopts = "-q"
testpaths = ["tests"]
```

pre-commit은 이 검사들을 **커밋 시점의 게이트**로 만든다.

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
```

핵심은 "검사를 돌리자"는 규칙을 **사람의 기억에서 도구로 옮긴다**는 것이다. CI에서 잡히는 것보다 커밋 전에 잡히는 쪽이 항상 싸다.

## 비동기와 병렬 — GIL을 기준으로 갈라진다

동시성과 병렬성의 선택은 취향이 아니라 **작업이 무엇을 기다리는가**로 결정된다.

| | 동시성 (Concurrency) | 병렬성 (Parallelism) |
|---|---|---|
| 도구 | `asyncio` + `httpx` | `multiprocessing` |
| 실행 | 한 스레드, 대기 중 다른 작업으로 전환 | 여러 프로세스, 실제 동시 실행 |
| 적합한 작업 | I/O 바운드 (API 호출, 파일·네트워크) | CPU 바운드 (수치 계산, 이미지 처리) |
| GIL | 영향 없음 (대기 중 해제) | 우회 (별도 인터프리터) |

### GIL이 걸리는 지점과 풀리는 지점

GIL은 CPython에서 **한 번에 하나의 스레드만 바이트코드를 실행**하도록 강제하는 락이다. 그래서 CPU 바운드 작업을 스레드로 나눠도 총 시간이 줄지 않는다.

중요한 것은 **GIL이 풀리는 지점**이다.

- **I/O 대기 중** — `time.sleep`, 소켓 읽기, 파일 읽기에서 GIL이 해제되므로 스레딩이 실제로 효과가 있다
- **C 확장 안** — NumPy의 `np.dot` 같은 연산은 BLAS로 내려가면서 GIL을 놓기 때문에 내부적으로 멀티스레드 병렬 연산이 일어난다

```python
import numpy as np
A = np.random.rand(1000, 1000)
B = np.random.rand(1000, 1000)
C = np.dot(A, B)      # BLAS 내부에서 GIL 없이 멀티스레드
```

"Python은 느리다"는 통념과 NumPy·PyTorch가 빠른 이유가 여기서 만난다. 무거운 연산은 이미 Python 바깥에서 돌고 있다. Python 3.13부터는 GIL을 제거한 free-threaded 빌드가 실험적으로 제공되고 있어 이 전제 자체가 바뀌는 중이지만, 아직 기본 빌드는 아니다.

### asyncio.gather — 합에서 최댓값으로

```python
import asyncio, httpx

async def fetch(client, url):
    r = await client.get(url, timeout=10)
    return r.json()

async def fetch_all(urls):
    async with httpx.AsyncClient() as c:
        tasks = [fetch(c, u) for u in urls]
        return await asyncio.gather(*tasks, return_exceptions=True)

results = asyncio.run(fetch_all(urls))
```

순차 호출의 총 시간은 **응답 시간의 합**이지만, `gather`로 동시에 던지면 **가장 느린 하나에 수렴**한다. 이것이 비동기 수집의 전부다.

`return_exceptions=True`는 설계 선택이다. 기본값(`False`)이면 하나라도 예외가 나는 순간 `gather` 전체가 그 예외를 올려보내고, `True`면 예외 객체가 결과 리스트에 섞여 들어와 부분 실패를 허용할 수 있다. **전부 성공해야 의미가 있는 수집이면 기본값이 맞고, 되는 만큼 모으는 것이 목적이면 `True`가 맞다.**

### multiprocessing과 "8× 속도 향상"

```python
from concurrent.futures import ProcessPoolExecutor
import multiprocessing as mp

n_cores = mp.cpu_count()
with ProcessPoolExecutor(max_workers=n_cores) as exe:
    results = list(exe.map(process_chunk, chunks))
```

> 강의자료는 이 코드에 "8코어: 이론상 8× 속도 향상"이라는 주석을 달았다. 같은 슬라이드가 "프로세스 간 데이터 전달 비용 고려"라고 단서를 붙여 두긴 했지만, 숫자가 먼저 눈에 들어오므로 짚어 둔다. 실제로는 **프로세스 생성 비용**과 **입력·출력을 pickle로 직렬화해 주고받는 비용**이 붙는다. 청크 하나당 계산량이 이 고정 비용보다 작으면 병렬화가 오히려 느려진다. 그래서 청크를 코어 수로 나누되 **청크 하나가 충분히 무겁도록** 크기를 잡아야 하고, 이득이 있는지 여부는 매번 측정해서 확인해야 한다.
{: .prompt-warning }

### 측정 도구

```python
import timeit, cProfile, sys

timeit.timeit("''.join(my_list)", setup="my_list=['a']*1000", number=10000)
cProfile.run("heavy_analysis(df)", sort="cumtime")
sys.getsizeof(obj)     # 얕은 크기
```

`cProfile`의 정렬 기준으로 `cumtime`(누적 시간)을 쓰는 것이 보통 맞다. `tottime`은 그 함수 자체에서 보낸 시간이라 호출 계층 아래에 있는 병목을 놓친다. 최적화의 순서는 **측정이 먼저**다.

## [Day 1 종합실습] 데이터 수집 미니 파이프라인

하루의 내용이 전부 모이는 과제였다. 요구사항은 다음과 같았다.

1. venv와 `requirements.txt`로 환경 구성
2. `asyncio` + `httpx`로 공개 API 3개를 **동시에** 수집 (Open-Meteo 서울 3일 시간대별 예보, countries.dev 한국 국가 정보, ip-api IP 지역 정보)
3. Pydantic v2로 타입·범위 검증
4. CSV와 Parquet 두 형식으로 저장하고 읽기/쓰기 시간 비교
5. pytest 테스트와 ruff 검사, Git 커밋

### 설계 — 검증을 가운데 둔다

```mermaid
flowchart LR
    A["asyncio.gather<br/>3개 API 동시 호출"] --> B["Pydantic 검증<br/>타입·범위·구조"]
    B --> C["시간대별 72행으로<br/>통합"]
    C --> D["CSV / Parquet<br/>저장·재로딩"]
    D --> E["성능 측정<br/>쓰기·읽기·크기"]
```

각 단계를 독립 함수로 분리한 것이 이 과제에서 가장 신경 쓴 부분이다. 결과적으로 테스트에서 큰 이득이 됐는데, 뒤에서 다시 설명한다.

### 세 API는 서로 다른 방식으로 실패한다

수집 대상 세 개가 실패를 알리는 방법이 전부 달랐고, 이 차이를 흡수하는 것이 검증 설계의 핵심이었다.

**Open-Meteo** — 시간대별 배열 세 개(`time`, `temperature_2m`, `precipitation_probability`)가 따로 온다. 세 배열의 길이가 어긋나거나 시간 간격이 깨져도 HTTP는 200이다. 필드 단위 검증으로는 잡히지 않으므로 `model_validator`로 **모델 전체에 대한 불변식**을 걸었다.

```python
class WeatherHourly(BaseModel):
    model_config = ConfigDict(extra="ignore")

    time: list[datetime] = Field(min_length=1)
    temperature_2m: list[Temperature] = Field(min_length=1)
    precipitation_probability: list[Probability] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_hourly_series(self) -> "WeatherHourly":
        """세 배열의 길이가 모두 72인지, 시간 간격이 1시간인지 확인합니다."""
        lengths = {
            len(self.time),
            len(self.temperature_2m),
            len(self.precipitation_probability),
        }
        if lengths != {72}:
            raise ValueError("3일치 시간별 배열은 각각 72개여야 합니다.")

        if any(later - earlier != timedelta(hours=1)
               for earlier, later in pairwise(self.time)):
            raise ValueError("날씨 데이터의 시간 간격은 1시간이어야 합니다.")
        return self
```

집합 하나로 세 길이의 일치와 값(72)을 동시에 확인한다. `lengths != {72}`는 "셋이 서로 같고 그 값이 72"라는 두 조건을 한 줄로 표현한다. 시간 간격은 `itertools.pairwise`로 연속한 쌍을 훑는다.

**countries.dev** — 필드명이 camelCase다. 파이썬 쪽 이름은 snake_case로 유지하면서 입력 키만 매핑했다.

```python
class CountryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    alpha2_code: Alpha2Code = Field(validation_alias="alpha2Code")
    alpha3_code: Alpha3Code = Field(validation_alias="alpha3Code")
    ...
```

**ip-api** — 이쪽이 가장 까다로웠다. **HTTP 200과 함께 논리적 실패를 반환**한다. `{"status": "fail", "message": "..."}`가 정상 응답 코드로 돌아오므로 상태 코드만 봐서는 걸러지지 않는다.

```python
class IpSuccess(BaseModel):
    status: Literal["success"]
    query: IPvAnyAddress
    country_code: Alpha2Code = Field(validation_alias="countryCode")
    lat: Latitude
    lon: Longitude
    ...

class IpFailure(BaseModel):
    status: Literal["fail"]
    message: NonEmptyString

IpResponse = Annotated[IpSuccess | IpFailure, Field(discriminator="status")]
IP_RESPONSE_ADAPTER = TypeAdapter(IpResponse)
```

`status` 필드를 판별자(discriminator)로 삼는 union이다. 이 방식의 이점은 두 가지다. 하나는 Pydantic이 두 모델을 순서대로 시도해 보는 대신 **`status` 값 하나로 어느 모델인지 바로 결정**하므로 실패 시 오류 메시지가 정확하다는 것. 다른 하나는 검증 이후 코드에서 **`isinstance`로 성공/실패를 타입 수준에서 분기**할 수 있다는 것이다.

```python
ip_result = IP_RESPONSE_ADAPTER.validate_python(payloads.ip)
if isinstance(ip_result, IpFailure):
    raise CollectionError(f"ip-api 응답 실패: {ip_result.message}")
# 이 지점 이후로 ip_result는 IpSuccess임이 타입 검사기에도 보장된다
```

제약을 재사용 가능한 타입 별칭으로 뽑아 둔 것도 반복을 줄이는 데 도움이 됐다.

```python
NonEmptyString = Annotated[str, Field(min_length=1)]
Alpha2Code     = Annotated[str, Field(pattern=r"^[A-Z]{2}$")]
Latitude       = Annotated[FiniteFloat, Field(ge=-90, le=90)]
Longitude      = Annotated[FiniteFloat, Field(ge=-180, le=180)]
Probability    = Annotated[FiniteFloat, Field(ge=0, le=100)]
```

`float` 대신 `FiniteFloat`을 쓴 이유는 JSON에서 `Infinity`와 `NaN`이 들어올 수 있고, 그것들이 범위 검사를 조용히 통과해 버리기 때문이다. 위도에 `NaN`이 들어오면 `ge=-90`도 `le=90`도 걸리지 않는다.

`extra="ignore"`를 모든 모델에 지정한 것은 **응답 스펙 변화에 대한 내성** 때문이다. API가 필드를 추가해도 파이프라인이 깨지지 않고, 필요한 필드만 취한다.

### 측정 결과 — 슬라이드의 일반론과 반대로 나왔다

검증을 통과한 데이터를 시간대별 한 행(총 72행 24열)으로 통합해 두 형식으로 저장하고, 다시 읽어 행 수를 확인하며 시간을 쟀다.

| 형식 | 쓰기(초) | 읽기(초) | 파일 크기(bytes) | 재로딩 행 수 |
|---|---:|---:|---:|---:|
| CSV | 0.002914 | 0.003231 | 15,004 | 72 |
| Parquet | 0.007241 | 0.011894 | 15,794 | 72 |

**쓰기·읽기·파일 크기 모두 CSV가 우세했다.** 강의자료가 인용한 "Parquet은 CSV 대비 10× 빠른 읽기, 5× 작은 파일"과 정반대다.

이 수치를 "CSV가 더 빠른 형식"으로 읽으면 틀린 결론이 된다. 데이터가 72행뿐이라 **Parquet의 스키마 메타데이터와 열 단위 인코딩에 드는 고정 비용이 상대적으로 크게 작용한 결과**로 보는 것이 맞다. 게다가 한 번의 측정이라 디스크 캐시와 라이브러리 초기화 영향도 섞여 있다. 제대로 비교하려면 여러 번 측정한 중앙값을 쓰고, 행 수를 늘려가며 두 형식이 교차하는 지점을 찾아야 한다.

반면 **자료형 보존은 형식 간 차이가 분명했다.** CSV는 모든 값이 문자열로 저장되어 다시 읽을 때 `parse_dates` 같은 지정이 필요하지만, Parquet은 `datetime64[us]`와 `float64`를 그대로 복원했다.

```python
csv_reloaded = pd.read_csv(csv_path, parse_dates=["forecast_time"])   # 지정 필요
parquet_reloaded = pd.read_parquet(parquet_path, engine="pyarrow")     # 타입 그대로
```

정리하면 선택 기준은 속도가 아니라 **용도**다. 사람이 직접 열어 보거나 다른 도구와 주고받을 목적이면 CSV, 데이터가 커지고 반복 분석과 타입 보존이 중요해지면 Parquet.

> 이 대비가 이 과제에서 가장 인상적이었던 부분이다. 자료에 적힌 "10배 빠르다"를 그대로 옮겼다면 내 측정값과 모순되는 글을 쓸 뻔했다. **일반론은 조건이 붙어 있고, 그 조건이 내 상황에 해당하는지는 재 봐야 안다.**
{: .prompt-tip }

### 네트워크 없이 파이프라인 전체를 테스트하기

`httpx.MockTransport`로 전송 계층만 바꿔 끼우면 실제 네트워크 없이 파이프라인 전체를 돌릴 수 있다.

```python
def make_transport(requested_urls: list[str]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        requested_urls.append(str(request.url))
        if request.url.host == "api.open-meteo.com":
            return httpx.Response(200, json=make_weather_payload())
        if request.url.host == "countries.dev":
            return httpx.Response(200, json=make_country_payload())
        if request.url.host == "ip-api.com":
            return httpx.Response(200, json=make_ip_payload())
        return httpx.Response(404, text="not found")
    return httpx.MockTransport(handler)


def test_full_pipeline_collects_validates_and_saves(tmp_path: Path) -> None:
    requested_urls: list[str] = []

    async def execute_pipeline() -> PipelineResult:
        async with httpx.AsyncClient(transport=make_transport(requested_urls)) as client:
            return await run_pipeline(tmp_path, client)

    result = asyncio.run(execute_pipeline())

    assert len(requested_urls) == 3
    assert len(result.records) == 72
    assert result.csv_path.exists() and result.parquet_path.exists()
```

이것이 가능했던 것은 `run_pipeline`이 클라이언트를 **인자로 받도록** 만들어 뒀기 때문이다.

```python
async def run_pipeline(output_dir=DEFAULT_OUTPUT_DIR, client: httpx.AsyncClient | None = None):
    if client is None:
        async with httpx.AsyncClient(timeout=httpx.Timeout(REQUEST_TIMEOUT_SECONDS)) as owned:
            payloads = await collect_all(owned)
    else:
        payloads = await collect_all(client)
    ...
```

내부에서 클라이언트를 만들어 쓰기만 했다면 테스트에서 바꿔 끼울 방법이 없어 네트워크 없이는 아무것도 검증하지 못했을 것이다. 의존성 주입이라는 이름을 붙일 만큼 거창한 것은 아니지만, **테스트 가능성을 설계 단계에서 확보한다**는 원칙의 가장 작은 형태다.

검증 실패 경로도 별도로 테스트했다. 정상 응답에서 한 값만 어긋나게 만들어 걸리는지 확인하는 방식이다.

```python
def test_probability_out_of_range_raises_validation_error() -> None:
    invalid_weather = deepcopy(payloads.weather)
    invalid_weather["hourly"]["precipitation_probability"][0] = 101   # 0~100 범위 초과
    with pytest.raises(ValidationError):
        validate_and_transform(RawPayloads(weather=invalid_weather, ...))


def test_mismatched_hourly_lengths_raise_validation_error() -> None:
    invalid_weather = deepcopy(payloads.weather)
    invalid_weather["hourly"]["temperature_2m"].pop()                 # 길이 불일치
    with pytest.raises(ValidationError, match="72"):
        validate_and_transform(RawPayloads(weather=invalid_weather, ...))
```

`pytest.raises`에 `match`를 붙인 것은 **의도한 이유로 실패했는지**까지 확인하기 위해서다. 예외 타입만 보면 다른 원인으로 터져도 테스트가 통과한다.

pytest 3건 통과, `ruff check .` 통과, 커밋 2건을 원격에 반영한 상태로 제출했다.

### 남은 개선 지점

제출 후 정리하면서 아직 못 한 것들을 적어 뒀다.

- **재시도 정책** — 일시적 네트워크 오류나 429에 지수 백오프 재시도를 붙여야 한다. 지금은 한 번 실패하면 파이프라인 전체가 중단된다
- **부분 실패 허용** — `asyncio.gather(return_exceptions=True)`로 일부 API가 실패해도 수집 가능한 데이터는 남기는 방식을 고려할 수 있다
- **원본 응답 보관** — 검증 전 원본 JSON과 수집 시각을 함께 저장하면 스키마 오류가 났을 때 원인 추적과 재현이 쉬워진다
- **측정 신뢰도** — 저장 성능은 여러 차례 반복 측정한 중앙값으로 비교하고, 행 수를 늘려가며 두 형식의 교차점을 찾는 편이 타당하다
- **설정 외부화** — 좌표·타임존·대상 IP를 상수 대신 설정 파일이나 CLI 인자로 분리하면 재사용성이 올라간다

## 정리

1일차를 관통하는 주제를 하나 고르면 **"경계"**다.

- **모듈 경계** — venv와 `requirements.txt`로 실행 환경을 고정한다
- **함수 경계** — 데코레이터로 공통 관심사를 본체에서 떼어낸다
- **데이터 경계** — Pydantic으로 외부 데이터를 안으로 들이기 전에 한 번 검증한다
- **커밋 경계** — Ruff와 pytest를 pre-commit에 걸어 품질 미달 코드가 히스토리에 남지 않게 한다

문법과 환경 설정은 익숙한 내용이었지만, 이 경계들을 **하나의 파이프라인으로 엮는 감각**은 새로 얻은 것이다. 특히 세 API가 서로 다른 방식으로 실패한다는 사실 — 형식은 맞는데 배열 길이가 어긋나거나, HTTP 200과 함께 논리적 실패를 반환하거나 — 은 문서로 읽었을 때와 직접 부딪혔을 때의 무게가 달랐다.

2일차는 이렇게 확보한 데이터를 실제로 분석하는 쪽으로 넘어간다. Pandas에서 Polars·DuckDB로 도구를 바꿔 가며 같은 집계를 다시 쓰고, 어느 상황에서 무엇을 골라야 하는지 기준을 만든다.

---

시리즈 안내: [데이터 분석을 위한 Python — 2일 학습 로드맵](/posts/skala-python-roadmap/)

다음 글: [2일차 — Pandas·Polars·DuckDB와 분석 파이프라인](/posts/skala-python-day2/)
