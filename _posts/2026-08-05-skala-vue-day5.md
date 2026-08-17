---
title: "[SKALA] Vue.js 빌드와 배포 — Modern JavaScript, ESLint, Vite"
date: 2026-08-05 14:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, vue, vue3, javascript, es6, vite, eslint, prettier, build, deploy]
description: "ES6 이후의 Modern JavaScript 문법을 정리하고, ESLint·Prettier로 코드 품질을 고정한 뒤 Vite 환경 변수와 번들링을 거쳐 정적 파일을 배포하기까지를 정리한다."
permalink: /posts/skala-vue-day5/
---

여기까지 왔으면 기능은 대부분 갖춰졌다. 데이터를 화면에 그리고, 입력을 받고, 컴포넌트로 나누고, 라우터로 연결하고, 전역 상태를 두고, 서버에서 데이터를 가져온다.

이 파트는 성격이 다르다. 새 기능을 배우는 시간이 아니라 **지금까지 쓴 코드를 다시 보는 날**이다.

- 4일 동안 아무 설명 없이 써 온 `=>`, `${}`, `...`, `?.`은 정확히 무엇인가 — **Modern JavaScript**
- 그 코드가 문법적으로·형식적으로 일관적인가 — **ESLint / Prettier**
- 그리고 이 코드를 어떻게 **남의 브라우저에서 돌아가게** 만드는가 — **Vite 빌드와 배포**

`npm run dev`로 뜨는 `localhost:5173`은 내 컴퓨터에서만 존재한다. 마지막 관문은 그 결과물을 브라우저가 읽을 수 있는 파일로 바꿔 인터넷에 올리는 일이다.

## Modern JavaScript

### ECMAScript는 왜 이렇게 됐나

JavaScript의 표준 규격 이름이 ECMAScript(ES)다. 이름이 둘인 이유는 역사에 있다.

| 세대 | 시기 | 무슨 일이 있었나 |
|---|---|---|
| 1세대 | 1995~1999 | Netscape가 JavaScript를 만들고, MS가 유사품 JScript를 넣자 브라우저마다 동작이 갈렸다. ECMA가 **표준 규격(ECMAScript)** 을 정의 |
| 2세대 | 2000~2008 | IE 독점으로 표준화(ES4)가 무산. JavaScript는 "팝업 띄우는 스크립트" 취급. **jQuery**가 크로스 브라우징을 해결하며 시장 지배 |
| 3세대 | 2009~2014 | Chrome의 **V8 엔진**과 **Node.js** 등장으로 서버에서도 실행 가능해짐. **ES5** 표준 정착 (`'use strict'`, `forEach`/`map`/`filter`) |
| 4세대 | 2015~ | **ES6(ES2015)** 대규모 개편. 이후 매년 소규모 업데이트. 이 시기 이후를 통칭 **Modern JavaScript** |

핵심은 **ES6가 분기점**이라는 것이다. Vue 3의 Composition API, Pinia, Axios는 전부 ES6 이후 문법을 전제로 쓰여 있다. 지난 4일 동안 쓴 코드를 다시 보면 화살표 함수, 구조 분해, 템플릿 리터럴, `async/await`가 빠짐없이 들어 있다.

### 브라우저 지원과 Babel·Polyfill

최신 문법을 쓰면 구형 브라우저에서 깨지지 않을까? 이 걱정은 도구 체인이 이미 해결해 두었다.

- **ES6(2015)~ES11(2020)**: `let`/`const`, 화살표 함수, Promise, `async/await`, 옵셔널 체이닝(`?.`) 등은 데스크톱·모바일 가리지 않고 **100% 네이티브 지원**
- **ES12(2021)~ES15(2024)**: `replaceAll()`, 논리 할당(`&&=`, `||=`), `toReversed()` 등도 모던 브라우저 기준 **96% 이상**

지원되지 않는 부분은 두 기술이 메운다.

| 기술 | 하는 일 |
|---|---|
| **Babel** | 최신 **문법(Syntax)** 을 구형 브라우저가 이해하는 ES5 문법으로 **번역**한다. 화살표 함수를 `function`으로 바꾸는 식 |
| **Polyfill** | 엔진에 **아예 없는 객체·메서드**(`Promise`, `Array.prototype.includes`)를 JavaScript로 직접 구현해 **채워 넣는다** |

문법을 번역하는 것과 없는 기능을 구현해 주는 것은 다른 문제다. 화살표 함수는 `function`으로 바꿔 쓸 수 있지만, `Promise`가 없는 엔진에 `Promise`를 "번역"할 수는 없다. 그래서 둘 다 필요하다.

> Vite 내부에 이 변환 엔진이 기본 내장되어 있다. 그래서 이 과정 내내 브라우저 호환성을 한 번도 신경 쓰지 않고 최신 문법으로 코딩할 수 있었던 것이다.
{: .prompt-info }

### let, const, var

```js
var name = '철수'
var name = '영희'   // 재선언이 통과된다 — 버그의 원인
```

| 특성 | `var` | `let` | `const` |
|---|---|---|---|
| 스코프 | **함수** 레벨 | 블록(`{}`) 레벨 | 블록(`{}`) 레벨 |
| 재선언 | 가능 | 불가 | 불가 |
| 재할당 | 가능 | 가능 | **불가** |
| 호이스팅 | 발생 (`undefined`로 초기화) | 발생 (TDZ로 에러) | 발생 (TDZ로 에러) |

`var`의 진짜 문제는 재선언이 **조용히 통과**한다는 점이다. 300줄짜리 파일 위쪽에 선언한 변수를 아래쪽에서 같은 이름으로 다시 선언해도 에러가 나지 않고 값만 덮인다.

호이스팅 차이도 중요하다. 셋 다 호이스팅은 일어나지만 결과가 다르다.

```js
console.log(a)   // undefined — 에러가 아니라서 더 위험하다
var a = 1

console.log(b)   // ReferenceError: Cannot access 'b' before initialization
let b = 1
```

`let`/`const`도 선언은 끌어올려지지만 초기화 전까지는 **TDZ(Temporal Dead Zone)** 에 갇혀 접근하면 에러가 난다. `var`처럼 `undefined`가 슬쩍 나오는 것보다 에러가 나는 편이 낫다. 문제를 나중이 아니라 그 자리에서 알려주기 때문이다.

**기본은 `const`, 재할당이 필요할 때만 `let`, `var`는 쓰지 않는다.**

> `const`는 **재할당**을 막을 뿐 **내용 변경**을 막지 않는다. `const arr = [1,2]` 에서 `arr.push(3)`은 통과하고 `arr = []`만 에러다. 2일차에서 `ref`는 `.value` 재할당이 필요해 `let`처럼 보이지만 `const`로 선언하는 이유가 이것이다.
{: .prompt-warning }

### 화살표 함수

| 항목 | 함수 선언문 | 함수 표현식 | 화살표 함수 |
|---|---|---|---|
| 문법 | `function foo() {}` | `const foo = function() {}` | `const foo = () => {}` |
| 호이스팅 | **함수 전체** (선언 전 호출 가능) | 변수만 (초기화 전 호출 시 에러) | 변수만 (초기화 전 호출 시 에러) |
| 주 용도 | 전역·유틸리티 함수 | 클로저, 콜백 | **Vue/React, 비동기 콜백** |

축약 규칙은 셋이다.

```js
// 1. 본문이 한 줄이면 return 생략
const sum = (a, b) => a + b

// 2. 매개변수가 하나면 괄호 생략
const pow = (x) => x * x

// 3. 함수를 인자로 전달
const calculate = (a, b, operation) => operation(a, b)
calculate(10, 5, (a, b) => a + b)     // 15
calculate(10, 5, (a, b) => a * b)     // 50
```

세 번째가 Vue에서 계속 쓰인 형태다. `@click="() => remove(item.id)"`, `computed(() => ...)`, `watch(x, () => ...)` 는 전부 "함수를 값으로 넘기는" 구조다.

> 객체 리터럴을 바로 반환할 때는 괄호가 필요하다. `() => { name: 'a' }` 는 중괄호를 **함수 본문**으로 해석해 `undefined`를 반환한다. `() => ({ name: 'a' })` 로 감싼다.
{: .prompt-warning }

### 템플릿 리터럴

백틱(`` ` ``)으로 감싼 문자열이다. 두 가지를 해결한다.

```js
const city = '수원'
const temp = 24

// 기존
const message = '현재 ' + city + '의 기온은 ' + temp + '도입니다.'

// 템플릿 리터럴
const message = `현재 ${city}의 기온은 ${temp}도입니다.`
```

`${}` 안에는 변수뿐 아니라 **연산식**도 들어간다. `${temp > 30 ? '더움' : '보통'}` 처럼 쓸 수 있다.

두 번째는 줄바꿈이다. 백틱 안에서는 Enter를 친 그대로 개행이 보존되어 `\n`을 붙여 이어 붙일 필요가 없다.

```js
const html = `
  <div>
    <h1>Hello</h1>
  </div>
`
```

4일차의 Axios 인터셉터에서 쓴 `` config.headers.Authorization = `Bearer ${token}` `` 이 정확히 이 문법이다.

### 구조 분해 할당

객체와 배열의 내부 값을 개별 변수로 꺼내는 문법이다. 꺼내는 기준이 다르다.

```js
// 객체 — key 이름으로 매칭. 순서는 무관
const user = { name: '홍길동', age: 20, role: 'admin' }
const { name, age } = user

// 배열 — 인덱스 순서로 매칭. 이름은 무관
const coords = [37.5, 127.0]
const [latitude, longitude] = coords

// 특정 위치 건너뛰기
const [first, , third] = ['red', 'green', 'blue']   // 'red', 'blue'
```

**객체는 이름으로, 배열은 순서로.** 이 차이가 헷갈리면 Composition API에서 바로 걸린다.

```js
// ref는 하나의 값 → 그냥 받는다
const count = ref(0)

// storeToRefs는 객체를 반환 → 이름으로 꺼낸다
const { count, doubleCount } = storeToRefs(counterStore)
```

4일차에서 본 `storeToRefs`가 필요했던 이유도 여기 있다. 구조 분해는 **그 시점의 값을 꺼내 새 변수에 담는** 동작이라 Proxy와의 연결이 끊긴다. 문법 자체의 성질이지 Pinia의 특수한 제약이 아니다.

### Spread와 Rest

기호는 똑같이 `...`인데 역할이 반대다. **펼치면 Spread, 모으면 Rest.**

**Spread — 펼친다**

```js
// 배열 병합
const fullStack = [...frontEnd, ...backEnd, 'Git']

// 얕은 복사
const cloneWrong = original       // 주소만 복사 — 복사본을 고치면 원본도 바뀐다
const cloneRight = [...original]  // 독립된 새 배열

// 객체 복사 + 일부 덮어쓰기
const newConfig = {
  ...baseConfig,
  version: 2.0,        // 같은 key가 뒤에 오면 앞을 덮는다
  author: 'Graves',
}

// 함수 인수 전개
sum(...numbers)        // sum(1, 2, 3)
```

**Rest — 모은다**

```js
// 나머지 속성을 한 객체로
const { name, age, ...restInfo } = employee
// restInfo === { role: 'Instructor', team: 'Edu-Tech', location: 'Seoul' }

// 나머지 매개변수를 한 배열로
const printMedals = (gold, silver, ...others) => { /* others는 배열 */ }
```

구분하는 기준은 간단하다. **`=`의 오른쪽(값을 만드는 자리)이면 Spread, 왼쪽(값을 받는 자리)이면 Rest다.**

Spread가 실제로 중요한 이유는 **불변성**이다. 배열의 `push`, `sort`, `reverse`는 원본을 직접 바꾼다. 원본을 바꾸면 "언제 누가 바꿨는지" 추적이 어려워지고, 반응형 시스템에서는 의도치 않은 갱신이 연쇄된다.

```js
// 원본을 바꾸지 않고 새 배열을 만든다
cityList.value = [...cityList.value, newCity]
```

### Promise와 async/await

비동기 연산의 완료·실패를 나타내는 표준 객체가 `Promise`다. ES6 이전에는 콜백 함수를 인자로 넘겼고, 중첩이 깊어지면 **콜백 지옥**이 됐다.

Promise는 세 가지 상태를 갖는다.

| 상태 | 의미 |
|---|---|
| **Pending** (대기) | 시작했지만 아직 성공도 실패도 아님 |
| **Fulfilled** (이행) | 성공, 결과값이 있음 |
| **Rejected** (거부) | 실패, 이유(에러)가 있음 |

```js
fetchWeatherData()
  .then((data) => console.log('성공:', data))     // Fulfilled
  .catch((error) => console.error('실패:', error)) // Rejected
  .finally(() => console.log('종료'))              // 성공/실패 무관
```

ES8(2017)의 `async/await`는 이 Promise를 **동기 코드처럼 위에서 아래로** 쓰게 해 준다.

```js
async function handleData() {
  try {
    const result = await fetchData()
    const saved = await saveToDatabase(result)   // 앞이 끝나야 실행된다
    console.log('저장 성공!', saved)
  } catch (error) {
    console.log('에러 발생!', error)
  }
}
```

두 키워드의 규칙은 짧다.

- **`async` 함수는 항상 Promise를 반환한다.** 일반 값을 `return`해도 `Promise.resolve(값)`으로 감싸진다
- **`await`는 `async` 함수 안에서만 쓸 수 있다**
- `.then/.catch`는 `try/catch`로 대체된다

4일차의 Axios 호출을 `try / catch / finally`로 감쌌던 구조가 바로 이것이다. `.then()` 방식과 실행 순서가 어떻게 갈리는지는 직전 과정의 [Event Loop 정리](/posts/skala-frontend-day2/)와 이어진다.

> `await`가 **연달아** 있으면 순차 실행이라 느리다. 서로 의존하지 않는 요청이라면 `Promise.all([a(), b()])`로 동시에 보내야 한다. 지역 5개의 날씨를 하나씩 `await`하면 5배 느려진다.
{: .prompt-tip }

### 배열 메서드

ES6 이후 추가된 것 중 실제로 자주 쓰는 것들이다.

| 버전 | 메서드 | 하는 일 |
|---|---|---|
| ES6 | `Array.from()` | 유사 배열(`arguments`, `NodeList`)을 진짜 배열로 변환 |
| ES6 | `find()` | 조건을 만족하는 **첫 요소 자체**를 반환 (없으면 `undefined`) |
| ES6 | `findIndex()` | 조건을 만족하는 **첫 인덱스**를 반환 (없으면 `-1`) |
| ES7 | `includes()` | 포함 여부를 `true`/`false`로. 구식 `indexOf` 조건식을 대체 |
| ES10 | `flat()` | 중첩 배열을 지정 깊이만큼 평탄화 |
| ES13 | `at()` | 음수 인덱스 지원. `arr.at(-1)`로 마지막 요소 |
| ES14 | `toSorted()`, `toReversed()`, `toSpliced()` | **원본을 보존**하고 정렬·반전된 새 배열을 반환 |

마지막 줄이 최근 흐름을 보여준다. `sort()`와 `reverse()`는 원본을 직접 바꾸는 메서드였는데, ES14에서 **원본을 건드리지 않는 버전**이 별도로 추가됐다. 불변성이 언어 차원에서 표준이 되어 가고 있다는 뜻이다.

```js
const sorted = arr.toSorted()    // arr은 그대로
const sorted = [...arr].sort()   // toSorted 이전의 관용구
```

`find`와 `findIndex`의 차이는 자주 틀린다. **알맹이가 필요하면 `find`, 위치가 필요하면 `findIndex`다.** 삭제나 교체처럼 위치를 알아야 하는 작업에는 `findIndex`를 쓴다.

### 객체 문법

| 버전 | 기능 | 예시 |
|---|---|---|
| ES6 | 단축 속성명 | `{ name, age }` — key와 변수명이 같으면 한 번만 |
| ES6 | 계산된 속성명 | `{ [keyName]: value }` — key를 변수로 지정 |
| ES6 | 메서드 축약 | `{ greet() {} }` — `: function` 생략 |
| ES6 | `Object.assign()` | 객체 병합 (지금은 Spread에 밀림) |
| ES8 | `Object.keys/values/entries()` | 객체를 배열로 변환 |
| ES11 | 옵셔널 체이닝 `?.` | 중간이 `null`이어도 에러 없이 `undefined` |

```js
const title = 'Vue 3 특강'
const price = 99000

// 구식
const courseOld = { title: title, price: price, getInfo: function () {} }

// 모던
const courseModern = { title, price, getInfo() {} }
```

계산된 속성명은 동적 key가 필요할 때 쓴다.

```js
const inputType = 'email'
const userForm = { name: '홍길동', [inputType]: 'hong@email.com' }
userForm.email   // 'hong@email.com'
```

`Object.entries()`는 객체를 순회할 때 특히 유용하다. 객체 자체는 `map`이나 `filter`를 쓸 수 없지만, 배열로 바꾸면 쓸 수 있다.

```js
const scoreBoard = { math: 90, english: 80, science: 100 }

// [['math', 90], ['english', 80], ['science', 100]]
Object.entries(scoreBoard).forEach(([subject, score]) => {
  console.log(`${subject}: ${score}`)
})
```

`forEach(([subject, score]) => ...)` 에서 매개변수 자리에 배열 구조 분해가 그대로 들어간 것을 눈여겨볼 만하다. 문법은 조합해서 쓰인다.

### 옵셔널 체이닝과 널 병합

이 둘은 API 응답을 다룰 때 사실상 필수다.

**옵셔널 체이닝 `?.`** — 왼쪽이 `null`이나 `undefined`면 더 내려가지 않고 `undefined`를 반환한다.

```js
const user2 = { name: '홍길동' }        // profile이 아예 없다

user2.profile.address.city             // TypeError — 화면이 죽는다
user2?.profile?.address?.city          // undefined — 안전하게 통과
```

서버 응답은 필드가 항상 온다는 보장이 없다. 4일차에서 인증 store를 만들 때 `user.value?.name || '게스트'`라고 쓴 것이 이 방어 코드다.

**널 병합 `??`** — 왼쪽이 `null`이나 `undefined`**일 때만** 오른쪽 기본값을 쓴다.

```js
const userSetting = { alertCount: 0, nickname: '' }

// || 방식의 버그
userSetting.alertCount || 10     // 10  — 사용자는 0을 원했는데 조작된다
userSetting.nickname || '익명'    // '익명' — 빈 문자열을 의도했는데 덮인다

// ?? 방식
userSetting.alertCount ?? 10     // 0   — 0은 정상 데이터로 인정
userSetting.nickname ?? '익명'    // ''  — 빈 문자열 유지
```

`||`는 **Falsy 값 전부**(`0`, `''`, `false`, `null`, `undefined`, `NaN`)를 기본값으로 덮는다. 기온 `0℃`, 강수량 `0mm`, 지진 규모 `0`처럼 **0이 유효한 값**인 도메인에서 `||`를 쓰면 조용히 틀린 값이 표시된다. 에러가 나지 않기 때문에 발견도 늦다.

**"값이 없을 때"와 "값이 0/빈 문자열일 때"를 구분해야 한다면 `??`를 쓴다.** 둘은 이어서 쓴다.

```js
const finalCity = user?.profile?.address?.city ?? '등록된 주소 없음'
```

### Code Challenge

강의에서 제시된 세 과제는 위 문법을 조합해 푸는 형태다. 핵심만 옮긴다.

**과제 1 — 데이터 추출과 포맷팅** (`includes`, 중첩 구조 분해, 템플릿 리터럴)

```js
const members = ['김수원', '이서울', '박부산', '최대전']
const rawData = { id: 101, grade: 'VIP', details: { score: 95 } }

const memberContainsPark = members.includes('박부산')
const { grade, details: { score } } = rawData      // 중첩 구조 분해

result1.value = `부산 포함 여부: ${memberContainsPark} / 등급: ${grade} / 점수: ${score}점`
```

`details: { score }` 는 "`details`를 꺼낸 다음 그 안의 `score`를 꺼낸다"는 뜻이다. 이렇게 쓰면 `details` 자체는 변수로 남지 않는다.

**과제 2 — 불변성 복사와 기본값 방어** (Spread, `?.`, `??`)

```js
const currentCart = ['Apple', 'Banana']
const newProduct = { name: 'Orange', stock: 0, preview: null }

const updatedCart = [...currentCart, newProduct.name]
const imgStatus = newProduct?.preview ?? '이미지 준비중'
const finalStock = newProduct.stock ?? 0          // ||를 쓰면 0이 사라진다
```

`stock: 0`이 함정이다. `newProduct.stock || 0`도 결과는 같아 보이지만, 기본값이 `0`이 아닌 다른 값이었다면 바로 버그가 된다.

**과제 3 — 비동기 연쇄 호출** (`async/await`, `try/catch`)

```js
const runTask3 = async () => {
  result3.value = '⏳ 데이터 동기화 중...'
  try {
    const { uid } = await fetchUserId()
    const { nick } = await fetchUserProfile(uid)   // 앞 결과에 의존 → 순차 실행이 맞다
    result3.value = `동기화 성공: ${nick}님 환영합니다.`
  } catch {
    result3.value = '통신 실패'
  }
}
```

여기서는 두 번째 요청이 첫 번째의 `uid`를 필요로 하므로 순차 `await`가 맞다. 앞서 말한 `Promise.all`은 **서로 독립적인** 요청일 때 쓴다.

## 코드 품질: ESLint와 Prettier

두 도구는 역할이 겹치지 않는다. **ESLint는 버그를 잡고, Prettier는 모양을 맞춘다.**

### ESLint

코드를 **실행하지 않고** 소스를 파싱해 추상 구문 트리(AST)로 바꾼 뒤, 등록된 규칙과 대조해 문제를 찾는 **정적 분석 도구**다.

이게 왜 필요한가는 언어의 성질에서 나온다. Java나 C#은 컴파일 단계에서 구문 오류를 강제로 잡아내므로 결함 있는 코드가 배포까지 갈 수 없다. **JavaScript는 인터프리터 언어라 오타가 있어도 배포가 되고, 그 줄이 실행되는 순간 앱이 죽는다.** 게다가 동적 타이핑과 세미콜론 자동 삽입(ASI)처럼 문법 허용 범위가 넓어 예측 못한 부작용이 생기기 쉽다.

주요 검출 항목은 셋이다.

```js
// 1. Syntax Error — 오타
const myLocation = 'Suwon'
console.log(myLocatoin)      // ❌ 변수명 오타. 없으면 그대로 배포되어 화면이 죽는다

// 2. Dead Code — 안 쓰는 변수·import
const secretToken = 'xyz123' // ❌ 보안 위협 + 번들 낭비

// 3. Anti-Pattern — 위험한 관용구
if (userAge == 20) { }       // ❌ Expected '===' and instead saw '=='
```

세 번째가 특히 중요하다. `==`는 암묵적 형변환을 하므로 `0 == ''`, `null == undefined`가 전부 `true`다. **`===`를 강제**하면 이 부류의 버그가 통째로 사라진다.

`npm create vue@latest`에서 ESLint 옵션을 선택하면 설치되고, 아니면 직접 넣는다.

```sh
npm install -D eslint eslint-plugin-vue
```

**설치는 `-D`(devDependencies)다.** 린터는 개발 중에만 필요하고 배포 산출물에는 포함될 이유가 없다.

설정 파일은 `eslint.config.js`이며, 배열의 **뒤쪽이 앞쪽을 덮는다**. 커스텀 규칙은 `skipFormatting` 직전에 둔다.

```js
js.configs.recommended,
...pluginVue.configs['flat/essential'],
...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

{
  name: 'app/custom-rules',
  rules: {
    'no-unused-vars': 'warn',                  // 안 쓰는 변수는 경고
    'no-console': 'off',                       // 개발 편의상 console.log 허용
    'vue/multi-word-component-names': 'off',   // 단일 단어 컴포넌트명 허용
    'eqeqeq': ['error', 'always'],             // == 금지, === 강제
  },
},

skipFormatting,   // 시각적 스타일 규칙은 전부 끄고 Prettier에 위임
```

`skipFormatting`이 마지막인 이유가 여기서 드러난다. 줄바꿈·따옴표·들여쓰기 같은 **모양 규칙을 ESLint에서 전부 끄고 Prettier에 전권을 넘기기** 위해서다. 두 도구가 같은 항목을 서로 다르게 고치면 저장할 때마다 코드가 왔다 갔다 한다.

이 설정에서 주목할 점이 하나 더 있다. 실행 환경별로 전역 변수를 나눠 등록한다.

```js
{
  languageOptions: { globals: { ...globals.browser } },   // window, document, localStorage
},
{
  files: ['api/**/*.js', '*.config.js'],
  languageOptions: { globals: { ...globals.node } },      // process, Buffer
},
```

`src/` 아래는 브라우저에서 돌지만 `api/`와 설정 파일은 **Node에서 돈다.** 이 구분이 없으면 서버리스 함수에서 `process.env`를 쓸 때 "`process` is not defined" 에러가 난다. 뒤에서 다룰 API 키 처리와 직접 이어지는 부분이다.

검사 결과는 두 곳에서 확인한다.

- **에디터 실시간**: 빨간/노란 물결 밑줄, 파일 이름 색상 변경, 하단 Problems 탭
- **터미널 일괄**: `npm run lint`

```text
$ npm run lint

> lint:oxlint / oxlint . --fix
Found 0 warnings and 0 errors.
Finished in 24ms on 74 files with 89 rules using 8 threads.

> lint:eslint / eslint . --fix --cache
src/components/practices/library/EcmaScript.vue
  49:27  error    'fetchUserId' is not defined        no-undef
  52:28  error    'fetchUserProfile' is not defined   no-undef
  56:12  warning  'error' is defined but never used   no-unused-vars

✖ 3 problems (2 errors, 1 warning)
```

에러 메시지 끝에 붙은 `no-undef`, `no-unused-vars`가 **위반한 규칙 이름**이다. 이 이름으로 검색하면 왜 그 규칙이 존재하는지 바로 찾을 수 있고, 정말 예외가 필요하다면 설정에서 그 규칙만 끌 수 있다.

`--fix`는 자동 수정 가능한 것만 고친다. 오타나 미정의 변수처럼 **의도를 알 수 없는 문제는 사람이 고쳐야 한다.**

> `lint` 스크립트를 CI/CD 파이프라인에 넣으면, 정적 검사를 통과하지 못한 코드가 상용 서버로 나가는 것을 자동으로 막을 수 있다. 위 출력의 마지막에 `exited with 1`이 찍히는 것이 그 장치다. **종료 코드가 0이 아니면 파이프라인이 멈춘다.**
{: .prompt-tip }

### Prettier

ESLint가 버그를 잡는다면 Prettier는 **띄어쓰기, 줄바꿈, 따옴표 종류 같은 시각적 스타일만** 전담한다.

혼자 개발할 때는 필요성이 잘 안 느껴지지만 협업에서는 다르다. 누구는 들여쓰기 2칸, 누구는 4칸, 누구는 세미콜론을 붙이고 누구는 뗀다. 이 차이는 **Git에서 의미 없는 diff와 충돌**을 만든다. 로직은 한 줄도 안 바뀌었는데 파일 전체가 변경된 것으로 잡히면 코드 리뷰가 불가능해진다.

Prettier는 저장하는 순간 팀이 정한 규칙대로 코드를 **강제 정렬**한다. 논쟁 자체를 없애는 것이 목적이다.

```sh
npm install -D prettier
```

```json
{
  "$schema": "https://json.schemastore.org/prettierrc",
  "semi": false,
  "singleQuote": true,
  "printWidth": 100
}
```

| 옵션 | 의미 |
|---|---|
| `$schema` | 이 JSON이 따라야 할 규격 명세 위치. 에디터가 자동완성과 검증을 제공한다 |
| `semi: false` | 문장 끝 세미콜론을 붙이지 않는다 |
| `singleQuote: true` | 문자열은 홑따옴표 |
| `tabWidth: 2` | 들여쓰기 2칸 (Vue 3 표준, 기본값) |
| `printWidth` | 이 길이를 넘으면 자동 줄바꿈 |

`printWidth`는 강의 예시가 200이지만 내 프로젝트에서는 100을 썼다. 값이 크면 한 줄이 길어져 화면 분할이나 Git diff에서 가로 스크롤이 생긴다.

```sh
npm run format
```

실행하면 `src/` 아래 규칙에 어긋난 파일들이 일괄 수정되고 파일 목록이 출력된다.

```text
$ npm run format
> prettier --write --experimental-cli src/

src/components/exercise/UnitToggler.vue
src/router/index.js
src/stores/configStore.js
src/views/WeatherAboutView.vue
```

정리하면 이렇다.

| | ESLint | Prettier |
|---|---|---|
| 대상 | **논리·문법 오류** | **코드 모양** |
| 예시 | 미정의 변수, `==` 사용, 안 쓰는 import | 들여쓰기, 따옴표, 줄바꿈 |
| 실패 시 | 런타임에 앱이 죽을 수 있음 | 죽지는 않지만 협업이 어려움 |
| 명령어 | `npm run lint` | `npm run format` |

## Vite 설정

`vite.config.js`는 컴파일러 동작, 개발 서버, 빌드 파이프라인의 명세를 담는 파일이다. `defineConfig()`는 객체 형태로 설정을 쓸 때 타입 추론과 자동완성을 제공하는 래퍼 함수다.

기본 속성 둘은 프로젝트 생성 시부터 들어 있다.

| 속성 | 역할 |
|---|---|
| `plugins` | 브라우저가 해석하지 못하는 `.vue` 파일을 표준 JS 모듈로 **트랜스파일**하는 컴파일러 플러그인 |
| `resolve.alias` | `src` 폴더의 물리 경로를 `@` 기호로 매핑 |

`@` 별칭이 있어서 `import Foo from '../../../components/Foo.vue'` 대신 `'@/components/Foo.vue'`로 쓸 수 있다. 상대 경로는 파일을 다른 폴더로 옮기는 순간 전부 깨지지만, 별칭은 그대로 유효하다.

실무에서 자주 추가하는 속성은 `server`와 `build`다.

```js
server: {
  port: 3000,      // 개발 서버 포트 고정
  open: true,      // npm run dev 시 브라우저 자동 실행
},
build: {
  outDir: 'dist',  // 빌드 산출물 디렉토리
},
```

`server`에는 프록시 설정도 들어간다. 브라우저의 CORS 제약을 우회하거나, 뒤에서 볼 API 키 주입에 쓰인다.

```js
server: {
  proxy: {
    '/openweather-api': {
      target: 'https://api.openweathermap.org',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/openweather-api/, ''),
    },
  },
}
```

브라우저는 자기 자신(`localhost:3000`)에게 요청을 보내고, **Vite 개발 서버가 대신** 외부 API를 호출해 응답을 돌려준다. 서버 대 서버 통신이라 CORS가 적용되지 않는다.

## 환경 변수

### 왜 분리하는가

소스에 하드코딩된 설정값을 환경 변수로 빼내는 이유는 둘이다.

1. **보안**: API 토큰, DB 접속 정보 같은 민감 데이터를 Git에 올리지 않는다
2. **환경별 유연성**: 소스를 고치지 않고 **빌드 명령어만 바꿔** 스테이징/운영 서버 엔드포인트를 전환한다

두 번째가 실무에서 특히 크다. 스테이징과 운영이 같은 코드에서 나와야 "스테이징에서 테스트했으니 운영도 괜찮다"고 말할 수 있다. 코드가 다르면 테스트의 의미가 없다.

### 작성 규칙

Vite는 루트의 `.env` 파일들을 자동 로드한다. 규칙이 하나 있다.

> **Vite는 `VITE_`로 시작하는 변수만 클라이언트 코드에 노출한다.**
{: .prompt-warning }

```sh
# .env.staging
VITE_API_URL=https://api-staging.skala.co.kr
VITE_APP_MODE=Staging Mode

# .env.production
VITE_API_URL=https://api.skala.co.kr
VITE_APP_MODE=Production Mode
```

```js
const currentApiUrl = import.meta.env.VITE_API_URL
const currentMode = import.meta.env.VITE_APP_MODE
```

빌드할 때 `--mode`로 어떤 파일을 쓸지 고른다.

```json
"scripts": {
  "dev": "vite",
  "build:staging": "vite build --mode staging",
  "build:production": "vite build --mode production"
}
```

### `VITE_` 접두사는 보안 장치가 아니다

여기가 이 과정에서 가장 오해하기 쉬운 지점이다.

`VITE_` 접두사는 **"이 값을 브라우저에 노출하겠다"는 선언**이지, 값을 보호하는 장치가 아니다. Vite는 빌드 시점에 `import.meta.env.VITE_API_KEY`를 **실제 문자열로 치환**해 번들에 박아 넣는다. 배포된 `.js` 파일을 내려받아 열면 키가 평문으로 들어 있다.

```js
// 소스
const key = import.meta.env.VITE_API_KEY

// 빌드된 dist/assets/index-xxxx.js
const key = 'a1b2c3d4e5f6...'   // 그대로 노출된다
```

`.env`를 `.gitignore`에 넣는 것은 **소스 저장소**에서 키를 감출 뿐, **배포 산출물**에서 감추지 못한다. 서로 다른 문제다.

과제 요구사항에는 "API 키는 하드코딩하지 않고 환경 변수로 관리한다"고 되어 있는데, 이 요구를 문자 그대로 `VITE_API_KEY`로 만족시키면 키는 여전히 공개된다. **접두사를 붙이지 않는 것**이 해법의 출발점이다.

```sh
# .env.local — VITE_ 접두사가 없다
OPENWEATHER_API_KEY=발급받은_키
KMA_API_KEY=발급받은_키
```

접두사가 없으면 Vite가 클라이언트로 내보내지 않으므로, 이 값은 **Node 프로세스에서만** 읽을 수 있다. 그래서 키를 붙이는 일을 브라우저가 아니라 서버 쪽(개발 중에는 Vite dev 서버, 운영에서는 서버리스 함수)이 맡게 된다.

```js
export default defineConfig(({ mode }) => {
  // 세 번째 인자가 빈 문자열이면 VITE_ 접두사 없는 변수까지 읽는다
  const env = loadEnv(mode, process.cwd(), '')

  return {
    server: {
      proxy: {
        '/openweather-api': {
          target: 'https://api.openweathermap.org',
          changeOrigin: true,
          // 프록시가 인증키를 대신 붙인다. 브라우저는 키를 모른다
          rewrite: (path) => withAuthParam(path, 'appid', env.OPENWEATHER_API_KEY),
        },
      },
    },
  }
})
```

`loadEnv`의 세 번째 인자가 접두사 필터다. 빈 문자열을 주면 모든 변수를 읽는다. 이 코드는 `vite.config.js` 안, 즉 **빌드 도구가 Node에서 실행하는 영역**이므로 여기서 읽은 값은 번들에 들어가지 않는다.

다만 이건 개발 서버에서만 유효하다. 배포된 정적 사이트에는 Vite dev 서버가 없기 때문이다. 운영 환경에서 같은 역할을 어떻게 대체했는지는 프로젝트 회고에서 정리한다.

## 번들링과 빌드

### 번들링

수십~수백 개의 파일(`.vue`, JS, CSS, 이미지) 사이의 **의존성을 정적으로 분석해**, 브라우저가 로드하기 좋게 최소한의 파일로 묶고 압축하는 과정이다.

Vite는 개발과 프로덕션에서 다르게 동작한다.

| 단계 | 방식 | 이유 |
|---|---|---|
| **개발** (`npm run dev`) | ES Modules 기반 **무번들** | 파일 하나 고치면 그 파일만 다시 보내면 되므로 HMR이 즉각적 |
| **프로덕션** (`npm run build`) | **Rollup** 번들러로 최적화 | 요청 수를 줄이고 Tree Shaking으로 안 쓰는 코드를 제거 |

개발 중에는 속도가, 배포에서는 결과물 크기가 중요하다는 우선순위 차이가 그대로 설계에 들어가 있다. 1일차에서 Vite가 왜 빠른지 이야기했던 부분과 이어진다.

### 빌드 결과

```text
$ npm run build

vite v8.0.16 building client environment for production...
✓ 1664 modules transformed.
computing gzip size...
dist/index.html                              0.42 kB │ gzip:   0.28 kB
dist/assets/WeatherDetailView-CIVZfn32.css   0.33 kB │ gzip:   0.21 kB
dist/assets/index-C8G2TaS9.css             362.63 kB │ gzip:  49.23 kB
dist/assets/WeatherAboutView-CBV9u0gz.js     0.98 kB │ gzip:   0.68 kB
dist/assets/WeatherDetailView-BJsEF9OR.js    2.04 kB │ gzip:   1.34 kB
dist/assets/index-hkOuYOvA.js            1,053.24 kB │ gzip: 345.91 kB
```

읽는 법이 있다.

- **`index-*` 외에 `WeatherDetailView-*`, `WeatherAboutView-*`가 따로 나온 것**은 3일차의 **Lazy Loading**이 실제로 동작했다는 증거다. 라우터에서 `() => import(...)`로 등록한 컴포넌트가 별도 청크로 분리됐다
- **`gzip:` 뒤의 숫자가 실제 전송량**이다. 1MB짜리 JS도 gzip 압축하면 346KB로 줄어 전송된다. 서버가 압축해 보내고 브라우저가 풀어 쓴다
- **`index-*.js`가 1MB를 넘는 것**은 경고 신호다. Element Plus 같은 UI 라이브러리를 전역 등록하면 컴포넌트 전체가 번들에 들어간다. 실제로 쓰는 것만 넣으려면 `unplugin-vue-components` 같은 **자동 임포트 플러그인**으로 On-demand 방식으로 바꿔야 한다

### dist 폴더

빌드가 끝나면 루트에 `dist/`(Distribution)가 생긴다.

- 내부에는 **`.vue` 파일도, 개발용 모듈도 없다.** 브라우저가 바로 해석하는 순수 HTML/JS/CSS만 남는다
- 파일명 뒤의 `WeatherDetailView-CIVZfn32.css` 같은 문자열은 **내용 해시**다. 파일이 바뀌면 해시가 바뀌므로 이름이 바뀌고, 브라우저는 이를 새 파일로 인식해 다시 받는다. **배포했는데 사용자 화면이 안 바뀌는 캐싱 문제를 구조적으로 막는 표준 기법**이다
- 이 폴더를 AWS S3, Nginx, Netlify, Vercel, GitHub Pages 같은 정적 호스팅에 올리면 배포가 끝난다

`dist`가 정적 파일이라는 사실이 핵심이다. **Node.js 없이도 서비스된다.** 1일차에 CSR을 설명하면서 "빈 HTML을 받고 JS가 화면을 그린다"고 했던 구조가 여기서 완결된다. 서버는 파일만 내려주고, 나머지는 전부 브라우저에서 일어난다.

## 배포

### SPA 배포의 함정: 새로고침 404

정적 호스팅에 `dist`를 올리면 대개 한 번은 이 문제를 만난다.

```text
1. / 접속 → 정상
2. 앱 안에서 /weather/seoul 로 이동 → 정상 (Router가 처리)
3. /weather/seoul 에서 새로고침 → 404 Not Found
```

이유는 단순하다. 3번에서 브라우저는 **서버에게** `/weather/seoul`을 달라고 요청한다. 그런데 서버에 있는 파일은 `index.html`과 `assets/` 뿐이다. `weather/seoul`이라는 파일은 존재하지 않는다.

`/weather/seoul`은 **Vue Router가 브라우저 안에서만 아는 주소**다. 서버는 그런 경로를 모른다.

해결책은 **어떤 경로로 들어와도 `index.html`을 돌려주도록** 서버에 규칙을 넣는 것이다. `index.html`이 로드되면 그 안의 JS가 실행되고, Router가 현재 URL을 보고 맞는 화면을 그린다.

```json
{
  "rewrites": [
    { "source": "/:path((?!api/).*)", "destination": "/index.html" }
  ]
}
```

호스팅마다 이름이 다를 뿐 원리는 같다. Nginx는 `try_files $uri /index.html`, Netlify는 `_redirects` 파일, GitHub Pages는 `404.html`을 `index.html`과 동일하게 두는 우회법을 쓴다.

`(?!api/)`처럼 **예외를 두는 것**이 중요하다. API 경로까지 `index.html`로 보내 버리면 데이터를 요청했는데 HTML이 돌아온다.

### 과제 요구사항과 실제 선택

강의 과제의 최종 요구사항은 셋이었다.

1. ESLint로 점검해 에러를 없앨 것
2. API 키를 환경 변수로 관리하고 Git에 올리지 않을 것
3. 빌드한 `dist`를 GitHub Pages에 올려 Node.js 없이 호스팅할 것

나는 3번을 **Vercel**로 했다. 이유는 2번과 3번이 충돌했기 때문이다.

GitHub Pages는 **순수 정적 호스팅**이라 서버에서 실행되는 코드를 둘 수 없다. 그런데 앞서 정리했듯 API 키를 번들에 노출하지 않으려면 **키를 대신 붙여 주는 서버 측 중계자**가 필요하다. 개발 중에는 Vite dev 서버의 프록시가 그 일을 했지만, `dist`만 올라간 GitHub Pages에는 그 프록시가 없다.

Vercel은 정적 파일 호스팅에 더해 **서버리스 함수**를 같은 프로젝트에 둘 수 있다. `api/` 폴더의 파일이 그대로 엔드포인트가 되고, 키는 Vercel 대시보드의 환경 변수에서 읽는다. 브라우저는 같은 도메인의 `/openweather-api/...`로 요청하고, 그 뒤는 서버가 처리한다.

```text
[개발]  브라우저 → Vite dev 서버 프록시 → (키 주입) → 외부 API
[운영]  브라우저 → Vercel rewrite → api/ 서버리스 함수 → (키 주입) → 외부 API
```

개발과 운영에서 **경로는 같고 중계자만 바뀌는** 구조라 프론트엔드 코드는 한 줄도 분기하지 않는다.

> 기능 요구사항과 보안 요구사항이 부딪힐 때 호스팅 선택이 달라진다는 것이, 이 과제에서 얻은 실질적인 교훈이었다. 서버리스 함수 구현과 그 과정에서 겪은 문제들은 [프로젝트 회고](/posts/skala-vue-project/)에서 따로 정리한다.
{: .prompt-info }

### 배포 전 점검

```sh
npm run lint      # 정적 검사 통과 확인
npm run format    # 포맷 정리
npm run build     # dist 생성
npm run preview   # dist를 로컬에서 미리보기
```

`npm run preview`가 특히 중요하다. **`npm run dev`에서 잘 되던 것이 빌드 후에 깨지는 경우**가 있기 때문이다. 개발 서버는 무번들 ESM이고 프로덕션은 Rollup 번들이라 동작하는 방식 자체가 다르고, 개발 서버의 프록시 설정은 빌드 결과물에 포함되지 않는다. **배포 전에 반드시 `preview`로 한 번 확인한다.**

`.gitignore`도 확인 대상이다.

```text
.env*
dist
node_modules
```

`.env*`로 환경 파일 전체를 제외하되, 팀원이 무엇을 채워야 하는지 알 수 있도록 **값이 없는 `.env.example`은 커밋**한다.

```sh
# .env.example — 실제 키는 없고 형식만 있다
OPENWEATHER_API_KEY=your_openweather_api_key
KMA_API_KEY=your_kma_api_hub_key
```

> `.gitignore`에 추가하는 것은 **앞으로의 커밋**만 막는다. 이미 올라간 키는 커밋 이력에 남아 있고, 파일을 지우는 커밋을 새로 만들어도 이전 커밋을 되짚으면 그대로 보인다. **저장소를 공개하기 전에 이력을 확인하고, 노출된 적이 있다면 그 키는 재발급하는 것이 정답이다.**
{: .prompt-danger }

## 정리

이 파트는 **코드를 쓰는 시간이 아니라 코드를 내보내는 시간**이었다.

- ES6가 분기점이다. Vue 3의 문법은 Modern JavaScript 위에 서 있고, 지난 4일간 무의식적으로 쓴 `=>`·`${}`·`...`·`?.`가 전부 여기서 온다
- **Spread는 펼치고 Rest는 모은다.** `=`의 오른쪽이면 Spread, 왼쪽이면 Rest
- **`||`가 아니라 `??`.** `0`과 `''`이 유효한 값인 도메인에서 `||`는 조용히 틀린 값을 만든다
- **`async` 함수는 항상 Promise를 반환하고, 독립적인 요청은 `Promise.all`로 묶는다**
- **ESLint는 버그, Prettier는 모양.** 겹치는 영역은 `skipFormatting`으로 Prettier에 넘긴다
- Vite는 개발에서는 무번들 ESM, 프로덕션에서는 Rollup 번들로 **다르게 동작한다.** 그래서 `npm run preview` 확인이 필요하다
- **`VITE_` 접두사는 "노출하겠다"는 선언이지 보안 장치가 아니다.** 접두사가 없는 변수만 서버에 남는다
- `dist`는 Node.js 없이 서비스되는 정적 파일 묶음이고, 파일명 해시가 캐싱 문제를 막는다
- SPA를 정적 호스팅에 올리면 **새로고침 404**를 만난다. 모든 경로를 `index.html`로 보내되 API 경로는 예외로 둔다

4일간의 흐름을 한 줄로 되짚으면 이렇다.

```text
데이터로 화면을 그리고 (1일차)
  → 입력을 받아 상태를 바꾸고 (2일차)
  → 부품으로 나눠 연결하고 (3일차)
  → 전역 상태와 서버 데이터를 붙이고 (4일차)
  → 정적 파일로 만들어 세상에 내놓는다 (4일차 · 빌드와 배포)
```

각 단계는 앞 단계가 감당하지 못하는 문제가 생겨서 등장했다. 도구를 외우는 것보다 **어떤 불편이 그 도구를 불러왔는지**를 기억하는 편이 오래 간다.

강의 진도는 여기서 끝나지만 과제는 아직 남아 있다. 다음 글에서는 이 다섯 가지를 하나의 SPA로 합친 날씨 대시보드를 만들며 부딪힌 문제들 — API 키를 끝까지 감추는 방법, EUC-KR 응답 디코딩, 자동완성 요청 취소 — 을 정리한다.

---

이전 글: [4일차 — Pinia, Axios, Element Plus](/posts/skala-vue-day4/)

시리즈 안내: [Frontend framework: Vue.js — 4일 학습 로드맵](/posts/skala-vue-roadmap/)

다음 글: [프로젝트 회고 — 날씨 대시보드](/posts/skala-vue-project/)
