---
title: "[SKALA] Spring AI 2일차 ⑤ — 넓게 찾고 좁게 넣는다"
date: 2026-08-19 23:00:00 +0900
permalink: /posts/skala-springai-day2-rag-advanced/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, rag, hyde, rerank, hybrid-search]
description: "HyDE·재순위·하이브리드 검색·모듈형 RAG를 샘플 코드로 정리한다. 기법을 한꺼번에 붙이지 않고 하나씩 붙여 측정하는 방법과, RAG 평가 지표 네 개를 함께 다룬다."
---

## 모델을 바꾸기 전에 검색을 개선한다

RAG 실패는 대부분 검색 단계에서 난다. 관련 근거를 못 찾은 것이지 모델이 못 쓴 것이 아니다. 그래서 이 장의 전제는 앞 글의 진단표에서 이어진다.

품질을 끌어올리는 축은 세 개다. **질의 개선 · 검색 방식 · 분할 전략.**

이 장에서 배운 것 중 기법 자체보다 중요했던 것은 적용 원칙이었다.

> 한 번에 하나만 붙인다. 세 기법을 동시에 붙이면 무엇이 효과였는지 알 수 없고, 지연과 비용만 확실히 늘어난다 — 되돌릴 근거도 남지 않는다.
{: .prompt-warning }

## HyDE: 질문이 아니라 가상 답변으로 검색한다

짧은 질문은 실제 문서와 문체가 다르다. `"물건 돌려보내려면 며칠 안에 해야 해요?"`라는 구어체 질문과 `"반품은 수령 후 7일 이내에 신청할 수 있다"`라는 규정문은 표현이 크게 다르다. 그래서 벡터 검색이 빗나간다.

HyDE는 먼저 그럴듯한 가상 답변을 만들고, **그 답변으로 검색한다.** 답변끼리는 문체가 비슷하기 때문에 더 잘 맞는다.

```java
/**
 * HyDE — 질문이 아니라 "그럴듯한 가상 답변"으로 검색한다.
 * 질문과 문서는 문체가 다르지만, 답변과 문서는 문체가 비슷해서 더 잘 맞는다.
 */
public List<Document> hydeSearch(String question, int topK) {
    String hypothetical = strict.prompt()
            .system("질문에 대한 그럴듯한 답변을 사실 여부와 무관하게 3문장으로 쓴다. 검색용 초안이다.")
            .user(question)
            .options(ChatOptions.builder().temperature(0.3).maxTokens(200).build())
            .call().content();

    log.debug("HyDE 가상 답변: {}", hypothetical);

    List<Document> hits = vectorStore.similaritySearch(
            SearchRequest.builder().query(hypothetical).topK(topK).build());
    return hits == null ? List.of() : hits;
}
```

시스템 프롬프트의 `"사실 여부와 무관하게"`가 처음에는 이상해 보였다. 환각을 일부러 만들라는 지시이기 때문이다.

의도를 이해하고 나니 납득이 됐다. 이 텍스트는 사용자에게 가지 않는다. **오직 검색 쿼리로만 쓰인다.** 내용이 틀려도 상관없고, 필요한 것은 정답 문서와 비슷한 어휘와 문체뿐이다. `maxTokens(200)`으로 짧게 자른 것도 검색 쿼리로 쓸 만큼만 필요하기 때문이다.

`temperature(0.3)`은 절충이다. 0이면 매번 같은 초안이 나와 검색이 한 방향으로만 편향되고, 너무 높으면 엉뚱한 어휘가 섞인다.

실습은 전후를 나란히 비교하게 한다.

```text
그냥검색  0.41  배송 정책 안내...       ← 엉뚱한 문서가 1등
HyDE     0.68  반품은 수령 후 7일...   ← 정답 문서가 1등으로 올라온다
```

테스트도 기법이 아니라 **개선 여부**를 검증한다.

```java
@Test void HyDE_가_구어체_질문을_개선한다() {
    double before = 최고점수(그냥검색("물건 돌려보내려면 며칠 안에 해야 해요?"));
    double after  = 최고점수(HyDE검색("물건 돌려보내려면 며칠 안에 해야 해요?"));
    assertThat(after).isGreaterThan(before);
}
```

실습 자료의 마지막 줄이 이 장의 태도를 보여 준다. "차이 없음: 질문이 이미 문서 말투와 같다(그럴 땐 안 쓰는 게 맞다)." 그리고 질문 5개 중 3개 이상 좋아지면 채택하라는 기준도 함께 제시된다. HyDE는 모델 호출을 한 번 더 쓰므로 효과가 없으면 순수한 손해다.

## 재순위: 넓게 찾고 좁게 넣는다

벡터 유사도 상위가 곧 정답 순서는 아니다. 그래서 넓게 회수한 뒤 다시 정렬해서 상위 몇 건만 모델에 넣는다.

```java
public record Ranking(List<Integer> indexes) {}

/**
 * 넓게 찾고 좁게 넣는다 — 회수는 20건, 투입은 4건.
 * 벡터 유사도 상위가 곧 정답 순서는 아니다.
 */
public List<Document> searchAndRerank(String question, int recall, int keep) {
    List<Document> candidates = vectorStore.similaritySearch(
            SearchRequest.builder().query(question).topK(recall).build());
    if (candidates == null || candidates.isEmpty()) {
        return List.of();
    }

    String numbered = IntStream.range(0, candidates.size())
            .mapToObj(i -> "[" + i + "] " + candidates.get(i).getText())
            .reduce((a, b) -> a + "\n---\n" + b)
            .orElse("");

    Ranking ranking = strict.prompt()
            .system("질문에 답하는 데 실제로 쓸모 있는 문단만 골라, 유용한 순서대로 번호를 나열한다.")
            .user("[질문]\n" + question + "\n\n[후보]\n" + numbered)
            .options(ChatOptions.builder().temperature(0.0).build())
            .call()
            .entity(Ranking.class);

    return ranking.indexes().stream()
            .filter(i -> i >= 0 && i < candidates.size())
            .distinct()
            .limit(keep)
            .map(candidates::get)
            .toList();
}
```

교재는 재순위를 두고 "효과 대비 노력이 가장 좋다"고 평가한다. 이유는 두 가지가 동시에 개선되기 때문이다. **근거가 짧아지니 정확도는 오르고 토큰은 준다.** 보통 품질과 비용은 상충하는데 여기서는 같은 방향으로 움직인다.

구현에서 눈여겨볼 부분은 반환값 처리다. 모델이 돌려준 인덱스를 그대로 믿지 않는다.

```java
.filter(i -> i >= 0 && i < candidates.size())   // 범위 밖 인덱스 방어
.distinct()                                      // 중복 방어
.limit(keep)                                     // 개수 방어
```

`Ranking`이 구조화 출력으로 타입은 보장되지만 **값의 유효성은 보장되지 않는다.** 앞 글에서 "타입은 맞아도 내용이 틀릴 수 있으니 중요한 값은 코드로 한 번 더 검증한다"고 한 지적이 여기 그대로 적용된다. 이 방어가 없으면 `IndexOutOfBoundsException`이 난다.

전체 흐름은 이렇게 요약된다.

```text
topK 20 회수 → 재순위 → 상위 4건만 투입
```

## 하이브리드 검색: 정확히 일치해야 하는 토큰

벡터 검색만으로는 제품 코드(`XR-2100`)나 사번처럼 **정확히 일치해야 하는 토큰**을 놓친다. 의미적으로 비슷한 다른 제품 코드가 더 높은 점수를 받을 수 있기 때문이다.

샘플 코드는 개념 시연을 위해 RRF(Reciprocal Rank Fusion)를 직접 구현했다.

```java
/**
 * 의미 검색 + 키워드 검색을 합친다.
 * 제품 코드("XR-2100")나 사번처럼 <b>정확히 일치해야 하는 토큰</b>은 벡터 검색이 약하다.
 *
 * <p>여기서는 개념 시연을 위해 간단한 RRF(Reciprocal Rank Fusion)를 직접 구현했다.
 * 운영에서는 검색 엔진(Elasticsearch·OpenSearch)의 하이브리드 기능을 쓰는 편이 낫다.
 */
public List<Document> hybridSearch(String question, List<Document> keywordHits, int topK) {
    List<Document> semanticHits = vectorStore.similaritySearch(
            SearchRequest.builder().query(question).topK(topK * 2).build());
    if (semanticHits == null) {
        semanticHits = List.of();
    }

    Map<String, Double> scores = new HashMap<>();
    Map<String, Document> byId = new HashMap<>();
    final int k = 60;   // RRF 상수 — 순위가 낮을수록 기여도가 완만히 준다

    for (int i = 0; i < semanticHits.size(); i++) {
        Document d = semanticHits.get(i);
        byId.put(d.getId(), d);
        scores.merge(d.getId(), 1.0 / (k + i + 1), Double::sum);
    }
    for (int i = 0; i < keywordHits.size(); i++) {
        Document d = keywordHits.get(i);
        byId.put(d.getId(), d);
        scores.merge(d.getId(), 1.0 / (k + i + 1), Double::sum);
    }

    return scores.entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue(Comparator.reverseOrder()))
            .limit(topK)
            .map(e -> byId.get(e.getKey()))
            .toList();
}
```

RRF의 발상이 단순하면서 실용적이다. 두 검색의 **점수를 직접 더하지 않고 순위만 쓴다.** 벡터 유사도(0~1)와 BM25 점수는 척도가 달라서 그대로 더할 수 없는데, 순위는 공통 척도다.

`1.0 / (k + rank)` 형태이고 `k = 60`은 관례적으로 쓰이는 값이다. `k`가 크면 상위와 하위의 기여도 차이가 완만해진다. 양쪽 검색에서 모두 상위에 오른 문서는 두 점수가 합산되어 자연히 위로 올라온다.

주석의 마지막 문장도 정직하다. 운영에서는 검색 엔진의 하이브리드 기능을 쓰는 편이 낫다는 것이다. 이 구현은 원리를 보여 주기 위한 것이지 운영용이 아니다.

## 모듈형 RAG: 구간을 갈아 끼운다

Spring AI는 RAG를 네 구간으로 나눈 표준 조립 방식을 제공한다.

```text
Pre-Retrieval    질문 → QueryTransformer → QueryExpander → 다중 질의
Retrieval        다중 질의 → DocumentRetriever → 필터 + topK → 후보 문서
Post-Retrieval   후보 문서 → Re-rank → Join / 압축 → 근거
Generation       질문 + 근거 → ChatModel → 근거 있는 답 + 출처
```

`RetrievalAugmentationAdvisor`가 이 조립을 담당한다.

```java
public String modularRag(String question) {
    var advisor = RetrievalAugmentationAdvisor.builder()
            .queryTransformers(RewriteQueryTransformer.builder()
                    .chatClientBuilder(builder.build().mutate())
                    .build())
            .queryExpander(MultiQueryExpander.builder()
                    .chatClientBuilder(builder.build().mutate())
                    .numberOfQueries(3)
                    .build())
            .documentRetriever(VectorStoreDocumentRetriever.builder()
                    .vectorStore(vectorStore)
                    .similarityThreshold(0.6)
                    .topK(6)
                    .build())
            .build();

    return chat.prompt()
            .user(question)
            .advisors(advisor)
            .call().content();
}
```

두 컴포넌트의 역할이 다르다.

- `RewriteQueryTransformer` — 짧고 애매한 질문을 검색하기 좋은 형태로 다시 쓴다. 대화 맥락도 반영한다
- `MultiQueryExpander` — 하나의 질문을 여러 각도의 질의로 확장해 회수율을 올린다

이 구조의 값어치는 **어느 구간이 문제인지 지목할 수 있다**는 데 있다. 품질이 나쁠 때 "RAG가 안 된다"가 아니라 "Pre-Retrieval이 문제다" 또는 "Post-Retrieval이 없다"고 말할 수 있으면 고칠 곳이 정해진다.

비용 경고도 붙어 있다. 주석이 "변환·확장은 모델 호출을 추가로 쓴다(질의당 1~3회). 회수율이 실제로 올라가는지 측정한 뒤 켜라"고 명시한다. `numberOfQueries(3)`이면 질의 하나가 검색 세 번이 된다.

## Contextual Retrieval: 청크에 맥락을 붙인다

청크를 잘라 놓으면 `"이것"`, `"해당 조항"`이 무엇인지 알 수 없다. 그래서 각 청크 앞에 문서 전체 맥락을 한두 문장 붙여 저장한다.

```java
// 인제스트 시점에 각 청크에 맥락 문장을 덧붙인다
String docSummary = chat.prompt()
        .user("이 문서가 무엇에 관한 것인지 2문장으로:\n" + fullText.substring(0, 4000))
        .call().content();

List<Document> contextualized = chunks.stream()
        .map(c -> {
            String prefix = "[문서: %s] %s\n\n".formatted(fileName, docSummary);
            // 검색 대상 텍스트에는 맥락을 포함하고,
            // 원문은 메타데이터에 남겨 답변 생성에 쓴다
            Map<String, Object> meta = new HashMap<>(c.getMetadata());
            meta.put("original", c.getText());
            return new Document(prefix + c.getText(), meta);
        })
        .toList();

vectorStore.add(contextualized);
```

**검색 대상 텍스트와 답변 생성용 텍스트를 분리한 것**이 이 구현의 요점이다. 맥락 문장이 붙은 버전으로 임베딩해서 검색 정확도를 올리되, 답변을 만들 때는 메타데이터의 `original`을 쓴다. 그러지 않으면 같은 문서 요약이 근거 여러 개에 중복으로 실려 토큰을 낭비한다.

## Parent-Child: 작게 찾고 크게 준다

청크 크기의 딜레마를 양쪽 다 취하는 방식이다. 검색은 작은 청크가 정확하고, 답변은 큰 맥락이 낫다.

```java
// ① 인제스트 — 큰 단락을 쪼개고, 자식은 부모 ID 를 들고 간다
for (Document parent : parentChunks) {              // 예: 1500 토큰
    parentStore.put(parent.getId(), parent.getText());

    for (Document child : split(parent, 300)) {     // 예: 300 토큰
        Map<String, Object> meta = new HashMap<>(child.getMetadata());
        meta.put("parentId", parent.getId());
        vectorStore.add(List.of(new Document(child.getText(), meta)));
    }
}

// ② 검색 — 자식으로 찾고, 부모를 꺼내 중복 제거 후 투입
List<Document> hits = vectorStore.similaritySearch(
        SearchRequest.builder().query(q).topK(8).build());

String context = hits.stream()
        .map(d -> (String) d.getMetadata().get("parentId"))
        .distinct()                                  // 같은 부모는 한 번만
        .map(parentStore::get)
        .collect(Collectors.joining("\n---\n"));
```

`.distinct()`가 필수다. 같은 부모의 자식 여러 개가 검색되는 것이 정상이고, 그때 부모를 중복으로 넣으면 컨텍스트가 낭비된다.

## Agentic RAG와 GraphRAG: 언제 쓰지 않는가

두 기법은 강력하지만 교재의 서술은 도입을 권하기보다 **언제 쓰지 않는지**에 무게를 둔다.

Agentic RAG는 검색을 도구로 등록해 에이전트가 검색 시점과 질의를 스스로 정하고, 결과가 부족하면 질의를 바꿔 재검색한다. 복잡한 질문에 강하지만 스텝과 비용이 는다.

```java
@Component
class SearchTools {
    @Tool(description = "사내 문서에서 관련 조각을 검색한다")
    List<String> searchDocs(@ToolParam(description="검색어") String query) {
        return vectorStore.similaritySearch(query)
                .stream().map(Document::getText).toList();
    }
}
```

GraphRAG는 개체와 관계를 그래프로 뽑아 두고 연결을 따라간다. 질문 유형별 적합성이 갈린다.

| 질문 유형 | 예 | 벡터 RAG | GraphRAG |
|---|---|---|---|
| 단일 사실 | "반품 기간은?" | 잘한다 | 과함 |
| 요약 | "이 규정의 요지는?" | 잘한다 | 과함 |
| 관계 추적 | "이 조항은 어느 규정에서 파생?" | 약함 | 강점 |
| 다중 홉 | "A팀 담당자의 상급자는?" | 약함 | 강점 |
| 전체 조망 | "전 규정에서 반복되는 주제는?" | 약함 | 강점 |

> 대부분의 사내 Q&A는 단일 사실 질문이다. GraphRAG를 먼저 검토하기보다 벡터 RAG로 시작해 못 푸는 질문이 쌓일 때 도입을 논하는 편이 낫다.
{: .prompt-info }

이 기준이 유용했다. 기법의 우열이 아니라 **우리 질문의 분포**를 보라는 것이다.

## RAG 평가: 네 지표

"답이 좋다/나쁘다"로 뭉뚱그리면 어디를 고칠지 알 수 없다. RAG는 검색과 생성 두 단계이므로 지표도 나눠서 본다.

| 단계 | 지표 | 무엇을 묻나 | 낮으면 |
|---|---|---|---|
| 검색 | Recall@k | 정답 문서가 상위 k 안에 있는가 | 청킹·임베딩·질문 변환 |
| 검색 | Precision@k | 가져온 것 중 쓸모 있는 비율 | 임계값↑ · 재순위 |
| 생성 | Faithfulness | 근거 안의 내용만으로 답했는가 | 시스템 프롬프트 강화 |
| 생성 | Answer Relevancy | 질문에 실제로 답했는가 | 프롬프트 · 모델 상향 |

각 지표가 낮을 때 손볼 곳이 다르다는 것이 이 표의 요점이다. Recall이 낮은데 프롬프트를 고치는 것은 시간 낭비다.

Spring AI에는 내장 평가기도 있다.

```java
var evaluator = new RelevancyEvaluator(chatClientBuilder);
var request = new EvaluationRequest(question, retrievedDocs, answer);
EvaluationResponse result = evaluator.evaluate(request);
assertThat(result.isPass()).isTrue();
```

교재의 표현으로는 "완벽한 평가보다 꾸준한 측정"이다.

## 정리

- 모델을 바꾸기 전에 검색을 개선한다. 같은 모델·같은 문서라도 무엇을 어떻게 찾아 넣느냐로 품질이 크게 달라진다.
- HyDE는 가상 답변으로 검색한다. 그 텍스트는 사용자에게 가지 않으므로 사실 여부가 상관없다.
- 재순위는 효과 대비 노력이 가장 좋다. 정확도는 오르고 토큰은 준다. 다만 모델이 준 인덱스는 검증한다.
- 하이브리드 검색은 점수 대신 순위를 합친다(RRF). 척도가 다른 두 검색을 섞는 방법이다.
- 모듈형 RAG의 값어치는 어느 구간이 문제인지 지목할 수 있다는 것이다.
- Agentic RAG·GraphRAG는 벡터 RAG로 못 푸는 질문이 쌓인 뒤에 논한다.
- 지표는 검색과 생성으로 나눠 본다. 지표마다 고칠 곳이 다르다.
- 한 번에 하나만 붙이고 잰다. 좋아지지 않으면 되돌린다.

여기까지가 2일차다. 다음 글부터는 답하는 AI를 일하는 AI로 바꾸는 3일차 내용이 시작된다.

---

이전 글: [2일차 ④ — RAG, 우리 문서를 근거로](/posts/skala-springai-day2-rag/) · 다음 글: [3일차 ① — 판단은 모델, 실행은 우리 코드](/posts/skala-springai-day3-tools/)
