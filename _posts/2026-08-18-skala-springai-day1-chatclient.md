---
title: "[SKALA] Spring AI 1일차 ③ — ChatClient, 모델을 부르는 창구"
date: 2026-08-18 21:00:00 +0900
permalink: /posts/skala-springai-day1-chatclient/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, chatclient, builder, fluent-api]
description: "빌더와 메서드 체이닝이라는 Java 관례에서 출발해 ChatClient 빈을 용도별로 나누는 이유를 정리한다. 호출 방식 네 가지와 응답 메타데이터를 확인하고, 1일차 실습의 합격 기준을 코드로 검증한다."
---

## 점(.)이 계속 찍히는 코드부터

Spring AI 코드를 처음 봤을 때 가장 낯설었던 것은 개념이 아니라 문법이었다.

```java
String answer = chat.prompt()
        .system("너는 상담원이다")
        .user("반품 규정 알려줘")
        .call()
        .content();
```

Python으로 LLM API를 부를 때는 인자를 채운 함수 하나를 호출하는 형태가 익숙했다. 이 체인은 무엇이 언제 실행되는지가 한눈에 들어오지 않았다. 교재는 이 문법을 별도 슬라이드로 설명하는데, 규칙은 단순했다.

**각 메서드가 자기 자신을 돌려주므로 점을 또 찍을 수 있고, 마지막 한 번(`build()`·`call()`)에서야 실제 일이 벌어진다.**

```java
// ① 생성자로만 만들면 — 인자가 늘수록 못 읽는다
var chat = new Chat("gpt-4o-mini", 0.0, 300, "너는 상담원이다", true, null);
//                                        ↑ 무엇이 무엇인지 알 수 없다

// ② 빌더 — 이름을 붙여, 필요한 것만 담는다
ChatOptions o = ChatOptions.builder()
        .model("gpt-4o-mini")     // 각 메서드가 자기 자신(this)을 돌려준다
        .temperature(0.0)         //  → 그래서 점을 또 찍을 수 있다 = 메서드 체이닝
        .maxTokens(300)
        .build();                 // 종료 메서드 — 여기서 객체가 실제로 만들어진다
```

교재가 이 문법을 "햄버거 주문서"에 비유한 것이 실제로 도움이 됐다. 옵션을 체크하는 동안에는 아무 일도 일어나지 않고, "주문할게요"에 해당하는 종료 메서드에서 비로소 실행된다. **종료 메서드를 빠뜨리면 아무 일도 안 일어나는 것**이 가장 흔한 실수라는 지적도 함께 있었다. 컴파일은 되고 예외도 없다.

Java에서 이 패턴이 자리 잡은 이유도 짐작이 갔다. Python이라면 키워드 인자로 해결될 문제인데, 키워드 인자가 없는 언어에서는 인자 여섯 개짜리 생성자가 곧 읽을 수 없는 코드가 된다. 빌더는 그 문제에 대한 관례적 해법이고, Fluent API는 그것을 문장처럼 읽히도록 설계한 결과다.

## ChatClient와 ChatModel의 차이

`ChatModel`은 저수준 추상화이고 `ChatClient`는 그 위의 Fluent API다.

| 구분 | `ChatModel` | `ChatClient` |
|---|---|---|
| 계층 | 저수준 추상화 | 그 위의 Fluent API |
| 호출 | `call(Prompt)` | `.prompt().user()...call()` |
| 기능 | 요청 → 응답 | + Advisor · 옵션 · 객체 변환 |
| 실무 | 직접 쓰는 일 드묾 | 대부분 이걸 쓴다 |

`ChatClient`가 추가로 제공하는 세 가지 중 Advisor와 객체 변환은 2일차·3일차의 핵심 주제다. 즉 `ChatClient`를 쓰는 이유는 편의가 아니라, RAG와 메모리와 안전 필터를 끼워 넣을 지점이 여기에만 있기 때문이다.

## 창구를 하나만 두면 기본값이 충돌한다

`ChatClient`를 설명할 때 교재가 든 비유는 "부서별 전화 창구"였다. 창구마다 응대 지침과 말 빠르기가 정해져 있고, 코드는 창구에 말만 건다.

이 비유의 요점은 **창구를 하나만 두면 안 된다**는 것이다. 하나의 `ChatClient`로 모든 일을 시키면 기본값이 서로 충돌한다. 분류·추출은 같은 입력에 같은 출력이 나와야 하고(온도 0), 상담은 자연스러워야 한다(온도 0.7). 하나의 기본값으로는 둘 다 만족시킬 수 없다.

샘플 코드의 `ChatClientConfig`는 이 원칙을 그대로 구현한다. 이 클래스는 `ch03`부터 `ch12`까지 거의 모든 참조 예제에 같은 형태로 반복해서 등장한다.

```java
@Configuration
public class ChatClientConfig {

    /** 분류·추출 — 같은 입력이면 같은 출력이어야 하는 일. */
    @Bean
    public ChatClient extractClient(ChatClient.Builder builder) {
        return builder
                .defaultSystem("""
                        너는 정확한 정보 추출기다.
                        - 주어진 텍스트에 없는 내용은 절대 만들어 내지 않는다.
                        - 값을 찾을 수 없으면 null 을 쓴다.
                        - 요청받은 형식 외의 설명은 덧붙이지 않는다.""")
                .defaultOptions(ChatOptions.builder()
                        .temperature(0.0)
                        .maxTokens(1024)
                        .build())
                .build();
    }

    /** 상담·작문 — 자연스러움이 중요한 일. */
    @Bean
    public ChatClient supportClient(ChatClient.Builder builder) {
        return builder
                .defaultSystem("""
                        너는 친절하고 간결한 고객 상담원이다.
                        - 존댓말을 쓰고 3문장 이내로 답한다.
                        - 확실하지 않으면 모른다고 말하고 담당자 연결을 안내한다.""")
                .defaultOptions(ChatOptions.builder()
                        .temperature(0.7)
                        .build())
                .defaultAdvisors(new SimpleLoggerAdvisor())
                .build();
    }
}
```

`ChatClient`는 라이브러리 타입이라 `@Component`를 붙일 수 없다. 그래서 `@Configuration` 클래스에서 `@Bean`으로 직접 만든다. 이것이 1장에서 배운 `@Bean`의 존재 이유가 실제로 쓰이는 첫 지점이었다.

같은 타입의 빈이 둘이 되면 주입할 때 이름을 지정해야 한다.

```java
@Service
public class HelloAiService {

    private final ChatClient support;
    private final ChatClient extract;

    public HelloAiService(@Qualifier("supportClient") ChatClient support,
                          @Qualifier("extractClient") ChatClient extract) {
        this.support = support;
        this.extract = extract;
    }
}
```

교재의 판단 기준이 명확했다. **추출용과 상담용 `ChatClient`의 temperature가 같다면 빈을 나눌 때가 된 것이다.**

## 두 창구를 눈으로 확인하는 실습

4장 실습은 이 원칙을 극단적으로 단순화해서 보여 준다. 말투가 완전히 다른 창구 두 개를 만들고, 같은 질문을 동시에 보낸다.

```java
@Configuration
public class ToneConfig {

    @Bean
    ChatClient 사극체(ChatClient.Builder b) {
        return b.defaultSystem("모든 답을 조선시대 사극 말투로 한다. 예: ~하시옵니다")
                .defaultOptions(ChatOptions.builder().temperature(0.2).build())
                .build();
    }

    @Bean
    ChatClient 이모지체(ChatClient.Builder b) {
        return b.defaultSystem("모든 답에 어울리는 이모지를 붙여 친근하게 답한다.")
                .defaultOptions(ChatOptions.builder().temperature(0.9).build())
                .build();
    }
}
```

```java
@RestController
public class ToneLab {

    private final ChatClient 사극체, 이모지체;                    // 이름으로 골라 받는다

    public ToneLab(@Qualifier("사극체") ChatClient 사극체,
                   @Qualifier("이모지체") ChatClient 이모지체) {
        this.사극체 = 사극체;
        this.이모지체 = 이모지체;
    }

    @GetMapping("/lab4/tone")
    public Map<String, String> tone(@RequestParam String q) {
        return Map.of("사극체", 사극체.prompt().user(q).call().content(),
                      "이모지체", 이모지체.prompt().user(q).call().content());
    }
}
```

`"오늘 회의 30분 늦어요"`를 보내면 한쪽은 `"송구하옵니다. 회의가 반 시진 늦어지겠사옵니다."`, 다른 쪽은 이모지가 붙은 캐주얼한 문장이 나온다.

온도 차이도 이 실습에서 직접 확인한다. 같은 질문을 세 번씩 보내면 온도 0.2 쪽은 거의 같은 문장이 나오고, 0.9 쪽은 매번 다르다.

```bash
for i in 1 2 3; do curl -s 'localhost:8080/lab4/tone?q=안녕' | jq .사극체; done
```

테스트는 모델을 부르지 않고 빈이 둘 다 등록됐는지만 확인한다.

```java
@Test void 창구가_둘_등록된다() {
    assertThat(ctx.getBeansOfType(ChatClient.class)).containsKeys("사극체", "이모지체");
}
```

## 호출 방식 네 가지

`.call()` 이후 결과를 꺼내는 방법이 네 가지다. 화면 형태가 선택을 정한다.

| 방식 | 반환 | 적합 | 주의 |
|---|---|---|---|
| `.call().content()` | `String` | 짧은 답 · 분류 · 추출 | 긴 답변은 체감이 나쁘다 |
| `.call().entity(T)` | 객체 | 구조화 응답 API | 형식 실패 대비 필요 |
| `.call().chatClientResponse()` | 응답 + 컨텍스트 | 출처·메타데이터 필요 | 가장 정보가 많다 |
| `.stream().content()` | `Flux<String>` | 채팅 UI · 긴 생성 | 취소·타임아웃 필수 |

세 번째 `chatClientResponse()`는 2일차 RAG에서 출처를 꺼낼 때 반드시 필요해진다. Advisor가 검색해 온 문서 목록이 응답 컨텍스트에 담겨 오기 때문이다.

## 응답에 함께 오는 것들

응답에는 텍스트 말고도 운영에 필요한 정보가 들어 있다. 특히 `finishReason`은 그냥 넘기면 사고가 되는 값이다.

```java
ChatResponse response = chat.prompt().user(q).call().chatResponse();

// 왜 끝났나 — stop(정상) · length(잘림) · tool_calls(도구 호출)
String finishReason = response.getResult().getMetadata().getFinishReason();
if ("length".equalsIgnoreCase(finishReason)) {
    log.warn("응답이 maxTokens 에서 잘렸다 — 상한을 올리거나 요약을 시키자");
}

// 얼마나 썼나 — 비용 계산의 근거
Usage usage = response.getMetadata().getUsage();
log.info("prompt={} completion={} total={}",
        usage.getPromptTokens(), usage.getCompletionTokens(), usage.getTotalTokens());

// 어떤 모델이 답했나 — 폴백이 걸렸는지 확인할 때
String model = response.getMetadata().getModel();
```

`length`로 끝난 응답을 정상으로 처리하면 잘린 JSON을 파싱하려다 실패하거나, 문장이 끊긴 답이 사용자에게 나간다. 2일차 구조화 출력의 실패 복구와 3일차 계측이 모두 이 메타데이터 위에 세워진다.

## 문자열을 이어 붙이지 않는다

프롬프트에 사용자 입력을 넣을 때는 문자열 연결 대신 자리표시자와 파라미터를 쓴다.

```java
public String translate(String text, String targetLang) {
    return extract.prompt()
            .user(u -> u.text("다음 문장을 {lang}로 번역하라. 번역문만 출력한다.\n{text}")
                    .param("lang", targetLang)
                    .param("text", text))
            .call()
            .content();
}
```

샘플 코드의 주석이 이유를 한 줄로 적어 뒀다. "사용자 입력을 그대로 이어 붙이면 프롬프트 인젝션 표면이 넓어진다."

SQL 인젝션과 구조가 같아 보이지만 방어의 성격은 다르다. 파라미터 바인딩된 SQL은 값이 코드로 해석되지 않는 것이 보장되는 반면, LLM 프롬프트는 결국 모든 것이 같은 텍스트 스트림으로 모델에 들어간다. 즉 이 방식은 **표면을 좁히는 것이지 차단이 아니다.** 3일차에 안전 필터(`SafeGuardAdvisor`)와 권한 검증을 코드 쪽에 따로 두는 이유가 여기에 있다.

## 첫 AI 호출과 고장 재현

3장 실습(작명 봇)은 `ChatClient` 하나로 첫 AI 호출을 한다.

```java
@RestController
public class NamingBot {

    private final ChatClient chat;

    public NamingBot(ChatClient.Builder builder) {
        this.chat = builder                                    // 창구를 하나 만든다
                .defaultSystem("""
                        너는 작명가다. 주어진 키워드로 팀 이름을 3개 제안한다.
                        각 이름 뒤에 한 줄 이유를 붙인다. 한국어로 답한다.
                        """)
                .build();
    }

    @GetMapping("/lab2/name")                                  // 말을 건다
    public String name(@RequestParam String keyword) {
        return chat.prompt()
                .user(u -> u.text("키워드: {k}").param("k", keyword))
                .call().content();                             // 답을 받는다
    }
}
```

클래스 주석에 실습의 의도가 적혀 있다. "키를 지우고 재시작하면 기동 자체가 실패한다. 그 화면을 한 번 보고 넘어가는 것이 이 실습의 절반이다."

같은 요청을 두 번 보내면 답이 달라지는 것도 여기서 확인한다. 창작이므로 정상이라는 설명이 붙는데, 이 성질이 2일차 테스트 전략과 온도 설정의 근거가 된다.

## 설정 우선순위

"분명히 바꿨는데 안 먹는다"는 대부분 이 순서를 몰라서 생긴다.

| 순위 | 출처 | 실무에서 |
|---|---|---|
| 1 (가장 셈) | 커맨드라인 인자 `--spring.ai...` | 일회성 실험 |
| 2 | OS 환경변수 `SPRING_AI_OPENAI_API_KEY` | 컨테이너·K8s의 기본 |
| 3 | `application-{profile}.yml` | 환경별 차이만 담는다 |
| 4 | `application.yml` | 공통 기본값 |
| 5 (가장 약함) | 코드의 `@Value` 기본값 | 최후의 안전망 |

`ChatClient` 안에서는 별도의 순서가 하나 더 있다. **yml 기본값 < 빌더 기본값(`defaultOptions`) < 호출별 옵션(`.options()`)** 순으로 이긴다. 빈에서 온도를 못 박아 두면 호출부가 매번 정할 필요가 없고, 특정 호출만 예외를 두고 싶으면 그때만 덮어쓴다.

## 1일차 실습의 합격 기준

1일차 종합 실습은 주문 하나를 AI가 한 문장으로 요약하는 API를 만드는 것이었다. 완료 기준 8개 중 교재가 "진짜 학습 지점"으로 표시한 것은 3번과 8번이다.

| # | 확인 항목 | 통과 기준 |
|---|---|---|
| 3 | **계층 분리** | 컨트롤러에 `ChatClient`가 없다 |
| 8 | **폴백** | AI가 실패해도 주문 정보는 나간다 |

3번은 이 글의 출발점이었던 질문의 답이다. `ChatClient`는 `@Service`에 주입된다. 컨트롤러에 `ChatClient`가 `import`되어 있으면 되돌리라는 지시가 실습 자료에 명시되어 있다.

8번은 성격이 다르다. AI 기능이 실패했다고 화면 전체가 실패하면 안 된다는 것이다.

```java
// AI 가 죽어도 주문 정보는 보여 준다
String summary;
try { summary = callModel(order); }
catch (Exception e) { summary = order.getItem() + " · " + order.getStatus().label(); }
```

요약은 부가 정보이므로 없으면 없는 대로 주문 정보는 보여 준다. 교재는 이 판단이 데모와 실서비스를 가른다고 표현했다. 사용자에게는 안전한 문구와 추적 ID만 주고 상세는 로그에만 남긴다는 규칙도 함께 나온다.

## 정리

- 빌더와 메서드 체이닝은 키워드 인자가 없는 언어의 관례적 해법이다. 종료 메서드를 빠뜨리면 아무 일도 안 일어난다.
- `ChatClient`는 `ChatModel` 위의 Fluent API다. Advisor와 객체 변환이 붙을 지점이 여기다.
- 창구는 용도별로 나눈다. 추출용과 상담용의 온도가 같다면 나눌 때가 된 것이다.
- `ChatClient`는 라이브러리 타입이라 `@Configuration` + `@Bean`으로 만든다. 같은 타입이 여럿이면 `@Qualifier`.
- 사용자 입력은 자리표시자와 `.param()`으로 바인딩한다. 인젝션 표면을 좁히는 조치이지 차단은 아니다.
- `finishReason`이 `length`면 답이 잘린 것이다. 그냥 넘기면 사고가 된다.
- 컨트롤러는 AI를 모른다. AI가 실패해도 나머지 응답은 살린다.

여기까지가 Spring AI의 뼈대다. 다음 글부터는 같은 호출로 더 좋은 답을 받는 방법, 즉 프롬프트와 옵션과 스트리밍을 다룬다.

---

이전 글: [1일차 ② — 3대 추상화와 공급자 독립성](/posts/skala-springai-day1-architecture/) · 다음 글: [2일차 ① — 프롬프트가 가장 값싼 지렛대다](/posts/skala-springai-day2-prompt/)
