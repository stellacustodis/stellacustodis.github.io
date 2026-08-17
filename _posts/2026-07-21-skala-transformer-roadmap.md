---
title: "[SKALA] LLM과 Transformer 아키텍처 — 2일 학습 로드맵"
date: 2026-07-21 08:00:00 +0900
categories:
  - SKALA
  - LLM
tags: [skala, llm, transformer, attention, rlhf, scaling-law, moe, learning-log]
description: "NLP 표현학습의 계보와 Transformer 아키텍처(1일차), 그 위에 쌓인 RLHF·Scaling Law·Distillation·MoE(2일차)를 원 논문 기준으로 정리하는 SKALA 생성형AI 과정의 2일 학습 로드맵"
permalink: /posts/skala-transformer-roadmap/
math: true
pin: false
---

SKALA 부트캠프 **생성형AI** 과정의 두 번째 모듈인 **LLM과 Transformer 아키텍처**는 7월 21일(화)과 22일(수) 이틀에 걸쳐 진행됐다.

이 시리즈는 앞선 [기초통계 시리즈](/posts/skala-statistics-roadmap/)와 성격이 다르다. 통계 과정은 이미 아는 내용을 검증하며 읽었다면, 이 과정은 실질적인 **내 전공 영역**이다. 그래서 강의 내용을 요약하는 데 그치지 않고, 다음 세 가지를 목표로 정리했다.

1. **원 논문으로 되짚기** — 슬라이드에 요약된 개념이 어느 논문의 어떤 주장인지, 원문이 실제로 무엇을 말했는지 확인한다
2. **설계 근거를 수식으로 확인** — "왜 $\sqrt{d_k}$로 나누는가" 같은 질문에 말이 아니라 유도로 답한다
3. **강의가 멈춘 지점 이어가기** — 2017년 원 논문과 현재 프로덕션 LLM이 갈라지는 곳(Post-LN → Pre-LN, PPO → DPO 등), 그리고 슬라이드가 다루지 않은 전제(벤치마크 오염, load balancing loss 등)를 함께 표시한다

> 강의자료는 개념 지도를 잡는 참고 자료로 활용하고, 설명·수식·예시는 원 논문을 직접 확인해 재구성했다. 본문에서 "확인해 보니 / 검산해 보니"로 시작하는 대목은 슬라이드의 서술을 원문·계산과 대조해 바로잡은 부분이다.
{: .prompt-info }

## 전체 흐름

| 일차 | 날짜 | 핵심 주제 | 도달 목표 |
|---|---|---|---|
| 1일차 | 7/21 (화) | Software 3.0, NLP 표현학습의 계보, Transformer 아키텍처 | Transformer의 **모든 구성요소가 어떤 문제를 푸는지** 설명한다 |
| 2일차 | 7/22 (수) | LLM Landscape, RLHF, Scaling Law, Distillation, MoE | 아키텍처 **위에 쌓인 층들**이 무엇을 바꿨는지 설명한다 |

두 날의 관계가 이 과정의 구도를 그대로 보여준다.

```text
[1일차]  아키텍처를 만든다
   언어를 어떻게 수치로 바꾸는가        One-hot · BoW · TF-IDF
     → 의미를 어디서 얻는가             분포가설 → Word2Vec
       → 문맥을 어떻게 담는가           RNN → LSTM → Seq2Seq
         → 병목을 어떻게 푸는가         Attention (Bahdanau 2015)
           → 순환을 아예 없애면?        Transformer (Vaswani 2017)

[2일차]  아키텍처 위에 쌓는다
   지시를 따르게 하려면?                RLHF → DPO
   얼마나 키워야 하는가?                Scaling Law → Chinchilla → 추론 예산
   작게 만들려면?                       Distillation
   파라미터를 다 써야 하는가?           MoE
```

1일차 마지막 화살표가 이 모듈의 분기점이다. Attention은 2014~2015년에 이미 나왔고 **RNN의 보조 장치**였다. Transformer의 기여는 attention을 발명한 것이 아니라 **순환을 제거해도 attention만으로 충분하다는 것을 보인 것**이다. 논문 제목이 "Attention Is All You Need"인 이유이고, 병렬화라는 실질 이득도 recurrence 제거에서 나온다.

2일차의 구도는 다르다. **네 주제 모두 아키텍처를 거의 건드리지 않는다.** GPT-1부터 지금까지 Transformer 블록 자체는 정규화 위치와 위치 인코딩 정도만 바뀌었고, 실질적 발전은 학습 목적함수·데이터 배분·용량 배분에서 나왔다.

## 다루는 범위

**1일차 — 표현학습의 계보와 Transformer**

- Software 1.0 / 2.0 / 3.0, LLM의 구조적 한계(Black box, Bias, Hallucination, Non-determinism)
- 이산 표현: One-hot, BoW, N-gram, TF-IDF와 그 한계
- 분포가설과 Thesaurus의 실패, Word2Vec(CBOW vs Skip-gram, Negative Sampling), 벡터 산술의 실체
- RNN의 기울기 소실, LSTM/GRU, Seq2Seq의 병목, Attention, Contextual Embedding, GPT 계보
- 선형대수 복습: 유사도와 거리, 내적, 행렬곱, 선형변환, Softmax
- **Transformer 정독**: Scaled Dot-Product와 $\sqrt{d_k}$ 유도, Multi-Head와 $W^O$, Residual·LayerNorm(Post-LN vs Pre-LN), FFN, Positional Encoding(사인파 → RoPE), Masked Self-Attention과 Cross-Attention, 복잡도 $O(n^2d)$

**2일차 — Modern LLM**

- LLM이 만든 변화: 생산성 지표를 읽는 법, AlphaFold, FDE라는 직군
- LLM Landscape: HELM·Vellum·HF 리더보드, 벤치마크 오염과 굿하트의 법칙, Open Weights ≠ Open Source
- **RLHF**: SFT → Reward Model(Bradley-Terry) → PPO + KL 페널티, Reward Hacking과 Sycophancy, DPO
- **Scaling Law**: 거듭제곱 법칙, Chinchilla의 20 tokens/param, Kaplan과의 불일치 원인, 추론 예산과 LLaMA의 반론, 창발 논쟁
- **Distillation**: Soft label과 온도 $T$, 고전 KD vs 합성 데이터 SFT
- **MoE**: Router와 Top-$k$, FFN 대체, Load Balancing Loss, 총 파라미터 vs 활성 파라미터

## 이 시리즈에서 바로잡은 것들

강의자료를 원문과 대조하면서 몇 군데를 수정해 적었다. 세부 근거는 각 글에 달아 두었고, 목록만 먼저 정리한다.

**1일차**

| 구분 | 슬라이드 | 확인 결과 |
|---|---|---|
| 인용 | "You shall know a word by the company it keeps" — Zellig Harris | **J.R. Firth (1957)** 의 문장. Harris(1954)는 분포가설의 정식화이지 이 문장의 출처가 아니다 |
| 계산 | $\mathbf{x}W$ where $\mathbf{x}=[1,2,3]$, $W=\begin{bmatrix}2&0\\1&-1\\0&1\end{bmatrix}$ → $[2, 1]$ | $[4, 1]$ |
| 개념 | $1 - \text{Similarity} = \text{Distance}$ | 코사인·자카드처럼 **정규화된 유사도에서만** 성립. 유클리드 거리는 상한이 없어 불가 |
| 논문 | GPT-1: "Improving Language Understanding **with Unsupervised Learning**" | 블로그 포스트 제목. 논문은 "**by Generative Pre-Training**" |
| 수치 | GPT-3 "약 500B 토큰 학습" | 코퍼스가 약 499B, **실제 학습 토큰은 300B** (가중 샘플링) |
| 개념 | Decoder는 "masked self-attention을 통해 목표 문장을 생성" | Masked self-attention **과 cross-attention 두 개**를 쓴다. 슬라이드에 cross-attention 설명이 빠져 있다 |
| 개념 | "Attention Score와 Ground Truth를 비교하여 Loss 계산" | Loss는 최종 로짓과 정답 토큰 사이에서 계산된다. Attention score는 중간 표현 |

**2일차**

| 구분 | 슬라이드 | 확인 결과 |
|---|---|---|
| 계산 | Soft label 예제 $[0.1, 0.9, 0.4, 0.15, 0.05, 0.04, 0.01]$ | 합이 **1.65**. 확률 분포가 아니다 |
| 개념 | DeepSeek-R1의 distillation을 Hinton식 soft label KD로 설명 | R1은 **생성 텍스트 80만 건으로 SFT**했다. 로짓 KL이 아니라 sequence-level distillation |
| 개념 | "Distillation은 압축이 아니다" → 같은 페이지에서 "모델 압축 기법" | 앞뒤 불일치. **결과는 압축, 방법은 재학습** |
| 인용 | Scaling 3요소 설명에 GPT-3 논문 Fig 1.2 인용 | 그 그림은 **in-context learning 곡선**(가로축이 예시 개수). 거듭제곱 법칙 그래프는 Kaplan et al. Fig 1 |
| 개념 | MoE Expert가 "처음에는 모두 동일하나" 전문화됨 | 완전 대칭이면 분화가 일어나지 않는다. **랜덤 초기화 + Router 편향 + load balancing** 셋이 필요 |
| 누락 | RLHF 목적함수를 "보상 최대화"로만 서술 | **KL 페널티**가 없으면 reward hacking으로 즉시 붕괴 |
| 누락 | MoE Router 설명에 균형 장치 없음 | **Load balancing loss** 없이는 expert collapse |

이 외에도 Word2Vec의 두 아키텍처 구분, ELMo가 LSTM 기반이라는 점, LSTM의 forget gate가 원 논문(1997)이 아니라 Gers et al.(2000)의 기여라는 점, Chinchilla의 주 비교 대상이 GPT-3가 아니라 Gopher라는 점 등 **원문과 슬라이드 요약 사이의 간극**을 각 글에 반영했다.

> 이 과정의 슬라이드는 비전공자를 포함한 교육용으로 잘 구성되어 있다. 위 정정들은 자료의 품질을 문제 삼는 것이 아니라, **요약 과정에서 압축된 것을 원문 해상도로 되돌려 놓는 작업**에 가깝다. 실제로 RLHF의 reward hacking이나 sycophancy처럼 강의가 정확하고 시의적절하게 짚은 대목도 여럿 있었다.
{: .prompt-tip }

## 참고 문헌

이 시리즈에서 인용한 논문을 한자리에 모아 둔다. 각 글에서 필요한 곳마다 다시 표시한다.

> 아래 논문들은 별도의 **[논문 리뷰 시리즈 5편](/posts/paper-review-nlp-foundations/)** 으로 정리했다. 각 논문의 배경·핵심 아이디어·기여를 압축한 글이다.
>
> ① [NLP 표현학습의 계보 12편](/posts/paper-review-nlp-foundations/) · ② [Transformer와 사전학습 시대 6편](/posts/paper-review-transformer/) · ③ [아키텍처 개선 9편](/posts/paper-review-transformer-variants/) · ④ [정렬과 스케일링 9편](/posts/paper-review-alignment-scaling/) · ⑤ [효율화와 평가 10편](/posts/paper-review-efficiency-eval/)
{: .prompt-tip }

**표현학습**

- Harris, Z. (1954). *Distributional Structure*. Word, 10(2-3).
- Firth, J.R. (1957). *A Synopsis of Linguistic Theory 1930-1955*.
- Mikolov, T. et al. (2013). *Efficient Estimation of Word Representations in Vector Space*. ICLR Workshop.
- Mikolov, T. et al. (2013). *Distributed Representations of Words and Phrases and their Compositionality*. NeurIPS.
- Pennington, J., Socher, R., Manning, C. (2014). *GloVe: Global Vectors for Word Representation*. EMNLP.
- Levy, O., Goldberg, Y. (2014). *Neural Word Embedding as Implicit Matrix Factorization*. NeurIPS.
- Levy, O., Goldberg, Y. (2014). *Linguistic Regularities in Sparse and Explicit Word Representations*. CoNLL.

**순차 모델과 Attention**

- Hochreiter, S., Schmidhuber, J. (1997). *Long Short-Term Memory*. Neural Computation.
- Gers, F., Schmidhuber, J., Cummins, F. (2000). *Learning to Forget: Continual Prediction with LSTM*. Neural Computation.
- Bengio, Y., Simard, P., Frasconi, P. (1994). *Learning Long-Term Dependencies with Gradient Descent is Difficult*. IEEE TNN.
- Sutskever, I., Vinyals, O., Le, Q. (2014). *Sequence to Sequence Learning with Neural Networks*. NeurIPS.
- Cho, K. et al. (2014). *Learning Phrase Representations using RNN Encoder-Decoder for SMT*. EMNLP.
- Bahdanau, D., Cho, K., Bengio, Y. (2015). *Neural Machine Translation by Jointly Learning to Align and Translate*. ICLR.
- Luong, M., Pham, H., Manning, C. (2015). *Effective Approaches to Attention-based NMT*. EMNLP.

**Transformer와 사전학습 모델**

- Vaswani, A. et al. (2017). *Attention Is All You Need*. NeurIPS.
- Peters, M. et al. (2018). *Deep Contextualized Word Representations*. NAACL. (ELMo)
- Radford, A. et al. (2018). *Improving Language Understanding by Generative Pre-Training*. (GPT-1)
- Radford, A. et al. (2019). *Language Models are Unsupervised Multitask Learners*. (GPT-2)
- Devlin, J. et al. (2019). *BERT: Pre-training of Deep Bidirectional Transformers*. NAACL.
- Brown, T. et al. (2020). *Language Models are Few-Shot Learners*. NeurIPS. (GPT-3)

**아키텍처 개선**

- Ba, J., Kiros, J., Hinton, G. (2016). *Layer Normalization*.
- Xiong, R. et al. (2020). *On Layer Normalization in the Transformer Architecture*. ICML.
- Zhang, B., Sennrich, R. (2019). *Root Mean Square Layer Normalization*. NeurIPS. (RMSNorm)
- Shazeer, N. (2020). *GLU Variants Improve Transformer*. (SwiGLU)
- Su, J. et al. (2021). *RoFormer: Enhanced Transformer with Rotary Position Embedding*. (RoPE)
- Press, O., Smith, N., Lewis, M. (2022). *Train Short, Test Long: Attention with Linear Biases*. ICLR. (ALiBi)
- Dong, Y., Cordonnier, J., Loukas, A. (2021). *Attention is Not All You Need: Pure Attention Loses Rank Doubly Exponentially with Depth*. ICML.
- Dao, T. et al. (2022). *FlashAttention*. NeurIPS.
- Ainslie, J. et al. (2023). *GQA: Training Generalized Multi-Query Transformer Models*. EMNLP.

**정렬·스케일링·효율화 (2일차)**

- Christiano, P. et al. (2017). *Deep Reinforcement Learning from Human Preferences*. NeurIPS.
- Ouyang, L. et al. (2022). *Training Language Models to Follow Instructions with Human Feedback*. NeurIPS. (InstructGPT)
- Rafailov, R. et al. (2023). *Direct Preference Optimization*. NeurIPS. (DPO)
- Sharma, M. et al. (2023). *Towards Understanding Sycophancy in Language Models*. ICLR 2024.
- Kaplan, J. et al. (2020). *Scaling Laws for Neural Language Models*.
- Hoffmann, J. et al. (2022). *Training Compute-Optimal Large Language Models*. NeurIPS. (Chinchilla)
- Touvron, H. et al. (2023). *LLaMA: Open and Efficient Foundation Language Models*.
- Wei, J. et al. (2022). *Emergent Abilities of Large Language Models*. TMLR.
- Schaeffer, R., Miranda, B., Koyejo, S. (2023). *Are Emergent Abilities of Large Language Models a Mirage?*. NeurIPS.
- Hinton, G., Vinyals, O., Dean, J. (2015). *Distilling the Knowledge in a Neural Network*. NeurIPS Workshop.
- Kim, Y., Rush, A. (2016). *Sequence-Level Knowledge Distillation*. EMNLP.
- Shazeer, N. et al. (2017). *Outrageously Large Neural Networks: The Sparsely-Gated MoE Layer*. ICLR.
- Fedus, W., Zoph, B., Shazeer, N. (2022). *Switch Transformers*. JMLR.
- Jiang, A. et al. (2024). *Mixtral of Experts*.
- DeepSeek-AI (2024). *DeepSeek-V3 Technical Report*.
- DeepSeek-AI (2025). *DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning*.
- Liang, P. et al. (2022). *Holistic Evaluation of Language Models*. TMLR. (HELM)
- Zhang, H. et al. (2024). *A Careful Examination of LLM Performance on Grade School Arithmetic*. (GSM1k)

다음 글: [1일차 — NLP 표현학습의 계보와 Transformer 정독](/posts/skala-transformer-day1/)

이어 읽기: [2일차 — Modern LLM: RLHF, Scaling Law, Distillation, MoE](/posts/skala-transformer-day2/)
