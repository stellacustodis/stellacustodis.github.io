---
title: "[논문 리뷰] NLP 표현학습의 계보 — Word2Vec에서 Attention까지 12편"
date: 2026-08-07 09:00:00 +0900
layout: post
permalink: /posts/paper-review-nlp-foundations/
categories:
  - AI
  - Paper Review
tags: [paper-review, nlp, word-embedding, word2vec, glove, lstm, seq2seq, attention]
math: true
related: [paper-review-transformer, skala-transformer-day1]
---

[SKALA LLM 시리즈](/posts/skala-transformer-roadmap/)를 정리하면서 인용한 논문들을 따로 읽어 두기로 했다. 내 주 관심사는 생성모델·경량화 쪽이라 NLP 계보는 개념으로만 알고 있던 것이 많았는데, 원문을 확인하고 나니 **각 논문이 어떤 실패를 보고 무엇을 고쳤는지**의 연결이 훨씬 선명해졌다.

이 글은 첫 번째 묶음으로, **1994년부터 2015년까지 — Transformer 직전까지의 12편**을 다룬다. 깊은 분석보다 배경·핵심 아이디어·기여를 압축하는 데 목적을 뒀다.

```text
기울기 소실의 규명 (1994)
  → LSTM으로 구조적 우회 (1997, 2000)
    → 단어를 밀집 벡터로 (2013 ×2, 2014 ×3)
      → 시퀀스를 시퀀스로 (2014 ×2)
        → 고정 벡터 병목을 Attention으로 (2015 ×2)
```

## 1부. 순환 신경망의 한계와 LSTM

### 1. Learning Long-Term Dependencies with Gradient Descent is Difficult
**Bengio, Simard, Frasconi · IEEE Transactions on Neural Networks, 1994**

> RNN이 장기 의존성을 못 배우는 이유를 "학습이 어렵다"가 아니라 **구조적 딜레마**로 증명한 논문.

**배경** — 1990년대 초 RNN은 이론적으로 임의의 시퀀스를 처리할 수 있다고 알려져 있었지만, 실제로는 10~20 시점만 떨어져도 학습이 되지 않았다. 원인이 최적화 기법의 문제인지 구조의 문제인지가 불분명했다.

**핵심 아이디어** — 저자들은 **정보를 안정적으로 저장하는 것(robust latching)과 기울기를 전파하는 것이 양립할 수 없음**을 보였다. 상태를 잡음에 강하게 유지하려면 시스템이 끌개(attractor)에 있어야 하는데, 끌개 상태에서는 야코비안의 스펙트럼 반경이 1보다 작아 기울기가 지수적으로 소멸한다.

$$
\frac{\partial h_t}{\partial h_k} = \prod_{i=k+1}^{t}\frac{\partial h_i}{\partial h_{i-1}}
$$

**의의** — "더 오래 학습시키면 되지 않나"라는 접근을 차단했다. 옵티마이저를 바꾸는 것으로는 해결할 수 없고 **구조를 바꿔야 한다**는 결론이 이후 LSTM·GRU·Transformer로 이어지는 흐름 전체의 출발점이 됐다.

### 2. Long Short-Term Memory
**Hochreiter, Schmidhuber · Neural Computation, 1997**

> 곱셈 대신 덧셈으로 상태를 갱신해 기울기 소실을 우회한 구조.

**배경** — Bengio et al.이 규명한 딜레마에 대한 직접적인 응답이다. Hochreiter의 1991년 학위논문에서 이미 문제를 지적했고, 그 해법이 이 논문이다.

**핵심 아이디어** — **CEC(Constant Error Carousel)** 라는 별도의 경로를 둔다. 셀 상태가 곱셈이 아니라 덧셈으로 갱신되므로, 기울기가 가중치 행렬의 반복 곱을 거치지 않고 흐른다. 여기에 **입력 게이트**와 **출력 게이트**를 붙여 언제 쓰고 언제 읽을지를 학습하게 했다.

**짚어둘 점** — **원 논문에는 forget gate가 없다.** 오늘날 교과서와 라이브러리에 실린 LSTM 그림에는 대부분 forget gate가 있는데, 그건 3년 뒤에 추가된 것이다. 1997년 판은 셀 상태를 지울 방법이 없었다.

### 3. Learning to Forget: Continual Prediction with LSTM
**Gers, Schmidhuber, Cummins · Neural Computation, 2000**

> 오늘날 "LSTM"이라 부르는 것의 마지막 조각.

**배경** — 원 LSTM은 명확히 구분된 시퀀스에서는 잘 동작했지만, **끝없이 이어지는 스트림**에서는 셀 상태가 무한정 누적되어 포화됐다. 상태를 초기화할 방법이 없었기 때문이다.

**핵심 아이디어** — **forget gate** $f_t$를 추가해 셀 상태를 능동적으로 감쇠시킨다.

$$
c_t = f_t \odot c_{t-1} + i_t \odot \tilde{c}_t
$$

$f_t \approx 1$이면 기울기가 그대로 통과하고, $f_t \approx 0$이면 과거를 잊는다. **모델이 언제 잊을지를 스스로 학습**한다는 점이 핵심이다.

**의의** — 인용은 1997년 논문으로 하면서 그림은 2000년 판을 쓰는 관행이 굳어졌다. 논문을 정확히 인용해야 하는 자리에서는 구분이 필요하다.

## 2부. 단어를 밀집 벡터로

### 4. Efficient Estimation of Word Representations in Vector Space
**Mikolov, Chen, Corrado, Dean (Google) · ICLR Workshop, 2013**

> 신경망 언어모델에서 은닉층을 걷어내 임베딩 학습을 수백 배 빠르게 만든 논문. Word2Vec의 출발점.

**배경** — 당시 신경망 언어모델(NNLM)은 품질은 좋았지만 은닉층 때문에 계산량이 커서 대규모 코퍼스에 쓰기 어려웠다. One-hot·BoW는 여전히 의미를 담지 못했다.

**핵심 아이디어** — 두 가지 경량 구조를 제안한다.

| | CBOW | Skip-gram |
|---|---|---|
| 방향 | 문맥 → 중심 단어 | 중심 단어 → 문맥 |
| 문맥 처리 | 평균/합으로 한 번에 | 각 쌍을 독립 샘플로 |
| 속도 | 빠름 | 느림 |
| 저빈도어 | 약함 | **강함** |

**비선형 은닉층을 제거**한 것이 핵심이다. 표현력을 조금 포기하는 대신 16억 단어 코퍼스를 하루 안에 학습할 수 있게 됐다.

**의의** — 이 논문이 유추 평가셋(`king - man + woman ≈ queen` 류)을 함께 제시하면서 임베딩 평가의 관행을 만들었다. 다만 이 평가 방식 자체가 이후 비판의 대상이 된다(7·8번 참조).

### 5. Distributed Representations of Words and Phrases and their Compositionality
**Mikolov, Sutskever, Chen, Corrado, Dean (Google) · NeurIPS, 2013**

> Word2Vec을 **실제로 학습 가능하게** 만든 후속편.

**배경** — 4번 논문의 구조에는 여전히 병목이 있었다. 출력층이 어휘 전체($|V|$)에 대한 softmax라 샘플 하나당 $|V|$번의 내적이 필요했다.

**핵심 아이디어** — 세 가지 기법을 제안한다.

1. **Negative Sampling** — 다중 클래스 분류를 이진 분류로 바꾼다. "이 (중심, 문맥) 쌍이 진짜인가 가짜인가"를 판별하게 하고, 가짜는 $k$개(5~20)만 뽑는다. 분모 계산이 사라진다.

$$
\log\sigma(v'^{\top}_{w_O}v_{w_I}) + \sum_{i=1}^{k}\mathbb{E}_{w_i\sim P_n(w)}\left[\log\sigma(-v'^{\top}_{w_i}v_{w_I})\right]
$$

2. **Subsampling** — 빈도 $f(w)$인 단어를 확률 $1-\sqrt{t/f(w)}$로 버려 "the" 같은 단어가 학습을 지배하는 것을 막는다.
3. **Phrase vectors** — "New York Times"처럼 구 단위를 하나의 토큰으로 학습.

**짚어둘 점** — 노이즈 분포로 유니그램의 $3/4$ 제곱을 쓰는데, 논문은 실험적으로 우수했다고만 밝히고 **이론적 근거는 제시하지 않는다.** 널리 쓰이는 하이퍼파라미터 중 가장 유명한 "경험적으로 잘 되더라"의 사례다.

### 6. GloVe: Global Vectors for Word Representation
**Pennington, Socher, Manning (Stanford) · EMNLP, 2014**

> Word2Vec이 암묵적으로 하던 일을 **명시적 목적함수로 적어낸** 논문.

**배경** — 당시 임베딩 학습에는 두 계열이 있었다. LSA류의 **전역 행렬 분해**(코퍼스 통계는 잘 쓰지만 유추 성능이 나쁨)와 Word2Vec류의 **국소 문맥 윈도우**(유추는 잘하지만 전역 통계를 활용하지 못함).

**핵심 아이디어** — 공기 횟수 $X_{ij}$의 로그를 두 벡터의 내적으로 근사하는 가중 최소제곱 문제를 세운다.

$$
J = \sum_{i,j} f(X_{ij})\left(w_i^{\top}\tilde{w}_j + b_i + \tilde{b}_j - \log X_{ij}\right)^2
$$

출발점이 좋다. 의미 관계는 **확률의 비**에 나타난다는 관찰 — `ice`와 `steam`을 구분하는 것은 $P(\text{solid}\mid\text{ice})/P(\text{solid}\mid\text{steam})$ 같은 비율이라는 것 — 에서 이 형태를 유도한다. 가중치 $f$는 희소한 공기와 지나치게 빈번한 공기를 모두 눌러준다.

**의의** — 두 계열을 통합했다. 그리고 다음 논문이 보이듯, Word2Vec 역시 사실은 행렬 분해를 하고 있었다.

### 7. Neural Word Embedding as Implicit Matrix Factorization
**Levy, Goldberg (Bar-Ilan University) · NeurIPS, 2014**

> "신경망이라서 잘 되는 것"이라는 통념을 해체한 논문.

**배경** — Word2Vec은 성능이 좋았지만 **왜 좋은지가 설명되지 않았다.** 신경망의 마법으로 여겨지는 분위기가 있었다.

**핵심 아이디어** — SGNS(Skip-gram with Negative Sampling)의 목적함수를 정리하면, 최적해에서 두 벡터의 내적이 **shifted PMI**와 같아진다는 것을 보였다.

$$
v_w^{\top}v'_c = \text{PMI}(w,c) - \log k
$$

즉 SGNS는 **shifted PMI 행렬의 암묵적 분해**다. 신경망이 새로운 것을 발견한 것이 아니라 고전적 분포 의미론(count-based)을 효율적으로 근사하고 있었던 것이다. 저자들은 이 행렬을 직접 분해하는 SPPMI·SVD 방식도 제시해 일부 태스크에서 비슷하거나 더 나은 성능을 보였다.

**의의** — 개인적으로 이 시리즈에서 가장 인상적인 논문이었다. **경험적으로 잘 되는 방법의 정체를 수식으로 밝혀내는 작업**의 좋은 사례이고, 이후 임베딩 연구가 "무엇을 분해하고 있는가"라는 질문으로 정리되는 계기가 됐다.

### 8. Linguistic Regularities in Sparse and Explicit Word Representations
**Levy, Goldberg · CoNLL, 2014**

> `king - man + woman = queen`이 생각보다 덜 신비롭다는 것을 보인 논문.

**배경** — 벡터 산술로 유추가 풀린다는 관찰은 임베딩의 대표적 홍보 문구였다. 그런데 이 결과가 정확히 무엇을 보여주는지는 검토되지 않았다.

**핵심 아이디어** — 두 가지를 보였다.

1. **밀집 임베딩만의 성질이 아니다.** PPMI 기반의 희소·명시적 표현에서도 같은 유추가 상당 부분 성립한다.
2. **덧셈 방식(3CosAdd)은 한 항이 다른 항을 압도할 수 있다.** 대안으로 곱셈 기반 **3CosMul**을 제안했고 성능이 개선됐다.

$$
\hat{w} = \underset{w \in V \setminus \{a,\,a^*,\,b\}}{\arg\max}\ \cos\left(v_w,\ v_{a^*} - v_a + v_b\right)
$$

**짚어둘 점** — 표준 평가는 위 식처럼 **입력으로 쓴 세 단어를 후보에서 제외**한다. 이 조건을 빼면 `king - man + woman`의 최근접 이웃은 대개 `king` 자신이다. 즉 "성별 방향 벡터"라는 해석은 과장이고, 실제로는 원래 위치 근처에서 약간 기울어진 지점을 찾은 뒤 원본을 제외하는 것에 가깝다. 이후 Linzen(2016) 등이 이 문제를 더 체계적으로 지적했다.

## 3부. 시퀀스를 시퀀스로

### 9. Learning Phrase Representations using RNN Encoder-Decoder for SMT
**Cho, van Merriënboer, Bahdanau, Bengio 외 (Université de Montréal) · EMNLP, 2014**

> GRU가 처음 등장한 논문이자, Encoder-Decoder 구조를 정식화한 논문.

**배경** — 당시 기계번역의 주류는 통계 기반(SMT)이었고, 신경망은 그 안의 한 모듈로만 쓰였다.

**핵심 아이디어** — 두 개의 RNN을 붙여 가변 길이 시퀀스를 가변 길이 시퀀스로 매핑한다. Encoder가 입력을 고정 길이 벡터로 압축하고 Decoder가 그로부터 출력을 생성한다. 이 논문에서는 SMT의 구(phrase) 쌍 점수를 재계산하는 데 사용했다.

함께 제안된 것이 **GRU**다. LSTM의 게이트를 셋에서 둘(reset, update)로 줄이고 셀 상태와 은닉 상태를 통합해 파라미터를 약 3/4로 줄였다.

**의의** — Encoder-Decoder라는 틀 자체가 이후 번역·요약·대화의 공통 뼈대가 됐다. 다만 이 논문은 **고정 길이 벡터의 한계**를 이미 인식하고 있었고, 그 문제의식이 같은 그룹의 다음 논문(11번)으로 이어진다.

### 10. Sequence to Sequence Learning with Neural Networks
**Sutskever, Vinyals, Le (Google) · NeurIPS, 2014**

> 신경망만으로 기계번역이 가능하다는 것을 처음으로 설득력 있게 보인 논문.

**배경** — 9번과 같은 해, 같은 구조를 다루지만 목표가 달랐다. SMT의 보조 모듈이 아니라 **번역 전체를 신경망으로** 하려 했다.

**핵심 아이디어** — 4층 LSTM 인코더와 4층 LSTM 디코더. 여기에 실용적 트릭 하나가 유명하다. **입력 문장의 순서를 뒤집어서 넣는다.**

```text
원본:  A B C  →  α β γ
뒤집기: C B A  →  α β γ     (A와 α의 거리가 가까워진다)
```

문장 앞부분의 단어와 그 번역 사이의 거리가 줄어 최적화가 쉬워진다는 것이고, 이것만으로 BLEU가 눈에 띄게 올랐다.

**결과** — WMT'14 영어-프랑스어에서 앙상블 기준 BLEU 34.8. SMT 시스템의 1000-best 후보를 재점수화하면 36.5까지 올랐다.

**의의** — "충분히 큰 LSTM과 충분한 데이터면 된다"는 메시지가 이후 스케일 중심 접근의 초기 사례다. 동시에 **고정 길이 context vector의 병목**이라는 다음 문제를 뚜렷하게 남겼다.

## 4부. Attention의 등장

### 11. Neural Machine Translation by Jointly Learning to Align and Translate
**Bahdanau, Cho, Bengio · ICLR, 2015**

> Attention의 원점. 하나로 압축하지 말고 **매 시점 전체를 다시 보자**는 제안.

**배경** — Seq2Seq는 입력 길이와 무관하게 고정 차원 벡터 하나에 문장을 밀어 넣는다. 논문은 문장이 길어질수록 BLEU가 급격히 떨어지는 곡선을 제시하며 이 병목을 실증했다.

**핵심 아이디어** — 디코더의 각 시점 $i$마다 **서로 다른 context vector**를 만든다.

$$
c_i = \sum_{j=1}^{T_x}\alpha_{ij}h_j, \qquad
\alpha_{ij} = \frac{\exp(e_{ij})}{\sum_k \exp(e_{ik})}, \qquad
e_{ij} = v^{\top}\tanh(W s_{i-1} + U h_j)
$$

$\alpha_{ij}$는 "출력 $i$를 만들 때 입력 $j$를 얼마나 볼 것인가"이고, 이것이 곧 번역의 **정렬(alignment)** 에 해당한다. 제목의 "Jointly Learning to Align and Translate"가 이 뜻이다.

**의의** — 정렬을 별도로 감독하지 않았는데 학습된 $\alpha$가 사람이 보기에 그럴듯한 단어 대응을 보였다는 점이 강한 인상을 남겼다. 이 attention 시각화가 이후 해석 가능성 논의의 출발점이 됐다.

**짚어둘 점** — 이 시점의 attention은 **여전히 RNN 위에서 동작했고 병렬화되지 않았다.** 병렬화는 2년 뒤 recurrence를 제거하면서 얻어진다.

### 12. Effective Approaches to Attention-based Neural Machine Translation
**Luong, Pham, Manning (Stanford) · EMNLP, 2015**

> Attention을 **단순화**해서 Transformer로 가는 길을 연 논문.

**배경** — Bahdanau의 attention은 정렬 점수를 별도의 작은 신경망($\tanh$와 추가 파라미터)으로 계산했다. 표현력은 있지만 무겁다.

**핵심 아이디어** — 두 축으로 정리했다.

**① 점수 함수의 단순화**

| 방식 | 수식 | 파라미터 |
|---|---|---|
| dot | $s^{\top}h$ | **없음** |
| general | $s^{\top}Wh$ | 행렬 하나 |
| concat | $v^{\top}\tanh(W[s;h])$ | Bahdanau 방식 |

**② Global vs Local attention** — 전체 입력을 보는 대신 특정 위치 주변의 창만 보는 local attention을 제안했다.

여기에 **input feeding**(이전 시점의 attention 결과를 다음 입력에 함께 넣기)을 더해 WMT'15 영어-독일어에서 당시 SOTA를 기록했다.

**의의** — **파라미터 없는 dot-product attention**이 여기서 나왔다. 행렬곱 한 번으로 계산되어 GPU에서 압도적으로 빠르고, 이것이 2년 뒤 Transformer의 Scaled Dot-Product Attention으로 직결된다. Transformer 논문이 인용하는 attention 계보의 실질적 직계 조상이다.

## 정리

12편을 한 줄기로 놓으면 각 논문이 **직전 논문이 남긴 문제를 정확히 겨냥**하고 있다는 것이 보인다.

| 문제 | 해법 | 남긴 문제 |
|---|---|---|
| RNN이 장기 의존성을 못 배운다 (1994) | LSTM의 덧셈 갱신 (1997) | 셀 상태가 포화된다 |
| 셀 상태 포화 | Forget gate (2000) | — |
| One-hot은 의미를 못 담는다 | Word2Vec (2013) | 계산량 |
| 어휘 전체 softmax | Negative Sampling (2013) | 왜 되는지 모른다 |
| 원리 불명 | SGNS ≡ shifted PMI 분해 (2014) | 고정 벡터는 문맥을 못 담는다 |
| 길이가 다른 입출력 | Seq2Seq (2014) | 고정 context vector 병목 |
| 고정 벡터 병목 | Attention (2015) | 여전히 순차적 |
| 순차 처리 | **→ Transformer (2017)** | — |

개인적으로 두 편이 특히 기억에 남는다. **Levy & Goldberg(2014)** 는 잘 되는 방법의 정체를 밝히는 작업이 그 자체로 기여가 된다는 것을 보여주고, **Luong et al.(2015)** 은 표현력을 조금 포기하고 얻은 단순함이 결국 확장성으로 돌아온다는 것을 보여준다. 후자의 교훈은 내 관심사인 경량화 쪽에서도 반복적으로 나타나는 패턴이라 흥미로웠다.

다음 글에서는 이 계보가 도달한 지점 — Transformer와 그 위에서 열린 사전학습 시대 6편을 다룬다.

---

관련 글: [SKALA LLM 1일차 — 표현학습의 계보와 Transformer 정독](/posts/skala-transformer-day1/)

다음 글: [Transformer와 사전학습 시대 6편](/posts/paper-review-transformer/)
