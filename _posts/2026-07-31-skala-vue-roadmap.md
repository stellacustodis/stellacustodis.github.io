---
title: "[SKALA] Frontend framework: Vue.js — 4일 학습 로드맵"
date: 2026-07-31 08:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, vue, vue3, spa, vite, composition-api, learning-log]
description: "SPA와 Composition API에서 시작해 Component, Router, Pinia, Axios, 빌드·배포까지 이어지는 SKALA Vue.js 과정의 4일 학습 로드맵과 종합과제 개요"
permalink: /posts/skala-vue-roadmap/
pin: false
---

SKALA 부트캠프의 **Frontend framework: Vue.js** 과정은 앞선 HTML/CSS/JavaScript 과정에서 다룬 웹 표준 기술 위에, **프레임워크가 무엇을 대신해 주는가**를 얹는 4일 과정이다.

직전 과정에서는 `document.querySelector`로 요소를 찾고 `innerHTML`로 내용을 바꾸며 `addEventListener`로 이벤트를 붙였다. 이 방식은 화면이 커질수록 **"지금 화면에 보이는 것"과 "메모리 안의 데이터"를 사람이 직접 동기화**해야 한다는 문제가 있다. 데이터를 바꾸면 그에 맞춰 DOM을 갱신하는 코드를 빠짐없이 짜야 하고, 하나라도 빠뜨리면 화면과 데이터가 어긋난다.

Vue는 이 관계를 뒤집는다. **데이터를 바꾸면 화면이 따라온다.** 이번 과정의 거의 모든 주제는 이 한 문장을 어디까지 확장할 수 있는지에 대한 이야기다.

이 시리즈에서는 강의 내용을 그대로 옮기기보다 다음 세 가지 질문을 중심으로 정리한다.

1. 오늘 배운 개념은 무엇인가?
2. 이 개념은 왜 필요한가? (프레임워크 없이 하면 무엇이 불편한가)
3. 실제 코드에서는 어떻게 사용되는가?

> 강의자료는 개념을 이해하기 위한 참고 자료로만 활용하고, 글의 설명과 예시 코드는 직접 재구성했다.
{: .prompt-info }

## 전체 흐름

과정은 7월 31일(금)에 시작해 주말을 건너뛰고 8월 3일(월)부터 8월 5일(수)까지, 평일 기준 4일간 진행됐다.

| 일차 | 날짜 | 핵심 주제 | 도달 목표 |
|---|---|---|---|
| 1일차 | 7/31 (금) | SPA·CSR·Vite, SFC, 선언적 렌더링 | 데이터로 **화면을 그린다** |
| 2일차 | 8/3 (월) | 이벤트, 폼 바인딩, Composition API | 사용자 입력을 받아 **상태를 다룬다** |
| 3일차 | 8/4 (화) | Component, Props/Emits/Slot, Vue Router | 화면을 **부품으로 나누고 연결한다** |
| 4일차 | 8/5 (수) | Pinia, Axios, UI 라이브러리 | **전역 상태**와 **서버 데이터**를 다룬다 |
| 〃 | 8/5 (수) | Modern JavaScript, Vite 빌드·배포 | 만든 것을 **실제로 배포한다** |

마지막 날인 8월 5일에 4일차 내용과 빌드·배포 파트를 함께 진행했다. 분량이 적지 않아 **빌드·배포는 별도의 글로 분리**했고, 일차 번호 대신 주제로 표시한다.

각 날짜는 독립된 주제처럼 보이지만 하나의 흐름이다.

```text
데이터를 화면에 그린다 (선언적 렌더링)
  → 사용자 입력으로 데이터를 바꾼다 (이벤트, v-model)
  → 화면을 재사용 가능한 부품으로 나눈다 (Component)
  → 부품 사이에 데이터를 흘려보낸다 (Props/Emits)
  → 여러 화면을 URL로 연결한다 (Router)
  → 화면을 넘나드는 데이터를 한곳에 모은다 (Pinia)
  → 데이터를 서버에서 가져온다 (Axios)
  → 완성된 결과물을 정적 파일로 만들어 배포한다 (Vite build)
```

이 순서는 임의로 정한 것이 아니라, **혼자서는 해결이 안 되는 문제가 생길 때마다 다음 도구가 등장하는 구조**다. 컴포넌트를 나누면 데이터 전달 문제가 생기고, 화면이 늘어나면 라우팅이 필요해지고, 컴포넌트 계층이 깊어지면 Props로 데이터를 내려보내는 일이 번거로워져 Pinia가 등장한다. 각 도구를 배울 때 "이 도구가 없으면 어떤 불편이 생기는가"를 함께 보면 이해가 빨라진다.

## 왜 Vue인가

프론트엔드 프레임워크는 크게 셋으로 나뉜다.

| 항목 | Vue.js | React | Angular |
|---|---|---|---|
| 출시 | 2014 | 2013 | 2010 |
| 개발 주체 | Evan You (커뮤니티 주도) | Meta | Google |
| 기술 분류 | 점진적 프레임워크 | UI 라이브러리 | 풀스택 프레임워크 |
| 개발 언어 | JavaScript, TypeScript | JavaScript, TypeScript | TypeScript 필수 |
| 학습 곡선 | 낮음 | 중간 | 높음 |
| DOM 방식 | Virtual DOM | Virtual DOM | 실제 DOM |
| 데이터 바인딩 | 양방향 (`v-model`) | 단방향 | 양방향 |

Vue가 교육 과정에 적합한 이유는 **학습 곡선이 낮으면서도 현대 프레임워크의 핵심 개념을 모두 담고 있기** 때문이다. 컴포넌트, 반응성, 가상 DOM, 라우팅, 전역 상태 관리는 React나 Angular에도 이름만 다를 뿐 그대로 존재한다. 한쪽을 제대로 이해하면 나머지로 옮겨가는 비용이 크지 않다.

Vue의 역사도 이 성격을 보여준다.

| 연도 | 이정표 |
|---|---|
| 2014 | Evan You가 개발. AngularJS의 무거움에 대한 반작용 |
| 2015 | Vue 1.0 — 데이터 바인딩과 기본 디렉티브 |
| 2016 | Vue 2.0 — Virtual DOM 도입 |
| 2020 | **Vue 3.0** — Composition API, TypeScript 지원 |
| 2023 | Vue 3 표준화, 빌드 도구 Vite 연계 |

이 과정에서 다루는 것은 전부 **Vue 3 + Composition API + Vite** 조합이다. Vue 2 방식(Options API)은 비교를 위해서만 등장한다.

## 실습 환경

```text
Node.js  →  Vite  →  개발 서버(localhost:5173) + 빌드
             ↑
        .vue 파일을 브라우저가 읽을 수 있는 JS/CSS/HTML로 변환
```

- **Node.js**: 빌드 도구(Vite)의 실행 엔진이자 패키지 관리(npm)의 기반. 브라우저는 `.vue` 파일을 직접 읽지 못하므로 변환 과정이 필요하고, 그 변환을 Node.js 위에서 도는 Vite가 담당한다
- **Vite**: 개발 서버(HMR 포함)와 프로덕션 빌드를 모두 담당하는 빌드 도구
- **VS Code 확장**: Vue (Official), ESLint, Prettier
- **Chrome 확장**: Vue Devtools — 컴포넌트 트리, Props, Pinia 상태를 실시간으로 확인

프로젝트는 다음 한 줄로 생성한다.

```sh
npm create vue@latest
```

과정에서 선택한 옵션은 TypeScript 없이 **Vue Router, Pinia, ESLint, Prettier**를 포함하는 구성이다.

> Vue Devtools는 선택이 아니라 사실상 필수다. 반응형 데이터가 언제 어떻게 바뀌는지를 눈으로 확인할 수 있어서, `console.log`를 찍는 것보다 훨씬 빠르게 원인을 좁힐 수 있다.
{: .prompt-tip }

## 종합과제

과정의 최종 산출물은 강의에서 배운 10개 장의 내용을 하나의 SPA로 통합하는 과제다. 나는 이를 **실시간 날씨 대시보드**로 구현했다. OpenWeather와 기상청 API허브의 데이터를 사용해 지역별 현재 날씨, 기간별 관측·예보 그래프, 위성영상, 폭염특보, 지진 정보를 보여주는 화면이다.

- 저장소: [github.com/stellacustodis/skala-vue](https://github.com/stellacustodis/skala-vue)

강의 진도와 별개로 구현하면서 부딪힌 문제들(API 키를 번들에 노출하지 않는 방법, EUC-KR 응답 디코딩, 자동완성 요청 취소 등)은 마지막 **프로젝트 회고** 글에서 따로 정리한다. 일차별 글은 강의 개념 정리에 집중한다.

## 글을 정리하는 기준

각 일차의 글은 다음 순서를 기본으로 한다.

- 그날의 핵심 질문
- 개념과 그 개념이 필요한 이유
- 최소 예제 코드
- 자주 헷갈리는 지점
- 정리

첫 번째 글에서는 SPA와 CSR이 무엇인지에서 출발해 `.vue` 파일의 구조, 반응성(`ref`), 그리고 디렉티브를 이용한 선언적 렌더링까지 연결한다.

다음 글: [1일차 — SPA와 선언적 렌더링](/posts/skala-vue-day1/)

이어 읽기: [2일차 — 이벤트, 폼 바인딩, Composition API](/posts/skala-vue-day2/), [3일차 — Component와 Vue Router](/posts/skala-vue-day3/), [4일차 — Pinia, Axios, Element Plus](/posts/skala-vue-day4/), [빌드와 배포 — Modern JavaScript, ESLint, Vite](/posts/skala-vue-day5/), [프로젝트 회고 — 날씨 대시보드](/posts/skala-vue-project/)

선행 시리즈: [Full-Stack Engineering: HTML, CSS, JavaScript — 2일 학습 로드맵](/posts/skala-frontend-roadmap/)
