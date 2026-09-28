---
title: "DiffusionCLIP: Text-Guided Diffusion Models for Robust Image Manipulation"
date: 2026-09-07 00:00:00 +0900
permalink: /posts/diffusionclip/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion-model, clip, image-manipulation]
description: "DiffusionCLIP은 결정론적 DDIM 경로와 directional CLIP loss를 결합해 실제 이미지를 텍스트로 조작한다. 입력 보존과 강한 편집 사이의 균형, 다중 속성 결합의 수식과 실험 결과를 정리한다."
paper:
  authors: "Gwanghyun Kim, Taesung Kwon, Jong Chul Ye"
  code: "https://github.com/gwang-kim/DiffusionCLIP.git"
---

## 세 줄 요약

DiffusionCLIP은 사전 학습된 확산 모델의 결정론적 DDIM 경로와 CLIP의 텍스트-이미지 방향 정보를 결합해 실제 이미지를 조작한다. 잠재변수를 직접 최적화하는 대신, 목표 속성에 맞게 확산 모델의 노이즈 예측 함수를 미세조정한다. 이를 통해 입력의 세부를 보존하면서 unseen-domain 변환, 다중 속성 결합, 조작 강도의 연속 제어를 하나의 틀에서 다룬다.

## 이 논문이 풀려는 문제

텍스트 기반 이미지 조작은 두 요구를 함께 만족해야 한다. 입력 이미지의 인물·구조·세부는 유지하면서, 텍스트가 지시한 속성은 충분히 바뀌어야 한다. 보존만 강조하면 편집 효과가 약해지고, 변화만 강조하면 입력과 무관한 이미지가 될 수 있다.

기존 CLIP 기반 GAN inversion 방법은 실제 이미지를 GAN의 잠재 공간으로 옮긴 뒤 텍스트 방향을 따라 잠재 코드를 수정한다. 그러나 GAN이 학습한 생성 공간 밖에 있는 포즈·뷰·세부는 inversion 단계에서부터 충분히 복원되지 않을 수 있다. 조작 전에 입력 정보가 사라지면 이후의 텍스트 최적화만으로 되찾기 어렵다.

논문은 이런 문제가 객체의 정체성을 의도치 않게 바꾸거나 아티팩트를 만드는 형태로 나타난다고 설명한다. 특히 LSUN-Church나 ImageNet처럼 이미지 분산이 큰 데이터셋에서는 입력과 다른 인공 구조물을 생성하는 식으로 성능 저하가 커질 수 있다.

![기존 GAN 기반 방법과 비교한 DiffusionCLIP의 세부 보존 및 응용 사례](/assets/img/posts/diffusionclip/figure1.jpg){: w="800" }
_그림 1. 얼굴과 교회 이미지 조작에서 DiffusionCLIP, StyleGAN-NADA, StyleCLIP을 비교하고, unseen-domain 변환·stroke-conditioned 생성·다중 속성 변환 사례를 함께 보여준다._

DiffusionCLIP은 생성 공간 안에서 잠재 코드를 찾는 대신, 확산 모델의 복원 과정 자체를 목표 텍스트에 맞게 조정한다. 입력 이미지 $x_0$를 latent $x_{t_0}$로 보낸 뒤, CLIP loss가 가리키는 방향으로 reverse process의 노이즈 예측 모델을 미세조정한다.

## 핵심 아이디어

전체 과정은 다음과 같다.

```text
입력 이미지 x_0
    │
    │ deterministic forward DDIM
    ▼
잠재변수 x_t0
    │
    │ directional CLIP loss와 identity loss로 모델 미세조정
    ▼
목표 속성에 특화된 ε_θ̂
    │
    │ deterministic reverse DDIM
    ▼
조작된 이미지 x̂_0
```

![입력 이미지의 확산, CLIP 손실을 이용한 모델 미세조정, 역확산 생성의 전체 흐름](/assets/img/posts/diffusionclip/figure2.png){: w="700" }
_그림 2. 입력을 latent로 변환한 뒤 latent 자체가 아니라 확산 모델의 노이즈 예측 함수를 미세조정하고, 수정된 모델로 역확산을 수행하는 흐름이다._

일반 이미지 조작에서는 forward와 reverse를 모두 결정론적인 DDIM으로 구성한다. DDPM의 forward와 reverse는 확률적 노이즈를 사용하므로 같은 latent에서도 결과가 달라질 수 있다. 반면 $\sigma_t=0$인 DDIM은 동일한 궤적을 양방향으로 따라갈 기반을 제공해 입력 보존에 적합하다.

다만 확률성이 항상 방해가 되는 것은 아니다. 입력과 목표가 모두 사전 학습 도메인 밖에 있는 unseen-domain translation에서는 보통 $t_0=500$까지 stochastic DDPM으로 이미지를 교란한다. 이 latent에서 원래 모델을 역방향으로 실행하면 사전 학습 도메인의 $x'_0$를, 미세조정된 모델을 실행하면 목표 도메인의 $\hat{x}_0$를 생성한다.

## 방법 — 확산 모델의 출발점

### Forward diffusion과 노이즈 예측

확산 모델은 깨끗한 이미지 $x_0$에 단계별로 노이즈를 더한다.

$$
x_t=
\sqrt{\alpha_t}x_0+
\sqrt{1-\alpha_t}w,
\qquad
w\sim\mathcal{N}(0,I)
\tag{1}
$$

여기서 $\alpha_t:=\prod_{s=1}^{t}(1-\beta_s)$다. $\sqrt{\alpha_t}x_0$는 $t$단계 뒤에도 남아 있는 신호이고, $\sqrt{1-\alpha_t}w$는 누적된 노이즈다. $t$가 커져 $\alpha_t$가 작아질수록 입력 신호의 비중은 줄고 노이즈 비중은 커진다. 따라서 return step $t_0$는 보존과 변화 사이를 조절하는 변수다.

모델은 $x_t$에서 사용된 노이즈 $w$를 예측하도록 학습된다.

$$
\min_\theta
\mathbb{E}_{x_0\sim q(x_0),\,w\sim\mathcal{N}(0,I),\,t}
\left\|w-\epsilon_\theta(x_t,t)\right\|_2^2
\tag{2}
$$

$\epsilon_\theta(x_t,t)$는 시간 $t$의 노이즈 예측 모델이다. 시간 $t$를 함께 표본 추출하는 이유는 하나의 모델이 여러 noise level에서 reverse process를 구성해야 하기 때문이다. 예측 오차는 한 단계의 reverse update에 들어가며, 이후 단계로 누적될 수 있다.

노이즈 예측은 score function과도 연결된다.

$$
\epsilon_\theta(x_t,t)
=
-\sqrt{1-\alpha_t}\,
\nabla_{x_t}\log p_\theta(x_t)
\tag{4}
$$

$\nabla_{x_t}\log p_\theta(x_t)$는 현재 위치에서 확률 밀도가 증가하는 방향인 score다. 식 (4)는 예측 노이즈가 크기 계수를 제외하면 score의 반대 방향이라는 뜻이다. 따라서 노이즈 예측 함수를 미세조정하는 일은 각 noise level에서 모델이 따라갈 확률 밀도의 방향을 바꾸는 일로 해석할 수 있다.

## 방법 — 결정론적 DDIM inversion

현재 $x_t$와 예측 노이즈가 주어졌을 때, 깨끗한 이미지의 예측값은 다음과 같다.

$$
f_\theta(x_t,t)
:=
\frac{x_t-\sqrt{1-\alpha_t}\epsilon_\theta(x_t,t)}
{\sqrt{\alpha_t}}
\tag{6}
$$

$f_\theta(x_t,t)$는 현재 noisy sample에서 예측한 $x_0$다. 분자의 두 번째 항은 노이즈 성분을 제거하고, 분모의 $\sqrt{\alpha_t}$는 forward process에서 줄어든 신호 크기를 복원한다.

일반 이미지 조작에서 $\sigma_t=0$으로 둔 DDIM trajectory는 다음 ODE 형태로 쓸 수 있다.

$$
\sqrt{\frac{1}{\alpha_{t-1}}}x_{t-1}
-
\sqrt{\frac{1}{\alpha_t}}x_t
=
\left(
\sqrt{\frac{1}{\alpha_{t-1}}-1}
-
\sqrt{\frac{1}{\alpha_t}-1}
\right)
\epsilon_\theta(x_t,t)
\tag{7}
$$

좌변은 스케일을 보정한 상태의 변화량이고, 우변은 noise level 변화와 예측 방향의 곱이다. 별도의 $z$를 표본 추출하지 않으므로, 같은 시작점·모델·시간 격자를 사용하면 경로가 결정된다.

Deterministic forward DDIM은 다음과 같다.

$$
x_{t+1}
=
\sqrt{\alpha_{t+1}}f_\theta(x_t,t)
+
\sqrt{1-\alpha_{t+1}}\epsilon_\theta(x_t,t)
\tag{12}
$$

Reverse DDIM은 같은 예측값을 사용하되 시간 인덱스를 반대 방향으로 이동한다.

$$
x_{t-1}
=
\sqrt{\alpha_{t-1}}f_\theta(x_t,t)
+
\sqrt{1-\alpha_{t-1}}\epsilon_\theta(x_t,t)
\tag{13}
$$

두 식의 차이는 다음 상태가 $t+1$인지 $t-1$인지다. 구현에서는 forward time grid가 낮은 noise level에서 높은 쪽으로, reverse time grid는 정확히 반대 방향으로 순회해야 한다. 또한 $\alpha_t$는 단일 단계의 $1-\beta_t$가 아니라 누적곱이므로 두 값을 혼동하면 trajectory가 달라진다.

## 방법 — CLIP으로 바꿀 방향 정하기

가장 직접적인 목적함수는 생성 이미지와 목표 텍스트 사이의 CLIP 거리다.

$$
\mathcal{L}_{global}(x_{gen},y_{tar})
=
D_{CLIP}(x_{gen},y_{tar})
\tag{8}
$$

$D_{CLIP}$은 CLIP embedding 공간의 코사인 거리다. 이 손실은 생성 이미지 $x_{gen}$이 목표 텍스트 $y_{tar}$와 가까워지도록 하지만, 입력 이미지에서 무엇이 바뀌었는지는 직접 비교하지 않는다.

DiffusionCLIP은 변화의 방향을 정렬하는 directional CLIP loss를 사용한다.

$$
\Delta T=E_T(y_{tar})-E_T(y_{ref}),
\qquad
\Delta I=E_I(x_{gen})-E_I(x_{ref})
$$

$$
\mathcal{L}_{direction}
(x_{gen},y_{tar};x_{ref},y_{ref})
:=
1-
\frac{\langle\Delta I,\Delta T\rangle}
{\|\Delta I\|\|\Delta T\|}
\tag{9}
$$

$E_T$와 $E_I$는 각각 CLIP의 텍스트·이미지 인코더다. $\Delta T$는 기준 텍스트 $y_{ref}$에서 목표 텍스트 $y_{tar}$로의 의미 변화이고, $\Delta I$는 기준 이미지 $x_{ref}$에서 생성 이미지 $x_{gen}$으로의 변화다. 분모가 각 벡터의 크기를 제거하므로 손실은 변화량의 크기보다 방향 정렬에 집중한다.

미세조정의 목적함수는 다음과 같다.

$$
\mathcal{L}_{direction}
\bigl(\hat{x}_0(\hat{\theta}),y_{tar};x_0,y_{ref}\bigr)
+
L_{id}\bigl(\hat{x}_0(\hat{\theta}),x_0\bigr)
\tag{10}
$$

첫 항은 생성 결과의 의미적 변화가 텍스트 변화와 같은 방향을 향하게 한다. 두 번째 항은 입력의 정체성과 픽셀 구조가 과도하게 바뀌지 않도록 제어한다.

$$
L_{id}\bigl(\hat{x}_0(\hat{\theta}),x_0\bigr)
=
\lambda_{L1}
\left\|x_0-\hat{x}_0(\hat{\theta})\right\|
+
\lambda_{face}
L_{face}\bigl(\hat{x}_0(\hat{\theta}),x_0\bigr)
\tag{11}
$$

$L_1$ 항은 픽셀 수준 차이를 억제하고, $L_{face}$는 얼굴 정체성 보존을 위한 손실이다. 논문은 사용하는 경우 $\lambda_{L1}$과 identity 관련 가중치를 각각 $0.3$으로 설정한다. 다만 방법 설명의 $\lambda_{ID}$와 식 (11)의 $\lambda_{face}$는 표기가 일치하지 않으므로, 구현에서는 서로 다른 추가 손실로 해석하지 않고 실제 loss 구성과 설정값의 대응을 확인해야 한다.

![모든 diffusion time step에서 공유되는 모델과 미세조정 gradient의 흐름](/assets/img/posts/diffusionclip/figure3.png){: w="700" }
_그림 3. 서로 다른 시간 $t$에서 호출되지만 같은 노이즈 예측 모델의 파라미터를 공유하므로, 생성 결과의 CLIP loss가 전체 reverse trajectory를 거쳐 모델에 전달된다._

## 방법 — 여러 속성을 한 번에 결합하기

목표 속성 $i$마다 미세조정된 모델 $\epsilon_{\hat{\theta}_i}$가 있다고 하자. DiffusionCLIP은 모델을 순서대로 실행하지 않고, 같은 $x_t$에서 얻은 예측을 각 reverse step에서 결합한다.

$$
x_{t-1}
=
\sqrt{\alpha_{t-1}}
\sum_{i=1}^{M}\gamma_i(t)
f_{\hat{\theta}_i}(x_t,t)
+
\sqrt{1-\alpha_{t-1}}
\sum_{i=1}^{M}\gamma_i(t)
\epsilon_{\hat{\theta}_i}(x_t,t)
\tag{14}
$$

$\gamma_i(t)$는 시간 $t$에서 모델 $i$의 가중치이며 합은 $1$이다. 첫 번째 합은 모델별 $x_0$ 예측을, 두 번째 합은 노이즈 예측을 결합한다.

식 (4)를 적용하면 노이즈 예측의 가중합은 조건부 분포 score의 가중합으로 연결된다.

$$
\sum_{i=1}^{M}
\gamma_i(t)\epsilon_{\hat{\theta}_i}(x_t,t)
\propto
-\nabla_{x_t}
\log
\prod_{i=1}^{M}
p_{\hat{\theta}_i}(x_t\mid y_{tar,i})^{\gamma_i(t)}
\tag{15}
$$

로그를 취하면 분포의 곱은 가중 로그 확률의 합이 되고, 미분하면 각 score의 가중합이 된다. 따라서 이는 임의의 벡터 평균이 아니라 여러 목표 속성의 조건부 분포를 결합하는 방식으로 해석할 수 있다.

$\gamma_i(t)$를 조절하면 속성별 기여도를 바꿀 수 있다. 논문은 한 번의 sampling으로 multi-attribute transfer를 수행하고, 가중치를 연속적으로 변화시켜 조작 강도의 continuous transition을 만든다. 다만 한 sampling trajectory를 사용하더라도 각 step에서 $M$개 모델의 예측을 계산해야 하므로 모델 평가 비용이 사라지는 것은 아니다.

## 구현 관점에서

추출본에는 독립된 Algorithm 블록이 없으므로, 다음은 식 (6), (12), (13)을 옮긴 최소 의사코드다.

```python
def predict_x0(x_t, eps_t, alpha_t):
    return (
        x_t - sqrt(1.0 - alpha_t) * eps_t
    ) / sqrt(alpha_t)


def ddim_forward(x_0, base_model, time_grid, alpha):
    x_t = x_0

    # time_grid: 0에서 t_0 방향으로 증가
    for t, t_next in adjacent_pairs(time_grid):
        eps_t = base_model(x_t, t)
        x0_pred = predict_x0(x_t, eps_t, alpha[t])

        x_t = (
            sqrt(alpha[t_next]) * x0_pred
            + sqrt(1.0 - alpha[t_next]) * eps_t
        )

    return x_t


def ddim_reverse(x_t0, model, reverse_time_grid, alpha):
    x_t = x_t0

    # reverse_time_grid: t_0에서 0 방향으로 감소
    for t, t_prev in adjacent_pairs(reverse_time_grid):
        eps_t = model(x_t, t)
        x0_pred = predict_x0(x_t, eps_t, alpha[t])

        x_t = (
            sqrt(alpha[t_prev]) * x0_pred
            + sqrt(1.0 - alpha[t_prev]) * eps_t
        )

    return x_t
```

학습에서는 최종 생성 이미지에서 CLIP 및 identity loss를 계산해 모델 파라미터로 gradient를 보낸다. 테스트에서는 미세조정된 파라미터를 고정하고 입력 latent를 목표 이미지로 변환한다.

사전 학습 데이터셋마다 $256\times256$ 실제 이미지 $50$개의 latent를 미리 계산해 두어, fine-tuning iteration마다 같은 deterministic forward process를 반복하지 않는다. 이 캐시는 학습 시간을 줄이지만, $t_0$·forward time grid·base model이 바뀌면 latent의 의미도 달라진다.

최적화에는 Adam을 사용하며 초기 학습률은 $4\times10^{-6}$이다. 학습률은 $50$ iteration마다 $1.2$배씩 선형 증가한다. 학습에는 $S_{for}=40$, $S_{gen}=6$을, 테스트에는 $S_{for}=200$, $S_{gen}=40$을 사용한다.

구현에서 특히 확인할 지점은 다음과 같다.

- $\alpha_t$는 $1-\beta_t$가 아니라 누적곱이다.
- Forward와 reverse time grid의 순서는 반대다.
- 일반 이미지 조작의 DDIM 경로에는 새 Gaussian noise를 넣지 않는다.
- Unseen-domain translation에는 stochastic DDPM이 선택적으로 사용된다.
- $\Delta I$와 $\Delta T$는 절대 embedding이 아니라 기준과 목표의 차이다.
- 다중 속성 sampling에서는 모든 모델을 같은 $x_t$에 적용하고, 각 step에서 $\sum_i\gamma_i(t)=1$을 확인해야 한다.

## 응용 절차가 달라지는 지점

Pretrained-domain 조작에서는 입력 이미지와 사전 학습 도메인이 맞는 상황을 다룬다. 결정론적 DDIM으로 $x_0$를 $x_{t_0}$까지 보낸 뒤, 목표 속성에 맞게 미세조정한 모델로 되돌린다.

Unseen-domain translation에서는 입력과 목표가 모두 사전 학습 도메인 바깥에 있을 수 있다. 이 경우 stochastic DDPM으로 $t_0=500$까지 교란한 뒤, 원래 모델과 미세조정 모델의 reverse sampling 결과를 각각 사전 학습 도메인과 목표 도메인의 결과로 사용한다.

Stroke-conditioned image synthesis도 같은 확산·미세조정 틀의 응용으로 제시된다. 다만 제공된 추출본에는 stroke 조건을 어떤 tensor로 주입하는지나 별도 loss를 사용하는지에 대한 절차가 없으므로, 조건 주입 방식을 더 구체화할 근거는 없다.

## 실험 설정

평가는 CelebA-HQ뿐 아니라 AFHQ-Dog, LSUN-Bedroom, LSUN-Church, ImageNet을 포함한다. 비교 대상은 pSp, e4e, ReStyle with pSp, ReStyle with e4e, HFGI with e4e, TediGAN, StyleCLIP, StyleGAN-NADA다.

정성 비교에서 StyleCLIP과 StyleGAN-NADA는 StyleGAN2 FFHQ-1024 및 LSUN-Church-256을 생성 모델로 사용하고, TediGAN은 StyleGAN FFHQ-256을 사용한다. Inversion에는 각각 e4e, ReStyle+pSp, IDInvert가 사용되며, 공식 checkpoint와 구현 및 얼굴 정렬 알고리즘을 따른다.

정량 평가는 CelebA-HQ의 makeup·tanned·gray hair와 LSUN-Church의 golden·red brick·sunset 속성을 사용한다. MAE·LPIPS·SSIM은 reconstruction 품질을, directional CLIP similarity $S_{dir}$은 텍스트와 이미지 변화 방향의 정렬을 측정한다. SC는 segmentation-consistency, ID는 얼굴 정체성 유사도다.

![기존 텍스트 기반 이미지 조작 방법과 DiffusionCLIP의 정성 비교](/assets/img/posts/diffusionclip/figure5.jpg){: w="800" }
_그림 4. 얼굴과 교회 이미지에서 TediGAN, StyleCLIP, StyleGAN-NADA를 DiffusionCLIP과 비교한 결과다. 입력의 세부·정체성 보존과 목표 속성 반영을 함께 확인할 수 있다._

## 실험에서 확인한 것

### Reconstruction 품질과 $t_0$의 관계

CelebA-HQ 얼굴 이미지 reconstruction 결과는 다음과 같다.

| Method | MAE ↓ | LPIPS ↓ | SSIM ↑ |
|---|---:|---:|---:|
| Optimization | 0.061 | 0.126 | 0.875 |
| pSp | 0.079 | 0.169 | 0.793 |
| e4e | 0.092 | 0.221 | 0.742 |
| ReStyle w pSp | 0.073 | 0.145 | 0.823 |
| ReStyle w e4e | 0.089 | 0.202 | 0.758 |
| HFGI w e4e | 0.062 | 0.127 | 0.877 |
| Diffusion ($t_0=300$) | 0.020 | 0.073 | 0.914 |
| Diffusion ($t_0=400$) | 0.021 | 0.076 | 0.910 |
| Diffusion ($t_0=500$) | 0.022 | 0.082 | 0.901 |
| Diffusion ($t_0=600$) | 0.024 | 0.087 | 0.893 |

모든 $t_0$ 설정에서 Diffusion reconstruction은 비교 방법보다 낮은 MAE와 LPIPS를 기록한다. SSIM은 $t_0=300$에서 $0.914$로 가장 높고, 비교 방법 중 높은 값을 보인 HFGI with e4e의 $0.877$보다 높다.

Diffusion 설정 안에서는 $t_0$가 $300$에서 $600$으로 커질수록 MAE가 $0.020$에서 $0.024$로, LPIPS가 $0.073$에서 $0.087$로 증가하고 SSIM은 $0.914$에서 $0.893$으로 감소한다. 더 큰 형상 변화에는 $t_0=500$ 또는 $700$이 필요할 수 있으므로, reconstruction 품질만으로 $t_0$를 고를 수는 없다.

### 사용자 평가

사용자 연구에는 $50$명이 참여했고 총 $6,000$표를 수집했다. 일반 사례 $20$장과 hard case $20$장, in-domain 속성 $4$개와 out-of-domain 속성 $2$개가 사용됐다. 값은 각 비교 방법보다 DiffusionCLIP 결과를 선호한 비율이다.

| Cases | Domains | vs StyleGAN-NADA (+ ReStyle w pSp) | vs StyleCLIP (+ e4e) |
|---|---|---:|---:|
| Hard cases | In-domain | 69.85% | 69.65% |
| Hard cases | Out-of-domain | 79.60% | 94.60% |
| Hard cases | All domains | 73.10% | 77.97% |
| General cases | In-domain | 58.05% | 50.10% |
| General cases | Out-of-domain | 71.03% | 88.90% |
| General cases | All domains | 62.47% | 63.03% |

Hard case 전체에서는 StyleGAN-NADA 계열 대비 $73.10\%$, StyleCLIP 계열 대비 $77.97\%$가 DiffusionCLIP을 선호했다. Hard case의 out-of-domain 속성에서는 각각 $79.60\%$와 $94.60\%$였다.

반면 일반 사례의 in-domain 비교에서는 StyleGAN-NADA 계열 대비 $58.05\%$, StyleCLIP 계열 대비 $50.10\%$였다. 따라서 결과는 모든 조건에서 큰 차이를 보였다고 보기보다, hard case와 out-of-domain 조건에서 선호 차이가 더 두드러졌다고 읽는 편이 정확하다.

### 텍스트 정렬과 구조·정체성 보존

| Method | CelebA-HQ $S_{dir}$ ↑ | CelebA-HQ SC ↑ | CelebA-HQ ID ↑ | LSUN-Church $S_{dir}$ ↑ | LSUN-Church SC ↑ |
|---|---:|---:|---:|---:|---:|
| StyleCLIP | 0.13 | 86.8% | 0.35 | 0.13 | 67.9% |
| StyleGAN-NADA | 0.16 | 89.4% | 0.42 | 0.15 | 73.2% |
| DiffusionCLIP | 0.17 | 93.7% | 0.70 | 0.20 | 78.1% |

CelebA-HQ에서 DiffusionCLIP의 $S_{dir}$은 $0.17$, SC는 $93.7\%$, ID는 $0.70$이다. LSUN-Church에서는 $S_{dir}$이 $0.20$, SC가 $78.1\%$다. 표에 제시된 두 비교 방법보다 텍스트 방향 정렬과 구조·정체성 보존 지표가 모두 높다.

![강아지 얼굴, 침실, 일반 이미지에서의 텍스트 기반 조작 결과](/assets/img/posts/diffusionclip/figure6.jpg){: w="800" }
_그림 5. AFHQ-Dog, LSUN-Bedroom, 일반 이미지에서 목표 속성을 반영한 조작 사례다. 입력의 형태를 유지하면서 종·화풍·색상·객체 속성을 바꾸는 결과를 보여준다._

## 무엇이 성능을 만들었나

논문의 본문 ablation은 $S_{for}$, $S_{gen}$, $t_0$ 의존성을 분석한다. 학습에 사용한 $(S_{for},S_{gen})=(40,6)$에서는 일부 고주파 세부가 손실되고, 테스트 설정인 $(200,40)$에서는 원본과 구분하기 어려운 reconstruction을 얻는다.

$t_0$는 보존과 편집 가능성의 균형을 바꾼다. 낮은 $t_0$에서는 입력 정보가 더 많이 남아 reconstruction에 유리하지만, 원래 구조에서 멀리 이동하기 어렵다. 높은 $t_0$에서는 변화의 여지가 커지는 대신 입력의 고주파 정보와 세부를 그대로 되찾기 어려워진다.

Identity loss도 모든 편집에 같은 방식으로 적용할 수 없다. 표정이나 머리 색상처럼 원래 얼굴의 픽셀 구조와 인물 정체성이 중요할 때는 $L_1$과 $L_{face}$가 필요하다. 화풍이나 종 변환처럼 큰 형태·색상 변화가 목표인 작업에서는 같은 보존 항이 목표 변화를 제한할 수 있다.

## 비용과 트레이드오프

테스트에서는 forward DDIM에 $S_{for}=200$, 생성에 $S_{gen}=40$ step을 사용하므로 한 번의 조작에도 반복적인 노이즈 예측이 필요하다. 학습에서는 $S_{for}=40$, $S_{gen}=6$으로 step을 줄이고 latent를 미리 계산해 계산량을 줄인다.

Fine-tuning은 NVIDIA Quadro RTX 6000에서 $1$~$7$분이 걸린다. 목표 속성마다 모델을 미세조정하는 구조이므로, 새로운 속성을 추가할 때는 별도의 fine-tuning 비용이 든다.

다중 속성 결합은 속성마다 전체 reverse trajectory를 반복하는 비용을 피하지만, 각 step에서 $M$개 모델의 $\epsilon_{\hat{\theta}_i}(x_t,t)$를 모두 계산해야 한다. 따라서 reverse trajectory는 하나여도 계산량과 모델 파라미터 보관 비용은 속성 수와 함께 늘어날 수 있다.

논문이 직접 확인한 효율화는 학습용 step 축소와 latent 사전 계산이다. 모델 공유, 파라미터 효율적 미세조정, 모델 증류, sampling step의 추가 감소는 제공된 실험에서 확인되지 않는다.

## 한계와 생각해볼 점

저자들은 DiffusionCLIP에 한계와 사회적 위험이 있으므로 올바른 목적을 위해 주의해 사용할 것을 권고한다. 다만 구체적인 한계와 사회적 영향은 Supplementary Section에 위임되어 있고, 제공된 텍스트에는 보충자료 본문이 포함되지 않았다. 따라서 특정 오용 사례나 완화책을 저자의 주장으로 추가할 근거는 없다.

방법에서 직접 확인되는 트레이드오프는 강한 편집과 reconstruction 사이의 충돌이다. $t_0$를 키우면 큰 형상 변화를 다룰 수 있지만, Table 1의 reconstruction 지표는 낮아진다. 새로운 속성마다 fine-tuning이 필요하다는 비용도 있다.

보충자료의 Supplementary Sections A–H에는 유도, 절차, 구조, 추가 실험, 한계와 사회적 영향이 언급되지만 본문은 제공되지 않았다. 따라서 Supplementary Section F의 세부 ablation 수치나 구체적인 사회적 위험은 이 글에서 재구성하지 않았다.