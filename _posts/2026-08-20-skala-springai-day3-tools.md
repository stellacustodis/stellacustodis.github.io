---
title: "[SKALA] Spring AI 3일차 ① — 판단은 모델, 실행은 우리 코드"
date: 2026-08-20 19:00:00 +0900
permalink: /posts/skala-springai-day3-tools/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, tool-calling, agent, mcp, security]
description: "@Tool로 평범한 메서드를 도구로 만들고, 모델이 보는 것이 설명뿐이라는 사실에서 출발해 ToolContext로 사용자 ID를 안전하게 전달하는 이유를 정리한다. ReAct 루프와 MCP까지 다룬다."
---

## 도구를 붙이는 순간 AI는 행동한다

3일차의 전제는 한 문장으로 요약된다.

> 판단은 모델, 실행은 우리 코드다.
{: .prompt-info }

모델은 DB나 API를 직접 부를 수 없다. 대신 "이 함수를 이 인자로 부르라"고 정하고, 실행은 Spring AI가 우리 코드로 한다. 결과를 다시 모델에 넣으면 모델이 실제 데이터에 근거해 최종 답을 만든다.

```text
질문 → 모델: 도구 호출 결정 → @Tool 실행 → 결과로 재요청 → 최종 답
```

이 왕복을 프레임워크가 대신 돌린다. 인자 파싱과 재요청까지 자동이다.

이 비대칭이 3일차 내용 전체를 만든다. **모델이 시켰다는 사실은 실행 근거가 되지 못한다.** 권한 검증도, 입력 검증도, 감사 로깅도 전부 우리 몫이다.

## @Tool: 평범한 메서드가 도구가 된다

```java
@Component
public class WeatherTools {

    /** 데모용 고정 데이터. 실제로는 외부 날씨 API 를 호출한다. */
    private static final Map<String, String> WEATHER = Map.of(
            "서울", "맑음, 29도, 습도 55%",
            "부산", "흐림, 27도, 습도 78%",
            "제주", "비, 25도, 습도 88%");

    @Tool(description = "지정한 도시의 현재 날씨를 조회한다. 한국 주요 도시만 지원한다.")
    public String currentWeather(
            @ToolParam(description = "도시 이름(예: 서울, 부산, 제주)") String city) {

        log.info("[TOOL] currentWeather city={}", city);
        return WEATHER.getOrDefault(city, city + " 의 날씨 정보는 제공하지 않습니다.");
    }
}
```

등록은 `.tools()` 한 줄이다.

```java
String answer = chat.prompt()
        .user("서울 지금 날씨 어때?")
        .tools(weatherTools)
        .call()
        .content();
```

클래스 주석의 지적이 중요하다. "도구를 등록해도 모델이 **항상 부르는 것은 아니다**. 필요하다고 판단할 때만 부른다. `"서울 날씨 어때?"`에는 부르고, `"안녕하세요"`에는 부르지 않는다."

## 모델이 보는 것은 설명뿐이다

이 장에서 가장 중요한 사실이다. 모델에게 전달되는 것은 **이름 · 설명 · 파라미터 스키마** 셋뿐이고, 메서드 본문은 절대 보지 못한다.

```java
@Tool(description = "주문번호로 배송 상태와 예상 도착일을 조회한다. 본인 주문만 조회된다.")
public String orderStatus(
        @ToolParam(description = "주문번호(숫자 5자리)") String orderId,
        ToolContext context) { ... }
```

모델에게 실제로 가는 것은 이런 형태다.

```json
{
  "name": "orderStatus",
  "description": "주문번호로 배송 상태와 예상 도착일을 조회한다. ...",
  "parameters": {
    "type": "object",
    "properties": {
      "orderId": {"type":"string","description":"주문번호(숫자 5자리)"}
    },
    "required": ["orderId"]
  }
}
```

`ToolContext`는 스키마에 포함되지 않는다. 뒤에서 다시 다룰 지점이다.

**설명이 곧 인터페이스다.** 함수 이름을 아무리 잘 지어도 설명이 부실하면 모델은 언제 불러야 할지 모른다. 실습이 이것을 실험으로 확인하게 한다.

```java
@Tool(description = """
        오늘의 점심 메뉴를 추천한다.
        '점심 뭐 먹지', '메뉴 추천해줘', '배고파' 같은 말에 사용한다.
        """)                        // ← 모델이 보는 것은 이 설명뿐이다
public String 점심추천(
        @ToolParam(description = "지금 기분이나 날씨. 예: 피곤, 더움") String 기분) {
    return switch (기분) {
        case "피곤" -> "국밥 (뜨끈하게 한 그릇)";
        case "더움" -> "냉면 (시원하게)";
        default     -> "김치찌개 (무난하게)";
    };
}

@Tool(description = "지금 서울 날씨를 알려 준다.")
public String 날씨() { return "맑음, 28도"; }
```

세 질문으로 동작을 확인한다.

```bash
curl 'localhost:8080/lab10/ask?q=안녕하세요'          # 도구 호출 없음
curl 'localhost:8080/lab10/ask?q=점심 뭐 먹지'        # 점심추천 1개
curl 'localhost:8080/lab10/ask?q=더운데 점심 뭐 먹지'  # 날씨 + 점심추천 2개
```

세 번째가 흥미롭다. `"더운데 점심 뭐 먹지"`에서 모델은 날씨를 먼저 조회하고 그 결과를 `점심추천`의 인자로 넘긴다. 우리가 순서를 지정하지 않았는데도 그렇게 한다.

그다음이 실습의 핵심이다. **설명을 `"점심 추천"` 네 글자로 줄이면 도구를 잘 안 부른다.** 코드는 한 줄도 바꾸지 않았는데 동작이 달라진다. 설명을 되돌리면 다시 불린다.

교재의 진단표에도 같은 항목이 첫 줄에 있다. **"도구가 안 불린다"의 90%는 설명 문제다.** 함수 이름을 바꾸기 전에 설명을 먼저 고치라는 것이다.

설명에 무엇을 쓸지도 구체적이다. "무엇을 하는가"가 아니라 **"언제 쓰는가"**를 쓴다. 사용자가 할 법한 표현을 예시로 넣는 것이 효과적이다.

## 사용자 ID를 프롬프트에 넣지 않는다

3일차에서 가장 중요한 보안 지점이다.

```java
@Tool(description = "주문번호로 배송 상태와 예상 도착일을 조회한다. 사용자 본인의 주문만 조회된다.")
public String orderStatus(
        @ToolParam(description = "주문번호(숫자 5자리)") String orderId,
        ToolContext context) {

    String userId = currentUser(context);
    log.info("[TOOL] orderStatus orderId={} by={}", orderId, userId);

    return findOwned(orderId, userId)
            .map(o -> "주문 %s · 품목 %s · 상태 %s · 예상도착 %s"
                    .formatted(o.id(), o.item(), o.status(), o.eta()))
            // 없는 주문과 남의 주문을 구분해 알려 주면 그 자체가 정보 노출이다
            .orElse("해당 주문을 찾을 수 없습니다.");
}

/**
 * 소유자 검증 — 이 한 줄이 없으면 "주문번호 아무거나 대 보기"로 남의 주문이 조회된다.
 * RAG·Tool 보안 사고는 대부분 이 지점에서 난다.
 */
private Optional<Order> findOwned(String orderId, String userId) {
    return Optional.ofNullable(ORDERS.get(orderId))
            .filter(o -> o.ownerId().equals(userId));
}

/** 사용자 ID 는 프롬프트가 아니라 ToolContext 로 온다 — 모델이 바꿔 부를 수 없는 경로다. */
private String currentUser(ToolContext context) {
    Object userId = context == null ? null : context.getContext().get("userId");
    if (userId == null) {
        throw new IllegalStateException("toolContext 에 userId 가 없다 — 호출부 설정을 확인하라");
    }
    return userId.toString();
}
```

호출부에서 `toolContext`로 주입한다.

```java
public String ask(String question, String userId) {
    return chat.prompt()
            .user(question)
            .tools(weatherTools, orderTools)
            // 사용자 ID 는 프롬프트가 아니라 이 통로로 — 모델이 바꿔 부를 수 없다
            .toolContext(Map.of("userId", userId))
            .call()
            .content();
}
```

`userId`를 `@ToolParam`으로 받으면 모델이 그 값을 정하게 된다. 사용자가 `"user2의 99999를 조회해줘"`라고 말하면 모델은 순순히 `userId="user2"`로 부를 수 있다. `ToolContext`는 스키마에 포함되지 않으므로 모델은 그런 파라미터가 있다는 사실조차 모른다.

`currentUser()`가 `userId`가 없을 때 예외를 던지는 것도 의도적이다. 조용히 `null`로 진행하면 소유자 비교가 통과해 버릴 수 있다. **설정 실수를 실행 시점에 드러낸다.**

또 하나 눈여겨볼 것은 **없는 주문과 남의 주문에 같은 문구를 쓴다**는 점이다. `"해당 주문을 찾을 수 없습니다."` 하나로 통일한다. 구분해서 알려 주면 "이 주문번호는 존재하지만 당신 것이 아니다"라는 정보가 새어 나간다. 존재 여부를 확인하는 도구가 되어 버리는 것이다.

이 원칙은 1일차의 `findByIdAndOwnerId`와 정확히 같다. 조회 후 필터링이 아니라 조회 조건에 소유자를 함께 건다.

## 도구는 모델 없이 테스트한다

권한 검증은 모델을 거치지 않고 직접 확인하는 편이 확실하다.

```java
class OrderToolsTest {

    private final OrderTools tools = new OrderTools();

    @Test
    @DisplayName("타인의 주문번호를 대면 조회되지 않는다")
    void 타인_주문은_조회되지_않는다() {
        // 99999 는 user-2 의 주문이다. 모델이 이 번호를 넘겨도 막혀야 한다.
        String result = tools.orderStatus("99999", new ToolContext(Map.of("userId", "user-1")));

        assertThat(result).isEqualTo("해당 주문을 찾을 수 없습니다.");
        // 존재 여부를 구분해 알려 주면 그 자체가 정보 노출이다 — 같은 문구를 쓴다
    }

    @Test
    @DisplayName("없는 주문번호도 같은 문구로 응답한다")
    void 없는_주문도_같은_문구다() {
        String result = tools.orderStatus("00000", new ToolContext(Map.of("userId", "user-1")));
        assertThat(result).isEqualTo("해당 주문을 찾을 수 없습니다.");
    }

    @Test
    @DisplayName("toolContext 에 userId 가 없으면 즉시 실패한다")
    void 컨텍스트가_없으면_실패한다() {
        assertThrows(IllegalStateException.class,
                () -> tools.orderStatus("12345", new ToolContext(Map.of())));
    }
}
```

두 번째 테스트가 첫 번째와 같은 문구를 단언한다는 점이 중요하다. **두 경우의 응답이 같아야 한다는 것 자체가 검증 대상**이다.

교재는 도구 테스트의 90%가 모델 없이 된다고 정리한다.

| 무엇을 | 어떻게 | 모델 호출 |
|---|---|---|
| 권한 격리 | 타인 ID로 호출해 차단되는지 | 없음 — 직접 호출 |
| 입력 검증 | 허용 목록 밖 값을 넘겨 본다 | 없음 |
| 실패 처리 | 예외 대신 메시지가 오는지 | 없음 |
| 반환 형식 | 모델이 읽을 문장인지 | 없음 — 사람이 읽어 본다 |
| 쓰기 계약 | 실행이 아니라 접수만 되는지 | 없음 |
| 도구 선택 | 적절한 상황에 불리는지 | 있음 — 소량·주기적 |

> "모델이 알아서 안 부르겠지"는 검증이 아니다.
{: .prompt-warning }

## 예외를 던지지 말고 메시지를 돌려준다

도구가 던진 예외는 대화 전체를 실패시킨다. 복구 가능한 실패는 메시지로 돌려주면 모델이 다음 수를 둔다.

```java
@Tool(description = "주문 상태를 조회한다")
String orderStatus(String orderId, ToolContext ctx) {
    try {
        return orders.findOwned(orderId, userOf(ctx))
                .map(this::describe)
                .orElse("해당 주문번호를 찾을 수 없습니다. 번호를 다시 확인해 주세요.");

    } catch (TimeoutException e) {          // 일시적 — 우리가 재시도한다
        log.warn("주문 API 지연 — 재시도", e);
        return retryOnce(orderId, ctx);

    } catch (Exception e) {                 // 복구 불가 — 상황만 알린다
        log.error("주문 조회 실패 orderId={}", orderId, e);
        return "지금은 주문 정보를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    }
}
```

여기에 미묘한 함정이 있다.

> `"다시 시도해 보세요"`를 반환하면 모델이 곧바로 같은 도구를 또 부른다. 재시도는 우리 코드 안에서 횟수를 정해 하고, 모델에게는 결과만 알려라.
{: .prompt-warning }

반환 문구가 모델의 다음 행동을 유도한다는 점이 흥미로웠다. 사용자에게 하는 안내와 모델에게 주는 신호가 같은 문자열이므로, 문구 하나가 무한 루프를 만들 수 있다.

이 지적은 교재의 도구 설계 리뷰 표에도 "같은 도구를 반복 호출 → 결과가 재시도를 유도한다 → '다시 시도' 문구 제거"로 다시 나온다.

## 반환값은 모델이 읽을 문장으로

DB 엔티티를 그대로 반환하면 토큰만 먹고 정확도는 떨어진다.

| 나쁜 반환 | 무엇이 문제인가 | 좋은 반환 |
|---|---|---|
| 엔티티 전체(30필드) | 불필요한 필드가 토큰을 먹고 잡음이 된다 | 필요한 5필드만 담은 record |
| 전체 목록(수백 건) | 컨텍스트를 넘겨 응답이 잘린다 | 상위 10건 + "총 N건" 안내 |
| 원시 JSON 덩어리 | 모델이 해석에 실패하기 쉽다 | 한 줄 요약 문장 + 핵심 수치 |
| `null` / 빈 문자열 | 모델이 상황을 설명하지 못한다 | "조회 결과 없음" 같은 명시 문구 |
| 스택트레이스 | 내부 구조가 사용자에게 새어 나간다 | "일시적 오류" 같은 안전한 메시지 |

샘플 코드가 이 원칙을 따른다. `Order` 객체가 아니라 `"주문 12345 · 품목 무선 이어폰 · 상태 배송중 · 예상도착 2026-07-30"` 같은 문장을 돌려준다.

목록도 마찬가지다.

```java
@Tool(description = "사용자의 최근 주문 목록을 조회한다. 최대 5건까지 반환한다.")
public String recentOrders(ToolContext context) {
    List<Order> mine = ORDERS.values().stream()
            .filter(o -> o.ownerId().equals(userId))
            .sorted((a, b) -> b.eta().compareTo(a.eta()))
            .limit(5)
            .toList();

    if (mine.isEmpty()) {
        return "조회된 주문이 없습니다.";
    }
    return mine.stream()
            .map(o -> "- %s / %s / %s".formatted(o.id(), o.item(), o.status()))
            .reduce("최근 주문 %d건:".formatted(mine.size()), (a, b) -> a + "\n" + b);
}
```

설명에 `"최대 5건까지 반환한다"`고 적어 둔 것도 의도가 있다. 모델이 "전부 보여 달라"는 요청에 대해 한계를 알고 답할 수 있다.

## 도구가 실제로 불렸는지 확인하기

```java
public Map<String, Object> askVerbose(String question, String userId) {
    ChatResponse response = chat.prompt()
            .user(question)
            .tools(weatherTools, orderTools)
            .toolContext(Map.of("userId", userId))
            .call()
            .chatResponse();

    return Map.of(
            "answer", response.getResult().getOutput().getText(),
            "finishReason", String.valueOf(response.getResult().getMetadata().getFinishReason()),
            "promptTokens", response.getMetadata().getUsage().getPromptTokens(),
            "completionTokens", response.getMetadata().getUsage().getCompletionTokens());
}
```

1일차에 본 `finishReason`이 여기서 `tool_calls`라는 값을 갖는다. 로그 레벨을 올려도 확인할 수 있다.

```yaml
logging.level.org.springframework.ai.tool: DEBUG
```

## 병렬 도구 호출

모델은 한 번에 여러 도구를 동시에 부르겠다고 응답할 수 있다. `"서울이랑 부산 날씨 둘 다 알려줘"`면 `currentWeather`를 두 번 부른다.

```text
모델 응답(1차) — tool_calls 두 건이 한 번에 온다
  [ {name: currentWeather, args: {city: "서울"}},
    {name: currentWeather, args: {city: "부산"}} ]
```

우리 코드는 그냥 `@Tool` 메서드일 뿐이라 별도 처리가 필요 없다. 다만 조건이 있다.

> 도구가 상태를 바꾸면 병렬 호출이 위험하다. 조회 도구는 안전하지만, 쓰기 도구는 같은 자원에 동시에 닿을 수 있다 — 멱등성을 확보하거나 순차 실행을 강제하라.
{: .prompt-warning }

## ReAct: 도구 호출을 여러 스텝 잇는다

한 번에 끝나지 않는 일은 생각(Reason) → 행동(Act) → 관찰(Observe)을 반복한다. Tool Calling이 한 번의 호출이라면 ReAct는 그것을 여러 스텝 잇는 것이다.

교재의 정의가 인상적이었다. **에이전트는 똑똑한 존재가 아니라 반복하는 구조다.** 그래서 잘 도는 것보다 언제 멈추는지를 먼저 정해야 한다.

```java
public String runAgent(String goal, String userId) {
    var budget = new AgentBudget(8, 50_000, Duration.ofSeconds(60)); // 회·토큰·시간
    var seen = new HashSet<String>();

    for (int step = 1; budget.hasRoom(); step++) {
        ChatResponse res = chat.prompt().user(goal)
                .tools(tools).toolContext(Map.of("userId", userId))
                .call().chatResponse();
        budget.consume(res.getMetadata().getUsage(), step);

        var calls = res.getResult().getOutput().getToolCalls();
        if (calls.isEmpty()) {
            return res.getResult().getOutput().getText();      // 정상 종료
        }
        for (var c : calls) {                    // 같은 호출 반복 = 진전 없음
            if (!seen.add(c.name() + c.arguments())) {
                return "요청을 완료하지 못했습니다. 조건을 좁혀 다시 요청해 주세요.";
            }
        }
    }
    return "처리 시간이 길어져 중단했습니다.";
}
```

상한이 세 종류라는 점이 실무적이다. **반복 횟수 · 토큰 · 시간**을 각각 건다. 하나만 걸면 다른 축에서 폭주할 수 있다.

`seen` 집합도 좋은 장치다. 같은 도구를 같은 인자로 다시 부르면 진전이 없다는 뜻이므로 끊는다. 횟수 상한에 도달하기 전에 무의미한 반복을 조기에 감지한다.

> 상한 없는 에이전트는 비용 사고로 직행한다. 상한은 기능이 아니라 안전장치다.
{: .prompt-warning }

## 멀티 에이전트는 언제

도구가 많아지면 한 에이전트가 고르기 어려워진다. 교재의 기준은 구체적이다.

| 구성 | 형태 | 적합 | 주의 |
|---|---|---|---|
| 단일 에이전트 | 도구 5~7개 | **대부분의 경우** | 도구가 늘면 정확도 하락 |
| 감독자형 | 라우터가 전문가에게 위임 | 업무 영역이 뚜렷이 갈릴 때 | 라우팅 오류가 전체를 망친다 |
| 순차 파이프라인 | 역할을 순서대로 통과 | 단계가 정해진 업무 | 단계마다 지연이 누적 |
| 병렬 + 통합 | 여러 관점을 동시에 낸 뒤 합침 | 리뷰 · 다면 분석 | 비용이 배수로 는다 |

**도구 5~7개를 넘어가면** 단일 에이전트의 선택 정확도가 떨어지기 시작한다. 그때가 나눌 시점이지, 처음부터 멀티 에이전트로 시작할 이유는 없다는 것이다.

## MCP: 도구를 붙이는 표준

MCP(Model Context Protocol)는 도구·자원을 공통 프로토콜로 노출하는 규약이다. 교재의 비유는 USB-C였다. 기기마다 다른 충전기 대신 규격 하나로 통일하는 것이다.

클라이언트로 붙는 쪽은 설정이 거의 전부다.

```yaml
spring:
  ai:
    mcp:
      client:
        enabled: true
        name: helpdesk-client
        stdio:                          # 로컬 프로세스로 띄우는 MCP 서버
          connections:
            filesystem:
              command: npx
              args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"]
        sse:                            # 원격 MCP 서버
          connections:
            internal: { url: "http://mcp-internal:8080" }
```

```java
@Bean
ChatClient mcpChatClient(ChatClient.Builder b, SyncMcpToolCallbackProvider mcpTools) {
    return b.defaultToolCallbacks(mcpTools).build();   // 자동 구성된 도구 주입
}
```

반대로 우리 도구를 공개할 수도 있다. `@Tool` 메서드가 그대로 MCP 도구가 된다.

```java
@Configuration
class McpServerConfig {

    @Bean
    ToolCallbackProvider helpdeskTools(TicketTools tickets, KbTools kb) {
        return MethodToolCallbackProvider.builder()
                .toolObjects(tickets, kb)        // @Tool 메서드가 곧 MCP 도구
                .build();
    }
}
```

MCP는 이름·설명·스키마로 도구를 기술하는 방식을 표준화한 것이므로, 앞에서 본 "설명이 곧 인터페이스"라는 원칙이 그대로 적용된다. 교재는 도입 시점에 대해서도 현실적이다. "실제로 붙이는 일은 도구가 여러 개로 늘어난 다음에 해도 늦지 않다."

다만 경고가 붙는다. 아무 기기나 꽂지 않듯 인증과 공개 범위를 통제해야 한다. **MCP 서버는 원격 실행 통로가 될 수 있다.**

## 정리

- 모델은 함수를 실행하지 않는다. 무엇을 부를지 알려 줄 뿐이고 실행은 우리 코드다.
- 모델이 보는 것은 이름·설명·파라미터 스키마뿐이다. "도구가 안 불린다"의 90%는 설명 문제다.
- 설명에는 "무엇을 하는가"가 아니라 "언제 쓰는가"를 쓴다.
- 사용자 ID는 `@ToolParam`이 아니라 `ToolContext`로 넘긴다. 스키마에 없으므로 모델이 바꿔 부를 수 없다.
- 없는 주문과 남의 주문은 같은 문구로 응답한다. 구분하면 존재 여부가 새어 나간다.
- 예외를 던지지 말고 메시지를 돌려준다. 단, "다시 시도해 보세요"는 모델의 재호출을 유도한다.
- 반환값은 모델이 읽을 문장으로. 엔티티 통째로는 토큰만 먹는다.
- 도구 테스트의 90%는 모델 없이 된다. 특히 권한 검증은 직접 호출로 확인한다.
- 에이전트 루프에는 반복·토큰·시간 세 종류의 상한을 건다.

다음 글에서는 이 힘을 통제하는 장치들, 감사 로깅과 인가와 승인 게이트를 다룬다.

---

이전 글: [2일차 ⑤ — 넓게 찾고 좁게 넣는다](/posts/skala-springai-day2-rag-advanced/) · 다음 글: [3일차 ② — 자율성의 크기는 되돌릴 수 있는 정도에 맞춘다](/posts/skala-springai-day3-tool-safety/)
