---
title: "[논문 리뷰] PixArt-α: Fast Training of Diffusion Transformer for Photorealistic Text-to-Image Synthesis"
date: 2026-08-17 20:30:00 +0900
permalink: /posts/pixart-alpha/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion-transformer, text-to-image, efficient-training, multimodal]
description: "텍스트-이미지 학습을 세 단계로 분해하고 adaLN-single과 고밀도 캡션을 결합해 학습 비용을 줄인 PixArt-α의 설계와 비용 수치를 정리한다."
related: [dit, ldm, sd3]
paper:
  authors: "Junsong Chen, Jincheng Yu, Chongjian Ge, Lewei Yao, Enze Xie, Yue Wu, Zhongdao Wang, James Kwok, Ping Luo, Huchuan Lu, Zhenguo Li"
  venue: "ICLR 2024"
  url: "https://openreview.net/forum?id=eAKmQPe3m1"
---

> 이 글은 개인 Obsidian에 정리해 둔 논문 노트를 블로그 형식으로 다시 편집한 글이다. 학습 비용을 줄이기 위한 3단계 분해와 파라미터를 공유하는 adaLN-single 설계에 초점을 맞춘다.

## 세 줄 요약

PIXART-α는 텍스트-이미지 생성 학습을 픽셀 의존성, 텍스트-이미지 정렬, 미적 품질의 세 단계로 분해한다. 여기에 Cross-attention을 추가한 DiT와 블록 간 파라미터를 공유하는 adaLN-single, LLaVA로 만든 고밀도 캡션을 결합한다. 그 결과 25M장의 학습 이미지와 환산 기준 753 A100 GPU days를 사용해 MSCOCO zero-shot FID-30K 7.32를 기록했다.

## 이 논문이 풀려는 문제

대규모 텍스트-이미지 생성 모델의 성능을 높이는 가장 직접적인 방법은 모델, 데이터, 학습 계산량을 함께 키우는 것이다. 그러나 이 경로는 비용이 매우 크다. 논문이 비교한 기존 모델들은 수천에서 수만 A100 GPU days를 사용하며, 최대 학습 비용은 $3,080,000, 이산화탄소 배출량은 35톤에 이른다.

비용 문제는 모델 크기만의 문제가 아니다. 기존 텍스트-이미지 데이터셋에는 정보 밀도가 낮은 캡션과 이미지 내용에 맞지 않는 캡션이 포함될 수 있다. 이런 데이터에서는 모델이 이미지와 언어의 대응 관계를 배우기 위해 수백만 회 이상의 반복을 수행해야 한다. 같은 연산을 쓰더라도 한 캡션에서 얻을 수 있는 감독 신호가 적다면 데이터 효율도 함께 낮아진다.

내가 보기에 PIXART-α의 출발점은 “더 큰 모델을 더 오래 학습한다”가 아니라 “현재 학습 과정에서 서로 다른 문제들이 왜 한꺼번에 풀리고 있는가”라는 질문이다. 텍스트-이미지 생성에는 적어도 다음 세 문제가 섞여 있다.

1. 자연 이미지 내부의 픽셀 의존성을 학습해야 한다.
2. 텍스트의 개념과 이미지 영역을 정렬해야 한다.
3. 생성 결과를 사람이 선호하는 미적 분포로 옮겨야 한다.

이 세 목표는 필요한 데이터도 다르다. 픽셀 구조를 배우는 데는 이미지 중심 데이터가 필요하고, 정렬을 배우는 데는 설명이 자세한 이미지-텍스트 쌍이 필요하며, 미적 품질을 높이려면 고품질 이미지가 필요하다. PIXART-α는 이를 하나의 거대한 혼합 데이터셋에 맡기지 않고 단계별로 분리한다.

아키텍처 측면에서는 DiT(Diffusion Transformer)의 이미지 모델링 능력을 유지하면서 텍스트 조건을 넣어야 한다. 단순히 모듈을 추가하면 사전 학습 가중치가 표현하던 함수를 처음부터 흔들 수 있고, 기존 adaLN 구조를 그대로 유지하면 조건 분기에 상당한 파라미터가 들어간다. 논문은 이 두 문제를 Cross-attention 출력 projection의 0 초기화와 adaLN-single의 재매개변수화(re-parameterization)로 다룬다.

## 핵심 아이디어: 학습할 문제를 순서대로 분리한다

PIXART-α의 전체 학습은 다음 세 단계로 구성된다.

| 단계 | 주된 학습 목표 | 데이터 |
|---|---|---|
| Pixel dependency | 자연 이미지의 픽셀 의존성 | ImageNet 1M |
| Text-Image align | 텍스트와 이미지의 정렬 | SAM-LLaVA 10M |
| High aesthetics | 이미지의 미적 품질 | JourneyDB 4M + 내부 데이터 10M |

첫 단계에서는 1M장의 ImageNet 이미지로 자연 이미지의 구조를 학습한다. 두 번째 단계에서는 LLaVA가 자세한 캡션을 생성한 10M장의 SAM 데이터로 텍스트-이미지 대응을 학습한다. 세 번째 단계에서는 JourneyDB 4M과 내부 데이터 10M을 합친 14M장의 고품질 데이터로 생성 분포를 미적 품질이 높은 쪽으로 이동시킨다.

이 분해의 핵심은 각 단계가 이전 단계의 표현을 버리지 않는다는 데 있다. 이미지 구조를 이미 학습한 모델에 Cross-attention을 붙일 때 새 분기의 초기 출력을 0으로 만들고, adaLN-single도 기존 DiT의 조건 출력을 재현하도록 초기화한다. 즉, 새 기능을 추가하면서 초기 함수는 가능한 한 이전 모델과 같게 만든다.

이 전략에는 분명한 트레이드오프도 있다. 단계별 데이터와 해상도 일정을 별도로 설계해야 하고, 앞 단계에서 만들어진 편향이 뒤 단계로 전달될 수 있다. 반대로 한 단계가 담당할 목표가 좁아지므로, 정렬을 위해 픽셀 구조까지 반복해서 다시 배우는 연산을 줄일 수 있다.

![PIXART-α와 기존 모델의 데이터 소모량, 학습 비용 및 이산화탄소 배출량 비교](/assets/img/posts/pixart-alpha/figure2.png){: w="700" }
_그림 2. PIXART-α가 줄이려는 것은 파라미터 수 하나가 아니라 데이터, 학습 계산량, 환경 비용이 연결된 전체 학습 비용이다._

## 모델 구조: DiT를 텍스트 조건 모델로 바꾸기

PIXART-α의 베이스 네트워크는 patch size 2와 28개의 Transformer block을 사용하는 DiT-XL/2다. 이미지와 텍스트가 모델에 들어오는 경로는 서로 다르며, 각 Transformer block의 Cross-attention에서 합쳐진다.

### 이미지 경로

입력 이미지는 동일한 크기로 resize한 뒤 center-crop한다. 이후 사전 학습된 LDM의 VAE로 잠재 특징을 추출한다. VAE 가중치는 고정되어 있으므로 PIXART-α의 학습 비용은 새로운 이미지 압축기를 함께 학습하는 비용이 아니라 잠재 공간 위의 생성 모델을 학습하는 비용이다.

잠재 특징을 $z\in\mathbb{R}^{B\times C_z\times H_z\times W_z}$라고 두자. Patch size가 2이므로 공간축을 패치로 나눈 뒤 Transformer에 들어가는 토큰 수는 개념적으로 다음과 같다.

$$
N=\frac{H_z}{2}\frac{W_z}{2}.
$$

패치 임베딩 이후 이미지 토큰을 $X\in\mathbb{R}^{B\times N\times D}$로 둘 수 있다. 여기서 구체적인 잠재 채널 수와 hidden size는 추출본에 제시되지 않았으므로 기호로 남기는 편이 안전하다.

### 텍스트 경로

텍스트 인코더는 4.3B 파라미터의 Flan-T5-XXL이다. 기존 77 토큰 대신 최대 120 토큰을 사용한다. 캡션을 자세하게 만들어 놓고 입력 길이를 77로 유지하면 뒤쪽 정보가 모델에 들어가지 못할 수 있으므로, 고밀도 캡션과 긴 토큰 길이는 하나의 설계로 읽어야 한다.

텍스트 특징을 $Y\in\mathbb{R}^{B\times L\times D_t}$라고 쓰면 $L\leq120$이다. 이미지 토큰 $X$는 각 블록의 self-attention을 통과한 뒤 이 텍스트 특징과 Cross-attention으로 결합되고, 그 다음 feed-forward layer로 전달된다.

### Timestep embedding

확산 timestep $t$는 먼저 256차원 frequency embedding으로 변환된다. 이어서 SiLU 활성화를 포함한 2층 MLP가 이를 Transformer hidden size에 맞는 표현으로 바꾼다.

$$
e_t=\operatorname{FreqEmbed}_{256}(t),
$$

$$
S=f(t)=\operatorname{MLP}_{2\text{-layer}}(e_t).
$$

첫 식은 스칼라 또는 timestep 인덱스를 주기적 특징 공간으로 옮기는 단계이고, 두 번째 식은 그 특징을 Transformer가 사용하는 hidden space에 맞추는 단계다. 구현할 때 256차원 frequency embedding과 최종 hidden-size embedding을 같은 텐서라고 생각하면 shape가 맞지 않는다.

### Cross-attention을 0에서 시작하는 이유

Cross-attention layer는 각 Transformer block에서 self-attention과 feed-forward layer 사이에 놓인다. 이미지 토큰이 query 역할을 하고 텍스트 특징이 조건 정보로 들어가는 구조로 이해할 수 있다. 중요한 초기화는 Cross-attention의 출력 projection layer를 0으로 만드는 것이다.

Cross-attention 분기의 출력을 개념적으로 $C_i(X,Y)$라고 하면, 출력 projection이 0인 초기 시점에는 다음 관계가 성립한다.

$$
C_i(X,Y)\approx 0.
$$

따라서 Cross-attention을 새로 삽입해도 초기 네트워크가 기존 이미지 모델의 출력에서 크게 벗어나지 않는다. 학습이 진행되면서 출력 projection이 0에서 벗어나면 텍스트 조건의 영향이 점차 생긴다.

여기서 0으로 초기화해야 하는 대상은 Cross-attention 전체가 아니라 출력 projection layer다. 블록 전체를 0으로 만들거나 기존 self-attention 가중치를 다시 초기화하면 사전 학습 가중치를 보존하려는 목적과 맞지 않는다.

## adaLN-single: 레이어별 조건 분기를 공유 함수로 바꾸기

기존 adaLN의 선형 projection은 전체 파라미터의 27%를 차지했다. PIXART-α는 각 Transformer block마다 timestep 조건 함수를 별도로 두는 대신, 모든 블록이 공유하는 전역 함수 $f$를 사용한다.

먼저 첫 번째 블록에서 timestep 조건을 한 번 계산한다.

$$
S=f(t).
$$

그 다음 레이어 $i$에는 학습 가능한 레이어별 임베딩 $E^{(i)}$만 둔다.

$$
S^{(i)}=g\left(S,E^{(i)}\right).
$$

이 표기에서 각 항의 역할은 분명하다.

- $S$는 모든 블록이 공유하는 timestep 조건이다.
- $E^{(i)}$는 같은 timestep에서도 블록마다 다른 조절 값을 만들기 위한 레이어 식별 정보다.
- $g$는 공유 조건과 레이어별 임베딩을 결합해 해당 블록이 사용할 조건 $S^{(i)}$를 만든다.

$E^{(i)}$를 제거하면 모든 블록이 같은 조건 표현만 받게 되어 레이어별 역할 차이를 표현하기 어려워진다. 반대로 $S$를 블록마다 독립적으로 다시 계산하면 기존 adaLN처럼 파라미터와 계산이 반복된다. adaLN-single은 공유할 부분과 레이어마다 남겨야 할 부분을 분리한다.

이 변경으로 모델 파라미터는 833M에서 611M으로 222M 감소한다. 논문이 보고한 감축률은 26%다. 구조 ablation의 GPU 메모리도 기존 adaLN 29G에서 adaLN-single 23G로 줄었다.

### 재매개변수화가 필요한 이유

공유 함수를 도입하는 것만으로는 기존 DiT와 같은 초기 함수를 보장할 수 없다. 무작위로 초기화된 $E^{(i)}$는 학습 첫 시점부터 각 블록의 조건을 바꾸기 때문이다.

논문은 선택한 timestep $t=500$과 class condition이 없는 설정에서 기존 DiT의 레이어별 조건 출력이 재현되도록 $E^{(i)}$를 초기화한다. 기존 DiT의 레이어 $i$ 출력을 $S_{\text{DiT}}^{(i)}$라고 쓰면 초기화 조건은 다음과 같이 정리할 수 있다.

$$
g\left(f(500),E^{(i)}\right) =
S_{\text{DiT}}^{(i)}(500,\text{no class condition}).
$$

이 식은 새로운 학습 목적을 추가한 것이 아니라 초기 파라미터가 만족해야 할 호환성 조건이다. $f$가 공유되어 자유도가 줄어든 부분을 $E^{(i)}$가 보정하도록 초기값을 잡는다. 그러면 adaLN-single로 구조를 바꾼 직후에도 선택한 기준점에서는 기존 DiT와 같은 조건을 만들 수 있다.

왜 기준 timestep으로 정확히 500을 선택했는지는 추출본에서 확인되지 않는다. 따라서 이 값을 일반적인 최적점이라고 확대 해석해서는 안 된다. 확인 가능한 주장은 $t=500$에서 기존 class-condition 없는 DiT와 같은 $S^{(i)}$가 나오도록 초기화했다는 것까지다.

![PIXART-α 전체 아키텍처와 공유 파라미터를 사용하는 adaLN-single](/assets/img/posts/pixart-alpha/figure4.png){: w="700" }
_그림 4. 이미지 토큰과 텍스트 특징은 블록별 Cross-attention에서 결합되고, timestep 조건은 한 번 계산한 전역 표현과 레이어별 임베딩으로 구성된다._

## 고밀도 캡션이 정렬 학습을 바꾸는 방식

PIXART-α는 LLaVA에 다음 프롬프트를 사용해 캡션을 생성한다.

> Describe this image and its style in a very detailed manner

LAION과 SAM에는 서로 다른 입력 형식을 사용한다. 세부 입력 템플릿은 추출본에 포함되지 않았지만, 두 데이터 소스에 완전히 같은 입력 구성을 적용한 것은 아니라는 점은 구현 재현 시 확인해야 한다.

논문은 캡션의 정보 밀도를 명사 통계로 비교한다.

| Dataset | VN/DN | Total Noun | Average |
|---|---:|---:|---:|
| LAION | 210K/2461K = 8.5% | 72.0M | 6.4/Img |
| LAION-LLaVA | 85K/646K = 13.3% | 233.9M | 20.9/Img |
| SAM-LLaVA | 23K/124K = 18.6% | 327.9M | 29.3/Img |
| Internal | 152K/582K = 26.1% | 136.6M | 12.2/Img |

LAION에 LLaVA 캡션을 적용하면 이미지당 평균 명사 수가 6.4에서 20.9로 늘고, 총 명사 수도 72.0M에서 233.9M으로 증가한다. SAM-LLaVA는 이미지당 평균 29.3개와 총 327.9M으로 가장 높은 값을 보인다. Internal 데이터는 이미지당 평균 명사 수가 12.2지만 VN/DN 비율은 26.1%로 표에서 가장 높다.

VN과 DN의 정확한 정의는 추출본에 들어 있지 않으므로 그 의미를 임의로 확장해서는 안 된다. 이 표에서 안전하게 읽을 수 있는 결론은 LLaVA 캡션이 원래 LAION 캡션보다 더 많은 명사 정보를 제공하며, SAM-LLaVA가 정렬 단계에 높은 정보 밀도의 감독 신호를 제공한다는 것이다.

다만 명사 수가 많다는 사실만으로 정렬 성능의 인과관계가 완전히 증명되는 것은 아니다. PIXART-α의 정렬 결과에는 Transformer 구조, 4.3B 텍스트 인코더, 120 토큰 길이와 단계별 학습도 함께 작용한다. 명사 통계는 고밀도 캡션이라는 설계의 근거이지, 다른 구성 요소를 통제한 단독 효과량은 아니다.

## 구현 관점에서 본 학습 루프

추출본에는 확산 목적함수의 구체적인 예측 대상, timestep sampling 분포, 노이즈 스케줄이 제시되지 않았다. 따라서 그 부분을 특정 수식이나 라이브러리 호출로 채우면 재현 코드가 아니라 추측이 된다. 아래 의사코드는 확인 가능한 단계 구성, 텐서 흐름, 초기화 조건만 표현한다.

```python
# 의사코드: 구체적인 diffusion objective와 noise schedule은 추출본에 없음

stage_configs = [
    {
        "name": "pixel_dependency",
        "dataset": "ImageNet-1M",
        "resolution": (256, 256),
        "steps": 300_000,
        "batch_notation": "128x8",
    },
    {
        "name": "text_image_align",
        "dataset": "SAM-LLaVA-10M",
        "resolution": (256, 256),
        "steps": 150_000,
        "batch_notation": "178x64",
    },
    {
        "name": "high_aesthetics_256",
        "dataset": "HQ-14M",
        "resolution": (256, 256),
        "steps": 90_000,
        "batch_notation": "178x64",
    },
    {
        "name": "high_aesthetics_512",
        "dataset": "HQ-14M",
        "resolution": (512, 512),
        "steps": 100_000,
        "batch_notation": "40x64",
    },
    {
        "name": "high_aesthetics_1024",
        "dataset": "HQ-14M",
        "resolution": (1024, 1024),
        "steps": 16_000,
        "batch_notation": "12x32",
    },
]

optimizer = AdamW(
    model.parameters(),
    learning_rate=2e-5,
    weight_decay=0.03,
)

for stage in stage_configs:
    for images, captions in stage.dataset:
        # images: (B, C, H, W)
        images = resize_and_center_crop(images, stage.resolution)

        # z: (B, C_z, H_z, W_z), VAE weights are frozen
        z = frozen_vae_encode(images)

        # text_features: (B, L, D_t), L <= 120
        text_features = flan_t5_xxl_encode(
            captions,
            max_tokens=120,
        )

        # t: (B,)
        t = select_diffusion_timestep()

        # 정확한 objective, 예측 대상, noise schedule은 이 추출본에서 확정할 수 없음
        loss = diffusion_training_objective(
            model=model,
            latent=z,
            text_condition=text_features,
            timestep=t,
        )

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
```

`batch_notation`은 Table 4에 적힌 값을 그대로 보존했다. 예를 들어 `178×64`에서 각 항이 정확히 무엇을 뜻하는지는 추출본에 정의되어 있지 않으므로 이를 장치당 배치와 GPU 수로 단정하지 않았다.

모델 내부의 조건 흐름은 다음처럼 쓸 수 있다.

```python
def pixart_transformer(latent_tokens, text_features, timestep):
    # latent_tokens: (B, N, D)
    # text_features: (B, L, D_t)
    # timestep: (B,)

    # (B,) -> (B, 256)
    timestep_frequency = frequency_embedding(timestep, dim=256)

    # (B, 256) -> (B, D)
    shared_condition = two_layer_mlp_with_silu(timestep_frequency)

    x = latent_tokens
    for i in range(28):
        # E[i]: 레이어별 학습 가능 임베딩
        # condition_i의 마지막 차원 구성은 추출본에 명시되지 않음
        condition_i = g(shared_condition, E[i])

        # Cross-attention은 self-attention과 feed-forward 사이에 위치
        x = self_attention_part(x, condition_i)
        x = cross_attention_part(x, text_features)
        x = feed_forward_part(x, condition_i)

    return x
```

`shared_condition`은 한 번만 계산하지만 `condition_i`는 28개 블록마다 달라야 한다. 이를 잘못 구현해 $E^{(i)}$까지 공유하면 adaLN-single이 유지하려던 레이어별 차이가 사라진다.

### 초기화 순서

구조를 옮길 때는 다음 두 초기화가 구분되어야 한다.

```python
# 의사코드

for block in transformer_blocks:
    zero_initialize(block.cross_attention.output_projection)

reference_timestep = 500

for i, block in enumerate(transformer_blocks):
    E[i] = initialize_to_match_original_dit_condition(
        shared_condition=f(reference_timestep),
        original_condition=original_dit_condition(
            layer_index=i,
            timestep=reference_timestep,
            class_condition=None,
        ),
    )
```

첫 번째 초기화는 새 Cross-attention 분기의 초기 기여를 0으로 만든다. 두 번째 초기화는 공유 adaLN 구조가 기존 DiT의 레이어별 조건을 재현하도록 한다. 둘 다 사전 학습 함수 보존을 목표로 하지만 대상 모듈이 다르다.

### Multi-scale training

Multi-scale training은 High aesthetics 단계에서만 사용된다. 이미지의 가로세로 비율 0.25부터 4까지를 40개 버킷으로 나누고, 하나의 배치는 같은 버킷 크기의 이미지로 구성한다. 해상도나 비율이 달라질 때는 DiffFit positional encoding을 사용한다.

```python
# High aesthetics 단계에서만 수행하는 의사코드

aspect_ratio_buckets = make_40_buckets(min_ratio=0.25, max_ratio=4.0)

for bucket in aspect_ratio_buckets:
    batch = sample_same_bucket_images(bucket)
    positional_encoding = difffit_positional_encoding(
        resolution=batch.resolution,
        aspect_ratio=bucket.aspect_ratio,
    )
    train_step(batch, positional_encoding)
```

같은 배치에 서로 다른 공간 shape를 그대로 섞지 않는 것이 핵심이다. 또한 이 버킷 로직을 Pixel dependency나 Text-Image align 단계까지 확장하는 것은 논문 설정과 다르다.

### 샘플링 루프

논문은 iDDPM, DPM-Solver, SA-Solver를 비교하고 연산 효율성을 고려해 20단계 DPM-Solver를 선택했다. 학습 단계 수와 샘플링 단계 수는 같은 종류의 숫자가 아니다. 수십만 학습 step을 수행한 뒤, 추론 시에는 한 이미지를 생성하기 위해 20단계 solver를 사용한다.

```python
# 의사코드: solver의 세부 갱신식과 초기 상태 분포는 추출본에 없음

text_features = flan_t5_xxl_encode(prompt, max_tokens=120)
state = initialize_sampler_state(output_shape)

for solver_step in dpm_solver_schedule(num_steps=20):
    model_output = pixart_model(
        latent=state,
        timestep=solver_step.timestep,
        text_condition=text_features,
    )
    state = dpm_solver_update(state, model_output, solver_step)

image = frozen_vae_decode(state)
```

“20단계”를 곧바로 정확히 20회의 네트워크 평가라고 해석할 수 있는지는 추출본에서 확인되지 않는다. 재현 시에는 사용한 DPM-Solver 구성의 함수 평가 횟수까지 별도로 확인해야 한다.

### 구현에서 특히 확인할 지점

- VAE 입력 전처리는 동일 크기 resize와 center-crop이다.
- VAE 가중치는 고정한다.
- 텍스트 최대 길이는 77이 아니라 120이다.
- Timestep은 256차원 frequency embedding을 거친 뒤 2층 MLP로 hidden size에 맞춘다.
- Cross-attention은 self-attention과 feed-forward 사이에 둔다.
- 0 초기화 대상은 Cross-attention의 출력 projection layer다.
- 공유 조건 $S=f(t)$는 한 번만 계산하고, 28개 레이어에는 서로 다른 $E^{(i)}$를 적용한다.
- 재매개변수화 기준은 $t=500$과 class condition이 없는 기존 DiT다.
- Multi-scale의 40개 버킷과 DiffFit positional encoding은 High aesthetics 단계에서만 사용한다.
- 256, 512, 1024 해상도별 학습 step과 배치 표기가 서로 다르다.
- 논문이 보고한 비용에는 오프라인 VAE/T5 feature extraction이 포함되지 않는다.
- 추출본에 없는 노이즈 스케줄, objective parameterization, timestep 경계 처리, clipping 위치를 임의로 정하면 논문 구현과 같다고 주장할 수 없다.

## 단계별 학습 설정과 비용

각 학습 단계의 상세 설정은 다음과 같다.

| Stage | Image Resolution | #Images | Training Steps (K) | Batch Size | Learning Rate | GPU days (V100) |
|---|---:|---:|---:|---:|---:|---:|
| Pixel dependency | 256×256 | 1M ImageNet | 300 | 128×8 | $2\times10^{-5}$ | 88 |
| Text-Image align | 256×256 | 10M SAM | 150 | 178×64 | $2\times10^{-5}$ | 672 |
| High aesthetics | 256×256 | 14M HQ | 90 | 178×64 | $2\times10^{-5}$ | 416 |
| High aesthetics | 512×512 | 14M HQ | 100 | 40×64 | $2\times10^{-5}$ | 320 |
| High aesthetics | 1024×1024 | 14M HQ | 16 | 12×32 | $2\times10^{-5}$ | 160 |

모든 단계의 learning rate는 $2\times10^{-5}$다. Optimizer는 AdamW이고 weight decay는 0.03이다.

V100 GPU days를 합하면 1,656이다. 최종 모델은 64 V100에서 약 26일 동안 학습했다. 논문은 V100 대비 2.2배 속도 향상을 가정해 이를 753 A100 GPU days와 약 $28,400의 비용으로 환산한다. Transformer에서 5배 속도 향상을 가정하는 별도 기준에서는 332 A100 GPU days가 된다.

해상도가 256에서 512, 1024로 올라갈수록 표의 batch size는 `178×64`, `40×64`, `12×32`로 감소한다. 고해상도 단계의 step 수 역시 마지막 1024 해상도에서는 16K다. 이 일정은 고해상도 학습 비용을 제어하는 장치로 읽을 수 있지만, 각 해상도 단계가 최종 품질에 기여한 독립 효과는 추출본에 제시되지 않았다.

## 정량 결과: 적은 데이터와 계산량으로 어디까지 갔는가

MSCOCO zero-shot FID-30K 비교는 다음과 같다. FID는 낮을수록 좋다.

| Method | Type | #Params | #Images | FID-30K↓ | GPU days |
|---|---|---:|---:|---:|---:|
| DALL·E | Diff | 12.0B | 250M | 27.50 | - |
| GLIDE | Diff | 5.0B | 250M | 12.24 | - |
| LDM | Diff | 1.4B | 400M | 12.64 | - |
| DALL·E 2 | Diff | 6.5B | 650M | 10.39 | 41,667 A100 |
| SDv1.5 | Diff | 0.9B | 2000M | 9.62 | 6,250 A100 |
| GigaGAN | GAN | 0.9B | 2700M | 9.09 | 4,783 A100 |
| Imagen | Diff | 3.0B | 860M | 7.27 | 7,132 A100 |
| RAPHAEL | Diff | 3.0B | 5000M+ | 6.61 | 60,000 A100 |
| PIXART-α | Diff | 0.6B | 25M | 7.32 | 753 A100 |

PIXART-α의 FID 7.32는 이 표에서 RAPHAEL의 6.61과 Imagen의 7.27보다는 높고, 나머지 모델보다는 낮다. 따라서 FID 하나에서 최고라고 표현하기보다는, 25M장의 이미지와 0.6B 모델로 대규모 모델에 가까운 결과를 냈다고 읽는 편이 정확하다.

데이터 규모 차이는 특히 크다. SDv1.5는 2000M, GigaGAN은 2700M, RAPHAEL은 5000M+ 이미지를 사용한 것으로 표에 적혀 있다. PIXART-α는 25M이다. GPU days도 PIXART-α의 환산값 753 A100에 비해 DALL·E 2는 41,667, SDv1.5는 6,250, GigaGAN은 4,783, Imagen은 7,132, RAPHAEL은 60,000 A100이다. DALL·E, GLIDE, LDM의 GPU days는 표에 보고되지 않았다.

다만 이 비용 비교에는 두 가지 조건이 붙는다. 첫째, PIXART-α의 A100 GPU days는 실제 A100 학습 측정값이 아니라 V100 학습량을 속도 향상 가정으로 환산한 값이다. 둘째, 모델 학습 전후의 일부 비용이 제외되어 있다. 따라서 753이라는 숫자를 전체 시스템 구축 비용과 동일시하면 안 된다.

## 텍스트-이미지 정렬과 compositionality

T2I-CompBench 결과는 속성 결합, 객체 관계, 복합 프롬프트를 나누어 평가한다. 모든 열은 높을수록 좋다.

| Model | Color ↑ | Shape ↑ | Texture ↑ | Spatial ↑ | Non-Spatial ↑ | Complex ↑ |
|---|---:|---:|---:|---:|---:|---:|
| Stable v1.4 | 0.3765 | 0.3576 | 0.4156 | 0.1246 | 0.3079 | 0.3080 |
| Stable v2 | 0.5065 | 0.4221 | 0.4922 | 0.1342 | 0.3096 | 0.3386 |
| Composable v2 | 0.4063 | 0.3299 | 0.3645 | 0.0800 | 0.2980 | 0.2898 |
| Structured v2 | 0.4990 | 0.4218 | 0.4900 | 0.1386 | 0.3111 | 0.3355 |
| Attn-Exct v2 | 0.6400 | 0.4517 | 0.5963 | 0.1455 | 0.3109 | 0.3401 |
| GORS | 0.6603 | 0.4785 | 0.6287 | 0.1815 | 0.3193 | 0.3328 |
| Dalle-2 | 0.5267 | 0.4747 | 0.5804 | 0.1283 | 0.3078 | 0.2967 |
| SDXL | 0.5879 | 0.4687 | 0.5299 | 0.2133 | 0.3119 | 0.3237 |
| PIXART-α | 0.6690 | 0.4927 | 0.6477 | 0.2064 | 0.3197 | 0.3433 |

PIXART-α는 Color 0.6690, Shape 0.4927, Texture 0.6477, Non-Spatial 0.3197, Complex 0.3433으로 각 열에서 가장 높은 값을 기록한다. Spatial은 0.2064로 SDXL의 0.2133보다 낮지만 나머지 모델보다는 높다.

이 결과는 논문의 효율성이 FID만 유지한 것이 아니라 텍스트 정렬에도 연결됐다는 근거다. 특히 Color, Shape, Texture는 상세 캡션이 제공하는 속성 정보와 직접 맞닿아 있다. 다만 Table 3만으로 LLaVA 캡션의 효과와 Transformer 구조의 효과를 분리할 수는 없다.

저자들은 Transformer가 U-Net보다 장거리 의존성 모델링과 다중 모달 융합에 유리하며, 이것이 compositionality 성능에 기여한다고 분석한다. 이 설명은 Table 3과 방향이 맞지만, 표에는 U-Net과 Transformer만 바꾼 통제 실험이 없으므로 구조 하나의 독립 효과량으로 해석하기보다는 저자의 분석으로 구분해야 한다.

## 사람의 선호와 정성 비교

사용자 연구에는 고정 프롬프트 300개와 평가자 50명이 사용됐다. 비교 대상은 DALL·E 2, SDv2, SDXL, DeepFloyd다. SDv2와 비교했을 때 PIXART-α는 이미지 품질에서 7.2%, 텍스트 정렬에서 42.4% 향상된 것으로 보고됐다.

부록에서는 Midjourney와 블라인드 비교를 수행했고, RAPHAEL 프롬프트를 사용한 비교도 제시했다. 이 비교에서 PIXART-α는 기존의 강력한 생성 모델들과 동등하거나 우수한 성능을 보였다. 다만 해당 비교의 세부 점수는 추출본에 없으므로 정성 결론 이상으로 수치화할 수 없다.

이 사용자 연구가 중요한 이유는 FID의 한계와 연결된다. 저자들은 COCO zero-shot FID가 시각적 미감과 음의 상관을 보일 수 있고, FID에 사용하는 ImageNet feature extractor가 생성 이미지 평가 도메인과 맞지 않을 수 있다고 지적한다. 따라서 FID 7.32만으로 미적 품질의 우열을 확정하기보다 사람의 품질 및 정렬 선호를 함께 봐야 한다.

## 무엇이 성능과 효율을 만들었나

구조 ablation은 재매개변수화와 adaLN-single의 효과를 비교한다. 본문은 지표를 zero-shot FID-5K라고 설명하지만 Figure 6 캡션은 FID-2K라고 적어 평가 표본 수가 충돌한다. 아래 수치는 그 충돌을 해결하지 않은 상태로 읽어야 한다.

| 구성 | 학습 조건 | Params | GPU Memory | FID↓ |
|---|---|---:|---:|---:|
| w/o re-param | 재매개변수화 없이 처음부터 학습, 보상 목적으로 200K iterations 추가 | - | 23G | 23.30 |
| adaLN | 기존 DiT 구조, 재매개변수화 적용, 200K iterations | 833M | 29G | 18.20 |
| adaLN-single | 공유 구조, 재매개변수화 적용, 200K iterations | 611M | 23G | 22.37 |
| adaLN-single-L (Ours) | 총 1500K iterations | 611M | 23G | 22.30 |

재매개변수화를 사용하지 않은 구성은 추가 200K iterations로 보상했는데도 FID가 23.30이다. 재매개변수화를 적용한 adaLN-single은 22.37로 0.93 낮다. 초기 함수 호환성이 최적화에 도움이 된다는 방향의 근거다. 다만 두 행의 전체 학습 이력이 완전히 동일하게 정의되어 있지는 않으므로 0.93 전부를 초기화만의 효과라고 단정하기는 어렵다.

기존 adaLN은 FID 18.20으로 adaLN-single의 22.37보다 4.17 낮다. 대신 파라미터는 833M에서 611M으로 줄고 GPU 메모리는 29G에서 23G로 감소한다. 즉, 이 ablation에서는 파라미터 공유가 메모리를 줄이는 대신 같은 200K 설정의 FID를 희생했다. adaLN-single을 “품질 손실 없는 압축”이라고 표현하면 표와 맞지 않는다.

adaLN-single-L은 총 1500K iterations를 학습해 FID 22.30을 기록한다. adaLN-single의 22.37보다 0.07 낮지만 학습량 차이가 매우 크다. 이 결과는 장기 학습 후에도 공유 구조를 사용할 수 있음을 보여주지만, 추가 iterations가 FID를 크게 개선했다는 근거는 아니다.

> adaLN-single의 핵심 이득은 833M에서 611M으로의 파라미터 감소와 29G에서 23G로의 메모리 감소다. 같은 ablation 조건에서는 기존 adaLN보다 FID가 나빠졌으므로 효율과 품질의 교환을 함께 기록해야 한다.
{: .prompt-warning }

## 비용과 경량화 관점의 트레이드오프

PIXART-α의 생성 네트워크는 Table 2에서 0.6B로 보고되며, 상세 구조에서는 adaLN-single 적용 후 611M이다. 기존 adaLN의 833M에서 26%를 줄였고, 구조 실험의 GPU 메모리는 29G에서 23G로 감소했다. 28개 블록이 각각 큰 조건 projection을 갖는 대신 공유 함수와 작은 레이어별 임베딩을 쓰기 때문에 깊이가 커질수록 반복 파라미터를 피할 수 있다.

그러나 시스템 전체를 611M 모델 하나로만 보면 안 된다. 텍스트 인코더로 4.3B Flan-T5-XXL을 사용한다. 이 인코더의 학습 시간과 데이터량은 비용 비교에 포함되지 않았고, 추출본에는 배포 시 텍스트 인코더를 어떻게 운용하는지에 대한 메모리 세부 수치도 없다. 따라서 611M은 PIXART-α Transformer의 경량화를 보여주지만 전체 텍스트-이미지 파이프라인의 총 파라미터 및 메모리 비용을 뜻하지 않는다.

학습 비용 표에서 제외된 항목은 다음과 같다.

- 오프라인 VAE feature extraction 시간
- 오프라인 T5 feature extraction 시간
- OpenImage를 사용한 VAE 자체 학습: 64 V100에서 약 25시간
- T5의 학습 시간 및 관련 데이터량
- SAM에 대한 LLaVA 캡션 자동 생성: 64 V100에서 약 24시간

특히 T5 학습 비용과 데이터량은 구체적인 값도 보고되지 않았다. 따라서 1,656 V100 GPU days 또는 환산 753 A100 GPU days는 최종 Transformer 학습 비용에 가까우며, 데이터 준비와 모든 사전 학습 구성 요소를 포함한 종단 간 비용은 아니다.

추론 측면에서는 DPM-Solver 20단계를 선택했다. iDDPM과 SA-Solver도 비교했지만 최종 선택 기준은 연산 효율성이었다. 생성 모델의 배포 비용에서는 네트워크 파라미터 수뿐 아니라 한 이미지당 반복 호출 횟수가 병목이 된다. PIXART-α도 반복적 확산 샘플링을 사용하므로 20단계 solver의 비용은 남아 있다.

고해상도 학습에서는 메모리 부담이 더 직접적으로 드러난다. 256×256 단계의 표기상 batch size `178×64`가 512×512에서는 `40×64`, 1024×1024에서는 `12×32`로 줄어든다. adaLN-single이 조건 분기의 메모리를 줄이더라도 이미지 토큰 수 증가에 따른 비용까지 없애는 것은 아니다.

## CFG scale과 sampler 선택

CFG scale 실험에는 다음 값이 사용됐다.

$$
[1.5,\ 2.0,\ 3.0,\ 4.0,\ 5.0,\ 6.0].
$$

PIXART-α는 이 범위 전반에서 SDv1.5보다 나은 FID-CLIP 성능을 보였고, T2I-CompBench에서도 안정적인 성능을 유지했다. 특정 scale 한 점에서만 우연히 좋은 결과를 얻은 것이 아니라 여러 guidance 강도에서 품질과 정렬이 유지된다는 의미다.

다만 각 scale의 개별 수치나 최적 scale은 추출본에 포함되지 않았다. 따라서 기본값을 하나로 확정하거나 scale 변화에 따른 정확한 품질 곡선을 재구성할 수는 없다.

## 맞춤형 생성으로의 확장

논문은 PIXART-α를 DreamBooth와 ControlNet에 적용해 맞춤형 생성 가능성을 확인했다.

DreamBooth 설정은 learning rate $5\times10^{-6}$, 300 steps이며 class-preservation loss는 사용하지 않았다. 이 결과는 PIXART-α의 표현을 특정 주제나 개념에 맞게 짧은 추가 학습으로 조정할 수 있다는 사례다.

ControlNet 확장에서는 HED edge map을 조건으로 사용한다. 구조는 frozen block과 trainable block, 그리고 두 개의 zero linear layer를 포함한다. Learning rate는 $5\times10^{-6}$이고 20,000 steps를 학습했다. 이를 통해 특정 색상 제어 등을 포함한 맞춤형 이미지 생성이 가능함을 확인했다.

이 두 실험은 기반 모델이 범용 텍스트-이미지 생성에만 고정된 것이 아니라 개인화와 공간 조건 제어 구조에도 연결될 수 있다는 근거다. 그러나 다른 데이터 모달리티나 더 큰 모델 규모에서도 같은 효율 이득이 유지되는지는 추출본의 실험 범위에서 확인되지 않는다.

## 한계와 생각해볼 점

저자들이 밝힌 첫 번째 한계는 정확한 숫자 세기다. 프롬프트가 특정 개수의 객체를 요구할 때 생성 결과가 그 수를 정확히 맞추지 못할 수 있다. Table 3에서 속성과 관계 정렬이 강하더라도 이산적인 개수 제약까지 안정적으로 해결한 것은 아니다.

두 번째 한계는 사람의 팔과 다리 같은 세부 묘사다. 전체 이미지의 미적 품질이 높더라도 국소적인 인체 구조에서는 오류가 발생하기 쉽다. 이는 사용자 연구의 전반적 선호도와 특정 세부 실패가 동시에 존재할 수 있음을 보여준다.

세 번째 한계는 이미지 안의 텍스트 생성이다. 훈련 데이터에 폰트와 문자가 들어간 이미지가 적어 문자 표현 능력이 취약하다. 이 문제는 단순히 텍스트 인코더를 키우는 것과는 다르다. 프롬프트를 이해하는 능력과 픽셀 공간에 정확한 글자를 그리는 능력은 별개의 문제이기 때문이다.

내가 이 논문에서 가장 중요하게 읽은 부분은 효율을 하나의 기법으로 설명하지 않는다는 점이다. 학습 목표 분해, 고밀도 캡션, 긴 텍스트 입력, Cross-attention의 안정적인 삽입, adaLN-single의 파라미터 공유가 함께 작동한다. 반대로 ablation이 보여주듯 adaLN-single만 놓고 보면 기존 adaLN보다 FID가 나쁘다. 전체 시스템의 효율을 개별 모듈의 무손실 개선으로 오해하지 않아야 한다.

또한 보고된 753 A100 GPU days는 V100 결과를 환산한 값이고, 오프라인 feature extraction과 여러 사전 학습 비용이 빠져 있다. 이 숫자는 기존 대규모 T2I 모델보다 Transformer 학습을 크게 줄였다는 증거로는 유효하지만, 모델 하나를 처음부터 구축하는 전체 비용의 완전한 회계로 보기는 어렵다.

마지막으로 FID와 사람의 선호가 항상 같은 방향으로 움직이지 않을 수 있다는 저자들의 논의가 중요하다. PIXART-α의 의의는 단일 FID 최고점보다는 제한된 데이터와 계산량으로 경쟁력 있는 FID, compositionality, 사용자 선호를 함께 달성한 데 있다.

