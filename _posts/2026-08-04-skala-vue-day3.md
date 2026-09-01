---
title: "[SKALA] Vue.js 3일차 — Component와 Vue Router"
date: 2026-08-04 09:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, vue, vue3, component, props, emits, slot, vue-router, lifecycle]
description: "컴포넌트 계층과 Lifecycle Hook, Props/Emits 통신과 Slot, 그리고 Vue Router의 동적 경로·프로그래밍 방식 이동·Navigation Guard까지 정리한다."
permalink: /posts/skala-vue-day3/
---

2일차까지 만든 화면은 하나의 `.vue` 파일 안에 전부 들어 있었다. 기능이 늘어나면 이 파일은 수백 줄이 되고, 어디를 고쳐야 할지 찾는 데만 시간이 걸린다.

3일차의 질문은 둘이다. **"화면을 어떤 단위로 쪼개고, 쪼갠 조각들끼리 어떻게 대화하는가"**, 그리고 **"여러 화면을 URL로 어떻게 연결하는가"**.

## Component란 무엇인가

소프트웨어 공학에서 컴포넌트는 **독립적인 기능을 수행하며 언제든 다른 부품으로 교체할 수 있는 표준화된 모듈**을 뜻한다. 핵심은 두 가지다.

- **독립성(Independency)**: 다른 부품의 내부를 몰라도 동작한다
- **교체 가능성(Replaceability)**: 같은 규격이면 갈아 끼울 수 있다

Vue에서는 HTML·CSS·JavaScript를 하나의 `.vue` 파일에 묶은 SFC가 곧 컴포넌트이며, 애플리케이션 하나는 여러 컴포넌트가 **트리 구조**로 연결되어 완성된다.

### 컴포넌트 사이의 관계

| 관계 | 설명 |
|---|---|
| **Parent-Child** | 다른 컴포넌트를 품은 쪽이 부모, 그 안에 놓인 쪽이 자식 |
| **Sibling** | 같은 부모 아래 나란히 있는 형제들 |
| **Ancestors-Descendants** | 자식의 자식으로 내려가는 다중 계층 |

여기서 반드시 기억할 제약이 있다.

**부모와 자식은 철저히 독립되어 있다.** 자식은 부모의 변수를 마음대로 가져다 쓸 수 없고, 부모도 자식의 내부를 들여다볼 수 없다. 지역적인 Props/Emits 패턴에서 형제에게 무언가를 전하려면 공통 부모를 거쳐 올라갔다가 내려온다. 여러 계층이나 화면이 공유하는 상태에는 store, composable, provide/inject 같은 별도 통로를 쓸 수 있다.

이 제약이 불편해 보이지만 의도된 것이다. 아무나 아무 데이터에 접근할 수 있으면 "이 값을 누가 바꿨는지" 추적할 수 없게 된다. 데이터의 흐름을 정해진 통로로만 제한하기 때문에 디버깅이 가능해진다.

### 컴포넌트 등록

**지역 등록**은 부모가 자식을 import해서 쓰는 방식이다. 대부분 이 방식을 쓴다.

```vue
<script setup>
import BaseButton from './components/BaseButton.vue'
</script>

<template>
  <BaseButton />
  <base-button></base-button>   <!-- kebab-case도 가능 -->
</template>
```

**전역 등록**은 `main.js`에서 등록해 어디서든 import 없이 쓰는 방식이다.

```js
const app = createApp(App)

app.component('BaseButton', BaseButton)
  .component('BaseInput', BaseInput)

app.mount('#app')
```

전역 등록은 편하지만 남용하면 **이 컴포넌트가 어디서 왔는지 코드만 보고 알 수 없게 된다.** 또한 실제로 쓰이지 않아도 번들에 포함된다. 정말 모든 화면에서 쓰는 소수의 공통 부품에만 쓰는 것이 좋다.

## Component Lifecycle

컴포넌트가 생성되고 파괴되기까지의 단계다.

| 단계 | 상태 | 이 시점에 할 일 |
|---|---|---|
| **1. 생성 (Creation)** | 메모리에만 존재. 아직 HTML에 안 붙음 | `ref`, `computed`, `watch` 초기화 |
| **2. 부착 (Mounting)** | 실제 DOM에 부착됨 | **DOM 접근이 필요한 초기화 가능** |
| **3. 갱신 (Updating)** | 반응형 데이터가 바뀌어 리렌더링 | 바뀐 요소의 크기·스크롤 위치 재계산 |
| **4. 소멸 (Unmounting)** | 컴포넌트가 화면에서 파괴됨 | **타이머·이벤트 리스너 정리** |

각 단계에서 Vue가 자동 실행해 주는 콜백이 **Lifecycle Hook**이다.

| 훅 | 시점 |
|---|---|
| `setup()` | 생성 전. `<script setup>` 본문 그 자체 |
| `onBeforeMount()` | DOM 마운트 직전 |
| **`onMounted()`** | **DOM 마운트 후. DOM 의존 초기화** |
| `onBeforeUpdate()` | DOM 업데이트 직전 |
| `onUpdated()` | DOM 업데이트 완료 후 |
| `onBeforeUnmount()` | DOM에서 제거 직전 |
| **`onUnmounted()`** | **제거 후. 정리 작업** |
| `onErrorCaptured()` | 자식에서 에러 발생 시 |
| `onActivated()` / `onDeactivated()` | `<KeepAlive>` 안에서 재활성화/비활성화 |

```vue
<script setup>
import { ref, onMounted, onUpdated, onUnmounted } from 'vue'

const count = ref(0)
let timerId = null

// 생성 단계 = <script setup> 본문
console.log('1. 메모리에 생성됨 (DOM 접근 불가)')

onMounted(() => {
  console.log('2. 화면에 부착됨 (DOM 접근 가능)')
  timerId = setInterval(() => { count.value++ }, 3000)
})

onUpdated(() => {
  console.log(`3. 화면을 새로 그림 (count: ${count.value})`)
})

onUnmounted(() => {
  clearInterval(timerId)   // 이걸 빠뜨리면 메모리 누수
  console.log('4. 소멸. 타이머 정리 완료')
})
</script>
```

**`onUnmounted`에서의 정리가 실무에서 가장 중요하다.** `setInterval`을 켜 두고 정리하지 않으면 컴포넌트가 화면에서 사라져도 타이머는 백그라운드에서 계속 돈다. SPA는 페이지를 새로고침하지 않으므로, 이렇게 방치된 타이머와 이벤트 리스너가 계속 쌓여 메모리 누수가 된다.

정리해야 할 대표적인 대상은 다음과 같다.

- `setInterval` / `setTimeout`
- `window`나 `document`에 직접 붙인 이벤트 리스너
- 외부 라이브러리 인스턴스 (지도, 차트 등)
- WebSocket 연결, 진행 중인 API 요청

> `onMounted`는 DOM이 필요한 초기화에 적합하다. 데이터를 받아 화면에 뿌리기만 한다면 굳이 기다릴 필요 없이 setup이나 router의 data layer 등에서 더 일찍 시작할 수 있다. DOM 요소에 직접 접근해야 하는 경우(지도 초기화, 캔버스 등)에 필요하다.
{: .prompt-tip }

## Props & Emits

Vue의 컴포넌트 통신은 하나의 원칙을 따른다.

> **데이터는 위에서 아래로 물려주고(Props Down), 이벤트는 아래에서 위로 쏘아 올린다(Event Up).**

| 분류 | Props (하행선) | Emits (상행선) |
|---|---|---|
| 개념 | 부모가 자식에게 주는 데이터 | 자식이 부모에게 보고하는 이벤트 |
| 방향 | 부모 → 자식 | 자식 → 부모 |
| 권한 | **prop binding은 읽기 전용** | 변경 요청과 값 전달 가능 |
| 매크로 | `defineProps({...})` | `defineEmits([...])` |
| 부모 쪽 문법 | 속성에 `:`로 주입 | 이벤트에 `@`로 청취 |

`defineProps`, `defineEmits`, `defineExpose`는 **컴파일러 매크로**다. 런타임이 아니라 빌드 시점에 Vue 컴파일러가 변환하는 특수 예약어라서, **import 없이** `<script setup>` 안에서 바로 쓸 수 있다.

객체나 배열 prop의 nested 값은 기술적으로 수정할 수 있지만 부모 상태까지 바꾸는 동작이므로 피하고, event로 부모에게 변경을 요청해야 한다.

### defineProps

배열 형식과 객체 형식이 있다.

```js
// 배열 형식: 이름만 선언. 기본값·타입 검증 불가
const props = defineProps(['title', 'count'])

// 객체 형식: 타입, 필수 여부, 기본값, 검증까지 가능
defineProps({
  cityName: String,
  areaId: [String, Number],              // 다중 타입 허용
  temperature: {
    type: Number,
    required: true,                       // 안 넘기면 경고
  },
  status: {
    type: String,
    default: '맑음',
  },
  score: {
    type: Number,
    validator(value) {                    // 커스텀 검증
      return value >= 0 && value <= 100
    },
  },
})
```

**배열과 객체 타입의 기본값은 반드시 함수 형태로 써야 한다.**

```js
defineProps({
  weeklyForecast: {
    type: Array,
    default: () => [],                    // [] 가 아니라 () => []
  },
  coordinates: {
    type: Object,
    default: () => ({ lat: 37.5, lng: 126.9 }),
  },
})
```

이유는 JavaScript의 참조 타입 특성 때문이다. `default: []`로 쓰면 **모든 인스턴스가 같은 배열 하나를 공유**하게 되어, 한 컴포넌트에서 배열을 수정하면 다른 컴포넌트에도 반영된다. 함수로 감싸면 인스턴스마다 새 배열이 만들어진다. 직전 과정에서 정리한 "객체를 가리키는 참조값이 복사된다"가 여기서 그대로 문제가 된다.

템플릿에서는 그냥 쓰지만, 스크립트에서는 `props.`를 붙여야 한다.

{% raw %}
```vue
<script setup>
const props = defineProps({ title: String, likes: Number })

const checkPopularity = () => {
  if (props.likes > 100) {              // props. 필수
    console.log(`${props.title}은 인기 게시글`)
  }
}
</script>

<template>
  <h1>{{ title }}</h1>                  <!-- 템플릿에서는 그대로 -->
</template>
```
{% endraw %}

### Props는 읽기 전용이다

```js
const props = defineProps(['likes'])

const broken = () => {
  props.likes = 999    // 에러. 읽기 전용
}
```

이 제약이 **단방향 데이터 흐름(One-way Data Flow)**의 핵심이다. 자식이 부모의 데이터를 마음대로 바꿀 수 있다면, 값이 잘못됐을 때 어느 컴포넌트가 범인인지 찾을 수 없다. 자식은 "이렇게 바꿔 달라"고 **요청**만 하고, 실제 변경은 데이터를 소유한 부모가 한다.

### camelCase와 kebab-case

```vue
<!-- 부모 -->
<WeatherCard :city-name="selectCityName" :area-code="areaCode" />
```

```vue
<!-- 자식 -->
<script setup>
defineProps({
  cityName: String,     // camelCase로 선언
  areaCode: Number,
})
</script>
```

**JavaScript 안에서는 camelCase, in-DOM HTML template의 속성은 kebab-case**를 쓴다. HTML 표준이 대소문자를 구분하지 않기 때문이다. SFC template에서는 camelCase도 사용할 수 있지만 일관성을 위해 kebab-case를 쓸 수 있다.

컴포넌트 파일을 import할 때는 PascalCase(`WeatherCard`)를 쓴다. 이 세 표기법이 각각 어디에 쓰이는지 헷갈리기 쉬운데, 규칙은 단순하다. **파일·컴포넌트는 PascalCase, JS 변수는 camelCase, HTML 속성은 kebab-case.**

### defineEmits

자식이 부모에게 커스텀 이벤트를 쏘아 올린다.

{% raw %}
```vue
<!-- 자식: WeatherCard.vue -->
<script setup>
defineProps({ cityName: String, status: String })

const emit = defineEmits(['select-city'])

const handleCardClick = (name) => {
  emit('select-city', name)      // 첫 인자는 이벤트명, 이후는 페이로드
}
</script>

<template>
  <div class="weather-card" @click="handleCardClick(cityName)">
    <h4>{{ cityName }} ({{ status }})</h4>
  </div>
</template>
```
{% endraw %}

{% raw %}
```vue
<!-- 부모 -->
<script setup>
import { ref } from 'vue'
import WeatherCard from './components/WeatherCard.vue'

const selectedCityInfo = ref('카드를 클릭해 보세요.')

const receiveCitySignal = (cityName) => {
  selectedCityInfo.value = `${cityName}이(가) 선택되었습니다.`
}
</script>

<template>
  <WeatherCard cityName="서울" status="맑음" @select-city="receiveCitySignal" />
  <div class="status-bar">{{ selectedCityInfo }}</div>
</template>
```
{% endraw %}

`emit()`의 첫 번째 인자가 이벤트 식별자, 두 번째부터가 부모의 콜백으로 전달할 **페이로드**다. 이벤트 이름은 **kebab-case**로 작성한다.

### 2일차의 v-model이 여기서 이어진다

2일차에서 text input의 `v-model`이 `:value` + `@input`의 문법 설탕이라고 했는데, 컴포넌트에서도 정해진 prop과 event를 통해 양방향 binding을 구성한다.

```vue
<!-- 자식: SearchBar.vue -->
<script setup>
defineProps({ query: String })
const emit = defineEmits(['update:query'])
</script>

<template>
  <input :value="query" @input="emit('update:query', $event.target.value)" />
</template>
```

부모에서 `<SearchBar v-model:query="searchQuery" />`로 쓰면 `query` prop과 `update:query` event로 확장된다. 자식은 props를 직접 수정하지 않고 **값은 `:value`로 받고, 변경은 event로 알린다.** 과제의 `update-query`처럼 colon이 없는 이름은 일반 custom event이며 `v-model:query` protocol과는 다르다. Vue 3.4 이상에서는 자식에서 `const query = defineModel('query')`로 같은 protocol을 간단히 선언할 수도 있다.

## Provide & Inject

컴포넌트 계층이 깊어지면 **Props Drilling** 문제가 생긴다. 최하위 컴포넌트에만 필요한 데이터인데, 중간 컴포넌트들이 오직 아래로 전달하기 위해 props를 받아 다시 넘기는 과정을 반복하는 현상이다.

```text
GrandParent (데이터 소유)
  └─ Parent      ← 필요 없는데 받아서 넘김
      └─ Child   ← 필요 없는데 받아서 넘김
          └─ GrandChild (실제 사용)
```

`provide`/`inject`는 중간 계층을 건너뛴다.

```js
// GrandParent.vue
import { ref, provide } from 'vue'
const themeColor = ref('dark-mode')
provide('globalTheme', themeColor)
```

```js
// GrandChild.vue
import { inject } from 'vue'
const theme = inject('globalTheme')
```

다만 **실무 사용 빈도는 높지 않다.** 4일차에서 배울 Pinia가 같은 문제를 더 명확하게 해결하기 때문이다. `provide`/`inject`는 데이터의 출처가 코드에 드러나지 않아서, 규모가 커지면 "이 값이 어디서 온 건지" 추적하기 어려워진다.

> 종합과제에서도 `provide`/`inject`를 억지로 넣지 않았다. 컴포넌트 계층이 얕고, 여러 화면이 공유하는 상태는 Pinia가 담당하므로 Props/Emits와 Store로 책임을 나누는 편이 명확했다.
{: .prompt-info }

## Slot

Props가 **데이터**를 주입한다면, Slot은 **HTML 마크업과 레이아웃 자체**를 주입한다. 자식 컴포넌트가 특정 구역을 비워두고, 부모가 그 자리를 채우는 구조다.

### Default Slot

```vue
<!-- 자식: BaseCard.vue -->
<template>
  <div class="base-card">
    <slot>
      <p>기본 콘텐츠 영역입니다.</p>   <!-- 부모가 안 채우면 이게 표시됨 -->
    </slot>
  </div>
</template>
```

```vue
<!-- 부모 -->
<BaseCard>
  <p>단순한 텍스트를 주입합니다.</p>
</BaseCard>

<BaseCard>
  <h2>경고 상태</h2>
  <button>확인</button>
</BaseCard>

<BaseCard></BaseCard>   <!-- 기본 콘텐츠가 표시됨 -->
```

### Named Slot

여러 구역을 각각 채워야 할 때 이름을 붙인다.

```vue
<!-- 자식 -->
<template>
  <div class="base-card">
    <header><slot name="header"></slot></header>
    <main><slot></slot></main>
  </div>
</template>
```

```vue
<!-- 부모 -->
<BaseCard>
  <template v-slot:header>
    <h3>주입한 제목</h3>
  </template>
  <p>이름 없는 슬롯으로 들어가는 본문</p>
</BaseCard>
```

`v-slot:header`는 `#header`로 축약할 수 있다.

### Scoped Slot

방향이 반대다. **자식이 가진 데이터를 부모의 마크업에서 쓸 수 있게** 넘겨준다.

```vue
<!-- 자식 -->
<script setup>
import { ref } from 'vue'

const message = ref('현재 서버 상태 정상')
const userCount = ref(150)
</script>

<template>
  <slot :text="message" :count="userCount">
    <p>기본 화면</p>
  </slot>
</template>
```

{% raw %}
```vue
<!-- 부모 -->
<SlotScopedChild v-slot="slotBag">
  <p>알림: {{ slotBag.text }}</p>
  <p>접속자: {{ slotBag.count }}명</p>
</SlotScopedChild>
```
{% endraw %}

자식은 `:이름="변수"`로 데이터를 슬롯에 실어 보내고, 부모는 `v-slot="변수주머니"`로 받아 꺼내 쓴다. 목록 컴포넌트가 데이터 순회는 담당하되 각 행의 생김새는 사용하는 쪽이 정하게 할 때 유용하다.

### Slot의 컴파일 스코프

혼동하기 쉬운 지점이 하나 있다.

**슬롯으로 전달되는 콘텐츠는 시각적으로는 자식 안에 위치하지만, 스크립트상으로는 부모의 스코프에서 컴파일되고 평가된다.**

```vue
<BaseDashboardCard>
  <SearchBar :query="searchQuery" @update-query="handleUpdate" />
</BaseDashboardCard>
```

여기서 `SearchBar`는 화면상 `BaseDashboardCard` 내부에 그려지지만, `searchQuery`와 `handleUpdate`는 **부모의 변수**다. `BaseDashboardCard`는 이들의 존재조차 모른다. 그래서 부모와 `SearchBar`가 직접 바인딩·통신할 수 있다.

이 성질 덕분에 `BaseDashboardCard`는 **디자인만 담당하는 순수한 레이아웃 컴포넌트**로 남을 수 있다. 안에 무엇이 들어오든 관여하지 않는다.

## Vue Router

여기서부터 후반부다. SPA는 서버에 새 페이지를 요청하지 않으므로, **URL 변화를 JavaScript가 가로채서 매칭되는 컴포넌트만 교체**해야 한다. 그 일을 하는 공식 라이브러리가 Vue Router다.

### 설정 3단계

**Step 1. 라우터 정의 (`src/router/index.js`)**

```js
import { createRouter, createWebHistory } from 'vue-router'
import WeatherHomeView from '@/views/WeatherHomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: WeatherHomeView,
    },
  ],
})

export default router
```

`routes` 배열의 각 객체가 갖는 속성이다.

| 속성 | 역할 |
|---|---|
| `path` | **필수.** 브라우저 URL 경로 |
| `component` | 화면을 렌더링하는 route record에서 매핑되는 컴포넌트. redirect-only record에는 불필요 |
| `name` | 고유 식별 이름 |
| `redirect` | 강제 리다이렉션 경로 |

`createWebHistory()`는 `/user/profile`처럼 슬래시를 쓰는 전통적인 URL 방식이다.

**Step 2. 앱에 등록 (`src/main.js`)**

```js
import router from './router'
app.use(router)
```

**Step 3. 사용 (`<RouterLink>`, `<RouterView>`)**

```vue
<template>
  <nav>
    <RouterLink to="/">홈</RouterLink>
    <RouterLink to="/about">소개</RouterLink>
  </nav>

  <RouterView />   <!-- 경로에 맞는 컴포넌트가 여기 갈아 끼워진다 -->
</template>
```

### 내부 경로에 `<a>` 태그를 쓰지 않는 이유

```vue
<a href="/about">About</a>       <!-- 내부 client route에는 권장하지 않음 -->
<RouterLink to="/about">About</RouterLink>
```

내부 경로에 `<a>` 태그를 쓰면 에러를 내지는 않지만 **브라우저의 전체 새로고침을 발생시킨다.** 그 순간 메모리에만 있던 반응형 데이터와 Pinia 상태는 재생성되고, SPA의 장점인 빠른 화면 전환도 사라진다. storage나 persistence plugin에 저장한 상태는 복원될 수 있다. 외부 URL이나 download 링크에는 `<a>`가 맞다.

`<RouterLink>`는 최종적으로 `<a>` 태그로 렌더링되지만, 클릭 이벤트를 가로채 기본 동작을 막고(2일차의 `preventDefault`) URL만 바꾼다.

### 핵심 요소 정리

| 요소 | 본질 | 위치 | 역할 |
|---|---|---|---|
| `route` | JS 객체 | 각 컴포넌트의 `<script setup>` | **현재** 활성화된 페이지의 정보 |
| `router` | JS 객체 | `router/index.js`, `main.js` | 앱 전체의 라우팅 시스템 총괄 |
| `<RouterView>` | 내장 컴포넌트 | 레이아웃 컴포넌트 | 매칭된 컴포넌트가 출력되는 자리 |
| `<RouterLink>` | 내장 컴포넌트 | 내비게이션 바 | 새로고침 없이 URL만 변경 |

**단수형 `route`는 현재 정보, `router`는 시스템 전체**라고 기억하면 헷갈리지 않는다.

### views와 components

1일차에 던졌던 질문의 답이 여기 있다.

| 구분 | `views/` | `components/` |
|---|---|---|
| 역할 | 페이지 단위 컴포넌트 | 재사용 가능한 UI 부품 |
| Router 매핑 | **`routes`에 등록되어 직접 매핑** | 매핑되지 않음 |
| 재사용성 | 낮음 (특정 URL 전용) | 높음 |
| 예시 | `WeatherHomeView.vue` | `SearchBar.vue`, `WeatherCard.vue` |

이 프로젝트에서는 `<RouterView>`에 의해 직접 호출되는 최상위 페이지 컴포넌트에 접미사 **`View`**를 붙이는 규칙을 사용한다.

### Lazy Loading

`component` 속성을 지정하는 방식이 둘 있다.

```js
// 정적 import: 초기 module graph에 포함되어 eager하게 로드
import WeatherAboutView from '@/views/WeatherAboutView.vue'
{ path: '/about', component: WeatherAboutView }

// 동적 import: 그 경로에 진입하는 순간 로드 (Lazy Loading)
{ path: '/about', component: () => import('@/views/WeatherAboutView.vue') }
```

동적 import를 쓰면 Vite가 해당 컴포넌트를 **별도 청크 파일로 분리**한다. 1일차에서 SPA의 단점으로 "모든 로직이 하나의 거대한 덩어리로 묶여 초기 로딩이 느리다"고 했는데, Lazy Loading이 그 문제의 표준 해법이다. 사용자가 방문하지 않는 페이지의 코드는 아예 내려받지 않는다.

첫 화면(`/`)은 어차피 즉시 필요하므로 정적 import로 두고, 나머지를 동적으로 두는 방식이 일반적이다.

### useRoute — 현재 경로 정보 읽기

```vue
<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

console.log(route.path)            // '/weather/seoul'
console.log(route.params.cityId)   // 'seoul'
console.log(route.query.q)         // 쿼리스트링
console.log(route.name)            // 'WeatherDetail'
</script>
```

| 프로퍼티 | 예시 |
|---|---|
| `route.params` | `/user/:id` → `{ id: '42' }` |
| `route.query` | `/search?q=vue` → `{ q: 'vue' }` |
| `route.path` | `/user/42` |
| `route.name` | `'UserDetail'` |

`route` 객체는 **반응성을 유지**하므로 템플릿에서도 바로 쓸 수 있고, `watch`로 변화를 감시할 수도 있다.

### Dynamic Route Matching

도시별 상세 페이지를 만든다고 도시 수만큼 라우트를 선언할 수는 없다. 경로의 일부를 변수로 만든다.

```js
{
  path: '/weather/:cityId',    // :cityId 가 동적 세그먼트
  name: 'WeatherDetail',
  component: () => import('@/views/WeatherDetailView.vue'),
}
```

```js
const route = useRoute()
console.log(route.params.cityId)   // '/weather/seoul' → 'seoul'
```

동적 세그먼트는 여러 개를 조합할 수도 있고, 경로 중간에 놓을 수도 있다.

```js
{ path: '/category/:categoryId/product/:productId' }   // 다중
{ path: '/user/:userId/posts' }                        // 중간 위치
```

> 같은 라우트 안에서 파라미터만 바뀌면(`/weather/seoul` → `/weather/busan`) 컴포넌트가 **재사용되어 `onMounted`가 다시 실행되지 않는다.** 이 경우 `watch`로 `route.params`를 감시해 데이터를 다시 불러와야 한다. 상세 페이지에서 다른 항목으로 이동했는데 내용이 그대로인 버그가 대개 이것이다.
{: .prompt-warning }

### Query String

`/weather?search=수원&page=2` 형태다. 라우터 설정에 별도 선언 없이 자유롭게 쓸 수 있다.

```js
onMounted(() => {
  if (route.query.search) {
    searchQuery.value = route.query.search   // 주소창 값으로 상태 복원
  }
})
```

검색 조건을 쿼리스트링에 담아 두면 **그 URL을 공유하거나 새로고침해도 같은 화면**이 나온다. SPA에서 새로고침 시 상태가 초기화되는 단점을 부분적으로 보완하는 방법이다.

### useRouter — 코드로 화면 이동

`<RouterLink>` 클릭이 아니라 스크립트에서 이동시키는 것을 **Programmatic Navigation**이라 한다.

```vue
<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const goHome = () => router.push('/')
const loginRedirect = () => router.replace('/')       // 교체 전 route로는 뒤로 갈 수 없음
const goBack = () => router.go(-1)

const goDetail = () => {
  router.push({
    name: 'WeatherDetail',
    params: { cityId: 'city_02' },
    query: { search: '수원' },
  })
}
</script>
```

| 메서드 | 동작 |
|---|---|
| `router.push()` | 히스토리에 **추가**하며 이동 (뒤로 가기 가능) |
| `router.replace()` | 현재 히스토리를 **대체** (교체 전 route는 history에 남지 않음) |
| `router.go(n)` | n단계 앞/뒤 이동 |
| `router.back()` / `router.forward()` | 이전 / 다음 |

`replace`가 필요한 대표적인 경우가 **로그인 후 리다이렉트**다. `push`로 이동하면 사용자가 뒤로 가기를 눌렀을 때 로그인 페이지로 되돌아가 버린다.

경로를 문자열로 직접 쓰는 대신 `name`으로 지정하는 편이 낫다. URL 구조를 바꿔야 할 때 라우터 설정 한 곳만 고치면 되기 때문이다.

### Navigation Guard

특정 라우트로 진입하기 직전에 가로채 권한 검사나 리다이렉션을 수행한다.

| 훅 | 시점 | 용도 |
|---|---|---|
| `router.beforeEach` | 이동이 시작되기 직전 | **접근 권한 통제**, 비로그인 차단 |
| `router.beforeResolve` | 컴포넌트 분석까지 완료된 직후 | 최종 데이터 검증 |
| `router.afterEach` | 화면 전환이 완료된 후 | 로그 기록, 페이지 제목 변경 |

```js
router.beforeEach((to, from, next) => {
  const isAuthenticated = false   // 실제로는 토큰 검사

  if (to.meta.isAuth && !isAuthenticated) {
    alert('로그인이 필요한 서비스입니다.')
    next('/')     // 통과 불허, 홈으로 강제 이동
  } else {
    next()        // 통과 허가
  }
})
```

인자는 `to`(목적지), `from`(출발지), `next`(이동을 승인하는 종결 함수)다. **`next()`를 호출하지 않으면 화면 전환이 영원히 멈춘다.** 모든 분기에서 `next()`가 호출되는지 확인해야 한다.

`afterEach`는 이미 이동이 끝난 뒤라 막을 수는 없지만, **브라우저 탭 제목을 라우트마다 바꾸는** 용도로 쓰기 좋다.

```js
router.afterEach((to) => {
  document.title = to.meta.title ?? '실시간 날씨 대시보드'
})
```

### Catch-all Route

정의되지 않은 경로로 접속하면 Vue Router는 에러를 던지지 않고 **아무것도 렌더링하지 않는다.** 그 결과 화면이 하얗게 비어 보인다.

```js
const routes = [
  { path: '/', name: 'Home', component: HomeView },
  // ... 나머지 라우트 ...

  // 가독성을 위해 보통 맨 마지막에 배치
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFoundView,
  },
]
```

`/:pathMatch(.*)*`는 매칭되지 않은 모든 경로를 잡는 정규식 패턴이다. Vue Router 4는 matcher ranking을 사용하므로 배열 마지막이 동작의 필수조건은 아니지만, catch-all이라는 의미를 드러내기 위해 마지막에 두는 편이 읽기 쉽다.

## 과제

3일차 과제는 두 단계였다.

**컴포넌트 분리** — 기능 변경 없이 하나의 파일을 4개로 나누는 것이다.

| 파일 | 역할 |
|---|---|
| `WeatherParent.vue` | 모든 반응형 데이터 보유 |
| `BaseDashboardCard.vue` | `<slot>`으로 레이아웃만 제공 |
| `SearchBar.vue` | props로 검색어 표시, `update-query` emit |
| `WeatherCard.vue` | props로 도시 객체 표시, `select-card`·`click-detail` emit |

각 컴포넌트의 스타일은 `<style scoped>`로 분리한다. **기능은 그대로 두고 구조만 바꾸는 것**이 핵심이라, 리팩터링이 제대로 됐는지 확인하기 좋은 형태다.

**라우터 적용** — 여기서 화면이 여러 개로 늘어난다.

- 라우터에 Lazy Loading과 Catch-all Route 적용
- `App.vue`에 `<RouterLink>` 내비게이션 바와 `<RouterView>` 배치
- 상세보기 버튼의 `window.alert()`를 제거하고 `router.push('/weather/' + id)`로 교체
- `WeatherDetailView.vue`에서 `route.params.cityId`로 도시 데이터 선택

`window.alert()`를 라우터 이동으로 바꾸는 부분이 이 과정의 축소판이다. 2일차까지는 "클릭하면 알림창"이 최선이었지만, 이제는 **URL을 가진 진짜 상세 페이지**로 이동할 수 있다.

## 정리

3일차를 한 줄로 요약하면 **"화면을 부품으로 나누고, 부품과 화면을 정해진 통로로 연결한다"**다.

- 부모-자식은 독립적이고, 지역적인 Props/Emits 통신은 형제의 공통 부모를 거친다. 넓게 공유하는 상태에는 store 등의 통로를 쓸 수 있다
- **데이터는 Props로 아래로, 이벤트는 Emit으로 위로.** Props는 읽기 전용이다
- 배열·객체 props의 기본값은 instance마다 새 값을 반환하는 factory function으로 쓴다
- `onMounted`는 DOM 의존 초기화, `onUnmounted`는 타이머·리스너 정리. SPA에서 정리를 빠뜨리면 메모리 누수가 쌓인다
- Slot은 마크업 자체를 주입하며, **슬롯 콘텐츠는 부모 스코프에서 평가된다**
- 내부 client route는 `<RouterLink>`. 전체 새로고침은 메모리에만 있던 SPA 상태를 재생성한다
- 동적 세그먼트로 상세 페이지를 하나의 라우트로 처리하고, Lazy Loading으로 초기 번들을 줄인다
- Catch-all Route는 가독성을 위해 보통 맨 마지막에 둔다

이제 화면은 여러 개로 나뉘었지만, 화면을 넘나드는 데이터는 여전히 문제로 남아 있다. 홈 화면에서 추가한 지역을 상세 화면에서도 알아야 하고, 단위 설정(섭씨/화씨)은 모든 화면에서 같아야 한다. 4일차에서 Pinia로 전역 상태를 다루고, Axios로 서버 데이터를 가져온다.

---

이전 글: [2일차 — 이벤트, 폼 바인딩, Composition API](/posts/skala-vue-day2/)

시리즈 안내: [Frontend framework: Vue.js — 4일 학습 로드맵](/posts/skala-vue-roadmap/)

다음 글: [4일차 — Pinia, Axios, Element Plus](/posts/skala-vue-day4/)
