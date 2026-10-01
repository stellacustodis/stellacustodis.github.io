---
title: "DIFFUSION POSTERIOR SAMPLING FOR GENERAL NOISY INVERSE PROBLEMS"
date: 2026-09-08 11:19:29 +0900
permalink: /posts/diffusion-posterior-sampling/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion-model, inverse-problem, posterior-sampling, image-restoration]
description: "DPS가 확산 사전과 관측 우도를 결합해 가우시안·포아송 노이즈가 있는 선형·비선형 역문제의 사후분포를 근사하는 원리와 구현, 실험 결과를 정리한다."
paper:
  zotero_key: "GHMIABNB"
  authors: "Hyungjin Chung*1,2, Jeongsol Kim*1, Michael T. Mccann2, Marc L. Klasky2, Jong Chul Ye1 (* Joint first authors)"
  venue: "ICLR 2023"
  arxiv: "https://arxiv.org/abs/2209.14687"
  code: "https://github.com/DPS2022/diffusion-posterior-sampling"
---

## 세 줄 요약

Diffusion Posterior Sampling(DPS)은 확산 모델이 학습한 데이터 사전분포와 관측 우도를 결합해, 가우시안·포아송 노이즈가 있는 선형 및 비선형 역문제의 사후분포에서 표본을 생성하는 방법이다. 핵심은 계산 불가능한 시간별 우도 $p(y\mid x_t)$를 Tweedie 공식으로 복원한 사후 평균 $\hat{x}_0=\mathbb{E}[x_0\mid x_t]$에서의 우도 $p(y\mid\hat{x}_0)$로 근사하는 것이다. 이 근사 덕분에 SVD나 관측 부분공간 투영 없이도 미분 가능한 측정 연산자 $A$를 역전파하여 데이터 일관성을 주입할 수 있지만, 기본 설정에서는 1000회의 신경망 평가가 필요하고 스텝 크기에 민감하다.

## 이 논문이 풀려는 문제

역문제(inverse problem)는 관측

$$
y=A(x_0)+n
\tag{6}
$$

으로부터 알 수 없는 원본 $x_0\in\mathbb{R}^d$를 복원하는 문제다. $A:\mathbb{R}^d\rightarrow\mathbb{R}^n$은 다운샘플링, 마스킹, 블러, 푸리에 크기 측정처럼 정보를 손실시키는 연산자이고, $n$은 검출기 노이즈다. 하나의 $y$에 대응하는 $x_0$가 여러 개일 수 있으므로 단순히 잔차 $\lVert y-A(x_0)\rVert$만 줄여서는 자연스러운 해를 선택하기 어렵다. DPS는 사전 학습된 확산 모델을 자연 영상의 사전분포(prior)로 사용해 이 모호성을 제한한다.

확산 모델은 각 노이즈 시점의 주변분포 $p_t(x_t)$에 대한 스코어

$$
\nabla_{x_t}\log p_t(x_t)
$$

를 학습한다. 관측이 없는 생성에서는 이 사전 스코어만으로 역확산할 수 있다. 반면 관측 $y$에 조건화된 사후분포를 샘플링하려면 베이즈 분해

$$
\nabla_{x_t}\log p_t(x_t\mid y)
=
\nabla_{x_t}\log p_t(x_t)
+
\nabla_{x_t}\log p_t(y\mid x_t)
\tag{5}
$$

에 따라 우도 스코어 $\nabla_{x_t}\log p_t(y\mid x_t)$도 필요하다. 첫 번째 항은 확산 모델이 제공하지만 두 번째 항은 직접 계산할 수 없다. 측정 모델이 명시적으로 연결하는 변수는 $y$와 깨끗한 데이터 $x_0$뿐이며, 중간 노이즈 상태 $x_t$와 $y$ 사이의 우도는 $x_0$를 주변화해야 하기 때문이다.

$$
\begin{aligned}
p(y\mid x_t)
&=\int p(y\mid x_0,x_t)p(x_0\mid x_t)\,dx_0\\
&=\int p(y\mid x_0)p(x_0\mid x_t)\,dx_0.
\end{aligned}
\tag{7}
$$

두 번째 등호는 $x_0$가 주어지면 $y$와 $x_t$가 조건부 독립이라는 구조에서 나온다. 그러나 $p(x_0\mid x_t)$ 전체를 알고 적분해야 하므로, 알려진 $p(y\mid x_0)$만으로는 일반적인 $p(y\mid x_t)$를 폐형으로 얻을 수 없다.

기존 방법은 이 우도 계산을 다른 제약으로 우회했다. 관측 부분공간 투영 계열은 비조건부 역확산을 한 뒤 $n\simeq0$으로 보고 결과를 측정 집합에 투영한다. 무잡음 선형 문제에서는 사용할 수 있지만, 노이즈가 있으면 $A^T$를 거쳐 관측 노이즈가 증폭될 수 있다. 강제 투영된 표본이 생성 매니폴드를 이탈하면 다음 역확산 단계에서도 아티팩트가 누적된다. 비선형 $A$에는 투영 자체를 정의하거나 계산하기도 어렵다.

SNIPS와 DDRM 같은 방법은 $A$의 특이값 분해(SVD)를 이용해 관측 노이즈와 확산 노이즈를 스펙트럼별로 연결한다. 이 접근은 선형 연산자의 분해가 가능해야 한다. 분리 가능한 가우시안 커널에서는 쓸 수 있지만, 복잡한 모션 블러나 비선형 연산자로 넘어가면 SVD 비용이 지나치게 커지거나 분해를 적용할 수 없다. 관측 차원이 매우 낮은 92% 랜덤 인페인팅에서도 성능이 크게 떨어졌다.

선형 문제에 대해

$$
\nabla_{x_t}\log p_t(y\mid x_t)
\simeq
\frac{A^H(y-Ax)}{\sigma^2+\gamma_t^2}
$$

형태의 휴리스틱 스케줄을 사용하는 접근도 있었다. 이 식은 $t=0$에서만 엄밀하고, 실제 생성에 쓰이는 $t>0$에서는 이론적으로 맞지 않는다. 일반적인 노이즈 통계나 비선형 연산자로 확장하기도 어렵다.

DPS의 출발점은 투영 가능한 집합이나 $A$의 스펙트럼 구조를 찾는 대신, 계산하기 어려운 우도 자체를 미분 가능한 대리 함수로 바꾸는 것이다.

## 핵심 아이디어

DPS는 Eq. 7의 기댓값

$$
p(y\mid x_t)
=
\mathbb{E}_{x_0\sim p(x_0\mid x_t)}
[p(y\mid x_0)]
$$

을 그대로 계산하지 않는다. 먼저 현재 상태 $x_t$에서 깨끗한 원본의 조건부 평균

$$
\hat{x}_0:=\mathbb{E}[x_0\mid x_t]
$$

을 구하고, 함수의 기댓값을 평균에서의 함수값으로 치환한다.

$$
p(y\mid x_t)\simeq p(y\mid\hat{x}_0).
\tag{11}
$$

일반적으로 $\mathbb{E}[f(X)]=f(\mathbb{E}[X])$는 성립하지 않는다. 따라서 Eq. 11은 등식이 아니라 근사다. 이 논문의 기여는 두 부분으로 나뉜다. 첫째, $\hat{x}_0$를 확산 모델의 스코어로 계산할 수 있음을 Tweedie 공식으로 보인다. 둘째, 가우시안 측정에서는 이 치환의 Jensen gap을 상한하여 근사의 오차가 무엇에 좌우되는지 설명한다.

이렇게 얻은 $p(y\mid\hat{x}_0)$는 계산 그래프

```text
x_t → score network → x̂_0 → measurement operator A → residual with y
```

로 표현된다. 따라서 $A$가 미분 가능하다면 자동 미분으로 $\nabla_{x_t}\log p(y\mid\hat{x}_0)$를 구할 수 있다. 선형 여부나 SVD 가능 여부는 필요 조건이 아니다.

![투영 기반 MCG와 DPS의 업데이트 궤적 비교](/assets/img/posts/diffusion-posterior-sampling/figure3.png){: w="800" }
_그림 1. 투영 기반 방식은 노이즈가 섞인 측정 집합으로 표본을 강제로 이동시키면서 매니폴드를 벗어날 수 있다. DPS는 투영을 제거하고 우도 잔차의 그래디언트를 역확산 단계마다 점진적으로 더한다._

## 방법 — 확산 사전에서 사후 스코어까지

### 순방향 확산과 비조건부 역확산

논문은 분산 보존 확률미분방정식(VP-SDE)을 기본 생성 과정으로 둔다.

$$
dx=-\frac{\beta(t)}{2}x\,dt+\sqrt{\beta(t)}\,dw.
\tag{1}
$$

첫 번째 항은 상태를 원점 쪽으로 감쇠시키고, 두 번째 항은 스케줄 $\beta(t)>0$에 따라 Wiener 노이즈를 주입한다. $x(0)\sim p_{\mathrm{data}}$에서 시작한 분포는 $t=T$에서 $\mathcal{N}(0,I)$에 가까워진다. 이 과정의 시간 역전은

$$
dx=
\left[
-\frac{\beta(t)}{2}x
-\beta(t)\nabla_{x_t}\log p_t(x_t)
\right]dt
+\sqrt{\beta(t)}\,d\bar w
\tag{2}
$$

로 주어진다. 역방향 드리프트에 데이터 분포의 스코어가 추가되므로, 이 항을 알아야 노이즈에서 데이터 쪽으로 이동할 수 있다.

스코어 네트워크는 denoising score matching 목적함수

$$
\theta^*
=
\arg\min_\theta
\mathbb{E}
\left[
\left\|
s_\theta(x(t),t)
-
\nabla_{x_t}\log p(x(t)\mid x(0))
\right\|_2^2
\right]
\tag{3}
$$

로 학습한다. 기댓값은 $t\sim\mathcal{U}(\varepsilon,1)$, $x(0)\sim p_{\mathrm{data}}$, $x(t)\sim p(x(t)\mid x(0))$에 대해 취한다. 조건부 전이 스코어를 회귀하지만 최적점에서는 주변 스코어 $s_{\theta^*}(x_t,t)\simeq\nabla_{x_t}\log p_t(x_t)$를 얻게 된다. 이 학습은 DPS 단계에서 새로 수행하는 것이 아니라 사전 학습된 확산 모델이 이미 제공하는 부분이다.

관측에 조건화하면 Eq. 2의 스코어가 Eq. 5의 사후 스코어로 바뀐다.

$$
dx=
\left[
-\frac{\beta(t)}{2}x
-\beta(t)
\left(
\nabla_{x_t}\log p_t(x_t)
+
\nabla_{x_t}\log p_t(y\mid x_t)
\right)
\right]dt
+\sqrt{\beta(t)}\,d\bar w.
\tag{4}
$$

사전 스코어는 자연스러운 영상 쪽으로, 우도 스코어는 관측을 설명하는 영상 쪽으로 표본을 이동시킨다. 우도 항을 빼면 관측과 무관한 비조건부 생성이 되고, 반대로 우도 항을 지나치게 크게 넣으면 관측 노이즈까지 맞추면서 매니폴드를 이탈할 수 있다.

### Tweedie 공식으로 $\hat{x}_0$ 복원하기

VP-SDE와 DDPM의 임의 시점 상태는 다음 폐형으로 쓸 수 있다.

$$
x_t
=
\sqrt{\bar\alpha(t)}x_0
+
\sqrt{1-\bar\alpha(t)}z,
\qquad
z\sim\mathcal{N}(0,I).
\tag{8}
$$

$\bar\alpha(t)$가 작아질수록 $x_t$에서 원본 성분은 줄고 가우시안 노이즈 성분은 커진다. 이 전이에서 $x_0$의 조건부 평균은 Proposition 1에 의해

$$
\hat{x}_0
=
\mathbb{E}[x_0\mid x_t]
=
\frac{1}{\sqrt{\bar\alpha(t)}}
\left(
x_t+
(1-\bar\alpha(t))
\nabla_{x_t}\log p_t(x_t)
\right)
\tag{9}
$$

이다. 실제 계산에서는 참 스코어를 학습된 네트워크로 바꾼다.

$$
\hat{x}_0
\simeq
\frac{1}{\sqrt{\bar\alpha(t)}}
\left(
x_t+
(1-\bar\alpha(t))
s_{\theta^*}(x_t,t)
\right).
\tag{10}
$$

Eq. 9의 모양은 두 역할로 읽을 수 있다. $x_t/\sqrt{\bar\alpha(t)}$는 감쇠된 신호 크기를 되돌리고, 스코어 항은 현재 노이즈 상태에서 확률밀도가 증가하는 방향으로 보정한다. $(1-\bar\alpha(t))$가 붙는 이유는 전이분포의 분산만큼 스코어 보정이 필요하기 때문이다. 이 항을 제거하면 단순한 스케일 복원만 남아 조건부 평균이 되지 않는다.

### 우도의 기댓값을 평균에서 평가하기

Eq. 7의 적분을 직접 계산하는 대신 DPS는

$$
p(y\mid x_t)\simeq p(y\mid\hat{x}_0)
\tag{13}
$$

로 둔다. 근사 오차를 표현하기 위해 논문은 Jensen gap을

$$
\mathcal{J}(f,X)
=
\mathbb{E}[f(X)]-f(\mathbb{E}[X])
\tag{12}
$$

로 정의한다. 여기서 $X=x_0\mid x_t$, $f(x_0)=p(y\mid x_0)$로 놓으면 Eq. 11의 양변 차이가 된다.

가우시안 측정에서 Theorem 1은 그 절댓값을

$$
\mathcal{J}
\le
\frac{d}{\sqrt{2\pi\sigma^2}}
e^{-1/(2\sigma^2)}
\lVert\nabla_x A(x)\rVert
m_1
\tag{14}
$$

로 제한한다. 여기서

$$
m_1
=
\int
\lVert x_0-\hat{x}_0\rVert
p(x_0\mid x_t)\,dx_0
$$

은 조건부 분포가 평균 주변에 얼마나 퍼져 있는지를 나타내고, $\lVert\nabla_xA(x)\rVert:=\max_x\lVert\nabla_xA(x)\rVert$는 측정 연산자가 입력 차이를 얼마나 증폭할 수 있는지를 나타낸다.

이 상한은 근사가 어려워지는 두 조건을 드러낸다. $p(x_0\mid x_t)$가 넓어 $m_1$이 크거나, $A$의 야코비안이 커서 작은 영상 차이가 큰 측정 차이로 변하면 평균 한 점에서 우도를 평가하는 손실이 커질 수 있다. 반대로 논문의 상한에서는 $\sigma\rightarrow\infty$일 때 가우시안 밀도의 립시츠 계수가 0으로 수렴한다. 측정 노이즈가 커지면 우도 함수 자체가 평평해지므로 서로 다른 $x_0$에서 평가한 우도의 차이도 작아진다는 설명이다.

> 이 결과가 “노이즈가 클수록 복원 문제가 쉬워진다”는 뜻은 아니다. 증명되는 것은 $p(y\mid x_t)$를 $p(y\mid\hat{x}_0)$로 바꾸는 근사 오차의 상한이 줄어든다는 점이다.
{: .prompt-info }

Eq. 13을 로그 우도 그래디언트에 적용하면

$$
\nabla_{x_t}\log p(y\mid x_t)
\simeq
\nabla_{x_t}\log p(y\mid\hat{x}_0)
\tag{15}
$$

를 얻는다. 이때 $\hat{x}_0$가 $x_t$와 스코어 네트워크의 함수라는 점이 중요하다. 그래디언트는 잔차만 $A^T$로 보내는 것이 아니라, $A(\hat{x}_0(x_t))$에서 스코어 네트워크까지 이어진 전체 계산 그래프를 따라간다.

### 가우시안 관측의 DPS 업데이트

가우시안 우도는

$$
p(y\mid x_0)
=
\frac{1}{(2\pi)^{n/2}\sigma^n}
\exp\left(
-\frac{\lVert y-A(x_0)\rVert_2^2}{2\sigma^2}
\right)
$$

이다. Eq. 15와 Eq. 5에 이를 넣으면

$$
\nabla_{x_t}\log p_t(x_t\mid y)
\simeq
s_{\theta^*}(x_t,t)
-
\rho\nabla_{x_t}
\lVert y-A(\hat{x}_0)\rVert_2^2,
\qquad
\rho=\frac{1}{\sigma^2}
\tag{16}
$$

를 얻는다. 논문은 같은 최종식을 Eq. 21에서 다시 정리한다. 다만 일반적인 제곱 노름을 그대로 미분하면 가우시안 로그 우도의 계수는 $1/(2\sigma^2)$다. 원문의 $\rho=1/\sigma^2$ 표기는 상수 2를 스텝 크기에 흡수한 관례로 읽어야 하며, 정확한 로그 우도 미분 계수와 구분한다. 실제 DPS는 별도의 경험적 스텝 크기 $\zeta_i$를 사용한다.

첫 항은 학습된 데이터 매니폴드 쪽으로 표본을 이동시키고, 두 번째 항은 복원 후보를 순방향 연산자에 통과시켰을 때 실제 관측과 가까워지도록 이동시킨다. 잔차 항을 빼면 데이터 일관성이 사라지고, 지나치게 키우면 사전분포보다 관측 노이즈를 맞추는 방향이 우세해진다.

### 포아송 관측의 가중 잔차

포아송 측정의 정확한 우도는

$$
p(y\mid x_0)
=
\prod_{j=1}^n
\frac{[A(x_0)]_j^{y_j}
\exp(-[A(x_0)]_j)}
{y_j!}.
\tag{17}
$$

측정값이 작지 않을 때 논문은 이를 가우시안으로 점근 근사한다.

$$
p(y\mid x_0)
\rightarrow
\prod_{j=1}^n
\frac{1}{\sqrt{2\pi[A(x_0)]_j}}
\exp\left(
-\frac{(y_j-[A(x_0)]_j)^2}
{2[A(x_0)]_j}
\right).
\tag{18}
$$

논문은 $y_j>20$에서 오차가 1% 미만이라고 제시한다. 아직 Eq. 18의 분모가 $A(x_0)$에 의존하므로, 미분할 때 가중치까지 함께 움직여 최적화가 불안정해질 수 있다. DPS는 샷 노이즈 근사 $[A(x_0)]_j\simeq y_j$를 분모에 적용한다.

$$
p(y\mid x_0)
\simeq
\prod_{j=1}^n
\frac{1}{\sqrt{2\pi y_j}}
\exp\left(
-\frac{(y_j-[A(x_0)]_j)^2}{2y_j}
\right).
\tag{19}
$$

그 결과 우도 그래디언트가 가중 최소제곱 형태가 된다.

$$
\nabla_{x_t}\log p(y\mid x_t)
\simeq
-\rho\nabla_{x_t}
\lVert y-A(\hat{x}_0)\rVert_\Lambda^2,
\qquad
[\Lambda]_{ii}=\frac{1}{2y_i}.
\tag{20}
$$

최종 사후 스코어는

$$
\nabla_{x_t}\log p_t(x_t\mid y)
\simeq
s_{\theta^*}(x_t,t)
-
\rho\nabla_{x_t}
\lVert y-A(\hat{x}_0)\rVert_\Lambda^2
\tag{22}
$$

이다. 가우시안 DPS와 알고리즘 구조는 같지만 각 측정 빈의 잔차를 동일하게 취급하지 않는다. 관측값에 따라 달라지는 포아송 분산을 $\Lambda$가 반영한다. 이 가중치를 제거한 단순 최소제곱은 안정적일 수 있지만, 논문의 비교에서는 세부 디테일이 뭉개졌다.

## 구현 관점에서

### 이산 시간 알고리즘

논문은 $N=1000$인 DDPM 이산화를 사용한다.

$$
x_i:=x(tT/N),\quad
\beta_i:=\beta(tT/N),\quad
\alpha_i:=1-\beta_i,\quad
\bar\alpha_i:=\prod_{j=1}^i\alpha_j.
$$

역확산 분산 $\tilde\sigma_i$는 학습된 값을 사용한다. 한 스텝의 비조건부 DDPM 업데이트는

$$
x'_{i-1}
=
\frac{\sqrt{\alpha_i}(1-\bar\alpha_{i-1})}
{1-\bar\alpha_i}x_i
+
\frac{\sqrt{\bar\alpha_{i-1}}\beta_i}
{1-\bar\alpha_i}\hat{x}_0
+
\tilde\sigma_i z
$$

이고, 그 뒤 우도 잔차 그래디언트를 더한다. 이를 라이브러리에 종속되지 않는 의사코드로 옮기면 다음과 같다.

```python
# x: (B, C, H, W)
# y: (B, *measurement_shape)
# alpha_bar: (N + 1,)
# zeta_prime: float (스텝 크기 하이퍼파라미터 상수)

x = normal_like_image(batch_size)                 # x_N: (B, C, H, W)

for i in reverse_timesteps:
    x.requires_grad_(True)

    score = score_model(x, i)                     # (B, C, H, W)
    x0_hat = (
        x + (1.0 - alpha_bar[i]) * score
    ) / sqrt(alpha_bar[i])                        # (B, C, H, W)

    z = normal_like(x)                            # (B, C, H, W)
    x_uncond = (
        sqrt(alpha[i]) * (1.0 - alpha_bar[i - 1])
        / (1.0 - alpha_bar[i]) * x
        + sqrt(alpha_bar[i - 1]) * beta[i]
        / (1.0 - alpha_bar[i]) * x0_hat
        + sigma_tilde[i] * z
    )                                             # (B, C, H, W)

    prediction = A(x0_hat)                        # (B, *measurement_shape)
    residual = y - prediction                     # (B, *measurement_shape)

    if noise_model == "gaussian":
        loss = squared_l2(residual)
    elif noise_model == "poisson":
        weight = 1.0 / (2.0 * y)
        loss = weighted_squared_l2(residual, weight)

    grad = gradient(loss, wrt=x)                  # (B, C, H, W)
    step = zeta_prime / norm(residual)
    x = stop_gradient(x_uncond - step * grad)     # x_{i-1}

return x0_hat                                     # (B, C, H, W)
```

이 의사코드에서 학습 루프와 복원 루프는 분리되어 있다. Eq. 3의 학습 루프는 관측 $y$나 연산자 $A$를 사용하지 않는다. DPS 샘플링 루프는 사전 학습된 `score_model`의 파라미터를 갱신하지 않고, 각 시점의 입력 `x`에 대한 그래디언트만 계산한다. 따라서 모델 파라미터의 `.grad`를 누적하거나 옵티마이저를 실행할 필요는 없지만, $x_t\rightarrow s_\theta\rightarrow\hat{x}_0\rightarrow A(\hat{x}_0)$의 입력 미분 경로는 끊으면 안 된다.

### 구현에서 틀리기 쉬운 지점

첫째, $\bar\alpha_i$는 $\alpha_i$ 하나가 아니라 누적곱이다. $\alpha_i$와 $\bar\alpha_i$를 바꾸면 Tweedie 복원식과 DDPM 평균식이 동시에 잘못된다. 스케줄 배열이 0부터 시작하는지 1부터 시작하는지도 확인해야 한다. 알고리즘은 $x_N$을 초기화한 뒤 $i=N-1$부터 $0$까지 반복하므로, 실제 코드에서는 첫 루프가 참조하는 현재 상태와 스케줄 인덱스를 구현체의 DDPM 규약에 맞춰 명시적으로 정렬해야 한다.

둘째, $i=0$에서는 $\bar\alpha_{i-1}$와 노이즈 $z$ 처리가 경계를 벗어나지 않아야 한다. 최종 단계에서 노이즈를 넣을지, $\bar\alpha_0$를 어떤 값으로 정의할지는 사용 중인 이산화 규약과 Algorithm 1·2를 일치시켜야 한다. 단순히 음수 인덱싱을 허용하면 마지막 스케줄 값이 조용히 재사용될 수 있다.

셋째, 우도 그래디언트는 $\nabla_{\hat{x}_0}$가 아니라 $\nabla_{x_i}$다. `x0_hat.detach()`를 호출하면 스코어 네트워크와 Tweedie 식을 통과하는 연쇄법칙이 사라져 Eq. 15·16의 업데이트가 아니다. 반면 한 스텝이 끝난 뒤 새 $x_{i-1}$은 이전 계산 그래프에서 분리해야 전체 1000스텝 그래프를 메모리에 보관하지 않는다.

넷째, 논문의 실제 스텝 크기는 이론식의 $\rho=1/\sigma^2$를 그대로 쓰지 않는다. 정규화된

$$
\zeta_i
=
\frac{\zeta'}
{\lVert y-A(\hat{x}_0(x_i))\rVert}
$$

를 사용한다. 잔차가 매우 작으면 분모가 0에 가까워질 수 있으므로, 재현 구현에서는 공식 코드의 경계 처리 규약을 확인해야 한다. 논문 실험에서도 $1/\sigma^2$를 직접 상수로 쓴 설정은 LPIPS가 크게 나빴다.

다섯째, 포아송 가중치 $1/(2y_j)$는 $y_j=0$에서 정의되지 않는다. 0인 빈을 처리할 때는 공개 코드의 수치적 처리 방식을 확인해야 한다. 안정화 상수를 추가하면 가중치가 달라지므로 이를 임의로 선택해서는 안 된다.

여섯째, 비선형 문제에서는 $A$가 단순 행렬이 아니라 DFT 크기 연산이나 신경망 $F_\phi$일 수 있다. 절댓값, 복소수 연산, 카메라 응답 함수까지 포함한 전체 연산이 자동 미분 가능해야 한다. DPS가 SVD를 요구하지 않는다는 말은 $A$의 계산이 공짜라는 뜻이 아니다. 각 역확산 스텝마다 $A$의 순전파와 입력 방향 역전파가 추가된다.

### 작업별 스텝 크기

논문이 사용한 $\zeta'$는 다음과 같다.

| 데이터·노이즈 | 작업 | $\zeta'$ |
|---|---|---:|
| FFHQ, 가우시안 $\sigma=0.05$ | SR, 인페인팅, 가우시안 디블러링, 모션 디블러링 | 1.0 |
| ImageNet, 가우시안 $\sigma=0.05$ | SR, 인페인팅 | 1.0 |
| ImageNet, 가우시안 $\sigma=0.05$ | 가우시안 디블러링 | 0.4 |
| ImageNet, 가우시안 $\sigma=0.05$ | 모션 디블러링 | 0.6 |
| FFHQ, 포아송 $\lambda=1.0$ | SR, 가우시안 디블러링, 모션 디블러링 | 0.3 |
| FFHQ, 가우시안 $\sigma=0.05$ | 위상 복원 | 0.4 |
| FFHQ, 가우시안 $\sigma=0.05$ | 비균일 디블러링 | 1.0 |

하나의 이론적 상수를 모든 데이터와 연산자에 공유한 것이 아니다. 특히 ImageNet 디블러링과 포아송 문제에서 값을 낮춘 점은 데이터 일관성 그래디언트의 실제 크기가 노이즈 모델과 $A$에 따라 달라진다는 것을 보여준다.

## 어떤 순방향 연산자까지 다루는가

부록은 Eq. 6의 추상적인 $A$를 작업별 확률 모델로 구체화한다. 초해상도는 bicubic 다운샘플링 블록 행켈 행렬 $L_f$를 사용한다.

$$
y\sim\mathcal{N}(y\mid L_fx,\sigma^2I),
\qquad
y\sim\mathcal{P}(y\mid L_fx;\lambda).
\tag{50, 51}
$$

인페인팅은 기본 단위 벡터로 구성된 마스킹 행렬 $P$를 쓴다.

$$
y\sim\mathcal{N}(y\mid Px,\sigma^2I),
\qquad
y\sim\mathcal{P}(y\mid Px;\lambda).
\tag{52, 53}
$$

선형 디블러링에서는 블러 커널 $\psi$의 합성곱을 나타내는 블록 행켈 행렬 $C_\psi$가 연산자다.

$$
y\sim\mathcal{N}(y\mid C_\psi x,\sigma^2I),
\qquad
y\sim\mathcal{P}(y\mid C_\psi x;\lambda).
\tag{54, 55}
$$

이 세 작업은 가우시안과 포아송 버전에서 같은 $A$를 공유하고 우도만 바뀐다. 따라서 DPS 코드에서는 역확산 루프를 유지한 채 잔차 목적함수를 L2와 가중 L2 사이에서 교체할 수 있다.

비균일 디블러링의 물리 모델은 여러 선명 프레임을 적분한 뒤 카메라 응답 함수 $b(x)=x^{1/2.2}$를 적용한다.

$$
y=b\left(\frac{1}{M}\sum_{i=1}^M x[i]\right),
\qquad i=1,\ldots,T.
\tag{56}
$$

정적 흐린-선명 영상 쌍만으로 이를 모사하기 위해 잠재 커널을 추출하는 $G_\phi$와 흐린 영상을 만드는 $F_\phi$를

$$
\phi^*
=
\arg\min_\theta
\sum_{i=1}^N
\left\|
y_i-F_\phi(x_i,G_\phi(x_i,y_i))
\right\|
\tag{57}
$$

로 사전 증류한다. DPS에서는 $G_\phi$ 대신 $k\sim\mathcal{N}(0,\sigma_k^2I)$를 넣은 $F_\phi(x,k)$가 비선형 순방향 연산자다.

$$
\begin{aligned}
y&\sim\mathcal{N}(y\mid F_\phi(x,k),\sigma^2I),\\
y&\sim\mathcal{P}(y\mid F_\phi(x,k);\lambda).
\end{aligned}
\tag{58, 59}
$$

위상 복원은 영상의 2D DFT에서 위상을 버리고 크기만 관측한다.

$$
\begin{aligned}
y&\sim\mathcal{N}(y\mid |\mathcal{F}x_0|,\sigma^2I),\\
y&\sim\mathcal{P}(y\mid |\mathcal{F}x_0|;\lambda).
\end{aligned}
\tag{60, 61}
$$

유일성 조건을 위해 오버샘플링 행렬 $P$를 넣은 실험 모델은

$$
\begin{aligned}
y&\sim\mathcal{N}(y\mid |\mathcal{F}Px_0|,\sigma^2I),\\
y&\sim\mathcal{P}(y\mid |\mathcal{F}Px_0|;\lambda)
\end{aligned}
\tag{62, 63}
$$

이다. $\mathcal{F}P$ 자체는 선형 연산자다. 위상 복원에서 비선형인 부분은 크기를 취하는 $\lvert\mathcal{F}Px_0\rvert$이며, DPS는 이 측정 연산자를 통한 입력 미분을 이용한다.

## 근사의 수학적 근거

### Lemma 1: 일반 지수족의 Tweedie 공식

부록의 출발점은 지수족

$$
p(y\mid\eta)
=
p_0(y)
\exp\left(
\eta^\top T(y)-\phi(\eta)
\right)
\tag{23}
$$

이다. $\eta$는 표준 매개변수, $T(y)$는 충분통계량, $\phi(\eta)$는 누률생성함수다. 밀도가 이 형태이고 필요한 미분이 가능하면 사후 평균 $\hat\eta=\mathbb{E}[\eta\mid y]$는

$$
(\nabla_yT(y))^\top\hat\eta
=
\nabla_y\log p(y)-\nabla_y\log p_0(y)
\tag{24}
$$

를 만족한다.

증명의 핵심은 주변분포를

$$
p(y)=\int p(y\mid\eta)p(\eta)\,d\eta
\tag{25}
$$

로 쓰고 Eq. 23을 대입하는 것이다.

$$
p(y)
=
\int
p_0(y)
\exp(\eta^\top T(y)-\phi(\eta))
p(\eta)\,d\eta.
\tag{26}
$$

이를 $y$로 미분하고 $p(y)$로 나누면

$$
\frac{\nabla_yp(y)}{p(y)}
=
\frac{\nabla_yp_0(y)}{p_0(y)}
+
(\nabla_yT(y))^\top
\int\eta p(\eta\mid y)\,d\eta
\tag{27}
$$

가 된다. 마지막 적분을 조건부 평균으로, 밀도 미분 비율을 로그 미분으로 바꾸면

$$
(\nabla_yT(y))^\top\mathbb{E}[\eta\mid y]
=
\nabla_y\log p(y)-\nabla_y\log p_0(y)
\tag{28}
$$

를 얻는다. 주변분포의 스코어가 사후 평균을 드러내는 구조다. 지수족 표현과 미분 가능성이 없다면 이 조작으로 사후 평균을 분리할 수 없으므로 가정이 필요하다.

### Proposition 1: 확산 전이를 지수족으로 읽기

Eq. 8의 가우시안 전이밀도는

$$
p(x_t\mid x_0)
=
\frac{
\exp\left(
-\frac{\lVert x_t-\sqrt{\bar\alpha(t)}x_0\rVert_2^2}
{2(1-\bar\alpha(t))}
\right)}
{
(2\pi(1-\bar\alpha(t)))^{d/2}
}.
\tag{29}
$$

제곱항을 전개하면 이를

$$
p(x_t\mid x_0)
=
p_0(x_t)
\exp\left(
x_0^\top T(x_t)-\phi(x_0)
\right)
\tag{30}
$$

로 쓸 수 있다. 각 성분은

$$
\begin{aligned}
p_0(x_t)
&\propto
\exp\left(
-\frac{\lVert x_t\rVert_2^2}{2(1-\bar\alpha(t))}
\right),\\
T(x_t)
&=
\frac{\sqrt{\bar\alpha(t)}}{1-\bar\alpha(t)}x_t,\\
\phi(x_0)
&=
\frac{\bar\alpha(t)\lVert x_0\rVert_2^2}
{2(1-\bar\alpha(t))}
\end{aligned}
$$

이다. Lemma 1에 대입하면

$$
\frac{\sqrt{\bar\alpha(t)}}{1-\bar\alpha(t)}
\hat{x}_0
=
\nabla_{x_t}\log p_t(x_t)
+
\frac{x_t}{1-\bar\alpha(t)}
$$

가 남고, 이를 $\hat{x}_0$에 대해 정리하면

$$
\hat{x}_0
=
\frac{1}{\sqrt{\bar\alpha(t)}}
\left(
x_t+
(1-\bar\alpha(t))
\nabla_{x_t}\log p_t(x_t)
\right)
\tag{31}
$$

를 얻는다. 이것이 본문의 Eq. 9다. 즉 Tweedie 복원식은 경험적인 denoising 공식이 아니라 가우시안 확산 전이의 지수족 구조에서 나온 조건부 평균이다.

### Proposition 2와 가우시안 립시츠 상한

평균 $\mu=\mathbb{E}[X]$ 주변에서 함수가

$$
|f(x)-f(\mu)|
\le K|x-\mu|^\alpha
$$

를 만족한다고 하자. Jensen gap에 삼각부등식을 적용하면

$$
\left|
\mathbb{E}[f(X)-f(\mathbb{E}[X])]
\right|
\le
\int |f(X)-f(\mu)|\,dp(X)
\tag{32}
$$

이고, 횔더형 조건을 넣으면

$$
\left|
\mathbb{E}[f(X)-f(\mathbb{E}[X])]
\right|
\le
K\int|x-\mu|^\alpha\,dp(X)
\le
Km_\alpha^\alpha
\tag{33}
$$

가 된다. 따라서 함수의 변화율과 확률변수의 중심 모멘트를 따로 제한할 수 있다. 이 조건이 없다면 평균 주변의 작은 입력 차이가 함수값에서 임의로 크게 증폭될 수 있어 같은 상한을 얻을 수 없다.

Lemma 2는 단변량 가우시안 밀도 $\phi$에 대해

$$
|\phi(x)-\phi(y)|\le L|x-y|
\tag{34}
$$

임을 보인다. 평균값 정리를 사용하면

$$
|\phi(x)-\phi(y)|
\le
\lVert\phi'\rVert_\infty|x-y|,
\tag{35}
$$

따라서 최소 립시츠 상수는

$$
L
=
\lVert\phi'\rVert_\infty
=
\left\|
-\frac{x-\mu}{\sigma^2}\phi(x)
\right\|_\infty.
\tag{36}
$$

도함수의 극값은

$$
\phi''(x)
=
\sigma^{-2}
\left(
1-\sigma^{-2}(x-\mu)^2
\right)\phi(x)
\tag{37}
$$

가 0이 되는 위치에서 찾는다. Eq. 37은 원문 표기를 인용한 것으로, 정규밀도의 정확한 이계도함수는 아래 괄호의 부호가 반대다. 근의 위치에는 영향을 주지 않는다. 논문이 제시한 상수는

$$
L
=
\frac{e^{-1/(2\sigma^2)}}{\sqrt{2\pi\sigma^2}}
\tag{38}
$$

를 얻는다. 위 Eq. 38은 원문에 실린 값이지만 일반적인 표준편차 $\sigma$에 대해 정확하지 않다. 단변량 정규밀도를 직접 미분하면 $\lvert x-\mu\rvert=\sigma$에서 도함수의 절댓값이 최대가 되고, $L=e^{-1/2}/(\sqrt{2\pi}\,\sigma^2)$다. 따라서 극값 위치뿐 아니라 원문 상수에도 문제가 있다. 아래 다변량 상수와 Eq. 14·41·47–49는 원문에 보고된 형태로 구분하며, 검증된 일반 상한으로 그대로 사용하지 않는다. 이 단변량 교정만으로 다변량 정리가 증명되는 것은 아니다.

Lemma 3은 이를 등방성 다변량 가우시안으로 확장한다.

$$
\lVert\phi(x)-\phi(y)\rVert
\le
L\lVert x-y\rVert
\tag{39}
$$

이고, 다변량 평균값 정리로

$$
\lVert\phi(x)-\phi(y)\rVert
\le
\max_z\lVert\nabla_z\phi(z)\rVert
\lVert x-y\rVert
\tag{40}
$$

를 얻는다. 각 차원의 도함수 상한을 합치면

$$
\lVert\phi(x)-\phi(y)\rVert
\le
\frac{d}{\sqrt{2\pi\sigma^2}}
e^{-1/(2\sigma^2)}
\lVert x-y\rVert.
\tag{41}
$$

등방성 공분산 가정은 모든 방향을 하나의 $\sigma^2$와 이 상수로 묶기 위해 필요하다. 일반 공분산이라면 방향별 스케일을 반영하는 다른 상한이 필요하다.

### Theorem 1: 우도 근사 오차의 상한

가우시안 우도를 $h$라 하고 $f(x)=h(A(x))$로 두면 Eq. 7은

$$
p(y\mid x_t)
=
\int p(y\mid x_0)p(x_0\mid x_t)\,dx_0
\tag{42}
$$

에서

$$
p(y\mid x_t)
=
\mathbb{E}_{x_0\sim p(x_0\mid x_t)}
[f(x_0)]
\tag{43}
$$

로 바뀐다. Jensen gap은

$$
\mathcal{J}
=
\left|
\mathbb{E}[f(x_0)]
-f(\mathbb{E}[x_0])
\right|
=
\left|
\mathbb{E}[f(x_0)]
-f(\hat{x}_0)
\right|
\tag{44}
$$

이며 $f=h\circ A$를 대입하면

$$
\mathcal{J}
=
\left|
\mathbb{E}[h(A(x_0))]
-h(A(\hat{x}_0))
\right|.
\tag{45}
$$

절댓값을 적분 안으로 이동해

$$
\mathcal{J}
\le
\int
|h(A(x_0))-h(A(\hat{x}_0))|
\,dP(x_0\mid x_t)
\tag{46}
$$

를 얻는다. Lemma 3의 가우시안 립시츠 상한을 적용하면

$$
\mathcal{J}
\le
\frac{d}{\sqrt{2\pi\sigma^2}}
e^{-1/(2\sigma^2)}
\int
\lVert A(x_0)-A(\hat{x}_0)\rVert
\,dP
\tag{47}
$$

가 된다. 이어서 중간값 정리로 연산자 출력 차이를 입력 차이로 바꾼다.

$$
\mathcal{J}
\le
\frac{d}{\sqrt{2\pi\sigma^2}}
e^{-1/(2\sigma^2)}
\lVert\nabla_xA(x)\rVert
\int
\lVert x_0-\hat{x}_0\rVert
\,dP.
\tag{48}
$$

마지막 적분을 $m_1$으로 묶으면

$$
\mathcal{J}
\le
\frac{d}{\sqrt{2\pi\sigma^2}}
e^{-1/(2\sigma^2)}
\lVert\nabla_xA(x)\rVert m_1
\tag{49}
$$

이 되어 Eq. 14에 도달한다. 증명의 논리는 “우도 함수의 변화율”, “측정 연산자의 변화율”, “조건부 원본의 평균 주변 분산”이라는 세 요인을 차례로 분리하는 것이다. 야코비안 상한이나 $m_1$이 유한하지 않으면 마지막 두 단계에서 전역적인 유한 상한을 보장할 수 없다.

## 실험 설정

실험은 FFHQ와 ImageNet의 256×256 영상에서 수행했다. 각 데이터셋의 검증 영상은 1,000장이다. FFHQ 확산 모델은 검증 셋을 제외한 49,000장으로 100만 스텝 동안 처음부터 학습한 체크포인트를 사용했고, ImageNet에서는 사전 학습된 무조건부 확산 모델을 작업별 파인튜닝 없이 사용했다. 모든 영상은 $[0,1]$ 범위로 정규화했다.

선형 문제는 다섯 가지다.

- 중앙 128×128 영역을 지우는 박스 인페인팅
- 모든 RGB 채널에서 전체 픽셀의 92%를 가리는 랜덤 인페인팅
- bicubic 다운샘플링을 사용하는 초해상도
- 61×61, 표준편차 3.0의 가우시안 커널 디블러링
- 61×61, 강도 0.5로 무작위 생성한 모션 커널 디블러링

정량 초해상도는 ×4이고, 정성 결과에는 ×8과 ×16도 포함된다. 비선형 문제는 오버샘플링된 푸리에 크기로부터 영상을 찾는 위상 복원과, 사전 증류한 $F_\phi(x,k)$를 연산자로 사용하는 비균일 디블러링이다.

가우시안 실험에서는 측정 도메인에 $\sigma=0.05$ 노이즈를 더했다. 포아송 실험은 $\lambda=1.0$이며, $[0,255]$에 비례하는 정수 픽셀에서 포아송 샘플링한 뒤 $[-1,1]$로 정규화했다.

선형 베이스라인에는 DDRM, MCG, Score-SDE/ILVR, PnP-ADMM, ADMM-TV가 포함된다. DDRM은 DDIM 기반 20 NFE와 $\eta_B=1.0$, $\eta=0.85$를 사용했다. PnP-ADMM은 DnCNN을 근위 사상으로 사용하며 $\rho=0.2$, 최대 12회 반복했다. ADMM-TV는

$$
\min_x
\frac{1}{2}\lVert y-A(x_0)\rVert_2^2
+
\lambda\lVert Dx_0\rVert_{2,1}
\tag{68}
$$

을 최적화한다. 디블러링에는 $\lambda=2.7\times10^{-2}$, $\rho=1.4\times10^{-1}$를, 초해상도와 인페인팅에는 같은 $\lambda$와 $\rho=1.0\times10^{-2}$를 사용했다.

위상 복원 베이스라인 ER, HIO, OSS는 정규분포 초기화와 비음수·유한 지지 제약을 사용해 각각 10,000회 반복했다. HIO와 OSS의 $\beta$는 0.9다. 초기화 민감도를 줄이기 위해 각 데이터에서 네 번 실행한 뒤 푸리에 측정치와 추정 진폭 사이 MSE가 가장 작은 결과를 보고했다. 비선형 디블러링에서는 BKS-styleGAN2, BKS-generic, MCG와 비교했다.

평가는 지각 지표 FID·LPIPS와 왜곡 지표 PSNR·SSIM으로 나뉜다. 앞의 두 지표는 낮을수록, 뒤의 두 지표는 높을수록 좋다. 이 구분은 뒤에서 드러나는 perception-distortion tradeoff를 읽는 데 중요하다.

## 실험에서 확인한 것

### 선형 문제의 지각 품질

FFHQ의 Table 1에서 DPS는 다섯 작업의 FID와 LPIPS를 모두 가장 낮게 기록했다.

| 작업 | DPS FID / LPIPS | 다음으로 비교할 수 있는 결과 |
|---|---:|---:|
| SR ×4 | 39.35 / 0.214 | DDRM 62.15 / 0.294 |
| 박스 인페인팅 | 33.12 / 0.168 | MCG FID 40.11, DDRM LPIPS 0.204 |
| 92% 랜덤 인페인팅 | 21.19 / 0.212 | MCG 29.26 / 0.286 |
| 가우시안 디블러링 | 44.05 / 0.257 | DDRM 74.92 / 0.332 |
| 모션 디블러링 | 39.92 / 0.242 | PnP-ADMM 89.08 / 0.405 |

투영 기반 MCG와 Score-SDE의 모션 디블러링 FID는 각각 310.5와 292.2까지 증가했다. 같은 작업에서 LPIPS도 0.702와 0.657이다. 이는 측정 노이즈가 있는 상태에서 투영을 강제할 때 생기는 노이즈 증폭 설명과 일치한다. DDRM은 모션 커널의 SVD를 적용할 수 없어 결과가 없고, 92% 랜덤 인페인팅에서도 FID 69.71, LPIPS 0.587로 악화됐다. 나머지 FFHQ 베이스라인도 모든 작업에서 DPS보다 낮은 지각 성능을 보였다. PnP-ADMM의 FID는 66.52, 151.9, 123.6, 90.42, 89.08이고, ADMM-TV는 110.6, 68.94, 181.5, 186.7, 152.3이었다.

ImageNet Table 2에서도 DPS의 FID는 SR 50.66, 박스 인페인팅 38.82, 랜덤 인페인팅 35.87, 가우시안 디블러링 62.72, 모션 디블러링 56.08로 모든 작업에서 가장 낮다. LPIPS는 각각 0.337, 0.262, 0.303, 0.444, 0.389다. DDRM은 박스 인페인팅 LPIPS 0.245와 가우시안 디블러링 LPIPS 0.427에서 DPS보다 낮았고, SR도 0.339로 가깝다. 그러나 랜덤 인페인팅에서는 FID 114.9, LPIPS 0.665로 무너졌고 모션 디블러링은 수행하지 못했다.

ImageNet의 투영 기반 실패도 뚜렷하다. MCG의 SR FID는 144.5이고 모션 디블러링은 FID 186.9, LPIPS 0.758이다. Score-SDE는 SR FID 170.7, 랜덤 인페인팅 127.1을 기록했다. PnP-ADMM은 모션 디블러링에서 89.76/0.483, ADMM-TV는 138.8/0.525로 DPS보다 지각 지표 수치가 더 높아 성능이 낮았다.

### 비선형 문제

Table 3의 푸리에 위상 복원에서 DPS는 FID 55.61, LPIPS 0.399를 기록했다. HIO는 96.40/0.542, OSS는 137.7/0.635, ER은 214.1/0.738이다. 선형 행렬의 역이나 SVD를 구성하지 않고 $|\mathcal{F}Px|$의 미분을 우도 그래디언트에 사용한 결과다.

Table 4의 비균일 디블러링에서 DPS는 FID 41.86, LPIPS 0.278이다. BKS-styleGAN2는 63.18/0.407, BKS-generic은 141.0/0.640, MCG는 180.1/0.695였다. 여기서 $A$는 사전 증류된 신경망 $F_\phi$이므로, 이 결과는 DPS가 선형 영상 연산자에만 묶이지 않는다는 직접적인 실험 근거다.

![가우시안·포아송 노이즈의 선형 및 비선형 역문제 복원 예시](/assets/img/posts/diffusion-posterior-sampling/figure1.jpg){: w="800" }
_그림 2. 하나의 확산 사전과 미분 가능한 우도 업데이트를 초해상도, 인페인팅, 디블러링, 위상 복원에 재사용할 수 있다는 범위를 보여준다._

### 왜곡 지표에서 드러나는 다른 순위

FFHQ Table 6에서 DPS는 박스 인페인팅 22.47/0.873, 랜덤 인페인팅 25.23/0.851, 모션 디블러링 24.92/0.859로 PSNR과 SSIM 모두 가장 높다. 하지만 SR에서는 PnP-ADMM이 26.55/0.865로 DPS의 25.67/0.852보다 높고, 가우시안 디블러링도 PnP-ADMM이 24.93/0.812로 DPS의 24.25/0.811을 근소하게 앞선다. DDRM은 랜덤 인페인팅에서 9.19/0.319, MCG는 두 디블러링에서 PSNR 6.72와 SSIM 0.051·0.055, Score-SDE는 모션 디블러링에서 6.58/0.102를 기록했다.

ImageNet Table 7에서는 왜곡 지표의 순위가 더 섞인다. DPS는 랜덤 인페인팅에서 22.20/0.739로 두 지표 모두 가장 높고, 박스 인페인팅 PSNR 18.90과 가우시안 디블러링 SSIM 0.706도 가장 높다. 반면 DDRM은 SR 24.96/0.790, 박스 인페인팅 SSIM 0.814, 가우시안 디블러링 PSNR 22.73에서 우세하다. 모션 디블러링에서는 PnP-ADMM이 21.98/0.702로 DPS의 20.55/0.634보다 높다.

따라서 “DPS가 모든 지표에서 항상 최고”라고 정리하면 Table 6·7을 놓치게 된다. 더 정확한 결론은 FID와 LPIPS에서는 전 작업에 걸쳐 강한 우위를 보이고, PSNR과 SSIM에서는 관측 문제와 비교 방법에 따라 기존 최적화·SVD 방식이 앞서는 경우가 있다는 것이다.

### 포아송 복원과 사후 표본의 다양성

포아송 노이즈에서는 Eq. 20의 가중 최소제곱을 사용해 초해상도와 디블러링을 복원했다. 정성 결과에서는 고주파 디테일과 신원을 보존하는 결과를 제시한다. 또한 하나의 관측에서 여러 사후 표본을 생성해 가우시안 환경과 포아송 환경 모두에서 서로 다른 복원 가능성을 보였다. 역문제가 하나의 점 추정이 아니라 사후분포를 요구한다는 관점과 연결되는 실험이다.

## 무엇이 성능을 만들었나

### 스텝 크기의 허용 범위

$\zeta'<0.1$이면 우도 그래디언트가 약해 측정과 일치하지 않는 결과가 나온다. 반대로 $\zeta'>5.0$이면 채도 아티팩트와 노이즈 증폭이 나타난다. 실험적으로 안정적인 범위는 $[0.1,1.0]$이다. 사전 스코어와 데이터 일관성 항 중 어느 하나가 일방적으로 지배하지 않도록 크기를 맞추는 것이 핵심이다.

Table 5는 FFHQ 가우시안 디블러링 100장에서 스텝 스케줄을 비교한다.

| 스케줄 | 초기값 | LPIPS ↓ |
|---|---:|---:|
| Constant | 1.0 | **0.247 ± 0.045** |
| Constant | $1/\sigma^2$ | 0.727 ± 0.038 |
| Linear decay | 0.3 | 0.287 ± 0.045 |
| Linear decay | 1.0 | 0.251 ± 0.044 |
| Exponential decay, $\gamma=0.99$ | 0.3 | 0.421 ± 0.065 |
| Exponential decay, $\gamma=0.99$ | 1.0 | 0.442 ± 0.108 |

이론식의 $\rho=1/\sigma^2$를 그대로 넣은 상수 스케줄이 가장 나쁘다는 점이 중요하다. $\sigma=0.05$인 환경에서 우도 계수를 그대로 사용하는 것보다 잔차 노름으로 정규화한 경험적 스텝이 안정적이었다. 선형 감쇠 1.0은 0.251로 제안 설정과 가깝지만, 감쇠 스케줄은 역확산 후반에 측정 정보를 덜 주입하므로 미세 디테일이 관측과 달라질 수 있다. 지수 감쇠는 두 초기값 모두 0.4 이상의 LPIPS로 악화됐다.

### 포아송 목적함수 선택

원문 부록 Eq. 64에는 로그 항의 관측 계수 $y_j$가 빠져 있다. Eq. 17의 확률질량함수에서 직접 유도한 정확한 포아송 로그 우도는 $\sum_j[y_j\log\lambda_j-\lambda_j-\log(y_j!)]$, $\lambda_j=[A(x_0)]_j$다. 아래 Eq. 64–65는 원문 표기를 인용한 것으로, 정확한 미분식이나 구현식으로 그대로 사용하면 안 된다. 특히 로그 우도의 그래디언트와 음의 로그 우도를 최소화하는 업데이트의 부호를 구분해야 한다. 원문 부록의 표기는

$$
\log p(y\mid x_0)
=
\sum_{j=1}^n
\left[
\log[A(x_0)]_j
-
[A(x_0)]_j
-
\log(y_j!)
\right]
\tag{64}
$$

로 쓰이며, 원문이 Poisson-direct 업데이트라고 기재한 식은

$$
\nabla_{x_t}\log p(y\mid x_0)
=
-\alpha\nabla_{x_t}
\left[
\sum_{j=1}^n
\left(
\log[A(x_0)]_j-[A(x_0)]_j
\right)
\right]
\tag{65}
$$

이다. 이 방식은 로그 항 때문에 수렴이 극히 불안정했고 종종 발산했으며 잔차도 줄지 않았다.

Eq. 18의 가우시안 근사를 그대로 로그로 옮기면

$$
\log p(y\mid x_0)
=
\sum_{j=1}^n
\left[
-\frac{1}{2}\log(2\pi[A(x_0)]_j)
-
\frac{(y_j-[A(x_0)]_j)^2}
{2[A(x_0)]_j}
\right]
\tag{66}
$$

이고, 그 그래디언트는

$$
\nabla_{x_t}\log p(y\mid x_0)
=
\alpha\nabla_{x_t}
\sum_{j=1}^n
\left[
\frac{1}{2}\log(2\pi[A(x_0)]_j)
+
\frac{(y_j-[A(x_0)]_j)^2}
{2[A(x_0)]_j}
\right].
\tag{67}
$$

Poisson-Gaussian 방식은 분모의 입력 의존 가중치 때문에 적절히 수렴하지 못했다. 가중치를 전부 버린 Poisson-LS는 안정적이지만 디테일이 흐려졌다. 반면 Eq. 19·20의 Poisson-shot 방식은 분모를 관측 $y_j$로 고정해 최적화 안정성과 신호 의존 가중치를 함께 확보했고, 비교된 네 목적함수 가운데 고주파 디테일과 신원을 가장 잘 보존했다.

### NFE에 따른 순위 변화

초해상도 ×4에서 신경망 평가 횟수(NFE)가 250 이상이면 DPS가 DDRM, MCG, Score-SDE보다 낮은 LPIPS를 기록했다. 반면 NFE가 100 이하인 구간에서는 DDIM 점프 샘플링을 사용하는 DDRM이 우세했다. DPS의 품질 우위는 충분히 조밀한 역확산을 사용했을 때 나타나며, 작은 NFE에서 자동으로 유지되지는 않는다.

## 비용과 트레이드오프

DPS는 SVD를 없애고 임의의 미분 가능한 $A$를 지원하는 대신, 기본 설정에서 1000 NFE를 사용한다. 단일 RTX 2080Ti에서 1000 NFE 샘플링은 FFHQ 이미지당 약 95초, ImageNet 이미지당 약 600초가 걸렸다. ImageNet의 더 긴 시간은 동일한 “한 장 복원”이라도 사용한 확산 모델의 평가 비용이 전체 지연을 크게 좌우한다는 점을 보여준다.

별도의 벽시계 비교에서는 DDRM 2.029초, PnP-ADMM 3.631초, ER 5.604초, HIO 6.317초, OSS 15.65초, Score-SDE 36.71초, DPS 78.52초, MCG 80.10초, BKS-generic 93.23초, BKS-styleGAN2 891.8초였다. DPS는 MCG와 비슷하고 BKS 계열보다는 빠를 수 있지만, DDRM과 고전 최적화 방법보다 훨씬 느리다.

경량화 관점에서 병목은 두 겹이다. 먼저 1000번의 스코어 네트워크 순전파가 필요하다. 여기에 각 스텝마다 $\hat{x}_0$에서 측정 잔차를 계산하고 그 값을 $x_t$까지 역전파해야 한다. $A$가 신경망 $F_\phi$이면 측정 연산자의 순전파·역전파 비용도 반복된다. 전체 시간은 대략 “스코어 네트워크 평가 비용 + 측정 연산자와 우도 그래디언트 비용”에 NFE를 곱한 형태로 증가한다. 이전처럼 SVD 전처리가 지배적이지는 않지만, 반복 추론 비용과 중간 활성화 메모리가 새로운 병목이 된다.

NFE를 낮추면 계산량과 지연은 거의 직접 줄어들지만, 100 NFE 이하에서는 DDRM보다 LPIPS가 나빠졌다. 따라서 고속 ODE/SDE 샘플러를 결합할 때도 단순히 스텝만 건너뛰어서는 품질을 유지한다고 볼 근거가 없다. 저자도 DPM-Solver 같은 고속 샘플러와의 결합을 후속 방향으로 제시한다.

품질 측면의 지불 비용도 있다. DPS는 수염, 머리카락, 질감 같은 고주파 구조를 생성해 FID와 LPIPS에서 강하지만, 그 구조가 정답 픽셀과 정확히 일치하지 않으면 PSNR은 낮아질 수 있다. Table 6·7에서 PnP-ADMM이나 DDRM이 일부 PSNR·SSIM 항목을 앞선 이유가 여기에 해당한다. 사후 표본다운 자연스러움과 기준 영상에 대한 픽셀 단위 왜곡 최소화는 같은 목적이 아니다.

## 한계와 생각해볼 점

저자가 밝힌 첫 번째 한계는 속도다. DPS는 확산 모델의 반복적 역방향 평가를 그대로 상속하며, 기본 결과에 1000 NFE가 필요하다. SVD를 제거한 유연성이 실시간성으로 이어지는 것은 아니다. 특히 ImageNet 한 장에 약 600초가 걸린 설정은 대규모 평가나 온라인 복원에서 직접적인 병목이다.

두 번째는 perception-distortion tradeoff다. DPS가 FID와 LPIPS에서는 일관되게 우수하지만, PSNR과 SSIM에서는 모든 작업의 최선이 아니다. 자연스러운 고주파 디테일을 생성하는 능력과 정답 영상의 각 픽셀을 평균제곱오차 관점에서 맞추는 능력을 구분해 평가해야 한다.

세 번째는 위상 복원의 불안정성이다. 선형 문제와 비선형 디블러링보다 실패 표본이 자주 발생하며, 여러 표본을 만든 뒤 최선의 결과를 고르는 절차가 필요하다. 그러나 실제 역문제에서는 정답을 모르는 경우가 일반적이므로 “최선”을 어떤 관측 기반 기준으로 고를지가 추가 문제로 남는다. 비교 베이스라인도 네 번의 초기화 중 푸리에 진폭 MSE가 가장 작은 결과를 택했다. DPS를 실제로 사용할 때도 실패 표본을 선별할 관측 기반 기준을 정해야 한다.

Theorem 1도 적용 범위를 구분해 읽어야 한다. 상한은 등방성 백색 가우시안 노이즈, 유한한 연산자 야코비안 상한, 유한한 1차 중심 모멘트를 가정한다. 포아송 DPS는 별도의 점근 근사와 샷 노이즈 치환으로 구성되므로 Eq. 14의 가우시안 Jensen gap 상한이 그대로 포아송 설정을 증명하는 것은 아니다. 또한 상한이 작다는 사실과 실제 로그 우도 그래디언트 오차가 작다는 사실 사이에는 추가 해석이 필요해 보인다. Eq. 13에서 Eq. 15로 근사를 옮길 때도 로그 우도 그래디언트의 근사 오차를 별도로 검토해야 한다.

일반화 범위에는 실험 근거가 있다. FFHQ와 ImageNet, 선형·비선형 연산자, 가우시안·포아송 노이즈에서 같은 구조를 사용했고, ImageNet에서는 작업별 파인튜닝 없이 사전 학습된 무조건부 모델을 적용했다. 다만 실험은 256×256 영상에 한정되어 있으므로 더 높은 해상도나 다른 모달리티에서 동일한 비용·안정성이 유지되는지는 논문에서 확인되지 않는다. 특히 $d$가 들어가는 Eq. 14의 상한과 반복적인 입력 역전파 비용을 고려하면, 해상도가 커질 때의 수학적·계산적 거동은 별도 검증이 필요해 보인다.

DPS의 가장 중요한 설계 선택은 데이터 일관성을 “정확한 투영”으로 보지 않았다는 점이다. 현재 노이즈 상태에서 추정한 $\hat{x}_0$가 관측을 더 잘 설명하도록 작은 그래디언트를 반복해서 넣는다. 이 선택이 복잡한 $A$와 노이즈에 대한 범용성을 열었지만, 동시에 스텝 크기 조정, 1000회의 역전파, 근사 우도의 정확성이라는 새 부담을 만든다. 이 논문의 자리는 선형 무잡음 역문제에 특화된 확산 복원에서, 미분 가능한 물리 모델과 노이즈 우도를 직접 결합하는 일반적인 사후 샘플링으로 범위를 넓힌 지점에 있다.
