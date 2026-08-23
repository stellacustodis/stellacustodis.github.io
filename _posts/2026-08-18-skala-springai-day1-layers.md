---
title: "[SKALA] Spring AI 1일차 ① — AI는 어느 계층에 두는가"
date: 2026-08-18 19:00:00 +0900
permalink: /posts/skala-springai-day1-layers/
categories:
  - SKALA
  - Backend
tags: [skala, spring-ai, springboot, layered-architecture, dto]
description: "Spring AI 과정이 LLM이 아니라 Spring Boot 계층 구조에서 시작하는 이유를 정리한다. Controller-Service-Repository의 경계를 다시 확인하고, ChatClient 호출이 놓여야 할 자리를 코드로 확인한다."
---

## 첫 장이 LLM이 아니라 계층 구조인 이유

Spring AI 과정의 1장은 Spring AI를 다루지 않는다. `@RestController`, `@Service`, `@Repository`, DTO, 의존성 주입 같은 Spring Boot의 기본 계층 구조를 다시 짚는다. 처음에는 앞 과정(Java·Spring Boot 5일)과 겹치는 복습처럼 보였다.

그렇지 않았다. 이 장의 결론은 1장 마지막 슬라이드의 체크 문항 하나로 요약된다.

> "ChatClient는 어느 클래스에 주입되어야 하는가?"
{: .prompt-info }

이 질문에 답하려면 계층의 책임 경계를 알아야 한다. 그리고 이 질문은 3일 내내 반복된다. RAG의 검색 결과는 어디서 조립하는가, 도구의 권한 검증은 어디서 하는가, 감사 로그는 어느 지점에서 남기는가. 전부 같은 질문의 변형이다.

Java와 Spring이 아직 익숙하지 않은 상태에서 이 장이 실제로 유용했던 지점은, **애노테이션을 외우는 대신 "변경의 이유"로 계층을 구분하게 해 준 것**이었다. 화면이 바뀌면 Controller만, 업무 규칙이 바뀌면 Service만, 저장 방식이 바뀌면 Repository만 고친다. AI를 붙일 때도 같은 기준이 적용된다. 프롬프트가 바뀌면 어디가 바뀌어야 하는가를 물으면 답이 나온다.

## 계층을 나누는 목적은 변경의 파급을 가두는 것

교재는 계층 분리의 목적을 아름다움이 아니라 **변경의 파급을 가두는 것**으로 정의한다. 한 파일에 전부 넣으면 처음에는 빠르지만, 규칙이 흩어지고 한 곳을 고치면 전부 터진다.

```text
요청   HTTP 요청 → @RestController → @Service → @Repository → DB / 외부 API
응답   DTO ← 도메인 객체 ← 엔티티
```

각 계층의 책임은 다음과 같다.

| 계층 | 하는 일 | 하지 않는 일 |
|---|---|---|
| `@RestController` | 받고, 검증하고, 응답 형태로 바꿔 돌려준다 | 업무 규칙을 넣지 않는다 |
| `@Service` | 업무 흐름과 트랜잭션 경계를 정한다 | 데이터 접근 방식을 알지 않는다 |
| `@Repository` / `@Mapper` | 데이터에 닿는다. SQL은 여기서 끝난다 | 서비스를 역으로 부르지 않는다 |
| DTO | 계층 사이를 오가는 모양 | 엔티티를 그대로 노출하지 않는다 |

호출 방향의 규칙은 하나다. **위에서 아래로만 부른다.** Repository가 Service를 부르거나 Controller가 Repository를 직접 부르면 계층은 이미 무너진 것이다.

컨트롤러에 `if`가 쌓이기 시작하면 업무 규칙이 새어 들어온 신호라는 지적이 특히 기억에 남았다. 검증은 `@Valid`에, 판단은 서비스에 맡긴다는 기준은 나중에 "근거가 없으면 모델을 부르지 않는다" 같은 판단을 어디에 둘지 결정할 때 그대로 쓰였다.

## 권한 조건은 쿼리 안에 넣는다

1장에서 AI와 직접 관련이 없어 보이지만 3일차에 그대로 재등장하는 규칙이 하나 있다. 권한 조건을 조회 후 자바 코드에서 비교하지 말고 **쿼리 자체에 넣으라**는 것이다.

```java
public interface OrderRepository extends JpaRepository<Order, String> {

    // 소유자 조건을 쿼리에 넣는다 — 이 한 줄이 권한 경계다
    Optional<Order> findByIdAndOwnerId(String id, String ownerId);
}
```

`findById()`로 꺼낸 뒤 자바에서 소유자를 비교하는 코드는 조건을 빠뜨릴 여지를 남긴다. 이 원칙은 3일차 Tool Calling에서 정확히 같은 형태로 다시 나온다. 모델이 넘긴 주문번호를 그대로 조회하면 "주문번호 아무거나 대 보기"로 남의 데이터가 나가기 때문에, 도구 안에서 소유자 조건을 함께 걸어야 한다.

## DTO는 계층 사이의 방화벽

엔티티를 API로 그대로 내보내면 DB 구조가 곧 API 스펙이 된다. 컬럼 하나 바꿨을 뿐인데 클라이언트가 깨진다. 그래서 요청·응답은 `record`로 만든 DTO로 주고받고, 변환은 한 곳에 모은다.

```java
// 응답 DTO — 내보낼 필드만 고른다
public record OrderResponse(String orderId, String item,
                            String status, LocalDate eta) {

    public static OrderResponse from(Order order) {   // 변환은 한 곳에서
        return new OrderResponse(order.getId(), order.getItem().getName(),
                order.getStatus().name(), order.getEta());
    }
}

@Entity                                  // 엔티티는 밖으로 나가지 않는다
class Order {
    @Id private String id;
    private String ownerId;              // 내부 전용 — 응답에 없다
    private BigDecimal cost;             // 원가 — 노출하면 안 된다
}
```

Python으로 API를 만들 때는 dict를 그대로 반환하는 일이 흔했기 때문에, "나갈 때는 반드시 다른 타입으로 바꾼다"는 규칙이 처음에는 번거롭게 느껴졌다. 다만 2일차 구조화 출력에서 `record`가 그대로 LLM 응답의 스키마가 되는 것을 보고 나서는 이 규칙의 값어치가 달라 보였다. 응답 모양을 타입으로 정의해 두면 그 타입이 API 계약이자 모델에게 주는 출력 명세가 된다.

## 첫 실습: AI가 한 줄도 없는 3계층

1장 실습은 AI를 쓰지 않는다. API 키도 필요 없다. 목적은 계층 왕복을 눈으로 확인하는 것 하나다.

```java
// ① Controller — 요청을 받아 서비스에 넘기기만 한다
@RestController
@RequestMapping("/lab0/snack")
public class SnackController {

    private final SnackService service;   // 저장소는 모른다

    public SnackController(SnackService service) {
        this.service = service;
    }

    @GetMapping                            // GET /lab0/snack?mood=피곤
    public SnackResponse pick(@RequestParam String mood) {
        return service.recommend(mood);
    }
}
```

```java
// ② Service — '무엇을 하는가'는 여기에만 적는다
@Service
public class SnackService {

    private final SnackRepository repo;

    public SnackService(SnackRepository repo) {
        this.repo = repo;
    }

    public SnackResponse recommend(String mood) {
        Snack s = repo.findByMood(mood)                     // ③ 데이터는 저장소에서만
                .orElse(new Snack("아메리카노", "무난하게"));
        return new SnackResponse(s.name(), s.reason());     // ④ 나갈 때는 DTO 로
    }
}
```

샘플 코드의 `SnackRepository`에는 실제 DB가 없다. 인메모리 `Map` 하나가 전부다. 주석이 그 이유를 명시한다.

```java
/**
 * 1장 미니 실습 — 데이터에 닿는 유일한 자리.
 *
 * <p>실제 DB 는 쓰지 않는다. 여기서 중요한 것은 "저장소를 뒤지는 일은 여기서만 한다" 는
 * 약속이지, 어디에 담겨 있느냐가 아니다. 나중에 JPA 로 바꿔도 위 계층은 그대로다.
 */
@Repository
public class SnackRepository {

    private static final Map<String, Snack> 기분별 = Map.of(
            "피곤", new Snack("초코바", "당 충전"),
            "더움", new Snack("아이스크림", "체온 낮추기"),
            "배고픔", new Snack("샌드위치", "요기 되는 걸로"),
            "심심", new Snack("젤리", "오래 씹기"));

    public Optional<Snack> findByMood(String mood) {
        return Optional.ofNullable(기분별.get(mood));
    }
}
```

`SnackService`의 주석에는 이 실습의 의도가 한 줄로 적혀 있다. "AI는 한 줄도 없다. 계층을 먼저 몸에 익히는 것이 이 실습의 전부다. 뒤 장에서 AI 호출이 들어올 자리도 정확히 이 자리다."

즉 이 실습은 빈칸 채우기다. `repo.findByMood(mood)` 자리에 나중에 `chatClient.prompt()...call()`이 들어온다. 계층을 먼저 세워 두면 AI가 들어올 자리가 이미 정해져 있다는 것이 1장의 논지다.

## AI는 어느 계층에 두나

교재는 가장 흔한 실수를 명시적으로 지적한다. **`ChatClient`를 컨트롤러에서 직접 부르는 것**이다.

```text
잘못된 예   @RestController → ChatClient 직접 호출 → 프롬프트·도구·예외가 한 파일에

권장       @RestController → @Service(업무 흐름) → ChatClient → Advisor 체인
근거·행동   @Repository → VectorStore → @Tool 클래스 → 외부 API
```

AI가 얹히는 축은 네 개로 나뉜다. 각 축을 나누는 기준은 "무엇을 하는가"가 아니라 **"어떤 이유로 바뀌는가"**다.

| 패키지 | 책임 | 바뀌는 이유 |
|---|---|---|
| `config` | `ChatClient`·Advisor 조립, 기본 옵션 | 모델·공급자 교체 |
| `service` | 업무 흐름, 프롬프트 조립 | 업무 규칙 변경 |
| `rag` | 인제스트, 검색, 근거 구성 | 문서와 검색 품질 |
| `tools` | 모델이 부를 수 있는 행동 | 연동 시스템 추가 |
| `advisor` | 로깅·안전·메모리 같은 공통 관심사 | 정책·감사 요구 |
| `web` | REST·SSE. AI를 모른다 | 화면 요구 |

이 표가 왜 유용한지는 3일차에 가서야 체감했다. 프롬프트를 고치는 작업과 도구를 추가하는 작업과 감사 정책을 바꾸는 작업은 서로 다른 사람이, 다른 주기로 한다. 같은 파일에 있으면 셋이 계속 충돌한다.

## AI 요청 한 번이 지나는 길

1장 마지막에 나오는 그림은 3일 과정 전체의 축소판이다. `POST /api/chat` 요청 하나가 지나는 경로를 순서대로 늘어놓은 것인데, 각 단계가 며칠 뒤에 배울 내용의 목차이기도 하다.

```text
POST /api/chat   {"question":"주문 12345 반품 되나요?"}

① web/ChatController      인증 확인 → 질문·세션 ID 만 서비스로 넘긴다
② advisor/AuditAdvisor    감사 기록 시작            (order 0 — 가장 바깥)
③ advisor/SafetyAdvisor   입력 차단 — 민감어·인젝션 (저장보다 반드시 먼저)
④ advisor/MemoryAdvisor   같은 세션의 앞 대화를 붙인다
⑤ rag/RetrievalService    질문으로 문서 검색 → 근거를 프롬프트에
⑥ chat/HelpDeskService    프롬프트 조립 → 모델 호출
⑦ tools/OrderTools        모델이 필요하다고 판단하면 호출
     repository/OrderRepo    ↳ 권한 검증과 실제 데이터는 결국 아래 계층에서
⑧ advisor/TokenMeter      토큰·지연 기록 → 지표
⑨ chat/AnswerDto          답변 + 출처 + 도구 사용 여부로 조립해 반환
```

여기서 이미 드러나는 규칙이 하나 있다. **③ 차단이 ④ 저장보다 앞에 있다.** 순서를 바꾸면 걸러야 할 문장이 대화 이력에 먼저 저장되고, 다음 턴에 그대로 다시 들어온다. 이 순서 문제는 3일차 Advisor 장에서 직접 실험으로 확인하게 된다.

실패도 계층마다 다른 얼굴로 나타난다는 지적도 함께 나온다. 401은 인증(①), 차단은 ③, 근거 없음은 ⑤, 도구 권한은 ⑦, 타임아웃은 ⑥이다. 어디서 실패했는지 알면 어디를 고칠지도 안다는 것이 1장 전체의 논지다.

## 정리

1장에서 얻은 것은 Spring AI 지식이 아니라 **판단 기준**이었다.

- 계층은 변경의 파급을 가두기 위해 나눈다. 위에서 아래로만 부른다.
- 권한 조건은 조회 후 필터링이 아니라 쿼리 안에 넣는다.
- 엔티티는 밖으로 나가지 않는다. 변환은 한 곳에 모은다.
- AI는 새 계층이 아니라 기존 계층에 얹히는 관심사다. `config`·`service`·`rag`·`tools`·`advisor`로 나눈다.
- 컨트롤러는 AI를 모른다. 이것이 1일차 실습의 합격 기준이다.

다음 글에서는 그 위에 얹히는 Spring AI가 실제로 무엇을 추상화했는지, 그리고 "공급자 교체는 설정 한 줄"이라는 주장이 코드에서 어떻게 확인되는지를 본다.

---

이전 글: [3일 학습 로드맵](/posts/skala-springai-roadmap/) · 다음 글: [1일차 ② — 3대 추상화와 공급자 독립성](/posts/skala-springai-day1-architecture/)
