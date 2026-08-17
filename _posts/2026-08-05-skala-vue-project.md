---
title: "[SKALA] Vue.js 프로젝트 회고 — 실시간 날씨 대시보드"
date: 2026-08-05 20:00:00 +0900
categories:
  - SKALA
  - Frontend
tags: [skala, vue, vue3, project, retrospective, vercel, serverless, abortcontroller, api-proxy]
description: "강의 10개 장을 하나의 SPA로 통합한 날씨 대시보드 종합과제 회고. API 키를 번들에 노출하지 않는 프록시 구조, EUC-KR 응답 디코딩, 자동완성 요청 취소 등 강의 밖에서 부딪힌 문제를 정리한다."
permalink: /posts/skala-vue-project/
---

4일간의 강의는 끝났지만 과제가 남아 있었다. 배운 10개 장의 내용을 하나의 SPA로 통합하는 종합과제다. 나는 이를 **실시간 날씨 대시보드**로 구현했다.

- 저장소: [github.com/stellacustodis/skala-vue](https://github.com/stellacustodis/skala-vue)

일차별 글이 강의 개념 정리였다면, 이 글은 **강의에 없던 문제들**에 대한 기록이다. 개념을 아는 것과 동작하는 서비스를 만드는 것 사이에는 생각보다 큰 간극이 있었고, 그 간극에서 나온 결정들을 남긴다.

## 무엇을 만들었나

OpenWeather와 기상청 API허브의 데이터를 조합해, 지역별 현재 날씨와 기간별 관측·예보를 보여주는 대시보드다.

| 기능 | 데이터 출처 |
|---|---|
| 도시 검색·지역 추가 | 국내 도시명 사전 + OpenWeather Direct Geocoding |
| 현재 날씨 카드·상세 | OpenWeather Current Weather |
| 과거 타임라인 | 기상청 ASOS 일자료 |
| 미래 타임라인 | 기상청 육상 단기예보(`fct_afs_dl`) |
| 위성·폭염특보·지진 | 기상청 API허브 |
| 바탕 지도 | OpenStreetMap / Leaflet |

데이터 흐름은 이렇게 정리된다.

```text
도시 이름 ── OpenWeather Geocoding ── 위·경도 ── OpenWeather Current Weather
                                             └─ 기간 조회 시에만 최근접 기상청 지점 매핑
                                                ├─ 과거: ASOS 관측
                                                └─ 미래: 육상 단기예보
```

**OpenWeather 좌표를 기준으로 삼고, 기상청 지점 매핑은 필요할 때만** 하는 구조다. 이렇게 나눈 이유는 기상청 관측지점이 전국 어디에나 있는 것이 아니기 때문이다. 지점이 없는 도시도 검색하고 추가할 수 있어야 하는데, 기상청 지점을 기준으로 삼으면 그 도시들이 아예 목록에 오르지 못한다.

### 강의 내용의 매핑

과제의 목적이 "배운 것을 전부 써 보는 것"이었으므로, 각 장이 어디에 쓰였는지 정리해 두었다.

| 장 | 적용 |
|---|---|
| 1. Vue 시작 | Vite로 SPA 구성, `index.html` / `main.js` / `App.vue` |
| 2. Vue 문법 | 조건·반복 렌더링, `SearchBar`의 `:value` + `@input`, `@click.stop` |
| 3. Composition API | 필터·즐겨찾기는 `computed`, 라우트·지도 변경은 `watch`, 자동완성 debounce·취소는 `watchEffect` 정리 함수 |
| 4. Component | Props/Emits 검색·카드, `BaseDashboardCard`의 named slot, 지도 컴포넌트의 mount/unmount 정리 |
| 5. Vue Router | `/weather/:cityId`, 404 catch-all, 동적 import, `afterEach`로 탭 제목 |
| 6. Pinia | 단위 설정, 지역·즐겨찾기·최근 검색 store + `localStorage` 영속화 |
| 7. Axios | 공통 인스턴스 + 오류 변환 인터셉터, `Promise.allSettled`, `AbortController` |
| 8. Element Plus | Date Picker, Timeline, Progress, Pagination, Alert, Skeleton, Empty, `ElConfigProvider` |
| 9. Modern JavaScript | 선택 필드·결측값의 안전 처리, 원본을 바꾸지 않는 새 객체 생성 |
| 10. 빌드·배포 | 키를 서버 프록시에서만 읽도록 구성, lint/build 스크립트 정리 |

한 가지는 일부러 넣지 않았다. **`provide`/`inject`다.** 강의 예제에 있었지만 지금 컴포넌트 계층은 얕고, 여러 화면이 공유하는 상태는 이미 Pinia가 담당한다. 여기에 `provide`/`inject`를 끼워 넣으면 "이 값은 어디서 오는가"를 추적하는 경로가 하나 더 늘어날 뿐이다. **배운 것을 다 쓰는 것과 필요 없는 것을 넣는 것은 다르다**고 판단했다.

## 문제 1: API 키를 끝까지 감추기

가장 오래 붙잡은 문제다. 과제 요구사항은 "API 키를 하드코딩하지 않고 환경 변수로 관리한다"였는데, 이 요구를 문자 그대로 지켜도 키는 공개된다.

### `VITE_` 접두사의 함정

빌드·배포 글에서 정리한 내용을 다시 짚으면, Vite는 `VITE_`로 시작하는 환경 변수를 **빌드 시점에 실제 문자열로 치환해 번들에 넣는다.**

```js
// 소스
const key = import.meta.env.VITE_OPENWEATHER_API_KEY

// 빌드된 dist/assets/index-xxxx.js
const key = 'a1b2c3d4...'   // 그대로 들어 있다
```

즉 `.env`를 `.gitignore`에 넣어 **저장소**에서 감춰도, 배포된 JS 파일을 내려받는 것만으로 키가 나온다. 저장소 노출과 번들 노출은 별개의 문제다.

### 접두사를 떼고 서버로 옮기기

해법은 접두사를 붙이지 않는 것이다. 접두사가 없으면 Vite는 그 변수를 클라이언트로 내보내지 않으므로, **값은 Node 프로세스에만 존재**한다.

```sh
# .env.local — VITE_ 접두사 없음
OPENWEATHER_API_KEY=발급받은_키
KMA_API_KEY=발급받은_키
```

대신 키를 붙이는 일을 브라우저가 아니라 서버가 해야 한다. 개발 환경에서는 Vite dev 서버의 프록시가 그 역할을 한다.

```js
// vite.config.js
export default defineConfig(({ mode }) => {
  // 세 번째 인자가 빈 문자열이면 VITE_ 접두사 없는 변수까지 읽는다
  const env = loadEnv(mode, process.cwd(), '')

  return {
    server: {
      proxy: {
        '/openweather-api': {
          target: 'https://api.openweathermap.org',
          changeOrigin: true,
          rewrite: (path) =>
            withAuthParam(path.replace(/^\/openweather-api/, ''), 'appid', env.OPENWEATHER_API_KEY),
        },
      },
    },
  }
})
```

브라우저는 같은 origin의 `/openweather-api/...`로 요청하고, 키가 붙는 것은 그다음이다. **브라우저는 키를 알지 못한다.**

### GitHub Pages가 안 되는 이유

여기서 과제 요구사항과 충돌이 생겼다. 요구사항 3번은 "빌드한 `dist`를 GitHub Pages에 올려 Node.js 없이 호스팅한다"였다.

그런데 `dist`만 올라간 GitHub Pages에는 **Vite dev 서버가 없다.** 프록시 설정은 개발 서버의 설정이지 빌드 산출물이 아니므로, 배포하는 순간 키를 붙여 줄 주체가 사라진다.

정리하면 이렇다.

| | 키를 번들에 넣기 | 키를 서버에 두기 |
|---|---|---|
| GitHub Pages | 가능하지만 **키가 공개됨** | **불가능** (서버 실행 환경 없음) |
| Vercel | 가능하지만 키가 공개됨 | **가능** (서버리스 함수) |

요구사항 2번(키를 감춘다)과 3번(정적 호스팅)은 순수 정적 환경에서 동시에 만족할 수 없다. 그래서 **2번을 지키고 3번의 호스팅만 Vercel로 바꿨다.** `dist`가 정적 파일이라는 성질은 그대로이고, 서버리스 함수가 옆에 하나 더 붙는 형태다.

### 서버리스 프록시

`api/` 폴더의 파일이 그대로 엔드포인트가 된다. 두 API의 처리가 거의 같아 공통 로직을 분리했다.

```js
// api/_proxy.js
export const createApiProxy = ({ origin, authParamName, readApiKey, serviceName }) => {
  return async function handler(req, res) {
    const { path, ...params } = req.query
    const apiKey = readApiKey()

    if (!path) {
      res.status(400).send('path 쿼리 파라미터가 필요합니다.')
      return
    }

    if (!apiKey) {
      res.status(503).send(`${serviceName} 인증키가 서버에 설정되지 않았습니다.`)
      return
    }

    const targetPath = path.startsWith('/') ? path : `/${path}`
    const search = new URLSearchParams({ ...params, [authParamName]: apiKey })
    const upstream = await fetch(`${origin}${targetPath}?${search.toString()}`)
    const body = Buffer.from(await upstream.arrayBuffer())

    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    res.send(body)
  }
}
```

설계에서 몇 가지를 의도했다.

**첫째, 응답을 바이트 그대로 통과시킨다.** `arrayBuffer()`로 받아 `Buffer`로 넘기고 `Content-Type`도 원본을 그대로 쓴다. 이렇게 하면 **텍스트 API와 이미지 API를 같은 함수로 처리**할 수 있다. 텍스트를 문자열로 파싱해 버리면 위성영상이 깨진다.

**둘째, 키 누락을 `503`으로 구분한다.** 환경 변수를 설정하지 않은 상태와 API가 실제로 거부한 상태는 원인이 완전히 다른데, 둘 다 "요청 실패"로 뭉뚱그리면 배포 후 디버깅이 어려워진다. 클라이언트 쪽에서 이 코드를 받아 "인증키가 서버에 설정되지 않았습니다"라고 표시하게 했다.

**셋째, 경로를 쿼리 파라미터로 받는다.** Vercel의 동적 경로(`[...path].js`)가 다중 세그먼트를 라우팅하지 못해, `vercel.json`의 rewrite에서 원본 경로를 `path` 쿼리로 넘긴다.

```json
{
  "rewrites": [
    { "source": "/kma-api/:path*", "destination": "/api/kma-proxy?path=:path*" },
    { "source": "/openweather-api/:path*", "destination": "/api/openweather-proxy?path=:path*" },
    {
      "source": "/:path((?!api/|kma-api/|openweather-api/).*)",
      "destination": "/index.html"
    }
  ]
}
```

마지막 규칙이 빌드·배포 글에서 정리한 **SPA 새로고침 404 대응**이다. 어떤 경로로 들어와도 `index.html`을 돌려주되, `(?!api/|kma-api/|openweather-api/)`로 **API 경로는 제외**한다. 이 예외가 없으면 데이터를 요청했는데 HTML이 돌아온다.

### 결과: 코드가 환경을 모른다

```text
[개발]  브라우저 → Vite dev 서버 프록시 → (키 주입) → 외부 API
[운영]  브라우저 → Vercel rewrite → api/ 서버리스 함수 → (키 주입) → 외부 API
```

경로(`/kma-api/*`, `/openweather-api/*`)는 두 환경에서 같고 **중계자만 바뀐다.** 그래서 프론트엔드 코드에는 환경 분기가 한 줄도 없다.

```js
const openWeatherApi = axios.create({
  baseURL: '/openweather-api',
  timeout: 10000,
})
```

`baseURL`이 상대 경로라는 점이 핵심이다. 개발에서는 `localhost:5173/openweather-api`, 운영에서는 배포 도메인의 같은 경로가 된다.

### 이미지 API도 프록시로

한 가지 놓치기 쉬운 구멍이 있었다. **위성영상과 특보 이미지는 `<img src>`로 불러야 한다.** Axios로 받아 처리하는 게 아니라 URL을 그대로 태그에 넣는 방식이라, 원본 URL을 쓰면 인증키가 HTML에 드러난다.

```js
// src/services/kmaClient.js
export const buildKmaImageUrl = (path, params) => {
  const searchParams = new URLSearchParams(params)
  return `${KMA_PROXY_BASE_URL}${path}?${searchParams.toString()}`
}
```

이미지도 같은 `/kma-api` 경로를 쓰게 만들었다. 프록시가 응답 바이트를 그대로 통과시키도록 설계한 것이 여기서 값을 한다. **키를 감추는 경로가 하나면 구멍도 하나만 막으면 된다.**

> 키를 다루면서 배운 것은, "환경 변수를 썼다"가 곧 "안전하다"가 아니라는 점이다. 중요한 것은 **그 값이 최종적으로 어디에 실려 나가는가**다. 빌드 결과물을 직접 열어 검색해 보는 것이 확실한 확인 방법이다.
{: .prompt-tip }

## 문제 2: 기상청 API의 세 가지 제약

OpenWeather는 JSON을 돌려주는 현대적인 REST API라 4일차에서 배운 대로 하면 됐다. 기상청 API허브는 달랐다.

### EUC-KR 응답

`typ01` 계열 텍스트 API의 응답이 **EUC-KR 인코딩**으로 내려온다. Axios가 기본으로 하는 UTF-8 해석을 그대로 두면 한글이 전부 깨진다.

```js
const { data } = await axios.get(`${KMA_PROXY_BASE_URL}${path}`, {
  params,
  responseType: 'arraybuffer',   // 문자열로 해석하지 말고 바이트로 받는다
  signal,
})

text = new TextDecoder('euc-kr').decode(data)
```

`responseType: 'arraybuffer'`로 **해석 자체를 막고**, `TextDecoder`에 인코딩을 명시해 직접 디코딩한다. 앞서 프록시가 바이트를 그대로 통과시키도록 만든 것이 여기서도 전제가 된다. 프록시가 중간에서 UTF-8로 해석해 버렸다면 이 시점에는 이미 복구할 수 없는 문자열이 된다.

### 텍스트 포맷 파싱

응답이 JSON이 아니라 고정폭 텍스트다. `#`으로 시작하는 주석과 `#7777END` 종료 표시가 섞여 있다.

```js
export const toKmaDataLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
```

`\r?\n`으로 나눈 것은 개행 문자가 환경에 따라 다를 수 있어서다.

### HTTP 200인데 에러

가장 당황스러웠던 부분이다. **일부 API는 권한 오류를 HTTP 200 + JSON 본문으로 돌려준다.** Axios는 4xx·5xx를 자동으로 reject해 주지만, 상태 코드가 200이면 성공으로 처리하고 넘어간다. 그러면 파싱 단계에서 정체불명의 에러가 난다.

```js
const assertNotErrorPayload = (text, apiName) => {
  if (!text.trimStart().startsWith('{')) {
    return
  }

  const status = Number(text.match(/"status"\s*:\s*(\d+)/)?.[1])

  if (status === 403) {
    throw new Error(`${apiName} API 활용 신청이 필요합니다.`)
  }

  if (Number.isFinite(status) && status >= 400) {
    throw new Error(`${apiName} 요청에 실패했습니다. (status ${status})`)
  }
}
```

응답이 `{`로 시작하면 정상 텍스트가 아니라 에러 JSON이라고 보고, 본문에서 상태 코드를 뽑아낸다. **EUC-KR로 디코딩해도 따옴표와 숫자 같은 ASCII는 보존되므로** 인코딩과 무관하게 파싱할 수 있다.

`403`을 따로 다룬 이유가 있다. 기상청 API허브는 인증키 발급과 별개로 **API별 '활용 신청'** 이 필요하다. 신청 전에는 키가 유효해도 403이 온다. 이걸 "요청 실패"로만 표시하면 원인을 찾는 데 오래 걸린다. 그래서 "활용 신청이 필요합니다"라고 안내하게 했다.

### 공통 클라이언트로 모으기

세 제약이 모두 **호출부마다 반복될 성질**이었기 때문에 `kmaClient.js` 한 곳에 모았다.

```js
export const requestKmaText = async (path, params, { signal, apiName = '기상청' } = {}) => {
  let text

  try {
    const { data } = await axios.get(`${KMA_PROXY_BASE_URL}${path}`, {
      params,
      responseType: 'arraybuffer',
      signal,
    })

    text = new TextDecoder('euc-kr').decode(data)
  } catch (error) {
    throw getKmaRequestError(error, apiName)
  }

  assertNotErrorPayload(text, apiName)

  return text
}
```

각 API 모듈(`kmaStationApi`, `weatherTimelineApi`, `kmaDisasterApi`, `kmaSatelliteApi`)은 `requestKmaText(path, params)`만 호출하면 된다. 4일차에서 배운 Axios 인터셉터가 "공통 관심사를 한곳으로 모은다"는 발상이었는데, 인터셉터로 표현되지 않는 공통 처리도 결국 같은 원리로 정리된다.

## 문제 3: 자동완성과 요청 취소

검색창에 글자를 칠 때마다 API를 호출하면 두 가지 문제가 생긴다.

1. **호출 낭비**: "수원"을 치면 "ㅅ", "수", "수ㅇ", "수워", "수원" 5번 호출
2. **경쟁 상태(Race Condition)**: 먼저 보낸 요청의 응답이 **나중에** 도착해 최신 검색어의 후보를 덮어쓴다

2번이 특히 고약하다. 네트워크 응답 순서는 요청 순서를 보장하지 않는다. "수"의 결과가 "수원"의 결과보다 늦게 도착하면, 사용자는 "수원"을 다 쳤는데 "수"의 후보가 뜬다. **재현이 잘 안 되고 사용자는 "가끔 이상하다"고만 느끼는 종류의 버그다.**

해결은 `watchEffect`의 **정리 함수(cleanup)** 로 했다.

```js
watchEffect((onCleanup) => {
  const normalizedQuery = searchQuery.value.trim()

  searchSuggestions.value = []
  searchSuggestionError.value = ''
  isSearchingSuggestions.value = false

  if (!isSearchableSuggestionQuery(normalizedQuery) || isSuppressed) {
    return
  }

  const currentController = new AbortController()
  isSearchingSuggestions.value = true

  const debounceTimer = globalThis.setTimeout(async () => {
    try {
      const locations = await searchOpenWeatherSuggestions(normalizedQuery, {
        signal: currentController.signal,
      })

      if (!currentController.signal.aborted) {
        searchSuggestions.value = locations.filter(
          (location) => !locationsStore.findMatchingLocation(location),
        )
      }
    } catch (error) {
      if (!currentController.signal.aborted && error.name !== 'AbortError') {
        searchSuggestionError.value = error.message ?? '검색 결과를 불러오지 못했습니다.'
      }
    } finally {
      if (!currentController.signal.aborted) {
        isSearchingSuggestions.value = false
      }
    }
  }, SUGGESTION_DEBOUNCE_MS)

  onCleanup(() => {
    globalThis.clearTimeout(debounceTimer)
    currentController.abort()
  })
})
```

구조를 뜯어보면 이렇다.

**`watchEffect`를 쓴 이유**는 `searchQuery`를 명시적으로 지정하지 않아도 본문에서 참조하는 것만으로 의존성이 잡히고, 무엇보다 **`onCleanup`이 "다음 실행 직전"에 호출**되기 때문이다. 검색어가 바뀌면 이전 실행의 뒷정리가 자동으로 먼저 일어난다.

**정리 함수가 두 가지를 취소한다.**

- `clearTimeout(debounceTimer)`: 아직 발사되지 않은 타이머 → **debounce**
- `currentController.abort()`: 이미 날아간 요청 → **경쟁 상태 차단**

이 둘은 다른 시점을 담당한다. 350ms 안에 다음 글자를 치면 타이머가 취소되어 요청 자체가 나가지 않고, 요청이 이미 나간 뒤라면 `abort()`로 응답을 버린다. **어느 타이밍에 입력하든 오래된 응답이 화면에 도달하지 않는다.**

**취소를 에러로 표시하지 않는다.** `abort()`된 요청도 `catch`로 들어오는데, 이건 정상 동작이지 사용자에게 알릴 오류가 아니다. Axios 인터셉터에서 취소를 `AbortError`로 표시해 두고 호출부가 걸러내게 했다.

```js
openWeatherApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
      const abortError = new Error('요청이 취소되었습니다.', { cause: error })
      abortError.name = 'AbortError'
      return Promise.reject(abortError)
    }
    // ... 상태 코드를 한국어 메시지로 변환
  },
)
```

컴포넌트가 사라질 때도 남은 요청을 정리한다.

```js
onBeforeUnmount(() => {
  requestController?.abort()
  addRequestController?.abort()
  locationWeatherRequestController?.abort()
})
```

3일차에서 배운 Lifecycle Hook의 "정리(cleanup)"가 실제로 필요해지는 지점이다. 이걸 빼먹으면 **이미 사라진 컴포넌트의 `ref`에 값을 쓰려는** 상황이 생긴다.

### 초성 검색

OpenWeather Geocoding은 한글 초성("ㅅㅇ")을 이해하지 못한다. 그래서 초성은 **로컬에서 실제 도시명으로 먼저 푼 다음** 조회한다.

```js
const getKoreanInitials = (text) =>
  Array.from(text)
    .map((character) => {
      const code = character.charCodeAt(0)

      if (code < HANGUL_BASE_CODE || code > HANGUL_LAST_CODE) {
        return character
      }

      const syllableIndex = code - HANGUL_BASE_CODE
      const initialIndex = Math.floor(syllableIndex / 588)

      return HANGUL_INITIALS[initialIndex] ?? character
    })
    .join('')
```

한글 유니코드는 `초성 × 588 + 중성 × 28 + 종성` 구조로 배열되어 있어서, `0xAC00`을 뺀 값을 588로 나누면 초성 인덱스가 나온다. 이 규칙 덕분에 사전 없이 계산만으로 초성을 추출할 수 있다.

중요한 제약을 하나 두었다. **로컬 도시명 사전은 검색 보조일 뿐, 화면에 표시하고 저장하는 이름·좌표는 반드시 OpenWeather 응답을 쓴다.**

```js
const matchingCityNames = koreanCitySearchNames
  .filter((cityName) => getKoreanInitials(cityName).startsWith(normalizedQuery))
  .slice(0, MAX_SEARCH_SUGGESTIONS)

const results = await Promise.allSettled(
  matchingCityNames.map((cityName) => searchWeatherLocations(cityName, { signal, limit: 1 })),
)
```

사전에 있는 이름을 그대로 저장하면 **로컬 사전과 API의 표기가 어긋나는 순간 조회가 실패한다.** 사전은 "무엇을 검색할지"만 정하고, "무엇을 저장할지"는 API가 정하게 분리했다.

## 문제 4: 실패를 부분적으로 다루기

지역이 6개면 요청도 6개다. 여기서 `Promise.all`을 쓰면 안 된다. **하나만 실패해도 전체가 reject되어 나머지 5개의 성공한 데이터까지 버려진다.**

```js
const results = await Promise.allSettled(weatherRequests)

const loadedWeather = results
  .filter((result) => result.status === 'fulfilled')
  .map((result) => result.value)
const failedResults = results.filter((result) => result.status === 'rejected')

if (loadedWeather.length > 0) {
  // 성공한 것은 갱신하고, 실패한 것은 이전 값을 유지한다
  weatherList.value = locationsStore.locations
    .map((city) => loadedWeatherById.get(city.id) ?? previousWeatherById.get(city.id))
    .filter(Boolean)

  if (failedResults.length > 0) {
    loadError.value = `${failedResults.length}개 지역의 날씨를 불러오지 못했습니다.`
  }
} else if (failedResults[0]?.reason?.name !== 'AbortError') {
  loadError.value = failedResults[0]?.reason?.message ?? '날씨 정보를 불러오지 못했습니다.'
}
```

| | `Promise.all` | `Promise.allSettled` |
|---|---|---|
| 하나 실패 시 | **전체 reject** | 각각의 성공/실패를 전부 보고 |
| 결과 형태 | 값의 배열 | `{ status, value }` 또는 `{ status, reason }` |
| 적합한 상황 | 전부 있어야 의미가 있을 때 | **일부만 있어도 쓸모가 있을 때** |

날씨 카드는 후자다. 5개 지역이 보이는 것이 0개가 보이는 것보다 낫다. 그래서 **성공한 것은 갱신하고, 실패한 것은 이전 값을 남기고, 실패 개수만 따로 안내**한다.

`?? previousWeatherById.get(city.id)` 부분이 그 처리다. 빌드·배포 글에서 정리한 널 병합이 여기서 "새 데이터가 없으면 이전 데이터"라는 의미로 쓰인다.

응답이 늦게 도착했을 때 오래된 결과를 버리는 장치도 같이 두었다.

```js
const results = await Promise.allSettled(weatherRequests)

if (requestController !== currentController) {
  return   // 그 사이 새 요청이 시작됐다면 이 결과는 버린다
}
```

## 문제 5: 결측값을 정직하게 표시하기

날씨 데이터는 **비어 있는 경우가 정상**이다. 관측지점에 습도 센서가 없을 수도 있고, 예보에는 아예 습도 항목이 없다.

```js
humidity: isFiniteNumber(payload?.main?.humidity) ? payload.main.humidity : null,
pressure: isFiniteNumber(payload?.main?.pressure) ? payload.main.pressure : null,
windSpeed: isFiniteNumber(payload?.wind?.speed) ? roundToOneDecimal(payload.wind.speed) : null,
```

`isFiniteNumber`로 검사한 이유는 `null`, `undefined`, `NaN`, 문자열이 전부 들어올 수 있어서다. 여기서 빌드·배포 글에서 정리한 **`||`와 `??`의 차이**가 실제 버그로 이어질 수 있는 도메인이라는 점이 드러난다.

```js
// 기온 0℃, 강수확률 0%, 지진 규모 0은 전부 유효한 값이다
const temp = payload.main.temp || '정보 없음'   // 0℃가 '정보 없음'이 된다
const temp = payload.main.temp ?? '정보 없음'   // 0℃가 살아남는다
```

기온이 정확히 0℃인 날은 드물지 않다. `||`를 썼다면 그날만 "정보 없음"이 뜨고, 에러 로그는 남지 않는다.

데이터가 없을 때 **없다고 표시하는 것**도 결정이었다. 육상 단기예보 응답에는 미래 습도가 없어서, 예보 구간의 습도 선과 평균은 그리지 않고 날짜별 상세에는 `미제공`으로 적었다. 선을 임의로 이어 붙이면 그래프는 예뻐지지만 **없는 데이터를 있는 것처럼 보이게 만든다.**

관측지점 문제도 마찬가지다. 사용자가 고른 좌표와 실제 기상청 관측지점은 다를 수 있으므로, **어느 지점의 값이고 거리가 얼마인지를 화면에 함께 표시**했다.

## 문제 6: 상태 보존과 캐시

### `localStorage`: 사용자 데이터

사용자가 추가한 지역, 즐겨찾기, 최근 검색어는 새로고침에 사라지면 안 된다.

```js
const readStoredArray = (key) => {
  try {
    const storedValue = window.localStorage.getItem(key)
    const parsedValue = storedValue ? JSON.parse(storedValue) : []

    return Array.isArray(parsedValue) ? parsedValue : []
  } catch {
    return []
  }
}
```

읽을 때 두 겹으로 방어한다. `try/catch`는 **`JSON.parse` 실패**(사용자가 직접 고쳤거나 이전 버전 형식)를, `Array.isArray` 검사는 **파싱은 됐지만 형태가 다른 경우**를 막는다.

값의 형태도 검증한다.

```js
const isValidLocation = (location) =>
  typeof location?.id === 'string' &&
  typeof location?.name === 'string' &&
  typeof location?.region === 'string' &&
  Number.isFinite(location?.latitude) &&
  Number.isFinite(location?.longitude)
```

`localStorage`는 **사용자가 언제든 수정할 수 있는 저장소**다. 앱이 넣은 값이 그대로 돌아온다는 보장이 없으므로 외부 입력처럼 다뤄야 한다. 좌표가 문자열로 바뀌어 들어오면 지도 계산이 조용히 어긋난다.

쓸 때는 실패해도 앱이 멈추지 않게 했다.

```js
const persistArray = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장 공간을 사용할 수 없어도 현재 세션에서는 기능을 계속 제공한다
  }
}
```

시크릿 모드나 용량 초과에서 `setItem`은 예외를 던진다. **저장에 실패한다고 해서 날씨 조회까지 막을 이유는 없다.**

### `sessionStorage`: API 응답 캐시

현재 날씨는 10분 TTL로 캐시했다.

```js
const CACHE_TTL_MS = 10 * 60 * 1000

const isInvalidCache =
  !Number.isFinite(savedAt) ||
  savedAt > Date.now() ||                      // 미래 타임스탬프 (시계 변경)
  Date.now() - savedAt >= CACHE_TTL_MS ||      // 만료
  cachedData?.id !== city.id ||                // 다른 도시의 데이터
  !isFiniteNumber(cachedData?.temp)            // 형식 이상
```

`savedAt > Date.now()` 검사는 시스템 시계가 바뀌었을 때를 위한 것이다. 이 검사가 없으면 미래 시각이 저장된 캐시가 **영원히 만료되지 않는다.**

저장소를 `localStorage`가 아니라 `sessionStorage`로 고른 것도 의도다. **날씨는 오래 보관할 가치가 없다.** 탭을 닫으면 사라지는 편이 맞고, 무료 요금제의 호출 한도를 아끼는 목적에는 세션 범위로 충분하다.

| | `localStorage` | `sessionStorage` |
|---|---|---|
| 수명 | 명시적으로 지우기 전까지 | 탭을 닫으면 소멸 |
| 이 프로젝트의 용도 | **사용자 데이터** (추가 지역, 즐겨찾기) | **API 응답 캐시** |

## 강의와 달랐던 선택들

### Store 문법

4일차에서 정리한 Setup Store 문법(`defineStore('config', () => {...})`) 대신 Options 문법을 썼다.

```js
export const useConfigStore = defineStore('config', {
  state: () => ({ unit: 'celsius' }),
  getters: {
    unitSymbol: (state) => (state.unit === 'celsius' ? '°C' : '°F'),
    unitName: (state) => (state.unit === 'celsius' ? '섭씨' : '화씨'),
  },
  actions: {
    toggleUnit() {
      this.unit = this.unit === 'celsius' ? 'fahrenheit' : 'celsius'
    },
  },
})
```

state·getters·actions의 경계가 문법으로 강제되어, 이 store처럼 구조가 단순할 때는 읽기 쉬웠다. 다만 `this` 바인딩에 의존하므로 Setup 문법과 섞어 쓰기는 어렵다. **어느 쪽이 맞다기보다 store마다 성격에 맞는 쪽을 고르는 문제**로 보인다.

`unitName` getter는 접근성 때문에 추가했다. 스크린 리더가 `°C`를 그대로 읽으면 어색해서, 음성 안내에는 "섭씨"를 쓴다. 4일차에 UI 라이브러리의 이점으로 접근성을 이야기했는데, **라이브러리가 대신해 주지 않는 부분은 결국 직접 챙겨야 한다.**

### ESLint의 실행 환경 분리

`src/`는 브라우저에서, `api/`와 설정 파일은 Node에서 돈다. 전역 변수가 다르므로 나눠 등록해야 한다.

```js
{
  languageOptions: { globals: { ...globals.browser } },
},
{
  files: ['api/**/*.js', '*.config.js'],
  languageOptions: { globals: { ...globals.node } },
},
```

이 설정 없이 서버리스 함수에서 `process.env`를 쓰면 `'process' is not defined`가 뜬다. 한 저장소 안에 **실행 환경이 다른 코드가 섞이는 순간** 필요해지는 구분이다. 프론트엔드만 하던 관점에서는 잘 보이지 않던 부분이었다.

## 남은 것들

정직하게 적어 둔다.

- **번들 크기.** `index-*.js`가 1MB를 넘는다. Element Plus를 전역 등록해 컴포넌트 전체가 들어갔기 때문이다. `unplugin-vue-components`로 On-demand 임포트로 바꾸면 상당히 줄어든다.
- **테스트가 없다.** 좌표→관측지점 매핑이나 EUC-KR 파싱처럼 순수 함수로 분리된 로직은 단위 테스트를 붙이기 좋은데, 과제 범위에서는 손대지 못했다.
- **프록시 응답 캐싱.** 위성영상처럼 같은 이미지를 여러 사용자가 요청하는 경우, 서버리스 함수에서 캐시 헤더를 붙이면 호출을 크게 줄일 수 있다.

셋 다 "동작은 한다"에서 멈춘 항목들이다. 과제 기한 안에서는 동작하는 것까지가 우선이었지만, 번들 크기와 테스트는 실제 서비스였다면 먼저 처리했어야 할 순서라고 생각한다.

## 정리

강의는 "이 도구는 이렇게 쓴다"를 알려주고, 과제는 "그 도구로 무엇을 못 하는가"를 알려줬다.

- **환경 변수를 썼다고 안전한 게 아니다.** 그 값이 최종적으로 어디에 실려 나가는지가 기준이고, 빌드 결과물을 직접 열어 확인해야 한다
- **요구사항끼리 충돌할 수 있다.** "키를 감춘다"와 "정적 호스팅"이 부딪혔을 때, 무엇을 포기할지가 곧 설계 결정이 된다
- **비동기는 순서를 보장하지 않는다.** debounce는 요청 수를, `AbortController`는 오래된 응답을 막는다. 둘은 다른 문제를 푼다
- **부분 실패를 다루는 것이 기본이다.** 외부 API가 여럿이면 전부 성공하는 경우가 오히려 예외다
- **없는 데이터는 없다고 표시한다.** 그래야 화면을 믿을 수 있다
- **`localStorage`는 외부 입력이다.** 읽을 때 형태를 검증하고, 쓰기 실패로 앱이 멈추지 않게 한다

4일 동안 배운 것 중 가장 오래 쓸 것 하나를 고르라면 문법이 아니라 **"이 도구는 어떤 불편 때문에 생겼는가"를 묻는 습관**이다. Pinia는 Props Drilling 때문에, 인터셉터는 반복되는 공통 처리 때문에, `AbortController`는 응답 순서를 믿을 수 없어서 생겼다. 이유를 알면 언제 써야 하는지도 따라온다.

---

이전 글: [빌드와 배포 — Modern JavaScript, ESLint, Vite](/posts/skala-vue-day5/)

시리즈 안내: [Frontend framework: Vue.js — 4일 학습 로드맵](/posts/skala-vue-roadmap/)

선행 시리즈: [Full-Stack Engineering: HTML, CSS, JavaScript — 2일 학습 로드맵](/posts/skala-frontend-roadmap/)
