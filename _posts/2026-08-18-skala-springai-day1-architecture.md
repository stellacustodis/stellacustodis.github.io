---
title: "[SKALA] Spring AI 1일차 ② — 3대 추상화와 공급자 독립성"
date: 2026-08-18 20:00:00 +0900
permalink: /posts/skala-springai-day1-architecture/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, embedding, vectorstore, autoconfiguration]
description: "ChatModel·EmbeddingModel·VectorStore 세 인터페이스가 Spring AI의 뼈대인 이유를 정리하고, 임베딩 유사도를 직접 계산하는 실습으로 '뜻이 가까우면 벡터도 가깝다'를 숫자로 확인한다."
---

## Spring AI가 실제로 걷어 낸 것

Spring AI는 AI 모델을 Spring Boot의 방식으로 다루게 해 주는 프레임워크다. 이 설명만으로는 무엇이 편해지는지 잘 와닿지 않는데, 걷어 내는 대상을 나열해 보면 구체적이 된다.

- HTTP 호출과 재시도
- 요청·응답 JSON의 직렬화와 파싱
- 공급자별 인증 헤더
- 공급자마다 다른 파라미터 이름

Python에서 LLM API를 다룰 때는 이 부분을 SDK가 처리해 주거나, 아니면 직접 `requests`로 감쌌다. Spring AI가 다른 점은 그 결과물이 **컨테이너가 관리하는 빈**으로 나온다는 것이다. `ChatModel`이나 `ChatClient.Builder`를 생성자에서 주입받으면 끝이고, 배선 코드는 한 줄도 쓰지 않는다.

```text
스타터 의존성 → application.yml → Spring Boot 자동 구성 → AI 빈
```

이 흐름이 의미하는 바는 명확하다. 어떤 모델을 쓸지는 **코드가 아니라 설정이 정한다.**

## 뼈대는 세 인터페이스

교재는 Spring AI의 뼈대를 세 인터페이스로 정리한다.

| 인터페이스 | 하는 일 | 어디에 쓰이나 |
|---|---|---|
| `ChatModel` | 프롬프트 → 텍스트 응답 | 대화·생성·요약 |
| `EmbeddingModel` | 텍스트 → 의미 벡터 | 검색과 RAG의 준비물 |
| `VectorStore` | 벡터 저장·유사도 검색 | 근거 문서를 찾는다 |

이후 3일 동안 배우는 모든 기능이 이 셋의 조합이다. RAG는 `EmbeddingModel` + `VectorStore` + `ChatModel`이고, Tool Calling은 `ChatModel`에 실행 가능한 함수 목록을 얹은 것이며, 시맨틱 캐시는 `EmbeddingModel` + `VectorStore`를 캐시 용도로 재사용한 것이다.

`ChatModel`은 가장 낮은 계층이라 실무에서 직접 쓰는 일은 드물다. 대개 그 위의 `ChatClient`로 감싸 쓴다. 다만 저수준 호출이 어떻게 생겼는지는 한 번 볼 필요가 있다.

```java
@Service
public class SummaryService {

    private final ChatModel chatModel;   // 생성자 주입

    public String summarize(String text) {
        Prompt prompt = new Prompt("요약해줘:\n" + text);
        return chatModel.call(prompt)
                .getResult().getOutput().getText();
    }
}
```

`getResult().getOutput().getText()`라는 체인이 붙는 이유는 응답이 텍스트만 담고 있지 않기 때문이다. 토큰 사용량, 종료 이유, 응답한 모델명이 함께 온다. 이 메타데이터는 3일차 계측에서 다시 쓰인다.

## 임베딩을 숫자로 확인하는 실습

임베딩은 "문장을 숫자 벡터로 바꾼 것"이고, 핵심 발상은 한 문장이다. **뜻이 가까우면 벡터도 가깝다.** 이 문장이 검색(RAG)의 전부라는 것이 교재의 주장인데, 말로 들으면 당연해 보여서 오히려 넘어가기 쉽다.

2장 실습은 그것을 숫자로 보게 만든다. 속담 네 개를 고정해 두고, 사용자가 넣은 문장과의 코사인 유사도를 직접 계산한다.

```java
@RestController
public class ProverbLab {

    private final EmbeddingModel embedding;              // 뜻을 숫자로 바꾸는 도구

    public ProverbLab(EmbeddingModel embedding) {
        this.embedding = embedding;
    }

    static final List<String> 속담 = List.of(
            "티끌 모아 태산", "돌다리도 두들겨 보고 건너라",
            "원숭이도 나무에서 떨어진다", "가는 말이 고와야 오는 말이 곱다");

    @GetMapping("/lab1/proverb")                         // GET ?q=조심해서 나쁠 건 없지
    public Map<String, Double> match(@RequestParam String q) {
        float[] 내문장 = embedding.embed(q);               // 내 문장 → 숫자 배열
        Map<String, Double> 점수 = new LinkedHashMap<>();
        for (String p : 속담) {
            점수.put(p, cosine(내문장, embedding.embed(p))); // 속담과 거리 재기
        }
        return 점수;
    }

    /** 두 화살표가 이루는 각도. 1 에 가까울수록 비슷하다. */
    static double cosine(float[] a, float[] b) {
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
}
```

`"조심해서 나쁠 건 없지"`를 넣으면 `"돌다리도 두들겨 보고 건너라"`가 1등으로 올라온다. 두 문장은 **겹치는 단어가 하나도 없다.** 키워드 검색이라면 절대 찾지 못한다.

여기서 배우는 것은 임베딩 개념 자체보다 **테스트를 어떻게 쓰느냐**였다. 교재는 값이 아니라 순서를 검증하라고 못 박는다.

```java
@Test void 뜻이_가까운_속담이_1등이다() {
    var r = lab.match("조심해서 나쁠 건 없지");
    String top = r.entrySet().stream().max(Map.Entry.comparingByValue()).get().getKey();
    assertThat(top).contains("돌다리");   // 점수는 모델 버전마다 조금씩 달라진다
}
```

점수를 단언하면 모델 버전이 바뀔 때마다 테스트가 깨진다. 이 구분은 2일차 구조화 출력 테스트와 3일차 도구 테스트에서 그대로 반복된다. **모델의 답 내용이 아니라 우리 코드가 응답을 다루는 방식을 검증한다.**

## 실습에서 가장 흔한 함정: 임베딩 모델 설정 누락

`application.yml`을 보면 채팅 모델과 임베딩 모델이 따로 설정되어 있다.

```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o-mini
          temperature: 0.7
      embedding:
        options:
          model: text-embedding-3-small
```

교재는 임베딩 설정 누락을 "실습 최대 함정"으로 표시해 뒀다. 채팅은 잘 되는데 검색만 빈 결과가 나오는 상황이 여기서 나온다. 증상이 조용해서(오류가 아니라 빈 결과) 원인을 찾기 어렵다는 점이 특히 그렇다.

## VectorStore: 저장소가 무엇이든 인터페이스는 같다

`VectorStore`는 벡터를 저장하고 질문 벡터와 가까운 조각을 찾아 준다. pgvector, Redis, Chroma, Elasticsearch 어느 것을 쓰든 인터페이스는 같다.

RAG 샘플 코드가 이 추상화를 실제로 활용하는 방식이 인상적이었다. 인메모리 구현을 기본으로 두되, **조건부 등록**을 걸어 뒀다.

```java
@Configuration
public class VectorStoreConfig {

    @Bean
    @ConditionalOnMissingBean(VectorStore.class)
    public VectorStore simpleVectorStore(EmbeddingModel embeddingModel) {
        return SimpleVectorStore.builder(embeddingModel).build();
    }
}
```

`@ConditionalOnMissingBean`이 붙어 있으므로, pgvector 스타터를 의존성에 추가하면 자동 구성이 만든 `VectorStore` 빈이 등장하고 이 인메모리 빈은 물러난다. 코드를 지우거나 주석 처리할 필요가 없다.

주석에도 경계가 분명히 적혀 있다. "운영에서는 쓰지 않는다. 재시작하면 사라지고, 인스턴스마다 따로 갖는다." 인메모리가 재시작마다 사라진다는 사실 자체가 저장소를 바꿀 시점의 신호라는 것이 교재의 기준이다.

## 공급자 독립성은 어디까지 진짜인가

"공급자 교체는 의존성 한 줄 + `application.yml`"이라는 주장은 검증할 필요가 있다. 실제 샘플의 `build.gradle`을 보면 모델과 관련된 줄은 두 개뿐이다.

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.6'   // Swagger UI
    implementation 'org.springframework.ai:spring-ai-starter-model-openai'

    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}

dependencyManagement {
    imports { mavenBom "org.springframework.ai:spring-ai-bom:${springAiVersion}" }
}
```

`spring-ai-starter-model-openai` 한 줄이 공급자를 정한다. 아티팩트 이름에 규칙이 있어서 이름만 보면 역할을 알 수 있다.

| 패턴 | 역할 |
|---|---|
| `spring-ai-starter-model-*` | 모델 공급자 연동 + 자동 구성 |
| `spring-ai-starter-vector-store-*` | 벡터 저장소 연동 + 자동 구성 |
| `spring-ai-starter-mcp-*` | MCP 클라이언트/서버 |
| `spring-ai-advisors-vector-store` | `QuestionAnswerAdvisor` 등 RAG Advisor |
| `spring-ai-rag` | 모듈형 RAG 파이프라인 |
| `spring-ai-bom` | 버전 일괄 관리 |

다만 교재는 독립성의 경계도 함께 그어 둔다. 공통 옵션(`model`, `temperature`, `topP`, `maxTokens`)은 `ChatOptions`로 동일하게 쓸 수 있지만, 공급자 고유 옵션은 각자의 `XxxChatOptions`로만 지정된다.

| 구분 | 공통(`ChatOptions`) | 공급자 고유 |
|---|---|---|
| 모델 선택 | `model` | `OpenAiChatOptions.model` |
| 창의성 | `temperature` · `topP` | `frequencyPenalty` · `presencePenalty` |
| 길이 제한 | `maxTokens` | OpenAI: `maxCompletionTokens` |
| 출력 형식 | — | OpenAI: `responseFormat`(JSON Schema) |
| 추론 강도 | — | Anthropic: `thinking` / OpenAI: `reasoningEffort` |

**고유 옵션을 쓰는 순간 그 코드는 그 공급자에 묶인다.** 이 경계를 알고 쓰라는 것이 교재의 표현이다. 완전한 이식성을 약속하는 것이 아니라, 어디까지가 무료이고 어디부터가 비용인지를 명시한다는 점이 오히려 신뢰가 갔다.

## 개발환경에서 실제로 막히는 지점

과정에서 별도의 장으로 다룰 만큼 비중을 둔 것이 환경 문제였다. 증상과 원인이 거의 일대일이라 표로 정리된다.

| 증상 | 원인 | 해결 |
|---|---|---|
| 기동 중 OpenAI 빈 생성 실패 | 환경변수 미설정 — 1.1.8 자동 구성은 빈 생성 때 키를 검사한다 | `export OPENAI_API_KEY=...` 후 재시작 |
| 401 Unauthorized | 키 오류·폐기·권한 또는 조직/프로젝트 불일치 | 키·조직·프로젝트와 권한 확인 |
| 429 Too Many Requests | 요청 레이트 리밋 또는 크레딧·지출·사용 한도 소진 | 레이트 리밋이면 `Retry-After`에 맞춰 재시도, 한도 오류면 크레딧·한도 조정 |
| 한글이 깨진다 | 인코딩 불일치 | JVM `-Dfile.encoding=UTF-8`, 컴파일·테스트·터미널도 UTF-8 |
| 빈 주입 실패 | 메인 클래스 패키지 위치 | 최상위 패키지로 이동 |
| 임베딩만 실패 | 임베딩 모델 미설정 | `text-embedding-3-small` 설정 확인 |

이 시리즈가 기준으로 삼은 Spring AI 1.1.8에서는 OpenAI 자동 구성이 켜져 있으면 키가 없을 때 **빈 생성 중 기동이 실패한다.** 호출 시점의 401은 키가 잘못됐거나 만료된 경우처럼 자격 증명이 존재하지만 공급자가 거부할 때 드러난다.

```bash
unset OPENAI_API_KEY && ./gradlew bootRun     # OpenAI 빈 생성 중 기동 실패
export OPENAI_API_KEY="sk-..." && ./gradlew bootRun   # 되돌리면 정상
```

한글 인코딩은 실제로 신경 쓸 지점이었다. 샘플 코드의 `build.gradle`이 세 군데에 인코딩을 고정해 둔 이유가 그것이다.

```groovy
// 편집기·OS 가 달라도 한글 주석·프롬프트가 깨지지 않게 인코딩을 고정한다.
tasks.withType(JavaCompile).configureEach { options.encoding = 'UTF-8' }
tasks.withType(Test).configureEach { systemProperty 'file.encoding', 'UTF-8' }
tasks.named('bootRun') { jvmArgs = ['-Dfile.encoding=UTF-8'] }
```

프롬프트가 한국어인 애플리케이션에서는 인코딩이 문자열 표시 문제로 끝나지 않는다. 시스템 프롬프트가 깨지면 모델의 지시 자체가 깨진다.

## 정리

- Spring AI는 HTTP·JSON·인증을 걷어 내고, 그 결과를 컨테이너가 관리하는 빈으로 준다.
- 뼈대는 `ChatModel`·`EmbeddingModel`·`VectorStore` 셋이고, 이후 모든 기능이 이 조합이다.
- 임베딩은 "뜻이 가까우면 벡터도 가깝다"가 전부다. 단어가 겹치지 않아도 찾는다.
- 임베딩 테스트는 점수가 아니라 순서를 검증한다.
- 공급자 교체는 스타터 + `yml`이면 되지만, 고유 옵션을 쓰는 순간 그 코드는 묶인다.
- Spring AI 1.1.8의 OpenAI 자동 구성이 켜져 있으면 키 누락은 기동 시점에 드러난다.

다음 글에서는 `ChatModel` 위에 얹히는 `ChatClient`를 다룬다. 모델을 부르는 창구를 어떻게 만들고, 왜 하나가 아니라 여러 개로 나누는지를 본다.

---

이전 글: [1일차 ① — AI는 어느 계층에 두는가](/posts/skala-springai-day1-layers/) · 다음 글: [1일차 ③ — ChatClient, 모델을 부르는 창구](/posts/skala-springai-day1-chatclient/)
