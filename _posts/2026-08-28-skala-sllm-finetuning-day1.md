---
title: "[SKALA] sLLM 구현과 Fine-Tuning 1일차 — SFT 데이터와 LoRA 학습 구조"
date: 2026-08-28 12:00:00 +0900
permalink: /posts/skala-sllm-finetuning-day1/
categories:
  - SKALA
  - GenAI
tags: [skala, sllm, lora, qlora, sft, evaluation]
description: "SFT 데이터 구성과 LoRA·QLoRA의 역할, 어댑터 버전과 평가 문항을 기록하는 방법."
related: [skala-sllm-finetuning-roadmap, skala-sllm-finetuning-day2]
---

## 작은 모델을 업무에 맞춘다는 뜻

수업은 Qwen2.5-1.5B-Instruct를 예제로 사용해 사내 FAQ·규정 질문에 맞는 응답 형식을 학습한다. 지도 미세조정(SFT)은 질문과 모범 답변의 관계를 학습시키는 방식이다. 조직 문서가 자주 바뀌거나 원문 인용이 필수라면 가중치에 사실을 기억시키는 것만으로는 부족하고, 검색과 문서 버전 관리가 필요하다.

## 데이터와 파라미터를 분리해 본다

실습 가이드는 instruction–response SFT와 context-based QA SFT를 구분한다. 전자는 요청에 대한 응답 스타일을, 후자는 주어진 문맥을 이용해 답하도록 하는 예시를 만든다. 학습·검증·최종 평가는 같은 문항을 돌려 쓰지 않아야 일반화 여부를 판단할 수 있다.

LoRA는 기존 가중치를 고정하고 일부 선형 변환에 작은 저랭크 행렬을 추가한다. 학습 가능한 파라미터를 줄이는 장점이 있지만, 품질 개선을 자동으로 보장하지는 않는다. QLoRA는 양자화된 기반 모델과 LoRA 어댑터를 결합해 메모리 부담을 줄이는 학습 구성이다. 양자화와 어댑터의 역할은 서로 다르다.

```text
모범 답변 데이터 → train/validation 분리 → Base + LoRA 학습
                                           ↓
                            동일 질문으로 Base/Adapter 비교
```

실행 전에는 데이터 필드, 학습 대상 모듈, 체크포인트 위치와 평가 문항을 기록한다. 손실이 내려가도 실제 답변의 사실성과 유보 행동을 별도로 확인해야 한다.

## LoRA에서 기록할 설정

LoRA의 rank는 추가 행렬의 크기를 정하고, 적용 모듈은 어느 변환을 조정할지 결정한다. 학습률, 배치 크기, 최대 길이와 함께 이 설정을 남겨야 같은 데이터로 다시 실험할 수 있다. 어댑터를 저장할 때 기반 모델의 정확한 버전도 기록한다. 어댑터 파일만 남기면 나중에 다른 기반 가중치에 결합해 결과가 달라질 수 있다.

학습 데이터에는 정답 형식뿐 아니라 답을 모를 때의 응답도 포함해야 한다. 다만 ‘모른다’는 문장만 많이 학습시키면 유효한 질문에도 답을 회피할 수 있다. 알려진 규정과 미등록 규정을 따로 평가한 이유가 여기에 있다.

---

시리즈 안내: [sLLM 구현과 Fine-Tuning — 2일 학습 로드맵](/posts/skala-sllm-finetuning-roadmap/)

다음 글: [2일차 — Base·SFT 비교와 실패 사례 읽기](/posts/skala-sllm-finetuning-day2/)
