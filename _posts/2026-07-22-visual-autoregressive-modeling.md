---
title: "[논문 리뷰] Visual Autoregressive Modeling: Next-Scale Prediction"
date: 2026-07-22 00:10:00 +0900
layout: post
permalink: /posts/visual-autoregressive-modeling/
categories:
  - AI
  - Paper Review
tags: [paper-review, autoregressive-model, image-generation, next-scale-prediction, vqvae, transformer]
math: true
related: [pixeldit, dit-3d, dl-foundational-roadmap]
paper:
  authors: "Keyu Tian, Yi Jiang, Zehuan Yuan, Bingyue Peng, Liwei Wang"
  venue: "NeurIPS 2024"
  url: "https://proceedings.neurips.cc/paper_files/paper/2024/hash/9a24e284b187f662681440ba15c416fb-Abstract-Conference.html"
---

> 이 글은 개인 Obsidian에 작성했던 논문 노트를 블로그 형식으로 다시 편집한 글이다. 논문의 핵심인 next-scale prediction과 기존 next-token 방식의 차이에 집중한다.

## 세 줄 요약

1. VAR은 이미지 autoregressive generation의 단위를 개별 토큰이 아닌 **해상도별 token map**으로 바꾼다.
2. 낮은 해상도의 전체 구조에서 높은 해상도의 세부 묘사로 진행하는 coarse-to-fine 생성을 수행한다.
3. 한 scale 안의 토큰을 병렬 생성함으로써 raster-scan 방식의 긴 순차 생성 비용을 줄인다.

![VAR 생성 결과와 다양한 응용](/assets/img/posts/visual-autoregressive-modeling/var-overview.png)
_VAR의 이미지 생성 및 zero-shot 응용 예시. 그림 출처: VAR 논문._

## 이미지에 “다음 토큰”을 적용할 때 생기는 문제

언어 autoregressive model은 앞서 등장한 토큰을 조건으로 다음 토큰을 예측한다.

$$
p(x_1, \dots, x_T)
= \prod_{t=1}^{T} p(x_t \mid x_1, \dots, x_{t-1})
$$

이미지는 본질적으로 연속적인 2차원 신호이므로, 이 방식을 적용하려면 먼저 이미지를 discrete token으로 바꾸고 1차원 순서를 부여해야 한다. VQGAN과 같은 quantized autoencoder는 이미지를 feature map으로 인코딩한 뒤 각 위치를 codebook의 가장 가까운 항목으로 치환한다.

$$
f = \mathcal{E}(I), \qquad q = \mathcal{Q}(f)
$$

기존 visual AR model은 2차원 token grid를 raster-scan 순서로 평탄화한다. 구현은 직관적이지만 몇 가지 문제가 생긴다.

- 인접한 2차원 토큰이 1차원 sequence에서는 멀리 떨어질 수 있다.
- 이미지에는 언어처럼 자연스럽고 유일한 읽기 순서가 없다.
- 생성이 토큰 단위로 순차 진행되어 해상도가 커질수록 느려진다.
- 이미 알고 있는 아래쪽 영역을 조건으로 위쪽을 채우는 작업처럼, 고정된 생성 순서와 맞지 않는 문제를 다루기 어렵다.

VAR은 “이미지를 어떤 순서로 생성할 것인가?”라는 질문에 공간적인 순서가 아니라 **해상도의 순서**로 답한다.

## Next-scale prediction

VAR은 feature map을 서로 다른 해상도를 가진 $K$개의 token map으로 양자화한다.

$$
R = (r_1, r_2, \dots, r_K),
\qquad r_k \in [V]^{h_k \times w_k}
$$

$r_1$은 가장 거친 구조를 담고, 뒤로 갈수록 해상도가 증가한다. 마지막 $r_K$는 원래 latent feature map과 같은 해상도를 가진다. 결합확률은 scale 단위로 다음처럼 분해된다.

$$
p(r_1, r_2, \dots, r_K)
= \prod_{k=1}^{K} p(r_k \mid r_1, r_2, \dots, r_{k-1})
$$

중요한 차이는 $r_k$ 안의 모든 토큰을 한 번에 예측한다는 점이다. Autoregressive dependency는 scale 사이에만 존재하고, 같은 scale의 위치들은 병렬로 생성할 수 있다.

![Multi-scale VQVAE와 VAR Transformer의 두 단계 학습](/assets/img/posts/visual-autoregressive-modeling/var-training.png)
_1단계에서는 multi-scale tokenizer를, 2단계에서는 token map을 예측하는 VAR Transformer를 학습한다. 그림 출처: VAR 논문._

이 방식은 사람이 그림을 그릴 때 전체 구도를 잡은 뒤 세부 묘사를 더하는 과정과 비슷하다. 또한 2차원 token map을 한 줄로 평탄화하지 않으므로 각 scale 안에서 공간 구조를 유지할 수 있다.

## Multi-scale tokenizer

VAR은 VQGAN 계열 autoencoder를 기반으로 하지만, 하나의 token map 대신 여러 해상도의 token map을 만든다. 각 단계에서는 현재 남아 있는 feature residual을 해당 해상도로 축소해 양자화하고, codebook embedding을 다시 최고 해상도로 보간한 뒤 residual에서 제거한다.

![Multi-scale VQVAE encoding과 reconstruction 알고리즘](/assets/img/posts/visual-autoregressive-modeling/multiscale-vqvae-algorithm.png)
_여러 scale의 token map을 만드는 encoding과 이를 누적해 이미지를 복원하는 과정. 그림 출처: VAR 논문._

모든 scale은 같은 codebook을 공유한다. 복원 시에는 각 scale의 code embedding을 최고 해상도로 보간하고 누적하여 feature map을 만든 뒤 decoder로 이미지를 재구성한다. 독립적인 이미지 피라미드라기보다, 앞 단계가 설명하지 못한 정보를 다음 단계가 보충하는 residual quantization에 가깝다.

## VAR Transformer

Transformer는 이전 scale의 token map들을 조건으로 다음 scale을 예측한다. 학습할 때는 block-wise causal mask를 사용해 $r_k$가 $r_{leq k}$의 정보만 볼 수 있도록 제한한다. 같은 scale의 token은 병렬 예측한다.

논문은 복잡한 전용 구조 대신 decoder-only Transformer와 Adaptive Layer Normalization을 사용한다. 이를 통해 성능 향상의 주된 원인이 특별한 backbone보다 next-scale이라는 학습 패러다임에 있음을 보이려 한다.

## 계산 효율성

latent resolution이 $n \times n$이라면 raster-scan AR은 $n^2$개의 토큰을 순서대로 생성해야 한다. Self-attention 비용까지 고려하면 전체 계산량이 매우 빠르게 커진다. 반면 VAR은 scale의 수만큼만 순차적으로 진행하고, 각 scale 내부는 병렬 처리한다.

논문은 기존 raster-scan 방식의 전체 계산량을 $\mathcal{O}(n^6)$, VAR을 $\mathcal{O}(n^4)$로 분석한다. 실제 속도는 구현, token schedule, KV cache 등에 좌우되지만, 순차 단계가 “토큰 수”에서 “scale 수”로 바뀐다는 구조적 차이는 분명하다.

## 실험에서 확인한 것

저자들은 ImageNet 256×256과 512×512 class-conditional generation에서 기존 visual AR model과 diffusion model을 비교했다. 논문이 강조하는 결과는 다음과 같다.

- Next-token AR baseline보다 FID와 Inception Score가 크게 개선됐다.
- 큰 모델에서도 성능 향상이 이어지는 power-law scaling 경향을 확인했다.
- Inpainting, outpainting, image editing에서 별도의 task-specific 학습 없이 활용 가능성을 보였다.
- 같은 실험 설정의 DiT 계열과 비교해 생성 품질과 추론 속도에서 경쟁력 있는 결과를 보였다.

여기서 “diffusion보다 우수하다”는 결론은 논문의 특정 ImageNet class-conditional 설정 안에서 이해해야 한다. Text-to-image 전체 생태계나 다양한 데이터셋에서 모든 diffusion model보다 우수하다는 의미로 일반화할 수는 없다.

## 한계와 생각해볼 점

VAR의 성능은 multi-scale tokenizer가 제공하는 discrete representation에 크게 의존한다. Tokenizer가 세부 정보를 잃으면 Transformer가 이를 복구하기 어렵고, codebook 설계와 reconstruction 품질이 전체 생성 성능의 상한이 된다.

또한 next-scale generation이 raster-scan보다 병렬적이더라도, 고해상도 scale의 self-attention 비용은 여전히 크다. Text-conditioned generation이나 video generation으로 확장할 때는 조건 주입 방법, 더 긴 시공간 의존성, tokenizer의 효율성을 함께 해결해야 한다.

그럼에도 VAR의 가장 흥미로운 지점은 새로운 backbone이 아니라 문제 정의를 바꿨다는 데 있다. 언어의 순서를 이미지에 그대로 강요하는 대신, 이미지에 더 자연스러운 coarse-to-fine 순서를 autoregressive factorization으로 가져왔다.

논문: [Visual Autoregressive Modeling: Scalable Image Generation via Next-Scale Prediction (NeurIPS 2024)](https://proceedings.neurips.cc/paper_files/paper/2024/hash/9a24e284b187f662681440ba15c416fb-Abstract-Conference.html)
