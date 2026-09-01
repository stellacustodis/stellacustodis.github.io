---
title: "[논문 리뷰] Transformer 아키텍처 개선 — 논문의 그림과 현재 코드가 다른 이유 9편"
date: 2026-08-07 11:00:00 +0900
layout: post
permalink: /posts/paper-review-transformer-variants/
categories:
  - AI
  - Paper Review
tags: [paper-review, transformer, layernorm, rope, flashattention, gqa, swiglu]
math: true
related: [paper-review-transformer, paper-review-efficiency-eval, skala-transformer-day1]
---

Transformer 논문을 읽고 LLaMA 구현 코드를 열면 그림과 코드가 꽤 다르다. LayerNorm의 위치가 바뀌어 있고, 위치 인코딩이 사인파가 아니며, 활성함수가 ReLU가 아니고, attention 계산 방식도 다르다.

이 글은 **그 간극을 만든 9편**을 다룬다. 2017년 원 논문 이후 개별적으로는 작아 보이지만 누적되면 학습 안정성·컨텍스트 길이·추론 속도를 통째로 바꾼 변경들이다.

```text
정규화     LayerNorm(2016) → Pre-LN(2020) → RMSNorm(2019)
활성함수   ReLU → SwiGLU(2020)
위치정보   사인파 → RoPE(2021) / ALiBi(2022)
필수성     FFN·residual이 없으면 붕괴한다 (2021)
효율       FlashAttention(2022), GQA(2023)
```

## 1부. 정규화

### 1. Layer Normalization
**Ba, Kiros, Hinton (U. Toronto) · arXiv, 2016**

> BatchNorm이 못 쓰이는 자리를 메운 정규화.

**배경** — BatchNorm은 CNN에서 큰 성공을 거뒀지만 RNN·가변 길이 시퀀스에서는 쓰기 어려웠다. 학습 중 배치 축으로 통계를 내기 때문에 **배치 크기와 구성에 의존**하고, 시점마다 통계가 달라야 하는 RNN에서는 시점별로 별도 통계를 유지해야 한다. 일반적인 추론 모드에서는 저장한 running statistics를 사용하므로, 배치 크기 1 자체가 통계를 무의미하게 만드는 것은 아니다.

**핵심 아이디어** — 정규화 축을 바꾼다. 배치가 아니라 **한 샘플의 특징 차원**으로 평균과 분산을 낸다.

$$
\mu = \frac{1}{d}\sum_{i=1}^{d}x_i,\qquad
\text{LN}(x) = \gamma\odot\frac{x-\mu}{\sqrt{\sigma^2+\epsilon}}+\beta
$$

```text
BatchNorm : (배치, 특징) 중 배치 축   → 샘플들 사이의 통계
LayerNorm : (배치, 특징) 중 특징 축   → 샘플 하나 안의 통계
```

샘플 하나만으로 계산되므로 배치 크기와 무관하고, 학습과 추론이 동일하게 동작한다.

**의의** — Transformer가 LayerNorm을 채택한 이유가 정확히 이것이다. 가변 길이 시퀀스에서 패딩이 배치 통계를 오염시키지 않고, 추론 시 배치 1도 문제없다.

### 2. On Layer Normalization in the Transformer Architecture
**Xiong, Yang, He 외 (MSRA / Peking University 외) · ICML, 2020**

> 원 논문의 warmup이 왜 필요했는지를 설명하고, 그 의존을 줄일 수 있음을 보인 논문.

**배경** — 원 논문의 Post-LN Transformer 설정에서는 **학습률 warmup이 사실상 필수**였다. 없으면 발산하는데, 왜 그런지에 대한 이론적 설명이 없었다. Warmup 스텝 수는 또 하나의 민감한 하이퍼파라미터였다.

**핵심 아이디어** — 원 논문의 구조는 **Post-LN**이다.

$$
\underbrace{x_{l+1}=\text{LN}\big(x_l+F(x_l)\big)}_{\textbf{Post-LN}}
\qquad
\underbrace{x_{l+1}=x_l+F\big(\text{LN}(x_l)\big)}_{\textbf{Pre-LN}}
$$

차이가 결정적이다. Post-LN에서는 residual 경로가 LayerNorm을 통과하므로 **항등 경로가 깨진다.** 저자들은 평균장 이론으로 초기화 시점의 기울기를 분석해, Post-LN에서 출력층 근처의 기울기가 층 수에 따라 커지고 이것이 초기 불안정의 원인임을 보였다.

Pre-LN에서는 $x_l \to x_{l+1}$의 **순수한 항등 경로**가 유지되고, 기울기 크기가 층 수에 대해 $O(1/\sqrt{L})$로 잘 제어된다.

**결과** — 논문이 실험한 설정에서는 Pre-LN을 **warmup 없이도** 안정적으로 학습해 baseline과 비슷한 결과에 도달했고, 학습 시간과 하이퍼파라미터 탐색을 줄였다. 이것이 모든 모델과 설정에서 warmup이 불필요하다는 보장은 아니다.

**의의** — GPT-2 이후 사실상 표준이 됐다. LLaMA·PaLM·Mistral 모두 Pre-LN이다. **원 논문 그림대로 구현하면 요즘 기준으로는 학습이 까다로운 모델이 나온다**는 뜻이라, 논문과 코드의 첫 번째 간극이 여기다.

| | Post-LN | Pre-LN |
|---|---|---|
| 채택 | Vaswani et al. 2017 | GPT-2 이후 대부분 |
| Warmup | 의존도가 높음 | 의존도가 낮고, 논문 실험에서는 생략 가능 |
| 깊이 확장 | 깊어질수록 초기화가 까다로움 | 더 깊은 모델의 최적화에 유리 |

### 3. Root Mean Square Layer Normalization
**Zhang, Sennrich (U. Edinburgh) · NeurIPS, 2019**

> LayerNorm에서 평균 빼기를 없애도 된다는 관찰.

**배경** — LayerNorm의 성공 요인은 보통 **재중심화(re-centering)** 와 **재스케일링(re-scaling)** 둘 다로 설명됐다. 저자들은 이 가정을 검증했다.

**핵심 아이디어** — 평균 계산을 생략하고 RMS로만 정규화한다.

$$
\text{RMSNorm}(x)=\gamma\odot\frac{x}{\text{RMS}(x)},\qquad
\text{RMS}(x)=\sqrt{\frac{1}{d}\sum_{i=1}^{d}x_i^2}
$$

**실제로 중요한 것은 재스케일링뿐**이고 재중심화는 기여가 미미하다는 것이 논문의 주장이다. 평균 계산과 뺄셈이 사라져 연산이 줄고, 논문은 7~64% 수준의 속도 개선을 보고했다.

**의의** — LLaMA 계열이 채택하면서 오픈 LLM의 기본값이 됐다. 성능 손실 없이 계산을 줄이는, 전형적인 "빼도 되는 것을 찾은" 연구다. 개인적으로 경량화 관점에서 좋아하는 유형의 논문이다.

## 2부. 활성함수와 필수 구성요소

### 4. GLU Variants Improve Transformer
**Shazeer (Google) · arXiv, 2020**

> 5페이지짜리 논문이 현대 LLM의 FFN을 바꿨다.

**배경** — Transformer의 FFN은 $\max(0, xW_1+b_1)W_2+b_2$ 형태였다. BERT·GPT는 ReLU 대신 GeLU를 썼지만 구조 자체는 그대로였다.

**핵심 아이디어** — **GLU(Gated Linear Unit)** 를 FFN에 적용한다. 게이트를 하나 더 두고 성분별 곱을 취한다.

$$
\text{SwiGLU}(x) = \big(\text{Swish}(xW_1)\big)\odot(xV)\,W_2
$$

여러 변형(GEGLU, SwiGLU, ReGLU 등)을 실험해 대부분이 기존 FFN보다 나았다고 보고한다.

**짚어둘 점** — 게이트 때문에 행렬이 2개에서 3개로 늘어난다. 파라미터 수를 맞추려면 $d_{ff}$를 $\frac{2}{3}\times 4d_{\text{model}}$ 수준으로 줄여야 하고, LLaMA 설정 파일의 `intermediate_size`가 4배가 아닌 어중간한 값인 이유가 이것이다.

논문에서 가장 유명한 문장은 결론에 있다.

> "We offer no explanation as to why these architectures seem to work; we attribute their success, as all else, to divine benevolence."

왜 되는지 설명하지 않겠다고 명시한 것인데, 정직하면서도 이 분야의 경험주의적 성격을 잘 보여준다.

### 5. Attention is Not All You Need: Pure Attention Loses Rank Doubly Exponentially with Depth
**Dong, Cordonnier, Loukas (EPFL) · ICML, 2021**

> 제목부터 원 논문에 대한 반론. **FFN과 residual이 없으면 Transformer가 붕괴한다**는 것을 증명했다.

**배경** — Transformer의 성공은 대개 attention 덕분으로 설명됐다. FFN과 skip connection은 부수적 장치로 취급됐다.

**핵심 아이디어** — 순수 self-attention만 쌓으면 출력이 **깊이에 대해 이중지수적으로 rank-1 행렬에 수렴**한다는 것을 보였다. 모든 토큰의 표현이 하나의 방향으로 붕괴한다는 뜻이다.

$$
\|\,\text{SAN}(X) - \mathbf{1}x^{\top}\| \;\longrightarrow\; 0 \quad\text{(깊이에 대해 이중지수적으로)}
$$

이를 attention 헤드들의 경로 합으로 분해해 분석했고, **skip connection과 MLP가 이 붕괴를 상쇄**하는 역할을 한다는 것을 함께 보였다. Skip connection이 특히 강력한 억제 요인이었다.

**의의** — attention의 정체를 다시 규정한 논문이다. Attention은 값들을 **재조합**할 뿐이고(주어진 가중치에서 출력은 $V$의 볼록결합), 새로운 특징 축을 만드는 것은 FFN이다. 파라미터의 2/3가 FFN에 있다는 사실과도 맞물린다.

## 3부. 위치 정보

### 6. RoFormer: Enhanced Transformer with Rotary Position Embedding
**Su, Lu, Pan, Wen, Liu (Zhuiyi Technology) · arXiv, 2021**

> 위치를 더하지 말고 **회전시키자**.

**배경** — 원 논문의 사인파 인코딩은 임베딩에 위치 벡터를 **더한다**. 절대 위치를 주입하는 방식이라 학습 길이를 넘어가면 성능이 무너졌다. 학습형 위치 임베딩도 마찬가지다.

**핵심 아이디어** — query와 key 벡터를 위치에 비례한 각도만큼 **회전**시킨다.

$$
\langle R_m q,\ R_n k\rangle = \langle q,\ R_{n-m}k\rangle
$$

회전행렬의 성질에 의해 **위치에 관한 의존성이 상대 거리 $n-m$로만 들어간다.** 내적 자체는 물론 $q$와 $k$의 내용에도 의존한다. 절대 위치로 회전시켰는데 상대 위치 차이가 구조적으로 반영되는 것이다.

흥미로운 점은 이 회전행렬이 원 논문의 사인파 유도에도 이미 등장한다는 것이다. Vaswani et al.은 $PE_{pos+k}$가 $PE_{pos}$의 선형변환이라는 성질을 언급했지만 임베딩에 더하는 데 그쳤고, RoPE는 그 회전을 **attention 내부로 옮겼다.**

**의의** — LLaMA·Qwen·Mistral 등 대부분의 오픈 LLM이 채택했다. 컨텍스트 확장(4K → 128K)이 가능해진 배경이기도 하다. **위치 보간(position interpolation)** 은 position index를 선형으로 축소해 학습 범위 안으로 매핑하는 방법이고, RoPE base를 조정하는 것은 별도의 frequency scaling 계열이다. 둘 다 짧은 파인튜닝과 결합해 길이를 늘리는 데 쓰인다.

### 7. Train Short, Test Long: Attention with Linear Biases (ALiBi)
**Press, Smith, Lewis (U. Washington / Facebook AI / Allen AI) · ICLR, 2022**

> 위치 임베딩을 아예 없애는 접근.

**배경** — 논문의 문제 제기가 명확하다. 기존 위치 인코딩들은 **학습 길이를 넘어가면 전부 실패한다.** 그런데 실무에서는 짧게 학습하고 길게 추론하고 싶다.

**핵심 아이디어** — 위치 임베딩을 제거하고, attention score에 **거리에 비례한 페널티**를 더한다.

$$
\text{score}_{ij} = q_i k_j^{\top} - m\cdot|i-j|
$$

$m$은 헤드마다 고정된 기울기(학습하지 않음)다. 멀리 있는 토큰일수록 점수가 선형으로 깎이는, 일종의 **거리 사전(prior)** 이다.

**결과** — 1024 토큰으로 학습한 모델이 2048 토큰 입력에서 2048로 학습한 sinusoidal 모델과 비슷하거나 나은 perplexity를 보였다. 학습이 11% 빠르고 메모리도 11% 적게 썼다.

**의의** — 구현이 극단적으로 단순하다(점수 행렬에 상수 행렬 하나 더하기). BLOOM 등이 채택했다. 다만 현재 주류는 RoPE 쪽이고, ALiBi는 "정말 필요한 건 위치 벡터가 아니라 거리 편향일 수도 있다"는 관점을 남겼다.

## 4부. 효율

### 8. FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness
**Dao, Fu, Ermon, Rudra, Ré (Stanford) · NeurIPS, 2022**

> 근사하지 않고 **메모리 접근만 바꿔서** 이긴 논문.

**배경** — Self-attention은 $O(n^2)$ 복잡도라 긴 시퀀스에서 병목이다. 2020~2022년에 Linformer·Performer·Longformer 등 **근사 attention**이 쏟아졌는데, 품질 손실 때문에 실제 채택은 저조했다.

**핵심 아이디어** — 저자들의 진단이 다르다. **병목은 연산(FLOPs)이 아니라 메모리 이동**이다.

```text
GPU 메모리 계층
  SRAM  : 약 19TB/s, 20MB     ← 빠르지만 작다
  HBM   : 약 1.5TB/s, 40GB    ← 크지만 느리다

표준 attention은 n×n 점수 행렬을 HBM에 쓰고 다시 읽는다
  → n=4096이면 그것만으로 수십 MB의 왕복
```

해법은 두 가지다.

1. **Tiling** — Q·K·V를 블록으로 쪼개 SRAM에 올리고, **$n\times n$ 행렬을 통째로 만들지 않은 채** softmax를 온라인으로 누적 계산한다.
2. **Recomputation** — 역전파에 필요한 중간값을 저장하지 않고 필요할 때 다시 계산한다. 연산은 늘지만 메모리 이동이 줄어 결과적으로 빨라진다.

**결과** — 계산 결과는 표준 attention과 **완전히 동일**(exact)하다. BERT-large 학습 15% 단축, GPT-2 3배 가속, 메모리는 시퀀스 길이에 **선형**.

**의의** — 이 논문의 교훈이 크다고 본다. 근사를 도입한 방법들은 품질 손실 때문에 밀려났고, **정확도를 유지한 채 하드웨어 특성에 맞춘** 접근이 표준이 됐다. 점근 복잡도 $O(n^2)$는 그대로인데 실측이 크게 개선됐다는 점도 시사적이다 — 알고리즘 분석과 실제 성능이 갈리는 지점이다.

### 9. GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints
**Ainslie, Lee-Thorp, de Jong 외 (Google Research) · EMNLP, 2023**

> KV Cache 메모리와 품질 사이의 중간 지점.

**배경** — 자기회귀 추론에서는 이전 토큰의 $K$·$V$를 캐싱해 재계산을 피한다. 그런데 이 **KV Cache가 긴 컨텍스트에서 모델 가중치보다 커진다.**

$$
\text{KV Cache} = 2 \times n_{\text{layer}} \times n_{\text{head}} \times d_{\text{head}} \times n_{\text{token}} \times \text{bytes}
$$

Shazeer(2019)의 **MQA(Multi-Query Attention)** 는 모든 query head가 **하나의** key/value head를 공유해 캐시를 $h$배 줄였지만, 품질 저하와 학습 불안정이 보고됐다.

**핵심 아이디어** — MHA와 MQA 사이를 보간한다. Query head를 $G$개 그룹으로 나누고 **그룹마다 하나의 KV head**를 둔다.

| | KV head 수 | KV Cache | 품질 |
|---|---|---|---|
| MHA | $h$ | 100% | 기준 |
| **GQA** | $G$ (예: 8) | $G/h$ | MHA에 근접 |
| MQA | 1 | $1/h$ | 저하 |

두 번째 기여가 실용적으로 더 중요하다. **기존 MHA 체크포인트를 처음부터 다시 학습하지 않고 변환**할 수 있다. KV 프로젝션을 그룹별로 평균내어 초기화한 뒤 사전학습 연산의 약 5%만 추가 학습(uptraining)하면 된다.

**의의** — LLaMA 2 70B 이후 대부분의 대형 오픈 모델이 GQA를 쓴다. "이미 학습된 모델을 버리지 않고 개선한다"는 접근이 특히 실용적이다.

## 정리

9편을 원 논문 대비 변경 목록으로 정리하면 이렇다.

| 구성요소 | Vaswani et al. 2017 | 현재 (LLaMA 계열 기준) |
|---|---|---|
| 정규화 위치 | Post-LN | **Pre-LN** |
| 정규화 방식 | LayerNorm | **RMSNorm** |
| FFN 활성함수 | ReLU | **SwiGLU** |
| 위치 정보 | 사인파 (더하기) | **RoPE** (회전) |
| Attention 구현 | 표준 | **FlashAttention** |
| KV head | MHA | **GQA** |

**블록의 뼈대는 그대로이고 부품이 전부 교체됐다.** 각 변경이 노리는 것도 나뉜다.

```text
학습 안정성   Pre-LN
계산량 절감   RMSNorm, GQA, FlashAttention
표현력        SwiGLU
길이 확장     RoPE, ALiBi
이론적 이해   Rank collapse
```

이 묶음을 읽으면서 가장 흥미로웠던 건 **FlashAttention과 근사 attention의 대비**다. 2020~2022년에 복잡도를 $O(n\log n)$이나 $O(n)$으로 낮추는 논문이 쏟아졌는데, 실제로 표준이 된 건 복잡도를 그대로 두고 메모리 계층만 고려한 쪽이었다. 이론적 개선이 실무 채택으로 이어지지 않는 사례이고, 경량화·양자화 쪽에서도 자주 보는 패턴이라 남겨 둘 만하다.

---

이전 글: [Transformer와 사전학습 시대 6편](/posts/paper-review-transformer/)

관련 글: [SKALA LLM 1일차 — 표현학습의 계보와 Transformer 정독](/posts/skala-transformer-day1/)

다음 글: [정렬과 스케일링 9편](/posts/paper-review-alignment-scaling/)
