---
title: "[SKALA] Vue.js 2일차 — 이벤트, 폼 바인딩, Composition API"
date: 2026-08-03 09:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, vue, vue3, composition-api, v-model, ref, computed, watch]
description: "v-on 이벤트 처리와 수식어, v-model 양방향 바인딩의 내부 원리, 그리고 ref·reactive·computed·watch·watchEffect까지 Composition API의 반응성 도구를 정리한다."
permalink: /posts/skala-vue-day2/
---

1일차에는 데이터를 화면에 **보여주는** 방향만 다뤘다. 2일차는 반대 방향, 즉 **사용자 입력이 데이터를 바꾸는 경로**를 만들고, 그렇게 바뀐 데이터를 가공하고 감시하는 도구들을 배운다.

오늘의 핵심 질문은 두 개다. **"입력을 어떻게 데이터로 되돌려 받는가"**, 그리고 **"바뀐 데이터에 어떻게 반응할 것인가"**.

## v-on: 이벤트 처리

`v-on`은 DOM 요소에 이벤트 리스너를 연결한다. 축약형 `@`를 사실상 100% 사용한다.

```vue
<button v-on:click="doSomething">클릭</button>
<button @click="doSomething">클릭</button>
```

주요 이벤트는 직전 과정에서 다룬 DOM 이벤트와 같다.

| 이벤트 | 발생 시점 |
|---|---|
| `click` | 클릭할 때 |
| `submit` | 폼 제출 시 |
| `keyup` / `keydown` | 키를 뗄 때 / 누를 때 |
| `input` | 입력 필드가 바뀔 때마다 (실시간) |
| `change` | 값 변경 후 포커스가 빠질 때 |
| `mouseenter` / `mouseleave` | 마우스가 올라올 때 / 벗어날 때 |

### 인라인 핸들러와 메서드 핸들러

간단한 연산은 템플릿에서 바로 처리한다.

{% raw %}
```vue
<button @click="count++">클릭 수: {{ count }}</button>
```
{% endraw %}

복잡한 로직은 `<script setup>`에 함수를 만들어 연결한다.

```vue
<script setup>
const showAlert = () => {
  alert('함수가 호출되었습니다!')
}
</script>

<template>
  <button @click="showAlert">알림창 띄우기</button>
</template>
```

여기서 중요한 것은 **괄호 없이 함수 이름만 넘긴다**는 점이다. `@click="showAlert"`는 함수를 호출하는 게 아니라 **함수의 참조를 이벤트 리스너로 등록**한다. 순수 JavaScript로 쓰면 다음과 같다.

```js
button.addEventListener('click', showAlert)
```

`@click="showAlert()"`처럼 괄호를 붙이면 의미가 달라진다. 이 경우 Vue는 인라인 표현식으로 해석해 클릭할 때마다 그 표현식을 평가한다. 인자를 넘길 때는 이 형태가 필요하지만, 인자가 없다면 괄호 없이 쓰는 것이 맞다.

### 이벤트 객체 다루기

브라우저가 자동으로 생성하는 이벤트 객체를 받는 패턴은 두 가지다.

```vue
<script setup>
// 1) 함수 이름만 넘기면 첫 번째 인자로 이벤트 객체가 묵시적으로 전달됨
const getOnlyEvent = (e) => {
  position.value = `좌표: X=${e.clientX}, Y=${e.clientY}`
}

// 2) 인자를 함께 넘길 때는 $event를 명시적으로 적어야 함
const getWithParam = (name, e) => {
  tagName.value = `대상: ${name} / 클릭된 태그: ${e.target.tagName}`
}
</script>

<template>
  <button @click="getOnlyEvent">클릭 좌표 알아내기</button>
  <button @click="getWithParam('회원A', $event)">회원 정보와 태그 확인</button>
</template>
```

`$event`는 Vue가 제공하는 특수 기호다. 인자를 하나라도 직접 넘기는 순간 묵시적 전달이 사라지므로, 이벤트 객체가 필요하면 반드시 명시해야 한다.

자주 쓰는 이벤트 객체 속성은 다음과 같다.

| 속성 | 설명 |
|---|---|
| `e.target` | 이벤트를 **발생시킨** 태그. `e.target.value`로 입력값을 읽음 |
| `e.currentTarget` | 이벤트 리스너가 **걸려 있는** 태그 |
| `e.type` | 이벤트 종류 (`click`, `keyup` 등) |
| `e.key` | 누른 키의 문자 값 (`Enter`, `Escape`, `a`) |
| `e.code` | 물리적 자판 위치 (`KeyA`, `Digit1`) |
| `e.shiftKey` / `e.ctrlKey` / `e.altKey` | 조합 키를 함께 눌렀는지 |
| `e.clientX` / `e.clientY` | 뷰포트 기준 마우스 좌표 |

부모 요소에 이벤트를 걸었을 때 `e.target`과 `e.currentTarget`이 달라진다. 이벤트 위임을 구현할 때 이 차이가 핵심이 된다.

### 이벤트 수식어

Vue가 제공하는 편의 문법으로, 이벤트 리스너의 기본 동작을 제어한다.

```vue
<!-- 링크 이동을 막고 함수만 실행 -->
<a href="https://www.naver.com" @click.prevent="handleLink">네이버 링크</a>

<!-- 부모로 이벤트가 전파되는 것을 차단 -->
<div @click="handleBox">
  <button @click="alert('1번')">버블링 발생</button>
  <button @click.stop="alert('2번')">버블링 차단</button>
</div>
```

| 수식어 | 매핑되는 JavaScript | 활용처 |
|---|---|---|
| `.prevent` | `e.preventDefault()` | 폼 제출 시 새로고침 방지, 링크 이동 방지 |
| `.stop` | `e.stopPropagation()` | 자식 클릭이 부모로 전파되는 것 차단 |
| `.once` | 최초 1회 후 리스너 제거 | 중복 제출 방지 |
| `.self` | `e.target === e.currentTarget` | 배경막을 **직접** 클릭했을 때만 모달 닫기 |
| `.capture` | 캡처링 단계에서 감지 | 부모가 자식보다 먼저 반응 |
| `.passive` | 스크롤 성능 최적화 | 모바일 터치·스크롤 |

키보드·시스템·마우스 수식어도 있다.

```vue
<input @keyup.enter="submit" />           <!-- Enter 키 -->
<div @keyup.esc="closeModal" />           <!-- Escape 키 -->
<button @click.ctrl.exact="specialAction" /> <!-- 오직 Ctrl만 눌렀을 때 -->
<div @click.right="showContextMenu" />    <!-- 우클릭 -->
```

| 분류 | 수식어 |
|---|---|
| 키보드 | `.enter`, `.tab`, `.delete`, `.esc`, `.space`, `.up`, `.down`, `.left`, `.right` |
| 시스템 | `.ctrl`, `.alt`, `.shift`, `.meta`, `.exact` |
| 마우스 | `.left`, `.right`, `.middle` |

`.exact`가 유용한 경우가 있다. `@click.ctrl`은 Ctrl과 함께 다른 키를 눌러도 발동하지만, `@click.ctrl.exact`는 **오직 Ctrl만** 눌렸을 때 발동한다.

이 수식어들의 실질적 이점은 **템플릿만 보고 동작을 파악할 수 있다**는 것이다. 순수 JavaScript였다면 핸들러 함수 안을 열어 `e.preventDefault()`가 있는지 확인해야 했다.

## v-model: 양방향 바인딩

`v-model`은 입력 요소의 값과 반응형 데이터를 묶어, 한쪽이 바뀌면 다른 쪽도 함께 바뀌게 한다.

{% raw %}
```vue
<script setup>
import { ref } from 'vue'
const text = ref('')
</script>

<template>
  <input type="text" v-model="text" />
  <p>입력된 값: {{ text }}</p>
</template>
```
{% endraw %}

### 내부 원리

`v-model`은 마법이 아니라 **`v-bind`와 `v-on`의 조합에 대한 문법 설탕(Syntactic Sugar)**이다.

```vue
<!-- v-model 축약 문법 -->
<input type="text" v-model="text1" />

<!-- 위와 동일한 동작 -->
<input type="text" :value="text2" @input="(e) => (text2 = e.target.value)" />
```

아래 형태를 이해하는 것이 중요한 이유는, 3일차에서 다룰 **컴포넌트 간 데이터 전달** 때문이다. 자식 컴포넌트는 부모에게 받은 props를 직접 수정할 수 없으므로, `:value`로 값을 받고 `@input`(또는 커스텀 이벤트)으로 변경을 알리는 이 분리된 형태를 직접 쓰게 된다.

### 폼 요소별 매핑 규칙

`v-model`에 연결하는 `ref`의 **초기값 타입**을 요소의 성격에 맞춰야 한다.

| 폼 요소 | 초기값 타입 | 담기는 값 |
|---|---|---|
| `textarea` | `ref('')` | 줄바꿈 포함 텍스트 |
| `checkbox` (단일) | `ref(false)` | 체크 시 `true` |
| `checkbox` (다중) | **`ref([])`** | 체크된 항목의 `value`가 배열에 누적 |
| `radio` | `ref('')` | 선택한 하나의 `value` |
| `select` | `ref('')` | 선택한 `<option>`의 `value` |

```vue
<script setup>
import { ref } from 'vue'

const comment = ref('')
const isAgreed = ref(false)          // 단일 체크박스는 Boolean
const favoriteFruits = ref([])       // 다중 체크박스는 반드시 배열
const gender = ref('')
const selectedCar = ref('')
</script>

<template>
  <textarea v-model="comment"></textarea>

  <label><input type="checkbox" v-model="isAgreed" /> 약관 동의</label>

  <label><input type="checkbox" value="사과" v-model="favoriteFruits" /> 사과</label>
  <label><input type="checkbox" value="바나나" v-model="favoriteFruits" /> 바나나</label>

  <label><input type="radio" value="남성" v-model="gender" /> 남성</label>
  <label><input type="radio" value="여성" v-model="gender" /> 여성</label>

  <select v-model="selectedCar">
    <option value="">-- 선택하세요 --</option>
    <option value="tesla">테슬라</option>
  </select>
</template>
```

다중 체크박스에 `ref('')`를 주면 예상과 다르게 동작한다. **초기값 타입이 곧 동작 방식을 결정**하므로, 배열로 시작해야 여러 값이 누적된다.

내부 이벤트도 요소에 따라 다르다.

- 텍스트 입력(`input`, `textarea`)은 타이핑마다 반응하는 **`@input`** 기반
- 선택형(`checkbox`, `radio`, `select`)은 값이 확정되는 **`@change`** 기반

### v-model 수식어

| 수식어 | 동작 | 목적 |
|---|---|---|
| `.lazy` | `@input` → `@change`로 전환 | 불필요한 실시간 갱신·API 요청 방지 |
| `.number` | String → Number 자동 형변환 | 숫자 입력 처리 |
| `.trim` | 양끝 공백 제거 | 공백으로 인한 검증 오류 예방 |

```vue
<input v-model.lazy="lazyText" />          <!-- 포커스 아웃/Enter 시 반영 -->
<input v-model.number="age" />             <!-- typeof age === 'number' -->
<input v-model.trim="userEmail" />         <!-- 앞뒤 공백 제거 -->
<input v-model.trim.number="price" />      <!-- 체이닝 가능 -->
```

`.number`가 필요한 이유는 **HTML 입력값이 항상 문자열이기 때문**이다. `<input type="number">`를 써도 JavaScript로 넘어오는 값은 문자열이다. 이 상태로 계산하면 `"5" + 3`이 `"53"`이 되는 문제가 그대로 재현된다.

`.lazy`는 실무에서 생각보다 유용하다. 검색어를 입력할 때마다 API를 호출하면 글자 수만큼 요청이 나가는데, `.lazy`를 쓰면 확정 시점에만 반영된다.

## Composition API

여기서부터가 오늘의 후반부다. Vue 3에서 컴포넌트 로직을 작성하는 표준 방식이며, `<script setup>` 안에 작성한다.

Vue가 제공하는 내장 함수는 카테고리별로 다음과 같다.

| 카테고리 | 주요 함수 |
|---|---|
| 애플리케이션 | `createApp`, `app.use()`, `app.config.*` |
| 반응형 상태 | `ref`, `reactive`, `readonly`, `toRef`, `toRefs`, `unref`, `toRaw`, `isRef` |
| 계산 및 감시 | **`computed`, `watch`, `watchEffect`** |
| 라이프사이클 훅 | `onMounted`, `onUpdated`, `onUnmounted` 등 (3일차) |
| 컴포넌트 구성 | `defineProps`, `defineEmits`, `defineExpose`, `useSlots` (3일차) |
| 의존성 주입 | `provide`, `inject` (3일차) |

오늘은 반응형 상태와 계산·감시를 다룬다.

### ref와 reactive

```vue
<script setup>
import { ref, reactive } from 'vue'

// ref: 원시 타입, 객체, 배열 모두 가능
const count = ref(0)
const items = ref(['사과', '배'])
const user = ref({ name: '이순신', age: 30 })

// reactive: 객체, 배열, Map, Set만 가능 (원시 타입 불가)
const state = reactive({ productName: '노트북', price: 1000 })
</script>
```

| | `ref` | `reactive` |
|---|---|---|
| 대상 | 원시 타입 + 참조 타입 **모두** | 참조 타입(객체·배열·Map·Set)**만** |
| script 접근 | **`.value` 필요** | `.value` 없이 직접 |
| template 접근 | `.value` 없이 | `.value` 없이 |
| 재할당 | 가능 (`count.value = 5`) | **반응성이 끊어짐** |

### reactive의 반응성 단절

`reactive`에는 함정이 있다.

```js
let state = reactive({ count: 0 })

state = { count: 5 }   // 반응성 연결이 끊어짐
state.count = 5        // 내부 속성만 변경해야 함
```

`reactive`가 반환하는 것은 원본 객체를 감싼 **Proxy**다. 변수에 새 객체를 통째로 할당하면 그 Proxy와의 연결이 끊어지고, 이후 변경은 Vue가 추적하지 못한다. 배열도 마찬가지여서 `items = ['a','b']`처럼 재할당하면 반응성이 깨지고, `push`/`splice`로 조작해야 한다.

**그래서 현업에서는 객체와 배열도 `ref`로 통일하는 추세가 강하다.** `ref`는 `.value`를 통째로 교체해도 반응성이 유지되기 때문이다.

```js
const items = ref([])
items.value = await fetchItems()   // 통째로 교체해도 안전
```

API 응답을 받아 상태를 통째로 갈아 끼우는 일이 잦은 실무에서는 이 차이가 결정적이다. `.value`를 매번 붙이는 번거로움을 감수할 만한 이유가 있다.

### computed

의존하는 반응형 데이터가 바뀔 때 자동으로 다시 계산되며, **결과가 캐싱된다.**

{% raw %}
```vue
<script setup>
import { ref, computed } from 'vue'

const count = ref(0)
const dummy = ref(0)

// 일반 함수: 리렌더링될 때마다 무조건 재실행
const getMethodResult = () => {
  console.log('일반 함수 실행됨')
  return count.value * 2
}

// computed: count가 바뀔 때만 재연산
const doubleCount = computed(() => {
  console.log('Computed 연산 실행됨')
  return count.value * 2
})
</script>

<template>
  <p>일반 함수: {{ getMethodResult() }}</p>
  <p>Computed: {{ doubleCount }}</p>
  <button @click="count++">count 증가 (의존성)</button>
  <button @click="dummy++">dummy 증가 (무관)</button>
</template>
```
{% endraw %}

`dummy` 버튼을 누르면 차이가 드러난다.

- **일반 함수 로그만 찍힌다.** `computed`는 재연산하지 않고 캐싱된 이전 결과를 재사용한다

이유는 Vue의 리렌더링 동작에 있다. 반응형 데이터가 바뀌면 Vue는 `<template>` 안의 **모든 표현식을 처음부터 끝까지 다시 평가**한다. 따라서 {% raw %}`{{ getMethodResult() }}`{% endraw %}처럼 괄호를 붙여 직접 호출한 함수는 관련 없는 변경에도 매번 실행된다. `computed`는 자신이 실제로 의존하는 데이터를 추적해, 그것이 바뀌었을 때만 다시 계산한다.

**목록 필터링이나 합계 계산처럼 비용이 있는 연산은 반드시 `computed`로 감싸야 한다.** 또한 `computed`는 기본적으로 읽기 전용이라 다른 값으로 재할당할 수 없다.

> `<script>` 안에서 `computed` 결과를 읽을 때는 `doubleCount.value`로 접근한다. `ref`와 동일하게 Ref 객체를 반환하기 때문이다.
{: .prompt-tip }

### watch

값이 바뀌었을 때 **후속 작업**(API 호출, 저장 등)을 수행한다. `computed`가 "값을 만드는" 도구라면 `watch`는 "일을 시키는" 도구다.

```vue
<script setup>
import { ref, watch } from 'vue'

const currentCity = ref('서울')

watch(currentCity, (newValue, oldValue) => {
  console.log(`${oldValue}에서 ${newValue}로 변경됨`)
  // 실무: 도시가 바뀌면 해당 지역 날씨 API를 다시 조회
})
</script>
```

콜백은 **새 값과 이전 값**을 순서대로 받는다.

**여러 데이터 동시 감시**는 배열로 묶는다. 첫 인자의 순서대로 콜백 인자 배열의 순서가 대응한다.

```js
watch([city, dateType], ([newCity, newDate], [oldCity, oldDate]) => {
  // 둘 중 하나라도 바뀌면 발동 → 통합 API 요청
})
```

#### 객체를 감시할 때의 함정

이것이 `watch`에서 가장 많이 하는 실수다.

```js
const user = ref({ name: '홍길동', age: 20 })

// 절대 발동하지 않음
watch(user, () => { console.log('이 로그는 안 찍힌다') })
```

`watch`는 **참조값(주소)만 추적**한다. `user.value.age++`를 해도 객체의 주소는 그대로이므로 변경을 감지하지 못한다. 해결책은 두 가지다.

```js
// 해결책 1: deep 옵션으로 내부 전체 감시
watch(user, (newVal) => {
  console.log(`변경됨: ${newVal.name}, ${newVal.age}`)
}, { deep: true })

// 해결책 2: 화살표 함수로 특정 속성만 지정 (이전 값 추적 가능)
watch(() => user.value.age, (newAge, oldAge) => {
  console.log(`나이가 ${oldAge} → ${newAge}로 변경됨`)
})
```

**`deep: true`에는 대가가 있다.** `newValue`와 `oldValue`가 **똑같은 최신 값으로 나온다.** 둘 다 같은 객체를 가리키고 있어서 과거 값을 추적할 수 없다.

이전 값이 필요하다면 **해결책 2**를 써야 한다. `() => user.value.age`처럼 원시값을 반환하는 getter로 감시하면 이전 값이 정상적으로 보존된다.

`reactive` 객체도 비슷하다. 변수명 그대로 감시하면 `deep`이 자동으로 켜지지만, 역시 이전 값을 알 수 없다.

```js
const state = reactive({ productName: '노트북', price: 1000 })

watch(state, (newVal, oldVal) => {
  // oldVal.price와 newVal.price가 똑같이 나온다
})

watch(() => state.price, (newPrice, oldPrice) => {
  // 이전 가격이 정상 보존된다
})
```

정리하면 **"이전 값이 필요하면 getter로 좁혀서 감시한다"**가 규칙이다.

### watchEffect

감시 대상을 명시하지 않아도 **내부에서 접근한 반응형 데이터를 자동으로 추적**한다.

```vue
<script setup>
import { ref, watchEffect } from 'vue'

const username = ref('홍길동')
const age = ref(20)

watchEffect(() => {
  // Vue가 username과 age를 자동으로 감시 목록에 등록
  console.log(`이름: ${username.value} / 나이: ${age.value}`)
})
</script>
```

`watch`와의 차이는 셋이다.

| | `watch` | `watchEffect` |
|---|---|---|
| 감시 대상 | **명시적으로 지정** | 내부에서 접근한 것을 **자동 추적** |
| 최초 실행 | 하지 않음 (값이 바뀔 때부터) | **컴포넌트 생성 시 즉시 1회 실행** |
| 이전 값 | 제공 | **제공하지 않음** |

"새로고침하자마자 버튼을 안 눌러도 로그가 이미 찍혀 있는" 것이 `watchEffect`의 특징이다. 초기 데이터 로딩처럼 **처음 한 번도 실행되어야 하는 작업**에 적합하다.

`watchEffect`의 콜백은 **정리 함수(cleanup)**를 등록할 수 있다. 다음 실행이 시작되기 직전이나 컴포넌트가 사라질 때 호출된다.

```js
watchEffect((onCleanup) => {
  const timer = setTimeout(() => fetchSuggestions(query.value), 300)
  onCleanup(() => clearTimeout(timer))
})
```

검색어가 바뀔 때마다 이전 타이머를 취소하는 **디바운스**가 이 구조로 만들어진다. 타이머 대신 `AbortController`를 정리하면 진행 중이던 이전 API 요청을 취소할 수도 있다. 이 패턴은 종합과제에서 자동완성을 구현할 때 실제로 사용했다.

감시자 실행 타이밍을 제어하는 변형도 있다.

| 함수 | 차이 |
|---|---|
| `watchPostEffect` | DOM 업데이트가 **완료된 후** 콜백 실행 |
| `watchSyncEffect` | 데이터 변경 즉시 **동기적으로** 실행 |

### computed와 watch, 무엇을 쓸 것인가

세 도구의 역할이 겹쳐 보이지만 기준은 명확하다.

```text
새로운 값을 만들어야 한다        → computed
값이 바뀌면 어떤 일을 해야 한다   → watch
여러 값에 반응하고 초기 실행도 필요 → watchEffect
```

목록을 필터링한 결과가 필요하면 `computed`이고, 필터가 바뀔 때 서버에 재조회를 요청해야 하면 `watch`다. **`watch` 안에서 다른 `ref`에 값을 대입해 파생 데이터를 만드는 코드는 대부분 `computed`로 바꿀 수 있다.**

### 함수 정의 방식

강의에서 짚은 부분인데, `<script setup>` 안에서 함수를 정의하는 세 방식은 호이스팅 동작이 다르다.

| 방식 | 문법 | 호이스팅 | 실무 |
|---|---|---|---|
| 함수 선언문 | `function fn() {}` | 작동 (선언 전 호출 가능) | 가끔 |
| 함수 표현식 | `const fn = function() {}` | 작동 안 함 | 거의 안 씀 |
| **화살표 함수** | `const fn = () => {}` | 작동 안 함 | **표준** |

화살표 함수가 표준인 이유는 간결함뿐만이 아니다. 직전 과정에서 정리했듯 화살표 함수는 **선언된 위치의 `this`를 그대로 사용**하므로, 콜백 안에서 `this`가 엉뚱한 것을 가리키는 문제가 없다. Composition API에서는 `this`를 쓸 일 자체가 거의 없지만, 일관성 측면에서 화살표 함수로 통일하는 편이 낫다.

## 과제: 날씨 목록 필터링

2일차 과제는 1일차의 날씨 목록에 **검색과 감시**를 붙이는 것이었다.

요구사항을 Composition API 도구로 옮기면 다음과 같이 대응된다.

| 요구사항 | 사용할 도구 |
|---|---|
| 검색어, 선택된 도시, 날씨 배열을 상태로 정의 | `ref` |
| 검색어가 포함된 항목만 필터링한 배열 | **`computed`** |
| 선택된 도시가 바뀔 때 콘솔 로그 | **`watch`** |
| 검색어를 타이핑할 때마다 추적 | **`watchEffect`** |
| 검색 결과가 없을 때 안내 문구 | `v-if` / `v-else` |

필터링을 `computed`로 만드는 것이 핵심이다.

```js
const filteredWeatherList = computed(() =>
  weatherList.value.filter((city) => city.name.includes(searchQuery.value)),
)
```

이렇게 두면 검색어가 바뀔 때만 필터링이 다시 돌고, 무관한 상태가 바뀔 때는 캐싱된 결과가 재사용된다. 만약 이 로직을 템플릿에서 {% raw %}`{{ getFiltered() }}`{% endraw %}처럼 함수로 호출했다면 모든 리렌더링마다 전체 배열을 다시 순회했을 것이다.

## 정리

2일차를 한 줄로 요약하면 **"입력을 상태로 받고, 상태의 변화에 반응한다"**다.

- `@`(`v-on`)로 이벤트를 연결하고, 괄호 없이 넘기면 함수 **참조**가 등록된다
- 이벤트 수식어(`.prevent`, `.stop`, `.enter`)는 템플릿만 보고 동작을 파악하게 해준다
- `v-model`은 `:value` + `@input`의 문법 설탕이다. 이 내부 구조는 3일차 컴포넌트 통신에서 다시 등장한다
- 폼 요소의 성격에 맞는 초기값 타입을 줘야 한다. 다중 체크박스는 반드시 배열
- `reactive`는 재할당 시 반응성이 끊어진다. **객체·배열도 `ref`로 통일**하는 편이 안전하다
- `computed`는 캐싱된다. 템플릿에서 함수를 직접 호출하면 매 리렌더링마다 재실행된다
- `watch`로 객체를 감시하려면 `deep: true`가 필요하지만, 그러면 이전 값을 잃는다. **이전 값이 필요하면 getter로 좁힌다**
- `watchEffect`는 자동 추적 + 즉시 실행이며, 정리 함수로 디바운스와 요청 취소를 구현할 수 있다

지금까지는 모든 코드가 하나의 컴포넌트 안에 있었다. 화면이 커지면 이 파일은 감당할 수 없게 된다. 3일차에서는 화면을 컴포넌트로 나누고, 나뉜 컴포넌트 사이에 데이터를 주고받는 방법, 그리고 여러 화면을 URL로 연결하는 라우터를 다룬다.

---

이전 글: [1일차 — SPA와 선언적 렌더링](/posts/skala-vue-day1/)

시리즈 안내: [Frontend framework: Vue.js — 4일 학습 로드맵](/posts/skala-vue-roadmap/)

다음 글: [3일차 — Component와 Vue Router](/posts/skala-vue-day3/)
