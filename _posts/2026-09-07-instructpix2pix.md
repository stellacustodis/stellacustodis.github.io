---
title: "InstructPix2Pix: Learning to Follow Image Editing Instructions"
date: 2026-09-07 15:52:12 +0900
permalink: /posts/instructpix2pix/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion, image-editing, instruction-following, stable-diffusion]
description: "InstructPix2Pix는 합성한 대규모 이미지 편집 데이터로 학습해, 입력 이미지와 자연어 지시문만으로 편집 결과를 만드는 조건부 확산 모델이다. 이미지 구조 보존과 지시문 반영 강도를 분리한 CFG로 조절한다."
paper:
  authors: "Tim Brooks*, Aleksander Holynski*, Alexei A. Efros (*Denotes equal contribution)"
  venue: "CVPR"
  code: "timothybrooks.com/instruct-pix2pix"
---

## 세 줄 요약

InstructPix2Pix는 입력 이미지와 자연어 편집 지시문을 받아 편집 결과를 생성하는 조건부 확산 모델이다. 핵심은 사람의 편집 지시문-이미지 쌍을 대규모로 수집하기 어려운 문제를 GPT-3, Stable Diffusion, Prompt-to-Prompt를 결합한 합성 데이터 생성으로 우회한 데 있다.

모델은 입력 이미지 조건과 텍스트 지시문 조건을 분리한 Classifier-Free Guidance(CFG)를 사용한다. 따라서 입력 이미지의 공간 구조를 얼마나 유지할지와 지시문에 따른 변경을 얼마나 강하게 적용할지를 별도의 가이던스 스케일로 조절할 수 있다.

추론 시에는 이미지별 인버전이나 파인튜닝 없이 이미지와 지시문을 입력해 수 초 내에 편집한다. 대신 그 빠른 사용 경험은 대규모 합성 데이터 생성, 필터링, 확산 모델 학습이라는 오프라인 비용 위에 놓여 있다.

## 이 논문이 풀려는 문제

이미지 편집 모델에는 보통 세 정보가 연결되어 있어야 한다. 편집 전 이미지, 무엇을 어떻게 바꿀지 설명하는 지시문, 그리고 편집 후 이미지다. 그러나 이런 이미지-지시문-결과 이미지 삼중쌍을 인터넷에서 대규모로 수집하기는 어렵다. 사용자가 실제로 사용하는 표현은 “배경을 도시로 바꿔줘”, “재킷을 가죽으로 만들어줘”처럼 바꿀 부분만 말하는 짧은 지시문이기 때문이다.

기존 텍스트 기반 이미지 편집 방식도 각각의 제약을 가진다.

- SDEdit은 이미지에 일부 노이즈를 넣은 뒤 사전학습 확산 모델로 디노이징한다. 스타일 변화처럼 원본 내용이 대체로 유지되는 편집에는 비교적 적합하지만, 객체 정체성을 유지한 채 특정 객체만 분리해 바꾸는 작업에는 취약할 수 있다. 또한 편집 지시문보다 편집 후 장면의 완전한 캡션을 요구한다.
- Text2Live는 텍스트 조건에 맞는 색상과 불투명도 증강 레이어를 최적화한다. 텍스처나 색상처럼 부가 레이어로 표현되는 편집에는 적합하지만, 객체 자체를 교체하거나 장면의 의미를 크게 바꾸는 편집에는 방법의 표현 범위가 제한된다.
- Prompt-to-Prompt는 서로 다른 프롬프트의 cross-attention을 공유해 생성 이미지 사이의 대응성을 높인다. 다만 이 방식도 사용자가 편집 후 결과를 완전한 캡션으로 기술해야 한다.
- 인페인팅, 예시 이미지 기반 학습, 단일 이미지 인버전 및 파인튜닝 기반 방법은 사용자 마스크, 추가 예시 이미지, 또는 이미지별 최적화를 요구할 수 있다.

여기서 중요한 문제는 “무엇을 바꿀 것인가”만이 아니다. 편집 모델은 사용자가 설명하지 않은 인물의 외형, 배경 구도, 조명, 객체 관계처럼 유지되어야 할 정보도 함께 다뤄야 한다. 텍스트-투-이미지 모델에 비슷한 프롬프트 두 개를 각각 넣는 것만으로는 이 대응성이 보장되지 않는다. 예를 들어 “a picture of a cat”과 “a picture of a black cat”은 의미상 가깝지만, 독립 생성 결과의 구도와 배경까지 같을 이유는 없다.

## 핵심 아이디어: 사전학습 모델을 데이터 공장으로 쓰기

InstructPix2Pix의 설계는 세 단계로 정리할 수 있다.

1. GPT-3로 입력 캡션, 편집 지시문, 편집 후 캡션의 텍스트 삼중쌍을 대량 생성한다.
2. Stable Diffusion과 Prompt-to-Prompt로 캡션 쌍을 대응하는 이미지 쌍으로 변환하고, CLIP 기반 지표로 필터링한다.
3. 이렇게 만든 이미지-지시문-편집 이미지 쌍으로 최종 편집 모델을 학습한다.

사람이 직접 만든 데이터는 700개의 텍스트 삼중쌍이다. 이를 바탕으로 GPT-3 Davinci를 한 에포크 파인튜닝한 뒤, LAION-Aesthetics의 실제 캡션을 입력으로 사용해 454,445개의 텍스트 삼중쌍을 생성한다. 이후 이미지 생성과 필터링을 거쳐 45만 개 이상의 이미지 편집 학습 예시를 구성한다.

따라서 이 방법은 GPT-3나 Prompt-to-Prompt를 매 편집 요청마다 직접 실행하는 방식이 아니다. 이 모델들은 합성 학습 데이터를 만드는 역할을 하고, 최종 사용자 단계에서는 InstructPix2Pix가 입력 이미지와 편집 지시문만으로 결과를 생성한다.

![GPT-3로 텍스트 편집 삼중쌍을 만들고, Stable Diffusion과 Prompt-to-Prompt로 이미지 쌍을 생성한 뒤, InstructPix2Pix를 학습하는 전체 파이프라인](/assets/img/posts/instructpix2pix/figure2.jpg){: w="700" }

_그림 1. 사전학습 모델의 조합은 최종 편집 단계가 아니라 대규모 지도 데이터 생성 단계에서 사용된다._

## 방법 — 텍스트 삼중쌍 생성

### 사람이 작성한 700개 예시

출발점은 LAION-Aesthetics V2 6.5+에서 뽑은 실제 이미지 캡션 700개다. 사람은 각 캡션에 편집 지시문과 편집 후 캡션을 작성한다.

- 입력 캡션: `Yefim Volkov, Misty Morning`
- 편집 지시문: `make it afternoon`
- 편집 후 캡션: `Yefim Volkov, Misty Afternoon`

Table 1에는 사람이 작성한 예시와 GPT-3가 생성한 예시가 함께 제시되어 있다. 두 그룹을 구분해 보면 다음과 같다.

| 구분 | Input LAION caption | Edit instruction | Edited caption |
|---|---|---|---|
| 사람 작성 (700 edits) | girl with horse at sunset | change the background to a city | girl with horse at sunset in front of city |
| 사람 작성 (700 edits) | painting-of-forest-and-pond | Without the water. | painting-of-forest |
| GPT-3 생성 (>450,000 edits) | Alex Hill, Original oil painting on canvas, Moonlight Bay | in the style of a coloring book | Alex Hill, Original coloring book illustration, Moonlight Bay |
| GPT-3 생성 (>450,000 edits) | The great elf city of Rivendell, sitting atop a waterfall as cascades of water spill around it | Add a giant red dragon | The great elf city of Rivendell, sitting atop a waterfall as cascades of water spill around it with a giant red dragon flying overhead |
| GPT-3 생성 (>450,000 edits) | Kate Hudson arriving at the Golden Globes 2015 | make her look like a zombie | Zombie Kate Hudson arriving at the Golden Globes 2015 |

이 삼중쌍은 단순한 문장 변환 예시가 아니다. 입력 설명과 출력 설명의 차이를 자연어 편집 지시문으로 연결한다. 모델은 “전체 장면을 다시 기술하는 방법”이 아니라 “무엇을 유지하고 무엇을 변경할지”라는 관계를 학습한다.

### GPT-3로 관계를 확장하기

저자들은 700개 삼중쌍으로 GPT-3 Davinci를 기본 학습 파라미터에서 한 에포크 파인튜닝한다. 이후 중복 캡션과 중복 이미지 URL을 제외한 LAION-Aesthetics의 실제 캡션을 입력으로 사용해 454,445개의 텍스트 삼중쌍을 생성한다.

LAION을 선택한 이유는 규모뿐 아니라 사진, 회화, 디지털 아트워크가 섞여 있고 고유명사나 대중문화 참조까지 포함하는 다양성에 있다. 반면 데이터에는 노이즈가 많거나 충분히 설명적이지 않은 캡션도 있을 수 있다. 논문은 이후 이미지 쌍 필터링과 CFG를 통해 이런 노이즈의 영향을 완화하려 한다.

여기서 454,445개 텍스트 삼중쌍과 45만 개 이상의 최종 이미지 학습 예시를 같은 수로 간주하면 안 된다. 텍스트 관계를 만든 뒤, 이미지 생성 후보를 만들고 CLIP 기반 필터링을 통과한 쌍으로 최종 학습 데이터를 구성하기 때문이다.

## 방법 — 캡션 쌍을 대응 이미지 쌍으로 바꾸기

### 독립 생성만으로는 편집 데이터가 되지 않는다

입력 캡션과 편집 후 캡션을 Stable Diffusion에 각각 독립적으로 넣으면, 두 결과가 같은 장면의 편집 전후 이미지가 아닐 수 있다. “photograph of a girl riding a horse”와 “photograph of a girl riding a dragon”을 따로 생성하면, 말과 용뿐 아니라 소녀의 외형, 카메라 시점, 배경 구도까지 바뀔 수 있다.

이런 쌍을 그대로 학습에 사용하면 모델은 “말을 용으로 바꾸기”보다 두 이미지 사이의 무관한 차이를 함께 학습하게 된다. 편집 데이터에는 바뀐 요소와 유지된 요소가 대응되어야 한다.

### Prompt-to-Prompt 기반의 attention 공유

논문은 Stable Diffusion과 Prompt-to-Prompt 기반의 attention 공유로 이 대응성을 만든다. 본문은 Prompt-to-Prompt를 cross-attention 공유로 소개하지만, CVPR 부록 C.2(arXiv v2 A.2)의 실제 데이터 생성 구현은 두 이미지에 같은 노이즈를 사용하고 첫 $p$ 비율의 디노이징 스텝에서 두 번째 이미지의 self-attention 가중치를 교체한다고 명시한다. 그러면 인물의 외형과 배경 구도는 비교적 유지하면서 말만 용으로 바꾸는 형태의 이미지 쌍을 만들 수 있다.

두 이미지가 항상 같은 정도로 유사해야 하는 것은 아니다. 색상이나 스타일처럼 작은 편집은 높은 유사도가 자연스럽지만, 객체를 교체하거나 위치를 바꾸는 큰 편집은 더 큰 이미지 변화가 필요할 수 있다. 이 논문의 데이터 생성 구현에서는 앞서 설명한 self-attention 교체를 적용하는 디노이징 스텝의 비율 $p$로 대응성을 조절한다.

논문은 캡션과 지시문만으로 적절한 $p$를 정하기 어렵다고 보고, 캡션 쌍마다 다음과 같이 무작위 비율을 사용한다.

$$
p \sim \mathcal{U}(0.1, 0.9)
$$

그리고 캡션 쌍당 100개의 이미지 후보를 생성한다. 이는 단일한 대응성 기준을 모든 편집에 강제하는 대신, 다양한 수준의 변화 후보를 만든 뒤 품질을 가려내는 전략이다.

### CLIP directional similarity 필터

후보는 CLIP 공간 방향성 유사도(CLIP directional similarity)로 필터링한다. 이 지표는 입력 캡션에서 편집 후 캡션으로의 변화 방향과, 입력 이미지에서 편집 이미지로의 변화 방향이 얼마나 일치하는지를 본다.

두 이미지가 단지 비슷하다고 해서 좋은 편집 쌍은 아니다. 반대로 이미지가 크게 달라졌더라도 그 변화가 텍스트 편집 관계와 맞지 않으면 학습에 부적합하다. 방향성 유사도는 “변화했는가”가 아니라 “텍스트가 요구한 방향으로 변화했는가”를 확인하는 데 쓰인다.

CVPR 부록 C.2(arXiv v2 A.2)는 image-image CLIP 0.75, image-caption CLIP 0.2, directional CLIP 0.2의 임계치를 제시한다. 세 필터를 모두 통과한 후보를 directional similarity 순으로 정렬하고 캡션 쌍마다 최대 4개를 남긴다.

## 방법 — InstructPix2Pix 확산 모델

### 목표 이미지와 입력 이미지의 역할 분리

InstructPix2Pix는 Stable Diffusion 기반의 Latent Diffusion Model이다. VAE 인코더 $\mathcal{E}$가 이미지를 잠재 공간으로 옮기고, VAE 디코더 $\mathcal{D}$가 최종 잠재 표현을 다시 이미지로 복원한다.

여기서 용어를 분명히 구분해야 한다.

- $x$는 편집 결과, 즉 학습에서 디노이징 목표가 되는 이미지다.
- $c_I$는 편집 전 입력 이미지 조건이다.
- $c_T$는 자연어 편집 지시문이다.

따라서 편집 결과 이미지 $x$의 잠재 표현은 다음과 같이 쓸 수 있다.

$$
z = \mathcal{E}(x)
$$

반면 입력 이미지 조건은 별도로 인코딩한다.

$$
\mathcal{E}(c_I)
$$

학습 시 노이즈가 추가되는 대상은 편집 결과 이미지의 잠재 표현이다. 입력 이미지의 잠재 표현은 노이즈를 예측할 때 모델에 제공되는 조건이다. 둘은 shape이 같을 수 있지만 역할은 다르다. 이 구분이 무너지면 모델이 “입력 이미지를 복원하는 모델”처럼 구현될 위험이 있다.

모델은 사전학습 Stable Diffusion 체크포인트로 초기화한다. 노이즈 잠재 벡터 $z_t$와 입력 이미지 잠재 벡터 $\mathcal{E}(c_I)$를 채널 방향으로 결합하기 위해 첫 번째 컨볼루션 레이어의 입력 채널을 확장한다. 새로 추가한 채널의 가중치는 0으로 초기화한다.

이 설계는 기존 Stable Diffusion의 동작을 출발점으로 삼되, 입력 이미지 조건을 점진적으로 학습하게 한다. 텍스트 조건에는 Stable Diffusion이 원래 사용하던 캡션 조건 메커니즘을 재사용하지만, 입력 텍스트의 역할은 전체 장면 설명이 아니라 편집 지시문이다.

### 노이즈 예측 손실

학습 목적함수는 Latent Diffusion Model의 노이즈 예측 손실에 두 조건을 더한 형태다.

$$
\mathcal{L} =
\mathbb{E}_{\mathcal{E}(x),\mathcal{E}(c_I),c_T,
\epsilon\sim\mathcal{N}(0,1),t}
\left[
\left\|
\epsilon-\epsilon_\theta(z_t,t,\mathcal{E}(c_I),c_T)
\right\|_2^2
\right]
$$

각 기호의 역할은 다음과 같다.

- $\epsilon$은 편집 결과 잠재 표현에 주입한 표준 가우시안 노이즈다.
- $z_t$는 타임스텝 $t$에서 노이즈가 섞인 편집 결과 잠재 벡터다.
- $\epsilon_\theta$는 $z_t$, 타임스텝, 입력 이미지 조건, 텍스트 지시문을 보고 주입된 노이즈를 예측한다.
- $\|\epsilon-\epsilon_\theta\|_2^2$는 실제 노이즈와 예측 노이즈의 차이다.

이 식은 편집 결과 이미지를 직접 회귀하는 손실이 아니다. 모델은 노이즈가 섞인 목표 잠재 표현에서 주입된 노이즈를 맞히도록 학습되고, 추론에서는 이 예측을 이용해 역방향 디노이징을 반복한다. 입력 이미지 조건은 결과가 무엇을 참고해야 하는지, 텍스트 조건은 무엇을 바꿔야 하는지를 제공한다.

## 방법 — 두 조건 Classifier-Free Guidance

### 단일 조건 CFG

단일 조건 CFG는 조건부 예측과 비조건부 예측의 차이를 조건의 방향으로 사용한다.

$$
\tilde{e}_{\theta}(z_t,c)
=
e_{\theta}(z_t,\varnothing)
+
s\cdot
\left(
e_{\theta}(z_t,c)-e_{\theta}(z_t,\varnothing)
\right)
$$

$e_\theta(z_t,\varnothing)$는 조건이 없는 예측이고, $e_\theta(z_t,c)$는 조건이 있는 예측이다. 두 예측의 차이는 조건을 추가했을 때 생기는 방향으로 볼 수 있다. 가이던스 스케일 $s$가 커질수록 비조건부 예측에서 조건부 방향으로 더 멀리 외삽한다.

이 외삽은 조건 반영을 강화하지만, 조건을 무한히 강하게 만드는 것이 항상 좋은 것은 아니다. 조건을 더 반영하는 것과 결과의 자연스러움 또는 입력 이미지 보존 사이에는 조절해야 할 관계가 생긴다.

### 이미지 조건과 텍스트 조건을 따로 조절하기

InstructPix2Pix에는 두 조건이 있다. 하나는 입력 이미지 $c_I$, 다른 하나는 편집 지시문 $c_T$다. 입력 이미지는 구조와 정체성을 붙잡는 역할을 하고, 텍스트는 어떤 변화를 적용할지를 알려준다. 둘을 하나의 스케일로 묶으면 이 두 요구를 분리해 조절하기 어렵다.

논문은 다음의 두 조건 CFG를 사용한다.

$$
\begin{split}
\tilde{e}_{\theta}(z_t,c_I,c_T)
=&\ e_{\theta}(z_t,\varnothing,\varnothing) \\
&+s_I\left(
e_{\theta}(z_t,c_I,\varnothing)
-e_{\theta}(z_t,\varnothing,\varnothing)
\right) \\
&+s_T\left(
e_{\theta}(z_t,c_I,c_T)
-e_{\theta}(z_t,c_I,\varnothing)
\right)
\end{split}
$$

식은 세 종류의 모델 예측을 조합한다.

1. $e_\theta(z_t,\varnothing,\varnothing)$: 이미지와 텍스트가 모두 없는 기준 예측
2. $e_\theta(z_t,c_I,\varnothing)$: 입력 이미지만 있는 예측
3. $e_\theta(z_t,c_I,c_T)$: 입력 이미지와 지시문이 모두 있는 예측

첫 번째 차이항은 이미지 조건을 추가했을 때의 방향이다. 여기에 곱해지는 $s_I$는 입력 이미지의 공간 구조 보존을 조절한다. 두 번째 차이항은 입력 이미지를 고정한 상태에서 지시문을 추가했을 때의 방향이다. 여기에 곱해지는 $s_T$는 편집 지시문의 반영 강도를 조절한다.

논문은 대체로 다음 범위를 권장한다.

$$
s_T\in[5,10],\qquad s_I\in[1,1.5]
$$

$s_T$를 높이면 편집이 더 강해지고, $s_I$를 높이면 입력 이미지의 공간 구조와 더 유사한 결과가 만들어진다. 실제 결과에서는 편집 강도와 일관성의 균형을 위해 예시별로 값을 조절한다.

![이미지 가이던스와 텍스트 가이던스의 변화가 편집 결과에 미치는 영향](/assets/img/posts/instructpix2pix/figure4.jpg){: w="700" }

_그림 2. $s_T$와 $s_I$는 모두 조건의 강도처럼 보이지만, 각각 지시문 반영과 입력 구조 보존이라는 다른 축을 조절한다._

### CFG를 위한 상호 배타적 조건 드롭아웃

추론에서 위 세 예측을 만들려면 학습 중에도 모델이 각 조건 상태를 경험해야 한다. 논문은 조건을 독립적으로 5%씩 제거하는 것이 아니라, 다음 네 경우를 상호 배타적으로 샘플링한다.

- 이미지 조건만 비움: 5%
- 텍스트 조건만 비움: 5%
- 이미지와 텍스트 조건을 모두 비움: 5%
- 두 조건을 모두 유지: 85%

독립적인 두 번의 5% 드롭을 적용하면 두 조건이 동시에 비워질 확률은 0.25%가 되어 논문의 설정과 달라진다. 따라서 구현에서는 하나의 난수 분기로 조건 상태를 정해야 한다.

## 구현 관점에서

### 데이터 생성 흐름

```python
# 사람이 작성한 700개 텍스트 삼중쌍
labeled_triplets = [
    (input_caption, edit_instruction, edited_caption)
    for input_caption in sampled_laion_captions
]

language_model = finetune(
    base_model="GPT-3 Davinci",
    data=labeled_triplets,
    epochs=1,
)

text_triplets = []
for input_caption in unique_laion_captions:
    instruction, edited_caption = language_model.generate_edit(
        input_caption
    )
    text_triplets.append(
        (input_caption, instruction, edited_caption)
    )

training_pairs = []
for input_caption, instruction, edited_caption in text_triplets:
    candidates = []
    for p in sample_uniform(low=0.1, high=0.9, count=100):
        input_image, edited_image = generate_shared_noise_self_attention_pair(
            input_caption, edited_caption, attention_share_ratio=p,
        )
        # 동일 latent noise를 공유하고 처음 p 비율의 스텝에서 self-attention 교체
        image_sim = clip_image_similarity(input_image, edited_image)
        caption_sim = minimum_image_caption_similarity(
            input_image, input_caption, edited_image, edited_caption,
        )
        directional_sim = clip_directional_similarity(
            input_image, edited_image, input_caption, edited_caption,
        )
        if image_sim >= 0.75 and caption_sim >= 0.2 and directional_sim >= 0.2:
            candidates.append((directional_sim, input_image, instruction, edited_image))
    candidates.sort(key=lambda item: item[0], reverse=True)
    training_pairs.extend(item[1:] for item in candidates[:4])
```

위 코드는 세 CLIP 필터와 캡션 쌍별 최대 4개 선택을 반영한 설명용 의사코드다. 이미지·캡션 유사도는 각 이미지가 해당 캡션과 맞는지 확인하고, directional similarity는 두 이미지와 두 캡션의 변화 방향을 비교해야 한다. 추상 helper의 CLIP 임베딩·정규화 계약은 실제 구현에서 명시해야 한다.

또한 캡션 쌍마다 100개의 후보를 만든다는 점은 비용 구조를 보여준다. 최종적으로 남는 데이터 수만 봐서는 데이터 생성 비용을 알 수 없다. 많은 후보를 생성하고 필터링하는 과정은 추론을 빠르게 만들기 위해 미리 지불한 비용이다.

### 학습 루프

```python
for input_image, instruction, target_image in training_pairs:
    # input_image:  (B, 3, H, W)
    # target_image: (B, 3, H, W)

    input_latent = E(input_image)
    # (B, C_latent, H_latent, W_latent)

    target_latent = E(target_image)
    # (B, C_latent, H_latent, W_latent)

    noise = standard_normal_like(target_latent)
    t = sample_timestep()
    noisy_target = add_noise(target_latent, noise, t)
    # noisy_target: (B, C_latent, H_latent, W_latent)

    r = uniform_0_1()
    if r < 0.05:
        image_condition = null_image_condition()
        text_condition = instruction
    elif r < 0.10:
        image_condition = input_latent
        text_condition = null_text_condition()
    elif r < 0.15:
        image_condition = null_image_condition()
        text_condition = null_text_condition()
    else:
        image_condition = input_latent
        text_condition = instruction

    predicted_noise = epsilon_theta(
        noisy_target,
        t,
        image_condition,
        text_condition,
    )
    # (B, C_latent, H_latent, W_latent)

    loss = squared_error(predicted_noise, noise)
    update(loss)
```

여기서 `target_image`는 편집 결과 이미지이고, `input_image`는 조건 이미지다. 노이즈는 `target_latent`에 주입되며, 모델은 입력 이미지와 지시문을 참고해 그 노이즈를 예측한다. 두 이미지의 잠재 표현이 같은 차원을 갖는다고 해서 같은 위치에 넣거나 같은 역할로 처리하면 안 된다.

### 추론과 학습은 비대칭이다

학습에서는 정답 편집 이미지가 있다. 그 이미지의 잠재 표현에 노이즈를 넣고, 모델이 그 노이즈를 맞히도록 학습한다. 반면 추론에서는 정답 편집 이미지가 없으므로 초기 잠재 노이즈에서 시작해 역방향 디노이징을 반복한다.

```python
# input_image: (B, 3, H, W)
image_latent = E(input_image)
# (B, C_latent, H_latent, W_latent)

z = initial_latent_noise()
# (B, C_latent, H_latent, W_latent)

for t in reverse_diffusion_timesteps:
    score_empty = epsilon_theta(
        z, t,
        image_condition=null_image_condition(),
        text_condition=null_text_condition(),
    )

    score_image = epsilon_theta(
        z, t,
        image_condition=image_latent,
        text_condition=null_text_condition(),
    )

    score_full = epsilon_theta(
        z, t,
        image_condition=image_latent,
        text_condition=instruction,
    )

    guided_score = (
        score_empty
        + s_I * (score_image - score_empty)
        + s_T * (score_full - score_image)
    )

    z = diffusion_step(z, guided_score, t)

edited_image = D(z)
# (B, 3, H, W)
```

이 코드에서 `score_image - score_empty`는 이미지 조건에 따른 방향이고, `score_full - score_image`는 이미지 조건이 이미 주어진 상태에서 텍스트 지시문이 추가한 방향이다. 텍스트만 조건으로 넣은 예측을 두 번째 항에 사용하면 Eq. 3의 조건 분해와 맞지 않는다.

구현에서 특히 확인할 지점은 다음과 같다.

- $z_t$는 편집 결과 잠재 표현의 노이즈 상태이고, $\mathcal{E}(c_I)$는 입력 이미지 조건이다.
- 첫 번째 컨볼루션 레이어는 노이즈 잠재 벡터와 입력 이미지 잠재 벡터를 함께 받도록 확장되어야 하며, 추가 채널의 가중치는 0으로 초기화된다.
- 조건 드롭아웃은 이미지 전용, 텍스트 전용, 둘 다 비조건부 상태를 정확한 확률로 만들어야 한다.
- $p$는 데이터 생성 단계의 Prompt-to-Prompt attention 공유 비율이며, $s_I$, $s_T$는 최종 모델 추론 단계의 CFG 스케일이다.
- 배치 크기와 sampler 등 부록의 보고 설정은 아래에 구분해 적었다. $t=0$ 처리, 누적곱·API 규약과 측정 최대 메모리 등 나머지 구현 세부는 별도로 확인해야 한다.

## 실험 설정과 평가 기준

논문은 2,000개의 편집 예시로 정량 평가를 수행한다.

- 사람 작성 텍스트 삼중쌍: 700개
- GPT-3 생성 텍스트 삼중쌍: 454,445개
- 최종 합성 이미지 학습 예시: 45만 개 이상
- 정량 평가 편집 예시: 2,000개

비교 대상은 SDEdit, Text2Live, Prompt-to-Prompt with inversion이다. SDEdit과 Prompt-to-Prompt with inversion은 출력 캡션을 입력하는 경우와 편집 지시문을 입력하는 경우를 비교한다.

평가에는 두 축이 필요하다.

- CLIP Image Similarity는 입력 이미지와 편집 이미지의 CLIP 이미지 임베딩 코사인 유사도다. 높을수록 입력 이미지와 더 일치한다.
- CLIP Text-Image Direction Similarity는 텍스트 변화 방향과 이미지 변화 방향의 일치도다. 높을수록 이미지 변화가 텍스트 편집 관계와 더 맞는다.

첫 번째 지표만 높으면 모델이 편집을 거의 하지 않았을 가능성이 있다. 두 번째 지표만 보면 원본의 구조를 지나치게 바꾼 결과가 유리해질 수 있다. 따라서 편집 모델은 두 지표의 트레이드오프를 함께 봐야 한다.

CVPR 부록 C.3(arXiv v2 A.3)에 따르면 모델은 8개의 40GB A100에서 배치 크기 1024, 해상도 256×256, 학습률 $10^{-4}$로 10,000스텝을 약 25.5시간 학습했다. 512×512 추론은 Karras 분산 스케줄의 Euler ancestral sampler로 100스텝을 사용하며 A100에서 이미지당 약 9초다. 보고된 장비 용량은 측정 최대 메모리 사용량과 다르고, 다른 장비의 지연시간을 보장하지 않는다.

## 실험에서 확인한 것

### 원본 보존과 지시문 준수의 트레이드오프

평가에서는 $s_T=7.5$로 고정하고 $s_I\in[1.0,2.2]$를 변화시킨다. SDEdit은 노이즈 강도 $[0.3,0.9]$, Prompt-to-Prompt는 cross-attention 기간 $[0,1]$을 변화시켜 비교한다.

InstructPix2Pix는 같은 CLIP Image Similarity 수준에서 SDEdit과 Prompt-to-Prompt보다 높은 CLIP Text-Image Direction Similarity를 보인다. 이 그림에서 읽어야 할 것은 단일 점수 하나가 아니라 곡선의 위치다. 원본과의 일치도를 비슷하게 유지하면서도 편집 방향을 더 잘 맞추는 트레이드오프를 보였다는 뜻이다.

![입력 이미지 보존도와 편집 방향 일치도의 정량적 트레이드오프 비교](/assets/img/posts/instructpix2pix/figure8.jpg){: w="700" }

_그림 3. 가로축은 텍스트 변화와 이미지 변화의 방향 일치도이고, 세로축은 입력 이미지와 편집 이미지의 유사도다. 편집을 하지 않아 유사도만 높이는 결과와, 지나치게 바꾸어 방향성만 높이는 결과를 함께 경계하는 평가다._

### 다양한 편집 유형

논문은 스타일, 매체, 배경, 객체, 재질을 바꾸는 다양한 정성적 결과를 제시한다. 모나리자에는 `Make it a Modigliani painting`, `Make it a Miro painting`, `Make it an Egyptian sculpture`, `Make it a marble roman sculpture` 같은 지시문을 적용한다.

미켈란젤로의 「아담의 창조」에는 768 해상도에서 `Put them in outer space`, `Turn the humans into robots` 같은 지시문을 적용한다. 이는 스타일만 바꾸는 경우를 넘어 배경 맥락과 피사체를 함께 변형하는 사례다.

Abbey Road 앨범 커버에는 도시, 시간대, 상황, 예술 매체를 바꾸는 지시문이 사용된다.

- `Make it Paris`
- `Make it Hong Kong`
- `Make it Manhattan`
- `Make it Prague`
- `Make it evening`
- `Put them on roller skates`
- `Turn this into 1900s`
- `Make it underwater`
- `Make it Minecraft`
- `Turn this into the space age`
- `Make them into Alexander Calder sculptures`
- `Make it a Claymation`

그 밖에도 `Swap sunflowers with roses`, `Replace the fruits with cake`, `Add fireworks to the sky`, `Make his jacket out of leather`처럼 객체, 배경, 날씨, 재질을 바꾸는 예시가 제시된다.

![객체 교체, 스타일 변환, 배경과 날씨 변경 등 대표적인 편집 결과](/assets/img/posts/instructpix2pix/figure1.jpg){: w="700" }

_그림 4. 목표 사용 방식은 결과 이미지 전체를 캡션으로 다시 쓰는 것이 아니라, 바꿀 내용을 짧은 지시문으로 전달하는 것이다._

### 데이터 규모와 필터링의 역할

학습 데이터를 10% 또는 1%로 줄이면 큰 폭의 의미적 편집 능력이 감소한다. 축소 모델은 높은 CLIP Image Similarity를 유지해도 CLIP Directional Similarity가 현저히 낮아진다. 원본을 보존하는 것과 지시문을 따르는 것은 같은 능력이 아니라는 점을 보여준다.

CLIP directional similarity 필터를 제거한 모델은 같은 편집 강도에서 입력 이미지와의 일치도가 전반적으로 낮아진다. 이는 필터가 단순히 실패한 이미지를 지우는 역할을 넘어, 텍스트 변화와 이미지 변화가 대응되는 학습 신호를 만들고 있음을 시사한다.

![학습 데이터 규모 축소와 CLIP 필터 제거에 대한 ablation 결과](/assets/img/posts/instructpix2pix/figure10.png){: w="700" }

_그림 5. 데이터가 부족하면 모델은 원본과 비슷한 이미지를 만드는 쪽으로 기울 수 있고, 필터링이 없으면 입력 이미지 보존도도 낮아진다._

### 다중 결과와 순환 편집

같은 입력 이미지와 같은 지시문이라도 초기 잠재 노이즈를 바꾸면 여러 그럴듯한 결과를 만들 수 있다. 예를 들어 `in a race car video game`이라는 같은 지시문에서도 다른 편집 결과를 얻는다. 확산 모델의 확률성은 하나의 지시문에 대해 여러 후보를 탐색할 수 있게 한다.

또한 모델은 이전 편집 결과에 다시 지시문을 적용할 수 있다.

1. `Insert a train`
2. `Add an eerie thunderstorm`
3. `Turn into an oil pastel drawing`
4. `Give it a dark creepy vibe`

이처럼 짧은 지시문을 누적해 복합적인 편집을 구성할 수 있다. 다만 저자들은 연속적인 재귀 편집에서 아티팩트가 누적될 수 있다고 밝힌다.

## 비용과 트레이드오프

InstructPix2Pix의 실용적 장점은 이미지별 인버전이나 샘플별 파인튜닝 없이 수 초 내에 편집할 수 있다는 점이다. 기존 방법에서 요청마다 수행하던 최적화 과정을 최종 편집 추론에서 제거한 것이다.

하지만 비용이 사라진 것은 아니다.

- 데이터 구축 단계에서는 GPT-3 기반 텍스트 생성, 캡션 쌍당 100개 후보 이미지 생성, CLIP 기반 필터링이 필요하다.
- 학습 단계에서는 45만 개 이상의 합성 이미지 편집 예시로 확산 모델을 학습한다.
- 추론 단계에서는 이미지별 인버전과 파인튜닝 없이 확산 디노이징으로 편집한다.

즉, 이 방법은 온라인 요청마다 치르는 비용 일부를 오프라인 데이터 구축과 학습으로 옮긴 구조다. 이후 연구에서 더 적은 디노이징 단계로 편집하거나, 더 효율적인 조건 결합을 설계하려는 시도는 이런 추론 비용 구조를 줄이려는 출발점으로 이해할 수 있다. 다만 보고된 학습·추론 설정만으로 다른 장비의 비용이나 측정 최대 메모리 사용량을 정량 비교할 수는 없다.

## 한계와 생각해볼 점

### 저자가 밝힌 한계

첫째, 결과 품질은 합성 데이터 생성에 사용된 Stable Diffusion의 시각적 품질 한계에 영향을 받는다. 둘째, 새로운 편집으로의 일반화는 GPT-3 파인튜닝에 쓴 인간 작성 데이터의 다양성, GPT-3의 텍스트 생성 능력, Prompt-to-Prompt의 이미지 수정 능력에 제한될 수 있다. 셋째, 기반 데이터와 사전학습 모델에 내재된 편향을 상속하거나 새로운 편향을 유발할 수 있다.

저자들은 객체 개수 세기와 공간 추론에 취약하다고 밝힌다. “왼쪽으로 옮겨라”, “서로 위치를 바꿔라”, “컵 두 개는 테이블에, 한 개는 의자에 놓아라” 같은 지시문은 객체 수와 위치 관계를 동시에 다뤄야 한다. 시점 변경도 어렵고, “Zoom into the image” 같은 요청을 수행하지 못한다.

“화성으로 옮겨라”처럼 큰 변화를 요구하면 의도하지 않은 과도한 변경이 일어날 수 있다. 반대로 “넥타이만 파란색으로 바꿔라”처럼 지정한 객체만 고립해야 하는 편집에도 실패할 수 있다. 객체의 위치를 재구성하거나 서로 맞바꾸는 작업 역시 어렵다.

저자들은 향후 과제로 다음을 제시한다.

- 공간적 위치와 배열을 다루는 지시문을 더 잘 따르는 방법
- 사용자 인터랙션처럼 텍스트 외의 추가 조건 모달리티 결합
- 지시문 준수와 편집 품질을 체계적으로 측정하는 새로운 평가 프로토콜
- 인간 피드백과 강화학습(RLHF)을 통해 모델의 편집 결과를 사용자의 편집 의도에 더 정렬하는 방법

마지막 두 과제는 특히 중요하다. 현재의 CLIP 기반 지표는 이미지 변화와 텍스트 변화의 의미적 방향을 측정하지만, 사용자가 의도한 특정 객체만 바뀌었는지, 공간 관계가 정확히 지켜졌는지, 결과가 실제 편집 작업에 만족스러운지를 완전히 대체하지는 않는다. 따라서 좋은 생성 결과와 좋은 편집 경험을 같은 평가 하나로 환원하기 어렵다.

### 내 코멘트

이 방법은 자유로운 이미지 조작기라기보다 입력 이미지 구조를 참고하는 조건부 생성 모델로 이해하는 편이 적절해 보인다. 스타일, 재질, 배경, 분위기처럼 이미지 전체의 의미적 방향을 바꾸는 작업에는 강점이 있지만, 정확한 객체 단위 제어와 공간 관계 보존에는 별도 구조가 필요할 가능성이 있다.

특히 $s_I$를 높인다고 특정 객체만 보존되는 것은 아니다. $s_I$는 입력 이미지의 공간 구조를 전반적으로 유지하는 가이던스이며, 사용자 지정 마스크나 객체 경계를 직접 나타내는 조건은 아니다. “전체 구조 보존”과 “이 객체만 바꾸기”는 다른 제어 문제다.

순환 편집도 같은 이유로 조심해야 한다. 한 단계의 왜곡이나 구조 손상이 다음 단계의 입력이 되므로, 결과를 누적할수록 아티팩트가 쌓일 수 있다. 품질 저하가 커지는 편집 횟수와 취약한 지시문 조합은 별도로 평가해야 한다.

### 추가 비교와 비용 해석

GPU 용량과 측정 최대 메모리 사용량은 다른 값이다. 사용한 GPU의 용량만으로 실행에 필요한 메모리를 추정할 수는 없다.

부록에는 추가 선택 결과, 베이스라인과 구성 비교, 학습 세부사항, 두 조건 CFG의 추가 제형이 수록되어 있다고 언급된다. Fig. 14는 데이터와 사전학습 모델의 편향 분석을, Fig. 23은 다른 CLIP 모델을 사용한 추가 정량 검증을 다룬다고 소개된다.

## 정리

InstructPix2Pix의 핵심 기여는 이미지 편집 모델의 조건을 하나 더 추가한 데만 있지 않다. 사람의 편집 데이터가 부족한 문제를 사전학습 모델의 조합으로 해결하고, 그 결과를 최종 편집 모델의 지도 데이터로 바꾼 데 있다.

수식 관점에서 학습 목표는 편집 결과 이미지의 잠재 표현에 주입한 노이즈를 예측하는 것이다. 입력 이미지는 조건으로, 지시문은 변화 방향으로 들어간다. 두 조건 CFG는 입력 구조 보존과 지시문 반영을 별도 스케일로 조절할 수 있게 한다.

구현 관점에서는 목표 이미지와 입력 이미지의 역할을 분리하고, 첫 컨볼루션의 추가 입력 채널을 0으로 초기화하며, 세 조건 조합을 위한 상호 배타적 조건 드롭아웃을 정확히 구현하는 것이 중요하다. 비용 관점에서는 요청별 인버전과 파인튜닝을 없앤 대신, 대규모 합성 데이터 생성과 필터링 비용을 오프라인 단계에 둔 접근이다.