---
title: "[SKALA] Spring AI 3일차 ④ — HelpDesk AI, 조각들을 하나로"
date: 2026-08-20 22:00:00 +0900
permalink: /posts/skala-springai-day3-helpdesk/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, architecture, sse, capstone, retrospective]
description: "RAG·Tool·메모리·안전·관찰을 하나의 상담 서비스로 엮는 종합 실습을 Phase 단위로 정리하고, 멀티턴 검증 시나리오와 3일 과정 전체의 회고를 남긴다."
---

## 새로운 기술은 없다

종합 실습의 결론이 교재에 한 줄로 적혀 있다.

> 실무 AI 서비스는 한 기능이 아니라 조합이다. 새로운 기술은 없었다 — 배운 것을 한 흐름 안에서 협력시켰을 뿐이다.
{: .prompt-info }

만드는 것은 사내 규정과 실시간 데이터를 함께 다루는 상담 어시스턴트다. 시나리오가 각 기능의 필요성을 자연스럽게 드러낸다.

| 무엇을 묻고 | 무엇이 필요한가 |
|---|---|
| "반품 규정이 어떻게 되나요?" | 사내 문서 근거 + 출처 (RAG) |
| "제 주문 12345 지금 어디예요?" | 실시간 주문 데이터 (Tool) |
| "그럼 그거 반품 돼요?" | 앞 대화의 맥락 (Memory) |
| "교환으로 바꿔 주세요" | 티켓 생성 + 승인 게이트 (Tool·통제) |
| "어제 비용이 왜 늘었지?" | 토큰·지연·오류 지표 (관찰) |

세 번째 줄이 가장 까다롭다. `"그거"`를 해석하려면 앞의 두 턴을 모두 기억해야 하고, 규정(RAG)과 주문 상태(Tool)를 함께 참조해야 한다.

## 요구사항에 검증 방법을 붙인다

기능 요구는 "무엇을 하는가", 비기능 요구는 "어떻게 버티는가"다. AI 서비스의 비기능에는 정확도·비용·안전이 추가된다.

| 구분 | 요구사항 | 검증 방법 |
|---|---|---|
| 기능 | 문서 근거로 답하고 출처를 표시한다 | 출처 없는 답변이 나오면 실패 |
| 기능 | 주문·티켓을 실시간 조회·생성한다 | 도구 호출 로그에 기록이 남는가 |
| 기능 | 3턴 이상 맥락을 유지한다 | 대명사 질문("그건")에 정상 응답 |
| 비기능 | P95 응답 5초 이내(비스트리밍) | 부하 테스트 지표 |
| 비기능 | 질의당 평균 토큰 상한 준수 | Micrometer 토큰 카운터 |
| 비기능 | 인젝션·민감어 차단, 모든 도구 호출 감사 | 레드팀 프롬프트 10종 통과 |
| 비기능 | 주 모델 장애 시 폴백으로 응답 지속 | 장애 주입 테스트 |

각 요구사항에 검증 방법을 붙여 두면 완료 판정이 명확해진다는 것이 이 표의 요점이다. "정확하게 답한다" 같은 요구는 검증할 수 없지만 "출처 없는 답변이 나오면 실패"는 검증할 수 있다.

## 패키지 구조: Phase 번호 = 파일 위치

1일차의 계층 구조가 그대로 유지되고, 그 위에 AI 축이 더해진다.

```text
com/skala/helpdesk/
├─ HelpDeskApplication.java
├─ config/       AiConfig.java              // Phase 1 — ChatClient·Advisor 조립
│                HelpDeskProperties.java    //           설정 외부화
├─ web/          ChatController.java        // Phase 6 — REST + SSE  (Controller)
│                AdminController.java       //           인제스트·승인
├─ chat/         HelpDeskService.java       // Phase 3·5 — 업무 흐름  (Service)
│                AnswerDto.java             // Phase 6 — 구조화 응답  (DTO)
├─ repository/   OrderRepository.java       // Phase 4 — 데이터 접근  (Repository)
├─ rag/          IngestService.java         // Phase 2 — 문서 → 청크 → 벡터
├─ tools/        OrderTools.java            // Phase 4 — 주문 조회
│                TicketTools.java           // Phase 4 — 티켓 접수(승인)
├─ advisor/      AuditAdvisor.java          // Phase 7 — 감사 로깅
└─ eval/         GoldenSet.java             // Phase 8 — 품질 기준선
```

Controller-Service-Repository가 그대로 있고, `config`·`rag`·`tools`·`advisor`·`eval`이 추가됐다. 1일차 첫 시간에 본 표가 실제 디렉터리로 구현된 형태다.

## Phase 1: 설정 외부화와 체인 조립

코드에 상수를 남기지 않는다.

```yaml
spring.ai:
  openai:
    api-key: ${OPENAI_API_KEY}
    chat.options: { model: gpt-4o-mini, temperature: 0.2 }
  vectorstore.pgvector: { initialize-schema: true, dimensions: 1536 }
helpdesk: { rag: { top-k: 5, threshold: 0.62 }, memory: { max: 20 } }
```

`top-k`와 `threshold`가 설정으로 나와 있는 것이 중요하다. 2일차 실험표에서 조정해야 했던 값들이므로, 소스를 다시 빌드하지 않고 환경별 설정으로 바꿀 수 있어야 한다. 다만 일반적인 `@ConfigurationProperties`만으로 실행 중 값이 자동 갱신되지는 않으므로, 별도 refresh 체계가 없다면 설정 반영에는 애플리케이션 재시작이 필요하다.

```java
@Bean
ChatClient helpDeskClient(ChatClient.Builder builder, VectorStore vs,
                          ChatMemory memory, AiProperties props,
                          AuditAdvisor audit, TokenMeterAdvisor meter) {
    return builder.defaultSystem(systemPrompt)              // prompts/system.st
        .defaultAdvisors(audit, meter,                      // 감사·계측(바깥)
            SafeGuardAdvisor.builder()
                .sensitiveWords(List.of("주민등록번호", "카드번호")).build(),
            MessageChatMemoryAdvisor.builder(memory).build(),
            QuestionAnswerAdvisor.builder(vs).searchRequest(
                SearchRequest.builder().topK(props.rag().topK())
                    .similarityThreshold(props.rag().threshold()).build()).build())
        .build();
}
```

`defaultSystem(systemPrompt)`이 `prompts/system.st` 파일에서 읽힌다. 2일차의 "프롬프트를 코드 밖으로"가 적용됐다.

## Phase 2: 인제스트와 확인 창구

인제스트 코드 자체는 2일차와 같다. 새로운 것은 **결과를 확인하는 창구**다.

```java
@GetMapping("/api/admin/chunks")     // 무엇이 들어갔는지 눈으로 본다
@PreAuthorize("hasRole('ADMIN')")
public List<Map<String, Object>> inspect(@RequestParam String q,
                                         @RequestParam(defaultValue = "5") int topK) {
    var hits = vectorStore.similaritySearch(
            SearchRequest.builder().query(q).topK(topK).build());

    return hits.stream().map(d -> Map.<String, Object>of(
            "source",  d.getMetadata().get("source"),
            "version", d.getMetadata().get("version"),
            "score",   d.getScore(),          // 유사도 — 임계값 조정 근거
            "preview", d.getText().substring(0, Math.min(160, d.getText().length()))
    )).toList();
}
```

교재의 표현이 정확하다. **"인제스트는 성공 메시지가 아니라 결과물로 확인한다."** 여기서 안 잡으면 Phase 3에서 원인을 못 찾는다.

`@PreAuthorize("hasRole('ADMIN')")`가 붙어 있는 점도 짚어 둘 만하다. 이 엔드포인트는 문서 내용을 그대로 노출하므로 운영에서 인가 대상이다. 앞 글처럼 `@EnableMethodSecurity`로 메서드 보안을 활성화했다는 전제가 필요하다.

## Phase 3: 출처를 꺼낸다

```java
public Answer ask(String question, String conversationId) {

    ChatClientResponse response = chat.prompt()
            .user(question)
            .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, conversationId))
            .call()
            .chatClientResponse();          // 응답 + Advisor 컨텍스트

    List<Document> used = (List<Document>) response.context()
            .get(QuestionAnswerAdvisor.RETRIEVED_DOCUMENTS);
    List<Source> sources = used == null ? List.of() : used.stream()
            .map(d -> new Source((String) d.getMetadata().get("source"),
                                 (String) d.getMetadata().get("version")))
            .distinct().toList();

    String text = response.chatResponse().getResult().getOutput().getText();
    return new Answer(text, sources);
}
```

1일차에 배운 `chatClientResponse()`, 2일차에 넣은 `source`·`version` 메타데이터, 그리고 `RETRIEVED_DOCUMENTS` 키가 여기서 하나로 만난다. 세 가지 중 하나라도 빠지면 출처가 나오지 않는다.

## Phase 4: 도구와 소유자 검증

```java
@Tool(description = "주문번호로 배송 상태와 예상 도착일을 조회한다")
String orderStatus(@ToolParam(description = "주문번호") String orderId,
                   ToolContext ctx) {
    String userId = (String) ctx.getContext().get("userId");
    return orders.findOwned(orderId, userId)          // 소유자 검증 필수
            .map(o -> "주문 %s · 상태 %s · 예상도착 %s".formatted(o.id(), o.status(), o.eta()))
            .orElse("해당 주문을 찾을 수 없습니다.");
}
```

```java
@Tool(description = "교환·환불 티켓을 접수한다. 처리는 담당자 승인 후 진행된다.")
String createTicket(@ToolParam(description = "주문번호") String orderId,
                    @ToolParam(description = "EXCHANGE|REFUND") String type,
                    @ToolParam(description = "사유") String reason, ToolContext ctx) {
    if (!"EXCHANGE".equals(type) && !"REFUND".equals(type)) {
        return "지원하지 않는 티켓 유형입니다.";
    }
    Ticket t = tickets.request(orderId, type, reason, userOf(ctx));
    return "티켓 %s 를 접수했습니다. 승인 후 처리됩니다.".formatted(t.no());
}
```

`type` 파라미터의 설명에 `"EXCHANGE|REFUND"`를 적으면 모델을 유도할 수는 있지만 값을 강제하지는 않는다. 위 코드는 서버 측 허용 목록으로 막았고, 실제 구현에서는 Java `enum`이나 JSON Schema의 `enum`으로 타입 경계도 좁히는 편이 낫다.

실습 자료의 버전은 권한 검증을 먼저 하고 티켓을 만든다.

```java
orders.findByIdAndOwnerId(orderId, userId)                    // 권한 먼저
      .orElseThrow(() -> new IllegalArgumentException("주문을 찾을 수 없습니다."));

Ticket ticket = tickets.create(orderId, userId, reason);      // 상태: PENDING
audit.log("REFUND_REQUESTED", userId, orderId, ticket.no());
```

남의 주문에 대해 티켓을 만들 수 없다. 그리고 실제 처리는 모델이 닿을 수 없는 경로에 둔다.

```java
@PostMapping("/lab3/admin/tickets/{no}/approve")
@PreAuthorize("hasRole('ADMIN')")
public TicketView approve(@PathVariable String no) { return tickets.approve(no); }
```

## Phase 5: 멀티턴이 실제로 되는지

3턴 테스트가 통합 검증 역할을 한다.

| 턴 | 사용자 입력 | 무엇을 검증하나 |
|---|---|---|
| 1 | "단순 변심 반품은 며칠 이내인가요?" | RAG — 규정 답변 + 출처 |
| 2 | "제 주문 12345는 지금 어디예요?" | 도구 — 실시간 상태 조회 |
| 3 | "그럼 그거 반품 돼요?" | 메모리 — 1·2를 함께 참조(대명사 해석) |
| 4 | "환불로 접수해 주세요" | 승인 게이트 — 티켓 번호 + 대기 안내 |
| 5 | (새 세션에서) "그거 어떻게 됐어요?" | 맥락 없음 — 되묻는다(세션 격리) |

3번이 통과하면 메모리·RAG·Tool이 함께 살아 있다는 뜻이다. 세 기능 중 하나라도 죽어 있으면 `"그거"`를 해석하지 못한다.

5번이 특히 잘 설계된 검증이다. **없어야 할 것이 없는지**를 확인한다. 새 세션에서 앞 대화를 기억한다면 대화 ID 규칙이 잘못된 것이다. 앞 글의 "남의 대화가 섞인다"는 사고가 여기서 잡힌다.

마지막에 티켓 상태를 확인한다.

```bash
/lab3/admin/tickets/pending   # 4번 티켓이 PENDING 으로만 남아 있다
```

## Phase 6: 구조화 응답과 SSE

화면이 쓰기 좋게 답변·출처·도구 사용 여부를 나눠 반환한다.

```java
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    @PostMapping                                          // 동기 — 구조화 응답
    AnswerDto ask(@RequestBody AskRequest req, Principal user) {
        return service.ask(req.question(), user.getName(), req.sessionId());
    }

    @PostMapping(value = "/stream",                        // 스트리밍
                 produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    Flux<ServerSentEvent<String>> stream(@RequestBody AskRequest req, Principal user) {
        return service.stream(req.question(), user.getName(), req.sessionId())
                .map(c -> ServerSentEvent.builder(c).event("token").build())
                .concatWith(Mono.fromCallable(() ->
                        ServerSentEvent.builder(service.lastSources(req))
                                .event("sources").build()))   // 마지막에 출처
                .timeout(Duration.ofSeconds(60));
    }
}

record AnswerDto(String answer, List<Source> sources, boolean toolUsed) {}
```

스트리밍에서 **출처를 마지막 이벤트로 내보내는 것**이 이 구현의 요점이다. 스트리밍은 토큰이 오는 대로 흘려보내므로 출처를 앞에 붙일 수 없다. 이벤트 이름을 구분해 두면 클라이언트가 `token`은 화면에 이어 붙이고 `sources`는 하단에 표시할 수 있다.

`Principal`에서 사용자 이름을 꺼내는 것도 중요하다. 요청 본문의 `userId`를 믿지 않는다. 3일차 내내 반복된 원칙이 웹 계층에서도 유지된다.

`AnswerDto`의 `toolUsed`는 화면이 "실시간 데이터를 조회했음"을 표시할 수 있게 한다. 답변만 던지지 않는다는 것이 이 Phase의 요지다.

## 자주 막히는 지점

3일차 실습 자료의 진단표다. 첫 줄이 압도적으로 흔하다.

| 증상 | 원인 | 해결 |
|---|---|---|
| **도구가 안 불린다** | **설명이 부실하다** | "언제 쓰는지"와 예시 표현을 설명에 넣는다 |
| 엉뚱한 인자로 부른다 | 파라미터 설명 부족 | `@ToolParam`에 예시 값을 적는다 |
| 남의 주문이 조회된다 | `userId`를 파라미터로 받았다 | `ToolContext`로 옮긴다 |
| 같은 도구를 무한 호출 | 실패 메시지가 애매하다 | 명확한 실패 문구 + 호출 상한 |
| 스트리밍에서 감사 누락 | `CallAdvisor`만 구현 | `StreamAdvisor`도 함께 구현 |
| 대화가 섞인다 | 대화 ID 규칙이 흩어졌다 | 생성 지점을 한 곳으로 |
| 응답이 3초를 넘는다 | 도구 지연 + 모델 2회 호출 | 구간 측정 후 병렬 호출 검토 |

> 도구가 안 불리면 설명부터 확인한다. 모델은 메서드 본문이 아니라 전달된 이름·설명·파라미터 스키마를 본다. 함수 이름을 바꾸기 전에 설명과 스키마를 먼저 고쳐라.
{: .prompt-warning }

## 완료 기준

3일차 완료 기준 9개 중 교재가 "진짜 학습 지점"으로 표시한 것은 2·3·6번이다.

| # | 확인 항목 | 통과 기준 |
|---|---|---|
| 1 | 도구 호출 | 주문 질문에 도구가 불린다 |
| 2 | **권한 격리** | 남의 주문 차단 — ID 주입 시도 포함 |
| 3 | **승인 게이트** | 환불이 접수로만 남는다 |
| 4 | RAG 결합 | 규정 답변에 출처가 붙는다 |
| 5 | 멀티턴 | 대명사 후속 질문이 동작한다 |
| 6 | **Advisor 순서** | 차단이 메모리 저장보다 앞 |
| 7 | 감사 로그 | 모든 도구 호출을 추적할 수 있다 |
| 8 | 계측 | 토큰 · 지연 · 도구 지표가 쌓인다 |
| 9 | 레드팀 | 8개 중 7개 이상 방어 |

셋의 공통점이 있다. **정상 동작으로는 확인되지 않는 항목들**이다. 권한 격리는 뚫어 봐야 알고, 승인 게이트는 상태를 봐야 알고, Advisor 순서는 이력을 봐야 안다. 기능이 되는지가 아니라 **되면 안 되는 것이 안 되는지**를 검증한다.

## 3일 과정을 한 줄로

교재의 요약은 이렇다. **구조 → 근거 → 행동.**

1일차는 구조였다. AI를 새 계층으로 만들지 않고 기존 계층에 얹었다. 컨트롤러는 AI를 모르고, `ChatClient`는 서비스에 주입된다.

2일차는 근거였다. 프롬프트로 형식을 잡고, 응답을 객체로 받고, 문서를 검색해 붙였다. "모르면 모른다"고 답할 수 있게 만드는 것이 목표였다.

3일차는 행동이었다. 도구를 쥐여 주되 실행 권한은 코드가 쥐고, 되돌릴 수 없는 일에는 사람을 세우고, 공통 관심사를 Advisor 체인에 모았다.

Phase별로 정리하면 각 단계의 핵심 판단이 드러난다.

| Phase | 무엇을 만들었나 | 핵심 판단 |
|---|---|---|
| 1 | 설정 외부화 · Advisor 체인 | 차단은 저장보다 앞 |
| 2 | 문서 인제스트 | 재색인 · 메타데이터 |
| 3 | RAG 답변 + 출처 | 응답 컨텍스트에서 근거를 꺼낸다 |
| 4 | 주문·티켓 도구 | 소유자 검증은 도구 안에서 |
| 5 | 대화 메모리 | `conversationId` 규칙을 한 곳에 |
| 6 | 구조화 응답 · SSE | 답변만 던지지 않는다 |

## 회고: Java를 모르는 상태에서 시작해서

이 시리즈의 첫 글에 적었듯 나는 Java와 Spring에 익숙하지 않은 상태로 이 과정을 들었다. 3일이 지난 지금 그 조건이 어떻게 작용했는지 정리해 둔다.

**LLM 개념이 익숙한 것은 도움이 됐다.** 토큰·임베딩·컨텍스트 윈도우·환각은 이미 다뤄 본 것이라, 배워야 할 것이 "이 개념이 Spring 안에서 어떤 자리를 차지하는가" 하나로 좁혀졌다. `EmbeddingModel`이 무엇인지 이해하는 데 시간을 쓸 필요가 없었고, 그것이 `@Bean`으로 등록되어 생성자로 주입된다는 사실에 집중할 수 있었다.

**반대로 Spring의 관례를 모르는 것은 반복적인 비용이었다.** `@Configuration`과 `@Component`의 차이, `@Qualifier`가 필요한 시점, `@ConditionalOnMissingBean`이 무엇을 하는지를 매번 확인해야 했다. 다만 이 과정에서 확인한 것들이 서로 연결되어 있었다는 점이 다행이었다. `ChatClient`가 `@Bean`이어야 하는 이유(라이브러리 타입이라 `@Component`를 붙일 수 없다)는 `VectorStore`에도 그대로 적용됐고, `@Qualifier`가 필요한 이유(같은 타입 빈이 둘)는 용도별 클라이언트 분리와 같은 이야기였다.

**가장 유용했던 것은 판단 기준이었다.** 3일 동안 반복해서 나온 문장들은 대부분 Spring AI 사용법이 아니라 설계 판단이었다.

- 판단은 모델, 실행은 우리 코드
- 권한은 프롬프트가 아니라 코드로
- 답이 이상하면 검색 결과를 먼저 눈으로 본다
- 차단은 저장보다 앞
- 상한 없는 반복은 비용 사고

이 문장들은 Spring AI가 아니라 다른 프레임워크를 쓸 때도 유효하다. 실제로 Python에서 같은 종류의 애플리케이션을 만든다면 클래스 이름만 달라질 뿐 판단은 그대로일 것이다.

**한 가지 더 남는 것은 "실패를 어떻게 다루는가"에 대한 감각이다.** 교재가 반복해서 짚은 함정들에는 공통점이 있었다. 중복 적재, 메타데이터 누락, Advisor 순서 오류, 스트리밍에서 빠지는 계측 — 전부 **오류를 내지 않는 실패**다. 정상적으로 동작하는 것처럼 보이면서 품질만 조용히 나빠진다. AI 애플리케이션에서 이런 종류의 실패가 유독 많은 이유는 출력이 어차피 확률적이라 이상해도 눈치채기 어렵기 때문일 것이다.

그래서 3일 과정에서 가장 자주 나온 지시가 "눈으로 봐라"였다. 검색 결과를 눈으로 보고, 청크 수를 세어 보고, 이력을 조회해 보고, 뚫어 보라는 것. 도구를 아는 것보다 확인하는 습관이 먼저라는 얘기로 이해했다.

## 정리

- 종합 실습에 새로운 기술은 없다. 배운 조각을 한 흐름에서 협력시킨다.
- 요구사항에는 검증 방법을 붙인다. 검증할 수 없는 요구는 완료 판정도 못 한다.
- 1일차의 계층 구조가 그대로 유지되고 `config`·`rag`·`tools`·`advisor`·`eval`이 더해진다.
- 인제스트는 성공 메시지가 아니라 결과물로 확인한다.
- 스트리밍에서 출처는 마지막 이벤트로 내보낸다.
- 완료 기준의 핵심 항목은 "되면 안 되는 것이 안 되는지"를 검증한다.
- 3일을 한 줄로 요약하면 구조 → 근거 → 행동이다.

---

이전 글: [3일차 ③ — 순서가 곧 정책이다](/posts/skala-springai-day3-advisors/) · 시리즈 처음: [3일 학습 로드맵](/posts/skala-springai-roadmap/)
