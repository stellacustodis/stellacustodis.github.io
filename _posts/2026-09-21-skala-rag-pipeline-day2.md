---
title: "[SKALA] RAG Pipeline 설계 및 구축 2일차 — 검색·생성·평가 파이프라인"
date: 2026-09-21 12:00:00 +0900
permalink: /posts/skala-rag-pipeline-day2/
categories:
  - SKALA
  - GenAI
tags: [skala, rag, hybrid-search, reranking, rag-evaluation]
description: "sparse·dense 검색과 재순위화, 프롬프트 체인, 검색 및 답변 평가 지표를 한 흐름으로 정리한다."
related: [skala-rag-pipeline-roadmap, skala-rag-pipeline-day1, skala-rag-pipeline-day3]
---

## Retriever가 답의 재료를 고른다

전처리와 색인이 끝나면 질문에 맞는 청크를 찾는다. 검색기는 생성 모델이 읽을 수 있는 후보를 정하므로, 여기서 빠진 근거는 뒤 단계가 복구하기 어렵다. 검색 결과가 그럴듯해 보이는지만 확인하지 않고, 관련 문서가 실제로 상위 결과에 포함됐는지 측정해야 한다.

검색 방식은 크게 sparse와 dense로 나눌 수 있다.

- **Sparse 검색**은 단어가 얼마나 중요하게 등장했는지를 이용한다. BM25처럼 정확한 제품명, 약어, 수식 기호를 찾는 데 유리하다.
- **Dense 검색**은 문장을 임베딩한 뒤 벡터 거리를 비교한다. 같은 뜻을 다른 표현으로 쓴 문서를 찾는 데 유리하다.

한쪽만 쓰면 약점도 선명하다. sparse 검색은 표현이 달라지면 놓치기 쉽고, dense 검색은 정확한 식별자나 작은 수치 차이를 흐릴 수 있다. Hybrid Retriever는 두 검색 결과를 결합해 후보를 넓힌다.

## 점수를 합칠 때 단위를 섞지 않는다

BM25 점수와 cosine similarity는 계산 방식과 범위가 다르다. 숫자를 그대로 더하면 한쪽 점수 체계가 결과를 지배할 수 있다. Reciprocal Rank Fusion(RRF)은 점수 대신 각 검색 결과의 순위를 이용해 결합한다.

$$
\operatorname{RRF}(d)=\sum_{r\in R}\frac{1}{k+\operatorname{rank}_r(d)}
$$

여러 검색기가 공통으로 높게 둔 문서는 점수가 커진다. 다만 RRF도 검색기에 없던 문서를 새로 찾지는 못한다. 최초 후보 수와 필터 조건이 잘못되면 결합 뒤에도 핵심 근거가 빠진다.

후보를 모은 뒤에는 reranker로 질문과 문서의 관계를 더 자세히 계산한다. 마지막에는 MMR(Maximal Marginal Relevance)로 관련성과 다양성을 함께 고려해, 비슷한 청크가 결과를 독차지하는 일을 줄일 수 있다.

## 검색 결과에서 답변까지

검색한 청크는 프롬프트에 그대로 이어 붙이는 대신 출처, 페이지, 질문과 관련된 부분을 함께 구성해야 한다. Chain은 입력 변환, 검색, 프롬프트 작성, 모델 호출, 출력 정리를 연결한다. 이때 근거가 부족하면 답을 유보하도록 만들고, 답변에 사용한 출처를 남겨야 한다.

요약이 길어질 때는 같은 말을 반복하지 않고 정보 밀도를 높이는 Chain of Density 방식도 활용할 수 있다. 그러나 압축 과정에서 실험 조건이나 예외가 사라지지 않는지 확인해야 한다. 짧은 답이 항상 좋은 답은 아니다.

## 검색 평가와 생성 평가를 나눈다

검색 품질은 정답 근거의 순위로 평가할 수 있다.

| 지표 | 확인하는 것 |
|---|---|
| Hit Rate@K | 상위 K개 안에 관련 근거가 하나라도 들어왔는가 |
| MRR | 첫 관련 근거가 얼마나 앞에 나타났는가 |
| Context Precision | 가져온 문맥 가운데 관련 내용의 비율은 어떤가 |
| Context Recall | 답에 필요한 근거를 얼마나 빠짐없이 가져왔는가 |

생성 결과에서는 답변이 질문에 맞는지, 검색한 문맥을 충실히 따르는지, 근거 없이 내용을 보태지 않았는지 본다. ROUGE, BLEU, METEOR 같은 문자열 기반 지표는 표현이 다른 정답을 낮게 볼 수 있다. 의미 유사도나 LLM-as-a-Judge를 함께 쓸 수 있지만, 평가 프롬프트와 기준을 고정하고 사람이 일부 사례를 원문과 대조해야 한다.

RAGAS는 질문·정답·검색 문맥을 바탕으로 context precision, context recall, faithfulness 같은 항목을 평가한다. 테스트 질문이 실제 사용 범위를 대표하지 못하면 점수가 높아도 운영 품질을 말하기 어렵다. 합성 질문을 만들 때도 원문에 답이 있는 질문, 여러 근거를 연결해야 하는 질문, 답을 유보해야 하는 질문을 섞어야 한다.

## 팀 프로젝트의 검색기는 강의 예제와 다르다

강의에서는 Hybrid Retriever의 대표 조합으로 BM25와 dense 검색을 다뤘다. 팀 프로젝트의 기술 조사 에이전트는 이 구성을 그대로 쓰지 않았다. BGE-M3가 한 번에 만든 세 표현을 각자 맞는 저장 방식으로 관리한다.

1. 1024차원 dense vector는 Chroma의 cosine 검색에 쓴다.
2. learned sparse token weight는 SQLite posting에 저장한다.
3. 토큰별 ColBERT vector는 float16 파일로 보관하고 후보 재순위화에 쓴다.
4. dense와 sparse 결과를 RRF로 합쳐 후보를 만든다.
5. 후보 안에서 ColBERT MaxSim으로 순서를 다시 정한다.
6. 여러 질의의 결과를 합친 뒤 MMR로 중복을 줄인다.

즉, 기존 글에 적었던 **Chroma + BM25** 설명은 실제 프로젝트 코드와 달랐다. Chroma는 dense 저장소이고 sparse 검색은 BGE-M3의 learned sparse 표현을 사용한다. 프로젝트 README에도 Hit Rate@K와 MRR의 측정 결과는 아직 기록되지 않았다고 명시돼 있다. 검색 구성이 정교하다는 사실과 검색 성능이 검증됐다는 말은 구분해야 한다.

## 평가 결과를 다음 개선에 연결하기

Hit Rate가 낮다면 쿼리, 청킹, 필터, 최초 후보 수를 먼저 본다. 검색은 성공했지만 답변의 faithfulness가 낮다면 프롬프트와 근거 선택, 답변 감사 단계를 살핀다. 표 수치가 자주 틀리면 표 셀의 행·열 문맥과 locator가 유지되는지 확인한다.

한 번의 총점보다 실패 사례를 어느 단계에서 만들었는지 기록하는 편이 다음 개선에 도움이 된다.

---

이전 글: [1일차 — RAG의 구조와 문서 전처리](/posts/skala-rag-pipeline-day1/)

시리즈 안내: [RAG Pipeline 설계 및 구축 — 3일 학습 로드맵](/posts/skala-rag-pipeline-roadmap/)

다음 글: [3일차 — Agentic RAG와 KV Cache 다중 관점 평가 프로젝트](/posts/skala-rag-pipeline-day3/)
