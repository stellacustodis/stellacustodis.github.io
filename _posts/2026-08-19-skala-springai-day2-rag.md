---
title: "[SKALA] Spring AI 2일차 ④ — RAG, 우리 문서를 근거로"
date: 2026-08-19 22:00:00 +0900
permalink: /posts/skala-springai-day2-rag/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, rag, vectorstore, chunking, metadata]
description: "인제스트의 네 단계와 메타데이터 설계, QuestionAnswerAdvisor로 근거를 주입하는 방법, 그리고 응답 컨텍스트에서 출처를 꺼내는 코드를 정리한다. 중복 적재와 메타데이터 누락이라는 두 함정을 함께 다룬다."
---

## 오픈북 시험

RAG를 설명하는 비유 중 교재가 택한 것은 오픈북 시험이었다. 모델을 똑똑하게 만드는 것이 아니라, 답이 적힌 페이지를 찾아서 같이 건네주는 것이다.

| 폐쇄형 시험 | 모델이 아는 것만으로 답 | 모르면 지어낸다 |
| 오픈북 시험 | RAG — 근거를 찾아 붙여 답 | **모르면 모른다고 할 수 있다** |

두 번째 줄의 오른쪽이 RAG의 실질적 가치라고 본다. 정확도가 오르는 것보다, **모델이 "모른다"고 말할 근거가 생기는 것**이 크다. 근거 문서가 검색되지 않았다는 사실 자체가 신호이기 때문이다.

RAG는 두 단계로 나뉜다.

```text
Indexing(사전 준비)   문서 → Reader → Splitter → Embedding → VectorStore
Retrieval(질문마다)   질문 → 유사도 검색 → 질문+근거 → ChatModel → 근거 있는 답
```

이 분리가 디버깅의 출발점이다. 문제가 생기면 어느 쪽인지부터 가른다.

## 인제스트: 읽기 → 나누기 → 메타데이터 → 저장

샘플 코드의 `IngestService`가 네 단계를 그대로 보여 준다.

```java
public IngestResult ingest(Resource file, String docType, String dept) {
    String source = file.getFilename() == null ? "unknown" : file.getFilename();

    deleteExisting(source);

    // ① Read — Tika 하나로 PDF·DOCX·HTML·TXT 를 모두 읽는다
    List<Document> raw = new TikaDocumentReader(file).get();

    // ② Split — 청크 크기는 "질문 하나에 답할 만한 분량"이 기준이다
    List<Document> chunks = TokenTextSplitter.builder()
            .withChunkSize(800)
            .withMinChunkSizeChars(350)
            .withKeepSeparator(true)
            .build()
            .apply(raw);

    // ③ Enrich — 인제스트 때 안 넣은 메타데이터는 나중에 넣을 수 없다
    List<Document> enriched = chunks.stream()
            .map(chunk -> {
                Map<String, Object> meta = new HashMap<>(chunk.getMetadata());
                meta.put("source", source);
                meta.put("docType", docType);
                meta.put("dept", dept);
                meta.put("version", LocalDate.now().toString());
                return new Document(chunk.getText(), meta);
            })
            .toList();

    // ④ Write — 임베딩 + 저장
    vectorStore.add(enriched);
    log.info("인제스트 완료 source={} chunks={}", source, enriched.size());

    return new IngestResult(source, enriched.size());
}
```

`TikaDocumentReader` 하나가 PDF·DOCX·HTML·TXT를 다 읽는다는 점이 편했다. 형식별 Reader를 고르는 분기가 없다.

`vectorStore.add(enriched)`에 임베딩 호출이 보이지 않는 것도 짚어 둘 만하다. `VectorStore`가 내부적으로 `EmbeddingModel`을 부른다. 그래서 임베딩 모델 설정이 빠지면 이 줄에서 조용히 실패한다.

## 함정 ①: 재색인 없이 add만 반복

`ingest()`의 첫 줄이 `deleteExisting(source)`인 이유가 있다.

```java
/** 재색인 대비 — 이 문서에서 나온 청크를 모두 지운다. */
private void deleteExisting(String source) {
    try {
        vectorStore.delete("source == '" + source + "'");
    } catch (Exception e) {
        // 인메모리 스토어 등 필터 삭제를 지원하지 않는 구현도 있다
        log.debug("기존 청크 삭제를 건너뛴다: {}", e.getMessage());
    }
}
```

같은 문서를 두 번 넣으면 청크가 중복 적재된다. 그러면 검색 결과가 같은 문장으로 도배되고 근거가 다양해지지 않는다.

이 함정이 특히 고약한 이유는 **오류를 내지 않는다**는 데 있다. 인제스트는 성공했다고 나오고, 검색도 결과를 반환한다. 다만 품질만 조용히 나빠진다. 그래서 실습은 인제스트를 두 번 실행하고 청크 수를 비교하게 한다.

```bash
curl -X POST localhost:8080/ch07/ingest-samples   # return-policy.md → 3조각 ...
curl -X POST localhost:8080/ch07/ingest-samples   # 같은 숫자여야 정상(재색인)
```

숫자가 늘면 재색인이 빠진 것이다.

`catch` 블록의 주석도 실용적이다. 인메모리 스토어는 필터 삭제를 지원하지 않을 수 있으므로 실패해도 진행한다. 개발 환경에서는 어차피 재시작하면 사라진다.

## 함정 ②: 메타데이터는 나중에 넣을 수 없다

③단계 주석이 이 장에서 가장 실무적인 한 줄이다. **인제스트 때 안 넣은 메타데이터는 나중에 넣을 수 없다.** 넣으려면 전량 재색인해야 한다.

각 필드의 용도가 명확하다.

| 필드 | 용도 |
|---|---|
| `source` | 출처 표기 · 재색인 시 삭제 기준 |
| `docType` | 필터 검색 |
| `dept` | 권한·범위 제한 |
| `version` | 최신본 판별 |
| `validUntil` | 만료 문서 제외 |

교재는 "처음부터 넉넉히 넣어 두는 편이 언제나 싸다"고 정리한다. 나중에 필요 없어진 필드는 무시하면 그만이지만, 없는 필드를 채우려면 전체 문서를 다시 읽고 다시 임베딩해야 한다. 임베딩 호출 비용이 그대로 다시 든다.

## 청킹: 질문 하나에 답할 만한 분량

청크 크기의 기준은 "질문 하나에 답할 만한 분량"이다. 너무 잘면 맥락이 끊기고, 너무 크면 잡음이 함께 딸려 온다.

| 문서 유형 | 권장 크기 | 겹침 | 이유 |
|---|---|---|---|
| FAQ · Q&A | 300~500 토큰 | 10% | 한 항목이 곧 한 청크 |
| 규정 · 매뉴얼 | 600~900 토큰 | 15~20% | 조항 단위 · 앞뒤 참조가 있다 |
| 기술 문서 | 800~1200 토큰 | 20% | 코드·표가 잘리면 못 쓴다 |
| 회의록 · 대화 | 400~700 토큰 | 20% | 화자 전환이 경계 |
| 법률 · 계약 | 구조 기반 분할 | 조항 단위 | 크기보다 조항 경계가 우선 |

겹침(overlap)은 경계에서 잘린 문장을 구제하는 보험이다. 근거가 반토막 나는 것을 막는다.

샘플의 `withChunkSize(800)`은 기술 문서·매뉴얼 구간에 해당한다. `withMinChunkSizeChars(350)`은 지나치게 작은 조각이 만들어지는 것을 막는다. 마지막 조각이 몇십 자만 남는 경우가 흔한데, 그런 청크는 검색에 걸려도 쓸모가 없다.

## QuestionAnswerAdvisor: 검색과 주입을 대신 처리한다

Retrieval 쪽은 Advisor 하나로 끝난다.

```java
ChatClient chat = builder
    .defaultAdvisors(new QuestionAnswerAdvisor(vectorStore))
    .build();

// 이제 이 한 줄이 자동으로 검색+근거 주입을 한다
String answer = chat.prompt().user(q).call().content();
```

평범한 질문이 근거 있는 질문이 된다. 실제 서비스 코드는 여기에 필터와 임계값을 얹는다.

```java
public Answer ask(String question, String dept, String conversationId) {
    SearchRequest.Builder search = SearchRequest.builder()
            .topK(5)
            .similarityThreshold(0.62);
    if (dept != null) {
        search.filterExpression("dept == '" + dept + "'");
    }

    var qa = QuestionAnswerAdvisor.builder(vectorStore)
            .searchRequest(search.build())
            .build();

    var spec = chat.prompt()
            .system("""
                    너는 사내 규정 안내 도우미다.
                    - 반드시 주어진 근거 문서 안의 내용만으로 답한다.
                    - 근거에서 답을 찾을 수 없으면 "제공된 문서에서 확인되지 않습니다"라고 답한다.
                    - 추측하거나 일반 상식으로 채우지 않는다.""")
            .user(question)
            .advisors(qa);

    if (conversationId != null) {
        spec = spec.advisors(a -> a.param(ChatMemory.CONVERSATION_ID, conversationId));
    }

    ChatClientResponse response = spec.call().chatClientResponse();
    return new Answer(response.chatResponse().getResult().getOutput().getText(),
            extractSources(response));
}
```

시스템 프롬프트의 세 줄이 앞 글의 체크리스트를 그대로 따른다. 근거 규칙("문서 안의 내용만으로"), 모를 때("확인되지 않습니다"), 금지("추측하지 않는다"). 이 지시가 없으면 모델은 근거를 받고도 일반 상식으로 빈칸을 채운다.

## 출처는 우리가 꺼내야 한다

Advisor가 근거를 넣어 주지만 **출처 표기는 자동이 아니다.** 검색된 문서는 응답 컨텍스트에 담겨 오고, 그것을 꺼내는 코드는 우리가 쓴다.

```java
/** 어떤 근거가 실제로 쓰였는지 꺼낸다. 출처 없는 답은 검증할 수 없는 답이다. */
@SuppressWarnings("unchecked")
private List<Source> extractSources(ChatClientResponse response) {
    Object raw = response.context().get(QuestionAnswerAdvisor.RETRIEVED_DOCUMENTS);
    if (!(raw instanceof List<?> list)) {
        return List.of();
    }
    return ((List<Document>) list).stream()
            .map(d -> new Source(
                    String.valueOf(d.getMetadata().get("source")),
                    String.valueOf(d.getMetadata().get("version"))))
            .distinct()
            .toList();
}
```

`QuestionAnswerAdvisor.RETRIEVED_DOCUMENTS` 키로 꺼낸다. 그래서 앞 글에서 본 네 가지 호출 방식 중 `chatClientResponse()`가 필요하다. `content()`만 쓰면 이 컨텍스트에 접근할 수 없다.

`.distinct()`가 붙은 이유는 같은 문서에서 여러 청크가 회수될 수 있기 때문이다. 사용자에게는 문서 단위로 보여 주는 편이 낫다.

여기서 메타데이터 설계가 값을 한다. `source`와 `version`을 인제스트 때 넣어 뒀기 때문에 출처를 만들 수 있다. 안 넣었으면 이 코드가 `null`만 반환한다.

## 검색만 따로 보는 엔드포인트

RAG 디버깅에서 가장 중요한 도구는 화려한 기법이 아니라 **검색 결과를 눈으로 보는 창구**다.

```java
/** Advisor 없이 직접 검색해 보고 싶을 때 — 무엇이 회수됐는지 눈으로 확인하는 용도. */
public List<String> retrieveOnly(String question, int topK) {
    List<Document> hits = vectorStore.similaritySearch(
            SearchRequest.builder().query(question).topK(topK).build());
    return hits == null ? List.of() : hits.stream().map(Document::getText).toList();
}
```

```java
/** 검색만 해 본다 — RAG 품질 문제의 원인이 검색인지 생성인지 가르는 첫 단계. */
@GetMapping("/retrieve")
public Map<String, Object> retrieve(@RequestParam String q,
                                    @RequestParam(defaultValue = "5") int topK) {
    return Map.of("query", q, "chunks", rag.retrieveOnly(q, topK));
}
```

교재는 이 엔드포인트를 두고 "하나 열어 두면 평생 쓴다"고 표현했다. 그리고 진단의 첫 질문을 못 박는다.

> "검색 결과를 눈으로 봤는가?" — 이 질문에 아니오라면 아직 진단을 시작하지 않은 것이다.
{: .prompt-warning }

3일차 실습 자료의 검색 API는 여기서 한 걸음 더 나아가 **점수를 함께 노출**한다.

```java
return vectorStore.similaritySearch(SearchRequest.builder()
                .query(q).topK(topK)
                .similarityThreshold(0.5)      // 낮은 점수는 근거가 아니다
                .build())
        .stream()
        .map(d -> new Chunk(d.getMetadata().get("source").toString(),
                            d.getScore(),      // 점수를 노출한다
                            snippet(d.getText(), 120)))
        .toList();
```

점수를 봐야 임계값을 조정할 근거가 생긴다. "감으로 판단하지 않는다"는 것이 주석의 지적이다.

## 근거가 없으면 모델을 부르지 않는다

실습 자료의 `ask()`에는 계층 관점에서 중요한 판단이 하나 들어 있다.

```java
public AnswerDto ask(String question) {
    var docs = retrieve(question, 4);
    if (docs.isEmpty()) {
        return AnswerDto.unknown();      // 근거가 없으면 모델을 부르지 않는다
    }
    return chatClient.prompt()
        .system("""
            아래 [근거]만 사용해 답한다. 근거에 없으면 "확인되지 않습니다"라고 답한다.
            추측하지 않는다. 답변 끝에 사용한 출처를 [출처: 파일명] 형식으로 남긴다.
            """)
        .user(u -> u.text("[근거]\n{context}\n\n[질문] {question}")
                    .param("context", format(docs))
                    .param("question", question))
        .call()
        .entity(AnswerDto.class);        // 구조화 출력 — 문자열 파싱 금지
}

record AnswerDto(String answer, List<String> sources, boolean grounded) {
    static AnswerDto unknown() { return new AnswerDto("확인되지 않습니다.", List.of(), false); }
}
```

근거가 비었으면 모델 호출 자체를 건너뛴다. 프롬프트 지시에 의존하는 것보다 확실하고, 호출 비용도 절약된다. 1일차의 "업무 판단은 서비스 계층에서"가 여기서 구체적인 형태로 나타난다.

응답이 `String`이 아니라 `record`인 것도 앞 글의 연장이다. `grounded` 필드로 근거 사용 여부를 명시하면 화면이 "이 답변은 문서에 근거함" 배지를 붙일 수 있다.

## 벡터 저장소 선택 기준

판단 기준이 성능이 아니라는 점이 인상적이었다.

| 선택지 | 강점 | 약점 | 적합 |
|---|---|---|---|
| pgvector | 이미 쓰는 PostgreSQL 그대로 | 초대량에선 튜닝 필요 | **대부분의 팀의 첫 선택** |
| Redis | 빠름 · 이미 캐시로 씀 | 메모리 비용 | 소~중규모 · 낮은 지연 |
| Elasticsearch | 키워드+벡터 하이브리드 | 운영 부담 | 검색이 핵심 기능일 때 |
| Chroma | 가볍고 시작이 쉽다 | 운영 기능 부족 | PoC · 로컬 개발 |
| SaaS | 운영 부담 없음 | 비용 · 데이터 외부 전송 | 인프라 인력이 없을 때 |

기준은 **"우리 팀이 운영할 수 있는가"**다. 이미 쓰는 DB에 확장을 얹는 것이 대체로 가장 싸다. 어차피 코드는 `VectorStore` 인터페이스에 의존하므로 나중에 바꿔도 된다.

샘플에는 pgvector용 `docker-compose.yml`이 포함되어 있고, 기본 실행에는 필요 없다고 주석에 적혀 있다.

```yaml
# pgvector 로 바꿔 볼 때만 쓴다. 기본 실행에는 필요 없다.
services:
  pgvector:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_DB: springai
      POSTGRES_USER: springai
      POSTGRES_PASSWORD: springai
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
```

## 임베딩 모델은 한 번 정하면 바꾸기 어렵다

RAG 설계에서 되돌리기 가장 어려운 결정이 임베딩 모델이다.

> 임베딩 모델을 바꾸면 기존 벡터는 전부 무용지물이다. 차원이 같아도 의미 공간이 달라 섞이면 검색이 조용히 망가진다 — 오류도 안 난다.
{: .prompt-warning }

"오류도 안 난다"가 핵심이다. 차원만 맞으면 저장도 검색도 정상적으로 동작하고, 결과만 무의미해진다.

인덱스 설정에서도 같은 종류의 함정이 있다.

```yaml
spring:
  ai:
    vectorstore:
      pgvector:
        initialize-schema: true
        index-type: HNSW              # 기본값 · 운영 권장
        distance-type: COSINE_DISTANCE
        dimensions: 1536              # 임베딩 모델과 반드시 일치해야 한다
```

`dimensions`가 임베딩 모델과 다르면 저장 시점에 오류가 나거나, 더 나쁘게는 엉뚱한 결과가 나온다.

인덱스 자체도 규모에 따라 필요해진다. 벡터 검색은 기본적으로 전수 비교라 문서가 늘면 선형으로 느려진다. HNSW는 정확도를 조금 내주고 속도를 크게 얻는 근사 방식이고, 1만 건 미만 개발 환경에서는 인덱스 없이도 무방하다.

## RAG 실패 진단표

교재가 정리한 진단표가 실용적이다. 순서는 언제나 같다. **검색 → 프롬프트 → 그다음 모델.**

| 증상 | 먼저 확인 | 원인 | 대응 |
|---|---|---|---|
| 아무것도 못 찾는다 | 인제스트 됐는가 | 문서 미적재 · 파싱 실패 | 청크 수 확인 · Reader 교체 |
| 엉뚱한 문서가 온다 | 검색 결과 상위 5건 | 임계값이 낮다 · 청크가 크다 | threshold↑ · 청크↓ · 필터 |
| 관련 문서가 빠진다 | 질문 표현 | 질문-문서 어휘 차이 | HyDE · 질문 변환 · 하이브리드 |
| 근거는 맞는데 답이 틀림 | 시스템 프롬프트 | 근거를 안 쓰고 지어냄 | "근거 안에서만" 명시 |
| 출처가 안 나온다 | 응답 컨텍스트 | 꺼내는 코드가 없다 | `RETRIEVED_DOCUMENTS` 사용 |
| 같은 문장만 반복 | 청크 중복 | 재색인 없이 add 반복 | `source` 기준 삭제 후 재적재 |
| 느리다 | topK · 임베딩 호출 | topK 과다 · 인덱스 없음 | 재순위로 좁힘 · HNSW |

네 번째 줄과 세 번째 줄의 구분이 이 표의 요점이다. **검색이 못 찾은 것과 모델이 못 쓴 것은 고칠 곳이 완전히 다르다.** 근거에 답이 아예 없으면 검색 문제이고, 근거에 있는데 못 쓰면 생성 문제다.

## 골든 세트로 측정한다

느낌으로 고치면 고쳤는지 알 수 없다. 실습은 정답이 정해진 질문 10개를 파일로 만들고 기준선을 코드에 박게 한다.

```json
[
 {"q": "단순 변심 반품은 며칠 이내인가요?", "must": ["7일"],      "src": "return-policy"},
 {"q": "제주도는 배송비가 더 드나요?",      "must": ["추가"],      "src": "shipping-policy"},
 {"q": "골드 등급 적립률은?",              "must": ["3%"],       "src": "membership"},
 {"q": "우주 배송도 되나요?",              "must": ["확인되지"],  "src": null}
]
```

마지막 문항이 핵심이다. **문서에 없는 것을 지어내지 않는지** 본다. `src`가 `null`이라 출처 검증을 건너뛰고 거절 문구만 확인한다.

```java
@Test   // 모델을 부르므로 기본 테스트에서는 제외한다 (./gradlew test -Peval)
void 골든_세트_평가() throws Exception {
    int pass = 0;
    for (Golden g : golden) {
        AnswerDto a = service.ask(g.q());
        boolean hit  = g.must().stream().allMatch(k -> a.answer().contains(k));
        boolean cite = g.src() == null
                    || a.sources().stream().anyMatch(s -> s.contains(g.src()));
        if (hit && cite) { pass++; }
        else { log.warn("실패: {}\n 답변: {}\n 출처: {}", g.q(), a.answer(), a.sources()); }
    }
    assertThat(pass).isGreaterThanOrEqualTo(8);   // 기준선을 코드에 박아 둔다
}
```

`-Peval` 프로파일로 분리해서 기본 CI에서는 돌지 않게 한 것이 실용적이다. 모델을 부르는 테스트를 매 커밋마다 돌리면 느리고 비싸다.

실패는 두 종류로 나눠 적으라는 지시가 붙어 있다. 근거를 못 찾은 실패와 찾고도 잘못 답한 실패는 고칠 곳이 다르기 때문이다.

표현을 바꾼 질문("물건 돌려보내려면 며칠 안에 해야 해요?")을 넣어 두라는 지침도 있다. 검색이 표현에 얼마나 흔들리는지 보는 용도이고, 다음 글에서 다룰 HyDE의 필요성이 여기서 드러난다.

## 실험표를 채운다

정답은 문서마다 다르므로 감이 아니라 기록으로 정한다. 한 번에 하나만 바꾼다.

| 조합 | 청크 | top-k | 관찰할 것 |
|---|---|---|---|
| A (기준) | 400토큰 · 겹침 0 | 4 | 기준선 |
| B (작게) | 200토큰 | 4 | 정확하지만 맥락이 부족한가? |
| C (크게) | 800토큰 | 4 | 맥락은 넓지만 잡음이 늘었나? |
| D (넓게) | 400토큰 | 8 | 근거도 비용도 함께 늘었나? |
| E (엄격) | threshold 0.7 | 4 | 거절이 늘었나? 정답도 거절했나? |
| F (겹침) | 겹침 20% | 4 | 잘린 문장 문제가 줄었나? |

E의 두 번째 질문이 중요하다. 임계값을 올리면 엉뚱한 답은 줄지만 답할 수 있는 질문까지 거절하게 된다. 두 지표를 함께 봐야 한다.

## 정리

- RAG는 오픈북 시험이다. 정확도보다 "모른다고 말할 근거"가 생기는 것이 크다.
- 인제스트는 읽기 → 나누기 → 메타데이터 → 저장 네 단계다. `TikaDocumentReader` 하나로 대부분 읽는다.
- 재색인 없이 `add`만 반복하면 청크가 중복 적재된다. 오류는 나지 않고 품질만 나빠진다.
- 메타데이터는 인제스트 시점에만 넣을 수 있다. 넉넉히 넣는 편이 언제나 싸다.
- `QuestionAnswerAdvisor`가 검색과 근거 주입을 대신 하지만, 출처는 `RETRIEVED_DOCUMENTS`에서 우리가 꺼낸다.
- 근거가 없으면 모델을 부르지 않는다. 프롬프트 지시보다 확실하다.
- 임베딩 모델과 `dimensions`는 되돌리기 어려운 결정이다. 틀려도 오류가 안 난다.
- 품질 문제는 검색 → 프롬프트 → 모델 순으로 본다. 검색 결과를 눈으로 보는 것이 진단의 시작이다.

다음 글에서는 검색이 못 찾을 때 손볼 수 있는 것들을 다룬다.

---

이전 글: [2일차 ③ — 프롬프트를 늘리지 말고 호출을 쪼갠다](/posts/skala-springai-day2-workflow/) · 다음 글: [2일차 ⑤ — 넓게 찾고 좁게 넣는다](/posts/skala-springai-day2-rag-advanced/)
