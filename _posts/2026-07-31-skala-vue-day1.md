---
title: "[SKALA] Vue.js 1일차 — SPA와 선언적 렌더링"
date: 2026-07-31 09:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, vue, vue3, spa, vite, sfc, directive, reactivity]
description: "SPA·CSR과 Virtual DOM에서 출발해 Vite 프로젝트 구조, SFC, ref 반응성, 그리고 v-bind·v-if·v-for 등 디렉티브를 이용한 선언적 렌더링까지 정리한다."
permalink: /posts/skala-vue-day1/
---

1일차의 핵심 질문은 하나다. **"DOM을 직접 건드리지 않고 어떻게 화면을 바꾸는가?"**

직전 과정에서는 `document.getElementById("demo").innerHTML = ...`처럼 바꾸고 싶은 요소를 찾아 직접 수정했다. Vue에서는 이 코드를 쓰지 않는다. 대신 **데이터를 바꾸면 화면이 알아서 따라온다.** 오늘은 그 구조가 어떻게 가능한지, 그리고 그 위에서 화면을 선언하는 문법을 정리한다.

## MPA와 SPA

먼저 Vue가 만드는 결과물이 어떤 형태인지부터 봐야 한다.

**MPA(Multi Page Application)**는 전통적인 방식이다. 사용자가 메뉴를 클릭할 때마다 서버에 새 HTML 파일을 요청하고, 브라우저는 페이지 전체를 새로 그린다.

**SPA(Single Page Application)**는 보통 하나의 application shell HTML을 받아온 뒤 이후의 화면 전환을 JavaScript가 처리한다.

| 구분 | MPA | SPA |
|---|---|---|
| 페이지 구성 | 이동할 때 새 문서를 요청 | 초기에 application shell HTML + JS 로딩 |
| 페이지 전환 | 서버 요청 → 전체 새로고침 | 클라이언트에서 필요한 부분만 변경 |
| 렌더링 방식 | SSR·정적 HTML·CSR 모두 가능 | CSR뿐 아니라 SSR 후 hydration도 가능 |
| 속도 | 문서 이동마다 로딩 발생 | 첫 로딩과 전환 속도는 bundle·cache·SSR 구성에 따라 달라짐 |
| 새로고침(F5) | 자연스럽게 동작 | 앱이 다시 로딩되어 상태가 초기화될 수 있음 |
| SEO | 문서별 HTML을 제공하기 쉬움 | CSR만 쓰면 보완이 필요할 수 있으며 SSR·SSG 사용 가능 |
| 기술 스택 | JSP, PHP, Spring MVC | Vue, React, Angular + REST API |

### CSR과 SSR

렌더링 방식의 구분은 결국 **"HTML을 어디서 완성하는가"**다.

- **CSR (Client-Side Rendering)**: 브라우저가 JavaScript를 실행해 화면을 직접 그린다. **Vue의 기본 동작 방식**
- **SSR (Server-Side Rendering)**: 서버에서 데이터까지 주입한 완성된 HTML을 내려준다. Vue 생태계에서는 주로 Nuxt.js로 구현

| 비교 항목 | CSR (기본 Vue / SPA) | SSR (Vue + Nuxt.js) |
|---|---|---|
| HTML 완성 주체 | 브라우저 | 웹 서버 |
| 초기 전송 데이터 | application shell 또는 미리 렌더링된 HTML + JS | 데이터가 결합된 HTML + hydration용 JS |
| 초기 화면 표시 | JS와 bundle 크기에 영향을 받음 | 서버 응답과 hydration 비용에 영향을 받음 |
| 페이지 이동 | client router 구성에 따라 빠르게 전환 가능 | hydration 뒤에는 client router로 빠르게 전환 가능 |
| SEO | 순수 CSR이면 crawler 처리에 의존 | 내용이 담긴 HTML을 바로 제공 가능 |

순수 CSR SPA의 SEO 취약점은 구조에서 나온다. 서버가 `<div id="app"></div>` 같은 application shell만 내려주면 내용은 JS가 실행된 뒤에야 채워진다. SPA도 SSR·SSG·prerendering을 사용하면 내용이 담긴 HTML을 먼저 제공할 수 있다.

### SPA를 구성하는 도구들

SPA는 Vue 하나로 완성되지 않는다. 이번 과정에서 배울 네 가지 도구가 각각의 빈자리를 채운다.

| 도구 | 역할 |
|---|---|
| **Vite** | `.vue`·`.js`·`.css` 파일을 브라우저가 읽을 수 있는 정적 파일로 묶고, 개발 서버를 띄우는 빌드 도구 |
| **Vue Router** | 브라우저 URL과 Vue 컴포넌트를 연결하는 공식 라우팅 라이브러리 |
| **Pinia** | 모든 컴포넌트가 접근할 수 있는 중앙 집중식 상태 저장소 |
| **Axios** | 백엔드 API 서버와 JSON 데이터를 주고받는 통신 창구 |

이 넷이 각각 3일차 이후의 주제가 된다.

## Vue는 무엇을 대신해 주는가

### Virtual DOM

브라우저의 **실제 DOM 조작은 비싸다.** DOM이 수정되면 브라우저는 레이아웃을 다시 계산하고(Reflow) 화면을 다시 칠한다(Repaint).

이 비용은 변경 종류와 layout·paint 발생 여부에 따라 달라진다. 직접 DOM을 조작하는 방식에서 불필요한 변경을 반복하면 노드가 많은 화면일수록 눈에 띄게 느려질 수 있다.

Vue는 **Virtual DOM**을 사이에 둔다. 메모리상에 존재하는 가벼운 가짜 DOM이다.

```text
데이터 변경 → Virtual DOM에서 변경점 계산 → 필요한 실제 DOM을 patch
```

여기서 얻는 것은 두 가지다.

1. **최소 조작 지점 자동 추적**: 개발자가 "무엇이 바뀌었으니 어디를 고쳐라"를 지정하지 않아도 된다. 상태만 선언하면 Vue가 차이를 계산한다
2. **배치(Batch) 처리**: 같은 tick에서 일어난 여러 상태 변경을 모아 다음 update cycle에 반영한다

### 양방향 데이터 바인딩

**Model이 바뀌면 View가 바뀌고, View(사용자 입력)가 바뀌면 Model도 바뀐다.** Vue에서는 주로 `v-model` 디렉티브로 구현하며, 2일차에서 자세히 다룬다.

### 컴포넌트 기반 아키텍처

웹페이지를 통째로 만들지 않고 **독립적인 UI 부품**을 만들어 조립한다.

- **캡슐화**: HTML(구조), JavaScript(로직), CSS(스타일)를 하나의 `.vue` 파일에 응집
- **재사용성**: 잘 만든 컴포넌트는 여러 곳에서 다시 쓴다
- **트리 구조**: 부모가 자식에게 데이터를 내려주고(Props Down), 자식이 부모에게 변경을 알린다(Event Up)

### MVVM 패턴

Vue의 동작은 MVVM(Model-View-ViewModel) 관점으로 설명할 수 있다.

| 구성 | Vue에서의 실체 |
|---|---|
| **Model** | 순수 비즈니스 데이터. `<script>` 안의 `ref`·`reactive` 원본 데이터나 REST API 응답 |
| **View** | 사용자에게 보이는 화면. `<template>`과 `<style>` 영역 |
| **ViewModel** | 둘 사이의 중재자. Vue 엔진과 `<script>`가 담당하며, DOM 이벤트 감지와 데이터 바인딩을 수행 |

핵심은 **UI와 데이터 처리 로직의 역할을 구분한다**는 것이다. Vue가 엄격한 MVVM 구조를 강제하는 것은 아니며, SFC는 서로 관련된 template·logic·style을 한 파일에 모은다.

## 개발 환경

### Node.js가 필요한 이유

Vue를 브라우저에서 실행하는데 왜 Node.js를 설치할까? 세 가지 역할 때문이다.

1. **빌드 도구의 실행 엔진**: 브라우저는 `.vue` 파일을 직접 읽지 못한다. 표준 JS/CSS/HTML로 변환해야 하고, 그 변환을 담당하는 Vite가 Node.js 위에서 돈다
2. **패키지 관리(npm)**: Vue Router, Pinia, Axios 같은 라이브러리를 내려받고 버전을 관리한다
3. **로컬 개발 서버 구동**: 코드를 수정하면 즉시 반영되는 **HMR(Hot Module Replacement)** 서버를 띄운다

Node.js 버전 관리 도구로는 `nvm`과 `fnm`이 있는데, 과정에서는 더 빠른 **fnm(Fast Node Manager)**을 사용했다.

```sh
# WSL/Linux
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install --lts

# macOS
brew install node
```

### 프론트엔드 도구의 분류

강의에서 정리한 도구 유형은 용어를 정확히 쓰는 데 도움이 된다.

| 용어 | 역할 | 예시 |
|---|---|---|
| Packager | 패키지 다운로드·설치 (의존성 관리) | npm, yarn, pnpm |
| Compiler | 코드를 다른 형식으로 변환 | Babel, TypeScript |
| Transpiler | 같은 수준의 언어에서 문법 변환 | Babel (ES6 → ES5) |
| Task Runner | 반복 작업 자동화 | Gulp, Grunt |
| Bundler | 여러 모듈을 하나의 파일/청크로 묶음 | Vite, Webpack, Rollup |
| Build Tool | 컴파일·번들링·최적화를 포함한 전체 과정 | Vite, Webpack, Parcel |

**Vite**는 이 중 Bundler와 Build Tool 역할을 하며, 구체적으로는 세 가지를 한다.

- **Compile**: `.vue` template을 JavaScript render function으로 변환하고 style을 추출하거나 주입
- **개발 서버**: HMR로 코드 변경을 실시간 반영
- **Bundling**: 수백 개의 파일을 배포용으로 압축해 묶음

> Vue CLI는 maintenance mode이며 새 프로젝트에는 `create-vue`와 Vite가 권장된다. 기존 Vue CLI + Webpack 프로젝트는 여전히 유지보수될 수 있다.
{: .prompt-info }

### 프로젝트 생성

```sh
npm create vue@latest
```

과정에서 선택한 옵션이다.

```text
✔ Project name: skala-vue
✔ Add TypeScript? No
✔ Add JSX Support? No
✔ Add Vue Router for Single Page Application development? Yes
✔ Add Pinia for state management? Yes
✔ Add Vitest for Unit Testing? No
✔ Add an End-to-End (E2E) Testing Solution? No
✔ Add ESLint for code quality? Yes
✔ Add Prettier for code formatting? Yes
```

이렇게 기본 디렉터리 구조와 설정을 자동 생성하는 작업을 **스캐폴딩(Scaffolding)**이라 한다.

```sh
cd skala-vue
npm install    # package.json을 읽어 node_modules 생성
npm run dev    # localhost:5173에 개발 서버 구동
```

주요 npm 명령어를 정리하면 다음과 같다.

| 명령어 | 동작 |
|---|---|
| `npm create vue@latest` | Vue 3 프로젝트 뼈대 생성 |
| `npm install` | `package.json`의 의존성을 내려받아 `node_modules` 생성 |
| `npm install 패키지명` | 특정 라이브러리 추가 및 `dependencies` 등록 |
| `npm uninstall 패키지명` | 라이브러리 삭제 |
| `npm run dev` | 개발 서버 구동 (localhost:5173) |
| `npm run build` | Tree-shaking과 압축을 거쳐 `dist/` 정적 파일 생성 |

## 프로젝트 구조

| 디렉터리/파일 | 역할 |
|---|---|
| `index.html` | 진입점. 브라우저가 최초로 읽는 **단 하나의 진짜 HTML** |
| `package.json` | 프로젝트 메타정보, 실행 스크립트, 의존성 목록 |
| `vite.config.js` | Vite 빌드 설정 |
| `public/` | 컴파일하지 않고 그대로 제공되는 정적 파일 |
| `src/main.js` | 애플리케이션 진입점. `index.html`이 호출 |
| `src/App.vue` | 루트 컴포넌트. `main.js`가 호출 |
| `src/assets/` | Vite가 컴파일·최적화하는 CSS·이미지·폰트 |
| `src/components/` | 재사용 가능한 작은 부품 |
| `src/views/` | 컴포넌트를 조립한 **페이지 단위 화면** |
| `src/router/` | 페이지 이동 경로 정의 |
| `src/stores/` | Pinia 전역 상태 저장소 |

`components/`와 `views/`의 구분이 처음에는 모호하게 느껴지는데, 기준은 **"URL을 가지는가"**다. 라우터가 직접 연결하는 화면은 `views/`, 그 화면 안에 조립되는 부품은 `components/`다.

### 실행 흐름

```text
index.html
  └─ <div id="app"></div>          ← 여기에 Vue가 화면을 그린다
  └─ <script type="module" src="/src/main.js">
       └─ main.js
            ├─ createApp(App)      ← 앱 인스턴스 생성 (아직 화면에 없음)
            ├─ app.use(pinia)      ← 플러그인 등록
            ├─ app.use(router)
            └─ app.mount('#app')   ← 물리적으로 삽입, 렌더링 시작
                 └─ App.vue        ← 루트 컴포넌트
                      └─ 하위 컴포넌트 트리
```

```js
// src/main.js
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
```

`createApp(App)`이 반환하는 `app` 객체는 플러그인 설치와 전역 자원 등록을 위한 API(`use`, `component`, `directive`)를 가진다. `mount()`를 호출하기 전까지는 화면에 아무것도 그려지지 않는다.

## SFC (Single File Component)

Vue 컴포넌트는 `.vue` 확장자를 가진 하나의 파일로 구성되며, 3단 구조를 가진다.

```vue
<script setup>
// 데이터, 함수 등 기능 로직
</script>

<template>
  <!-- 사용자에게 보여질 HTML 구조 -->
</template>

<style scoped>
/* CSS 스타일 (보통 scoped로 범위 제한) */
</style>
```

Vue 3 생태계에서는 `<script setup>`을 맨 위에 쓰고 그 아래 `<template>`을 두는 순서가 표준이다.

컴포넌트 파일명은 **두 단어 이상의 PascalCase**를 권장한다. `WeatherCard.vue`, `SearchBar.vue`처럼. 한 단어(`Card.vue`)를 피하는 이유는 HTML 표준 태그와 이름이 충돌할 여지를 없애기 위해서다.

### Options API vs Composition API

`<script>` 영역을 작성하는 방식이 Vue 2와 Vue 3에서 다르다.

| 비교 항목 | Options API (Vue 2) | Composition API (Vue 3 표준) |
|---|---|---|
| 선언 구조 | `<script>` | `<script setup>` |
| 작성 철학 | 역할별 격리 (`data`, `methods`, `computed` 상자에 나눠 배치) | **논리적 기능별 그룹화** |
| 가독성 (규모 확대 시) | 기능 하나를 수정하려면 파일 상단과 하단을 오르내려야 함 | 하나의 기능에 필요한 데이터와 로직이 한곳에 모임 |
| 반응성 변수 선언 | `data()` 반환 객체 내부 | `ref()` / `reactive()` |
| 재사용 | Mixin (데이터 출처 불분명, 이름 충돌) | **Composable** (순수 함수로 격리) |
| TypeScript | 타입 추론이 복잡 | 완벽 호환 및 자동 추론 |
| 공식 권장 | 레거시 유지보수 외 권장 안 함 | **현재 표준** |

같은 카운터를 두 방식으로 쓰면 차이가 분명해진다.

```vue
<!-- Options API -->
<script>
export default {
  data() {
    return { count: 0 }
  },
  methods: {
    increment() { this.count++ },
  },
}
</script>
```

```vue
<!-- Composition API -->
<script setup>
import { ref } from 'vue'

const count = ref(0)
const increment = () => { count.value++ }
</script>
```

Composition API 쪽이 **평범한 JavaScript에 가깝다.** `this`가 사라지고, 정해진 상자에 코드를 나눠 넣을 필요가 없다. 기능이 늘어날수록 이 차이가 커진다. 하나의 기능에 관련된 상태와 함수가 붙어 있으면, 그 기능을 통째로 다른 파일(Composable)로 옮기는 것도 쉬워진다.

## 반응성 (Reactivity)

Vue의 출발점이자 가장 중요한 개념이다.

{% raw %}
```vue
<script setup>
import { ref } from 'vue'

let normalCount = 0        // 일반 변수
const vueCount = ref(0)    // 반응성 변수
</script>

<template>
  <h3>일반 변수: {{ normalCount }}</h3>
  <button @click="normalCount++">일반 변수 증가</button>

  <h3>반응성 변수: {{ vueCount }}</h3>
  <button @click="vueCount++">Vue 변수 증가</button>
</template>
```
{% endraw %}

버튼을 눌러보면 차이가 드러난다.

- 일반 변수는 **값은 실제로 증가하지만 화면이 바뀌지 않는다**
- `ref`로 감싼 변수는 누르는 즉시 화면이 갱신된다
- 반응성 변수를 눌러 화면이 다시 그려지는 순간, 그동안 누적된 일반 변수의 값도 함께 반영된다

세 번째 현상이 중요하다. 일반 변수의 값이 안 바뀐 게 아니라 **화면을 다시 그릴 이유가 없었을 뿐**이다. Vue는 `ref`, `reactive`, computed, props 같은 반응형 의존성을 추적하지만 이 예제의 일반 변수는 추적하지 않는다. 이것이 "데이터를 바꾸면 화면이 따라온다"의 실제 동작이다.

> `<script>` 안에서는 `count.value`로 접근하지만, `<template>` 안에서는 `.value` 없이 {% raw %}`{{ count }}`{% endraw %}로 쓴다. Vue가 템플릿에서 자동으로 언래핑하기 때문이다. 처음에는 이 비대칭이 헷갈린다.
{: .prompt-warning }

## 텍스트 보간

{% raw %}`{{ }}`{% endraw %} 안에는 변수뿐 아니라 **JavaScript 표현식**을 쓸 수 있다.

{% raw %}
```vue
<script setup>
const welcomeMessage = 'Welcome to Skala-Vue'
</script>

<template>
  <h2>{{ welcomeMessage }}</h2>
  <p>{{ welcomeMessage.toUpperCase() }}</p>
  <p>{{ 'Random number: ' + Math.ceil(Math.random() * 100) }}</p>
</template>
```
{% endraw %}

여기서 "표현식"이라는 점이 중요하다. 값으로 평가되는 식만 가능하고 `if`나 `for` 같은 문(statement)은 쓸 수 없다. 조건과 반복은 곧 다룰 디렉티브가 담당한다.

## Vue Directive

디렉티브는 `v-` 접두사가 붙은 특수 HTML 속성이다. 따옴표 안은 단순 문자열이 아니라 **JavaScript 표현식이 동작하는 공간**이다.

| 디렉티브 | 설명 | 비고 |
|---|---|---|
| `v-html` | HTML 콘텐츠를 표현식 값으로 업데이트 | **XSS 유의** |
| `v-text` | 텍스트 콘텐츠를 업데이트 | 보간법과 유사 |
| `v-bind` | 속성에 표현식을 동적 바인딩 | 축약형 `:` |
| `v-model` | 폼 입력과 데이터 간 양방향 바인딩 | 2일차 |
| `v-if` | 참/거짓에 따라 조건부 **렌더링** | `v-else-if`, `v-else` |
| `v-show` | 참/거짓에 따라 보이거나 숨김 | `v-if`와 구분 |
| `v-for` | 반복 렌더링 | `:key` 필수 |
| `v-on` | 이벤트 리스너 연결 | 축약형 `@`, 2일차 |
| `v-cloak` | 렌더링 전까지 요소 숨김 | 드물게 사용 |
| `v-once` | 한 번만 렌더링 | 드물게 사용 |
| `v-pre` | 템플릿 구문을 무시하고 원본 출력 | 드물게 사용 |

### v-html과 XSS

`v-html`은 문자열을 실제 HTML로 해석해 주입한다. 내부적으로는 `element.innerHTML`과 동일하게 동작한다.

{% raw %}
```vue
<script setup>
const rawHtmlData = '이 글자는 <span style="color:red;">빨간 글자</span>이다.'
</script>

<template>
  <p>{{ rawHtmlData }}</p>          <!-- 태그가 문자로 그대로 보임 -->
  <p v-html="rawHtmlData"></p>      <!-- 태그가 해석되어 빨갛게 표시 -->
</template>
```
{% endraw %}

문제는 `innerHTML`과 동일하게 동작한다는 점이 **취약점까지 동일하다**는 뜻이라는 것이다.

```vue
<input v-model="inputValue" />
<button @click="message = inputValue">확인</button>
<div v-html="message"></div>
```

여기에 사용자가 다음을 입력하면 그대로 실행된다.

```html
<img src="x" onerror="window.location.href='https://google.com'" />
```

`<img>` 로딩이 실패하면서 `onerror` 핸들러가 동작해 다른 사이트로 이동한다. 실제 공격에서는 이 자리에 쿠키나 세션 토큰을 탈취하는 코드가 들어간다.

> **사용자 입력을 `v-html`에 넣지 않는다.** 직전 과정에서 `innerHTML` 대신 `textContent`를 쓰라고 한 것과 정확히 같은 이야기다. Vue를 쓴다고 XSS가 사라지지 않는다.
{: .prompt-danger }

`v-text`는 `element.textContent`를 설정하며, 보간법 {% raw %}`{{ }}`{% endraw %}과 결과가 같아서 실무에서는 보간법을 쓴다.

### v-bind

HTML 속성에 JavaScript 값을 동적으로 연결한다. 실무에서는 축약형 `:`를 사실상 100% 사용한다.

```vue
<script setup>
import { ref } from 'vue'

const dynamicUrl = 'https://www.naver.com'
const isButtonDisabled = ref(true)
</script>

<template>
  <a :href="dynamicUrl">네이버로 이동</a>
  <button :disabled="isButtonDisabled">동의해야 클릭 가능</button>
  <button @click="isButtonDisabled = !isButtonDisabled">잠금 토글</button>
</template>
```

**클래스 바인딩**은 객체 형식과 배열 형식을 지원한다.

{% raw %}
```vue
<!-- 객체 형식: 조건이 true일 때만 클래스 활성화 -->
<p :class="{ 'text-danger': isWarning }">경고 상태: {{ isWarning }}</p>

<!-- 배열 형식: 여러 클래스를 조합, 삼항 연산자 사용 가능 -->
<div :class="[themeClass, isWarning ? 'border-red' : 'border-gray']">박스</div>

<!-- 정적 클래스와 동적 클래스 동시 적용 -->
<div class="card" :class="{ active: isActive }">카드</div>
```
{% endraw %}

**스타일 바인딩**도 같은 방식이며, CSS 속성명은 camelCase로 쓴다.

```vue
<p :style="{ color: textColor, fontSize: fontSize + 'px' }">텍스트</p>
<div :style="[baseBoxStyle, { width: boxWidth + 'px' }]">박스</div>
```

둘 중 어느 것을 쓸지는 명확한 기준이 있다.

| | 클래스 바인딩 `:class` | 스타일 바인딩 `:style` |
|---|---|---|
| 실체 | `class` 속성에 문자열 주입 | 인라인 `style` 속성에 주입 |
| 용도 | **이미 정의된 디자인을 갈아 끼울 때** (활성화, 다크모드, 경고) | 수치를 실시간 가공할 때 (슬라이더, 프로그레스바) |
| 속성명 | CSS 클래스명 그대로 | camelCase 권장 |
| 권장도 | **적극 권장** | 특수 상황에서만 제한적으로 |

스타일 바인딩을 남용하면 스타일 정의가 JavaScript 안으로 흩어져 유지보수가 어려워진다. 기본은 클래스 바인딩이고, 스타일 바인딩은 **CSS로 미리 정의할 수 없는 연속적인 수치**를 다룰 때만 쓴다.

Vue 3.4부터는 변수명과 속성명이 같을 때 **동일 이름 축약형**을 쓸 수 있다.

```vue
<script setup>
const id = 'user-profile-card'
const src = 'https://vuejs.org/images/logo.png'
</script>

<template>
  <div :id>
    <img :src alt="Vue 로고" />
  </div>
</template>
```

`:src="src"`에서 `="src"`를 생략한 형태다.

### v-if와 v-show

둘 다 조건에 따라 요소를 감추지만 **동작 원리가 완전히 다르다.**

```vue
<p v-if="isLogged">환영합니다!</p>
<p v-else>로그인이 필요합니다.</p>

<div v-if="score >= 90">A 학점</div>
<div v-else-if="score >= 80">B 학점</div>
<div v-else-if="score >= 70">C 학점</div>
<div v-else>F 학점</div>
```

```vue
<div v-show="isVisible">조건이 false면 display:none이 붙는다</div>
```

| 비교 항목 | `v-if` (조건부 렌더링) | `v-show` (조건부 가시성) |
|---|---|---|
| 렌더링 방식 | **실제 DOM 생성·파괴** | **CSS `display` 조작** |
| 요소의 존재 | 조건이 false면 태그 자체가 없음 | 태그는 항상 존재, 눈에만 안 보임 |
| 초기 렌더링 비용 | 낮음 (false면 아예 안 그림) | 높음 (일단 다 그려 놓음) |
| 토글 비용 | 높음 (매번 부수고 다시 지음) | 낮음 (CSS 한 줄) |
| `v-else` 조합 | 가능 | **불가능** |
| `<template>` 사용 | 가능 (여러 태그 묶어 제어) | **불가능** |
| 권장 상황 | 전환이 **드문** 경우 (권한별 메뉴) | 전환이 **빈번한** 경우 (모달, 탭, 아코디언) |

선택 기준은 단순하다. **자주 껐다 켰다 하면 `v-show`, 거의 안 바뀌면 `v-if`.**

### v-for

배열이나 객체를 반복 렌더링한다.

{% raw %}
```vue
<script setup>
import { ref } from 'vue'

const items = ref([
  { id: 'prod_101', name: '아이폰' },
  { id: 'prod_102', name: '갤럭시' },
])
const user = ref({ name: '홍길동', age: 25, role: '개발자' })
</script>

<template>
  <!-- 배열 -->
  <li v-for="(item, index) in items" :key="item.id">
    [{{ index }}] {{ item.name }}
  </li>

  <!-- 객체: (값, 키, 인덱스) 순서 -->
  <li v-for="(value, key, index) in user" :key="key">
    [{{ index }}] {{ key }} : {{ value }}
  </li>
</template>
```
{% endraw %}

객체를 순회할 때 인자 순서가 `(value, key, index)`라는 점을 주의해야 한다. JavaScript의 `for...in`이 키를 주는 것과 반대로, **값이 먼저 온다.**

#### :key에 무엇을 넣을 것인가

`v-for`에는 가능하면 `:key`를 바인딩하는 것이 권장된다. Vue가 각 요소를 고유하게 식별해 Virtual DOM 비교 시 어떤 항목이 추가·삭제·이동됐는지 판단하는 근거이기 때문이다. 상태를 가진 자식 컴포넌트나 DOM을 재정렬하는 목록에서는 안정적인 key가 특히 중요하다.

여기서 흔한 함정이 **배열 인덱스를 key로 쓰는 것**이다.

{% raw %}
```vue
<!-- 권장하지 않음 -->
<li v-for="(fruit, index) in fruits" :key="index">{{ fruit }}</li>

<!-- 권장 -->
<li v-for="item in items" :key="item.id">{{ item.name }}</li>
```
{% endraw %}

인덱스를 key로 쓰면 목록 중간에 항목을 삽입하거나 삭제할 때 뒤쪽 항목들의 key가 전부 밀린다. 항목의 identity와 위치가 분리되지 않아 입력 중이던 폼 값이나 자식 컴포넌트 상태가 엉뚱한 행과 연결되는 버그가 생길 수 있다.

**목록이 정렬되거나 필터링되거나 중간이 삭제될 수 있다면 반드시 고유 ID를 써야 한다.** 과제 요구사항에도 `:key`에 `id`를 바인딩하라고 명시되어 있다.

### 렌더링 최적화 디렉티브

자주 쓰지는 않지만 동작 원리를 이해하는 데 도움이 되는 것들이다.

{% raw %}
```vue
<p v-pre>{{ message }}</p>     <!-- 컴파일하지 않고 그대로 출력 -->
<p v-once>{{ count }}</p>       <!-- 최초 1회만 렌더링, 이후 갱신 안 함 -->
<div v-memo="[name]">…</div>    <!-- name이 바뀔 때만 내부 갱신 -->
```
{% endraw %}

- **`v-pre`**: Vue 컴파일러가 해석하지 않고 {% raw %}`{{ message }}`{% endraw %} 문자열을 그대로 표시한다
- **`v-once`**: 약관이나 소개글처럼 절대 바뀌지 않는 데이터에 붙이면, Vue가 더 이상 감시하지 않아 메모리 부담이 준다
- **`v-memo`**: 지정한 변수가 바뀔 때만 내부를 갱신하고, 아니면 이전 렌더 결과를 재사용한다

`v-cloak`은 build step 없는 in-DOM template에서 Vue가 mount되기 전에 {% raw %}`{{ message }}`{% endraw %} 같은 원본 문자열이 잠깐 노출되는 현상을 막는다. **CSS 속성 선택자와 함께 써야만** 동작한다. SFC는 template을 미리 compile하므로 일반적으로 필요하지 않다.

{% raw %}
```html
<div id="app" v-cloak>{{ message }}</div>

<style>
[v-cloak] { display: none !important; }
</style>
```
{% endraw %}

## Scoped Style

`<style>`에 작성한 스타일은 **모든 컴포넌트에 전역으로 적용된다.** `scoped`를 붙이면 해당 컴포넌트 내부의 태그에만 적용된다.

```vue
<style scoped>
.card { background-color: lightblue; padding: 20px; }
</style>
```

컴포넌트 기반 개발에서 `scoped`가 중요한 이유는 **캡슐화** 때문이다. `.card`라는 흔한 클래스명을 여러 컴포넌트에서 각자 다르게 정의해도 서로 충돌하지 않는다. 전역 CSS에서 클래스명 충돌을 피하려고 `BEM` 같은 명명 규칙을 강제하던 문제를 프레임워크가 대신 해결해 준다.

프로젝트 전체에 적용할 공통 스타일은 `main.js`에서 import하고, 특정 컴포넌트에만 외부 CSS를 적용할 때는 `<style>` 안에서 `@import`를 쓴다.

## 정리

1일차를 한 줄로 요약하면 **"화면을 조작하는 대신 화면을 선언한다"**다.

- SPA는 보통 하나의 application shell 위에서 JavaScript가 화면을 전환하며, Vue SPA의 기본은 CSR이다
- Virtual DOM은 데이터 변경을 모아 필요한 실제 DOM patch로 변환한다
- Vue는 반응형 의존성을 추적한다. 일반 변수는 값이 바뀌어도 그 자체로 화면 갱신을 예약하지 않는다
- `<script setup>` 기반 Composition API가 Vue 3 표준이며, 기능 단위로 코드가 모인다
- 디렉티브는 조건(`v-if`/`v-show`), 반복(`v-for`), 속성(`v-bind`)을 템플릿에서 선언적으로 처리한다
- `v-if`와 `v-show`, 그리고 `:key`에 인덱스를 쓸지 ID를 쓸지는 성능과 버그에 직결되는 선택이다
- `v-html`은 `innerHTML`과 같아서 XSS에 그대로 노출된다

아직 화면은 데이터를 **보여주기만** 한다. 사용자 입력을 받아 데이터를 바꾸는 방향은 다루지 않았다. 2일차에서 이벤트 처리와 `v-model`, 그리고 상태를 다루는 Composition API 함수들(`computed`, `watch`)을 정리한다.

---

시리즈 안내: [Frontend framework: Vue.js — 4일 학습 로드맵](/posts/skala-vue-roadmap/)

다음 글: [2일차 — 이벤트, 폼 바인딩, Composition API](/posts/skala-vue-day2/)
