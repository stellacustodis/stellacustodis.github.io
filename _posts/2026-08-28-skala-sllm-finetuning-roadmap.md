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

작은 언어 모델을 사내 업무에 맞추려면 무엇을 학습시킬지, 무엇을 검색으로 남길지 나눠야 한다. 수업의 LoRA 실습과 개인 평가 보고서를 따라 데이터 구성, 학습, 오류 분석을 묶었다.

| 날짜 | 주제 | 글 |
|---|---|---|
| 1일차 · 2026-08-28 | SFT 데이터와 LoRA 학습 구조 | [본문 보기](/posts/skala-sllm-finetuning-day1/) |
| 2일차 · 2026-08-31 | Base·SFT 비교와 실패 사례 읽기 | [본문 보기](/posts/skala-sllm-finetuning-day2/) |

```text
SFT 데이터와 LoRA 학습 구조 → Base·SFT 비교와 실패 사례 읽기
```

## 사용한 자료

sLLM 교재·실습 가이드와 개인 평가 보고서를 함께 읽었다. 학습 설정과 실제 측정 결과, 서비스 제안은 서로 다른 수준의 근거로 다룬다.

다음 글: [1일차 — SFT 데이터와 LoRA 학습 구조](/posts/skala-sllm-finetuning-day1/)
