---
title: "[SKALA] Vue.js 4일차 — Pinia, Axios, Element Plus"
date: 2026-08-05 09:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, vue, vue3, pinia, axios, element-plus, rest-api, state-management]
description: "Pinia 전역 상태 관리와 storeToRefs, Axios 인스턴스·인터셉터를 이용한 REST API 통신, 그리고 Element Plus UI 라이브러리 적용까지 정리한다."
permalink: /posts/skala-vue-day4/
---

3일차에 화면을 컴포넌트로 나누고 라우터로 연결했다. 그런데 나누고 나니 새로운 문제가 생긴다.

- 홈 화면에서 추가한 지역을 **상세 화면에서도** 알아야 한다
- 섭씨/화씨 설정은 **모든 화면에서 같아야** 한다
- 화면에 뿌릴 데이터는 결국 **서버에서 가져와야** 한다

4일차는 이 셋을 해결한다. **Pinia**로 화면을 넘나드는 상태를 관리하고, **Axios**로 서버와 통신하고, **Element Plus**로 UI를 만드는 시간을 줄인다.

## Pinia: 전역 상태 관리

### 왜 필요한가

3일차에서 정리한 지역적인 Props/Emits 패턴을 다시 보자. 형제 컴포넌트는 공통 부모를 거쳐 통신하고, 계층이 깊어지면 Props Drilling이 발생한다. 여기에 라우터가 더해지면 문제가 더 커진다. **서로 다른 라우트의 화면끼리는 보통 직접적인 부모-자식 관계가 아니기 때문에** 공통 상태를 Props로만 공유하기 어렵다.

Pinia는 컴포넌트 계층 구조와 **무관하게** 별도의 전역 저장소(Store)를 열어 반응형 데이터를 관리한다.

```text
[Props/Emits]                    [Pinia]

    Parent                        Store (전역)
   ↙      ↘                      ↗   ↑   ↖
Child A   Child B          View A  View B  View C
(형제끼리 직접 통신 불가)        (계층과 무관하게 모두 접근)
```

여기서 **상태(State)**란 화면을 렌더링하는 과정에 영향을 줄 수 있는 값을 뜻하고, 상태 관리란 그 값을 다루는 방법을 뜻한다. Vue 2에서는 Vuex를 썼고, Vue 3의 표준은 Pinia다.

### Store의 세 가지 구성 요소

Pinia의 개념은 이미 배운 Composition API 함수와 1:1로 대응된다. 그래서 새로 외울 것이 거의 없다.

| Pinia 용어 | Vue 3 문법 | 역할 |
|---|---|---|
| **state** | `ref()` / `reactive()` | 전역으로 공유할 원본 데이터 |
| **getters** | `computed()` | state를 기반으로 가공한 읽기 전용 값 |
| **actions** | 일반 `function()` | state를 변경하는 로직, 비동기 API 통신 |

Store는 여러 파일로 나누며, **의미 있는 상태끼리 하나의 파일**로 묶는다. `authStore.js`, `uiStore.js`, `configStore.js` 같은 식이다.

### 구축 3단계

**Step 1. Pinia 등록 (`src/main.js`)**

```js
import { createPinia } from 'pinia'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
```

**Step 2. Store 생성 (`src/stores/counter.js`)**

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCounterStore = defineStore('counter', () => {
  // state
  const count = ref(0)

  // getters
  const doubleCount = computed(() => count.value * 2)

  // actions
  function increment() {
    count.value++
  }

  // 외부에 개방할 API를 반환
  return { count, doubleCount, increment }
})
```

`return`한 것만 외부에서 접근할 수 있다. 반환하지 않은 변수는 store 내부에서만 쓰이는 비공개 상태가 된다.

내보내는 함수 이름은 **`use` + 이름 + `Store`** 규칙을 따른다. Composable 관례와 같다.

**Step 3. Store 사용**

{% raw %}
```vue
<script setup>
import { useCounterStore } from '@/stores/counter.js'

const counterStore = useCounterStore()
</script>

<template>
  <p>state: {{ counterStore.count }}</p>
  <p>getters: {{ counterStore.doubleCount }}</p>
  <button @click="counterStore.increment">증가</button>
</template>
```
{% endraw %}

### 가장 흔한 실수: 구조 분해 할당

```js
// 반응성이 끊어진다
const { count, increment } = counterStore
```

이렇게 쓰면 화면이 갱신되지 않는다. `count`를 꺼내는 순간 **Proxy와의 연결이 끊어지고 그 시점의 값만 복사**되기 때문이다. 2일차에서 본 `reactive`의 반응성 단절과 정확히 같은 원리다.

해결책은 Pinia가 제공하는 `storeToRefs`다.

```js
import { storeToRefs } from 'pinia'

// 데이터(state, getters)는 storeToRefs로 감싼다
const { count, doubleCount } = storeToRefs(counterStore)

// 함수(actions)는 그냥 구조 분해해도 된다
const { increment } = counterStore
```

**데이터는 `storeToRefs`, 함수는 그냥.** 함수는 반응형 추적 대상이 아니므로 꺼내도 문제가 없다.

> `storeToRefs`로 꺼낸 값은 `ref`이므로 `<script>` 안에서는 `count.value`로 접근한다. 템플릿에서는 그대로 쓴다.
{: .prompt-warning }

### 사례 연구: 인증 Store

강의에서 다룬 실무 사례다. 로그인 상태는 **거의 모든 화면이 알아야 하는 대표적인 전역 상태**다.

```js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  // state — 새로고침 대비해 localStorage에서 복원
  const token = ref(localStorage.getItem('accessToken') || null)
  const user = ref(JSON.parse(localStorage.getItem('userInfo') || 'null'))

  // getters
  const isLoggedIn = computed(() => !!token.value)
  const username = computed(() => user.value?.name || '게스트')

  // actions
  function login(userData, authToken) {
    user.value = userData
    token.value = authToken
    localStorage.setItem('accessToken', authToken)
    localStorage.setItem('userInfo', JSON.stringify(userData))
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('accessToken')
    localStorage.removeItem('userInfo')
  }

  return { token, user, isLoggedIn, username, login, logout }
})
```

여기서 짚을 점이 두 가지다.

**첫째, `localStorage`와의 동기화.** Pinia의 상태는 메모리에만 있으므로 새로고침하면 사라진다. 1일차에서 SPA의 단점으로 "새로고침 시 상태가 초기화된다"고 했던 그 문제다. 유지되어야 하는 데이터는 `localStorage`에 함께 저장하고, store 초기화 시점에 복원한다.

단, access token을 `localStorage`에 저장하면 같은 origin에서 실행된 XSS가 읽을 수 있다. 이 예제는 동기화 구조를 보여주는 것이며 보편적인 인증 저장 방식은 아니다. 백엔드가 cookie session을 지원한다면 `HttpOnly`, `Secure`, `SameSite` 속성을 적용한 cookie처럼 JavaScript가 읽지 못하는 방식도 검토해야 한다.

**둘째, Navigation Guard와의 연동.** 3일차의 `beforeEach`가 여기서 실제 용도를 갖는다.

```js
router.beforeEach((to, from) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'Login' && authStore.isLoggedIn) {
    return { name: 'Dashboard' }
  }
})
```

`next()`를 호출하는 대신 **객체를 반환**해도 리다이렉션이 된다. `query: { redirect: to.fullPath }`로 원래 가려던 주소를 넘겨 두면 로그인 후 그 자리로 돌려보낼 수 있다.

### JWT

인증 사례와 함께 나온 내용이다. JWT(JSON Web Token)는 claim을 JSON 객체 형태로 전달하기 위한 표준 규격이며, 이 인증 예제에서는 백엔드가 발급한다.

```text
eyJhbGci... . eyJzdWIi... . d3g4eT...
  Header      Payload      Signature
```

위 예시는 점 두 개로 구분된 세 부분의 서명된 compact JWT(JWS)다. **중요한 점은 Header와 Payload가 Base64url로 인코딩되어 있을 뿐 암호화된 것이 아니라는 것이다.** 누구나 디코딩해서 내용을 읽을 수 있으므로 **민감 정보를 넣으면 안 된다.** 서명(Signature)은 내용을 숨기는 게 아니라 올바른 key로 서명됐고 이후 변조되지 않았는지 검증하는 용도다. `iss`, `aud`, `exp` 같은 claim의 유효성은 별도로 검증해야 한다. 암호화된 JWT(JWE)의 compact serialization은 다섯 부분으로 구성될 수 있다.

| 구분 | 서버 측 세션 방식 | 자체 포함 서명 토큰 방식 |
|---|---|---|
| 서버 상태 | 서버 메모리/DB 등에 session 상태 보관 | signature와 claim만 검증하면 session 상태 없이도 가능. 단, revoke 목록 등을 두면 상태가 생김 |
| 클라이언트가 보관하는 값 | 보통 session ID cookie | cookie, 메모리 등 architecture에 맞게 선택 |
| 확장 | 서버 증설 시 session 공유 설정 필요 (Redis 등) | 무상태 검증 구성이면 수평 확장이 단순할 수 있음 |
| 렌더링 구조 | SSR·SPA 모두 사용 가능 | SSR·SPA 모두 사용 가능 |

Bearer access token을 사용하는 경우에는 보통 HTTP 요청의 `Authorization` 헤더에 실어 보낸다.

```text
GET /api/user/profile HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

실무에서는 이 작업을 매 요청마다 수동으로 하지 않고 **Axios Request Interceptor로 자동 주입**한다. 바로 다음 주제로 이어진다.

### 과제: 단위 설정 Store

```js
// stores/configStore.js
export const useConfigStore = defineStore('config', () => {
  const unit = ref('celsius')                                    // state
  const unitSymbol = computed(() =>                              // getters
    unit.value === 'celsius' ? '℃' : '℉'
  )
  function toggleUnit() {                                        // actions
    unit.value = unit.value === 'celsius' ? 'fahrenheit' : 'celsius'
  }
  return { unit, unitSymbol, toggleUnit }
})
```

각 카드에서는 `computed`로 표시값을 만든다.

```js
const displayTemp = computed(() => {
  const rawTemp = props.cityItem.temp          // 원본은 항상 섭씨
  if (configStore.unit === 'fahrenheit') {
    return Math.round((rawTemp * 9) / 5 + 32)
  }
  return rawTemp
})
```

**원본 데이터는 항상 섭씨로 두고 표시할 때만 변환**하는 것이 요점이다. 원본 자체를 화씨로 바꿔 버리면 다시 섭씨로 돌릴 때 반올림 오차가 누적된다.

강의에서도 짚었듯 이 `displayTemp` 로직은 메인과 상세 화면에 **중복**된다. 해결책은 Composable로 빼는 것이다.

```js
// composables/useTemperature.js
export function useTemperature(rawTemp) {
  const configStore = useConfigStore()
  const displayTemp = computed(() => { /* 변환 로직 */ })
  return { displayTemp }
}
```

Composable은 "반응형 상태와 로직을 묶어 재사용 가능하게 만든 함수"다. 1일차에 Options API의 Mixin과 비교하면서 잠깐 나왔던 개념이 여기서 실제로 필요해진다.

## Axios: 서버와 통신하기

### REST API 복습

REST API에서는 HTTP 메서드를 데이터베이스의 CRUD와 흔히 다음처럼 대응시킨다. 이는 HTTP protocol 자체가 강제하는 규칙은 아니다.

| HTTP 메서드 | CRUD | 의미 |
|---|---|---|
| GET | Read | 데이터를 바꾸지 않고 읽기만 |
| POST | Create | 새 데이터 등록 |
| PUT / PATCH | Update | 전체 교체 / 일부 수정 |
| DELETE | Delete | 삭제 |

REST API 설계 원칙은 단순하다.

```text
URI는 오직 명사(자원)로만 구성한다.
  나쁜 예: /getWeather, /deleteUser, /update_city
  바른 예: /weather, /users, /cities

행위(동사)는 HTTP Method로 대체한다.
```

> HTTP 요청·응답 구조와 상태 코드는 [프론트엔드 1일차 글](/posts/skala-frontend-day1/)에서 정리했다. 4xx는 요청·인증·권한·대상 자원을, 5xx는 서버의 요청 처리 실패를 먼저 확인하는 것이 에러 처리의 기준이 된다.
{: .prompt-info }

### Fetch API vs Axios

직전 과정에서는 브라우저 내장 `fetch`를 썼다. Axios는 별도 설치가 필요한 라이브러리다.

| 비교 항목 | Fetch API | Axios |
|---|---|---|
| 설치 | 불필요 (브라우저 내장) | 필요 (`npm install axios`) |
| JSON 변환 | 수동 (`res.json()`) | **자동** |
| 에러 핸들링 | 수동 | **자동 (4xx·5xx가 reject됨)** |
| BaseURL 설정 | Axios식 내장 설정 없음. wrapper로 구현 가능 | **`axios.create`** |
| 인터셉터 | Axios식 내장 기능 없음. wrapper로 구현 가능 | **지원** |
| 실무 선호도 | 중간 | **매우 높음** |

에러 핸들링 차이가 특히 중요하다. `fetch`는 **404나 500 응답도 "정상적으로 응답을 받았다"고 보고 resolve**되기 때문에 `response.ok`를 직접 확인해야 했다. Axios는 4xx·5xx를 자동으로 reject하므로 `catch`에서 한꺼번에 처리할 수 있다.

### 기본 사용

```sh
npm install axios
```

```vue
<script setup>
import { ref } from 'vue'
import axios from 'axios'

const weatherData = ref(null)
const isLoading = ref(false)

const handleFetchWeather = async () => {
  isLoading.value = true
  try {
    const response = await axios.get(URL)
    weatherData.value = response.data     // .json() 불필요
  } catch (error) {
    console.error('통신 중 에러:', error)  // 4xx, 5xx, 네트워크 오류 모두 여기로
  } finally {
    isLoading.value = false               // 성공하든 실패하든 로딩 해제
  }
}
</script>
```

`try / catch / finally` 구조가 요점이다. **`finally`에서 로딩 상태를 해제**해야 에러가 나도 스피너가 영원히 도는 일이 없다.

### 주요 메서드

| 구분 | 함수 | 용도 |
|---|---|---|
| 인스턴스 생성 | `axios.create([config])` | 공통 설정을 가진 독립 인스턴스 |
| HTTP 단축 | `axios.get(url, [config])` | 조회 (`params`로 쿼리스트링) |
| | `axios.post(url, [data], [config])` | 생성 (JSON 자동 변환) |
| | `axios.put` / `axios.patch` | 전체 수정 / 일부 수정 |
| | `axios.delete(url, [config])` | 삭제 |
| 인터셉터 | `axios.interceptors.request` | 요청 직전 공통 전처리 |
| | `axios.interceptors.response` | 응답 직후 공통 후처리 |
| 병렬 요청 | `axios.all([...])` | 여러 요청 동시 실행 |

```js
axios.get('/users', { params: { id: 1 } })     // /users?id=1
axios.post('/users', { name: 'Kim' })          // body에 JSON
```

`get`은 두 번째 인자가 **설정 객체**이고, `post`는 두 번째가 **본문 데이터**라는 차이를 자주 틀린다.

### 인스턴스와 인터셉터

Axios를 쓰는 진짜 이유가 여기 있다. 매번 같은 주소와 헤더를 반복해서 쓰지 않도록 **공통 인스턴스**를 만든다.

```js
// services/apiClient.js
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 요청 직전: 토큰 자동 주입
api.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  return config
})

// 응답 직후: 에러 공통 처리
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore().logout()
      router.push('/login')
    }
    return Promise.reject(error)
  },
)
```

인터셉터가 없다면 **모든 API 호출마다** 토큰을 붙이고 401을 검사하는 코드를 복사해야 한다. 인터셉터는 그 공통 관심사를 한곳으로 모은다. 앞서 Pinia 절에서 "실무에서는 토큰을 인터셉터로 자동 주입한다"고 한 것이 이 구조다.

### Promise .then vs async/await

Axios는 Promise를 반환하므로 두 방식 모두 가능하다.

| | `.then()` 방식 | `async / await` |
|---|---|---|
| 기반 | ES6 (2015) | ES8 (2017), Promise를 감싼 문법 설탕 |
| 스타일 | 체이닝 | **위에서 아래로 읽히는 동기식** |
| 에러 처리 | `.catch()` | **`try...catch`** |
| 선호도 | 보통 | **매우 높음** |

실행 순서가 어떻게 다른지는 직전 과정의 [Event Loop 설명](/posts/skala-frontend-day2/)과 이어진다. `.then()` 방식에서는 "통신 요청 직후" 로그가 데이터 도착보다 먼저 찍히지만, `await`를 쓰면 코드에 적힌 순서대로 실행된다.

### API 키를 소스에 넣지 말 것

강의 예제는 설명을 위해 API 키를 코드에 직접 적었다.

```js
const API_KEY = '여기에_키를_직접_적는_방식'   // 하면 안 되는 방식
const URL = `https://api.openweathermap.org/data/2.5/weather?...&appid=${API_KEY}`
```

**이 코드를 그대로 GitHub 공개 저장소에 올리면 키가 그대로 노출된다.** 과제 요구사항에도 "API 키는 소스에 하드코딩하지 않고 환경 변수로 관리한다"고 명시되어 있다.

빌드·배포 파트에서 다룰 환경 변수(`.env`)가 1차 해법이지만, 여기에도 함정이 있다. Vite는 `VITE_` 접두사가 붙은 환경 변수를 **빌드 시점에 번들에 문자열로 치환해 넣기 때문에**, 배포된 JS 파일을 내려받는 것만으로 키를 꺼낼 수 있다. 이 문제를 어떻게 처리했는지는 프로젝트 회고에서 따로 다룬다.

> 저장소를 공개하기 전에 커밋 이력에 키가 남아 있지 않은지 확인해야 한다. `.gitignore`에 `.env.local`을 넣는 것은 **앞으로의 커밋**만 막을 뿐, 이미 올라간 것은 이력에 남는다.
{: .prompt-danger }

## Element Plus: UI 라이브러리

### 무엇을 얻는가

UI 라이브러리는 Button, Input, Dialog, Table 같은 공통 컴포넌트를 Vue 3 컴포넌트로 모듈화해 제공하는 패키지다. 얻는 것은 셋이다.

1. **개발 리소스 절감**: CSS와 마크업을 직접 작성하지 않고 완성된 태그를 호출
2. **크로스 브라우징·반응형 지원**: 라이브러리가 지원하는 브라우저와 layout pattern을 활용
3. **접근성 구현 지원**: 여러 컴포넌트에 ARIA와 키보드 조작 pattern이 구현되어 있음

세 번째가 특히 크다. 직전 과정에서 접근성을 다루면서 "모든 것을 `<div>`로 만들고 CSS로 모양만 흉내 내면 접근성 작업이 별도로 필요해진다"고 했는데, 잘 만들어진 UI 라이브러리는 그 작업을 줄여 준다. 다만 지원 정도는 component와 version마다 다르므로 target browser, keyboard, screen reader로 직접 검증해야 한다.

### 라이브러리 비교

| 비교 항목 | Vuetify | **Element Plus** | PrimeVue |
|---|---|---|---|
| 디자인 명세 | Google Material Design | Enterprise Desktop View | Multi-Theme & Flex CSS |
| TypeScript | 지원 | **완전 내장** | 지원 |
| 커스텀 방식 | SASS 변수 | CSS 변수 | Unstyled 모드 |
| 특화 컴포넌트 | Mobile Layout | **Data Table, Form Validation** | Advanced Chart, Tree Table |
| 태그 예시 | `<v-btn>` | `<el-button>` | `<Button>` |

이 과정에서는 Enterprise Desktop UI에 필요한 Data Table과 Form component를 빠르게 적용하기 위해 Element Plus를 선택했다.

### 설치와 전역 등록

```sh
npm install element-plus
```

```js
// src/main.js
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'   // CSS를 함께 import해야 한다

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')
```

CSS import를 빠뜨리면 컴포넌트는 렌더링되지만 스타일이 하나도 적용되지 않는다. 처음 설치할 때 자주 겪는 문제다.

### 주요 컴포넌트

카테고리별로 정리하면 필요할 때 찾기 쉽다.

**Basic — 레이아웃과 기본 요소**

| 컴포넌트 | 태그 |
|---|---|
| Button | `<el-button>` |
| Container | `<el-container>` (`<el-header>`, `<el-aside>`와 결합) |
| Layout | `<el-row>`, `<el-col>` — 24분할 그리드 |
| Icon | `<el-icon>` |
| Space | `<el-space>` — 자식 간 여백 통제 |

**Form — 입력과 검증**

| 컴포넌트 | 태그 | 비고 |
|---|---|---|
| **Date Picker** | `<el-date-picker>` | **실무 빈도 최상.** 기간 범위 선택 |
| Autocomplete | `<el-autocomplete>` | 추천 검색어 목록 |
| Select | `<el-select>` | 드롭다운 |
| Input | `<el-input>` | 비밀번호 토글, 지우기 버튼 내장 |
| Switch | `<el-switch>` | 토글, 다크모드 |
| Form | `<el-form>`, `<el-form-item>` | 실시간 검증 |
| Upload | `<el-upload>` | 드래그 앤 드롭 파일 첨부 |

**Data — 데이터 표시**

| 컴포넌트 | 태그 | 비고 |
|---|---|---|
| **Table** | `<el-table>` | 정렬·필터·열 고정·합계 |
| Pagination | `<el-pagination>` | 페이지 분할 |
| **Skeleton** | `<el-skeleton>` | 데이터 도착 전 회색 레이아웃 |
| **Empty** | `<el-empty>` | "검색 결과가 없습니다" |
| Progress | `<el-progress>` | 진행률 게이지 |
| Timeline | `<el-timeline>` | 시간순 이력 |
| Tag | `<el-tag>` | 상태값 배지 |
| Card | `<el-card>` | 섀도우 블록 |

**Feedback — 알림과 확인**

| 컴포넌트 | 호출 방식 | 비고 |
|---|---|---|
| Alert | `<el-alert>` | 상단 고정 공지 |
| Dialog | `<el-dialog>` | 모달 |
| Loading | `v-loading` (디렉티브) | 스피너 + 딤 처리 |
| Message | `ElMessage` (JS 호출) | 토스트 알림 |
| MessageBox | `ElMessageBox` | `alert()`, `confirm()` 대체 |

`ElMessage`와 `ElMessageBox`는 태그가 아니라 **JavaScript 함수로 호출**한다.

```js
import { ElMessage, ElMessageBox } from 'element-plus'

ElMessage.error('올바른 이메일 형식이 아닙니다.')
ElMessage.success('가입이 완료되었습니다.')

ElMessageBox.confirm('파일을 영구히 삭제하시겠습니까?', '최종 경고', {
  confirmButtonText: '삭제',
  cancelButtonText: '취소',
  type: 'warning',
})
  .then(() => ElMessage.success('삭제되었습니다.'))
  .catch(() => ElMessage.info('취소되었습니다.'))
```

`ElMessageBox`가 Promise를 반환한다는 점이 유용하다. 확인은 `.then()`, 취소는 `.catch()`로 자연스럽게 분기된다. 브라우저 기본 `confirm()`은 동기적으로 실행을 멈추지만 이쪽은 비동기라 화면이 멈추지 않는다.

**Loading, Skeleton, Empty 세 가지는 실무에서 반드시 쓰게 된다.** 데이터를 서버에서 가져오는 순간부터 화면에는 최소 네 가지 상태가 생기기 때문이다.

```text
로딩 중  →  Skeleton 또는 v-loading
성공     →  실제 데이터
빈 결과  →  el-empty
실패     →  el-alert
```

Axios를 붙이기 전까지는 데이터가 항상 거기 있었지만, 통신이 들어오는 순간 "아직 없음"과 "실패함"이라는 상태를 반드시 다뤄야 한다.

### 전역 설정

`<el-config-provider>`로 다국어 언어팩, 컴포넌트 기본 크기, z-index를 일괄 제어한다.

```vue
<script setup>
import { ElConfigProvider } from 'element-plus'
import ko from 'element-plus/es/locale/lang/ko'
</script>

<template>
  <ElConfigProvider :locale="ko">
    <RouterView />
  </ElConfigProvider>
</template>
```

이 설정이 없으면 Date Picker의 요일과 월 이름이 영어로 나온다.

## 정리

4일차를 한 줄로 요약하면 **"화면 밖의 것들을 다룬다"**다. 상태는 컴포넌트 밖으로, 데이터는 서버에서, UI는 라이브러리에서 온다.

- Pinia의 state·getters·actions는 각각 `ref`·`computed`·`function`이다. 새로 배울 개념이 아니라 **이미 아는 것을 전역으로 옮긴 것**이다
- **store를 구조 분해할 때 데이터는 `storeToRefs`로 감싼다.** 그냥 꺼내면 반응성이 끊어진다
- 메모리 상태는 새로고침에 사라지므로, 유지가 필요하면 `localStorage`와 동기화한다
- Axios는 JSON 자동 변환, 자동 에러 reject, BaseURL, **인터셉터**를 제공한다. 인터셉터가 Axios를 쓰는 핵심 이유다
- `try / catch / finally`에서 `finally`로 로딩을 해제한다
- **API 키는 소스에 넣지 않는다.** 환경 변수도 `VITE_` 접두사를 쓰면 번들에 노출된다
- UI 라이브러리는 개발 속도를 높이고 접근성 구현을 도와주지만 component별 검증은 필요하다
- 통신이 들어오면 로딩·성공·빈 결과·실패 네 가지 상태를 모두 처리해야 한다

이제 기능은 대부분 갖춰졌다. 남은 것은 **완성된 것을 실제로 배포하는 일**이다. 이어지는 빌드·배포 파트에서 Modern JavaScript 문법을 정리하고, Vite 빌드와 환경 변수, ESLint·Prettier, 그리고 배포까지 다룬다.

---

이전 글: [3일차 — Component와 Vue Router](/posts/skala-vue-day3/)

시리즈 안내: [Frontend framework: Vue.js — 4일 학습 로드맵](/posts/skala-vue-roadmap/)

다음 글: [빌드와 배포 — Modern JavaScript, ESLint, Vite](/posts/skala-vue-day5/)
