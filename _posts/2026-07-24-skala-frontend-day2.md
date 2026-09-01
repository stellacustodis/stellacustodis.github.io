---
title: "[SKALA] Full-Stack Engineering 2일차 — CSS 레이아웃과 JavaScript"
date: 2026-07-24 09:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, css, javascript, flexbox, grid, dom, async, event-loop, responsive-web]
description: "CSS 선택자·우선순위·박스 모델에서 Flexbox와 Grid, 반응형까지, 그리고 JavaScript 문법·DOM·이벤트·Promise와 async/await, 모듈까지 정리한다."
permalink: /posts/skala-frontend-day2/
---

1일차에는 문서의 **구조**를 만들었다. 2일차는 그 구조에 **표현**(CSS)을 입히고 **동작**(JavaScript)을 붙인다. 분량이 많지만 관통하는 질문은 두 개다. "브라우저는 어떤 규칙으로 스타일을 결정하는가", 그리고 "싱글 스레드 언어가 어떻게 화면을 멈추지 않고 여러 일을 하는가".

## CSS는 무엇을 하는 언어인가

CSS(Cascading Style Sheets)는 HTML 요소가 **화면에 어떻게 표시될지**를 기술하는 스타일시트 언어다. 색상, 글꼴, 크기, 간격, 위치와 레이아웃, 배경, 그리고 기기별 표시 방식까지 제어한다.

기본 문법은 **선택자(selector) + 선언 블록(declaration block)** 구조다.

```css
p {
  color: red;
  text-align: center;
}
```

- **선택자**: 스타일을 적용할 HTML 요소를 지목한다
- **선언 블록**: 중괄호로 감싸고, 선언들을 세미콜론으로 구분한다
- **선언**: `속성(property): 값(value)` 형태

이름의 "Cascading(계단식)"이 핵심이다. 하나의 요소에 여러 규칙이 동시에 적용될 수 있고, **어떤 규칙이 이기는지 결정하는 명확한 알고리즘**이 있다. 뒤에서 다룰 우선순위(specificity)와 상속이 그것이다.

### CSS를 적용하는 세 가지 방법

| 방식 | 작성 위치 | 평가 |
|---|---|---|
| Inline | 요소의 `style` 속성 | 재사용 불가, 우선순위가 지나치게 높음. 지양 |
| Internal | `<head>` 안의 `<style>` | 해당 문서에만 적용. 단일 페이지에 한정 |
| External | 별도 `.css` 파일을 `<link>`로 연결 | **권장.** 여러 문서가 공유, 캐싱 가능 |

```html
<!-- Inline -->
<h1 style="color:blue;text-align:center;">제목</h1>

<!-- Internal -->
<head>
  <style>
    body { background-color: linen; }
    h1 { color: maroon; margin-left: 40px; }
  </style>
</head>

<!-- External (권장) -->
<head>
  <link rel="stylesheet" href="/css/style.css">
</head>
```

External 방식이 권장되는 이유는 1일차에서 반복한 **관심사 분리** 때문이다. 스타일을 한 파일에 모아두면 디자인 변경이 한 곳에서 끝나고, 브라우저가 CSS 파일을 캐싱해 재방문 시 다시 내려받지 않는다.

## 선택자: 어떤 요소를 고를 것인가

### 기본 선택자

```css
p        { font-size: 16px; }   /* 요소 선택자 */
#header  { background: grey; }  /* 아이디 선택자 */
.menu    { display: flex; }     /* 클래스 선택자 */
*        { margin: 0; }         /* 전체 선택자 */
h1, h2, h3 { color: green; }    /* 그룹화 선택자 */
```

### 속성 선택자

특정 속성이나 속성값을 가진 요소를 고른다.

| 문법 | 의미 |
|---|---|
| `[attr]` | 해당 속성을 가진 요소 |
| `[attr="value"]` | 속성값이 정확히 일치 |
| `[attr~="value"]` | 공백으로 구분된 값 중 하나가 일치 |
| `[attr^="value"]` | 값이 해당 문자열로 **시작** |
| `[attr$="value"]` | 값이 해당 문자열로 **끝남** |
| `[attr*="value"]` | 값에 해당 문자열이 **포함** |

```css
input[type="text"]   { background-color: pink; }
a[href^="https://"]  { color: green; }
a[href$=".pdf"]      { font-weight: bold; }
```

같은 `<input>` 태그를 `type`별로 다르게 꾸미려면 속성 선택자가 유용하다. 폼 컨트롤에는 `<select>`, `<textarea>`, `<button>`처럼 `<input>`이 아닌 요소도 있다.

### 결합자(Combinator)

요소 간의 **관계**로 선택한다.

| 결합자 | 문법 | 의미 |
|---|---|---|
| 후손 | `div p` (공백) | `div`의 모든 하위 `p` (자식, 손자 …) |
| 자식 | `div > p` | `div`의 **직계** 자식 `p`만 |
| 인접 형제 | `h1 + p` | `h1` **바로 다음**에 오는 형제 `p` 하나 |
| 일반 형제 | `h1 ~ p` | `h1` 뒤에 오는 모든 형제 `p` |

공백(후손)과 `>`(자식)의 차이를 놓치면 의도보다 훨씬 넓은 범위에 스타일이 먹는다. 중첩 목록에서 자주 문제가 된다.

### 의사 클래스(Pseudo-class)

요소의 **특정 상태**에 스타일을 준다. 콜론 하나(`:`)를 붙인다.

**상호작용 의사 클래스**

| 선택자 | 상태 |
|---|---|
| `:link` | 방문하지 않은 링크 |
| `:visited` | 방문한 링크 |
| `:hover` | 마우스를 올린 상태 |
| `:active` | 클릭하고 있는 상태 |
| `:focus` | 포커스를 받은 상태 (Tab 이동, 클릭) |

`:focus` 스타일을 없애면 안 된다. 마우스를 쓰지 않는 사용자는 **지금 어디에 있는지 알 방법이 사라진다.** 기본 외곽선이 마음에 들지 않으면 제거가 아니라 다른 스타일로 대체해야 한다.

**구조적 의사 클래스**

| 선택자 | 의미 |
|---|---|
| `:first-child` | 부모의 첫 번째 자식 |
| `:last-child` | 부모의 마지막 자식 |
| `:nth-child(n)` | 부모의 n번째 자식 (`2n`은 짝수번째) |
| `:nth-last-child(n)` | 뒤에서 n번째 자식 |
| `:only-child` | 유일한 자식일 때 |
| `:first-of-type` / `:last-of-type` | 같은 타입 중 첫/마지막 |

```css
tr:nth-child(even) { background-color: #f2f2f2; }  /* 얼룩말 무늬 표 */
li:first-child     { font-weight: bold; }
```

### 의사 요소(Pseudo-element)

요소의 **특정 부분**에 스타일을 준다. 콜론 두 개(`::`)를 붙여 의사 클래스와 구분한다.

| 선택자 | 대상 |
|---|---|
| `::first-line` | 텍스트 블록의 첫 줄 (창 너비가 바뀌면 범위도 갱신됨) |
| `::first-letter` | 첫 글자 |
| `::selection` | 사용자가 드래그로 선택한 영역 |
| `::before` | 요소 내부의 맨 앞에 생성되는 가상 콘텐츠 |
| `::after` | 요소 내부의 맨 뒤에 생성되는 가상 콘텐츠 |

`::before`/`::after`는 **`content` 속성이 반드시 있어야** 렌더링된다.

```css
.required::after {
  content: " *";
  color: red;
}
```

필수 표시 별표처럼 **내용이 아니라 장식에 가까운 요소**를 HTML에 넣지 않고 CSS로 처리할 때 유용하다.

### 선택자 조합 예시

선택자는 조합할수록 정밀해진다.

```css
p.notice                    { font-size: 18px; }        /* class가 notice인 p */
div#header                  { background: gray; }       /* id가 header인 div */
button.btn.primary          { background-color: blue; } /* 두 클래스를 모두 가진 button */
input[type="text"][required]{ border: 1px solid red; }  /* 두 속성 조건을 모두 만족 */
ul li:first-child:hover     { color: red; }             /* 첫 li에 마우스를 올렸을 때 */
```

## 우선순위(Specificity): 누가 이기는가

같은 요소에 여러 규칙이 적용되면 **명시도가 높은 쪽이 이긴다.** 명시도는 네 자리 점수로 계산한다.

| 선택자 종류 | 예시 | 가중치 |
|---|---|---|
| 인라인 스타일 | `<h1 style="color:pink;">` | 1-0-0-0 |
| ID 선택자 | `#navbar` | 0-1-0-0 |
| 클래스 · 속성 · 의사 클래스 | `.test`, `[type="text"]`, `:hover` | 0-0-1-0 |
| 요소 · 의사 요소 | `h1`, `::before` | 0-0-0-1 |
| 전체 선택자 | `*` | 0-0-0-0 |

작동 원칙은 세 가지다.

1. **상위 자릿수가 높으면 무조건 이긴다.** 클래스 1개(`0-0-1-0`)가 요소 15개(`0-0-0-15`)를 이긴다
2. **점수가 같으면 나중에 작성된 규칙이 이긴다** (Cascading 원칙)
3. **전체 선택자 `*`는 점수가 0**이라 항상 밀린다

```html
<style>
  #demo { color: blue;  }   /* 0-1-0-0 → 승 */
  .test { color: green; }   /* 0-0-1-0 */
  p     { color: red;   }   /* 0-0-0-1 */
</style>

<p id="demo" class="test">Hello World!</p>   <!-- 파란색 -->
```

### !important는 최후의 수단이다

`!important`를 붙이면 명시도 계산을 무시하고 최우선이 된다.

```css
p { color: red !important; }
```

편해 보이지만 대가가 크다.

- **디버깅 곤란**: 우선순위 추적이 불가능해진다
- **연쇄 반응**: `!important`를 이기려면 또 다른 `!important`가 필요해진다
- **가독성 저하**: 규칙 간 관계를 코드로 읽을 수 없게 된다

대부분의 경우 `!important`가 필요하다는 것은 **선택자 설계가 잘못됐다는 신호**다. 앞에서 "스타일에 id를 쓰지 말라"고 한 이유도 여기에 있다. 명시도를 낮게 유지하면 나중에 덮어쓰기 쉽다.

## 색상과 단위

### 색상

```css
color: tomato;                /* 미리 정의된 이름 */
color: rgb(255, 99, 71);      /* RGB */
color: #ff6347;               /* HEX */
color: hsl(9, 100%, 64%);     /* HSL (색상, 채도, 명도) */
```

네 줄 모두 같은 색이다. HSL은 "같은 색상에서 명도만 10% 낮춘 값"처럼 **체계적인 변형**을 만들기 쉬워서 디자인 시스템을 구성할 때 유리하다.

### 단위

**절대 단위**

- `px`: 화면 기준 절대 크기. 가장 많이 쓰인다

**상대 단위**

| 단위 | 기준 |
|---|---|
| `em` | **부모 요소**의 `font-size` |
| `rem` | **최상위 `<html>`**의 `font-size` (Root em) |
| `%` | 부모 요소의 해당 속성값 |
| `vw` | 뷰포트 너비의 1% (`100vw` = 화면 전체 너비) |
| `vh` | 뷰포트 높이의 1% |

`em`과 `rem`의 차이가 실무에서 문제를 만든다. `em`은 부모 기준이라 **중첩되면 값이 누적된다.** 부모가 `1.2em`, 자식도 `1.2em`이면 자식의 실제 크기는 `1.44배`가 된다. 의도한 결과가 아닌 경우가 대부분이다.

```css
body { font-size: 16px; }
h1   { font-size: 2.5em;   }  /* 2.5 × 16 = 40px */
h2   { font-size: 1.875rem;}  /* 1.875 × 16 = 30px (부모와 무관) */
p    { font-size: 1rem;    }  /* 16px */
```

특별한 이유가 없으면 `rem`을 기본으로 쓰는 편이 예측 가능하다. 사용자가 브라우저 기본 글꼴 크기를 키웠을 때 함께 커진다는 접근성 이점도 있다.

## 글꼴과 텍스트

```css
.p1 { font-family: "Times New Roman", Times, serif; }
```

`font-family`는 **폴백 목록**이다. 첫 글꼴을 지원하지 않으면 다음 것을 시도하고, 마지막에는 `serif`/`sans-serif` 같은 일반 계열 이름을 두어 어떤 환경에서도 표시되게 한다.

Google Fonts는 `<link>`로 불러와 사용한다.

```html
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR&display=swap" rel="stylesheet">
  <style>
    body { font-family: "Noto Sans KR", sans-serif; }
  </style>
</head>
```

한글 폰트는 글자 수가 많아 파일이 크다. Google Fonts 사이트에서 Language 필터를 Korean으로 두고 필요한 굵기(weight)만 선택해야 로딩 부담이 줄어든다.

주요 텍스트 속성들이다.

```css
h1 { text-align: center; }
p  { text-transform: uppercase; }   /* uppercase | lowercase | capitalize */
h3 { text-decoration-line: underline;
     text-decoration-color: green;
     text-decoration-style: dotted; }
p  { text-indent: 50px;      /* 들여쓰기 */
     letter-spacing: 1px;    /* 자간 */
     word-spacing: 5px;      /* 어간 */
     line-height: 1.6;       /* 행간 */
     white-space: nowrap; }  /* 줄바꿈 억제 */
h1 { text-shadow: 0 0 3px #ff0000; }
```

`line-height`는 단위 없이 숫자만 쓰는 것이 좋다. `1.6`은 "자기 `font-size`의 1.6배"로 계산되어 자식 요소마다 적절히 조정되지만, `1.6em`처럼 쓰면 계산된 고정값이 상속되어 글자가 큰 자식에서 행간이 좁아진다.

## 배경

```css
body {
  background-color: lightblue;
  background-image: url("img_tree.png");
  background-repeat: no-repeat;
  background-position: right top;
  background-attachment: fixed;   /* scroll | fixed */
}
```

`opacity`는 요소 전체(자식 포함)를 투명하게 만든다. **배경만** 반투명하게 하려면 `rgba()`를 쓴다.

```css
.box  { background-color: rgba(0, 0, 0, 0.5); }  /* 배경만 반투명 */
.box2 { opacity: 0.5; }                          /* 글자까지 함께 흐려짐 */
```

## 박스 모델

모든 HTML 요소는 사각형 상자로 렌더링되며, 그 상자는 네 겹으로 구성된다.

```text
┌─────────── Margin ────────────┐  요소 바깥의 여백 (다른 요소와의 간격)
│ ┌───────── Border ──────────┐ │  요소의 테두리
│ │ ┌─────── Padding ───────┐ │ │  테두리와 내용 사이의 여백
│ │ │      Content          │ │ │  실제 내용
│ │ └───────────────────────┘ │ │
│ └───────────────────────────┘ │
└───────────────────────────────┘
```

개발자 도구의 **Elements → Computed** 탭에서 이 네 겹의 실제 계산값을 볼 수 있다. 레이아웃이 의도와 다를 때 가장 먼저 확인할 곳이다.

### width와 height의 함정

`width`는 **content 영역의 너비만** 의미한다. 따라서 요소의 실제 차지 너비는 다음과 같다.

```css
div { width: 300px; padding: 25px; border: 5px solid; }
/* 실제 너비 = 300 + 25×2 + 5×2 = 360px */
```

이 계산이 반복되면 레이아웃 관리가 어려워진다. 그래서 실무에서는 대개 다음 규칙을 전역으로 깔고 시작한다.

```css
* { box-sizing: border-box; }
```

`border-box`를 적용하면 `width`가 **padding과 border를 포함한 값**이 되어, 지정한 300px이 곧 화면상의 300px이 된다.

`min-width`/`max-width`도 중요하다. `width: 500px`은 창이 그보다 좁아지면 가로 스크롤을 만들지만, `max-width: 500px`은 창 크기에 맞춰 줄어든다. 반응형의 기초다.

### border

```css
p { border-style: solid; }          /* dotted, dashed, double, groove, none 등 */
p { border-width: 5px 20px; }       /* 상하 5px, 좌우 20px */
p { border-color: red green blue yellow; }  /* 상 우 하 좌 (시계방향) */
p { border: 5px solid red; }        /* 축약형: width style color */
p { border-radius: 5px; }           /* 둥근 모서리 */
```

`border-style`이 없으면 테두리가 그려지지 않는다. 축약형 `border`를 쓰면 세 값을 한 번에 지정하므로 실수가 적다.

### margin과 margin collapse

```css
p { margin: 25px 50px 75px 100px; }  /* 상 우 하 좌 */
p { margin: 0 auto; }                /* 좌우 auto → 가운데 정렬 */
```

`margin: 0 auto`는 고정 너비를 가진 블록 요소를 가로 가운데에 놓는 전형적인 방법이다.

**마진 병합(Margin Collapse)**은 처음 겪으면 버그로 오해하기 쉬운 동작이다. 인접한 두 요소의 **세로 마진이 만나면 더해지지 않고 큰 값 하나로 합쳐진다.**

```css
h1 { margin-bottom: 50px; }
h2 { margin-top: 20px; }
/* 두 요소 사이 간격은 70px이 아니라 50px */
```

**가로 마진은 병합되지 않는다.** 세로만 해당한다.

### padding

```css
div { padding: 25px 50px 75px 100px; }  /* 상 우 하 좌 */
```

margin과 padding의 구분은 **배경색이 칠해지는가**로 기억하면 쉽다. padding은 요소 내부라 배경색이 적용되고, margin은 요소 바깥이라 적용되지 않는다.

## position

`position`은 요소의 배치 기준을 정한다.

| 값 | 동작 |
|---|---|
| `static` | 기본값. 문서 흐름대로 배치. `top`/`left` 등이 **무시된다** |
| `relative` | 원래 위치를 기준으로 이동. **원래 자리는 그대로 차지한다** |
| `absolute` | 가장 가까운 `position`이 `static`이 아닌 조상 기준. **문서 흐름에서 빠진다** |
| `fixed` | 뷰포트 기준. 스크롤해도 고정 |
| `sticky` | 스크롤 위치에 따라 `relative`와 `fixed`를 오간다 |

```css
div.relative { position: relative; left: 30px; }
div.absolute { position: absolute; top: 80px; right: 0; }
div.fixed    { position: fixed; bottom: 0; right: 0; }
div.sticky   { position: sticky; top: 0; }
```

가장 흔한 패턴은 **부모에 `relative`, 자식에 `absolute`** 조합이다. `absolute`는 기준이 될 조상을 위로 찾아 올라가는데, 아무것도 없으면 문서 전체가 기준이 되어 엉뚱한 곳에 배치된다. 부모에 `position: relative`를 주면 그 부모가 기준점이 된다.

`sticky`는 헤더나 목차를 스크롤 중 고정할 때 쓴다. 조상 중에 `overflow: hidden`이 있으면 동작하지 않는 함정이 있다.

### z-index

같은 위치에 겹친 요소들의 쌓임 순서를 정한다. 값이 클수록 앞에 온다.

```css
img { position: absolute; z-index: -1; }
```

`z-index`는 **`position`이 `static`이 아닌 요소에만 적용된다.** 적용이 안 될 때 대부분 이 조건을 빠뜨린 경우다.

## 상속

부모에 지정한 스타일 중 일부는 자식에게 자동으로 전달된다. HTML이 트리 구조이기 때문에 가능한 동작이다.

**상속되는 속성 (주로 텍스트 관련)**

| 분류 | 속성 |
|---|---|
| 텍스트 | `color`, `text-align`, `text-indent`, `letter-spacing`, `word-spacing`, `line-height`, `visibility`, `white-space` |
| 폰트 | `font`, `font-family`, `font-size`, `font-style`, `font-weight` |
| 리스트 | `list-style`, `list-style-type`, `list-style-position` |
| 테이블 | `border-collapse`, `border-spacing`, `caption-side` |

**상속되지 않는 속성 (주로 박스·레이아웃 관련)**

| 분류 | 속성 |
|---|---|
| 레이아웃 | `margin`, `padding`, `border`, `width`, `height`, `display`, `position` |
| 배경 | `background-color`, `background-image` |
| 정렬 | `flex`, `grid`, `justify-content`, `align-items` |
| 기타 | `box-shadow`, `z-index`, `overflow` |

구분 기준은 직관적이다. **"모든 자식에게 물려줘도 말이 되는가"**다. 글자색은 물려줘도 되지만 너비를 물려주면 곤란하다.

상속되지 않는 속성도 `inherit` 키워드로 강제할 수 있다.

```css
p      { border: 1px solid red; }
strong { border: inherit; }
```

## 레이아웃: 요소를 나란히 놓는 네 가지 방법

| 방식 | 설명 | 적합한 용도 |
|---|---|---|
| `float` | 요소를 좌/우로 띄운다 | 구버전 브라우저 호환. 현재는 텍스트 감싸기 정도 |
| `inline-block` | 인라인처럼 나란히 + 블록처럼 크기 조절 | 간단한 가로 메뉴 |
| **Flexbox** | **1차원**(가로 또는 세로) 정렬 | 컴포넌트 내부 요소 정렬 |
| **Grid** | **2차원**(행과 열) 배치 | 페이지 전체 레이아웃 |

현대적인 조합은 **페이지 전체 구조는 Grid, 그 안의 요소 정렬은 Flexbox**다.

### inline-block

인라인 요소는 `width`/`height`가 무시된다. `display: inline-block`은 **배치는 인라인처럼 나란히, 크기 조절은 블록처럼** 가능하게 하는 절충안이다.

```css
.nav { list-style-type: none; margin: 0; padding: 0; }
.nav li { display: inline-block; padding: 15px; }
```

`<li>`는 기본이 블록이라 세로로 쌓이는데, `inline-block`으로 가로 메뉴를 만들 수 있다. 다만 HTML 소스의 줄바꿈이 공백으로 렌더링되어 요소 사이에 미세한 틈이 생기는 문제가 있고, 이 때문에 지금은 Flexbox를 더 많이 쓴다.

## Flexbox

Flexbox는 **1차원 레이아웃**을 위한 방식이다. 핵심 개념부터 정리한다.

| 용어 | 설명 |
|---|---|
| **Flex Container** | `display: flex`가 적용된 부모 요소 |
| **Flex Item** | 컨테이너의 **직계 자식** 요소들 |
| **Main Axis** | 아이템이 배치되는 주축. 기본은 가로(row) |
| **Cross Axis** | 주축에 수직인 교차축 |

주축이 무엇인지에 따라 `justify-content`와 `align-items`가 가리키는 방향이 바뀐다. 이 점이 Flexbox 학습의 가장 큰 걸림돌이다.

### Container 속성

| 속성 | 값 | 설명 |
|---|---|---|
| `flex-direction` | `row`(기본), `column`, `row-reverse`, `column-reverse` | 주축 방향 |
| `flex-wrap` | `nowrap`(기본), `wrap`, `wrap-reverse` | 넘칠 때 줄바꿈 여부 |
| `justify-content` | `flex-start`(기본), `center`, `flex-end`, `space-between`, `space-around`, `space-evenly` | **주축** 정렬 |
| `align-items` | `stretch`, `center`, `flex-start`, `flex-end`, `baseline` | **교차축** 정렬 (한 줄) |
| `align-content` | `stretch`(기본), `center`, `space-between` 등 | 여러 줄일 때 교차축 처리 |

```css
.container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
```

세로 중앙 정렬은 Flexbox 이전에는 까다로운 작업이었지만, 이제는 두 줄로 끝난다.

```css
.center { display: flex; justify-content: center; align-items: center; }
```

`gap`은 아이템 사이 간격을 만든다. 각 아이템에 `margin`을 주면 양 끝에도 여백이 생겨 별도 처리가 필요했는데, `gap`은 **사이에만** 적용되어 훨씬 깔끔하다.

### Item 속성

| 속성 | 설명 |
|---|---|
| `order` | HTML 순서와 무관하게 시각적 배치 순서를 지정 |
| `flex-grow` | 남는 공간을 나눠 가질 비율. 기본 `0` |
| `flex-shrink` | 공간이 부족할 때 줄어들 비율. 기본 `1` |
| `flex-basis` | 아이템의 기본 크기 |
| `flex` | 위 셋의 축약형 |
| `align-self` | 컨테이너의 정렬 규칙을 무시하고 이 아이템만 다르게 정렬 |

```css
.item {
  flex: 1 1 100px;   /* grow shrink basis */
  align-self: center;
}
```

`flex: 1`은 `flex: 1 1 0%`의 축약으로, 형제들과 남는 공간을 균등하게 나눠 갖는다. 사이드바는 고정 폭, 본문은 나머지 전부인 레이아웃을 이렇게 만든다.

```css
.sidebar { flex: 0 0 240px; }  /* 커지지도 줄지도 않는 240px */
.main    { flex: 1; }          /* 나머지 전부 */
```

## Grid

Grid는 **2차원 레이아웃**(행과 열)을 다룬다.

| 용어 | 설명 |
|---|---|
| Grid Container | `display: grid`가 선언된 부모 |
| Grid Item | 컨테이너의 직계 자식 |
| Grid Line | 행과 열을 나누는 **선** |
| Grid Track | 행(row) 또는 열(column) |
| Grid Cell | 행과 열이 만나는 하나의 칸 |
| Grid Area | 여러 셀을 묶은 영역 |

### Container 속성

```css
.container {
  display: grid;
  grid-template-columns: 200px 1fr 2fr;  /* 3개 열 */
  grid-template-rows: auto 100px;        /* 2개 행 */
  gap: 10px;
  justify-items: center;  /* 셀 내부 가로 정렬 */
  align-items: center;    /* 셀 내부 세로 정렬 */
}
```

`fr`(fraction)은 Grid 전용 단위로, **남은 공간을 비율로 나눈다.** 위 예시에서 첫 열은 200px 고정이고, 나머지 공간을 두 번째와 세 번째 열이 1:2로 나눠 갖는다.

반복되는 카드 그리드에는 `repeat()`과 `minmax()` 조합이 유용하다.

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
```

각 열은 최소 240px을 유지하되, 공간이 남으면 늘어나고, 화면이 좁아지면 열 개수가 자동으로 줄어든다. **미디어 쿼리 없이도 반응형이 되는** 패턴이다.

### Item 속성

```css
.item {
  grid-column: 1 / 3;   /* 1번 선부터 3번 선까지 (열 2칸 병합) */
  grid-row: 2 / 4;      /* 2번 선부터 4번 선까지 */
  justify-self: center;
  align-self: end;
}
```

주의할 점은 Grid가 **칸의 개수가 아니라 선(Grid Line)의 번호**를 기준으로 영역을 잡는다는 것이다. 열이 3개면 선은 4개(1~4번)다. `1 / 3`은 "1번 선에서 3번 선까지"이므로 두 칸을 차지한다.

## Transform, Transition, Animation

### Transform

요소를 회전·확대·이동·기울인다.

```css
transform: rotate(45deg);      /* 45도 회전 */
transform: scale(1.2);         /* 1.2배 확대 */
transform: translateX(50px);   /* X축으로 50px 이동 */
transform: translate(-50%, -50%);
```

3D 변형에는 `rotateX()`, `rotateY()`, `rotateZ()`와 `perspective`, `transform-style`, `backface-visibility` 등이 함께 쓰인다.

`transform`으로 위치를 옮기면 **문서 흐름에 영향을 주지 않고** 시각적으로만 이동한다. `top`/`left`를 바꾸는 것보다 성능상 유리해서 애니메이션에는 `transform`을 쓰는 것이 좋다.

### Transition

속성값이 **변할 때** 그 변화를 부드럽게 만든다.

```css
div {
  width: 100px;
  background-color: red;
  transition: width 2s, background-color 3s;
}
div:hover {
  width: 300px;
  background-color: orange;
}
```

관련 속성은 다음과 같으며, `transition` 축약형으로 한 번에 쓸 수 있다.

- `transition-property`: 대상 속성
- `transition-duration`: 지속 시간
- `transition-timing-function`: 속도 곡선 (`linear`, `ease`, `ease-in-out` 등)
- `transition-delay`: 시작 전 지연

```css
div { transition: width 2s linear 1s; }  /* property duration timing delay */
```

`transition`은 **변화가 일어나는 요소에** 선언해야 한다. `:hover`에만 쓰면 마우스를 올릴 때는 부드럽지만 뗄 때는 즉시 돌아간다.

### Animation

Transition이 "시작과 끝" 두 상태만 다룬다면, Animation은 `@keyframes`로 **중간 상태까지** 정의한다.

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.title {
  animation: fadeInUp 0.6s ease-out;
}
```

| 속성 | 의미 | 기본값 |
|---|---|---|
| `animation-name` | `@keyframes`의 이름 | `none` |
| `animation-duration` | 지속 시간 | `0s` |
| `animation-delay` | 대기 시간 | `0s` |
| `animation-timing-function` | 속도 곡선 | `ease` |
| `animation-iteration-count` | 반복 횟수 (`infinite` 가능) | `1` |
| `animation-direction` | 반복 방향 | `normal` |
| `animation-fill-mode` | 재생 전후의 상태 유지 | `none` |
| `animation-play-state` | 재생/정지 | `running` |

`animation-duration`이 `0s`가 기본값이라, 이 값을 빠뜨리면 애니메이션이 아예 보이지 않는다.

## 반응형 웹 디자인

반응형 웹 디자인은 **하나의 HTML로 PC·태블릿·모바일에 모두 대응**하는 방식이다. 세 가지 기술이 축을 이룬다.

### 1. Viewport 메타 태그

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

- `width=device-width`: 콘텐츠 폭을 기기의 실제 화면 너비에 맞춘다
- `initial-scale=1.0`: 초기 확대 비율을 100%로 설정

이 태그가 없으면 모바일 브라우저가 데스크톱 너비(보통 980px)를 가정하고 페이지 전체를 축소해서 보여준다. **미디어 쿼리 자체는 동작하지만 의도한 모바일 화면 폭이 아니라 기본 layout viewport를 기준으로 평가될 수 있다.**

### 2. 미디어 쿼리

화면 크기·방향·해상도에 따라 다른 스타일을 적용한다. 레이아웃이 바뀌는 기준점을 **브레이크포인트(Breakpoint)**라 한다.

```css
/* 기본: 모바일 */

@media (min-width: 768px) {
  /* 태블릿 이상 */
}

@media (min-width: 1024px) {
  /* 노트북 이상 */
}

@media (min-width: 1440px) {
  /* 대화면 데스크톱 */
}
```

### 3. 유연한 레이아웃

앞서 본 Flexbox와 Grid, 그리고 `%`·`fr`·`max-width` 같은 상대 단위가 여기에 해당한다.

### Mobile First

접근 방식은 두 가지다.

| 구분 | Mobile First | Desktop First |
|---|---|---|
| 설계 순서 | 모바일 → 태블릿 → 데스크톱 | 데스크톱 → 태블릿 → 모바일 |
| 미디어 쿼리 | `min-width` 기준으로 **추가** | `max-width` 기준으로 **제거** |
| 성격 | 핵심 기능부터 쌓아 올림 | 큰 화면에서 덜어냄 |

**Mobile First가 권장된다.** 작은 화면에서 시작하면 무엇이 정말 필요한 콘텐츠인지 먼저 결정하게 되고, 넓은 화면 규칙을 위에 덧붙이는 cascade를 단순하게 만들 수 있다. 미디어 쿼리 안의 CSS도 다운로드되므로 필요한 asset의 전송량은 별도로 관리해야 한다.

## CSS 변수

CSS 변수(Custom Properties)는 반복되는 값을 이름으로 관리한다.

```css
:root {
  --main-color: #007bff;
  --danger-color: #dc3545;
  --default-padding: 16px;
}

.button-primary {
  background-color: var(--main-color);
  padding: var(--default-padding);
}
.alert-box {
  border: 2px solid var(--danger-color);
}
```

`:root`는 `<html>`을 가리키는 의사 클래스이며, 여기에 선언하면 문서 전역에서 쓸 수 있다.

중요한 특징은 CSS 변수가 **런타임에 살아 있다**는 것이다. 뒤에서 다룰 SCSS 변수는 컴파일 시점에 값으로 치환되어 사라지지만, CSS 변수는 브라우저에 남아 JavaScript로 바꿀 수 있다. 다크 모드 전환이 이 성질을 활용한 대표적인 예다.

```js
document.documentElement.style.setProperty('--main-color', '#ff5722');
```

## CSS 전처리기: SCSS

CSS는 규모가 커지면 선택자 반복과 파일 관리가 부담이 된다. 전처리기는 이를 보완한다.

| 구분 | CSS | SCSS | SASS |
|---|---|---|---|
| 문법 | 중괄호 + 세미콜론 | 중괄호 + 세미콜론 | 들여쓰기 |
| 호환성 | 브라우저가 직접 인식 | CSS와 100% 호환 | 별도 문법 |
| 사용 빈도 | 필수 | **현재 업계 표준** | 감소 추세 |

```scss
nav {
  background-color: #333;
  ul {
    list-style: none;
    li { display: inline-block; }
  }
}
```

SCSS의 주요 장점은 **변수(`$primary-color`)**, **중첩(Nesting)**, **믹스인(Mixin)**, **모듈화(`@use` / `@import`)**다.

브라우저는 SCSS를 직접 읽지 못하므로 일반 CSS로 변환하는 과정이 필요하고, 이를 **트랜스파일링(Transpiling)**이라 한다. Vite·Webpack 같은 빌드 도구가 설정만으로 자동 처리한다.

> 참고로 이 블로그(Jekyll Chirpy)도 SCSS를 사용하며, Jekyll이 빌드 시점에 CSS로 변환한다.
{: .prompt-info }

---

여기까지가 표현(CSS)이다. 이제 동작(JavaScript)으로 넘어간다.

## JavaScript는 어떤 언어인가

JavaScript는 브라우저와 서버 양쪽에서 동작하는 프로그래밍 언어로, 웹 3요소 중 **동적 제어와 논리(Behavior)**를 담당한다. 구체적으로 다음이 가능하다.

- HTML의 내용 변경
- HTML 속성값 변경
- CSS 스타일 변경
- 요소 숨기기/보이기

### 기술적 특징

| 특징 | 설명 |
|---|---|
| **실행 방식** | 브라우저 엔진이 코드를 해석하고 필요에 따라 JIT 컴파일하며, 배포 전 build tool이 코드를 parse·변환·bundle할 수도 있음 |
| **Dynamic Typing** | 변수 선언 시 타입을 지정하지 않고, 값이 할당될 때 타입이 결정됨 |
| **Main Event Loop** | 하나의 JS agent에서는 한 번에 하나의 task를 실행. I/O는 브라우저가 처리하고 Worker는 다른 agent에서 실행 가능 |

main event loop가 한 번에 하나의 task를 실행한다는 점이 이 글 후반부의 비동기 처리 전체를 지배한다. 서버 응답을 동기적으로 기다리면 페이지가 멈추므로 브라우저가 I/O를 처리하는 동안 콜백·Promise·async/await로 다음 작업을 이어간다. async 문법 자체가 자바스크립트 코드를 별도 스레드에서 병렬 실행하는 것은 아니다.

### 역사

| 시기 | 사건 |
|---|---|
| 1995 | Netscape의 Brendan Eich가 설계. **Java와는 무관한 별개의 언어** |
| 1996~ | MS가 IE에 JScript 탑재 → 브라우저 전쟁 |
| 1997 | ECMA가 표준 문법 **ECMAScript(ES)** 제정 |
| 2005~2006 | AJAX 등장, jQuery 출시 |
| 2009 | **Node.js** 등장 — 서버에서도 JS 실행 가능 |
| 2015 | **ES6(ES2015)** 대개정 — `let`/`const`, 화살표 함수, 클래스, 모듈, Promise |
| 2016~ | React·Vue·Angular 중심 생태계, 매년 정기 업데이트 |

"Modern JavaScript"라고 부르는 기준점이 **ES6(2015)**다. 이 글에서 다루는 `let`/`const`, 화살표 함수, 템플릿 리터럴, Promise, 모듈이 모두 ES6 이후 문법이다.

### 실행 방법

```html
<!-- 내부 스크립트 -->
<script>
  document.getElementById("demo").innerHTML = "My First JavaScript";
</script>

<!-- 외부 스크립트 -->
<script src="/js/myScript.js"></script>
```

`<script>`는 `<head>`와 `<body>` 어디에나 둘 수 있지만 위치에 따라 결과가 다르다.

- `<head>`에 modifier 없는 classic script를 두면 스크립트를 내려받고 실행하는 동안 **HTML 파싱이 멈춰** 화면 표시가 늦어진다. `defer`, `async`, `type="module"`은 다운로드와 실행 시점이 다르다
- `<body>` 끝에 두면 콘텐츠가 먼저 렌더링된 뒤 실행되어 체감 속도가 빠르고, DOM 요소가 이미 존재하므로 조작이 안전하다

브라우저별 JS 엔진은 다음과 같다.

| 브라우저 | 엔진 |
|---|---|
| Chrome, Edge | V8 |
| Safari | JavaScriptCore |
| Firefox | SpiderMonkey |

Node.js도 V8을 쓴다. 같은 엔진이 브라우저 밖에서도 도는 것이 Node.js의 출발점이다.

### 출력 방법

| 방법 | 용도 |
|---|---|
| `innerHTML` / `innerText` | HTML 요소에 내용 삽입 |
| `document.write()` | HTML 출력 스트림에 직접 쓰기 (실무에서는 지양) |
| `window.alert()` | 경고창 |
| `console.log()` | **개발자 도구 콘솔에 출력 (디버깅의 기본)** |

`console.log()`가 압도적으로 많이 쓰인다. 개발자 도구(`F12`)의 Console 탭에서 확인할 수 있고, JavaScript 에러도 같은 곳에 표시된다. 화면이 예상대로 동작하지 않을 때 **가장 먼저 열어야 할 곳**이다.

## 변수

### var, let, const

| 키워드 | 스코프 | 재선언 | 재할당 |
|---|---|---|---|
| `var` | 함수 스코프 | O | O |
| `let` | 블록 스코프 | X | O |
| `const` | 블록 스코프 | X | X |

**결론부터: `const`를 기본으로 쓰고, 재할당이 필요할 때만 `let`을 쓴다. `var`는 쓰지 않는다.**

`var`를 피하는 이유는 함수 스코프라서 블록을 벗어나도 살아 있고, 재선언이 조용히 허용되어 실수를 잡아주지 못하기 때문이다.

```js
let carName = "Volvo";       // 전역 스코프

{
  let x = 2;
}
// 여기서 x 사용 불가 (블록 스코프)

function myFunction() {
  var a = 1;
  let b = 2;
  const c = 3;
}
// 여기서 a, b, c 모두 사용 불가 (함수 스코프)
```

`const`가 막는 것은 **재할당**이지 값의 불변성이 아니다. 객체나 배열을 `const`로 선언해도 내부 속성은 바꿀 수 있다.

```js
const user = { name: "Kim" };
user.name = "Lee";     // 가능 (내부 속성 변경)
user = { name: "Park" }; // TypeError (재할당 불가)
```

`const`는 "값이 고정된다"가 아니라 **"이 이름이 가리키는 대상이 고정된다"**로 이해해야 한다.

### 호이스팅

호이스팅(Hoisting)은 **선언이 스코프 최상단으로 끌어올려지는** 자바스크립트의 기본 동작이다.

```js
// 작성한 코드
console.log(a);
var a = 10;

// 실제 동작
var a;              // 선언만 끌어올려짐
console.log(a);     // undefined (에러가 아님)
a = 10;             // 할당은 제자리
```

**선언은 호이스팅되지만 초기화(할당)는 되지 않는다.** `let`과 `const`도 호이스팅되긴 하지만 초기화 전에는 접근할 수 없어서 `ReferenceError`가 발생한다. 오히려 이쪽이 안전하다. 값이 없는 상태로 조용히 `undefined`가 흘러가는 것보다 즉시 에러가 나는 편이 디버깅에 유리하다.

## 자료형

자바스크립트의 자료형은 크게 둘로 나뉜다.

| 구분 | 원시 타입 (Primitive) | 객체 타입 (Object) |
|---|---|---|
| 값의 형태 | 단일 값 | 속성(key)과 값(value)의 집합 |
| 복사할 때 | 원시 값이 복사 | 객체를 가리키는 참조값이 복사 |
| 변경 가능성 | 불변 (Immutable) | 가변 (Mutable) |

**원시 타입**: `string`, `number`, `bigint`, `boolean`, `null`, `undefined`, `symbol`
**객체 타입**: `Object`, `Array`, `Function`, `Date`, `RegExp`, `Set`, `Map`

이 구분이 실제로 문제가 되는 지점은 **복사와 전달**이다. 원시 타입은 값이 복사되지만 객체 타입은 같은 객체를 가리키는 참조값이 복사되므로, 그 객체의 속성을 수정하면 다른 참조에서도 변경이 보인다.

```js
let a = 10;
let b = a;
b = 20;
console.log(a);  // 10 (영향 없음)

const obj1 = { value: 10 };
const obj2 = obj1;
obj2.value = 20;
console.log(obj1.value);  // 20 (같은 객체를 가리킴)
```

### String

```js
const single = 'hello';
const double = "hello";
const template = `hello`;   // 백틱
```

백틱으로 감싸는 **템플릿 리터럴**(ES6)은 두 가지 이점이 있다.

```js
const name = "지석";
const age = 28;

// 문자열 결합
console.log("이름: " + name + ", 나이: " + age);

// 템플릿 리터럴 — 보간(interpolation)과 여러 줄
console.log(`이름: ${name}, 나이: ${age}`);
console.log(`여러 줄도
그대로 유지된다`);
```

`${}` 안에는 변수뿐 아니라 표현식도 들어간다. 문자열 결합 연산자보다 읽기 쉬워서 지금은 사실상 기본으로 쓴다.

문자열은 **불변(immutable)**이다. 모든 문자열 메서드는 원본을 바꾸지 않고 **새 문자열을 반환**한다.

```js
// 기본 메서드
"hello".toUpperCase();          // "HELLO"
"  hi  ".trim();                // "hi"
"a-b-c".split("-");             // ["a", "b", "c"]
"hello".slice(1, 3);            // "el"
"hello".replace("l", "L");      // "heLlo"

// 검색 메서드
"hello".indexOf("l");           // 2
"hello".lastIndexOf("l");       // 3
"hello".includes("ell");        // true
"hello".startsWith("he");       // true
```

### Number

자바스크립트는 정수와 실수를 구분하지 않고 하나의 `number` 타입만 쓴다. 여기서 두 가지 함정이 나온다.

```js
console.log(0.1 + 0.2);           // 0.30000000000000004
console.log(0.1 + 0.2 === 0.3);   // false
```

부동소수점 연산의 정밀도 한계로, 자바스크립트만의 문제는 아니다. 금액처럼 정확도가 중요한 값은 정수 단위(원 단위 정수)로 다루거나 전용 라이브러리를 쓴다.

특수한 값도 있다.

```js
console.log(0 / 0);        // NaN (Not a Number)
console.log(1 / 0);        // Infinity
console.log(typeof NaN);   // "number"  ← NaN도 number 타입
```

`NaN`은 자기 자신과도 같지 않아서(`NaN === NaN`은 `false`) `Number.isNaN()`으로 검사해야 한다.

숫자 변환과 관련 메서드는 다음과 같다.

```js
(123.456).toFixed(2);      // "123.46"  (문자열 반환)
(255).toString(2);         // "11111111" (2진수 문자열)
Number("42");              // 42
parseInt("42px");          // 42   (앞에서부터 파싱)
parseFloat("3.14abc");     // 3.14
Number.isInteger(42);      // true
Number.MAX_SAFE_INTEGER;   // 9007199254740991
```

`Number.MAX_SAFE_INTEGER`를 넘는 정수가 필요하면 `BigInt`를 쓴다.

```js
const big = 12345678901234567890n;   // n 접미사
const big2 = BigInt("12345678901234567890");

const x = 10n;
const y = 5;
// const z = x + y;  // TypeError — BigInt와 Number는 직접 연산 불가
```

### null과 undefined

둘 다 "값이 없음"을 나타내지만 성격이 다르다.

- `undefined`: **아직 값이 할당되지 않음** (시스템이 부여)
- `null`: **의도적으로 비어 있음** (개발자가 명시)

```js
let something;
console.log(something);            // undefined

const person = { firstName: "John" };
console.log(person.age);           // undefined (존재하지 않는 속성)

function f() { let x = 5; }
console.log(f());                  // undefined (return이 없는 함수)

let nothing = null;
console.log(nothing);              // null (의도적으로 비움)
```

### 래퍼 객체와 Auto-boxing

원시 타입인 문자열에 어떻게 메서드를 쓸 수 있을까?

```js
const name = "gemini";
console.log(name.toUpperCase());  // "GEMINI" — 원시 타입인데 메서드가 동작한다
```

자바스크립트 엔진이 원시 타입의 속성이나 메서드에 접근하는 순간 **임시로 래퍼 객체(Wrapper Object)로 변환**해주기 때문이다. 이를 **Auto-boxing**이라 한다.

| 원시 타입 | 래퍼 객체 | 비고 |
|---|---|---|
| String | `String` | 가장 빈번하게 변환됨 |
| Number | `Number` | `(10).toString()`처럼 괄호가 필요할 때가 있음 |
| Boolean | `Boolean` | |
| Symbol | `Symbol` | `new`로 직접 생성 금지 |
| BigInt | `BigInt` | `new`로 직접 생성 불가 |
| `null`, `undefined` | **없음** | 접근 시 무조건 `TypeError` |

```js
console.log(typeof "hello");              // "string"  (원시 타입)
console.log(typeof new String("hello"));  // "object"  (객체)
```

`new String()`처럼 명시적으로 래퍼 객체를 만들 필요는 없다. 코드를 복잡하게 만들고 실행 속도만 느려진다.

`null`과 `undefined`에 래퍼 객체가 없다는 점이 실무에서 자주 만나는 `Cannot read properties of undefined` 에러의 정체다.

## 연산자

### 산술 연산자

| 연산자 | 설명 | 예시 | 결과 |
|---|---|---|---|
| `+` | 덧셈 | `5 + 3` | `8` |
| `-` | 뺄셈 | `5 - 3` | `2` |
| `*` | 곱셈 | `5 * 3` | `15` |
| `/` | 나눗셈 | `6 / 2` | `3` |
| `%` | 나머지 | `5 % 2` | `1` |
| `**` | 거듭제곱 | `2 ** 3` | `8` |
| `++` / `--` | 증가 / 감소 | `let a = 1; a++;` | `2` |

`+`는 덧셈과 문자열 결합을 겸한다. 피연산자 중 하나라도 문자열이면 결합이 된다.

```js
console.log(5 + 3);      // 8
console.log("5" + 3);    // "53"  (문자열 결합)
console.log("5" - 3);    // 2     (숫자로 변환 후 뺄셈)
```

`-`는 결합 기능이 없어 숫자 변환이 일어나는 반면 `+`는 그렇지 않다. 폼 입력값(항상 문자열)을 다룰 때 자주 겪는 버그다.

### 비교 연산자

| 연산자 | 설명 | 예시 | 결과 |
|---|---|---|---|
| `==` | 느슨한 비교 (타입 변환 후 비교) | `5 == '5'` | `true` |
| `===` | **엄격한 비교** (값과 타입 모두) | `5 === '5'` | `false` |
| `!=` | 느슨한 부등 | `5 != '5'` | `false` |
| `!==` | 엄격한 부등 | `5 !== '5'` | `true` |
| `<`, `>`, `<=`, `>=` | 크기 비교 | `5 > 3` | `true` |

**항상 `===`와 `!==`를 쓴다.** `==`는 암묵적 타입 변환 규칙이 직관과 어긋나는 경우가 많아 예측하기 어렵다.

```js
console.log(0 == "");        // true
console.log(0 == false);     // true
console.log(null == undefined); // true

console.log(0 === "");       // false
console.log(0 === false);    // false
```

### 논리 연산자

```js
console.log(true && false);   // false  (AND)
console.log(true || false);   // true   (OR)
console.log(!true);           // false  (NOT)
```

논리 연산자는 불리언이 아니라 **피연산자 중 하나를 그대로 반환**한다. 이 성질을 이용한 관용구가 있다.

```js
const name = inputName || "익명";      // inputName이 falsy면 "익명"
isLoggedIn && showDashboard();         // isLoggedIn이 true일 때만 실행
```

**Falsy 값**은 `false`, `0`, `""`, `null`, `undefined`, `NaN` 여섯 개이고, 나머지는 전부 truthy다. 빈 배열 `[]`과 빈 객체 `{}`도 truthy라는 점을 놓치기 쉽다.

### 비트 연산자

정수를 2진수로 다룬다.

| 연산자 | 예시 | 2진 연산 | 결과 |
|---|---|---|---|
| `&` (AND) | `5 & 1` | `0101 & 0001` | `1` |
| <code>&#124;</code> (OR) | <code>5 &#124; 1</code> | <code>0101 &#124; 0001</code> | `5` |
| `^` (XOR) | `5 ^ 1` | `0101 ^ 0001` | `4` |
| `~` (NOT) | `~5` | 비트 반전 (2의 보수) | `-6` |
| `<<`, `>>`, `>>>` | `5 >> 1` | `0101 >> 1` | `2` |

`~`는 2의 보수 체계로 동작해서 `~n === -(n+1)`이 된다. `~5`가 `-6`인 이유다.

### 기타 연산자

| 연산자 | 설명 | 예시 | 결과 |
|---|---|---|---|
| 삼항 `? :` | 조건부 연산 | `(5 > 3) ? 'Yes' : 'No'` | `'Yes'` |
| `typeof` | 자료형 반환 | `typeof 42` | `'number'` |
| `in` | 객체에 속성 존재 여부 | `"name" in person` | `true` / `false` |
| `instanceof` | 특정 생성자의 인스턴스인지 | `cars instanceof Array` | `true` / `false` |

```js
const status = score >= 60 ? "합격" : "불합격";
```

## 제어문

### if / else

```js
if (country === "USA" && age >= 16) {
  text = "You can drive!";
} else if (age >= 14) {
  text = "곧 가능합니다.";
} else {
  text = "You can Not drive!";
}
```

### switch

```js
switch (new Date().getDay()) {
  case 6:
    text = "Today is Saturday";
    break;
  case 0:
    text = "Today is Sunday";
    break;
  default:
    text = "Looking forward to the Weekend";
}
```

`switch`는 `===`(엄격한 비교)로 값을 비교한다. 그리고 **`break`를 빠뜨리면 다음 `case`가 이어서 실행된다(fall-through).** 의도한 동작이 아니라면 버그가 되므로, `break`를 빠뜨리지 않는 것이 중요하다. 반대로 여러 case를 묶어 처리할 때는 이 성질을 일부러 활용하기도 한다.

## 반복문

| 종류 | 용도 |
|---|---|
| `for` | 횟수가 정해진 반복 |
| `while` | 조건이 참인 동안 반복 |
| `do...while` | **최소 1회 실행 후** 조건 검사 |
| `for...in` | 객체의 **속성(key)** 순회 |
| `for...of` | 배열·문자열 등 **반복 가능한 객체의 값** 순회 |
| `forEach()` | 배열의 각 요소 순회 (배열 메서드) |

```js
for (let i = 0; i < 5; i++) {
  console.log(i);
}

let count = 0;
while (count < 3) {
  console.log(count);
  count++;
}

// for...in : 객체의 key
const obj = { name: '홍길동', age: 28 };
for (const key in obj) {
  console.log(key, obj[key]);
}

// for...of : 배열의 값
const arr = [10, 20, 30];
for (const value of arr) {
  console.log(value);
}
```

`for...in`과 `for...of`의 혼동이 잦다. **`in`은 키(key), `of`는 값(value)**이다. 배열에 `for...in`을 쓰면 인덱스가 **문자열로** 나오고 상속된 속성까지 순회할 수 있어 권장되지 않는다.

```js
break;     // 반복문 전체를 즉시 종료
continue;  // 현재 회차만 건너뛰고 다음 회차로
```

## 함수

### 선언과 호출

```js
function name(p1, p2) {
  return p1 * p2;
}

const result = name(3, 4);   // 12
```

- **매개변수(Parameter)**: 함수 정의에 나열된 이름
- **인수(Argument)**: 호출 시 실제로 전달하는 값

자바스크립트 함수는 **타입도 개수도 검사하지 않는다.** 인수가 부족하면 해당 매개변수는 `undefined`가 된다.

```js
function greet(name = "손님") {   // 기본 매개변수 (ES6)
  return `${name}님 환영합니다`;
}
greet();          // "손님님 환영합니다"
```

`return`을 만나면 함수가 즉시 종료되며, 그 뒤 코드는 실행되지 않는다. `return`이 없으면 `undefined`를 반환한다.

**함수를 호출하는 것과 참조하는 것은 다르다.**

```js
function sayHello() { return "Hello World"; }

const a = sayHello;     // 함수 자체를 참조
const b = sayHello();   // 함수를 호출한 결과("Hello World")
```

이벤트 핸들러 등록에서 이 차이가 결정적이다. `addEventListener("click", handler())`라고 쓰면 등록 시점에 함수가 실행되고 그 반환값이 등록되어 버린다.

### 함수 선언문 vs 함수 표현식

```js
// 함수 선언문
function multiply(a, b) { return a * b; }

// 함수 표현식
const multiply = function(a, b) { return a * b; };

// 화살표 함수 (ES6)
const multiply = (a, b) => a * b;
```

셋의 차이는 **호이스팅**이다.

```js
sayHello();   // "Hello" — 정상 동작 (선언 전 호출 가능)
function sayHello() { console.log("Hello"); }

sayHi();      // ReferenceError
const sayHi = function() { console.log("Hi"); };
```

함수 선언문은 통째로 호이스팅되어 선언 전에도 호출할 수 있다. 편해 보이지만 규모가 커지면 실행 흐름을 읽기 어렵게 만든다. 함수 표현식은 런타임에 평가되므로 **조건에 따라 다른 함수를 할당**하는 것도 가능하다.

```js
let guestWelcome;
if (isVIP) {
  guestWelcome = function() { console.log("VIP 라운지로 안내합니다."); };
} else {
  guestWelcome = function() { console.log("일반 대기실로 안내합니다."); };
}
guestWelcome();
```

화살표 함수는 문법이 간결할 뿐 아니라 `this` 바인딩 방식도 다르다. 일반 함수는 호출 방식에 따라 `this`가 결정되지만, 화살표 함수는 **선언된 위치의 `this`를 그대로 사용**한다. 콜백 안에서 `this`가 엉뚱한 것을 가리키는 문제를 피할 수 있어 콜백에는 화살표 함수를 주로 쓴다.

### 값 전달 방식

| 구분 | Call by Value (원시 타입) | Call by Sharing (객체 타입) |
|---|---|---|
| 복사 대상 | 원시 값 | 객체를 가리키는 참조값 |
| 함수 내부 수정 | 원본에 영향 없음 | **원본 객체의 속성이 바뀜** |

```js
function changeValue(x) { x = 20; }
let a = 10;
changeValue(a);
console.log(a);          // 10 (변하지 않음)

function changeProperty(obj) { obj.name = "Lee"; }
let user = { name: "Kim" };
changeProperty(user);
console.log(user.name);  // "Lee" (원본이 바뀜)
```

앞서 본 원시/객체 타입의 메모리 저장 방식이 그대로 드러나는 지점이다. 함수가 인자로 받은 객체를 수정하면 호출자 쪽에도 반영되므로, 예상치 못한 부작용을 만들기 쉽다.

## 배열

배열은 데이터 컬렉션을 저장하기 위한 객체 타입이다.

- 요소는 인덱스로 **순서**를 가지며 **0부터** 시작한다
- 크기가 **동적**이다
- **서로 다른 타입**의 요소를 함께 담을 수 있다

```js
const cars = ["Saab", "Volvo", "BMW"];   // 배열 리터럴 (권장)
const cars2 = new Array("Saab", "Volvo");

console.log(cars[0]);        // "Saab"
cars[0] = "Opel";
console.log(cars.length);    // 3
```

### 기본 메서드

```js
const arr = [1, 2, 3];

arr.push(4);        // 뒤에 추가 → [1,2,3,4]
arr.pop();          // 뒤에서 제거하고 반환
arr.unshift(0);     // 앞에 추가
arr.shift();        // 앞에서 제거하고 반환
arr.at(-1);         // 마지막 요소 (arr[arr.length-1]과 동일)
arr.join("-");      // "1-2-3"  문자열로 결합
arr.slice(1, 3);    // 부분 복사 (원본 유지)
arr.splice(1, 1);   // 삭제/삽입 (원본 변경)
```

`push`/`pop`은 뒤, `unshift`/`shift`는 앞이라고 기억하면 된다.

### 검색 메서드

```js
arr.indexOf(5);            // 인덱스 반환, 없으면 -1
arr.lastIndexOf(5);        // 뒤에서부터 검색
arr.includes(5);           // true / false
users.find(u => u.id === 3);       // 조건에 맞는 첫 요소 (없으면 undefined)
users.findIndex(u => u.id === 3);  // 조건에 맞는 첫 인덱스
```

### 정렬 메서드

```js
arr.sort();          // 원본을 변경하며 정렬
arr.reverse();       // 원본을 뒤집음
arr.toSorted();      // 원본을 유지하고 정렬된 새 배열 반환
arr.toReversed();    // 원본을 유지하고 뒤집은 새 배열 반환
```

`sort()`는 인수가 없으면 요소를 **문자열로 변환해 사전순 정렬**한다. 숫자 배열에서 예상과 다른 결과가 나오는 대표적 함정이다.

```js
[10, 9, 100].sort();               // [10, 100, 9]  ← 문자열 정렬
[10, 9, 100].sort((a, b) => a - b); // [9, 10, 100]  ← 비교 함수 필요
```

### 순회 메서드

가장 많이 쓰는 네 가지다.

```js
const arr = [1, 2, 3, 4];

arr.forEach(item => console.log(item));      // 순회만, 반환값 없음
const doubled = arr.map(item => item * 2);   // [2,4,6,8] 가공한 새 배열
const evens = arr.filter(item => item % 2 === 0);  // [2,4] 조건에 맞는 요소만
const total = arr.reduce((sum, item) => sum + item, 0);  // 10 누적 계산
```

| 메서드 | 반환값 | 용도 |
|---|---|---|
| `forEach` | `undefined` | 각 요소에 대해 뭔가 실행만 |
| `map` | 같은 길이의 새 배열 | 모든 요소를 일정 규칙으로 **변환** |
| `filter` | 조건을 만족하는 요소의 새 배열 | **선별** |
| `reduce` | 누적된 단일 값 | 합계·평균 등 **집계** |

`map`과 `filter`는 원본을 바꾸지 않고 새 배열을 반환하므로 체이닝할 수 있다.

```js
const result = users
  .filter(u => u.age >= 20)
  .map(u => u.name);
```

`forEach` 대신 `map`을 쓰고 반환값을 버리는 코드를 종종 보는데, 의도가 드러나지 않으므로 목적에 맞는 메서드를 쓰는 편이 좋다.

### 전개 연산자

`...`은 배열을 개별 요소로 펼친다.

```js
const numbers = [23, 55, 21, 87, 56];
Math.min(...numbers);   // Math.min(23, 55, 21, 87, 56)과 동일

const copy = [...numbers];            // 얕은 복사
const merged = [...arr1, ...arr2];    // 병합
```

`const copy = numbers`는 같은 배열을 가리키지만, `[...numbers]`는 새 배열을 만든다. 원본을 보존하고 싶을 때 필수적인 관용구다.

## 객체

객체는 **속성(Property)과 메서드(Method)의 컨테이너**다.

- 속성: `key: value` 쌍으로 저장된 이름 있는 값
- 메서드: `key: function()` 쌍으로 저장된 함수

```js
const person = {
  firstName: "John",
  lastName: "Doe",
  age: 50,
  fullName: function() {
    return this.firstName + " " + this.lastName;
  }
};
```

### 속성 접근

```js
person.firstName;        // 점 표기법 (권장)
person["firstName"];     // 대괄호 표기법

const key = "age";
person[key];             // 변수로 접근할 때는 대괄호가 필수
person["first-name"];    // 키에 하이픈이 있을 때도 대괄호
```

속성의 추가·수정·삭제와 존재 확인은 다음과 같다.

```js
person.email = "a@b.com";      // 추가
person.age = 51;               // 수정
delete person.age;             // 삭제
console.log("age" in person);  // 존재 확인
```

### this

객체의 메서드 안에서 `this`는 **그 메서드를 호출한 객체**를 가리킨다.

```js
const person = {
  firstName: "John",
  lastName: "Doe",
  fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
};
console.log(person.fullName());   // "John Doe"
```

`this`는 자바스크립트에서 가장 헷갈리는 개념 중 하나다. **선언 위치가 아니라 호출 방식에 따라 결정**되기 때문이다. 앞서 언급했듯 화살표 함수는 이 규칙을 따르지 않고 선언된 위치의 `this`를 그대로 쓴다.

### 객체 출력

객체를 그대로 출력하면 `[object Object]`가 나온다.

```js
Object.keys(person);      // ["firstName", "lastName", "age"]
Object.values(person);    // ["John", "Doe", 50]
Object.entries(person);   // [["firstName","John"], ...]  반복문에 유용
JSON.stringify(person);   // 문자열로 변환
```

### 생성자 함수와 prototype

같은 구조의 객체를 여러 개 만들 때는 생성자 함수를 쓴다.

```js
function Person(first, last, age) {
  this.firstName = first;
  this.lastName = last;
  this.age = age;
}

const myFather = new Person("John", "Doe", 50);
const myMother = new Person("Sally", "Rally", 48);
```

생성자로 만들어진 객체에 나중에 속성이나 메서드를 추가하려면 **생성자 함수의 `prototype`**에 추가해야 한다.

```js
Person.prototype.nationality = "Korean";
Person.prototype.getFullName = function() {
  return `${this.firstName} ${this.lastName}`;
};
```

메서드를 `prototype`에 두는 이유는 **메모리 효율**이다. 생성자 안에 직접 넣으면 인스턴스마다 같은 함수가 하나씩 복제되지만, `prototype`에 두면 모든 인스턴스가 하나를 공유한다. ES6의 `class` 문법도 내부적으로는 이 프로토타입 구조 위에서 동작한다.

## 내장 객체

| 객체 | 목적 | 인스턴스 생성 |
|---|---|---|
| `Object` | 모든 객체의 기본 | 보통 `{}` 리터럴 |
| `Array` | 순서 있는 리스트 | 보통 `[]` 리터럴 |
| `String` | 문자열 조작 | 보통 `""` 리터럴 |
| `Math` | 수학 연산 | **불가.** 정적 메서드로 바로 호출 |
| `Date` | 날짜·시간 | **필수.** `new Date()` |
| `JSON` | 텍스트 ↔ 객체 변환 | **불가.** 정적 메서드 |
| `RegExp` | 정규표현식 | 보통 `/패턴/` 리터럴 |

### Math

`Math`는 정적 객체라 `new` 없이 바로 쓴다.

```js
Math.PI;              // 3.141592653589793
Math.E;               // 2.718281828459045

Math.round(4.6);      // 5   반올림
Math.ceil(4.1);       // 5   올림
Math.floor(4.9);      // 4   내림
Math.trunc(-4.9);     // -4  소수점 버림 (floor와 음수에서 다름)

Math.random();        // 0 이상 1 미만 난수
Math.floor(Math.random() * 50) + 1;   // 1~50 사이 정수
```

`Math.floor(-4.9)`는 `-5`이고 `Math.trunc(-4.9)`는 `-4`다. 음수에서 둘이 갈린다.

### Date

```js
const now = new Date();                 // 현재 날짜·시간
const d = new Date("2026-03-25");       // 문자열로 생성

now.getFullYear();   // 연도
now.getMonth();      // 월 (0~11 ← 0부터 시작)
now.getDate();       // 일
now.getDay();        // 요일 (0=일요일)

now.toISOString();   // "2026-07-24T00:00:00.000Z"
now.toDateString();
```

자바스크립트는 날짜를 **1970년 1월 1일부터의 밀리초**로 저장한다. `getMonth()`가 0부터 시작하는 것은 대표적인 실수 유발 지점이다. 1월이 `0`, 12월이 `11`이다.

### JSON

객체와 텍스트를 상호 변환한다. 서버와 통신할 때 필수적이다.

```js
// 직렬화 (Serialization): 객체 → 문자열
const user = { name: "홍길동", age: 15 };
const jsonString = JSON.stringify(user);
console.log(jsonString);          // '{"name":"홍길동","age":15}'
console.log(typeof jsonString);   // "string"

// 역직렬화 (Deserialization): 문자열 → 객체
const received = '{"name":"홍길동","age":15}';
const obj = JSON.parse(received);
console.log(obj.name);            // "홍길동"
console.log(typeof obj);          // "object"
```

네트워크로는 텍스트만 오갈 수 있기 때문에, 객체를 보내려면 문자열로 바꾸고(`stringify`) 받은 쪽에서 다시 객체로 되돌린다(`parse`). 뒤에서 다룰 `fetch`의 `response.json()`이 내부적으로 이 역할을 한다.

`JSON.stringify`는 함수와 `undefined` 속성을 제외한다는 점에 주의한다.

### RegExp

문자열에서 패턴을 찾는다.

```text
/pattern/modifier
```

```js
const n = text.search(/w3schools/i);   // i = 대소문자 구분 없음

const regex = /[0-9]{3}-[0-9]{4}-[0-9]{4}/;
console.log(regex.test("010-1234-5678"));  // true
```

주요 용도는 검색·치환·**유효성 검증**이다. 앞서 HTML `<input>`의 `pattern` 속성도 정규표현식을 받는다.

### Set과 Map

```js
// Set: 중복 없는 값의 집합
const set = new Set([1, 2, 2, 3]);
console.log(set.size);           // 3 (중복 제거됨)
set.add(4);
set.has(2);                      // true

const unique = [...new Set(arr)];  // 배열 중복 제거 관용구

// Map: 키-값 쌍의 컬렉션 (키에 모든 타입 사용 가능)
const map = new Map();
map.set("name", "홍길동");
map.get("name");                 // "홍길동"
map.has("name");                 // true
```

일반 객체의 키는 문자열(또는 Symbol)로 강제 변환되지만, `Map`은 객체나 함수도 키로 쓸 수 있고 삽입 순서를 보장한다.

---

여기까지가 JavaScript 언어 자체다. 이제 **브라우저와 상호작용하는 부분**으로 넘어간다.

## DOM

브라우저는 HTML 문서를 읽으면서 **DOM(Document Object Model)**이라는 트리 구조를 만든다. 문서의 각 요소를 객체로 표현한 것이며, 자바스크립트는 이 객체를 조작해 화면을 바꾼다.

```text
Document
└── <html>
    ├── <head>
    │   └── <title> → "My title" (Text Node)
    └── <body>
        ├── <a> → href (Attribute Node)
        └── <h1> → "My header" (Text Node)
```

노드의 종류는 다음과 같다.

| 노드 | 설명 |
|---|---|
| Document | 문서 전체의 소유자 |
| Element Node | `<html>`, `<body>`, `<h1>` 같은 요소 |
| Attribute Node | `href` 같은 속성 |
| Text Node | 요소 안의 텍스트 |

중요한 점은 **DOM이 HTML 파일 그 자체가 아니라 브라우저가 해석해 만든 결과물**이라는 것이다. 자바스크립트가 DOM을 바꿔도 원본 HTML 파일은 변하지 않는다. 새로고침하면 원래대로 돌아오는 이유다.

### 요소 선택

```js
document.getElementById("demo");             // id로 (단일 요소)
document.getElementsByTagName("p");          // 태그명으로 (HTMLCollection)
document.getElementsByClassName("intro");    // 클래스명으로 (HTMLCollection)

document.querySelector(".card");             // CSS 선택자로 (첫 번째 하나)
document.querySelectorAll(".card");          // CSS 선택자로 (전부, NodeList)
```

`querySelector`/`querySelectorAll`이 가장 유연하다. CSS 선택자를 그대로 쓸 수 있어서 별도의 문법을 외울 필요가 없다.

```js
document.querySelector("#list > li:first-child");
document.querySelectorAll("input[type='checkbox']:checked");
```

`querySelectorAll`이 반환하는 `NodeList`는 배열이 아니라 유사 배열이다. `forEach`는 되지만 `map`·`filter`는 안 되므로, 필요하면 배열로 변환한다.

```js
const items = [...document.querySelectorAll(".item")];
items.map(el => el.textContent);
```

### 내용과 스타일 변경

```js
const el = document.getElementById("demo");

el.innerHTML = "<strong>Hello</strong>";   // HTML로 해석
el.textContent = "<strong>Hello</strong>"; // 텍스트 그대로 표시

el.setAttribute("src", "new.jpg");         // 속성 변경
el.src = "new.jpg";                        // 속성 직접 접근

el.style.color = "red";                    // 인라인 스타일
el.style.backgroundColor = "yellow";       // CSS의 background-color → 카멜케이스

el.classList.add("active");                // 클래스 조작 (권장)
el.classList.remove("hidden");
el.classList.toggle("open");
```

CSS 속성명은 자바스크립트에서 **카멜케이스**로 바뀐다. `background-color`가 `backgroundColor`가 되는 식이다.

스타일 변경은 `style` 속성을 직접 건드리기보다 **`classList`로 클래스를 토글하는 방식**이 낫다. 스타일 정의는 CSS에 남고 자바스크립트는 상태만 바꾸므로, 관심사 분리 원칙에 부합한다.

> 사용자 입력을 그대로 `innerHTML`에 넣으면 XSS(Cross-Site Scripting) 취약점이 된다. `innerHTML`로 삽입한 `<script>` 요소는 일반적으로 실행되지 않지만 event handler 속성이나 SVG 등 실행 가능한 markup을 통해 공격할 수 있다. 텍스트만 넣을 때는 반드시 `textContent`를 쓴다.
{: .prompt-danger }

## 이벤트

이벤트는 HTML 요소에서 일어나는 사건이다. 버튼 클릭, 페이지 로드 완료, 마우스 이동, 키 입력, 입력값 변경 등이 모두 이벤트다.

### 주요 이벤트

| 이벤트 | 발생 시점 |
|---|---|
| `click` | 요소를 클릭할 때 |
| `dblclick` | 두 번 클릭할 때 |
| `mouseover` / `mouseout` | 마우스가 요소에 올라갈 때 / 벗어날 때 |
| `keydown` / `keyup` | 키를 누를 때 / 뗄 때 |
| `change` | 입력·선택 값이 변경될 때 |
| `input` | 입력할 때마다 (실시간) |
| `focus` / `blur` | 포커스를 받을 때 / 잃을 때 |
| `submit` | 폼이 제출될 때 |
| `load` | 페이지나 이미지 로드가 완료됐을 때 |

`change`와 `input`의 차이는 발생 시점이다. `input`은 글자를 입력할 때마다 즉시, `change`는 포커스를 잃거나 값 확정 시 발생한다. 실시간 검색에는 `input`을 쓴다.

### 이벤트 등록 방법 세 가지

| 방식 | 설명 | 평가 |
|---|---|---|
| Inline Handler | HTML 태그에 `onclick` 속성 직접 작성 | **비권장.** 구조와 동작이 뒤섞임 |
| DOM Property | `element.onclick = fn` | **비권장.** 핸들러 1개만 등록 가능 |
| `addEventListener` | 메서드로 등록 | **권장** |

```html
<!-- 방식 1: Inline (비권장) -->
<button onclick="displayDate()">Time is?</button>

<!-- 방식 3: addEventListener (권장) -->
<button id="myBtn">Click me</button>
<script>
  const btn = document.getElementById("myBtn");
  btn.addEventListener("click", function () {
    document.getElementById("demo").innerHTML = Date();
  });
</script>
```

`addEventListener`를 권장하는 이유는 명확하다.

1. **복수 핸들러 등록 가능** — 같은 요소, 같은 이벤트에 여러 함수를 붙일 수 있다. DOM Property 방식은 나중 것이 앞의 것을 덮어쓴다
2. **버블링/캡처링 제어 가능**
3. **`removeEventListener`로 제거 가능**
4. **관심사 분리** — HTML에 자바스크립트가 섞이지 않는다

```js
element.addEventListener(event, function, useCapture);
```

세 번째 인자 `useCapture`는 기본값 `false`(버블링)이며, 이것이 다음 주제로 이어진다.

### 이벤트 전파

`<div>` 안에 `<p>`가 있고 `<p>`를 클릭하면, 두 요소 모두의 클릭 이벤트가 발생한다. 어느 쪽이 먼저 처리되는가가 **이벤트 전파(Event Propagation)** 문제다.

| 구분 | 이벤트 버블링 (Bubbling) | 이벤트 캡처링 (Capturing) |
|---|---|---|
| 전파 방향 | **하위 → 상위** (자식에서 부모로) | **상위 → 하위** (부모에서 자식으로) |
| 설정 | 3번째 인자 생략 또는 `false` | 3번째 인자 `true` |
| 활용도 | **높음** (이벤트 위임의 핵심) | 낮음 (특수한 가로채기 용도) |

기본값은 버블링이다. 안쪽 요소부터 처리되고 바깥으로 퍼져 나간다.

버블링이 중요한 이유는 **이벤트 위임(Event Delegation)** 패턴 때문이다. 목록의 각 항목마다 핸들러를 붙이는 대신, 부모에 하나만 붙이고 어느 자식에서 발생했는지 판별한다.

```js
document.querySelector("#list").addEventListener("click", (e) => {
  if (e.target.matches(".delete-btn")) {
    e.target.closest("li").remove();
  }
});
```

이 방식이 유리한 이유는 두 가지다. 핸들러가 하나뿐이라 메모리를 아낄 수 있고, **나중에 동적으로 추가된 항목도 자동으로 동작한다.** 개별 등록 방식이라면 항목을 추가할 때마다 핸들러를 다시 붙여야 한다.

### 이벤트 제어

| 메서드 | 역할 |
|---|---|
| `addEventListener(type, handler)` | 이벤트 등록 |
| `removeEventListener(type, handler)` | 이벤트 제거 |
| `event.stopPropagation()` | 상위로의 전파 중단 |
| `event.stopImmediatePropagation()` | 같은 요소의 다른 핸들러 실행까지 중단 |
| `event.preventDefault()` | 요소의 **기본 동작** 취소 |

`removeEventListener`는 **등록할 때와 동일한 함수 참조**를 넘겨야 제거된다. 익명 함수로 등록하면 제거할 방법이 없다.

```js
// 제거 불가 — 두 익명 함수는 서로 다른 참조
btn.addEventListener("click", () => console.log("hi"));
btn.removeEventListener("click", () => console.log("hi"));

// 제거 가능
function handleClick() { console.log("hi"); }
btn.addEventListener("click", handleClick);
btn.removeEventListener("click", handleClick);
```

`preventDefault()`는 브라우저의 기본 동작을 막는다. 폼 제출 시 페이지가 새로고침되는 것, `<a>` 클릭 시 페이지가 이동하는 것이 기본 동작이다.

```js
form.addEventListener("submit", (e) => {
  e.preventDefault();      // 페이지 새로고침 방지
  // 자바스크립트로 직접 검증하고 처리
});
```

## 비동기 JavaScript

자바스크립트는 **싱글 스레드**다. 한 번에 하나의 작업만 처리한다. 만약 서버에서 이미지를 내려받는 동안 코드가 멈춰 서서 기다린다면, 그동안 웹페이지 전체가 얼어붙는다. 스크롤도 클릭도 되지 않는다.

비동기 처리는 이 문제의 해법이다. **오래 걸리는 작업의 완료를 기다리지 않고 다음 코드를 먼저 실행**한 뒤, 작업이 끝나면 그때 결과를 처리한다.

### 비동기 처리의 발전

| 세대 | 방식 | 특징 |
|---|---|---|
| 1세대 | Callback | 함수 안에 함수를 계속 중첩. **콜백 지옥(Callback Hell)** — 가독성이 최악이고 에러 처리가 어렵다 |
| 2세대 (ES6) | **Promise** | 비동기 상태를 객체로 구조화. `.then()`/`.catch()` 체이닝으로 콜백 지옥 해소 |
| 3세대 (ES8) | **async / await** | Promise 위에 얹은 문법으로, 비동기 코드를 동기식처럼 읽히게 만든다 |

### Promise

Promise는 비동기 연산의 **최종 완료 또는 실패와 그 결과값**을 나타내는 객체다. "결과를 알려주겠다고 약속하는 객체"라고 이해하면 된다.

**세 가지 상태**를 가진다.

| 상태 | 의미 |
|---|---|
| Pending (대기) | 작업이 시작됐고 아직 성공도 실패도 아닌 초기 상태 |
| Fulfilled (이행/성공) | 작업이 성공했고 결과값이 있음 |
| Rejected (거부/실패) | 작업이 실패했고 실패 사유가 있음 |

```js
const myPromise = new Promise(function(resolve, reject) {
  // 시간이 걸리는 작업
  resolve(value);   // 성공 시 → .then()으로 전달
  reject(error);    // 실패 시 → .catch()로 전달
});

myPromise
  .then(function(value) { console.log(value); })
  .catch(function(error) { console.log(error); });
```

주의할 점은 **`resolve()`와 `reject()`가 함수의 실행 흐름을 끊지 않는다**는 것이다. 결과값을 저장할 뿐이므로 아래 코드가 계속 실행된다.

```js
const p = new Promise((resolve, reject) => {
  resolve("성공");
  console.log("이 코드도 실행된다");   // 실행됨
});
```

즉시 종료하려면 `return resolve(...)`처럼 명시해야 한다.

### Promise Chain

여러 비동기 작업을 순서대로 실행하려면 `.then()` 안에서 **다음 Promise를 `return`**한다.

```js
function step1() { return Promise.resolve("A"); }
function step2(v) { return Promise.resolve(v + "B"); }
function step3(v) { return Promise.resolve(v + "C"); }

step1()
  .then(value => { return step2(value); })
  .then(value => { return step3(value); })
  .then(value => { console.log(value); });   // "ABC"
```

`return`을 빠뜨리면 **실행 순서가 보장되지 않는다.** 이 지점이 Promise 체이닝에서 가장 흔한 버그다.

### async / await

체인이 길어지면 여전히 읽기 어렵다. `async`/`await`는 같은 코드를 동기식처럼 보이게 만든다.

```js
async function run() {
  const v1 = await step1();
  const v2 = await step2(v1);
  const v3 = await step3(v2);
  console.log(v3);   // "ABC"
}
```

**`async`**

- "이 함수 안에서 비동기 처리를 한다"고 선언하는 키워드
- `async` 함수는 **항상 Promise를 반환**한다. 일반 값을 반환하면 자동으로 `Promise.resolve(값)`으로 감싸진다

```js
async function hello() { return "안녕하세요!"; }

console.log(hello());                    // Promise { '안녕하세요!' }
hello().then(res => console.log(res));   // "안녕하세요!"
```

**`await`**

- "비동기 작업이 끝날 때까지 다음 줄로 넘어가지 말고 기다려라"
- **`async` 함수 안에서만** 사용할 수 있다

에러 처리는 `try...catch`로 한다. Promise의 `.catch()`보다 익숙한 문법이라는 것도 장점이다.

```js
async function handleData() {
  try {
    const result = await fetchData();
    const saved = await saveToDatabase(result);
    console.log("저장 성공", saved);
  } catch (error) {
    console.log("에러 발생", error);
  }
}
```

### 실행 흐름: Event Loop와 Microtask Queue

`await`가 "기다린다"고 해서 전체 프로그램이 멈추는 것은 아니다. 내부에서는 다음 순서로 동작한다.

**1단계 — `await`를 만나 함수가 일시 정지된다**

`await` 뒤의 비동기 작업은 즉시 시작되고, 해당 `async` 함수의 실행은 **일시 정지**된다. 함수 내부의 나머지 코드와 현재 상태(컨텍스트)는 별도 공간에 보관된다. 제어권은 이 함수를 호출한 **메인 실행 흐름(Call Stack)**으로 돌아가고, 그 아래에 남아 있던 동기 코드가 계속 실행된다.

**2단계 — 메인 흐름 실행 중 비동기 작업이 완료된다**

이때 완료됐다고 해서 실행 중인 코드를 중간에 끊고 끼어들 수 없다. 자바스크립트는 싱글 스레드라 한 번에 하나만 실행할 수 있기 때문이다. 대신 `async` 함수의 나머지 부분이 **Microtask Queue**라는 대기줄에 등록되어 순서를 기다린다.

**3단계 — 메인 흐름이 끝나면 복귀한다**

메인 실행 흐름의 마지막 동기 코드까지 전부 실행되어 **Call Stack이 완전히 비면**, **Event Loop**가 Microtask Queue에서 대기 중이던 코드를 꺼내 Call Stack에 올린다. 흐름은 `await` 바로 다음 줄로 복귀해 남은 로직을 실행한다.

```js
console.log("1");

setTimeout(() => console.log("2"), 0);        // Task Queue

Promise.resolve().then(() => console.log("3")); // Microtask Queue

console.log("4");

// 출력 순서: 1 → 4 → 3 → 2
```

`setTimeout(0)`인데도 `3`보다 늦게 나오는 이유는 **Microtask Queue가 Task Queue보다 우선순위가 높기** 때문이다. 동기 코드가 전부 끝난 뒤, Microtask를 모두 비우고, 그다음에 Task를 처리한다.

이 순서를 이해하고 있으면 "왜 `console.log`가 예상과 다른 순서로 찍히는가" 같은 문제를 추적할 수 있다.

## Browser API

브라우저는 자바스크립트 엔진에게 여러 내장 도구를 제공한다. 이를 **Browser API**라 한다.

| 분류 | 대표 API | 역할 |
|---|---|---|
| DOM API | `querySelector()`, `addEventListener()` | HTML 조작과 이벤트 제어 |
| Timer API | `setTimeout()`, `setInterval()` | 시간 기반 실행 (비동기) |
| Storage API | `localStorage`, `sessionStorage` | 브라우저에 데이터 저장 |
| Network API | `fetch()` | 서버와 통신 (비동기) |

### Timer API

```js
// 지정 시간 후 1번만 실행
const timerId = setTimeout(() => {
  console.log("3초 지남");
}, 3000);

clearTimeout(timerId);   // 실행 전에 취소

// 지정 간격마다 반복 실행
const intervalId = setInterval(() => {
  console.log("1초마다");
}, 1000);

clearInterval(intervalId);   // 반복 중지
```

주목할 점은 **자바스크립트 엔진 자체에는 타이머 기능이 없다**는 것이다. 자바스크립트가 브라우저에게 요청하면 브라우저가 백그라운드에서 시간을 재고, 정해진 시간이 되면 콜백을 Task Queue에 넣는다. 이 구조 때문에 `setTimeout(fn, 0)`도 즉시 실행되지 않고 현재 동기 코드가 끝난 뒤에 실행된다.

타이머 함수는 고유 ID를 반환하며, 이 ID를 보관해 두었다가 필요 없을 때 반드시 해제해야 한다. SPA에서 document를 unload하지 않고 화면이나 component만 떠났다면 정리하지 않은 `setInterval`이 계속 돌면서 메모리를 낭비할 수 있다.

### Storage API

브라우저에 키-값 쌍으로 데이터를 저장한다. 과거에 쓰던 Cookie는 용량이 작고 매 요청마다 서버로 전송되는 단점이 있었다.

| 구분 | localStorage | sessionStorage |
|---|---|---|
| 유지 기간 | 브라우저 세션을 넘어 유지되지만 사용자·브라우저 정책에 따라 삭제될 수 있음 | top-level tab/window의 page session 동안 유지 |
| 데이터 공유 | 같은 origin이면 여러 탭에서 공유 | 같은 origin이면서 같은 top-level browsing context 안에서 접근 |
| 활용 예 | 다크 모드 설정 | 일회성 입력 폼, 임시 화면 상태 |

```js
localStorage.setItem("username", "홍길동");
localStorage.getItem("username");     // "홍길동"
localStorage.removeItem("username");
localStorage.clear();                 // 전체 삭제
```

**저장되는 값은 항상 문자열이다.** 숫자를 넣어도 문자열 `"25"`로 저장된다. 객체나 배열을 저장하려면 `JSON`을 거쳐야 한다.

```js
localStorage.setItem("user", JSON.stringify({ name: "홍길동", age: 25 }));
const user = JSON.parse(localStorage.getItem("user"));
```

앞서 배운 `JSON.stringify`/`JSON.parse`가 여기서 쓰인다.

### Network API — fetch

`fetch()`는 서버에서 데이터를 요청하는 현대적인 방법이며, **비동기이고 Promise를 반환한다.**

```js
// Promise 방식
fetch("data.json")
  .then(response => response.json())
  .then(data => console.log(data));

// async/await 방식 (권장)
async function loadData() {
  const response = await fetch("data.json");
  const data = await response.json();
  console.log(data);
}
```

`await`가 두 번 나오는 것에 주의한다.

1. 첫 번째 `await fetch(...)`: 서버 **응답 헤더**가 도착할 때까지 기다려 `Response` 객체를 얻는다
2. 두 번째 `await response.json()`: 응답 **본문**을 모두 읽고 JSON으로 파싱할 때까지 기다린다

즉 `fetch`가 끝났다고 데이터가 손에 들어온 것이 아니다. 본문을 읽는 것도 시간이 걸리는 비동기 작업이다.

실전에서는 에러 처리를 함께 쓴다.

```js
async function loadData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("데이터 로드 실패:", error);
  }
}
```

`fetch`는 **네트워크 실패에만 reject**되고, 404나 500 같은 HTTP 에러 응답은 "정상적으로 응답을 받았다"고 간주해 resolve된다. 그래서 `response.ok`(상태 코드가 200~299인지)를 직접 확인해야 한다. 1일차에서 정리한 상태 코드 분류가 여기서 쓰인다.

## 모듈

ES6부터 도입된 모듈은 다른 파일의 함수·객체·변수를 가져오고 내보내는 방식이다. 코드를 독립적인 단위로 분리해 재사용과 관리를 쉽게 한다.

```js
// math.js — 내보내기
export function add(a, b) {
  return a + b;
}
```

```html
<script type="module">
  import { add } from './math.js';
  console.log(add(2, 3));
</script>
```

`type="module"` 속성이 반드시 필요하다.

### Export 방식

| 방식 | 문법 | 특징 |
|---|---|---|
| **Named Export** | `export const foo = ...` → `import { foo } from './m.js'` | 여러 개 내보내기 가능. 이름을 정확히 맞춰야 함 |
| **Default Export** | `export default bar` → `import anyName from './m.js'` | 모듈당 **하나만**. 가져올 때 이름을 자유롭게 지정 |
| **혼합** | `import bar, { foo } from './m.js'` | 주 기능은 default, 보조 기능은 named |

### 모듈 vs 일반 외부 JS

| 구분 | External JS | JavaScript Module |
|---|---|---|
| 로드 | `<script src="file.js">` | `<script type="module" src="file.js">` |
| 스코프 | 전역 스코프 공유 | **모듈 스코프로 격리** |
| 변수 충돌 | 매우 높음 | 없음 |
| 소통 방식 | 전역 변수를 통해 간접적으로 | `import`/`export`로 명시적으로 |
| 실행 시점 | 태그를 만나는 즉시 (HTML 파싱 중단) | HTML을 모두 읽은 후 지연 실행 (defer) |

```js
// external-a.js
const count = 10;
// external-b.js
const count = 20;   // 에러 — 같은 전역 스코프

// module-a.js
const count = 10;   // 이 파일 안에서만 유효
// module-b.js
const count = 20;   // 문제 없음
```

External JS가 코드를 **파일로 나눈 것**뿐이라면, 모듈은 각 파일의 경계를 **격리하고 필요한 것만 명시적으로 주고받는** 체계다. 전역 변수 충돌은 규모가 커질수록 추적하기 어려운 버그를 만들기 때문에, 파일이 여러 개가 되는 순간부터는 모듈을 쓰는 것이 맞다.

> ES 모듈은 `file://` 프로토콜에서는 CORS 정책 때문에 동작하지 않는다. 반드시 Live Server 같은 로컬 서버로 열어야 한다.
{: .prompt-warning }

## 정리

2일차를 관통하는 두 축을 정리하면 다음과 같다.

**CSS — 브라우저가 스타일을 결정하는 규칙**

- 여러 규칙이 충돌하면 명시도(specificity)로 승부가 갈린다. 명시도를 낮게 유지해야 나중에 덮어쓰기 쉽다
- 모든 요소는 박스이며, `box-sizing: border-box`가 계산을 단순하게 만든다
- 1차원 정렬은 Flexbox, 2차원 배치는 Grid. 둘을 함께 쓴다
- 반응형은 viewport 메타 태그 + 미디어 쿼리 + 유연한 레이아웃의 조합이며, Mobile First로 접근한다

**JavaScript — 싱글 스레드가 화면을 멈추지 않는 방법**

- `const` 기본, 필요할 때 `let`, `var`는 쓰지 않는다
- `==` 대신 `===`를 쓴다
- 원시 값은 그대로 복사되고, 객체는 같은 객체를 가리키는 참조값이 복사된다. 이것이 함수 인자 전달과 배열 복사 동작의 근거다
- DOM 조작은 `querySelector` + `classList` 조합이 기본이다
- 이벤트는 `addEventListener`로 등록하고, 버블링을 활용한 이벤트 위임을 익혀둔다
- 비동기는 Callback → Promise → async/await로 발전했고, 실행 순서는 Call Stack과 Microtask Queue, Event Loop가 결정한다

이틀 동안 다룬 것은 프레임워크가 아니라 **프레임워크가 추상화하고 있는 층**이다. React의 상태 갱신도, Vue의 반응성도 결국 DOM 조작과 이벤트, 그리고 비동기 처리 위에 얹혀 있다. 바닥을 알고 있으면 추상화가 새는 순간에 무슨 일이 일어나는지 추적할 수 있다.

> 개인 회고: 이 자리에 실제 실습에서 막혔던 지점이나 인상 깊었던 부분을 추가하면 글의 밀도가 올라간다.
{: .prompt-tip }

---

이전 글: [1일차 — 웹 동작 원리와 HTML](/posts/skala-frontend-day1/)

시리즈 안내: [Full-Stack Engineering: HTML, CSS, JavaScript — 2일 학습 로드맵](/posts/skala-frontend-roadmap/)
