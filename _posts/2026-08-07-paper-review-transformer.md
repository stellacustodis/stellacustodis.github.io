---
title: "[논문 리뷰] Transformer와 사전학습 시대 — Attention Is All You Need에서 GPT-3까지 6편"
date: 2026-08-07 10:00:00 +0900
layout: post
permalink: /posts/paper-review-transformer/
categories:
  - AI
  - Paper Review
tags: [paper-review, transformer, self-attention, bert, gpt, elmo, pretraining]
math: true
related: [paper-review-nlp-foundations, paper-review-transformer-variants, skala-transformer-day1]
---

[앞 글](/posts/paper-review-nlp-foundations/)에서 정리한 계보가 도달한 지점이 Transformer다. 이 글은 **2017년부터 2020년까지, 아키텍처 하나가 NLP 전체를 재편한 4년의 6편**을 다룬다.

이 시기의 논문들은 개별 기법보다 **패러다임의 전환**을 담고 있어서, 각 논문이 "무엇을 처음 보였는가"에 초점을 맞춰 정리했다.

```text
2017  Transformer      recurrence를 제거해도 된다
2018  ELMo             단어 벡터가 문맥에 따라 달라져야 한다
2018  GPT-1            사전학습 + 파인튜닝이 표준이 된다
2019  BERT             양방향 사전학습이 이해 태스크를 지배한다
2019  GPT-2            파인튜닝 없이도 태스크가 된다
2020  GPT-3            가중치를 안 고쳐도 태스크가 된다
```

## 1. Attention Is All You Need

**Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser, Polosukhin (Google Brain / Google Research / U. Toronto) · NeurIPS, 2017**

> Attention을 발명한 논문이 아니라, **attention만으로 충분하다**는 것을 보인 논문.

**배경** — 2017년 시점의 seq2seq는 RNN 또는 CNN 위에 attention을 얹은 형태였다. 둘 다 한계가 뚜렷했다.

| 접근 | 한계 |
|---|---|
| RNN 기반 | $h_t$가 $h_{t-1}$에 의존 → **병렬화 불가** |
| CNN 기반 (ConvS2S, ByteNet) | 병렬화는 되지만 멀리 떨어진 토큰을 잇는 데 **깊은 층이 필요** |

**핵심 아이디어** — recurrence와 convolution을 **전부 제거**하고 self-attention만 남긴다.

$$
\text{Attention}(Q,K,V) = \text{Softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}}\right)V
$$

이 논문의 논증은 성능 표가 아니라 Table 1이다.

| 층 유형 | 층당 복잡도 | 순차 연산 | 최대 경로 길이 |
|---|---|---|---|
| **Self-Attention** | $O(n^2\cdot d)$ | $O(1)$ | $\mathbf{O(1)}$ |
| Recurrent | $O(n\cdot d^2)$ | $O(n)$ | $O(n)$ |
| Convolutional | $O(k\cdot n\cdot d^2)$ | $O(1)$ | $O(\log_k n)$ |

**최대 경로 길이 $O(1)$** — 임의의 두 토큰이 한 번의 연산으로 직접 연결된다. 1994년 논문이 규명한 기울기 소실이 **완화가 아니라 구조적으로 제거**되는 지점이다.

$\sqrt{d_k}$로 나누는 이유도 간단하다. 성분이 독립이고 분산 1이면 내적의 분산이 $d_k$가 되므로, 표준편차 $\sqrt{d_k}$로 나눠 정규화하지 않으면 softmax가 포화되어 기울기가 죽는다.

**결과** — WMT'14 영어-독일어 BLEU 28.4, 영어-프랑스어 41.8로 SOTA. 그런데 더 중요한 건 학습 비용이다.

| 모델 | EN-DE BLEU | 학습 FLOPs |
|---|---|---|
| GNMT + RL | 24.6 | $1.4\times10^{20}$ |
| ConvS2S (앙상블) | 26.36 | $1.2\times10^{21}$ |
| **Transformer (base)** | 27.3 | $\mathbf{3.3\times10^{18}}$ |
| Transformer (big) | **28.4** | $2.3\times10^{19}$ |

base 모델이 **두 자릿수 적은 연산량**으로 기존 SOTA를 넘겼다. 성능 향상보다 이 효율 격차가 "더 키울 수 있다"는 신호가 되어 이후 LLM 시대를 열었다.

**의의** — 8년이 지난 지금도 프론티어 LLM의 기본 블록이 이 논문의 구조다. 정규화 위치(Post-LN → Pre-LN)와 위치 인코딩(사인파 → RoPE) 정도가 바뀌었을 뿐이고, 그 변경들은 [다음 글](/posts/paper-review-transformer-variants/)에서 다룬다.

## 2. Deep Contextualized Word Representations (ELMo)

**Peters, Neumann, Iyyer, Gardner, Clark, Lee, Zettlemoyer (AI2 / U. Washington) · NAACL, 2018 (Best Paper)**

> 단어 벡터가 **문장마다 달라져야 한다**는 것을 처음으로 널리 설득한 논문.

**배경** — Word2Vec·GloVe는 한 단어에 하나의 고정 벡터를 준다. `bank`가 강둑이든 은행이든 같은 벡터다. 다의어·동음이의어를 구분할 방법이 원리적으로 없었다.

**핵심 아이디어** — 양방향 LSTM 언어모델(biLM)을 대규모 코퍼스에 사전학습하고, **그 내부 층들의 가중합**을 단어 표현으로 쓴다.

$$
\text{ELMo}_k^{task} = \gamma^{task}\sum_{j=0}^{L} s_j^{task}\,h_{k,j}^{LM}
$$

$s_j$는 태스크마다 학습되는 층별 가중치다. 논문의 관찰이 흥미로운데, **하위 층은 구문 정보를, 상위 층은 의미 정보를 담는 경향**이 있어서 태스크에 따라 유용한 층이 다르다. 그래서 최상위 층만 쓰지 않고 전 층을 섞는다.

**짚어둘 점** — **ELMo는 LSTM 기반이다.** 문맥 임베딩이라는 아이디어와 Transformer라는 아키텍처는 별개의 기여인데, 강의 자료 등에서 자주 뭉뚱그려진다. ELMo가 개념을 먼저 보였고, BERT가 여기에 Transformer와 더 나은 사전학습 목적함수를 결합했다.

**의의** — 기존 모델의 입력 임베딩을 ELMo로 갈아끼우는 것만으로 6개 NLP 태스크에서 성능이 올랐다. "사전학습된 표현을 가져다 쓴다"는 전이학습 관행이 NLP에 자리 잡는 계기가 됐다.

## 3. Improving Language Understanding by Generative Pre-Training (GPT-1)

**Radford, Narasimhan, Salimans, Sutskever (OpenAI) · 2018**

> 사전학습 + 파인튜닝을 **모델 전체**로 확장한 논문.

**배경** — ELMo는 입력 임베딩만 전이했고, 태스크마다 별도의 아키텍처를 설계해야 했다. 레이블 있는 데이터는 늘 부족했다.

**핵심 아이디어** — 두 단계로 나눈다.

```text
① 비지도 사전학습   Transformer decoder 12층으로 다음 토큰 예측 (BooksCorpus)
② 지도 파인튜닝     태스크별 입력을 하나의 시퀀스로 변환 후 전체 모델 미세조정
```

두 번째 단계의 **입력 변환(task-specific input transformations)** 이 이 논문의 실용적 기여다. 문장 함의·유사도·객관식 같은 구조화된 입력을 구분자 토큰으로 이어붙여 하나의 시퀀스로 만든다. **아키텍처를 바꾸지 않고 입력 형식만 바꿔** 다양한 태스크를 처리한다.

**결과** — 12개 태스크 중 9개에서 SOTA. 파라미터는 117M.

**짚어둘 점** — 논문 제목이 자주 잘못 인용된다. "Improving Language Understanding **with Unsupervised Learning**"은 OpenAI **블로그 포스트** 제목이고, 논문은 "**by Generative Pre-Training**"이다. 약어 GPT가 여기서 나온다.

**의의** — decoder-only 구조를 택한 것이 결과적으로 옳았다. 당시엔 BERT에 밀렸지만, 생성과 in-context learning으로 확장 가능한 쪽은 이쪽이었다.

## 4. BERT: Pre-training of Deep Bidirectional Transformers

**Devlin, Chang, Lee, Toutanova (Google) · NAACL, 2019 (Best Paper)**

> 양방향 사전학습이 이해 태스크를 지배한다는 것을 보인 논문.

**배경** — GPT-1은 단방향이다. 다음 토큰을 예측해야 하므로 오른쪽 문맥을 볼 수 없다. 그런데 문장 이해 태스크에서는 양쪽 문맥이 모두 필요하다. ELMo는 정방향·역방향 LSTM을 **따로 학습해 이어 붙였을 뿐** 진정한 양방향이 아니었다.

**핵심 아이디어** — 목적함수를 바꿔 양방향을 가능하게 한다.

**① Masked Language Modeling (MLM)** — 입력 토큰의 15%를 가리고 그것을 맞춘다. 다음 토큰이 아니라 가려진 토큰을 맞추므로 양쪽 문맥을 다 볼 수 있다.

```text
선택된 15% 중
  80%  [MASK]로 치환
  10%  임의 토큰으로 치환
  10%  그대로 둠        ← 파인튜닝 시 [MASK]가 없는 불일치를 완화
```

**② Next Sentence Prediction (NSP)** — 두 문장이 실제로 이어지는지를 판별. 문장 간 관계를 요구하는 태스크(QA, 자연어 추론)를 위한 것.

**결과** — GLUE 80.5%로 기존 대비 7.7%p 개선. SQuAD·SWAG 포함 11개 태스크 SOTA. BERT-base 110M, BERT-large 340M.

**짚어둘 점** — NSP는 이후 **효과가 의심받았다.** RoBERTa(2019)가 NSP를 제거하고 더 오래·더 많은 데이터로 학습하니 성능이 오히려 올랐다. 사전학습 목적함수 설계에서 "그럴듯한 보조 과제"가 반드시 도움이 되지는 않는다는 사례다.

**의의** — 2019~2021년 NLP 실무의 기본값이 됐다. 다만 **생성이 안 된다**는 구조적 한계 때문에 LLM 시대의 주류 자리는 GPT 계열에 넘겨준다.

## 5. Language Models are Unsupervised Multitask Learners (GPT-2)

**Radford, Wu, Child, Luan, Amodei, Sutskever (OpenAI) · 2019**

> 파인튜닝 없이, **프롬프트만으로** 태스크가 된다는 것을 처음 보인 논문.

**배경** — GPT-1과 BERT 모두 태스크마다 파인튜닝이 필요했다. 그런데 언어모델이 충분히 좋다면, 태스크 자체를 자연어로 기술해 조건부 생성으로 풀 수 있지 않을까?

**핵심 아이디어** — 태스크를 $P(\text{output}\mid\text{input})$이 아니라 $P(\text{output}\mid\text{input}, \text{task})$로 본다. 그런데 **자연어에서는 태스크 기술도 그냥 텍스트다.**

```text
번역:  "translate to french, english text, french text"
요약:  본문 뒤에 "TL;DR:" 을 붙인다
```

즉 웹 텍스트를 충분히 학습하면 이런 형태의 예시가 코퍼스 안에 이미 들어 있고, 모델은 태스크를 **암묵적으로** 배운다는 것이다.

데이터로는 Reddit에서 카르마 3 이상을 받은 외부 링크를 크롤링한 **WebText**(약 40GB, 800만 문서)를 새로 만들었다. 품질 필터링을 사람의 추천 신호로 대체한 발상이다.

**결과** — 1.5B 파라미터. 8개 언어모델 벤치마크 중 7개에서 **zero-shot으로** SOTA.

**의의** — "규모를 키우면 파인튜닝 없이도 된다"는 가설이 처음 데이터로 뒷받침됐다. 다만 zero-shot 성능은 파인튜닝된 전용 모델에 한참 못 미쳤고, 그 격차를 메우는 것이 다음 논문이다.

## 6. Language Models are Few-Shot Learners (GPT-3)

**Brown, Mann, Ryder 외 (OpenAI) · NeurIPS, 2020 (Best Paper)**

> **가중치를 전혀 갱신하지 않고** 프롬프트 안의 예시만으로 태스크를 수행한다.

**배경** — GPT-2의 zero-shot은 가능성은 보였지만 실용 수준이 아니었다. 규모를 100배 키우면 어떻게 되는가가 이 논문의 질문이다.

**핵심 아이디어** — **In-context learning**. 프롬프트에 예시 몇 개를 넣으면 모델이 그 패턴을 파악해 새 입력을 처리한다.

```text
zero-shot   태스크 설명만
one-shot    태스크 설명 + 예시 1개
few-shot    태스크 설명 + 예시 10~100개
            → 어느 쪽도 가중치를 갱신하지 않는다
```

이것이 왜 놀라운지는 학습과의 차이에 있다. 경사하강 없이 **순전파만으로** 새 태스크에 적응한다. 논문 Figure 1.2는 모델이 클수록 문맥 내 예시를 더 효율적으로 활용한다는 것을 보여준다.

**규모와 데이터**

| 항목 | 값 |
|---|---|
| 파라미터 | 175B (GPT-2의 약 117배) |
| 코퍼스 | 약 499B 토큰 |
| **실제 학습** | **300B 토큰** |

**코퍼스 크기와 학습 토큰이 다르다**는 점이 중요하다. Common Crawl은 0.44 epoch만 돌고 Wikipedia는 3.4 epoch을 돈다. 데이터셋 크기에 비례해 샘플링하지 않고 **품질에 따라 가중치를 다르게 준** 것이 GPT-3 데이터 전략의 핵심이다. 논문이 "which we intentionally do not make proportional to the size of the dataset"이라고 명시한다.

**한계 (논문이 밝힌 것)** — 저자들 스스로 여러 한계를 적었다. 긴 텍스트의 일관성 부족, 물리 상식 문제에서의 약점, 사전학습 목적함수 자체의 비효율(모든 토큰을 동등하게 취급), 편향, 그리고 **오염 가능성**. 마지막 항목은 훗날 벤치마크 신뢰성 논의로 확대된다.

**의의** — 이 논문 이후 경쟁의 축이 아키텍처 설계에서 **규모와 데이터**로 이동했다. 그리고 "프롬프트가 프로그램"이라는 관점이 실증된 지점이기도 하다.

## 정리

6편을 관통하는 흐름은 **"태스크별 설계를 얼마나 줄일 수 있는가"** 다.

| | 태스크마다 필요한 것 |
|---|---|
| 2017 이전 | 아키텍처 + 학습 데이터 + 학습 |
| ELMo (2018) | 아키텍처 + 학습 데이터 + 학습 (입력 임베딩만 전이) |
| GPT-1 / BERT | **파인튜닝**만 |
| GPT-2 | **프롬프트**만 |
| GPT-3 | 프롬프트 + **예시 몇 개** |

각 단계에서 사람이 하는 일이 줄고 모델이 하는 일이 늘었다. 그리고 그 대가로 **연산량과 데이터가 늘었다** — 이 교환 비율을 정량화한 것이 Scaling Law이고, [네 번째 글](/posts/paper-review-alignment-scaling/)에서 다룬다.

읽으면서 인상적이었던 건 **BERT의 NSP 사례**다. 그럴듯한 보조 과제가 실제로는 도움이 안 됐고, 그 사실이 밝혀지기까지 1년 넘게 걸렸다. 사전학습 목적함수 설계에서 직관이 얼마나 안 통하는지를 보여주는 예라서, 내 쪽(생성모델) 손실 함수 설계를 생각할 때도 기억해 둘 만하다고 느꼈다.

---

이전 글: [NLP 표현학습의 계보 12편](/posts/paper-review-nlp-foundations/)

관련 글: [SKALA LLM 1일차 — 표현학습의 계보와 Transformer 정독](/posts/skala-transformer-day1/)

다음 글: [Transformer 아키텍처 개선 9편](/posts/paper-review-transformer-variants/)
