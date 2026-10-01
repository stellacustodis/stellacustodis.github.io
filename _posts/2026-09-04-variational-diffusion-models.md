---
title: "Variational Diffusion Models"
date: 2026-09-04 10:07:03 +0900
permalink: /posts/variational-diffusion-models/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion-model, variational-inference, likelihood, generative-model]
description: "연속 시간 확산 모델의 VLB를 SNR 적분으로 재표현하고, 학습 가능한 노이즈 스케줄과 푸리에 특성이 밀도 추정 성능을 높이는 원리를 정리한다."
paper:
  authors: "Diederik Kingma, Tim Salimans, Ben Poole, Jonathan Ho"
  venue: "Advances in Neural Information Processing Systems"
  url: "https://proceedings.neurips.cc/paper/2021/hash/b578f2a52a0229873fefc2a4b06377fa-Abstract.html"
---

## 세 줄 요약

Variational Diffusion Models(VDM)은 확산 모델(diffusion model)의 변분 하한(variational lower bound, VLB)을 신호 대 잡음비(signal-to-noise ratio, SNR)로 다시 표현하고, 연속 시간에서는 손실이 스케줄의 모양이 아니라 양끝 SNR에만 의존한다는 점을 보인다.

이 성질을 이용해 노이즈 스케줄을 VLB 추정기의 분산이 작아지는 방향으로 학습하고, 원본 해상도의 미세한 값을 포착하기 위한 푸리에 특성(Fourier features)을 디노이저에 추가한다.

그 결과 CIFAR-10과 다운샘플링된 ImageNet의 밀도 추정에서 기존 자기회귀(autoregressive), 흐름(flow), VAE, 확산 모델보다 낮은 BPD를 기록하지만, 큰 평가 스텝과 bits-back 압축에는 여전히 많은 신경망 순전파가 필요하다.

## 이 논문이 풀려는 문제

우도 기반 생성 모델(likelihood-based generative model)의 전통적인 강자는 자기회귀 모델이었다. 조건부 확률의 곱으로 데이터 분포를 분해하므로 우도를 다루기 쉽고, 충분한 표현력을 확보할 수 있었기 때문이다. 반면 기존 확산 모델은 지각적 품질에서는 좋은 결과를 보였지만, 밀도 추정 벤치마크에서는 자기회귀 모델에 미치지 못했다.

VDM이 겨냥하는 문제는 단순히 “확산 모델의 BPD를 낮추자”가 아니다. 기존 확산 모델에서는 노이즈가 증가하는 확산 과정과 그 스케줄을 대개 고정했다. 그런데 학습 손실은 어떤 노이즈 수준의 예제를 얼마나 자주, 어떤 가중치로 보게 되는지에 따라 추정 분산이 달라진다. 고정 스케줄은 생성 과정을 정의하는 장치인 동시에 학습 중 몬테카를로 추정의 효율을 좌우하지만, 이전 방식은 이 둘을 분리해서 보기 어려웠다.

이 논문은 이 문제를 SNR 좌표계에서 다시 본다. 핵심 질문은 세 가지다.

첫째, 확산 모델의 VLB를 시간 $t$가 아니라 SNR을 기준으로 쓰면 어떤 구조가 드러나는가. 둘째, 연속 시간 극한에서 노이즈 스케줄의 전체 모양이 실제 목적함수 값을 바꾸는가. 셋째, 목적함수 값을 바꾸지 않는다면 스케줄을 무엇을 위해 학습해야 하는가.

VDM의 답은 다음과 같다. 연속 시간 diffusion loss는 SNR에 대한 적분으로 쓸 수 있고, 적분 구간은 $\text{SNR}_{\min}$과 $\text{SNR}_{\max}$로 정해진다. 따라서 디노이저가 SNR에 맞춰 같은 함수를 표현할 수 있다면, 구간 내부에서 시간을 SNR에 대응시키는 스케줄의 모양은 연속 시간 VLB 자체를 바꾸지 않는다. 그러나 유한한 표본으로 이 적분을 추정할 때의 분산은 스케줄에 따라 달라질 수 있다. 이 때문에 스케줄을 학습하면 목표값을 임의로 낮추는 대신, 같은 목표값을 더 안정적으로 추정하여 최적화를 빠르게 만들 수 있다.

논문은 여기에 푸리에 특성을 결합한다. 입력 픽셀을 $[-1,1]$로 스케일링하고 여러 주파수의 사인과 코사인 채널을 추가하여, 디노이저가 원본 해상도의 미세한 값 차이를 더 잘 구분하도록 한다. 실험에서는 이 특성만 추가하는 것으로 끝나지 않고 SNR 스케줄을 함께 학습해야 효과가 극대화된다.

## 핵심 아이디어: 시간을 SNR 좌표로 바꿔 본다

VDM의 중심에는 “시간은 노이즈 수준을 가리키는 매개변수일 뿐”이라는 관점이 있다. 확산 과정에서 실제로 중요한 것은 $t$라는 숫자보다 그 시점에 신호와 노이즈가 어느 비율로 섞여 있는지다. 같은 SNR을 가리키는 두 시간 표현은, 디노이저가 그 변환에 맞춰 입력 조건을 해석할 수 있다면 같은 노이즈 제거 문제를 나타낼 수 있다.

이 관점은 스케줄의 두 역할을 분리한다.

- SNR의 양끝 값은 모델이 다루는 노이즈 범위를 결정한다.
- 그 양끝 사이를 어떤 속도로 통과할지는 학습 손실을 표본화하는 방식에 영향을 준다.

연속 시간 VLB는 첫 번째에는 의존하지만, 적절한 변수 치환 뒤에는 두 번째에 의존하지 않는다. 반면 실제 학습에서는 한 번에 유한한 수의 $t$만 표본화하므로 두 번째가 추정 분산을 바꾼다. 따라서 스케줄 학습은 연속 시간 목적함수의 의미를 바꾸지 않으면서 최적화 효율을 높이는 분산 감소 기법으로 해석할 수 있다.

논문은 같은 SNR 양끝 조건과 디노이저의 시간·스케일 변환 관계가 충족되면 여러 기존 모델의 생성 분포도 동등하게 볼 수 있다고 설명한다. 여기서 동등성은 서로 다른 모양의 시간 스케줄을 그대로 같은 함수에 넣어도 된다는 뜻이 아니다. 시간 조건과 입력 스케일을 바꾼 만큼 디노이저도 대응되는 변환을 따라야 한다는 조건이 붙는다.

## 방법 1 — 순방향 확산과 학습 가능한 SNR

### 순방향 분포

데이터 $x$에서 시점 $t$의 잠재변수 $z_t$를 만드는 순방향 확산 과정은 다음과 같다.

$$
q(z_t \mid x)
=
\mathcal{N}(z_t;\alpha_t x,\sigma_t^2 I)
\tag{1}
$$

샘플링 형태로 쓰면 다음 관계를 읽을 수 있다.

$$
z_t=\alpha_t x+\sigma_t\epsilon,
\qquad
\epsilon\sim\mathcal{N}(0,I).
$$

$\alpha_t x$는 남아 있는 신호이고, $\sigma_t\epsilon$은 추가된 노이즈다. $\alpha_t$와 $\sigma_t^2$는 시간에 따라 변하는 엄격히 양수인 스칼라 함수다. VDM은 variance-preserving 확산을 사용하므로

$$
\alpha_t=\sqrt{1-\sigma_t^2}
$$

의 관계를 둔다. 이 제약은 신호 성분과 노이즈 성분의 분산 비중을 한 쌍의 보완적인 값으로 묶는다.

이때 신호 대 잡음비는 다음과 같다.

$$
\text{SNR}(t)=\frac{\alpha_t^2}{\sigma_t^2}.
\tag{2}
$$

$t=0$에서 신호가 많이 남아 있다면 SNR은 크고, $t=1$에 가까워져 노이즈가 우세해지면 SNR은 작아진다. 이후 손실의 가중치를 SNR 차이 또는 SNR의 도함수로 표현하기 때문에 Eq. 2는 단순한 설명용 지표가 아니라 전체 유도의 좌표 역할을 한다.

### 단조 신경망으로 만드는 노이즈 스케줄

VDM은 노이즈 분산을 파라미터 $\eta$를 가진 단조 신경망 $\gamma_\eta(t)$로 표현한다.

$$
\sigma_t^2=\operatorname{sigmoid}(\gamma_\eta(t)).
\tag{3}
$$

variance-preserving 조건을 적용하면 신호 계수는

$$
\alpha_t^2=\operatorname{sigmoid}(-\gamma_\eta(t))
\tag{4}
$$

가 된다. 시그모이드의 보완 관계 때문에 Eq. 3과 Eq. 4의 합은 1이 된다. 이를 Eq. 2에 대입하면

$$
\text{SNR}(t)=\exp(-\gamma_\eta(t))
\tag{5}
$$

을 얻는다.

이 매개변수화의 장점은 $\gamma_\eta(t)$ 하나로 $\alpha_t$, $\sigma_t$, SNR을 일관되게 계산할 수 있다는 점이다. 또한 $\gamma_\eta$의 단조성을 보장하면 시간에 따라 노이즈가 증가하고 SNR이 감소하는 확산 과정의 순서를 유지할 수 있다. 이 가정이 깨지면 서로 다른 시간이 노이즈 증가 순서를 따르지 않을 수 있고, 뒤에서 사용하는 $-\text{SNR}'(t)$ 또는 $\gamma_\eta'(t)$의 비음수 가중치 해석도 유지하기 어렵다.

## 방법 2 — 역시간 생성 모델

VDM은 $[0,1]$ 구간을 $T$개로 나누고

$$
s(i)=\frac{i-1}{T},
\qquad
t(i)=\frac{i}{T}
$$

로 정의한다. 이산 시간 생성 모델의 데이터 분포는 다음과 같다.

$$
p(x)
=
\int_z
p(z_1)p(x\mid z_0)
\prod_{i=1}^{T}
p(z_{s(i)}\mid z_{t(i)}).
\tag{6}
$$

생성은 $t=1$의 노이즈에서 시작해 $t=0$ 쪽으로 진행한다. 시작 분포는 구면 가우시안이다.

$$
p(z_1)=\mathcal{N}(z_1;0,I).
\tag{7}
$$

variance-preserving 설정에서 $\text{SNR}(1)$이 충분히 작으면 순방향 과정의 종점 $q(z_1\mid x)$가 이 표준정규분포에 가까워진다. 이 조건이 충분하지 않으면 실제 순방향 종점과 생성 모델의 사전분포 사이 차이가 커지고, Eq. 11의 prior KL 항이 이를 부담해야 한다.

마지막 데이터 분포는 원소별 조건부 확률로 분해한다.

$$
p(x\mid z_0)=\prod_i p(x_i\mid z_{0,i}).
\tag{8}
$$

각 $p(x_i\mid z_{0,i})$는 가능한 모든 이산 $x_i$ 값에 대해 $q(z_{0,i}\mid x_i)$에 비례하도록 두고 정규화한다. $\text{SNR}(0)$이 충분히 클 때에만 이 분포가 실제 $q(x\mid z_0)$에 매우 가까워진다. 따라서 시작점의 SNR을 크게 두는 것은 “데이터에 가까운 잠재변수”를 만드는 데 직접 연결된다.

각 역방향 전이는 정확한 순방향 사후분포에 실제 $x$ 대신 신경망의 예측값을 넣어 정의한다.

$$
p(z_s\mid z_t)
=
q\!\left(
z_s\mid z_t,
x=\hat{x}_\theta(z_t;t)
\right).
\tag{9}
$$

디노이저가 원본 $x$ 자체를 직접 출력하는 대신 노이즈를 예측하도록 매개변수화하면

$$
\hat{x}_\theta(z_t;t)
=
\frac{z_t-\sigma_t\hat{\epsilon}_\theta(z_t;t)}
{\alpha_t}
\tag{10}
$$

가 된다. 순방향 샘플 $z_t=\alpha_t x+\sigma_t\epsilon$에서 예측 노이즈를 빼고 $\alpha_t$로 나누면 원본 추정값이 된다는 구조다.

Eq. 10에서 $\alpha_t$가 분모에 있다는 점은 구현상 중요하다. 높은 노이즈 영역에서는 작은 수치 오차가 $\hat{x}_\theta$에 크게 반영될 수 있다. 논문이 실제 학습 목적함수를 $x$ 예측 오차에서 $\epsilon$ 예측 오차로 바꾸어 쓰는 이유도, Eq. 13과 Eq. 14의 변환을 통해 각 노이즈 수준의 오차와 스케줄 가중치를 더 직접적으로 결합하기 위해서라고 이해할 수 있다.

## 방법 3 — VLB를 diffusion loss로 분해하기

### 세 항으로 나뉘는 음의 변분 하한

우도는 직접 최적화하기 어려우므로 변분 하한을 사용한다.

$$
-\log p(x)
\le
-\operatorname{VLB}(x)
=
D_{\mathrm{KL}}\!\left(
q(z_1\mid x)\,\|\,p(z_1)
\right)
+
\mathbb{E}_{q(z_0\mid x)}
[-\log p(x\mid z_0)]
+
L_T(x).
\tag{11}
$$

세 항의 역할은 서로 다르다.

첫 번째 prior loss는 순방향 확산의 종점 $q(z_1\mid x)$를 생성 시작점 $p(z_1)=\mathcal{N}(0,I)$에 맞춘다. 이 항이 없다면 학습 데이터에서 만들어진 $z_1$과 실제 생성 시 표준정규분포에서 뽑은 $z_1$ 사이의 차이를 제어할 수 없다.

두 번째 reconstruction loss는 $z_0$에서 이산 데이터 $x$를 복원하는 비용이다. 이 항이 없다면 역확산이 데이터에 가까운 잠재변수까지 도달하더라도 그것을 실제 데이터 확률로 연결하는 마지막 단계가 빠진다.

세 번째 $L_T(x)$는 모든 역방향 전이가 순방향 사후분포를 얼마나 잘 근사하는지를 누적한다. 이 항이 디노이저를 직접 학습시키는 diffusion loss다.

부등식에서는 실제 negative log-likelihood 대신 계산 가능한 상한인 negative VLB를 최소화한다. 따라서 최적화하는 값은 정확한 우도 자체가 아니라 변분 근사에서 생기는 갭을 포함한다. 논문이 보고한 VDM의 BPD도 variational bound이며, importance sampling이나 대응하는 continuous normalizing flow 평가를 사용하면 개선될 가능성이 있다고 밝힌다.

### 전이별 KL에서 가중 MSE로

유한한 $T$에서 diffusion loss는 각 구간의 KL 발산을 더한 형태다.

$$
L_T(x)
=
\sum_{i=1}^{T}
\mathbb{E}_{q(z_{t(i)}\mid x)}
D_{\mathrm{KL}}
\left[
q(z_{s(i)}\mid z_{t(i)},x)
\;\|\;
p(z_{s(i)}\mid z_{t(i)})
\right].
\tag{12}
$$

모델 전이 Eq. 9는 실제 $x$ 대신 $\hat{x}_\theta$를 사용하므로, 각 KL 항은 해당 시점에서 원본을 얼마나 정확히 추정했는지와 연결된다. 이 가우시안 전이의 KL을 정리하면 다음 식이 된다.

$$
L_T(x)
=
\frac{T}{2}
\mathbb{E}_{\substack{
\epsilon\sim\mathcal{N}(0,I)\\
i\sim U\{1,T\}
}}
\left[
\bigl(\text{SNR}(s)-\text{SNR}(t)\bigr)
\left\|
x-\hat{x}_\theta(z_t;t)
\right\|_2^2
\right].
\tag{13}
$$

$T$개 항을 전부 계산하는 대신 구간 인덱스 $i$를 균등하게 하나 뽑고 $T$를 곱한다. $\text{SNR}(s)-\text{SNR}(t)$는 그 구간에서 감소한 SNR만큼 복원 오차를 가중한다. SNR이 시간에 따라 감소해야 이 차이가 음수가 되지 않으므로 단조 스케줄 가정이 여기에서도 필요하다.

Eq. 10을 사용해 $x$ 예측 오차를 노이즈 예측 오차로 바꾸고, Eq. 4와 Eq. 5를 대입하면 최종 이산 시간 손실은 다음과 같다.

$$
L_T(x)
=
\frac{T}{2}
\mathbb{E}_{\substack{
\epsilon\sim\mathcal{N}(0,I)\\
i\sim U\{1,T\}
}}
\left[
\left(
\exp(\gamma_\eta(t)-\gamma_\eta(s))-1
\right)
\left\|
\epsilon-\hat{\epsilon}_\theta(z_t;t)
\right\|_2^2
\right].
\tag{14}
$$

$\exp(\gamma_\eta(t)-\gamma_\eta(s))-1$은 인접 시점 사이의 로그 SNR 변화가 만드는 가중치다. $\gamma_\eta$가 단조 증가하면 $t>s$에서 이 값은 비음수가 된다. 이산화 간격이 크면 한 구간이 넓은 노이즈 범위를 담당하여 가중치와 근사 오차가 커질 수 있고, $T$가 커지면 더 촘촘한 구간으로 연속 시간 적분에 접근한다.

Eq. 12에서 Eq. 13으로 가는 세부 유도는 본문에서 부록 E를 참조한다. 가우시안 조건부분포의 KL을 정리하면 SNR 차이로 가중한 MSE와 연결된다.

## 방법 4 — 연속 시간 극한과 스케줄 불변성

### 합을 적분으로 보낸다

$T\to\infty$ 극한에서 Eq. 13의 SNR 차이는 미분 형태가 되고, 이산 합은 적분으로 바뀐다.

$$
L_\infty(x)
=
\frac{1}{2}
\mathbb{E}_{\epsilon\sim\mathcal{N}(0,I)}
\int_0^1
-\text{SNR}'(t)
\left\|
x-\hat{x}_\theta(z_t;t)
\right\|_2^2
dt.
\tag{15}
$$

SNR이 감소하므로 $\text{SNR}'(t)$는 음수이고, 앞의 음수 부호가 손실 가중치를 양수로 만든다. 이 가중치는 시간축에서 동일한 길이의 구간이라도 SNR이 빠르게 변하는 구간을 더 크게 반영한다.

$t\sim U(0,1)$로 표본화하면 적분을 기댓값으로 쓸 수 있다.

$$
L_\infty(x)
=
\frac{1}{2}
\mathbb{E}_{\substack{
\epsilon\sim\mathcal{N}(0,I)\\
t\sim U(0,1)
}}
\left[
-\text{SNR}'(t)
\left\|
x-\hat{x}_\theta(z_t;t)
\right\|_2^2
\right].
\tag{16}
$$

Eq. 5와 노이즈 예측 매개변수화를 적용하면

$$
L_\infty(x)
=
\frac{1}{2}
\mathbb{E}_{\substack{
\epsilon\sim\mathcal{N}(0,I)\\
t\sim U(0,1)
}}
\left[
\gamma_\eta'(t)
\left\|
\epsilon-\hat{\epsilon}_\theta(z_t;t)
\right\|_2^2
\right].
\tag{17}
$$

이 된다. $\gamma_\eta'(t)$는 균등한 시간 표본을 로그 SNR 공간의 가중된 표본으로 바꾼다. 단조 신경망은 $\gamma_\eta'(t)\ge 0$인 구조를 제공하므로 Eq. 17을 비음수 손실로 해석할 수 있다.

### $t$를 버리고 SNR로 적분한다

이제 적분 변수 자체를

$$
v\equiv\text{SNR}(t)
$$

로 바꾼다. SNR 조건으로 디노이저를 다시 쓰면

$$
\tilde{x}_\theta(z,v)
\equiv
\hat{x}_\theta
\left(
z,\text{SNR}^{-1}(v)
\right)
$$

이고, 연속 시간 diffusion loss는

$$
L_\infty(x)
=
\frac{1}{2}
\mathbb{E}_{\epsilon\sim\mathcal{N}(0,I)}
\int_{\text{SNR}_{\min}}^{\text{SNR}_{\max}}
\left\|
x-\tilde{x}_\theta(z_v,v)
\right\|_2^2
dv
\tag{18}
$$

로 표현된다.

이 변수 치환에서 $\text{SNR}'(t)$와 $dt$가 $dv$로 합쳐지므로 스케줄의 국소적인 기울기나 곡선 모양이 식에서 사라진다. 남는 것은 적분 구간의 양끝인 $\text{SNR}_{\min}$과 $\text{SNR}_{\max}$다.

> 연속 시간 VLB가 스케줄의 양끝 SNR에만 의존한다는 말은 스케줄이 학습에서 쓸모없다는 뜻이 아니다. 목적함수의 정확한 적분값은 같아도, 유한한 $t$ 표본으로 만드는 추정기의 분산은 달라질 수 있다.
{: .prompt-tip }

Figure 2는 이산 시간 분할을 늘릴 때 diffusion loss가 연속 시간 적분값으로 접근하는 관계를 보여준다. 고정된 SNR 함수와 충분히 잘 학습된 디노이저라는 조건 아래 $L_{2T}(x)<L_T(x)$가 나타나며, 더 촘촘한 분할이 연속 시간 값에 대한 근사를 개선한다.

![이산 시간 diffusion loss가 연속 시간 적분값으로 수렴하는 관계](/assets/img/posts/variational-diffusion-models/figure2.png){: w="800" }
_그림 1. 고정된 SNR 함수에서 분할 수를 늘릴수록 이산 시간 손실이 연속 시간 적분에 가까워지는 과정을 읽을 수 있다._

### VLB를 넘어선 가중 손실

논문은 SNR 구간별 오차에 임의의 가중치 $w(v)$를 두는 일반화도 제시한다.

$$
L_\infty(x,w)
=
\frac{1}{2}
\mathbb{E}_{\epsilon\sim\mathcal{N}(0,I)}
\int_{\text{SNR}_{\min}}^{\text{SNR}_{\max}}
w(v)
\left\|
x-\tilde{x}_\theta(z_v,v)
\right\|_2^2
dv.
\tag{19}
$$

$w(v)=1$이면 Eq. 18의 VLB 목적함수로 돌아간다. 다른 $w(v)$는 특정 SNR 영역의 복원 정확도를 더 중시할 수 있게 하지만, 그때에는 더 이상 원래 VLB만을 그대로 최적화하는 문제가 아니다. 실험에서 likelihood에 맞춘 CIFAR-10 모델은 FID 7.41을 기록했고, $w(\text{SNR})$을 사용한 weighted loss에서는 FID가 4.0으로 개선되었다. 이는 우도와 지각적 품질이 같은 가중치를 선호하지 않을 수 있음을 보여주는 트레이드오프다.

## 푸리에 특성이 필요한 이유

VDM의 디노이저는 원본 데이터 해상도에서 작동한다. 데이터 $x$를 $[-1,1]$로 스케일링하고, 이로부터 얻는 $z$도 비슷한 크기로 둔다. 그 위에

$$
\sin(2^n\pi z),
\qquad
\cos(2^n\pi z),
\qquad
n\in\{n_{\min},\ldots,n_{\max}\}
$$

형태의 채널을 추가한다.

서로 가까운 픽셀 값은 원래 좌표에서는 작은 차이로만 보이지만, 여러 주파수의 사인·코사인 표현에서는 서로 다른 위상 패턴을 만든다. 따라서 디노이저가 원본 해상도에 존재하는 미세한 값 차이를 표현할 수 있는 입력 기반이 늘어난다.

그러나 실험에서는 푸리에 특성의 효과가 독립적으로 나타나지 않았다. 푸리에 특성을 추가하면 테스트 BPD가 뚜렷하게 개선되지만, 효과를 극대화하려면 SNR 스케줄도 함께 학습해야 했다. 반대로 PixelCNN++에서는 같은 특성이 이득을 주지 않았다. 따라서 “고주파 특성을 붙이면 모든 밀도 모델이 좋아진다”는 결론보다는, 확산 과정의 노이즈 수준과 원본 해상도 디노이징의 결합에서 효과가 나타난다고 읽는 편이 근거에 맞다.

![Fourier features와 SNR 스케줄 학습 조합에 따른 테스트 우도 궤적](/assets/img/posts/variational-diffusion-models/figure5.png){: w="700" }
_그림 2. 푸리에 특성과 학습 가능한 SNR 스케줄을 함께 사용할 때 likelihood 개선 효과가 가장 크게 나타난다._

## 구현 관점에서

### 연속 시간 학습 루프

Eq. 17을 그대로 옮기면 핵심 학습 단계는 다음과 같은 의사코드가 된다. 아래 코드는 수식의 데이터 흐름만 나타내며, 단조 신경망과 미분 API는 각 역할을 나타내는 추상 연산으로 표현한다.

```python
def continuous_vdm_loss(x, denoiser, gamma, fourier_frequencies):
    # x: (B, C, H, W), 원본 데이터
    x = scale_to_minus_one_one(x)                 # (B, C, H, W)

    t = low_discrepancy_times(batch_size=x.B)     # (B, 1, 1, 1), [0, 1]
    eps = standard_normal_like(x)                 # (B, C, H, W)

    gamma_t = gamma(t)                            # (B, 1, 1, 1)
    sigma2_t = sigmoid(gamma_t)                   # (B, 1, 1, 1)
    alpha2_t = sigmoid(-gamma_t)                  # (B, 1, 1, 1)
    sigma_t = sqrt(sigma2_t)                      # (B, 1, 1, 1)
    alpha_t = sqrt(alpha2_t)                      # (B, 1, 1, 1)

    z_t = alpha_t * x + sigma_t * eps             # (B, C, H, W)

    fourier = []
    for n in fourier_frequencies:
        fourier.append(sin((2 ** n) * pi * z_t))  # (B, C, H, W)
        fourier.append(cos((2 ** n) * pi * z_t))  # (B, C, H, W)

    model_input = concat_channels([z_t] + fourier)
    # (B, C * (1 + 2 * len(fourier_frequencies)), H, W)

    eps_hat = denoiser(model_input, t)             # (B, C, H, W)
    gamma_prime_t = derivative_of_gamma(t).reshape(x.shape[0])  # (B,)

    per_example_error = sum_over_chw(
        (eps - eps_hat) ** 2
    )                                              # (B,)

    # 시간 가중치와 표본별 오차를 모두 (B,)로 맞춰 표본끼리 곱한다.
    diffusion_loss = 0.5 * mean(
        gamma_prime_t * per_example_error
    )

    return diffusion_loss
```

논문은 연속 시간 loss를 추정할 때 low-discrepancy sampler를 사용해 VLB 추정 분산을 크게 줄인다. 위 코드의 `low_discrepancy_times`는 이 표본화의 역할을 나타낸다. 재현할 때는 표본기의 구체적인 설정도 맞춰야 한다.

Eq. 11의 전체 negative VLB를 구현하려면 위 diffusion loss 외에도 prior KL과 reconstruction loss가 필요하다.

```python
def full_negative_vlb(x):
    diffusion = continuous_vdm_loss(x, ...)
    prior = kl_q_z1_given_x_to_standard_normal(x)  # (B,)
    reconstruction = negative_log_p_x_given_z0(x)  # (B,)
    return mean(prior + reconstruction) + diffusion
```

여기서 `p(x_i | z_{0,i})`는 가능한 모든 이산 $x_i$에 대해 정규화해야 한다. 단순한 연속값 MSE로 이 항을 대체하면 Eq. 8이 정의한 데이터 likelihood와 다른 목적함수를 구현하게 된다.

### 이산 시간 학습 루프

이산 시간 모델은 Eq. 14의 가중치를 사용한다.

```python
def discrete_vdm_loss(x, denoiser, gamma, T):
    # x: (B, C, H, W)
    x = scale_to_minus_one_one(x)                  # (B, C, H, W)
    eps = standard_normal_like(x)                  # (B, C, H, W)

    i = uniform_integer(low=1, high=T)             # (B,)
    s = (i - 1) / T                                # (B,)
    t = i / T                                      # (B,)
    s = reshape_for_broadcast(s)                   # (B, 1, 1, 1)
    t = reshape_for_broadcast(t)                   # (B, 1, 1, 1)

    gamma_s = gamma(s)                             # (B, 1, 1, 1)
    gamma_t = gamma(t)                             # (B, 1, 1, 1)

    sigma_t = sqrt(sigmoid(gamma_t))               # (B, 1, 1, 1)
    alpha_t = sqrt(sigmoid(-gamma_t))              # (B, 1, 1, 1)
    z_t = alpha_t * x + sigma_t * eps              # (B, C, H, W)

    eps_hat = denoiser_with_fourier(z_t, t)        # (B, C, H, W)
    weight = (exp(gamma_t - gamma_s) - 1).reshape(x.shape[0])  # (B,)

    squared_error = sum_over_chw(
        (eps - eps_hat) ** 2
    )                                              # (B,)

    return (T / 2) * mean(weight * squared_error)
```

인덱싱에서 가장 먼저 확인할 부분은 $i\in\{1,\ldots,T\}$라는 점이다. $i=0$을 허용하거나 $s=i/T$, $t=(i+1)/T$를 사용하면서 배열 크기를 그대로 두면 마지막 구간이 $1$을 넘어갈 수 있다. 수식대로라면 첫 구간은 $(s,t)=(0,1/T)$이고 마지막은 $((T-1)/T,1)$이다.

### 역시간 샘플링 루프

학습에서는 임의의 $t$에서 노이즈를 예측하지만, 생성에서는 $t=1$부터 모든 역방향 전이를 순서대로 거친다. 두 과정은 대칭이 아니다. 학습은 한 표본에서 하나의 시간 또는 구간을 뽑아 손실을 추정할 수 있지만, 생성은 선택한 $T_{\text{eval}}$개의 전이를 실제로 실행해야 한다.

```python
def sample_vdm(batch_shape, denoiser, gamma, T_eval):
    # batch_shape: (B, C, H, W)
    z_t = standard_normal(batch_shape)             # (B, C, H, W), p(z_1)

    for i in range(T_eval, 0, -1):
        t = i / T_eval                             # scalar
        s = (i - 1) / T_eval                       # scalar

        gamma_t = gamma(t)
        sigma_t = sqrt(sigmoid(gamma_t))
        alpha_t = sqrt(sigmoid(-gamma_t))

        eps_hat = denoiser_with_fourier(z_t, t)    # (B, C, H, W)
        x_hat = (z_t - sigma_t * eps_hat) / alpha_t
        # x_hat: (B, C, H, W), Eq. 10

        z_t = sample_reverse_conditional(
            z_t=z_t,
            x_hat=x_hat,
            s=s,
            t=t,
            schedule=gamma,
        )                                          # (B, C, H, W), Eq. 9

    x = sample_normalized_discrete_likelihood(z_t) # (B, C, H, W), Eq. 8
    return x
```

의사코드의 `sample_reverse_conditional`은 역전이 $q(z_s\mid z_t,x)$의 평균과 분산에 따라 표본을 뽑는 연산이다. 다른 확산 모델의 역전이 식을 가져와 채우면 이 논문의 매개변수화와 일치한다고 보장할 수 없다.

### 구현할 때 확인할 지점

첫째, 모든 스케줄 관련 값은 하나의 $\gamma_\eta(t)$에서 일관되게 계산해야 한다. $\sigma_t^2=\operatorname{sigmoid}(\gamma_t)$와 $\alpha_t^2=\operatorname{sigmoid}(-\gamma_t)$를 별도 배열로 만들어 서로 다른 인덱스를 적용하면 variance-preserving 관계가 깨질 수 있다.

둘째, 분산과 표준편차를 구분해야 한다. Eq. 3이 반환하는 것은 $\sigma_t^2$이고, 순방향 샘플링과 Eq. 10에는 $\sigma_t$가 들어간다. $\operatorname{sigmoid}(\gamma_t)$를 그대로 노이즈에 곱하면 수식과 다른 과정이 된다.

셋째, $\gamma_\eta$의 단조성을 유지해야 한다. Eq. 14의 구간 가중치와 Eq. 17의 미분 가중치가 음수가 되지 않으려면 이 조건이 필요하다.

넷째, 연속 시간 학습과 유한 스텝 평가를 구분해야 한다. $T_{\text{train}}=\infty$라는 표기는 모든 시간을 순회한다는 뜻이 아니라 연속 시간 목적함수의 표본 추정을 사용한다는 뜻이다. 평가에서는 여전히 유한한 $T_{\text{eval}}$을 선택할 수 있으며, Table 2에서 작은 $T_{\text{eval}}$은 성능을 크게 떨어뜨린다.

다섯째, 푸리에 특성은 스케일링된 $z$에 적용한다. 논문이 명시한 입력 범위는 $x\in[-1,1]$이고, 이로부터 만든 $z$도 비슷한 크기를 갖는다. 다른 스케일을 사용하면 같은 $2^n\pi z$가 나타내는 주파수 범위가 달라진다.

여섯째, Eq. 17의 diffusion loss만 보고 전체 BPD를 계산해서는 안 된다. Eq. 11의 prior 항과 reconstruction 항이 함께 있어야 negative VLB가 된다.

## 실험 설정

실험은 CIFAR-10과 다운샘플링된 ImageNet 32×32, 64×64에서 수행되었다. CIFAR-10의 extensive data augmentation에는 random flips, 90도 회전, color-channel swapping이 사용되었다.

평가 지표는 밀도 추정을 위한 bits per dimension(BPD), 지각적 품질을 위한 FID, bits-back 압축을 위한 Net BPD다. BPD는 낮을수록 더 짧은 부호 길이에 해당하므로 낮은 값이 좋다.

비교 대상에는 VAE 계열의 ResNet VAE with IAF, Very Deep VAE, NVAE, CR-NVAE, 흐름 계열의 Glow와 Flow++, 자기회귀 계열의 PixelCNN, PixelCNN++, Image Transformer, SPN, Sparse Transformer, Routing Transformer, Sparse Transformer + DistAug, 확산 계열의 DDPM, EBM-DRL, Score SDE, Improved DDPM, LSGM, ScoreFlow가 포함된다.

원문 Appendix B.1은 모든 모델을 TPUv3에서 학습했다고 명시하며, B.2는 데이터셋별 칩 수와 일부 학습 시간을 제시한다. 다만 Sparse Transformer와 동급 하드웨어에서 CIFAR-10 2.80 BPD에 도달하는 wall-clock time이 10배 빠르다고 보고한다. 이 수치는 최종 BPD뿐 아니라 특정 품질 수준까지 도달하는 최적화 효율을 비교한다는 점에서 의미가 있다.

## 실험에서 확인한 것

### 밀도 추정 결과

Table 1의 전체 결과는 다음과 같다. 빈 칸은 0으로 해석하거나 해당 열의 비교에 사용하지 않는다.

| Model | Type | CIFAR-10, no aug. | CIFAR-10, aug. | ImageNet 32×32 | ImageNet 64×64 |
|---|---:|---:|---:|---:|---:|
| ResNet VAE with IAF | VAE | 3.11 |  |  |  |
| Very Deep VAE | VAE | 2.87 |  | 3.80 | 3.52 |
| NVAE | VAE | 2.91 |  | 3.92 |  |
| Glow | Flow |  | 3.35(B) | 4.09 | 3.81 |
| Flow++ | Flow | 3.08 |  | 3.86 | 3.69 |
| PixelCNN | AR | 3.03 |  | 3.83 | 3.57 |
| PixelCNN++ | AR | 2.92 |  |  |  |
| Image Transformer | AR | 2.90 |  | 3.77 |  |
| SPN | AR |  |  |  | 3.52 |
| Sparse Transformer | AR | 2.80 |  |  | 3.44 |
| Routing Transformer | AR |  |  |  | 3.43 |
| Sparse Transformer + DistAug | AR |  | 2.53(A) |  |  |
| DDPM | Diff |  | 3.69(C) |  |  |
| EBM-DRL | Diff |  | 3.18(C) |  |  |
| Score SDE | Diff | 2.99 |  |  |  |
| Improved DDPM | Diff | 2.94 |  |  | 3.54 |
| CR-NVAE | VAE |  | 2.51(A) |  |  |
| LSGM | Diff | 2.87 |  |  |  |
| ScoreFlow, variational bound | Diff |  | 2.90(C) | 3.86 |  |
| ScoreFlow, continuous normalizing flow | Diff | 2.83 | 2.80(C) | 3.76 |  |
| VDM, variational bound | Diff | **2.65** | **2.49(A)** | **3.72** | **3.40** |

VDM은 data augmentation이 없는 CIFAR-10에서 2.65 BPD를 기록했다. 표에 있는 기존 최저값은 Sparse Transformer의 2.80이며, ScoreFlow의 continuous normalizing flow 평가는 2.83이다.

data augmentation을 적용한 CIFAR-10에서는 VDM이 2.49 BPD를 기록했다. 같은 extensive augmentation인 (A)를 사용한 CR-NVAE의 2.51과 Sparse Transformer + DistAug의 2.53보다 낮다. DDPM 3.69, EBM-DRL 3.18, ScoreFlow의 variational bound 2.90과 continuous normalizing flow 평가 2.80은 horizontal flip인 (C)를 사용했으므로, 수치 비교와 별개로 augmentation 조건이 같지 않다는 점을 함께 봐야 한다.

ImageNet 32×32에서 VDM은 3.72 BPD로 Image Transformer 3.77, Very Deep VAE 3.80, PixelCNN 3.83, Flow++와 ScoreFlow variational bound 3.86, NVAE 3.92, Glow 4.09보다 낮다. ImageNet 64×64에서는 3.40으로 Routing Transformer 3.43, Sparse Transformer 3.44, Very Deep VAE와 SPN 3.52, Improved DDPM 3.54, PixelCNN 3.57, Flow++ 3.69, Glow 3.81보다 낮다.

다만 VDM의 값은 variational bound다. 저자들은 importance sampling이나 대응하는 continuous normalizing flow 평가를 사용하면 더 개선될 가능성이 있다고 설명한다. 평가 방식이 다른 ScoreFlow의 두 행처럼, 모델의 학습 결과와 우도 평가 방식은 구분해서 읽어야 한다.

### 이산 시간과 연속 시간의 차이

Table 2는 학습에 사용한 시간 표현과 평가 분할 수가 BPD에 어떤 영향을 미치는지 보여준다.

| $T_{\text{train}}$ | $T_{\text{eval}}$ | BPD | Bits-Back Net BPD |
|---:|---:|---:|---:|
| 10 | 10 | 4.31 |  |
| 100 | 100 | 2.84 |  |
| 250 | 250 | 2.73 |  |
| 500 | 500 | 2.68 |  |
| 1000 | 1000 | 2.67 |  |
| 10000 | 10000 | 2.66 |  |
| $\infty$ | 10 | 7.54 | 7.54 |
| $\infty$ | 100 | 2.90 | 2.91 |
| $\infty$ | 250 | 2.74 | 2.76 |
| $\infty$ | 500 | 2.69 | 2.72 |
| $\infty$ | 1000 | 2.67 | 2.72 |
| $\infty$ | 10000 | 2.65 |  |
| $\infty$ | $\infty$ | 2.65 |  |

적은 분할로 평가할 때에는 같은 분할 수로 VLB를 직접 최적화한 이산 시간 모델이 유리하다. $T=10$에서 이산 시간 모델은 4.31 BPD지만 연속 시간 학습 모델을 10스텝으로 평가하면 7.54 BPD다. $T=100$에서도 각각 2.84와 2.90, $T=250$에서는 2.73과 2.74, $T=500$에서는 2.68과 2.69다.

분할 수가 커질수록 차이는 줄어든다. $T=1000$에서는 두 방식 모두 2.67 BPD이고, $T=10000$에서는 연속 시간 모델이 2.65로 이산 시간 모델의 2.66보다 낮다. 연속 시간 학습과 평가를 함께 사용한 결과도 2.65다.

Bits-Back Net BPD는 연속 시간 학습 모델을 유한 스텝으로 평가했을 때 $T=10$에서 7.54, $100$에서 2.91, $250$에서 2.76, $500$과 $1000$에서 각각 2.72다. $T_{\text{eval}}$을 늘리면 VLB 기반 BPD는 계속 개선되지만, 압축의 순 codelength와 이론적 negative VLB 사이에는 갭이 남는다.

## 무엇이 성능을 만들었나

### 학습 가능한 SNR 양끝 값

Ho et al. [2020]의 스케줄로 SNR을 고정하면 최대 log-SNR이 약 8에 묶이고 negative likelihood는 4 BPD 이상에 머물렀다. SNR endpoint를 학습하면 최대 log-SNR이 13.3까지 올라가며, 푸리에 특성과 결합했을 때 최고 성능을 달성했다.

이 결과는 스케줄 불변성을 오해하면 설명하기 어렵다. Eq. 18은 연속 시간 VLB가 스케줄의 내부 모양에는 의존하지 않는다고 말하지만, 양끝 값에는 의존한다. 최대 log-SNR을 8에서 13.3으로 바꾸는 것은 단순한 시간 재매개변수화가 아니라 적분 구간의 끝을 바꾸는 일이다. 따라서 endpoint 학습은 목적함수와 모델링 범위에 영향을 줄 수 있다.

### 스케줄 모양과 추정 분산

Figure 4b에서는 모든 스케줄의 endpoint를 같게 맞춰 공통 VLB 추정값이 2.66이 되도록 했다. 이 조건에서는 스케줄 모양이 연속 시간 목적함수 값을 바꾸지 않아야 한다. 그러나 BPD 추정 분산은 크게 달랐다.

| SNR 스케줄 | Var(BPD) |
|---|---:|
| Learned schedule | **0.53** |
| log-SNR-linear | 6.35 |
| $\beta$-linear | 31.6 |
| $\alpha$-cosine | 31.1 |

학습된 스케줄의 분산 0.53은 log-SNR-linear의 6.35보다 작고, $\beta$-linear 31.6 및 $\alpha$-cosine 31.1보다 훨씬 작다. endpoint가 같으므로 이 차이는 더 좋은 VLB 자체를 선택한 결과가 아니라, 같은 VLB 적분을 유한 표본으로 추정할 때 변동이 줄어든 결과다. 기울기의 분산이 줄면 동일한 계산량에서 더 안정적인 최적화 신호를 얻을 수 있다.

![학습된 SNR 스케줄과 기존 스케줄의 log-SNR 궤적 비교](/assets/img/posts/variational-diffusion-models/figure4.png){: w="500" }
_그림 3. Figure 4a는 같은 endpoint를 잇는 네 스케줄의 log-SNR 궤적을 비교한다. 분산 수치는 위 표에 정리한 Figure 4b의 결과다._

### 푸리에 특성과 스케줄의 결합

Figure 5의 ablation에서는 푸리에 특성을 추가할 때 테스트 BPD가 뚜렷하게 개선된다. 다만 최고 효과를 얻으려면 SNR 스케줄도 함께 학습해야 한다. PixelCNN++에서는 푸리에 특성이 이득을 주지 않았으므로, 개선을 입력 인코딩 하나의 보편적인 효과로 돌리기는 어렵다.

Ablation을 종합하면 성능은 세 요소의 결합으로 이해할 수 있다.

- SNR endpoint 학습은 모델이 다루는 노이즈 범위를 조정한다.
- 스케줄의 내부 모양 학습은 VLB 추정 분산을 줄인다.
- 푸리에 특성은 원본 해상도에서 미세한 값 차이를 디노이저가 표현하도록 돕는다.

이 세 역할은 서로 같지 않다. endpoint, 내부 스케줄 모양, 입력 표현을 분리해서 보아야 Eq. 18의 불변성과 실험 결과가 충돌하지 않는다.

## 비용과 트레이드오프

VDM은 likelihood 성능을 높였지만 비용을 없애지는 않는다.

학습에서는 연속 시간 적분을 매번 전부 계산하지 않고 시간 표본으로 추정한다. low-discrepancy sampler와 학습된 스케줄은 이 추정의 분산을 낮추므로, 같은 목적값에 도달하는 최적화 효율을 높이는 방향으로 작동한다. 실제로 Sparse Transformer와 동급 하드웨어에서 2.80 BPD에 도달하는 wall-clock time이 10배 빠르다고 보고되었다. 구체적인 하드웨어와 데이터셋별 설정은 원문 Appendix B에서 확인할 수 있다. 예를 들어 증강 없는 CIFAR-10 모델은 TPUv3 칩 8개에서 학습했다. 전체 설정을 동일한 단일 비용으로 일반화하지는 않는다.

추론과 평가는 다른 병목을 가진다. 학습은 한 배치에서 하나의 시간 표본으로 Eq. 17을 추정할 수 있지만, 생성이나 유한 시간 우도 평가는 $T_{\text{eval}}$개의 역전이를 순차적으로 거쳐야 한다. Table 2에서 $T_{\text{eval}}=10$인 연속 시간 모델은 7.54 BPD이고, $100$에서 2.90, $1000$에서 2.67, $10000$에서 2.65로 개선된다. 품질과 평가 정확도를 높이려면 더 많은 신경망 순전파를 지불해야 한다.

경량화 관점에서 병목은 명확하다. 디노이저 한 번의 비용만 줄여도 총비용은 평가 스텝 수만큼 반복되며, 반대로 네트워크를 그대로 둔 채 스텝 수를 줄이면 Table 2처럼 BPD가 악화될 수 있다. 이 논문에서 학습 가능한 스케줄은 최적화 분산을 줄이지만, 큰 $T_{\text{eval}}$에서 필요한 순차적 순전파 횟수 자체를 제거하지는 않는다.

푸리에 특성도 추가 입력 채널을 만든다. 이로 인해 늘어나는 파라미터 수와 메모리, 연산량은 별도로 측정해야 한다.

또 다른 트레이드오프는 목적함수 사이에 있다. likelihood에 맞춘 모델은 FID 7.41이었고, weighted loss는 FID를 4.0으로 개선했다. 지각적 품질을 위해 $w(v)$를 바꾸면 원래 VLB와 다른 노이즈 구간 가중치를 사용한다. 즉 likelihood 최적화와 지각적 생성 품질 사이에 하나의 고정된 최적 가중치가 있다고 볼 근거는 없다.

## 계보와 일반화 가능성

VDM은 기존 확산 모델의 기본 구조를 버리지 않는다. 순방향 가우시안 확산, 역시간 디노이징, VLB라는 틀을 유지하면서 세 부분을 재구성한다.

첫째, 고정된 diffusion process를 학습 가능한 단조 SNR 스케줄로 바꾼다. 둘째, VLB를 SNR 적분으로 표현하여 연속 시간 스케줄 불변성과 분산 감소 역할을 분리한다. 셋째, 원본 데이터 해상도에서 미세한 값을 다루기 위해 푸리에 특성을 추가한다.

결과는 CIFAR-10뿐 아니라 ImageNet 32×32와 64×64에서도 개선되었다. 따라서 적어도 서로 다른 데이터셋과 두 이미지 해상도에서 likelihood 개선이 유지된다는 근거는 있다. 그러나 다른 모달리티, 더 큰 해상도, 다른 디노이저 규모에서도 같은 결론이 유지되는지는 이 실험으로 확인할 수 없다.

기존 자기회귀·VAE·flow·diffusion 계열을 폭넓게 비교했다는 점은 밀도 추정에서의 위치를 보여준다. FID의 likelihood 목적 7.41과 weighted loss 4.0을 비교할 때도, 이를 지각적 생성 품질 전반에서 모든 기준선을 능가한다는 결론으로 확대해서는 안 된다.

## 한계와 생각해볼 점

저자들이 명시한 한계는 lossless compression 비용이다. $T_{\text{eval}}$을 매우 크게 두고 BB-ANS 기반 bits-back coding을 적용하면 state-of-the-art net codelength를 달성할 수 있다고 보고하지만, 실제 Net BPD와 이론적인 최적 코딩 길이인 negative VLB 사이에는 여전히 차이가 남는다. 또한 매우 많은 신경망 순전파가 필요해 계산 비용이 크다.

이 한계는 Table 2에서도 드러난다. 평가 스텝을 늘리면 BPD는 개선되지만, $T_{\text{eval}}=1000$에서도 Bits-Back Net BPD는 2.72이고 같은 행의 BPD는 2.67이다. 작은 $T$에서는 계산량이 적은 대신 BPD가 나빠지고, 큰 $T$에서는 이론값에 가까워지는 대신 순차 계산량이 늘어난다.

구현 관점에서 특히 확인해야 할 부분은 스케줄 학습과 endpoint 학습의 분리다. Eq. 18에 따르면 endpoint가 고정되었을 때 내부 스케줄 모양은 연속 시간 VLB 값을 바꾸지 않고 추정 분산을 바꾼다. 반면 최대 log-SNR을 약 8에서 13.3으로 바꾸는 endpoint 학습은 적분 구간 자체를 바꾼다. 두 효과를 하나의 “learned schedule”로 묶으면 목적함수 개선과 분산 감소를 혼동하기 쉽다.

또한 연속 시간 목적함수의 스케줄 불변성에는 디노이저가 시간·SNR 변환에 대응할 수 있다는 조건이 붙는다. 유한한 모델 용량이나 불완전한 최적화에서도 동등성이 어느 정도 유지되는지는 이 실험만으로 일반화할 수 없다. 논문은 학습된 스케줄의 낮은 추정 분산을 보여주지만, 다른 데이터나 모델 규모에서도 같은 스케줄 형태가 최적인지는 확인되지 않는다.
