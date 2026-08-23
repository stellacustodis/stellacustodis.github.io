---
title: "[SKALA] Spring AI 2일차 ② — 문자열을 파싱하지 않는다"
date: 2026-08-19 20:00:00 +0900
permalink: /posts/skala-springai-day2-structured/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, structured-output, record, multimodal, testing]
description: "entity()로 LLM 응답을 자바 record로 받는 구조화 출력의 동작 원리와 타입 변환 함정을 정리한다. 형식이 깨졌을 때의 3단 복구 전략과, 모델을 부르지 않는 단위 테스트까지 다룬다."
---

## 파싱 코드가 사라진다

LLM 응답을 다룰 때 가장 성가신 부분은 문자열 후처리다. JSON으로 달라고 했는데 앞에 설명이 붙어 있거나, 코드펜스로 감싸져 있거나, 필드 이름이 미묘하게 다르다. 그래서 정규식으로 자르고 예외를 잡는 코드가 쌓인다.

Spring AI의 구조화 출력은 이 코드를 통째로 지운다.

```java
record Review(String sentiment, int score, List<String> keywords) {}

Review r = chat.prompt()
        .user("다음 리뷰를 분석해줘:\n" + text)
        .call()
        .entity(Review.class);
```

`.entity(Review.class)` 한 줄이면 `r.sentiment()`, `r.score()`, `r.keywords()`를 타입 안전하게 쓸 수 있다.

1일차에 배운 DTO 규칙이 여기서 다른 의미를 갖는다. "나갈 때는 DTO로"라는 관례가 번거롭게만 느껴졌는데, 그 `record`가 그대로 **LLM에게 주는 출력 명세**가 된다. 응답 모양을 타입으로 정의해 두면 그 타입이 API 계약이자 모델 지시서 역할을 동시에 한다.

## entity()는 안에서 무슨 일을 하나

한 줄로 보이지만 두 가지 일이 일어난다.

```text
타입 → JSON Schema 생성 → 프롬프트에 첨부
모델 응답(JSON) → Converter 파싱 → record 매핑
```

`BeanOutputConverter`가 그 두 방향을 담당한다. 직접 쓰면 형식 지시문의 위치를 내가 정할 수 있다.

```java
/**
 * ④ converter 를 직접 써서 형식 지시문의 위치를 내가 정한다.
 * {@code entity()} 는 이 과정을 한 줄로 줄인 것이다.
 */
public Ticket classifyWithExplicitFormat(String inquiry) {
    var converter = new BeanOutputConverter<>(Ticket.class);

    String answer = chat.prompt()
            .user(u -> u.text("""
                    다음 고객 문의를 분류하라.
                    {format}
                    ---
                    문의: {inquiry}""")
                    .param("format", converter.getFormat())
                    .param("inquiry", inquiry))
            .call()
            .content();

    return converter.convert(answer);
}
```

`converter.getFormat()`을 출력해 보면 실제로 어떤 스키마가 붙는지 볼 수 있다.

```json
{ "type":"object", "properties": {
    "category": {"type":"string","description":"BILLING·DELIVERY..."} ...
  }, "required":[...] }
```

여기서 중요한 사실이 하나 나온다. **스키마도 프롬프트다.** 필드 설명을 넣으면 정확도가 오른다.

```java
record Ticket(
        @JsonPropertyDescription("BILLING·DELIVERY·REFUND·ETC 중 하나")
        String category,

        @JsonPropertyDescription("HIGH 는 결제·보안 문제일 때만")
        String priority,

        @JsonPropertyDescription("고객 문의를 한 문장으로 요약")
        String summary) { }
```

필드 이름만으로는 `priority`에 무엇을 넣어야 할지 모델이 판단할 수 없다. 설명을 붙이면 그 판단 기준이 스키마에 함께 실린다.

## 목록과 중첩

여러 건을 받을 때는 제네릭 타입 정보를 `ParameterizedTypeReference`로 넘긴다. Java의 타입 소거 때문에 `List<Keyword>.class` 같은 표현이 불가능하기 때문이다.

```java
/** ② 목록으로 받기 — 제네릭은 ParameterizedTypeReference 로 넘긴다. */
public List<Keyword> keywords(String text) {
    return chat.prompt()
            .user("다음 글의 핵심 키워드 5개를 중요도 점수(0~1)와 함께 뽑아라.\n---\n" + text)
            .call()
            .entity(new ParameterizedTypeReference<List<Keyword>>() {});
}
```

중첩 구조도 그대로 동작한다.

```java
public record Contact(String name, String email, String phone) {}
public record Company(String name, String industry, List<Contact> contacts) {}

/** ③ 중첩 구조 — record 안에 record 를 넣어도 그대로 동작한다. */
public Company extractCompany(String document) {
    return chat.prompt()
            .user("다음 문서에서 회사 정보와 담당자 목록을 추출하라. 없는 값은 null 로 둔다.\n---\n" + document)
            .call()
            .entity(Company.class);
}
```

한 번에 N건을 받으면 호출 수가 줄어 비용과 지연이 함께 준다. 다만 교재는 중첩이 깊어질수록 실패율이 오른다고 경고하며 **2단계까지**를 기준으로 제시한다. 그보다 깊으면 호출을 쪼개는 편이 낫다.

`Map<String,Object>`로 받는 것도 가능하지만 교재는 "최후의 수단"으로 표시했다. 타입 안전성을 잃으면 구조화 출력을 쓰는 이유가 사라진다.

## enum으로 보기를 제한한다

구조화 출력에서 가장 실용적인 장치는 `enum`이다. 6장 실습이 이것을 정면으로 보여 준다.

```java
@RestController
public class ReviewLab {

    /** 보기를 제한한다. */
    public enum 느낌 { 최고, 좋음, 보통, 별로 }

    /** 받을 모양을 미리 정한다. */
    public record 리뷰카드(String 제목, 느낌 감정, int 별점, List<String> 키워드) {}

    @GetMapping("/lab6/review")
    public 리뷰카드 card(@RequestParam String text) {
        return chat.prompt()
                .system("영화 감상문을 카드로 정리한다. 별점은 1~5 정수로 매긴다.")
                .user(text)
                .call()
                .entity(리뷰카드.class);                   // 객체로 받는다(파싱 없음)
    }
}
```

`"연출은 좋은데 결말이 아쉬웠다"`를 넣으면 이런 객체가 온다.

```json
{"제목":"아쉬운 결말","감정":"보통","별점":3,"키워드":["연출 좋음","결말 아쉬움"]}
```

클래스 주석에 실습의 요점이 적혀 있다. "모델이 `느낌`에 없는 값을 만들면 그 자리에서 실패한다. 그게 안전하다."

`"뭐라 말하기 애매한 영화"` 같은 입력으로 `애매함` 같은 새 값을 유도하면 변환 단계에서 실패한다. **조용히 잘못된 값이 흘러가는 것보다 그 자리에서 실패하는 편이 낫다**는 것이 이 설계의 논지다.

테스트도 값이 아니라 타입과 범위만 본다.

```java
@Test void 카드_형식이_지켜진다() {
    리뷰카드 c = lab.card("연출은 좋은데 결말이 아쉬웠다");
    assertThat(c.감정()).isNotNull();          // enum 이라 값이 보장된다
    assertThat(c.별점()).isBetween(1, 5);
    assertThat(c.키워드()).isNotEmpty();
}
```

## 타입 변환 함정

구조화 출력이 실패하는 지점은 몇 가지 타입에 몰려 있다.

| 타입 | 무엇이 문제인가 | 대응 |
|---|---|---|
| `enum` | 목록에 없는 값을 만들어 낸다 | `UNKNOWN` 같은 기본값을 목록에 포함 |
| `LocalDate` | "2026년 7월 30일" 등 자유 형식 | 설명에 `yyyy-MM-dd` 명시 |
| `int`/`long` | "약 3만원", "3,000" 처럼 문자 섞임 | "숫자만, 단위·쉼표 제외" 명시 |
| `boolean` | "네", "아마도"로 답한다 | 질문을 예/아니오로 명확히 |
| `List` | 빈 목록 대신 `null`을 준다 | "없으면 빈 배열" 명시 + null 처리 |
| 중첩 객체 | 깊어질수록 실패율이 오른다 | 2단계까지 · 넘으면 호출을 쪼갠다 |

첫 줄이 앞의 실습과 정반대 방향으로 보여서 처음에는 혼란스러웠다. 실습은 "없는 값을 만들면 실패하는 게 안전하다"고 하고, 이 표는 "`UNKNOWN`을 넣어 두라"고 한다.

정리하면 기준은 **그 실패를 누가 처리하는가**다. `UNKNOWN`이 없으면 모델이 억지로 아무 값이나 고르고 그 잘못된 분류가 조용히 흘러간다. 반면 `UNKNOWN`이 있으면 "분류하지 못했다"가 명시적인 값으로 남아 후속 코드가 분기할 수 있다. 교재의 표현으로는 "오류보다 나쁘다" — 즉 조용한 오분류가 예외보다 나쁘다는 뜻이다.

## 실패 복구: 온도 0 → 재요청 → 기본값

구조화 출력은 거의 성공한다. 그 "거의"가 운영에서 장애 알람이 된다.

샘플 코드는 3단 복구를 구현해 뒀다.

```java
/**
 * ⑤ 실패 복구 — 온도 0, 형식만 재요청, 마지막엔 안전한 기본값.
 * 구조화 출력은 "거의" 성공한다. 그 '거의'가 운영에서는 장애 알람이다.
 */
public Ticket classifySafely(String inquiry) {
    try {
        return classify(inquiry);

    } catch (Exception first) {
        log.warn("구조화 출력 실패 — 형식만 다시 요청한다", first);
        try {
            return chat.prompt()
                    .system("반드시 JSON 객체 하나만 출력한다. 설명·코드펜스·주석 금지.")
                    .user("아래 문의를 스키마에 맞게 다시 분류하라.\n---\n" + inquiry)
                    .options(ChatOptions.builder().temperature(0.0).build())
                    .call()
                    .entity(Ticket.class);

        } catch (Exception second) {
            log.error("재요청도 실패 — 기본값을 반환한다", second);
            return new Ticket("ETC", "NORMAL", "자동 분류 실패", List.of());
        }
    }
}
```

세 겹의 역할이 각각 다르다.

1. **1차** — 평소 경로
2. **2차** — 형식 지시를 강화하고 온도를 0으로 낮춰 재요청. 원문을 함께 넘기는 것이 성공률을 올린다
3. **3차** — 안전한 기본값. `"자동 분류 실패"`라는 요약이 들어가 있어서 나중에 필터링할 수 있다

3차의 기본값이 단순한 빈 객체가 아니라는 점이 중요하다. `summary`에 실패 사실을 적어 두면 운영 중에 "자동 분류가 얼마나 실패하고 있는가"를 집계할 수 있다.

> 구조화 출력 코드에 try-catch가 없다면 천 건 중 몇 건이 그대로 장애 알람이 된다.
{: .prompt-warning }

## 모델을 부르지 않는 테스트

AI 응답은 매번 달라 그대로는 테스트가 어렵다. 해법은 `ChatModel`을 모킹해서 **우리 로직만** 검증하는 것이다.

```java
/** 고정된 응답을 돌려주는 모의 ChatModel 을 만든다. */
private ChatModel mockModel(String responseText) {
    ChatModel model = mock(ChatModel.class);
    ChatResponse response = new ChatResponse(
            List.of(new Generation(new AssistantMessage(responseText))));
    when(model.call(any(Prompt.class))).thenReturn(response);
    return model;
}

@Test
@DisplayName("정상 JSON 응답이면 record 로 변환된다")
void 정상_응답은_객체로_변환된다() {
    var model = mockModel("""
            {"category":"BILLING","priority":"HIGH","summary":"중복 결제",
             "tags":["결제","중복"]}""");

    var chatClient = ChatClient.builder(model).build();
    var service = new StructuredOutputService(chatClient);

    Ticket ticket = service.classify("카드가 두 번 결제됐어요");

    assertThat(ticket.category()).isEqualTo("BILLING");
    assertThat(ticket.tags()).contains("결제");
}

@Test
@DisplayName("형식이 깨진 응답이어도 서비스가 죽지 않고 기본값을 돌려준다")
void 형식_위반시_안전한_기본값을_돌려준다() {
    // 모델이 설명을 덧붙여 JSON 파싱이 깨지는 흔한 상황
    var model = mockModel("죄송합니다, 분류하기 어려운 문의입니다.");

    var service = new StructuredOutputService(ChatClient.builder(model).build());
    Ticket ticket = service.classifySafely("무슨 말인지 모르겠는 문의");

    assertThat(ticket.category()).isEqualTo("ETC");   // 예외가 아니라 기본값
}
```

두 번째 테스트가 특히 유용하다. **모델이 형식을 어기는 상황을 의도적으로 만들 수 있다.** 실제 모델로는 재현하기 어려운 시나리오를 모킹으로는 확실하게 만들 수 있고, 그래서 복구 경로가 실제로 동작하는지 검증할 수 있다.

교재는 테스트를 세 층으로 정리한다.

| 층 | 무엇을 검증 | 모델 호출 | 언제 |
|---|---|---|---|
| 모킹 | 응답 처리 로직 · 예외 · 변환 | 없음 | 매 커밋(CI 기본) |
| 계약 검증 | 형식·필수 필드·범위 | 있음(소량) | 일 1회 또는 배포 전 |
| 골든셋 평가 | 품질 회귀(통과율) | 있음(30문항) | 프롬프트·모델 변경 시 |

그리고 하지 말아야 할 것이 명확하다.

```java
// 이렇게 쓰면 매번 깨진다
assertThat(answer).isEqualTo("반품은 7일 이내에 가능합니다.");

// 형식과 계약을 검증한다
assertThat(ticket.category()).isIn("BILLING", "DELIVERY", "REFUND", "ETC");
assertThat(answer).contains("7일");                 // 핵심 사실만
assertThat(response.sources()).isNotEmpty();        // 근거가 붙었는가
```

## 멀티모달: 이미지 + 구조화 출력

`.user()` 안에서 텍스트와 함께 미디어를 첨부하면 이미지 입력이 된다.

```java
public String describe(Resource image, MimeType mimeType, String question) {
    return chat.prompt()
            .user(u -> u.text(question).media(mimeType, image))
            .call()
            .content();
}
```

실용적인 형태는 멀티모달과 구조화 출력을 결합한 것이다. 영수증 이미지에서 필요한 필드만 뽑는다.

```java
public record ReceiptInfo(String merchant, String date, Integer totalAmount, List<String> items) {}

/** 업로드된 영수증에서 구조화된 정보를 뽑는다 — 멀티모달 + 구조화 출력의 결합. */
public ReceiptInfo readReceipt(MultipartFile file) {
    MimeType mimeType = file.getContentType() == null
            ? MediaType.IMAGE_PNG
            : MediaType.parseMediaType(file.getContentType());

    return chat.prompt()
            .user(u -> u.text("""
                            이 영수증 이미지에서 상호명·날짜·총액·품목을 추출하라.
                            - 총액은 원 단위 정수만 쓴다(쉼표·통화기호 제외).
                            - 읽을 수 없는 값은 null 로 둔다. 추측하지 않는다.""")
                    .media(mimeType, file.getResource()))
            .call()
            .entity(ReceiptInfo.class);
}
```

프롬프트에 앞의 타입 변환 함정 대응이 그대로 들어가 있다. "원 단위 정수만"이 `int` 함정 대응이고, "읽을 수 없는 값은 null"이 추측 방지다.

서비스 주석에 두 가지 경고가 붙어 있다. "이미지는 토큰을 많이 쓴다. 보내기 전에 해상도를 줄이는 것만으로 비용이 눈에 띄게 준다." 그리고 "모든 모델이 이미지를 받는 것은 아니다 — 비전 지원 모델인지 먼저 확인한다."

## 그 밖의 모달리티

Spring AI는 텍스트 외에도 같은 방식으로 추상화한다. 인터페이스만 다를 뿐 주입받아 호출하는 형태는 동일하다.

| 기능 | 인터페이스 | 비용 단위 |
|---|---|---|
| 텍스트 생성 | `ChatModel` | 토큰 |
| 임베딩 | `EmbeddingModel` | 입력 토큰 |
| 이미지 생성 | `ImageModel` | 장당 |
| 음성 합성(TTS) | `TextToSpeechModel` | 문자 수 |
| 음성 인식(STT) | `Transcription…Model` | 오디오 길이 |

비용 단위가 서로 다르다는 점이 실무에서 중요하다. 토큰 기준으로 세운 비용 모델이 이미지·음성에는 그대로 적용되지 않는다.

## 정리

- `.entity(Class)`는 타입에서 JSON Schema를 만들어 프롬프트에 붙이고, 응답을 다시 객체로 되돌린다.
- 스키마도 프롬프트다. `@JsonPropertyDescription`으로 판단 기준을 함께 싣는다.
- `enum`으로 보기를 제한하면 없는 값을 만들어 내지 못한다. 다만 `UNKNOWN` 같은 탈출구를 둬서 조용한 오분류를 막는다.
- 목록은 `ParameterizedTypeReference`, 중첩은 2단계까지.
- 실패 복구는 온도 0 → 형식 재요청 → 안전한 기본값 세 겹.
- 테스트는 모델의 답 내용이 아니라 우리 코드의 응답 처리 방식을 검증한다. 형식 위반은 모킹으로 만든다.
- 멀티모달은 입력 종류가 늘 뿐, 환각과 검토 필요성은 그대로다.

다음 글에서는 한 번의 큰 호출을 여러 번의 작은 호출로 쪼개는 워크플로 패턴을 다룬다.

---

이전 글: [2일차 ① — 프롬프트가 가장 값싼 지렛대다](/posts/skala-springai-day2-prompt/) · 다음 글: [2일차 ③ — 프롬프트를 늘리지 말고 호출을 쪼갠다](/posts/skala-springai-day2-workflow/)
