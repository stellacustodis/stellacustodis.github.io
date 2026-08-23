---
title: "[SKALA] Spring AI 2일차 ③ — 프롬프트를 늘리지 말고 호출을 쪼갠다"
date: 2026-08-19 21:00:00 +0900
permalink: /posts/skala-springai-day2-workflow/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, workflow, routing, cache, concurrency]
description: "라우팅·병렬·체이닝·평가교정·오케스트레이션 다섯 워크플로 패턴을 샘플 코드로 정리하고, 전용 스레드 풀로 동시 호출 상한을 묶는 이유와 캐시가 왜 가장 값싼 최적화인지 확인한다."
---

## 프롬프트가 길어지고 있다면

이 장의 결론은 한 줄이다. **정확도가 안 나오면 프롬프트를 늘리지 말고 호출을 쪼개라.**

프롬프트를 계속 덧붙이다 보면 지시끼리 충돌하고 앞부분이 묻힌다. 앞 글의 안티패턴 표에도 "프롬프트를 계속 길게"가 들어 있었고, 대응책이 "호출을 쪼갠다"였다. 이 글이 그 방법을 다룬다.

쪼갠 호출의 장점은 정확도만이 아니다. 각 단계가 작고 검증 가능해서 **실패 지점이 눈에 보인다.** 하나의 거대한 프롬프트는 결과가 나쁠 때 어디를 고쳐야 할지 알 수 없다.

## 다섯 가지 기본형

| 패턴 | 언제 쓰나 | 주의할 점 |
|---|---|---|
| Routing | 유형별로 처리 방식이 다를 때 | 분류는 값싼 모델·온도 0 |
| Parallel | 서로 독립적인 작업이 여러 건 | 지연만 줄고 비용은 그대로. 상한 필수 |
| Chaining | 앞 결과가 뒤의 입력이 될 때 | 실패 지점이 보이는 것이 장점 |
| Evaluator-Optimizer | 품질이 비용보다 중요할 때 | 평가자는 다른 관점 · 반복 상한 |
| Orchestrator-Workers | 작업 개수를 미리 모를 때 | 합치는 단계까지 설계 |

샘플 코드의 `WorkflowPatterns` 클래스가 이 다섯을 모두 구현해 두었다. 하나씩 본다.

## ① Routing: 값싼 모델이 먼저 갈래를 정한다

모든 질문에 비싼 모델을 쓸 이유는 없다. 먼저 유형을 분류하고 유형별 경로로 보낸다.

```java
public enum Route { SIMPLE_FAQ, TECHNICAL, COMPLAINT }
public record Classification(Route route, String reason) {}

public String route(String question) {
    Classification c = strict.prompt()
            .user("""
                    다음 문의를 분류하라.
                      SIMPLE_FAQ  : 규정·안내로 답할 수 있는 단순 질문
                      TECHNICAL   : 원인 분석·단계적 추론이 필요한 기술 질문
                      COMPLAINT   : 불만·항의가 섞인 문의
                    ---
                    """ + question)
            .call()
            .entity(Classification.class);

    log.info("라우팅 결과 {} — {}", c.route(), c.reason());

    return switch (c.route()) {
        case SIMPLE_FAQ -> chat.prompt()
                .user(question)
                .options(ChatOptions.builder().temperature(0.2).maxTokens(300).build())
                .call().content();

        case TECHNICAL -> chat.prompt()
                .system("단계적으로 원인을 좁혀 가며 분석하되, 최종 출력은 결론과 근거 3개만 쓴다.")
                .user(question)
                .call().content();

        case COMPLAINT -> chat.prompt()
                .system("먼저 공감을 표현하고, 사실만 안내하며, 마지막에 담당자 연결을 제안한다.")
                .user(question)
                .call().content();
    };
}
```

설계상 눈여겨볼 점이 세 가지 있다.

**분류에 `strict`(온도 0) 클라이언트를 쓴다.** 앞 글에서 나눠 둔 용도별 빈이 여기서 값을 한다. 분류가 흔들리면 같은 질문이 매번 다른 경로로 간다.

**분류 결과를 `enum`으로 받는다.** 문자열로 받아 `switch`하면 모델이 만들어 낸 없는 값에 대응해야 하지만, `enum`이면 컴파일러가 `switch`의 완전성을 검사한다.

**`reason`을 함께 받아 로그에 남긴다.** 라우팅이 잘못됐을 때 왜 그렇게 판단했는지 추적할 수 있다. 이 필드는 사용자에게 보이지 않지만 디버깅에는 반드시 필요하다.

3일차 실습에서는 여기에 자가 채점을 붙인 형태가 나온다. 답을 만든 뒤 0~5점을 매기고, 낮으면 **딱 한 번만** 고친다.

```java
if (s.value() < 3)                    // 낮을 때만, 한 번만 고친다
    답 = 큰모델.prompt().user("아래 답을 더 낫게 고쳐라: " + 답).call().content();

log.info("route={} score={} 모델호출={}회", route, s.value(), s.value() < 3 ? 3 : 2);
```

> 이것이 `while`이 아니라 `if`인 것을 보라. 모델은 계속 고치라고 하면 끝없이 고친다.
{: .prompt-warning }

마지막 로그가 실무적이다. 몇 번 호출했는지를 남겨야 "쪼갠 값어치가 있었는가"를 나중에 판단할 수 있다.

## ② Parallel: 지연은 줄지만 비용은 그대로

서로 의존하지 않는 작업은 동시에 호출한다. 다만 여기에 함정이 있다.

```java
/**
 * 서로 의존하지 않는 작업을 동시에 호출한다.
 * 지연은 줄지만 <b>비용은 줄지 않는다</b> — 호출 수는 그대로다.
 * 전용 풀로 동시 호출 수를 묶지 않으면 곧 레이트 리밋(429)을 만난다.
 */
public List<String> summarizeAll(List<String> documents) {
    List<CompletableFuture<String>> futures = documents.stream()
            .map(doc -> CompletableFuture
                    .supplyAsync(() -> chat.prompt()
                            .user("다음 문서를 3문장으로 요약하라.\n---\n" + doc)
                            .call().content(), aiExecutor)
                    .exceptionally(e -> {
                        log.warn("요약 실패", e);
                        return "(요약 실패)";
                    }))
            .toList();

    return futures.stream()
            .map(f -> f.completeOnTimeout("(시간 초과)", 30, TimeUnit.SECONDS))
            .map(CompletableFuture::join)
            .toList();
}
```

`supplyAsync`의 두 번째 인자로 넘긴 `aiExecutor`가 핵심이다. 기본 `ForkJoinPool`을 쓰면 동시 호출 수를 통제할 수 없다.

```java
/**
 * AI 호출 전용 스레드 풀.
 *
 * <p>풀 크기가 곧 <b>동시 호출 상한</b>이다. 무제한 병렬 호출은 공급자 레이트 리밋(429)을
 * 바로 만나고, 그때는 성공한 호출까지 함께 느려진다.
 * 공용 풀을 쓰지 않는 이유는 느린 AI 호출이 일반 웹 요청 처리를 굶기지 않게 하기 위해서다.
 */
@Configuration
public class AiExecutorConfig {

    @Bean("aiExecutor")
    public Executor aiExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(8);
        executor.setMaxPoolSize(8);          // = 동시 호출 상한
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("ai-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
```

주석에 이유가 두 개 적혀 있는데 둘 다 중요하다.

첫째, 풀 크기가 동시 호출 상한이다. 문서 100건을 무제한 병렬로 던지면 429가 나고, 그러면 성공했을 호출까지 함께 느려진다.

둘째, 공용 풀을 쓰지 않는 이유는 **격리**다. AI 호출은 수 초가 걸리는데, 그것이 일반 웹 요청과 같은 풀을 쓰면 웹 요청이 굶는다. 앞 과정에서 배운 `ThreadPoolTaskExecutor`가 여기서 그대로 쓰인다.

실패 처리도 두 겹이다. `exceptionally`는 개별 호출 실패를 `"(요약 실패)"`로 바꾸고, `completeOnTimeout`은 30초를 넘기면 `"(시간 초과)"`로 대체한다. **한 건이 실패해도 나머지 결과는 살린다.**

## ③ Evaluator-Optimizer: 평가자는 다른 관점이어야 한다

생성 → 평가 → 재생성을 정해진 횟수만 반복한다.

```java
public record Review(boolean passed, String feedback) {}

/**
 * 생성 → 평가 → 재생성을 정해진 횟수만 반복한다.
 * 평가자에게는 <b>다른 시스템 프롬프트</b>를 줘야 한다 — 같은 관점이면 자기 글을 통과시킨다.
 */
public String writeWithReview(String topic, int maxRounds) {
    String draft = chat.prompt()
            .user("다음 주제로 500자 내외의 초안을 써라: " + topic)
            .call().content();

    for (int round = 1; round <= maxRounds; round++) {
        Review review = strict.prompt()
                .system("""
                        너는 엄격한 편집자다. 아래 기준으로만 판정한다.
                          - 주장마다 근거가 붙어 있는가
                          - 중복되는 문장이 없는가
                          - 과장·단정 표현이 없는가
                        통과 여부(passed)와 개선점(feedback)을 낸다.""")
                .user("초안:\n" + draft)
                .call()
                .entity(Review.class);

        if (review.passed()) {
            log.info("{}회차에서 통과", round);
            return draft;
        }

        log.info("{}회차 재작성 — {}", round, review.feedback());
        draft = chat.prompt()
                .user("아래 지적을 반영해 다시 써라.\n[지적]\n" + review.feedback()
                        + "\n\n[초안]\n" + draft)
                .call().content();
    }
    return draft;   // 반복 상한 도달 — 무한 루프는 곧 비용 사고다
}
```

주석의 지적이 핵심이다. **평가자에게 다른 시스템 프롬프트를 줘야 한다.** 초안을 쓴 것과 같은 관점으로 평가하면 자기 글을 통과시킨다. 그래서 작성은 `chat`(상담용, 온도 0.7), 평가는 `strict`(추출용, 온도 0)로 클라이언트를 갈라 놨다.

평가 기준을 세 개로 못 박은 것도 의도가 있다. "잘 썼는지 봐라"는 판정이 불가능하지만, "주장마다 근거가 붙어 있는가"는 판정 가능하다.

이 패턴은 호출이 2~3배로 는다. 교재는 "품질이 비용보다 중요할 때만" 쓰라고 명시한다.

## ④ Orchestrator-Workers: 개수를 모를 때

작업 개수를 미리 알 수 없을 때는 오케스트레이터가 쪼개고, 워커들이 처리하고, 마지막에 합친다.

```java
public record Plan(List<String> subtasks) {}

public String orchestrate(String goal) {
    Plan plan = strict.prompt()
            .user("다음 목표를 3~5개의 독립적인 하위 작업으로 쪼개라. 각 작업은 한 문장이다.\n---\n" + goal)
            .call()
            .entity(Plan.class);

    List<String> results = plan.subtasks().stream()
            .map(task -> CompletableFuture.supplyAsync(
                    () -> chat.prompt().user(task).call().content(), aiExecutor))
            .toList()
            .stream()
            .map(CompletableFuture::join)
            .toList();

    return chat.prompt()
            .system("여러 조각의 결과를 하나의 일관된 글로 합친다. 중복은 제거한다.")
            .user("[목표]\n" + goal + "\n\n[조각들]\n" + String.join("\n\n---\n\n", results))
            .call().content();
}
```

`.toList()` 다음에 다시 `.stream()`을 여는 부분이 어색해 보이는데, 의도가 있다. 첫 `.toList()`에서 모든 `CompletableFuture`를 먼저 만들어 **전부 시작시킨 다음** 두 번째 스트림에서 결과를 기다린다. 한 스트림 안에서 바로 `join()`하면 지연 평가 때문에 순차 실행이 되어 병렬 효과가 사라진다.

합치는 단계까지가 이 패턴의 일부라는 점도 중요하다. 쪼개기만 하고 조합을 설계하지 않으면 조각난 결과가 그대로 사용자에게 간다.

## ⑤ Chaining: 앞 결과가 뒤의 입력

```java
public List<String> extractThenTranslate(String document, String targetLang) {
    List<String> facts = strict.prompt()
            .user("다음 문서에서 핵심 사실만 불릿으로 추출하라. 해석·의견은 넣지 않는다.\n---\n" + document)
            .call()
            .entity(new ParameterizedTypeReference<List<String>>() {});

    return facts.stream()
            .map(fact -> strict.prompt()
                    .user(u -> u.text("다음 문장을 {lang}로 번역하라. 번역문만 출력한다.\n{text}")
                            .param("lang", targetLang)
                            .param("text", fact))
                    .call().content())
            .toList();
}
```

추출과 번역을 한 프롬프트로 시키면 모델이 번역하면서 해석을 덧붙이기 쉽다. 나눠 두면 첫 단계는 "해석·의견을 넣지 않는다"에만 집중하고, 두 번째 단계는 "번역문만 출력한다"에만 집중한다. 중간 결과가 `List<String>`으로 남아서 검증도 가능하다.

## 가장 값싼 호출은 부르지 않는 호출

최적화 파이프라인의 순서가 명확하다.

```text
요청 → 캐시 확인 → 난이도별 라우팅 → 컨텍스트 축소 → 모델 호출
```

부르기 전에 걸러 내고, 싼 경로부터 태운다. 그중 첫 단계인 캐시가 가장 효과가 크다.

```java
@Service
public class CachedChatService {

    private static final Duration TTL = Duration.ofHours(6);

    private final Map<String, Entry> cache = new ConcurrentHashMap<>();
    private final AtomicLong hits = new AtomicLong();
    private final AtomicLong misses = new AtomicLong();

    private record Entry(String answer, Instant storedAt) {
        boolean expired() {
            return Instant.now().isAfter(storedAt.plus(TTL));
        }
    }

    public String ask(String question) {
        String key = normalize(question);

        Entry cached = cache.get(key);
        if (cached != null && !cached.expired()) {
            hits.incrementAndGet();
            log.debug("캐시 적중 — 호출 생략");
            return cached.answer();
        }

        misses.incrementAndGet();
        String answer = chat.prompt().user(question).call().content();
        cache.put(key, new Entry(answer, Instant.now()));
        return answer;
    }

    /** 공백·대소문자·문장부호 차이는 같은 질문으로 본다. */
    private String normalize(String question) {
        return question.trim().toLowerCase().replaceAll("[\\s?!.]+", " ");
    }
}
```

세 가지 설계 판단이 들어 있다.

**키를 정규화한다.** 공백과 대소문자, 물음표 차이로 적중률이 떨어지는 것을 막는다.

**TTL을 둔다.** 규정이 바뀌었는데 캐시가 옛 답을 계속 내보내는 상황을 6시간으로 제한한다.

**hits/misses를 센다.** 적중률을 모르면 캐시가 값을 하는지 판단할 수 없다. `stats()`로 노출해서 확인할 수 있게 했다.

경계도 분명하다. 주석이 "개인화되거나 실시간 데이터가 섞인 답변은 캐시하면 안 된다"고 못 박는다. "내 주문 상태"를 캐시하면 다른 사용자에게 남의 정보가 나간다.

3일차에는 여기서 한 단계 더 나아간 **시맨틱 캐시**가 나온다. 문자열이 달라도 뜻이 같으면 재사용하는 방식인데, 그 글에서 다룬다.

## 프롬프트 캐싱: 순서가 곧 최적화

공급자 쪽 프롬프트 캐싱은 반복되는 앞부분을 싸게 처리한다. 우리가 할 일은 **변하지 않는 것을 앞에 두는 것** 하나다.

| 순서 | 내용 | 매 요청 동일? | 캐시 |
|---|---|---|---|
| ① | 시스템 프롬프트 (역할·규칙) | 동일 | 대상 |
| ② | 공통 지침 · 용어집 | 동일 | 대상 |
| ③ | Few-shot 예시 | 동일 | 대상 |
| ④ | 검색된 근거 | 질문마다 다름 | — |
| ⑤ | 대화 이력 | 턴마다 다름 | — |
| ⑥ | 이번 질문 | 매번 다름 | — |

여기에 흔한 실수가 하나 있다.

```java
// 흔한 실수 — 매번 바뀌는 값을 앞부분에 넣는다
.defaultSystem("오늘은 " + LocalDate.now() + "입니다. 너는 상담원이다...")
//   → 날짜가 바뀌면 ①이 달라져 캐시가 통째로 무효

// 고정된 것만 앞에, 가변값은 뒤(사용자 메시지)로
.defaultSystem(systemPrompt)                          // 항상 동일
.user(u -> u.text("[오늘 {today}] {question}")
        .param("today", LocalDate.now())
        .param("question", question))
```

시스템 프롬프트에 현재 시각을 넣으면 한 글자만 달라져도 캐시가 전부 무효가 된다. 앞 글에서 "고정된 것은 시스템에, 이번 것은 사용자 메시지에"라고 나눴던 이유가 여기서 비용으로 돌아온다.

## 모델 선택도 작업별로

"가장 좋은 모델"이 아니라 "이 작업에 충분한 모델"을 고른다.

| 작업 | 필요한 능력 | 권장 | 이유 |
|---|---|---|---|
| 분류 · 라벨링 | 형식 준수 | 소형 · 온도 0 | 정답이 정해져 있다 |
| 정보 추출 | 형식 + 정확도 | 소형~중형 | 구조화 출력이 대신 잡아 준다 |
| 요약 | 문장력 | 중형 | 품질 차이가 눈에 보인다 |
| 상담 응답 | 문장력 + 맥락 | 중형~대형 | 사용자가 직접 읽는다 |
| 복잡한 추론 | 다단계 논리 | 대형 · 추론 모델 | 여기서만 값을 한다 |
| 코드 생성·리뷰 | 정확도 | 대형 | 틀리면 되돌리는 비용이 크다 |

"정보 추출"의 이유가 흥미롭다. 구조화 출력이 형식을 대신 잡아 주므로 모델이 형식을 지키는 능력에 덜 의존해도 된다. 즉 앞 글의 `entity()`가 여기서 모델 등급을 낮출 수 있는 근거가 된다.

## 배치: 묶는 것만으로 호출 수가 준다

지금 당장 답이 필요 없는 일은 실시간으로 처리할 이유가 없다.

```java
// ① 건별 호출 — 100건이면 100번
for (Doc d : docs) classify(d);                    // 느리고 비싸다

// ② 묶어서 호출 — 10건씩이면 10번
record Item(int index, String text) {}
record Labeled(int index, String category) {}

public List<Labeled> classifyBatch(List<Item> batch) {
    return strict.prompt()
            .user("각 항목을 분류하라. index 를 그대로 유지한다.\n" + toJson(batch))
            .call()
            .entity(new ParameterizedTypeReference<List<Labeled>>() {});
}
```

`index`를 유지하게 하는 것이 요령이다. 응답 순서가 입력 순서와 같다고 가정하면 조용히 어긋날 수 있다.

실패 처리 방침도 함께 나온다. **묶음이 깨지면 그 묶음만 개별 호출로 재처리한다.** 10건 중 1건 때문에 전체를 버리지 않는다.

## 정리

- 정확도가 안 나오면 프롬프트를 늘리지 말고 호출을 쪼갠다. 쪼갠 단계는 각각 검증 가능하다.
- Routing은 값싼 모델·온도 0으로 분류하고, 결과를 `enum`으로 받는다. 판단 이유를 로그에 남긴다.
- Parallel은 지연만 줄이고 비용은 그대로다. 전용 스레드 풀로 동시 호출 상한을 묶는다.
- Evaluator-Optimizer의 평가자는 다른 관점이어야 하고, 반복에는 상한이 있어야 한다.
- 가장 값싼 호출은 부르지 않는 호출이다. 다만 개인화·실시간 답변은 캐시하지 않는다.
- 프롬프트 캐싱은 변하지 않는 것을 앞에 두는 것이 전부다. 시스템 프롬프트에 현재 시각을 넣지 않는다.
- 모델은 "가장 좋은 것"이 아니라 "이 작업에 충분한 것"을 고른다.

> 프롬프트가 계속 길어지고 있다면 쪼갤 때를 지났다는 신호다.
{: .prompt-info }

다음 글에서는 오늘의 하이라이트인 RAG를 다룬다.

---

이전 글: [2일차 ② — 문자열을 파싱하지 않는다](/posts/skala-springai-day2-structured/) · 다음 글: [2일차 ④ — RAG, 우리 문서를 근거로](/posts/skala-springai-day2-rag/)
