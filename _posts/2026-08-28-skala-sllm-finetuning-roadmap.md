---
title: "[SKALA] sLLM 구현과 Fine-Tuning — 2일 학습 로드맵"
date: 2026-08-28 08:00:00 +0900
permalink: /posts/skala-sllm-finetuning-roadmap/
categories:
  - SKALA
  - GenAI
tags: [skala, sllm, lora, qlora, sft, evaluation]
description: "Qwen 기반 LoRA 학습과 Base·SFT 비교 실험을 데이터, 학습 설정, 오류 분석의 순서로 묶었다."
related: [skala-sllm-finetuning-day1, skala-sllm-finetuning-day2]
---

## 과정 흐름

작은 언어 모델을 사내 업무에 맞추려면 무엇을 학습시킬지, 무엇을 검색으로 남길지 나눠야 한다. LoRA 학습에 쓴 데이터 구성부터 Base·SFT 비교, 실패 사례 분석까지 순서대로 정리했다.

| 날짜 | 주제 | 글 |
|---|---|---|
| 1일차 · 2026-08-28 | SFT 데이터와 LoRA 학습 구조 | [본문 보기](/posts/skala-sllm-finetuning-day1/) |
| 2일차 · 2026-08-31 | Base·SFT 비교와 실패 사례 읽기 | [본문 보기](/posts/skala-sllm-finetuning-day2/) |

```text
SFT 데이터와 LoRA 학습 구조 → Base·SFT 비교와 실패 사례 읽기
```

## 읽을 때 구분할 것

학습 설정은 실험 조건이고, Base·SFT 점수는 20개 평가 질문에서 관찰한 결과다. 서비스에 적용하는 방법은 다음 단계의 설계이므로 측정된 성능과 구분한다.

다음 글: [1일차 — SFT 데이터와 LoRA 학습 구조](/posts/skala-sllm-finetuning-day1/)
