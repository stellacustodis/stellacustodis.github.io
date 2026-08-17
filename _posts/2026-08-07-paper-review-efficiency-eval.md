---
title: "[논문 리뷰] 효율화와 평가 — Distillation, MoE, 그리고 벤치마크 10편"
date: 2026-08-07 13:00:00 +0900
layout: post
permalink: /posts/paper-review-efficiency-eval/
categories:
  - AI
  - Paper Review
tags: [paper-review, knowledge-distillation, moe, mixture-of-experts, deepseek, benchmark, helm]
math: true
related: [paper-review-alignment-scaling, paper-review-transformer-variants, skala-transformer-day2]
---

시리즈 마지막 글이다. 앞 글의 스케일링 법칙이 "크게 만들어야 한다"고 말했다면, 이 글의 논문들은 그 반대 방향을 다룬다. **큰 모델의 능력을 어떻게 감당 가능한 비용으로 가져올 것인가.**

두 갈래가 있다.

- **Distillation** — 큰 모델의 능력을 작은 모델로 옮긴다
- **MoE** — 파라미터를 늘리되 매번 일부만 쓴다

그리고 마지막으로 **평가** 두 편을 붙였다. 앞의 모든 논문이 벤치마크 점수로 자신을 증명하는데, 그 벤치마크 자체가 얼마나 믿을 만한지에 대한 논문들이다.

## 1부. Knowledge Distillation

### 1. Distilling the Knowledge in a Neural Network
**Hinton, Vinyals, Dean (Google) · NeurIPS Deep Learning Workshop, 2015**

> 정답이 아니라 **틀린 답들의 확률**에 정보가 있다.

**배경** — 큰 앙상블 모델은 성능이 좋지만 배포가 어렵다. 성능을 유지하면서 작게 만드는 문제는 Buciluă et al.(2006)이 먼저 다뤘고, 이 논문이 일반화된 형태를 제시했다.

**핵심 아이디어** — Teacher의 **soft label**로 Student를 학습시킨다.

| | Hard Label | Soft Label |
|---|---|---|
| 형태 | One-hot | Teacher의 확률 분포 |
| 예 (고양이 사진) | 고양이=1, 개=0, 여우=0 | 고양이=0.7, 개=0.2, 여우=0.1 |
| 담긴 정보 | 정답만 | **클래스 간 유사성 구조** |

"고양이=1"은 정답만 알려주지만, "고양이 0.7 / 개 0.2 / 여우 0.1"은 **개가 여우보다 고양이에 가깝다**는 Teacher의 학습된 지식까지 전달한다. Hinton은 이를 **dark knowledge**라 불렀다.

문제는 잘 학습된 모델의 출력이 거의 one-hot이라 이 정보가 드러나지 않는다는 것이다. 그래서 **온도** $T$를 도입한다.

$$
p_i = \frac{\exp(z_i/T)}{\sum_j \exp(z_j/T)}
$$

$T>1$이면 분포가 평탄해져 작은 확률값들의 상대적 크기가 살아난다.

$$
\mathcal{L} = \alpha\,\text{CE}\big(y,\sigma(z_s)\big) + (1-\alpha)\,T^2\,\text{KL}\big(\sigma(z_t/T)\,\|\,\sigma(z_s/T)\big)
$$

앞의 $T^2$는 기울기 스케일 보정 항이다. 논문은 MNIST에서 **학습 데이터에 아예 등장하지 않은 숫자 클래스**를 Student가 맞히는 실험도 보여준다 — soft label만으로 그 클래스의 존재와 특성이 전달된 것이다.

**의의** — 모델 압축의 표준 기법이 됐다. 다만 뒤에서 보듯 LLM 시대의 "distillation"은 이것과 다른 기법을 가리키는 경우가 많다.

### 2. Sequence-Level Knowledge Distillation
**Kim, Rush (Harvard) · EMNLP, 2016**

> 시퀀스 생성에서는 **로짓이 아니라 출력 문장**을 옮기는 편이 낫다.

**배경** — Hinton식 KD를 기계번역에 그대로 적용하면 시점별 토큰 분포에 대해 KL을 최소화하게 된다(word-level KD). 그런데 생성 모델이 최적화해야 하는 것은 **시퀀스 전체의 확률**이다.

**핵심 아이디어** — Teacher가 **beam search로 생성한 출력**을 정답 삼아 Student를 학습시킨다. 즉 원본 정답 대신 Teacher의 생성물로 데이터셋을 갈아끼운다.

```text
Word-level KD    시점마다 Teacher의 분포에 맞춘다        → 로짓 필요
Sequence-level   Teacher의 생성 문장을 정답으로 SFT      → 출력만 있으면 된다
```

Teacher의 출력은 원본 데이터보다 **모드가 정리되어(less multi-modal)** 있어 작은 모델이 학습하기 쉽다는 것이 저자들의 설명이다.

**결과** — Student가 파라미터를 크게 줄이고도 성능을 유지했고, 특히 **beam search 없이 greedy 디코딩만으로** 원래의 beam search 성능에 근접했다. 추론 속도가 크게 개선된다.

**의의** — 이 논문의 구도가 LLM 시대에 그대로 재현된다. DeepSeek-R1의 distilled 모델들이 정확히 이 방식이다(9번 참조).

## 2부. Mixture of Experts

### 3. Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer
**Shazeer, Mirhoseini, Maziarz 외 (Google Brain) · ICLR, 2017**

> 파라미터를 1000배 늘리면서 **연산은 거의 그대로** 두는 방법.

**배경** — 모델 용량을 늘리면 성능이 오르지만 연산도 비례해 늘어난다. 조건부 연산(conditional computation)이라는 아이디어는 오래 전부터 있었으나, 실제로 큰 이득을 낸 사례가 없었다.

**핵심 아이디어** — 수천 개의 FFN 전문가를 두고, **토큰마다 상위 $k$개만 활성화**한다.

$$
y=\sum_{i=1}^{n}G(x)_i\,E_i(x),\qquad G(x)=\text{Softmax}\big(\text{TopK}(xW_g+\text{noise})\big)
$$

이 논문이 해결한 실제 문제들이 더 흥미롭다.

1. **부하 불균형** — 그냥 학습시키면 소수 전문가에만 토큰이 몰린다. 잘 선택된 전문가가 더 잘 학습되고, 그래서 더 자주 선택되는 양의 되먹임이다(expert collapse). 이를 막기 위해 **보조 손실(load balancing loss)** 을 추가했다.
2. **배치 축소** — 전문가마다 받는 토큰 수가 줄어 GPU 효율이 떨어진다. 데이터·모델 병렬을 섞어 해결했다.
3. **탐색 노이즈** — 게이팅에 노이즈를 넣어 다양한 전문가가 선택될 기회를 만들었다.

**결과** — LSTM 언어모델에 적용해 최대 137B 파라미터를 달성했다. 당시로서는 압도적 규모였다.

**의의** — MoE의 실용 가능성을 처음 증명했다. **load balancing이 선택이 아니라 필수**라는 것도 이 논문에서 확립됐다.

### 4. GShard: Scaling Giant Models with Conditional Computation and Automatic Sharding
**Lepikhin, Lee, Xu 외 (Google) · ICLR, 2021**

> MoE를 Transformer에 얹고 **분산 학습 문제를 해결**한 논문.

**배경** — 3번이 아이디어를 증명했다면, 이를 Transformer로 옮기고 수백 개 가속기에 분산시키는 것은 별개의 엔지니어링 문제였다.

**핵심 아이디어** — 두 가지다.

1. **MoE Transformer** — Transformer의 FFN 층을 MoE 층으로 대체한다. 매 층이 아니라 **한 층 건너 하나씩** 교체하는 구성을 썼다.
2. **자동 샤딩 API** — 텐서에 분할 어노테이션만 달면 컴파일러(XLA)가 통신 코드를 생성한다. 모델 코드와 병렬화 전략을 분리한 것이 실용적 기여다.

**결과** — 600B 파라미터 다국어 번역 모델을 2048개 TPU v3로 4일 만에 학습했다. 100개 언어를 하나의 모델로 처리하면서 언어별 전용 모델을 능가했다.

**의의** — **MoE는 FFN을 대체한다**는 표준 설계가 여기서 굳어졌다. Attention은 토큰 간 상호작용을 담당하므로 쪼개면 기능이 깨지고, 파라미터의 대부분이 FFN에 있으므로 용량을 늘리기에도 FFN이 적합하다.

### 5. Switch Transformers: Scaling to Trillion Parameter Models
**Fedus, Zoph, Shazeer (Google) · JMLR, 2022**

> MoE를 **최대한 단순하게** 만들어 안정성을 확보한 논문.

**배경** — 기존 MoE는 top-$k$($k\ge2$)를 썼다. 저자들은 $k=1$이면 안 된다는 통념이 근거가 약하다고 봤다.

**핵심 아이디어** — **Top-1 라우팅**. 토큰당 전문가 하나만 활성화한다. 라우팅 연산이 줄고, 전문가당 배치가 커지며, 통신량이 절반이 된다.

여기에 안정화 기법을 더했다.

- **Capacity factor** — 전문가당 처리 가능한 토큰 수에 상한을 둔다. 넘치면 그 토큰은 해당 층을 건너뛴다(residual만 통과)
- **선택적 정밀도** — 라우터만 float32로 계산해 bfloat16 학습의 불안정을 잡았다
- 축소된 초기화 스케일, 전문가 드롭아웃

**결과** — T5-Base 대비 동일 연산에서 **7배 빠른 사전학습**, 최대 1.6T 파라미터 모델을 학습했다. 101개 언어 다국어 실습에서도 개선을 보였다.

**의의** — MoE가 연구 아이디어에서 프로덕션 기법으로 넘어간 지점이다. 그리고 **단순화가 곧 안정화**라는 교훈이 반복된다.

### 6. Mixtral of Experts
**Jiang, Sablayrolles, Roux 외 (Mistral AI) · arXiv, 2024**

> MoE를 오픈 가중치로 공개하고, **전문가가 무엇에 전문화되는지** 분석한 논문.

**핵심 아이디어** — Mixtral 8×7B는 각 층의 FFN을 8개 전문가로 두고 **top-2**를 활성화한다.

| | 값 |
|---|---|
| 총 파라미터 | 46.7B |
| **활성 파라미터** | **12.9B** (약 28%) |
| 성능 | LLaMA 2 70B 및 GPT-3.5와 대부분 벤치마크에서 대등하거나 우위 |

**가장 흥미로운 부분: 라우팅 분석** — 저자들은 전문가가 주제별로(수학·생물학·코드) 전문화되는지 확인했는데, **주제와의 뚜렷한 상관은 관찰되지 않았다.** 대신 라우팅은 **구문적·토큰 수준 패턴**과 더 강하게 상관됐다. 연속된 토큰이 같은 전문가로 가는 위치적 지역성도 관찰됐다.

**의의** — "수학 전문가", "코딩 전문가"라는 흔한 비유가 실제 동작과 다르다는 것을 데이터로 보였다. MoE의 라우팅은 사람이 읽을 수 있는 분업이 아니라 **최적화가 찾아낸 임의의 분할**에 가깝다.

### 7. DeepSeek-V3 Technical Report
**DeepSeek-AI · 2024**

> 671B 모델을 **약 279만 H800 GPU 시간**으로 학습시킨 엔지니어링 보고서.

**배경** — 프론티어 모델 학습 비용이 진입 장벽이 된 상황에서, 효율화를 극단까지 밀어붙인 사례다.

**핵심 아이디어** — 여러 기법의 조합이다.

- **MLA (Multi-head Latent Attention)** — KV를 저차원 잠재 벡터로 압축해 KV Cache를 크게 줄인다. GQA와 목적은 같지만 접근이 다르다
- **DeepSeekMoE** — 전문가를 잘게 쪼개고, 항상 활성화되는 **공유 전문가(shared expert)** 를 별도로 둔다. 공통 지식은 공유 전문가가 담당하고 나머지가 특화된다
- **보조 손실 없는 부하 분산** — load balancing loss가 성능을 해친다는 관찰에서, 손실 대신 **전문가별 편향값을 동적으로 조정**해 균형을 맞춘다
- **FP8 혼합 정밀도 학습** — 초대규모 모델에서 FP8 학습의 실현 가능성을 보였다
- **MTP (Multi-Token Prediction)** — 다음 토큰 하나가 아니라 여러 개를 예측하는 보조 목표

| | 값 |
|---|---|
| 총 / 활성 파라미터 | 671B / **37B** (5.5%) |
| 학습 토큰 | 14.8T |
| 학습 비용 | 약 2.788M H800 GPU-hours |

**의의** — MoE·양자화·병렬화를 총동원해 비용을 한 자릿수 낮춘 사례다. 개인적으로 경량화에 관심이 있어 가장 흥미롭게 읽은 보고서였는데, **개별 기법의 참신함보다 통합의 완성도**가 인상적이었다.

### 8. DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning
**DeepSeek-AI · 2025**

> 추론 능력이 **순수 강화학습만으로 창발**할 수 있음을 보인 논문.

**배경** — o1 계열이 추론 시점 연산을 늘려 성능을 얻는 방향을 열었지만 방법은 공개되지 않았다. 통념은 추론 능력을 얻으려면 대량의 CoT 지도 데이터가 필요하다는 것이었다.

**핵심 아이디어 ① R1-Zero** — SFT 없이, 사전학습 모델에 **곧바로 RL**을 적용했다. 보상은 사람의 선호가 아니라 **검증 가능한 정답**(수학 답, 코드 테스트 통과)이고, 알고리즘은 GRPO를 썼다.

결과가 흥미롭다. 학습이 진행되면서 모델이 **스스로 응답 길이를 늘리고**, 자기 검증·재검토 같은 행동이 나타났다. 논문이 "aha moment"라 부른 지점이다. 지도 데이터로 가르치지 않은 행동이 보상 최적화만으로 나온 것이다.

**핵심 아이디어 ② R1** — R1-Zero는 가독성이 낮고 언어가 섞이는 문제가 있어, 소량의 cold-start 데이터로 SFT한 뒤 다단계 RL을 적용했다.

**핵심 아이디어 ③ Distillation** — R1이 생성한 **추론 데이터 80만 건**으로 Qwen·LLaMA 기반 오픈 모델(1.5B~70B)을 파인튜닝했다.

> 여기서 용어를 정확히 할 필요가 있다. **이 distillation은 Hinton식 KD가 아니다.** 논문 본문이 "800k samples curated with DeepSeek-R1"으로 직접 파인튜닝했고 "only apply SFT and do not include an RL stage"라고 명시한다. 로짓 분포에 대한 KL이 아니라 **생성 텍스트를 정답으로 삼은 지도학습**, 즉 2번 논문의 sequence-level KD 계열이다.
{: .prompt-warning }

| | 고전 KD (Hinton) | Sequence-level (R1) |
|---|---|---|
| 전달 대상 | 로짓 분포 | 생성 텍스트 |
| 손실 | KL divergence | Cross-entropy |
| Teacher 접근 | **가중치 필요** | **출력만 있으면 됨** |
| 토크나이저 | 같아야 함 | 달라도 무방 |

세 번째 행이 실무적으로 중요하다. 로짓이 필요 없으므로 **폐쇄형 모델의 API 출력만으로도 distillation이 가능**하고, 다수의 상용 모델 이용약관이 "출력으로 경쟁 모델을 학습시키는 것"을 금지하는 이유가 정확히 이것이다.

**의의** — 추론 능력이 **아키텍처가 아니라 학습 신호의 문제**라는 것을 보였다. 그리고 사람의 선호라는 노이즈 많은 신호 대신 **검증 가능한 보상**을 쓰는 방향을 제시했다.

## 3부. 평가

### 9. Holistic Evaluation of Language Models (HELM)
**Liang, Bommasani, Lee 외 (Stanford CRFM) · TMLR, 2023**

> **단일 정확도 숫자로 모델을 줄 세우는 것**에 대한 반론.

**배경** — 모델마다 서로 다른 벤치마크의 유리한 수치만 보고하는 관행이 있었다. 비교 가능성이 없었고, 정확도 외의 축은 거의 측정되지 않았다.

**핵심 아이디어** — 세 가지를 제안한다.

1. **시나리오의 분류학** — 태스크·도메인·언어로 평가 공간을 체계화하고 무엇이 측정되고 무엇이 빠졌는지를 명시한다
2. **다축 측정** — 시나리오마다 **7개 지표**를 함께 잰다

```text
Accuracy · Calibration · Robustness · Fairness
Bias · Toxicity · Efficiency
```

3. **표준화된 조건** — 모든 모델을 동일한 프롬프트·동일한 few-shot 설정으로 평가한다

**결과** — 30개 모델을 16개 핵심 시나리오에서 평가했고, 그 이전까지 이 조건으로 평가된 적 있는 모델 조합은 **17.9%**에 불과했다는 점을 밝혔다. 정확도와 다른 지표들 사이에 트레이드오프가 존재한다는 것도 보였다.

**의의** — Calibration이 특히 실무적이다. **모델의 확률 추정이 실제 정답률과 맞는가**는 정확도와 독립적인 축이고, "이 답변을 신뢰해도 되는가"를 판단할 때는 오히려 더 중요하다. 다만 평가 범위가 방대한 만큼 최신 모델 반영이 느리다는 실용적 한계가 있다.

### 10. A Careful Examination of Large Language Model Performance on Grade School Arithmetic
**Zhang, Da, Lee 외 (Scale AI) · 2024**

> 벤치마크 점수가 **오염된 것인지 실력인지** 측정한 논문.

**배경** — MMLU·GSM8K·HumanEval은 모두 웹에 공개되어 있고, 프론티어 모델의 사전학습 코퍼스는 웹 전체를 긁는다. **평가 문제가 학습 데이터에 들어갔을 가능성**이 구조적으로 존재한다. 그런데 이를 정량화한 연구는 드물었다.

**핵심 아이디어** — 단순하고 강력하다. GSM8K와 **동일한 난이도·형식**의 새 문제 1,250개(GSM1k)를 사람이 직접 만들고, 두 벤치마크의 점수 차이를 본다. 새 문제는 공개하지 않으므로 오염될 수 없다.

**결과**

- 일부 모델군에서 **최대 13%p** 성능 하락
- **GSM8K 문제를 생성할 확률과 성능 격차 사이에 양의 상관** — 즉 문제를 외운 정도와 점수 하락이 함께 움직인다
- 반면 프론티어 모델 다수는 격차가 거의 없어, **모든 모델이 오염된 것은 아님**도 함께 보였다

**의의** — 리더보드를 읽는 기준을 제공한다.

```text
벤치마크 점수를 볼 때
  ① 언제 공개된 벤치마크인가        (오래됐을수록 오염 위험 ↑)
  ② 비공개 홀드아웃 평가가 있는가
  ③ 자체 보고인가 독립 평가인가
  ④ 정확도 외의 축은 어떤가
```

여기에 굿하트의 법칙이 겹친다. **측정 지표가 목표가 되는 순간 좋은 지표이기를 그만둔다.** 벤치마크 점수가 마케팅 자산이 되면 그 점수에 맞춘 최적화가 일어난다.

## 정리

| 축 | 논문 | 한 줄 |
|---|---|---|
| **KD** | Hinton 2015 | Soft label의 dark knowledge, 온도 $T$ |
| | Kim & Rush 2016 | 시퀀스에서는 **출력 문장**을 옮긴다 |
| **MoE** | Shazeer 2017 | 조건부 연산의 실용화, load balancing 필수 |
| | GShard 2021 | **FFN을 MoE로** 대체하는 표준 확립 |
| | Switch 2022 | Top-1로 단순화 → 안정성, 7배 가속 |
| | Mixtral 2024 | 전문가는 **주제가 아니라 구문**으로 갈린다 |
| | DeepSeek-V3 2024 | MLA + 공유 전문가 + FP8, 671B/37B |
| | DeepSeek-R1 2025 | 순수 RL로 추론 창발, distillation은 **SFT** |
| **평가** | HELM 2023 | 정확도는 **7개 축 중 하나**일 뿐 |
| | GSM1k 2024 | 오염을 실측하니 최대 13%p 격차 |

시리즈 전체를 마무리하며 남는 인상은 이렇다. **Transformer는 2017년 이후 뼈대가 거의 바뀌지 않았고, 실질적 발전은 전부 그 주변에서 일어났다.** 정규화 위치와 위치 인코딩(3편), 학습 목적함수와 데이터 배분(4편), 용량 배분과 지식 이전(5편) — 아키텍처 바깥의 문제들이다.

그리고 반복적으로 관찰되는 패턴이 하나 있다. **단순화가 이긴다.** Luong의 dot-product attention, Switch의 top-1 라우팅, DPO의 RL 루프 제거, RMSNorm의 평균 빼기 생략, FlashAttention의 근사 포기 — 전부 무언가를 빼서 이겼다. 경량화·양자화 쪽을 보는 입장에서 이 패턴은 계속 기억해 둘 만하다고 느꼈다.

---

이전 글: [정렬과 스케일링 9편](/posts/paper-review-alignment-scaling/)

시리즈 처음: [NLP 표현학습의 계보 12편](/posts/paper-review-nlp-foundations/)

관련 글: [SKALA LLM 2일차 — Modern LLM](/posts/skala-transformer-day2/)
