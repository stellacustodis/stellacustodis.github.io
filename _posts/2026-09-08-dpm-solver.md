---
title: "DPM-Solver: A Fast ODE Solver for Diffusion Probabilistic Model Sampling in Around 10 Steps"
date: 2026-09-08 11:00:51 +0900
permalink: /posts/dpm-solver/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion-model, ode-solver, exponential-integrator, fast-sampling]
description: "확산 ODE의 선형 항을 정확히 풀고 신경망 항만 지수 적분기로 근사해 10~20회의 함수 평가로 샘플링하는 DPM-Solver의 원리와 구현, 실험 결과를 정리한다."
paper:
  zotero_key: "G9D4WMD2"
  authors: "Cheng Lu, Yuhao Zhou, Fan Bao, Jianfei Chen, Chongxuan Li, Jun Zhu"
  venue: "NeurIPS 2022 (36th Conference on Neural Information Processing Systems)"
  code: "https://github.com/LuChengTHU/dpm-solver"
---

## 세 줄 요약

DPM-Solver는 확산 모델의 probability flow ODE를 일반적인 블랙박스 ODE로 다루지 않고, 선형 항과 신경망 비선형 항으로 이루어진 semi-linear ODE로 해석한다. 선형 항은 상수변화법으로 정확히 풀고, half-log-SNR 변수에서 남은 신경망 적분만 1·2·3차 지수 적분기로 근사해 선형 항의 이산화 오차를 제거한다. 추가 학습 없이 약 10~20회의 신경망 평가로 샘플을 생성하며, CIFAR-10 연속 시간 모델에서는 NFE 10에서 FID 4.70, NFE 20에서 FID 2.87을 기록했다.

## 이 논문이 풀려는 문제

확산 확률 모델(diffusion probabilistic model, DPM)은 정확한 우도 계산이 가능하고 높은 이미지 생성 품질을 보이지만, 샘플링이 느리다. 생성 과정이 시간 $T$의 잡음에서 시간 0의 데이터로 이동하는 순차적 과정이고, 각 스텝마다 대규모 잡음 예측 신경망을 호출하기 때문이다. 기존 방식은 고품질 샘플 하나를 얻기 위해 수백에서 수천 번의 함수 평가를 요구할 수 있다.

이 병목을 줄이려는 접근은 크게 학습 기반 방법과 무학습(training-free) 방법으로 나뉜다.

학습 기반 방법에는 knowledge distillation이나 잡음 수준·샘플링 궤적을 학습하는 방식이 있다. 샘플러 자체를 데이터와 모델에 맞춰 최적화할 수 있지만, 비용이 큰 추가 학습 단계가 필요하다. 모델, 데이터셋, 목표 스텝 수가 달라질 때 적응하기도 어렵다. Progressive distillation은 증류 과정에서 원래 DPM이 가진 정보 일부를 잃을 수 있다. 예를 들어 증류된 모델은 $[0,T]$의 모든 시간에서 잡음 또는 스코어 함수를 예측하는 원본 모델의 성질을 그대로 보존하지 않는다.

무학습 방법은 사전학습 모델을 변경하지 않고 적용할 수 있다는 장점이 있다. Implicit 또는 analytical process, 범용 미분방정식 솔버, dynamic programming 등이 이 범주에 들어간다. 그러나 기존 무학습 샘플러도 좋은 품질에 도달하려면 대체로 약 50 NFE(Number of Function Evaluations)가 필요했다. 여기서 NFE는 잡음 예측 신경망 $\epsilon_\theta(x_t,t)$의 호출 횟수다.

확산 SDE 자체를 큰 스텝으로 이산화하는 데에도 한계가 있다. Wiener process의 무작위성 때문에 스텝 크기가 제한되며, 특히 고차원에서는 큰 스텝을 사용할 때 비수렴 문제가 생길 수 있다. 그래서 결정론적 궤적을 갖는 probability flow ODE가 고속 샘플링에 더 적합한 출발점이 된다.

하지만 ODE로 바꾸는 것만으로 충분하지 않다. RK45 같은 범용 블랙박스 솔버는 diffusion ODE의 전체 우변을 하나의 함수로 보고 적분한다. 그러면 정확히 처리할 수 있는 선형 항까지 수치적으로 근사하면서 선형 항과 비선형 항 양쪽에서 이산화 오차를 누적한다. 약 10스텝의 few-step 영역에서는 이 오차가 너무 커져 수렴하지 못할 수 있다.

일반적인 명시적 Runge–Kutta(RK) 방법도 같은 구조적 문제를 가진다. Semi-linear ODE의 선형 부분에 대한 엄밀해에는 지수 계수가 포함된다. 이를 전체 우변과 함께 직접 이산화하면 선형 항의 오차가 지수적으로 커질 수 있고, 큰 스텝에서 수치적으로 불안정해질 수 있다.

DPM-Solver의 질문은 따라서 단순히 “더 높은 차수의 ODE 솔버를 쓰면 빨라지는가?”가 아니다.

> Diffusion ODE에서 이미 정확히 풀 수 있는 부분과 신경망 때문에 근사해야 하는 부분을 분리하면, 같은 NFE에서 더 큰 스텝을 안정적으로 사용할 수 있는가?
{: .prompt-info }

논문은 이 질문에 답하기 위해 diffusion ODE의 semi-linear 구조를 직접 이용한다.

## 출발점 — 확산 과정에서 결정론적 ODE까지

### 순방향 과정과 잡음 스케줄

데이터 $x_0\sim q_0(x_0)\in\mathbb{R}^D$에 잡음을 더하는 순방향 과정은 다음 조건부 분포로 정의된다.

$$
q_{0t}(x_t\mid x_0)
=
\mathcal{N}\left(x_t\mid \alpha(t)x_0,\sigma^2(t)I\right).
\tag{2.1}
$$

$\alpha(t)$와 $\sigma(t)$는 양수이며 유계 도함수를 갖는 미분 가능한 함수다. 같은 표기를 간단히 $\alpha_t,\sigma_t$로 쓴다. 시간 $t$가 증가할수록 신호 대 잡음비

$$
\frac{\alpha_t^2}{\sigma_t^2}
$$

는 엄격히 감소한다. 종점의 분포는

$$
q_T(x_T)\approx\mathcal{N}(0,\tilde{\sigma}^2I)
$$

가 되도록 구성한다.

Eq. (2.1)은 다음 선형 SDE가 만드는 전이 분포로 보존될 수 있다.

$$
dx_t=f(t)x_t\,dt+g(t)\,dw_t,
\qquad x_0\sim q_0(x_0).
\tag{2.2}
$$

여기서 $w_t\in\mathbb{R}^D$는 표준 Wiener process다. 잡음 스케줄과 SDE 계수의 일치 조건은

$$
f(t)=\frac{d\log\alpha_t}{dt},
\qquad
g^2(t)
=
\frac{d\sigma_t^2}{dt}
-
2\frac{d\log\alpha_t}{dt}\sigma_t^2
\tag{2.3}
$$

로 주어진다. $f(t)x_t$는 상태에 선형인 드리프트이고, $g(t)$는 무작위 잡음의 크기를 정한다.

### 역방향 SDE와 잡음 예측 모델

순방향 확산을 시간 $T$에서 0으로 되돌리는 역방향 SDE는

$$
dx_t=
\left[
f(t)x_t-g^2(t)\nabla_x\log q_t(x_t)
\right]dt
+
g(t)d\bar w_t,
\qquad x_T\sim q_T(x_T)
\tag{2.4}
$$

이다. $\nabla_x\log q_t(x_t)$가 시간 $t$에서의 스코어다. 실제 데이터 분포의 스코어는 알 수 없으므로, 신경망 $\epsilon_\theta(x_t,t)$가 스케일된 스코어

$$
-\sigma_t\nabla_x\log q_t(x_t)
$$

를 추정하도록 학습한다.

그 목적함수는 다음 두 형태로 쓸 수 있다.

$$
\begin{aligned}
L(\theta;\omega(t))
&:=
\frac12\int_0^T
\omega(t)
\mathbb{E}_{q_t(x_t)}
\left[
\left\|
\epsilon_\theta(x_t,t)
+
\sigma_t\nabla_x\log q_t(x_t)
\right\|_2^2
\right]dt \\
&=
\frac12\int_0^T
\omega(t)
\mathbb{E}_{q_0(x_0)}
\mathbb{E}_{q(\epsilon)}
\left[
\left\|
\epsilon_\theta(x_t,t)-\epsilon
\right\|_2^2
\right]dt+C,
\end{aligned}
$$

여기서

$$
\epsilon\sim\mathcal{N}(0,I),
\qquad
x_t=\alpha_tx_0+\sigma_t\epsilon
$$

이고 $C$는 $\theta$와 무관한 상수다. 첫 번째 표현은 스코어 추정 문제이고, 두 번째 표현은 주입한 잡음 $\epsilon$을 맞히는 회귀 문제다. $\omega(t)$는 시간별 손실 가중치를 조절한다.

참 스코어를 $-\epsilon_\theta/\sigma_t$로 치환하면 역방향 SDE는

$$
dx_t=
\left[
f(t)x_t+
\frac{g^2(t)}{\sigma_t}\epsilon_\theta(x_t,t)
\right]dt
+
g(t)d\bar w_t,
\qquad x_T\sim\mathcal{N}(0,\tilde{\sigma}^2I)
\tag{2.5}
$$

가 된다.

### Probability flow ODE

역방향 SDE와 각 시간의 한계 분포 $q_t(x_t)$가 같은 결정론적 과정은 다음 probability flow ODE다.

$$
\frac{dx_t}{dt}
=
f(t)x_t
-
\frac12g^2(t)\nabla_x\log q_t(x_t),
\qquad
x_T\sim q_T(x_T).
\tag{2.6}
$$

스코어를 잡음 예측 모델로 대체하면 실제 샘플링에 쓰는 diffusion ODE를 얻는다.

$$
\frac{dx_t}{dt}
=
h_\theta(x_t,t)
:=
f(t)x_t
+
\frac{g^2(t)}{2\sigma_t}
\epsilon_\theta(x_t,t),
\qquad
x_T\sim\mathcal{N}(0,\tilde{\sigma}^2I).
\tag{2.7}
$$

이 식에서 논문의 핵심 구조가 드러난다.

- $f(t)x_t$는 상태 $x_t$에 대한 선형 항이다.
- $\frac{g^2(t)}{2\sigma_t}\epsilon_\theta(x_t,t)$는 신경망이 들어간 비선형 항이다.
- 샘플링은 $x_T$에서 시작해 시간을 $T$에서 0으로 되돌리는 ODE 적분이다.
- 계산 비용의 대부분은 $\epsilon_\theta$ 평가에 있으므로 스텝 수보다 NFE가 직접적인 비용 지표다.

## 핵심 아이디어 — 선형 항은 정확히, 신경망 항만 근사한다

범용 RK 방법은 Eq. (2.7)의 전체 $h_\theta$를 적분한다.

$$
\begin{aligned}
x_t
&=
x_s+\int_s^t h_\theta(x_\tau,\tau)d\tau \\
&=
x_s+
\int_s^t
\left[
f(\tau)x_\tau+
\frac{g^2(\tau)}{2\sigma_\tau}
\epsilon_\theta(x_\tau,\tau)
\right]d\tau.
\end{aligned}
\tag{4.2}
$$

이 표현에서는 선형 항도 수치 근사의 대상이다. DPM-Solver는 먼저 상수변화법(variation of constants formula)을 적용해 그 항을 정확히 푼다.

$$
x_t
=
e^{\int_s^t f(\tau)d\tau}x_s
+
\int_s^t
e^{\int_\tau^t f(r)dr}
\frac{g^2(\tau)}{2\sigma_\tau}
\epsilon_\theta(x_\tau,\tau)d\tau.
\tag{3.1}
$$

첫 번째 항은 선형 동차 미분방정식의 해석적 해다. 따라서 이후 솔버가 근사해야 할 것은 두 번째 적분, 그중에서도 신경망 출력이 시간과 상태에 따라 변하는 방식뿐이다.

이 분해가 중요한 이유는 차수만 높이는 것과 성격이 다르기 때문이다. 같은 2차 또는 3차 방법이라도 DPM-Solver는 선형 항의 이산화 오차를 처음부터 만들지 않는다. 반면 블랙박스 RK는 더 많은 스텝을 써서 선형 항의 오차까지 줄여야 한다.

## 방법 — half-log-SNR에서 정확한 해를 다시 쓴다

### 왜 시간 $t$ 대신 $\lambda$인가

논문은 half-log-SNR을

$$
\lambda_t:=\log\frac{\alpha_t}{\sigma_t}
$$

로 정의한다. SNR이 $t$에 따라 엄격히 감소하므로 $\lambda_t$도 엄격히 감소한다. 따라서 역함수 $t_\lambda(\lambda)$가 존재하고

$$
t=t_\lambda(\lambda(t))
$$

로 시간을 복원할 수 있다.

Eq. (2.3)의 $g^2(t)$를 정리하면

$$
\begin{aligned}
g^2(t)
&=
\frac{d\sigma_t^2}{dt}
-
2\frac{d\log\alpha_t}{dt}\sigma_t^2 \\
&=
2\sigma_t^2
\left(
\frac{d\log\sigma_t}{dt}
-
\frac{d\log\alpha_t}{dt}
\right) \\
&=
-2\sigma_t^2\frac{d\lambda_t}{dt}.
\end{aligned}
\tag{3.2}
$$

또한 $f(t)=d\log\alpha_t/dt$이므로 Eq. (3.1)의 적분 인자는

$$
e^{\int_s^t f(\tau)d\tau}
=
\frac{\alpha_t}{\alpha_s},
\qquad
e^{\int_\tau^t f(r)dr}
=
\frac{\alpha_t}{\alpha_\tau}
$$

가 된다. 이 두 관계를 Eq. (3.1)에 넣으면

$$
x_t
=
\frac{\alpha_t}{\alpha_s}x_s
-
\alpha_t
\int_s^t
\frac{d\lambda_\tau}{d\tau}
\frac{\sigma_\tau}{\alpha_\tau}
\epsilon_\theta(x_\tau,\tau)d\tau.
\tag{3.3}
$$

이제

$$
\hat{x}_\lambda:=x_{t_\lambda(\lambda)},
\qquad
\hat{\epsilon}_\theta(\hat{x}_\lambda,\lambda)
:=
\epsilon_\theta
\left(
x_{t_\lambda(\lambda)},t_\lambda(\lambda)
\right)
$$

로 표기한다. $d\lambda=(d\lambda_\tau/d\tau)d\tau$이고

$$
\frac{\sigma_\tau}{\alpha_\tau}=e^{-\lambda_\tau}
$$

이므로 적분 변수를 $\tau$에서 $\lambda$로 바꿀 수 있다.

그 결과가 Proposition 3.1의 정확한 해다.

$$
x_t
=
\frac{\alpha_t}{\alpha_s}x_s
-
\alpha_t
\int_{\lambda_s}^{\lambda_t}
e^{-\lambda}
\hat{\epsilon}_\theta(\hat{x}_\lambda,\lambda)d\lambda.
\tag{3.4}
$$

이 변수 치환으로 얻은 이점은 분명하다. 시간과 잡음 스케줄에 의한 계수 변화는 $e^{-\lambda}$라는 해석 가능한 가중치에 들어간다. 수치 솔버는 $\hat{\epsilon}_\theta$의 변화만 근사하면 되고, 지수 가중치는 정확히 적분할 수 있다.

### Proposition 3.1의 가정과 증명 논법

Proposition 3.1은 $\alpha(t),\sigma(t)>0$이 유계 도함수를 가진 미분 가능한 함수이고, $\lambda(t)$가 엄격히 단조 감소한다고 가정한다.

증명은 세 단계다.

1. Eq. (2.7)에 상수변화법을 적용해 선형 항을 해석적으로 분리한다.
2. $g^2(t)=-2\sigma_t^2\,d\lambda_t/dt$ 관계를 대입한다.
3. $\lambda(t)$의 가역성을 이용해 적분 변수를 $t$에서 $\lambda$로 바꾼다.

엄격한 단조성은 단순한 표기상의 편의가 아니다. 이 조건이 없으면 하나의 $\lambda$에 여러 시간이 대응할 수 있어 $t_\lambda$를 정의할 수 없고, $\hat{x}_\lambda$와 $\hat{\epsilon}_\theta$를 단일값 함수로 놓는 현재 유도가 깨진다.

## 방법 — 정확한 적분에서 1·2·3차 솔버로

### 한 스텝 전이와 Taylor 전개

$t_{i-1}$에서 근사값 $\tilde{x}_{t_{i-1}}$이 주어졌다고 하자. Eq. (3.4)의 한 스텝 전이는

$$
x_{t_{i-1}\to t_i}
=
\frac{\alpha_{t_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\alpha_{t_i}
\int_{\lambda_{t_{i-1}}}^{\lambda_{t_i}}
e^{-\lambda}
\hat{\epsilon}_\theta(\hat{x}_\lambda,\lambda)d\lambda
\tag{3.5}
$$

다. 역방향 샘플링에서는 $t_i<t_{i-1}$이고 $\lambda(t)$가 $t$에 따라 감소하므로

$$
h_i:=\lambda_{t_i}-\lambda_{t_{i-1}}
$$

는 양의 방향으로 진행한다.

남은 난점은 적분 안의 $\hat{\epsilon}_\theta$가 미지의 중간 상태 $\hat{x}_\lambda$에 의존한다는 점이다. 이를 시작점 $\lambda_{t_{i-1}}$ 주변에서 전개한다.

$$
\hat{\epsilon}_\theta(\hat{x}_\lambda,\lambda)
=
\sum_{n=0}^{k-1}
\frac{
(\lambda-\lambda_{t_{i-1}})^n
}{n!}
\hat{\epsilon}_\theta^{(n)}
\left(
\hat{x}_{\lambda_{t_{i-1}}},
\lambda_{t_{i-1}}
\right)
+
\mathcal{O}
\left(
(\lambda-\lambda_{t_{i-1}})^k
\right).
$$

여기서 $\hat{\epsilon}_\theta^{(n)}$은 $\lambda$만 편미분한 값이 아니라, 상태 $\hat{x}_\lambda$의 변화까지 포함한 total derivative다. 이 전개를 Eq. (3.5)에 넣고 합과 적분의 순서를 바꾸면

$$
\begin{aligned}
x_{t_{i-1}\to t_i}
&=
\frac{\alpha_{t_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}} \\
&\quad-
\alpha_{t_i}
\sum_{n=0}^{k-1}
\hat{\epsilon}_\theta^{(n)}
\left(
\hat{x}_{\lambda_{t_{i-1}}},
\lambda_{t_{i-1}}
\right)
\int_{\lambda_{t_{i-1}}}^{\lambda_{t_i}}
e^{-\lambda}
\frac{
(\lambda-\lambda_{t_{i-1}})^n
}{n!}d\lambda \\
&\quad+
\mathcal{O}(h_i^{k+1}).
\end{aligned}
\tag{3.6}
$$

지수 함수와 다항식의 곱으로 된 적분은 부분적분으로 정확히 계산할 수 있다. 따라서 근사는 지수 가중치에서 생기는 것이 아니라, 신경망의 total derivative를 유한한 함수 평가로 근사하는 과정에서 생긴다.

### DPM-Solver-1

$k=1$이면 신경망 출력을 스텝 시작점의 값으로 고정한다.

$$
\begin{aligned}
x_{t_{i-1}\to t_i}
&=
\frac{\alpha_{t_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\alpha_{t_i}
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1})
\int_{\lambda_{t_{i-1}}}^{\lambda_{t_i}}
e^{-\lambda}d\lambda
+
\mathcal{O}(h_i^2) \\
&=
\frac{\alpha_{t_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\sigma_{t_i}(e^{h_i}-1)
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1})
+
\mathcal{O}(h_i^2).
\end{aligned}
$$

국소 절단 오차를 버리면 DPM-Solver-1 업데이트가 된다.

$$
\tilde{x}_{t_i}
=
\frac{\alpha_{t_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\sigma_{t_i}(e^{h_i}-1)
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1}).
\tag{3.7}
$$

첫 항은 선형 동역학을 정확히 전파한다. 두 번째 항은 한 번 평가한 신경망 출력을 스텝 전체에 사용해 비선형 적분을 근사한다. 스텝당 1 NFE가 필요하다.

이 식은 DDIM의 결정론적 단일 스텝 공식

$$
\tilde{x}_{t_i}
=
\frac{\alpha_{t_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\alpha_{t_i}
\left(
\frac{\sigma_{t_{i-1}}}{\alpha_{t_{i-1}}}
-
\frac{\sigma_{t_i}}{\alpha_{t_i}}
\right)
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1})
\tag{4.1}
$$

과 수학적으로 같다. $\sigma_t/\alpha_t=e^{-\lambda_t}$를 대입하면 Eq. (3.7)의 $e^{h_i}-1$ 계수가 나온다. 즉 DPM-Solver-1은 별개의 1차 공식을 추가한 것이 아니라, DDIM을 지수 적분기 관점에서 다시 해석한 결과다.

### DPM-Solver-2

2차 솔버는 $\lambda$ 구간의 중점에서 신경망을 한 번 더 평가한다.

$$
s_i
=
t_\lambda
\left(
\frac{\lambda_{t_{i-1}}+\lambda_{t_i}}{2}
\right),
$$

$$
u_i
=
\frac{\alpha_{s_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\sigma_{s_i}
\left(e^{h_i/2}-1\right)
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1}),
$$

$$
\tilde{x}_{t_i}
=
\frac{\alpha_{t_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\sigma_{t_i}
\left(e^{h_i}-1\right)
\epsilon_\theta(u_i,s_i).
$$

$u_i$는 DPM-Solver-1로 반 스텝을 진행한 중간 상태에 해당한다. 최종 업데이트에서는 시작점 출력 대신 중간점의 신경망 출력을 사용한다. 한 스텝에 시작점과 중간점의 총 2 NFE가 필요하며, Taylor 전개의 첫 두 항을 반영해 2차 수렴을 얻는다.

### DPM-Solver-3

3차 솔버는

$$
r_1=\frac13,
\qquad
r_2=\frac23
$$

지점에서 두 중간 상태를 만든다.

$$
s_{2i-1}
=
t_\lambda(\lambda_{t_{i-1}}+r_1h_i),
\qquad
s_{2i}
=
t_\lambda(\lambda_{t_{i-1}}+r_2h_i).
$$

첫 번째 중간 상태와 출력 차분은

$$
u_{2i-1}
=
\frac{\alpha_{s_{2i-1}}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\sigma_{s_{2i-1}}
\left(e^{r_1h_i}-1\right)
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1}),
$$

$$
D_{2i-1}
=
\epsilon_\theta(u_{2i-1},s_{2i-1})
-
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1})
$$

이다. $D_{2i-1}$은 신경망 출력의 변화량이므로 total derivative를 직접 계산하지 않고 유한한 함수 평가로 근사하는 역할을 한다.

두 번째 중간 상태는 이 변화량까지 반영한다.

$$
\begin{aligned}
u_{2i}
&=
\frac{\alpha_{s_{2i}}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\sigma_{s_{2i}}
\left(e^{r_2h_i}-1\right)
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1}) \\
&\quad-
\sigma_{s_{2i}}
\frac{r_2}{r_1}
\left(
\frac{e^{r_2h_i}-1}{r_2h_i}-1
\right)
D_{2i-1},
\end{aligned}
$$

$$
D_{2i}
=
\epsilon_\theta(u_{2i},s_{2i})
-
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1}).
$$

최종 업데이트는

$$
\begin{aligned}
\tilde{x}_{t_i}
&=
\frac{\alpha_{t_i}}{\alpha_{t_{i-1}}}
\tilde{x}_{t_{i-1}}
-
\sigma_{t_i}
\left(e^{h_i}-1\right)
\epsilon_\theta(\tilde{x}_{t_{i-1}},t_{i-1}) \\
&\quad-
\frac{\sigma_{t_i}}{r_2}
\left(
\frac{e^{h_i}-1}{h_i}-1
\right)
D_{2i}.
\end{aligned}
$$

이 계수들은 3차 지수 Runge–Kutta 적분기의 stiff order condition을 만족하도록 구성된다. 한 스텝에 시작점과 두 중간점의 총 3 NFE가 필요하다.

## 수렴 차수는 무엇을 보장하는가

Theorem 3.2는 $k=1,2,3$에 대해 DPM-Solver-$k$가 $k$차 솔버라고 주장한다. 생성된 수열 $\{\tilde{x}_{t_i}\}_{i=1}^M$의 종점 오차는

$$
\tilde{x}_{t_M}-x_0
=
\mathcal{O}(h_{\max}^k),
\qquad
h_{\max}
=
\max_{1\le i\le M}
\left(
\lambda_{t_i}-\lambda_{t_{i-1}}
\right)
$$

를 만족한다.

이 정리는 잡음 예측 모델 $\epsilon_\theta(x_t,t)$이 Appendix B.1의 정칙성 조건을 만족한다고 가정한다. 정칙성이 필요한 이유는 Taylor 전개와 total derivative 근사, 그리고 각 스텝의 국소 오차를 전체 구간의 대역 오차로 누적하는 논증이 신경망 출력의 충분한 매끄러움에 의존하기 때문이다.

제공된 본문에는 $k=1$에서 국소 절단 오차가 $\mathcal{O}(h_i^2)$가 되는 유도와 고차 방법의 stiff order condition이 언급되어 있다. 다만 임의 스텝의 국소 오차를 합쳐 $\mathcal{O}(h_{\max}^k)$의 대역 오차를 얻는 상세 증명은 Appendix B를 참조하도록 되어 있고, 해당 부록 본문은 제공된 텍스트에 포함되지 않았다. 따라서 증명의 세부 부등식이나 정칙성 조건을 여기서 더 구체화할 수는 없다.

4차 이상을 다루지 않은 이유도 비용과 연결된다. 지수 적분기 선행 연구에 따르면 $k\ge4$ 솔버는 훨씬 많은 중간 지점을 필요로 한다. 명목상의 차수가 높아져도 한 스텝의 NFE가 크게 늘면 고정된 NFE 예산에서 실행할 수 있는 스텝 수가 줄어든다. 논문은 이 때문에 1·2·3차까지만 다루고 그 이상의 솔버를 향후 연구로 남긴다.

## 구현 관점에서

### 필요한 인터페이스

솔버가 요구하는 구성 요소는 다음과 같다.

- 잡음 예측 함수 $\epsilon_\theta(x,t)$
- $\alpha(t)$와 $\sigma(t)$
- $\lambda(t)=\log(\alpha_t/\sigma_t)$
- 역함수 $t_\lambda(\lambda)$
- 시간 또는 $\lambda$ 격자
- 목표 NFE에 맞춘 1·2·3차 스텝 조합

상태 $x$와 신경망 출력, 중간 상태, 차분 벡터는 모두 같은 shape을 가진다. 논문의 $x_t\in\mathbb{R}^D$에 배치 차원을 붙이면 다음처럼 볼 수 있다.

```text
x, eps, u, D : (B, D)
alpha, sigma, lambda, t, h : scalar 또는 배치에 broadcast 가능한 값
```

이미지 텐서의 내부 축 배치는 모델 구현에 따라 달라질 수 있지만, 솔버의 모든 선형 결합은 입력 $x$와 같은 shape을 보존해야 한다.

### 학습과 샘플링은 분리된다

잡음 예측 모델의 학습은 일반적인 잡음 회귀 문제다.

```python
# x0: (B, D)
# eps: (B, D)
# t: (B,) 또는 모델이 받는 시간 표현

eps = standard_normal_like(x0)              # (B, D)
xt = alpha(t) * x0 + sigma(t) * eps         # (B, D)
eps_pred = epsilon_theta(xt, t)             # (B, D)
loss = weighted_squared_error(eps_pred, eps, weight=omega(t))
```

DPM-Solver는 이 학습 루프를 변경하지 않는다. 추가 학습 없이 이미 학습된 $\epsilon_\theta$를 샘플링 시점에 호출한다.

1차 샘플링 스텝은 Eq. (3.7)을 그대로 옮길 수 있다.

```python
def dpm_solver_1_step(x_prev, t_prev, t_next):
    # x_prev: (B, D)
    lam_prev = lambda_of_t(t_prev)           # scalar
    lam_next = lambda_of_t(t_next)           # scalar
    h = lam_next - lam_prev                  # scalar

    eps_prev = epsilon_theta(x_prev, t_prev) # (B, D), 1 NFE

    x_next = (
        alpha(t_next) / alpha(t_prev) * x_prev
        - sigma(t_next) * (exp(h) - 1) * eps_prev
    )                                        # (B, D)
    return x_next
```

2차 스텝은 시작점과 $\lambda$ 중점에서 모델을 평가한다.

```python
def dpm_solver_2_step(x_prev, t_prev, t_next):
    # x_prev: (B, D)
    lam_prev = lambda_of_t(t_prev)           # scalar
    lam_next = lambda_of_t(t_next)           # scalar
    h = lam_next - lam_prev                  # scalar

    s = t_of_lambda((lam_prev + lam_next) / 2)

    eps_prev = epsilon_theta(x_prev, t_prev) # (B, D), 1st NFE
    u = (
        alpha(s) / alpha(t_prev) * x_prev
        - sigma(s) * (exp(h / 2) - 1) * eps_prev
    )                                        # (B, D)

    eps_mid = epsilon_theta(u, s)             # (B, D), 2nd NFE
    x_next = (
        alpha(t_next) / alpha(t_prev) * x_prev
        - sigma(t_next) * (exp(h) - 1) * eps_mid
    )                                        # (B, D)
    return x_next
```

3차 스텝의 흐름은 다음과 같다.

```python
def dpm_solver_3_step(x_prev, t_prev, t_next):
    # x_prev: (B, D)
    r1, r2 = 1 / 3, 2 / 3

    lam_prev = lambda_of_t(t_prev)           # scalar
    lam_next = lambda_of_t(t_next)           # scalar
    h = lam_next - lam_prev                  # scalar

    s1 = t_of_lambda(lam_prev + r1 * h)
    s2 = t_of_lambda(lam_prev + r2 * h)

    eps_0 = epsilon_theta(x_prev, t_prev)     # (B, D), 1st NFE

    u1 = (
        alpha(s1) / alpha(t_prev) * x_prev
        - sigma(s1) * (exp(r1 * h) - 1) * eps_0
    )                                        # (B, D)
    eps_1 = epsilon_theta(u1, s1)             # (B, D), 2nd NFE
    D1 = eps_1 - eps_0                        # (B, D)

    u2 = (
        alpha(s2) / alpha(t_prev) * x_prev
        - sigma(s2) * (exp(r2 * h) - 1) * eps_0
        - sigma(s2) * (r2 / r1)
          * ((exp(r2 * h) - 1) / (r2 * h) - 1) * D1
    )                                        # (B, D)
    eps_2 = epsilon_theta(u2, s2)             # (B, D), 3rd NFE
    D2 = eps_2 - eps_0                        # (B, D)

    x_next = (
        alpha(t_next) / alpha(t_prev) * x_prev
        - sigma(t_next) * (exp(h) - 1) * eps_0
        - sigma(t_next) / r2
          * ((exp(h) - 1) / h - 1) * D2
    )                                        # (B, D)
    return x_next
```

### NFE 예산을 차수 조합으로 바꾸기

NFE가 20 이하라면 $[\lambda_T,\lambda_0]$를 균등 분할하고, 예산을 3차 스텝 중심으로 나눈다.

```text
q, r = divmod(NFE_budget, 3)

q개의 DPM-Solver-3 스텝을 배치한다.
r = 0: 추가 스텝 없음
r = 1: DPM-Solver-1 한 스텝 추가
r = 2: DPM-Solver-2 한 스텝 추가
```

각 3차 스텝은 3 NFE, 2차 스텝은 2 NFE, 1차 스텝은 1 NFE를 사용하므로 주어진 예산을 정확히 맞출 수 있다. NFE가 20을 넘으면 논문은 DPM-Solver-3와 adaptive step size schedule을 사용한다. 적응형 알고리즘은 서로 다른 차수의 솔버를 결합해 스텝 크기를 동적으로 조절하며, 세부 구현은 Appendix C에 수록되어 있다. 제공된 텍스트에는 그 판정식이 없으므로 여기서는 구체적인 오차 허용 기준을 재구성하지 않는다.

### 이산 시간 모델에 연속 시간을 넣는 방법

이산 시간 잡음 예측 모델을

$$
\tilde{\epsilon}_\theta(x_n,n),
\qquad n=0,\ldots,N-1
$$

이라고 하자. 논문은 연속 시간 인터페이스를

$$
\epsilon_\theta(x,t)
:=
\tilde{\epsilon}_\theta
\left(
x,\frac{(N-1)t}{T}
\right),
\qquad
x\in\mathbb{R}^d,\quad t\in[0,T]
$$

로 정의한다.

이 변환에서는 모델의 시간 입력이 정수가 아닐 수 있다. 저자들은 이산 시간 모델도 이러한 입력에서 잘 작동한다고 보고하며, 위치 임베딩과 같은 매끄러운 시간 임베딩(smooth time embedding)이 가능한 이유일 것이라고 가설을 제시한다. 이는 증명된 보장이라기보다 저자들의 설명이다.

### 틀리기 쉬운 지점

첫째, 격자는 $t$가 아니라 $\lambda$에서 균등해야 한다. 논문의 기본 수작업 스케줄은

$$
\lambda_{t_i}
=
\lambda_T+
\frac{i}{M}(\lambda_0-\lambda_T),
\qquad i=0,\ldots,M
$$

이다. 먼저 $\lambda$ 값을 만들고 $t_\lambda$로 시간에 되돌려야 한다. $t$를 균등 분할한 뒤 같은 공식이라고 간주하면 다른 스케줄이 된다.

둘째, 시간과 $\lambda$의 방향을 혼동하면 안 된다. $\lambda(t)$는 $t$에 대해 감소하지만 샘플링은 $T\to0$으로 진행하므로, 구현에서 $h_i=\lambda_{t_i}-\lambda_{t_{i-1}}$의 방향을 수식과 일치시켜야 한다.

셋째, DPM-Solver-2의 중간점은 시간의 산술 중점 $(t_{i-1}+t_i)/2$가 아니다. $\lambda$의 중점을 만든 뒤 $t_\lambda$를 적용한 $s_i$다. DPM-Solver-3의 $1/3$, $2/3$ 지점도 같은 원칙을 따른다.

넷째, $\alpha$, $\sigma$, $\lambda$, $t_\lambda$는 같은 잡음 스케줄에서 일관되게 계산되어야 한다. Linear 및 cosine 스케줄의 $t_\lambda$ 해석식은 Appendix D에 있다고 명시되어 있지만, 제공된 텍스트에는 그 식이 없다.

다섯째, 3차 식에서 $D_{2i-1}$과 $D_{2i}$는 상태 차분이 아니라 신경망 출력 차분이다. 또한 $u_{2i}$는 $D_{2i-1}$로 보정하지만 최종 상태는 $D_{2i}$를 사용한다. 두 차분을 바꾸면 Algorithm 2와 다른 방법이 된다.

여섯째, $(e^h-1)/h-1$ 형태의 계수는 $h$가 작을 때 서로 가까운 값의 뺄셈을 포함한다. 수식을 코드로 옮길 때 이 계수를 직접 계산한 결과가 충분히 안정적인지 확인할 필요가 있다. 이는 논문이 별도의 구현 규칙으로 제시한 내용은 아니지만, 식 자체에서 드러나는 수치 구현상의 점검 대상이다.

## 실험 설정

평가 지표는 50K 샘플로 계산한 FID이며 낮을수록 좋다. 보고된 표준편차는 대부분 0.01 미만이다. 계산 비용은 잡음 예측 신경망 호출 횟수인 NFE로 비교한다.

연속 시간 실험은 CIFAR-10 $32\times32$의 VP deep 모델과 linear 잡음 스케줄을 사용했다. 비교 대상은 허용오차로 NFE를 조절한 ODE RK45, 50·200·1000개의 균등 시간 스텝을 사용한 Euler 또는 Euler–Maruyama SDE, 허용오차 기반 adaptive SDE solver, 그리고 $t$ 또는 $\lambda$를 독립 변수로 삼은 RK2와 RK3다.

이산 시간 실험에는 다음 설정이 쓰였다.

- CIFAR-10 $32\times32$: $L_{\text{simple}}$로 학습된 모델, linear 스케줄
- CelebA $64\times64$: 이산 시간 모델, linear 스케줄
- ImageNet $64\times64$: $L_{\text{hybrid}}$로 학습된 모델, cosine 스케줄
- ImageNet $128\times128$: classifier guidance가 적용된 이산 시간 모델, linear 스케줄
- ImageNet $256\times256$: classifier guidance가 적용된 사전학습 모델
- LSUN bedroom $256\times256$: 이산 시간 모델, linear 스케줄

ImageNet 모델에서는 “mean” 모델만 사용하고 “variance” 모델은 제외했다.

이산 시간 베이스라인은 DDPM, DDIM, Analytic-DDPM, Analytic-DDIM, PNDM, FastDPM, Itô-Taylor, GGDM이다. GGDM은 샘플링 궤적 최적화를 위한 추가 학습이 필요해 $\dagger$로 구분된다. CelebA의 DDIM에는 원 논문의 uniform 스케줄보다 성능이 좋은 quadratic step size가 적용되었다.

DPM-Solver 자체에는 추가 학습이 필요 없다. 실험에 사용한 구체적인 GPU 종류와 수량은 Appendix E에 있다고 명시되어 있지만, 제공된 본문 텍스트에는 해당 사양이 없다. Appendix E에는 사용된 데이터셋·모델의 라이선스와 ImageNet의 인간 개인정보 보호 문제도 서술되어 있다고 보고된다.

## 실험에서 확인한 것

![여러 데이터셋에서 NFE에 따른 샘플러별 FID 비교](/assets/img/posts/dpm-solver/figure2.png){: w="800" }
_그림 1. 연속·이산 시간 모델과 여러 해상도에서 NFE가 감소할 때 DPM-Solver가 품질을 얼마나 유지하는지를 비교한다. 특히 10~15 NFE의 few-step 구간이 핵심이다._

CIFAR-10 연속 시간 VP deep 모델에서 DPM-Solver는 다음 결과를 보였다.

| NFE | FID ↓ |
|---:|---:|
| 10 | 4.70 |
| 12 | 3.75 |
| 15 | 3.24 |
| 20 | 2.87 |

기존 최고 솔버와 비교한 가속은 약 5배로 보고되었다. 기존 솔버들은 50 NFE에서도 큰 이산화 오차를 보였다. 이는 적은 NFE에서 차수가 높다는 사실만으로 충분하지 않고, diffusion ODE의 선형 구조를 정확히 처리하는지가 중요하다는 실험적 근거다.

이산 시간 모델에서도 NFE 12만으로 다음 FID를 기록했다.

| 데이터셋·해상도 | NFE | FID ↓ |
|---|---:|---:|
| CIFAR-10 $32\times32$ | 12 | 4.65 |
| CelebA $64\times64$ | 12 | 3.71 |
| ImageNet $64\times64$ | 12 | 19.97 |
| ImageNet $128\times128$ | 12 | 4.08 |

이 결과는 이전 최고 무학습 샘플러보다 $4\sim16$배 빠른 것으로 보고되었다. 추가 학습이 필요한 GGDM보다도 우수한 성능을 기록했다. 서로 다른 데이터셋, 해상도, linear·cosine 잡음 스케줄, 연속·이산 시간 모델에서 결과가 확인되었다는 점은 특정 단일 설정에만 맞춘 솔버가 아니라는 근거가 된다.

![ImageNet 256x256에서 DDIM과 DPM-Solver의 적은 NFE 샘플 비교](/assets/img/posts/dpm-solver/figure1.jpg){: w="800" }
_그림 2. ImageNet 256×256 classifier-guidance 설정에서 DDIM의 10·15·20·100 NFE 결과와 DPM-Solver의 10 NFE 결과를 시각적으로 비교한다._

## 무엇이 성능을 만들었나

Table 1의 전체 수치는 다음과 같다.

| Sampling method \ NFE | 12 | 18 | 24 | 30 | 36 | 42 | 48 |
|---|---:|---:|---:|---:|---:|---:|---:|
| RK2 ($t$) | 16.40 | 7.25 | 3.90 | 3.63 | 3.58 | 3.59 | 3.54 |
| RK2 ($\lambda$) | 107.81 | 42.04 | 17.71 | 7.65 | 4.62 | 3.58 | 3.17 |
| DPM-Solver-2 | 5.28 | 3.43 | 3.02 | 2.85 | 2.78 | 2.72 | 2.69 |
| RK3 ($t$) | 48.75 | 21.86 | 10.90 | 6.96 | 5.22 | 4.56 | 4.12 |
| RK3 ($\lambda$) | 34.29 | 4.90 | 3.50 | 3.03 | 2.85 | 2.74 | 2.69 |
| DPM-Solver-3 | 6.03 | 2.90 | 2.75 | 2.70 | 2.67 | 2.65 | 2.65 |

여기서 세 가지를 읽을 수 있다.

첫째, 같은 DPM-Solver 계열에서는 3차가 2차보다 빠르게 수렴한다. NFE 18에서 DPM-Solver-2는 3.43, DPM-Solver-3는 2.90이다. NFE 48에서는 각각 2.69와 2.65로 격차가 줄어든다. 큰 NFE에서는 양쪽 모두 낮은 오차 영역에 도달하지만, 예산이 작을수록 3차 수렴의 이점이 크게 나타난다. 이는 Theorem 3.2의 차수 분석과 일치한다.

둘째, 동일 차수의 범용 RK보다 DPM-Solver가 일관되게 좋다. NFE 12에서 RK2($t$)는 16.40, RK2($\lambda$)는 107.81인 반면 DPM-Solver-2는 5.28이다. NFE 18에서 RK3($t$)는 21.86, RK3($\lambda$)는 4.90이지만 DPM-Solver-3는 2.90이다. 단순히 $\lambda$로 변수만 바꾸거나 RK의 차수만 높이는 것으로는 DPM-Solver의 결과를 설명할 수 없다. 선형 항을 해석적으로 계산해 그 부분의 이산화 오차를 제거한 것이 핵심 차이다.

셋째, RK 내부에서도 $t$와 $\lambda$ 중 어느 변수를 쓰는지가 NFE에 따라 다른 결과를 낸다. RK2는 NFE 12에서 $t$ 기준이 16.40으로 $\lambda$ 기준 107.81보다 낫지만, NFE 48에서는 $\lambda$ 기준이 3.17로 $t$ 기준 3.54보다 낫다. RK3도 NFE 12에서는 $t$ 기준 48.75와 $\lambda$ 기준 34.29 모두 불안정한 반면, NFE가 늘면서 $\lambda$ 기준이 더 낮은 FID로 수렴한다. 따라서 좋은 변수 선택은 충분한 스텝에서 수렴 품질을 개선할 수 있지만, few-step 안정성을 보장하는 것과는 별개의 문제다.

Table 1에서 RK($\lambda$)가 사용하는 diffusion ODE는 Eq. (E.1)로 언급되어 있다. 그러나 제공된 텍스트에는 해당 식의 구체적인 형태가 없으므로 여기서는 수식을 재구성하지 않는다.

## 비용과 트레이드오프

DPM-Solver의 직접적인 이점은 추가 학습 비용이 없다는 점이다. 사전학습된 연속 시간 모델뿐 아니라 연속 시간 입력으로 재매개변수화한 이산 시간 모델에도 적용할 수 있다. 모델이나 데이터셋, 목표 NFE가 바뀔 때마다 증류 모델을 다시 학습할 필요가 없다.

추론 비용은 거의 전적으로 NFE로 설명된다.

- DPM-Solver-1: 스텝당 1 NFE
- DPM-Solver-2: 스텝당 2 NFE
- DPM-Solver-3: 스텝당 3 NFE

고차 방법은 한 스텝이 더 비싸지만 같은 구간을 더 큰 스텝으로 정확하게 이동할 수 있다. 고정된 NFE에서 3차 스텝을 중심으로 조합하는 이유가 여기에 있다. 반대로 무조건 차수를 높이는 것은 답이 아니다. 4차 이상에서는 필요한 중간 지점이 크게 늘어날 수 있어, 늘어난 스텝당 비용이 수렴 차수의 이점을 상쇄할 수 있다.

메모리 관점에서는 2차와 3차 솔버가 중간 상태와 신경망 출력 차분을 유지해야 한다. 다만 논문에는 솔버별 최대 메모리 사용량이나 모델 파라미터 수가 별도 수치로 제시되지 않았다. 따라서 메모리 절감 효과까지 주장할 근거는 없다.

경량화 관점에서 DPM-Solver는 모델 자체를 작게 만드는 방법이 아니다. 파라미터 수나 한 번의 신경망 평가 비용을 줄이는 대신, 동일한 대규모 모델을 호출하는 횟수를 줄인다. 따라서 모델 한 번의 실행이 비쌀수록 NFE 감소의 가치가 커진다. 한편 모델이 여전히 크고 각 호출이 순차적이라는 사실은 남는다. 저자들이 GAN과 비교해 실시간 응용에는 충분히 빠르지 않다고 밝힌 이유도 이 구조에서 이해할 수 있다.

품질과 비용 사이의 선택도 남아 있다. CIFAR-10 연속 시간 결과에서 NFE 10의 FID는 4.70이고 NFE 20에서는 2.87이다. 더 적은 호출로 빠르게 생성할 수 있지만, 호출 예산을 늘렸을 때 더 낮은 FID에 도달한다. DPM-Solver는 이 교환관계를 없애는 것이 아니라, 같은 NFE에서 더 좋은 위치로 이동시킨다.

일반화의 근거는 비교적 넓다. CIFAR-10, CelebA, ImageNet, LSUN bedroom과 여러 해상도에서 평가했고, linear와 cosine 스케줄, 연속·이산 시간 모델, classifier guidance 설정을 포함했다. 다만 이미지 이외의 데이터 모달리티에 대한 결과는 제공된 실험에 없으므로, 다른 모달리티에서도 같은 정도의 가속과 품질이 나오는지는 이 논문만으로 확인할 수 없다.

## 한계와 생각해볼 점

저자들이 밝힌 첫 번째 한계는 적용 목적이다. DPM-Solver는 고속 샘플링을 위해 설계되었으며 DPM의 우도 평가(likelihood evaluation)를 가속하는 데에는 적합하지 않을 수 있다. 샘플 생성용 ODE 적분을 빠르게 푸는 것과 우도를 계산하는 데 필요한 절차는 같은 문제가 아니기 때문이다.

두 번째 한계는 절대적인 지연 시간이다. 기존 확산 샘플러보다 NFE를 크게 줄였지만, 널리 사용되는 GAN과 비교하면 실시간 응용에 충분히 빠르지 않다. 순차적인 대규모 신경망 평가를 10회 안팎으로 줄여도 그 비용이 사라지는 것은 아니다.

세 번째는 악용 가능성이다. 다른 심층 생성 모델과 마찬가지로 DPM도 유해한 가짜 콘텐츠를 생성하는 데 사용될 수 있다. 고속 솔버는 생성 비용을 낮추므로 악의적인 응용의 잠재적 부정적 영향까지 확대할 수 있다고 저자들은 지적한다.

이와 별도로 구현과 적용 범위를 판단할 때 확인할 지점이 있다. 이산 시간 모델이 비정수 시간 입력에서도 잘 작동하는 이유는 매끄러운 시간 임베딩 덕분이라는 저자들의 가설로 설명되지만, 모든 시간 표현이나 모든 사전학습 모델에 대한 보장은 제공되지 않는다. 따라서 새로운 이산 시간 모델에 적용할 때도 같은 성질이 유지되는지는 논문 결과의 범위 밖이다.

Adaptive step size schedule의 세부 오차 추정식, linear·cosine 스케줄에 대한 $t_\lambda$의 해석식, classifier guidance 조건부 샘플링 공식, GPU 종류와 수량은 각각 Appendix C·D·E에 있다고 명시되어 있다. 그러나 제공된 텍스트에는 해당 부록 본문이 포함되지 않았다. 이 항목들은 실제 재현 구현 전에 원문의 부록과 대조해야 하며, 현재 자료만으로 빈 부분을 추정해 채우는 것은 적절하지 않다.

DPM-Solver에서 가장 중요한 교훈은 “고차 솔버가 저차 솔버보다 좋다”로 축약되지 않는다. 더 본질적인 설계는 문제의 구조를 먼저 분해한 데 있다. 선형 동역학과 잡음 스케줄은 해석적으로 처리하고, 비용이 크고 닫힌 형태로 풀 수 없는 신경망 부분에만 함수 평가 예산을 쓴다. Table 1에서 같은 차수의 RK보다 DPM-Solver가 few-step 영역에서 크게 앞서는 결과는 이 구조적 분해가 실제 성능을 만든다는 근거다.
