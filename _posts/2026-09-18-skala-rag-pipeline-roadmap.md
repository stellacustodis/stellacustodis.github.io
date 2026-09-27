---
title: "[SKALA] RAG Pipeline 설계 및 구축 — 3일 학습 로드맵"
date: 2026-09-18 08:00:00 +0900
permalink: /posts/skala-rag-pipeline-roadmap/
categories:
  - SKALA
  - GenAI
tags: [skala, rag, retrieval, reranking, evaluation]
description: "RAG 오류를 문서 부재, 검색 실패, 근거 사용 실패로 나눠 파싱·검색·평가를 정리한다."
related: [skala-rag-pipeline-day1, skala-rag-pipeline-day2, skala-rag-pipeline-day3]
---

## 과정 흐름

RAG의 답이 틀렸을 때 문서가 없었는지, 검색이 실패했는지, 모델이 근거를 잘못 읽었는지 먼저 가려야 한다. 교안과 논문 리뷰 Agent 프로젝트를 파싱, 검색, 평가의 순서로 정리했다.

| 날짜 | 주제 | 글 |
|---|---|---|
| 1일차 · 2026-09-18 | RAG가 해결할 문제와 경계 | [본문 보기](/posts/skala-rag-pipeline-day1/) |
| 2일차 · 2026-09-21 | 파싱·청킹·하이브리드 검색 | [본문 보기](/posts/skala-rag-pipeline-day2/) |
| 3일차 · 2026-09-22 | RAG 평가와 확장 전략 | [본문 보기](/posts/skala-rag-pipeline-day3/) |

```text
RAG가 해결할 문제와 경계 → 파싱·청킹·하이브리드 검색 → RAG 평가와 확장 전략
```

## 프로젝트 산출물 화면

논문 리뷰 Agent가 저장한 기술조사 결과 Markdown을 브라우저에 표시했다. 아래 화면은 2026-09-22 실행 기록과 그 실행에서 생성된 근거·비교 자료다.

![기술조사 Agent 실행 요약과 품질 지표](/assets/img/posts/skala-rag-pipeline-roadmap/run-summary.png){: w="850" }
_그림 1. 실행 요약에는 상태, 사용 모델, 토큰 수와 근거 품질 지표가 따로 기록돼 있다._

![논문별 근거 수와 원문 위치가 적힌 근거 레지스트리](/assets/img/posts/skala-rag-pipeline-roadmap/evidence-registry.png){: w="850" }
_그림 2. 근거 레지스트리의 첫 항목. 논문 페이지·절·텍스트 범위·좌표로 원문 위치를 추적한다._

![두 논문의 기술 관계와 검증 범위를 적은 교차 비교 결과](/assets/img/posts/skala-rag-pipeline-roadmap/technical-comparison.png){: w="850" }
_그림 3. 교차 비교는 두 기술을 보완 관계로 분류하지만, 결합 검증은 `false`로 남긴다._

## 사용한 자료

RAG 교안과 논문 리뷰 Agent의 README·코드 구조를 참고했다. 검색기의 구성이 존재한다는 사실과 평가에서 검증한 성능을 구분한다.

다음 글: [1일차 — RAG가 해결할 문제와 경계](/posts/skala-rag-pipeline-day1/)
