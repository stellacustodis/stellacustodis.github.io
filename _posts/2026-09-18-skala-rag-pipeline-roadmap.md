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

RAG의 답이 틀렸을 때 문서가 없었는지, 검색이 실패했는지, 모델이 근거를 잘못 읽었는지 먼저 가려야 한다. 이 구분을 바탕으로 파싱, 검색, 평가를 순서대로 정리했다.

| 날짜 | 주제 | 글 |
|---|---|---|
| 1일차 · 2026-09-18 | RAG가 해결할 문제와 경계 | [본문 보기](/posts/skala-rag-pipeline-day1/) |
| 2일차 · 2026-09-21 | 파싱·청킹·하이브리드 검색 | [본문 보기](/posts/skala-rag-pipeline-day2/) |
| 3일차 · 2026-09-22 | RAG 평가와 확장 전략 | [본문 보기](/posts/skala-rag-pipeline-day3/) |

```text
RAG가 해결할 문제와 경계 → 파싱·청킹·하이브리드 검색 → RAG 평가와 확장 전략
```

## 설계와 평가를 나눠 보기

논문 리뷰 Agent 프로젝트의 파싱·검색 구조는 RAG의 각 단계를 구체적으로 보여준다. 검색기를 연결한 뒤에는 정답 근거가 상위 결과에 들어오는지, 답변이 그 근거를 제대로 쓰는지 따로 평가해야 한다. 구성 요소가 있다는 사실만으로 정확도를 말할 수는 없다.

다음 글: [1일차 — RAG가 해결할 문제와 경계](/posts/skala-rag-pipeline-day1/)
