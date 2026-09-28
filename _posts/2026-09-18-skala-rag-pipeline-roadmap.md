---
title: "[SKALA] RAG Pipeline 설계 및 구축 — 3일 학습 로드맵"
date: 2026-09-18 08:00:00 +0900
permalink: /posts/skala-rag-pipeline-roadmap/
categories:
  - SKALA
  - GenAI
tags: [skala, rag, agentic-rag, langgraph, evaluation]
description: "RAG의 전처리·검색·평가부터 Agentic RAG와 KV cache 다중 관점 평가 프로젝트까지 3일간 정리한다."
related: [skala-rag-pipeline-day1, skala-rag-pipeline-day2, skala-rag-pipeline-day3]
---

## 이번 과정에서 정리한 범위

RAG를 벡터 DB에 문서를 넣고 질문하는 기능으로만 이해하면, 답이 틀렸을 때 어디를 고쳐야 할지 알기 어렵다. 이번 과정에서는 문서 적재부터 검색과 재순위화, 답변 생성, 평가, Agentic RAG까지 한 흐름으로 공부했다. 마지막에는 이 구성이 팀 프로젝트인 **KV Cache Multi-Perspective Evaluator**에서 어떻게 구현됐는지 살펴봤다.

| 날짜 | 공부한 내용 | 글 |
|---|---|---|
| 1일차 · 2026-09-18 | RAG의 필요성, 발전 과정, 문서 전처리·임베딩·색인 | [본문 보기](/posts/skala-rag-pipeline-day1/) |
| 2일차 · 2026-09-21 | 검색·재순위화·생성 체인과 RAG 평가 | [본문 보기](/posts/skala-rag-pipeline-day2/) |
| 3일차 · 2026-09-22 | Advanced·Self·Modular·Agentic RAG, LangGraph, 팀 프로젝트 구현 | [본문 보기](/posts/skala-rag-pipeline-day3/) |

```text
문서 수집·전처리
  → 임베딩·색인
  → 검색·재순위화
  → 프롬프트·생성
  → 검색/답변 평가
  → 필요할 때 에이전트와 도구를 추가
```

## 공부하면서 세운 기준

RAG의 오류는 한 종류가 아니다. 필요한 문서가 없을 수도 있고, 문서는 있어도 검색 결과에 들지 않을 수 있다. 근거를 찾은 뒤 생성 모델이 조건을 빠뜨리거나 과장할 수도 있다. 그래서 검색 품질과 답변 품질을 나눠 측정하고, 각 주장에 원문 위치를 연결하는 방식으로 정리했다.

팀 프로젝트도 이 기준에서 읽었다. 이 프로젝트는 논문 리뷰 도구 하나가 아니라, KV cache 최적화 기술 두 가지를 기술·도메인·이해관계자·시장 관점에서 평가하고 보고서로 만드는 Multi-Agent 기반 Agentic RAG다. 내가 맡은 기술 조사 에이전트는 PDF에서 주장과 실험 조건을 찾고, 후속 에이전트가 다시 확인할 수 있도록 근거 ID와 위치 정보를 넘긴다.

프로젝트 저장소: [KV-Cache-Multi-Perspective-Evaluator](https://github.com/SKALA-4-7-2-3/KV-Cache-Multi-Perspective-Evaluator)

다음 글: [1일차 — RAG의 구조와 문서 전처리](/posts/skala-rag-pipeline-day1/)
