---
title: "[논문 리뷰] Flow Matching for Generative Modeling"
date: 2026-08-17 21:00:00 +0900
permalink: /posts/flow-matching/
categories:
  - AI
  - Paper Review
tags: [paper-review, flow-matching, cnf, optimal-transport, diffusion]
description: "Flow Matching이 조건부 벡터장 회귀로 CNF의 ODE 없는 학습을 가능하게 하는 원리와, 조건부 OT 경로가 학습·샘플링 비용을 줄이는 이유를 정리한다."
related: [rectified-flow, score-sde, ddim]
paper:
  authors: "Yaron Lipman, Ricky T. Q. Chen, Heli Ben-Hamu, Maximilian Nickel, Matt Le"
  venue: "ICLR 2023"
  url: "https://openreview.net/forum?id=PqvMRDCJT9t"
---

> 이 글은 개인 Obsidian에 정리해 둔 논문 노트를 블로그 형식으로 다시 편집한 글이다. ODE 시뮬레이션 없이 CNF를 학습하는 조건부 벡터장 회귀와, 조건부 OT 경로가 주는 이점에 초점을 맞춘다.

## 세 줄 요약

「Flow Matching for Generative Modeling」은 Yaron Lipman, Ricky T. Q. Chen, Heli Ben-Hamu, Maximilian Nickel, Matt Le가 발표한 ICLR 2023 논문이다. Meta AI(FAIR)와 Weizmann Institute of Science 소속 연구진은 연속 정규화 흐름(Continuous Normalizing Flow, CNF)을 수치 ODE 시뮬레이션 없이 학습하는 Flow Matching(FM)을 제안한다.

직접 계산하기 어려운 주변 확률 경로의 벡터장 대신 데이터 샘플에 조건부인 계산 가능한 벡터장을 회귀해도, 원래 FM 목적함수와 같은 파라미터 기울기를 얻는다는 것이 이론적 핵심이다.

특히 평균과 표준편차를 선형 보간하는 조건부 최적수송(Optimal Transport, OT) 경로는 조건부 궤적과 회귀 표적을 단순하게 만든다. 실험에서도 FM-OT는 확산 경로보다 더 좋은 NLL·FID와 더 적은 함수 평가 횟수(Number of Function Evaluations, NFE)를 함께 기록했다.

## 이 논문이 풀려는 문제

생성모델을 단순한 사전분포 $p_0$에서 데이터분포로 이동하는 과정으로 보면 두 가지를 정해야 한다.

1. 두 분포 사이를 잇는 확률 경로(probability path)
2. 그 경로를 따라 샘플을 운반하는 시간 의존 벡터장

확산 기반 모델은 미리 제한된 확산 과정을 확률 경로로 사용한다. 이 선택은 학습 목표를 구성하기 쉽게 만들지만, 사용할 수 있는 샘플링 경로를 단순한 확산 과정 안으로 제한한다. 논문은 이 제약이 긴 학습 시간과 많은 샘플링 스텝으로 이어지고, 빠른 생성을 위해 별도의 전문화된 샘플러가 필요해진다고 지적한다.

CNF는 더 자유롭다. 시간에 따라 변하는 벡터장을 적분하여 분포를 연속적으로 변환하므로 다양한 확률 경로를 표현할 수 있다. 그러나 기존 최대우도 학습은 매 업데이트마다 수치 ODE를 풀어야 한다. 기존의 simulation-free CNF 방법에도 계산하기 어려운 적분이나 편향된 기울기 문제가 있었다.

Flow Matching은 CNF의 표현력은 유지하면서 학습 단계의 ODE 시뮬레이션을 제거한다. 먼저 원하는 확률 경로를 정하고, 그 경로를 생성하는 벡터장을 신경망이 직접 회귀하도록 한다. 더 나아가 확산 경로뿐 아니라 조건부 OT 경로도 같은 목적함수 안에서 선택할 수 있게 한다. 이 논문의 문제 설정에서 학습 목표와 확률 경로는 별개의 설계 축이다.

![Flow Matching과 조건부 OT로 학습한 CNF의 ImageNet-128 무조건부 생성 샘플](/assets/img/posts/flow-matching/figure1.jpg){: w="700" }
_그림 1. CNF를 버린 것이 아니라, CNF를 학습하는 목적함수와 그 안에서 따를 확률 경로를 바꾼 결과다._

## CNF에서 Flow Matching까지

### 흐름은 벡터장의 적분이다

시간 의존 벡터장 $v_t$는 다음 ODE를 통해 흐름 $\phi_t$를 정의한다.

$$
\frac{d}{dt}\phi_t(x)=v_t(\phi_t(x))
\tag{1}
$$

$$
\phi_0(x)=x
\tag{2}
$$

Eq. 1은 현재 위치 $\phi_t(x)$에서 벡터장이 가리키는 속도로 점을 이동시키는 식이다. Eq. 2는 $t=0$의 변환이 항등함수임을 뜻한다. 벡터장을 $t=0$에서 $1$까지 적분하면 사전분포의 샘플이 데이터 공간으로 이동한다.

분포의 이동은 push-forward로 표현한다.

$$
p_t=[\phi_t]_*p_0
\tag{3}
$$

$$
[\phi_t]_*p_0(x) =
p_0(\phi_t^{-1}(x))
\det\left[
\frac{\partial\phi_t^{-1}}{\partial x}(x)
\right]
\tag{4}
$$

첫 항은 현재 점 $x$의 사전공간 원상을 찾고, determinant는 변환에 따른 부피 변화를 보정한다. 이 항이 있어야 좌표 이동뿐 아니라 확률질량 보존까지 설명할 수 있다.

이하 `D`가 붙은 번호는 논문 수식 사이의 흐름을 보이기 위해 전개한 식이다. $z=\phi_t^{-1}(x)$라 두면

$$
p_0(z)\,dz=p_t(x)\,dx
$$

이므로

$$
p_t(x) =
p_0\!\left(\phi_t^{-1}(x)\right)
\det D\phi_t^{-1}(x)
\tag{D1}
$$

을 얻는다. 매끄러운 ODE flow가 가역성을 유지하는 범위에서 이 변수변환 공식을 사용할 수 있다.

### 직접적인 Flow Matching 목적함수

목표 확률 경로 $p_t$와 그것을 생성하는 벡터장 $u_t$를 알고 있다면, 신경망 벡터장 $v_t$를 다음 제곱오차로 학습할 수 있다.

$$
\mathcal{L}_{\mathrm{FM}}(\theta) =
\mathbb{E}_{t,p_t(x)}
\left\|v_t(x)-u_t(x)\right\|^2
\tag{5}
$$

각 시간과 위치에서 모델의 속도를 목표 속도에 맞추는 목적함수다. 문제는 주변 벡터장 $u_t(x)$를 직접 계산하기 어렵다는 데 있다.

논문은 데이터 샘플 $x_1$에 조건부인 경로를 먼저 정의하고, 이들을 데이터분포 $q$에 대해 혼합하여 주변 경로를 만든다.

$$
p_t(x) =
\int p_t(x\mid x_1)q(x_1)\,dx_1
\tag{6}
$$

$$
p_1(x) =
\int p_1(x\mid x_1)q(x_1)\,dx_1
\approx q(x)
\tag{7}
$$

각 조건부 경로가 사전분포에서 $x_1$ 주변으로 이동하도록 설계되면, 이 경로들의 혼합은 마지막에 데이터분포에 가까워진다.

주변 벡터장은 조건부 벡터장들의 사후 가중평균이다.

$$
u_t(x) =
\int
u_t(x\mid x_1)
\frac{p_t(x\mid x_1)q(x_1)}{p_t(x)}
\,dx_1
\tag{8}
$$

가중치

$$
\frac{p_t(x\mid x_1)q(x_1)}{p_t(x)}
$$

는 시간 $t$의 위치 $x$가 어느 데이터 샘플 $x_1$에 연결된 조건부 경로에서 왔을 가능성이 큰지를 나타낸다. 그러나 Eq. 8은 모든 $x_1$에 대한 적분과 주변밀도 $p_t(x)$ 계산을 요구하므로 그대로 학습 표적으로 쓰기 어렵다.

Flow Matching의 실용적 전환은 이 주변 벡터장을 계산하지 않고 다음 조건부 목적함수를 사용하는 것이다.

$$
\mathcal{L}_{\mathrm{CFM}}(\theta) =
\mathbb{E}_{t,q(x_1),p_t(x\mid x_1)}
\left\|v_t(x)-u_t(x\mid x_1)\right\|^2
\tag{9}
$$

한 번의 학습 스텝에서는 데이터 $x_1$, 시간 $t$, 조건부 위치 $x$만 샘플링하면 된다. 조건부 벡터장이 닫힌 형태로 주어지면 ODE를 풀지 않고 표적을 계산할 수 있다.

## 조건부 회귀가 같은 주변 흐름을 배우는 이유

### Theorem 1: 조건부 flux의 혼합

Theorem 1은 각 $u_t(x\mid x_1)$이 조건부 경로 $p_t(x\mid x_1)$를 생성하면 Eq. 8의 $u_t(x)$가 Eq. 6의 주변 경로를 생성한다고 주장한다. 미분과 적분의 순서를 교환할 수 있도록 적분함수가 Leibniz rule의 정칙성 조건을 만족해야 한다.

분포와 벡터장의 관계는 연속 방정식(continuity equation)으로 쓴다.

$$
\frac{d}{dt}p_t(x)
+
\operatorname{div}\!\left(p_t(x)v_t(x)\right) =
0
\tag{25}
$$

조건부 경로마다 같은 식이 성립한다고 두고 Eq. 6을 시간으로 미분하면

$$
\begin{aligned}
\frac{\partial}{\partial t}p_t(x)
&=
\int
\frac{\partial}{\partial t}p_t(x\mid x_1)
q(x_1)\,dx_1\\
&=
-\int
\operatorname{div}\!\left(
p_t(x\mid x_1)u_t(x\mid x_1)
\right)
q(x_1)\,dx_1\\
&=
-\operatorname{div}\!\left(
\int
p_t(x\mid x_1)u_t(x\mid x_1)
q(x_1)\,dx_1
\right)\\
&=
-\operatorname{div}\!\left(
p_t(x)u_t(x)
\right).
\end{aligned}
\tag{D2}
$$

마지막 줄은 Eq. 8을 사용한 결과다. 조건부 확률 flux

$$
p_t(x\mid x_1)u_t(x\mid x_1)
$$

를 데이터분포에 대해 합하면 주변 flux $p_t(x)u_t(x)$가 된다. 정칙성 조건이 깨지면 미분을 적분 내부로 옮기는 단계가 정당화되지 않으므로, 이 결론도 자동으로 성립하지 않는다.

### Theorem 2: CFM과 FM의 기울기 동치

Theorem 2는 $p_t(x)>0$일 때 $\mathcal{L}_{\mathrm{CFM}}$과 $\mathcal{L}_{\mathrm{FM}}$이 $\theta$와 무관한 상수만큼만 다르다고 보인다.

두 제곱오차를 전개하면

$$
\|v_t-u_t\|^2 =
\|v_t\|^2-2\langle v_t,u_t\rangle+\|u_t\|^2
$$

$$
\|v_t-u_t(\cdot\mid x_1)\|^2 =
\|v_t\|^2
-2\langle v_t,u_t(\cdot\mid x_1)\rangle
+\|u_t(\cdot\mid x_1)\|^2
$$

이다. Fubini theorem으로 적분 순서를 교환하고 Eq. 6과 Eq. 8을 적용하면 모델에 의존하는 두 항이 일치한다.

$$
\mathbb{E}_{p_t(x)}\|v_t(x)\|^2 =
\mathbb{E}_{q(x_1),p_t(x\mid x_1)}
\|v_t(x)\|^2
$$

$$
\mathbb{E}_{p_t(x)}
\langle v_t(x),u_t(x)\rangle =
\mathbb{E}_{q(x_1),p_t(x\mid x_1)}
\langle v_t(x),u_t(x\mid x_1)\rangle
$$

조건부기댓값으로 보면 의미가 더 분명하다. 결합밀도를

$$
r_t(x,x_1)=q(x_1)p_t(x\mid x_1)
$$

로 두면 Eq. 8은

$$
u_t(x) =
\mathbb{E}
\left[
u_t(x\mid X_1)\mid t,x
\right]
\tag{D3}
$$

이다. $U=u_t(x\mid X_1)$, $\bar U=u_t(x)$, $V=v_t(x)$라 두고 제곱오차를 분해하면

$$
\begin{aligned}
\mathbb{E}\|V-U\|^2
&=
\mathbb{E}\|V-\bar U\|^2
+
\mathbb{E}\|U-\bar U\|^2\\
&\quad+
2\mathbb{E}
\langle V-\bar U,\bar U-U\rangle.
\end{aligned}
\tag{D4}
$$

마지막 교차항은

$$
\mathbb{E}[\bar U-U\mid t,x]=0
$$

이므로 사라진다. 따라서

$$
\mathcal{L}_{\mathrm{CFM}}(\theta) =
\mathcal{L}_{\mathrm{FM}}(\theta)
+
\mathbb{E}
\left\|
u_t(x\mid X_1)-u_t(x)
\right\|^2
$$

이다. 두 번째 항은 조건부 표적이 주변 평균 주위에서 갖는 분산이며 $\theta$와 무관하다. 두 손실은 최적점만 같은 것이 아니라 모든 $\theta$에서 같은 기울기를 갖는다.

이 결론에는 $q(x)$와 $p_t(x\mid x_1)$가 무한대에서 충분히 빠르게 감소하고, $u_t$, $v_t$, $\nabla_\theta v_t$가 유계라는 조건이 붙는다. $p_t(x)>0$ 조건도 Eq. 8의 사후 가중치와 식 (D3)을 정의하는 데 필요하다.

> CFM은 주변 벡터장을 수치적으로 근사하는 방법이 아니다. 계산 가능한 조건부 회귀로 바꿔도 원래 FM과 같은 파라미터 기울기를 얻는 방법이다.
{: .prompt-tip }

## Gaussian 경로와 canonical 벡터장

### affine 재매개변수화

논문은 다음 Gaussian 조건부 경로를 사용한다.

$$
p_t(x\mid x_1) =
\mathcal{N}\!\left(
x\mid\mu_t(x_1),\sigma_t(x_1)^2I
\right)
\tag{10}
$$

끝점 조건은

$$
\mu_0(x_1)=0,\quad
\sigma_0(x_1)=1,\quad
\mu_1(x_1)=x_1,\quad
\sigma_1(x_1)=\sigma_{\min}
$$

이다. $t=0$에서는 표준 Gaussian이고, $t=1$에서는 $x_1$을 중심으로 하는 작은 Gaussian이다. $\sigma_{\min}$은 마지막 혼합분포가 데이터분포에 가까워지도록 충분히 작게 둔다.

$x_0\sim p(x_0)$를 표준 Gaussian 샘플이라고 하면

$$
\psi_t(x_0) =
\sigma_t(x_1)x_0+\mu_t(x_1)
\tag{11}
$$

로 조건부 샘플을 만들 수 있다.

$$
[\psi_t]_*p(x) =
p_t(x\mid x_1)
\tag{12}
$$

실제로 $x=\sigma_t x_0+\mu_t$이면 $x_0=(x-\mu_t)/\sigma_t$이고 역변환의 determinant는 $\sigma_t^{-d}$다. 따라서

$$
\begin{aligned}
[\psi_t]_*p(x)
&=
p\!\left(\frac{x-\mu_t}{\sigma_t}\right)\sigma_t^{-d}\\
&=
(2\pi\sigma_t^2)^{-d/2}
\exp\!\left(
-\frac{\|x-\mu_t\|^2}{2\sigma_t^2}
\right),
\end{aligned}
\tag{D5}
$$

으로 Eq. 10을 얻는다.

이 재매개변수화의 장점은 세 가지다. 첫째, 조건부 Gaussian 샘플링을 파라미터와 무관한 기저 잡음 $x_0$의 결정론적이고 미분 가능한 함수로 바꾼다. 둘째, 같은 $x_0$로 위치와 속도 표적을 동시에 계산할 수 있어 별도의 조건부 밀도 적분이 필요 없다. 셋째, 샘플링 연산 자체를 미분하는 대신 affine map을 통한 pathwise 계산을 사용할 수 있다. 논문이 이 선택의 분산 감소량을 따로 정량화하지는 않지만, score-function 형태의 추정량 없이 직접 미분 가능한 표적을 구성한다는 계산상 이점은 분명하다.

flow map을 시간으로 미분하면

$$
\frac{d}{dt}\psi_t(x_0) =
u_t(\psi_t(x_0)\mid x_1)
\tag{13}
$$

이고, Eq. 9는 다음처럼 바뀐다.

$$
\mathcal{L}_{\mathrm{CFM}}(\theta) =
\mathbb{E}_{t,q(x_1),p(x_0)}
\left\|
v_t(\psi_t(x_0)) -
\frac{d}{dt}\psi_t(x_0)
\right\|^2
\tag{14}
$$

학습 시에는 $t$, $x_1$, $x_0$를 뽑고 affine map과 그 시간 미분만 계산한다. ODE 적분은 생성과 우도 평가 시점으로 밀려난다.

### canonical 벡터장의 닫힌 형태

같은 확률 경로를 생성하는 벡터장은 무한히 많다. 분포를 바꾸지 않는 divergence-free 성분이나 분포 불변 성분을 더해도 같은 $p_t$를 유지할 수 있지만, 입자 궤적에는 불필요한 회전이나 순환을 추가할 수 있다.

논문은 Eq. 11의 canonical affine transformation에 직접 대응하는 벡터장을 선택한다. Eq. 11을 미분하면

$$
\frac{d}{dt}\psi_t(x_0) =
\sigma_t'(x_1)x_0+\mu_t'(x_1)
$$

이고, $x_0=(x-\mu_t)/\sigma_t$를 대입하면

$$
u_t(x\mid x_1) =
\frac{\sigma_t'(x_1)}{\sigma_t(x_1)}
\left(x-\mu_t(x_1)\right)
+
\mu_t'(x_1)
\tag{15}
$$

을 얻는다. 첫 항은 표준편차의 수축·팽창에 따른 속도이고, 두 번째 항은 평균의 이동 속도다.

Theorem 3은 Gaussian 경로와 가역 affine map을 가정할 때 이 flow map에 대응하는 벡터장이 Eq. 15의 닫힌 형태를 가진다고 보인다. 부록에서는 inverse map을 이용해

$$
\psi_t'(\psi^{-1}(y))=w_t(y)
\tag{26}
$$

로 유도한다.

여기서 유일하다는 말은 같은 밀도 경로를 생성하는 모든 벡터장 중 유일하다는 뜻이 아니다. 지정한 입자 map $\psi_t$를 실제로 따라가는 벡터장이 유일하다는 뜻이다. 예를 들어

$$
\operatorname{div}
\left(
p_t(x\mid x_1)r_t(x\mid x_1)
\right)=0
$$

인 성분 $r_t$를 더하면 연속 방정식상 같은 밀도 경로를 유지할 수 있다. 하지만 일반적으로

$$
\frac{d}{dt}\psi_t(x_0)
\neq
u_t(\psi_t(x_0)\mid x_1)
+
r_t(\psi_t(x_0)\mid x_1)
$$

이므로 Eq. 13의 재매개변수화 표적과는 달라진다.

canonical 벡터장 선택은 닫힌 표적을 얻는 동시에 밀도 변화에 필요하지 않은 운동을 표적에서 제외한다. 다만 이런 성분을 제거한 것이 실제 NFE를 얼마나 낮추는지는 논문에서 별도 ablation으로 검증하지 않았다.

![확산 경로의 조건부 스코어와 OT 경로의 조건부 벡터장이 시간에 따라 변하는 방식](/assets/img/posts/flow-matching/figure2.png){: w="700" }
_그림 2. 같은 Gaussian 계열이라도 시간 매개화와 회귀 표적에 따라 신경망이 배워야 하는 함수의 형태가 달라진다._

## 확산 경로도 Flow Matching으로 학습할 수 있다

Flow Matching은 OT 전용 목적함수가 아니다. 논문은 variance exploding(VE)과 variance preserving(VP) 확산 경로에도 CFM을 적용한다.

### VE 경로

noise-to-data 방향의 VE 조건부 경로는

$$
p_t(x\mid x_1) =
\mathcal{N}\!\left(x\mid x_1,\sigma_{1-t}^2I\right)
\tag{16}
$$

이다. $\sigma_t$는 증가하고 $\sigma_0=0$, $\sigma_1\gg1$이다. 유한 시간의 확산 경로는 진정한 잡음분포에 도달하지 않으므로 실제 $p_0$는 적절한 Gaussian으로 근사한다.

Eq. 15에 $\mu_t=x_1$과 $s(t)=\sigma_{1-t}$를 대입하면 $\dot s(t)=-\sigma'_{1-t}$이므로

$$
u_t(x\mid x_1) =
-\frac{\sigma_{1-t}'}{\sigma_{1-t}}(x-x_1)
\tag{17}
$$

을 얻는다. 음의 부호는 data-to-noise 경로의 시간 방향을 뒤집었기 때문에 생긴다.

부록의 forward VE SDE와 경로는

$$
dy=\sqrt{\frac{d}{dt}\sigma_t^2}\,dw
$$

$$
p_t(y\mid y_0) =
\mathcal{N}(y\mid y_0,\sigma_t^2I)
$$

$$
w_t(y\mid y_0) =
\frac{\sigma_t'}{\sigma_t}(y-y_0)
$$

이다. 역시간으로 바꾸면

$$
\tilde p_t(y\mid y_0) =
\mathcal{N}(y\mid y_0,\sigma_{1-t}^2I)
$$

$$
\tilde w_t(y\mid y_0) =
-\frac{\sigma_{1-t}'}{\sigma_{1-t}}(y-y_0)
$$

이 되어 Eq. 16과 Eq. 17에 대응한다.

### VP 경로

VP SDE는

$$
dy =
-\frac12\beta(t)y\,dt+\sqrt{\beta(t)}\,dw
$$

이고, forward conditional path는

$$
p_t(y\mid y_0) =
\mathcal{N}\!\left(
y\mid e^{-\frac12T(t)}y_0,
(1-e^{-T(t)})I
\right)
$$

이다. 본문의 noise-to-data 표기는

$$
p_t(x\mid x_1) =
\mathcal{N}\!\left(
x\mid\alpha_{1-t}x_1,
(1-\alpha_{1-t}^2)I
\right)
\tag{18}
$$

$$
\alpha_t =
e^{-\frac12\int_0^t\beta(s)\,ds}
$$

이다.

$a(t)=\alpha_{1-t}$, $s(t)=\sqrt{1-a(t)^2}$로 두면

$$
\frac{\dot s(t)}{s(t)} =
-\frac{a(t)\dot a(t)}{1-a(t)^2}.
$$

이를 Eq. 15에 대입해 정리하면

$$
u_t(x\mid x_1) =
\frac{\alpha_{1-t}'}{1-\alpha_{1-t}^2}
\left(\alpha_{1-t}x-x_1\right)
\tag{19}
$$

을 얻는다. $\alpha_s=e^{-T(s)/2}$에서

$$
\alpha_s'=-\frac{T'(s)}{2}\alpha_s
$$

이므로 같은 식은

$$
u_t(x\mid x_1) =
-\frac{T'(1-t)}{2}
\frac{
e^{-T(1-t)}x -
e^{-\frac12T(1-t)}x_1
}{
1-e^{-T(1-t)}
}
$$

로도 쓸 수 있다.

Lemma 1은 시간 반전의 일반형을 제공한다. $u_t$가 $p_t$를 생성하면

$$
\tilde u_t(x)=-u_{1-t}(x)
$$

는 $\tilde p_t(x)=p_{1-t}(x)$를 생성한다. 구현에서 `t`를 `1-t`로 바꾸면서 앞의 음수를 빠뜨리면 경로를 올바른 역방향으로 운반할 수 없다.

## 조건부 OT 경로

논문의 핵심 경로는 평균과 표준편차를 시간에 대해 선형으로 변화시킨다.

$$
\mu_t(x)=tx_1,\qquad
\sigma_t(x)=1-(1-\sigma_{\min})t
\tag{20}
$$

$c=1-\sigma_{\min}$로 두면 $\mu_t=tx_1$, $\sigma_t=1-ct$, $\mu_t'=x_1$, $\sigma_t'=-c$다. Eq. 15에 대입하면

$$
\begin{aligned}
u_t(x\mid x_1)
&=
-\frac{c}{1-ct}(x-tx_1)+x_1\\
&=
\frac{x_1-cx}{1-ct}.
\end{aligned}
$$

따라서

$$
u_t(x\mid x_1) =
\frac{x_1-(1-\sigma_{\min})x}
{1-(1-\sigma_{\min})t}
\tag{21}
$$

이다.

시작 잡음 $x_0$를 사용한 map은

$$
\psi_t(x_0) =
\left(1-(1-\sigma_{\min})t\right)x_0
+
tx_1
\tag{22}
$$

이다. 미분하면

$$
\frac{d}{dt}\psi_t(x_0) =
x_1-(1-\sigma_{\min})x_0
$$

가 된다. Eq. 21은 현재 좌표 $x$와 시간 $t$에 의존하지만, Eq. 22의 source coordinate에서는 표적이 시간에 무관하다. $x=\psi_t(x_0)$를 Eq. 21에 대입하면

$$
\begin{aligned}
u_t(\psi_t(x_0)\mid x_1)
&=
\frac{
x_1-c\left((1-ct)x_0+tx_1\right)
}{
1-ct
}\\
&=
x_1-cx_0
\end{aligned}
\tag{D6}
$$

로 분모가 정확히 소거된다.

따라서 학습 손실은

$$
\mathcal{L}_{\mathrm{CFM}}(\theta) =
\mathbb{E}_{t,q(x_1),p(x_0)}
\left\|
v_t(\psi_t(x_0)) -
\left(x_1-(1-\sigma_{\min})x_0\right)
\right\|^2
\tag{23}
$$

이 된다. 한 쌍 $(x_0,x_1)$에 대해 위치는 직선을 따라 이동하고 표적 속도는 일정하다. 확산 경로와 비교했을 때 신경망이 회귀할 조건부 함수와 ODE solver가 따라갈 조건부 궤적이 모두 단순해지는 지점이다.

일반적인 affine 경로를

$$
\psi_t(x_0)=b(t)x_0+a(t)x_1
$$

로 두면

$$
\frac{d}{dt}\psi_t(x_0) =
b'(t)x_0+a'(t)x_1
\tag{D7}
$$

이다. 비선형 schedule도 CFM에 사용할 수 있지만 $a'(t)$와 $b'(t)$가 시간에 따라 달라지므로 Eq. 23의 시간 불변 표적은 사라진다. 선형 schedule의 장점은 단순히 궤적이 직선이라는 데 그치지 않고, source coordinate에서 시간 의존성과 Eq. 21의 분모가 함께 소거된다는 데 있다.

OT map을 $\psi$라 할 때 변위 보간(displacement interpolation)은

$$
p_t =
[(1-t)\operatorname{id}+t\psi]_\star p_0
\tag{24}
$$

로 쓴다.

다만 조건부 OT flow가 각 조건부 문제에서 최적이라는 사실은 학습된 주변 벡터장까지 전역 OT 해라는 뜻이 아니다. Eq. 23에서는 $x_0\sim p_0$와 $x_1\sim q$를 독립적으로 뽑는다. 이는 사전분포와 데이터분포 사이에서 학습된 전역 OT coupling이 아니라 product coupling이다.

같은 $(t,x)$에 여러 조건부 경로가 겹치면 모델은 Eq. D3에 따라 서로 다른 조건부 속도의 평균을 배운다. 반대 방향의 속도가 겹치는 영역에서는 상쇄가 일어나거나 주변 궤적이 휘어질 수 있다. 따라서 조건부 궤적이 직선이라는 사실만으로 학습된 모든 주변 궤적도 직선이라고 결론 내릴 수 없다.

$\sigma_{\min}>0$도 중요하다. $\sigma_{\min}=0$이면 $t=1$에서 모든 $x_0$가 $x_1$ 하나로 붕괴하고

$$
\det D\psi_1=\sigma_{\min}^d=0
$$

이 된다. 그러면 affine map의 역함수가 endpoint에서 정의되지 않는다. 작은 양의 $\sigma_{\min}$은 데이터분포에 대한 근사와 CNF의 가역성 사이의 절충이다.

![2D 체커보드 데이터에서 모델별 샘플링 궤적과 속도 효율 비교](/assets/img/posts/flow-matching/figure4.jpg){: w="700" }
_그림 3. 조건부 경로의 단순한 기하가 학습할 속도장과 solver가 적분할 궤적의 난이도에 어떻게 연결되는지를 보여준다._

## 구현 관점에서

### OT 학습 루프

이미지 모델은 Dhariwal & Nichol의 U-Net을 최소한으로 변경해 사용한다. OT 경로의 한 학습 스텝은 다음처럼 옮길 수 있다.

```python
# x1: data batch,              (B, C, H, W)
# x0: standard Gaussian noise, (B, C, H, W)
# t: time per sample,          (B, 1, 1, 1)
# sigma_min: scalar

x1 = next_data_batch()
x0 = sample_standard_gaussian_like(x1)
t = sample_uniform_time(batch_size=x1.shape[0])

scale = 1.0 - (1.0 - sigma_min) * t        # (B, 1, 1, 1)
xt = scale * x0 + t * x1                   # (B, C, H, W), Eq. 22
target = x1 - (1.0 - sigma_min) * x0       # (B, C, H, W), dψ/dt

prediction = vector_field(xt, t)           # (B, C, H, W)
loss = mean_over_batch_and_pixels(
    squared_norm(prediction - target)
)

update_parameters(loss)
```

학습 루프에는 ODE solver가 없다. 각 스텝은 임의의 시간점에서 위치와 국소 속도를 독립적으로 구성한다. 확산 경로로 FM을 학습할 때도 모델 구조를 바꾸기보다 `xt`와 `target`을 Eq. 16–19에 맞게 교체한다.

틀리기 쉬운 지점은 다음과 같다.

- `t`는 `(B, 1, 1, 1)`로 두어 한 이미지의 모든 픽셀에 같은 시간이 broadcast되게 해야 한다. 픽셀별로 다른 시간을 뽑으면 Eq. 22의 단일 flow 상태가 아니다.
- Eq. 21의 현재 좌표 표적과 Eq. 23의 재매개변수화 표적을 섞으면 안 된다. 전자는 `xt`를 입력으로 사용하고 분모가 있으며, 후자는 같은 샘플을 만든 원래 `x0`를 사용해 분모가 소거된 형태다.
- $t=0$에서는 `xt=x0`이고 $t=1$에서는 `xt=\sigma_{\min}x_0+x_1`이다. 마지막 상태를 임의로 `x1`로 덮어쓰면 논문의 끝점 경로와 가역성 조건이 달라진다.
- VE·VP의 data-to-noise 식을 noise-to-data 구현에 옮길 때 `1-t`와 음의 부호를 함께 확인해야 한다.
- VP의 $\alpha_t$는 독립적인 한 스텝 계수가 아니라 $\beta$의 적분으로 정의된 누적량이다. 논문의 schedule에서는
  $$
  T(s)=s\beta_{\min}+\frac12s^2(\beta_{\max}-\beta_{\min})
  $$
  와 $\alpha_s=e^{-T(s)/2}$의 관계를 유지해야 한다.
- VP 식의 분모 $1-\alpha_{1-t}^2$는 경계에서 작아질 수 있다. 논문의 diffusion 구현은 시간 구간을 $\epsilon=10^{-5}$로 제한한다.
- clipping은 보고된 설정이 아니다. 추가한다면 논문과 다른 동역학을 도입한 선택으로 구분해야 한다.

### 샘플링 루프

생성 단계에서는 학습한 벡터장을 실제로 적분한다.

```python
# x: prior sample, (B, C, H, W)
x = sample_standard_gaussian(batch_shape)

# Solve dx/dt = v_t(x), from t=0 to t=1.
for t_start, t_end in ode_solver_schedule(0.0, 1.0):
    x = ode_solver_step(
        state=x,                     # (B, C, H, W)
        vector_field=vector_field,
        t_start=t_start,
        t_end=t_end,
    )

generated = x                        # approximate p_1 sample
```

학습과 샘플링은 비대칭이다. 학습은 무작위 시간점의 국소 벡터장을 회귀하므로 simulation-free지만, 생성은 Eq. 1을 풀어야 한다. 논문의 기본 평가는 adaptive `dopri5`와 `atol=rtol=1e-5`를 사용한다.

NFE는 solver가 주어진 tolerance에 도달할 때까지 호출한 벡터장 평가 횟수다. 논문은 50,000개 샘플의 평균 NFE를 보고한다. 따라서 NFE는 모델만의 고정된 속성이 아니라 벡터장, solver, 오차 허용치가 함께 결정하는 값이다.

### score matching과의 연결

확산 경로의 score matching 목적함수는

$$
\mathcal{L}_{\mathrm{SM}}(\theta) =
\mathbb{E}_{t,q(x_1),p_t(x\mid x_1)}
\lambda(t)
\left\|
s_t(x)-\nabla\log p_t(x\mid x_1)
\right\|^2
\tag{42}
$$

이다. Gaussian 경로에 대해서는 논문의 표기로

$$
\mathcal{L}_{\mathrm{SM}}(\theta) =
\mathbb{E}
\lambda(t)
\left\|
s_t(x) -
\frac{x-\mu_t(x_1)}{\sigma_t^2(x_1)}
\right\|^2
\tag{43}
$$

로 쓴다.

noise matching은

$$
\mathcal{L}_{\mathrm{NM}}(\theta) =
\mathbb{E}
\left\|
\epsilon_t(x) -
\frac{x-\mu_t(x_1)}{\sigma_t(x_1)}
\right\|^2
\tag{44}
$$

이고, $x=\sigma_t(x_1)x_0+\mu_t(x_1)$로 재매개변수화하면

$$
\mathcal{L}_{\mathrm{NM}}(\theta) =
\mathbb{E}
\left\|
\epsilon_t(\sigma_t(x_1)x_0+\mu_t(x_1))-x_0
\right\|^2
\tag{45}
$$

이 된다.

논문의 diffusion 설정에서 Score Matching은 $\lambda(t)=\sigma_t^2(x_1)$, ScoreFlow는 $\lambda(t)=\beta(1-t)$를 사용한다. VP schedule은

$$
\beta(s)=\beta_{\min}+s(\beta_{\max}-\beta_{\min})
$$

$$
T(s)=s\beta_{\min}
+\frac12s^2(\beta_{\max}-\beta_{\min})
$$

이며 $\beta_{\min}=0.1$, $\beta_{\max}=20$이다.

DDPM 샘플은

$$
u_t(x) =
-\frac{T'(1-t)}{2}[s_t(x)-x]
\tag{46}
$$

에 $s_t(x)=\epsilon_t(x)/\sigma_t$와 $\sigma_t=\sqrt{1-\alpha_{1-t}^2}$를 대입해 생성한다.

같은 diffusion probability path를 score matching으로 학습한 뒤 probability flow 벡터장으로 바꿀 수도 있고, FM으로 조건부 벡터장을 직접 회귀할 수도 있다. 이 비교 덕분에 경로 선택과 학습 parameterization의 효과를 분리해 볼 수 있다.

## CNF 우도 계산

학습에는 ODE가 필요 없지만 우도 평가에는 상태와 로그밀도 변화를 함께 적분해야 한다. 연속 방정식을 전개하면

$$
\frac{\partial p_t}{\partial t} =
-p_t\operatorname{div}(v_t)
-v_t^\top\nabla p_t
$$

이고, 따라서

$$
\frac{\partial}{\partial t}\log p_t =
-\operatorname{div}(v_t)
-v_t^\top\nabla\log p_t.
$$

Eq. 1을 따르는 궤적 위에서 전미분하면 이동항이 상쇄되어

$$
\frac{d}{dt}\log p_t(\phi_t(x)) =
-\operatorname{div}(v_t(\phi_t(x)))
\tag{D8}
$$

을 얻는다. 이를 적분하면

$$
\log p_1(\phi_1(x)) -
\log p_0(\phi_0(x)) =
-\int_0^1
\operatorname{div}(v_t(\phi_t(x)))\,dt
\tag{27}
$$

이다.

상태와 누적 로그밀도 변화 $f$를 함께 적분하면

$$
\frac{d}{dt}
\begin{bmatrix}
\phi_t(x)\\
f(t)
\end{bmatrix} =
\begin{bmatrix}
v_t(\phi_t(x))\\
-\operatorname{div}(v_t(\phi_t(x)))
\end{bmatrix}
\tag{28}
$$

$$
\begin{bmatrix}
\phi_0(x)\\
f(0)
\end{bmatrix} =
\begin{bmatrix}
x_0\\
c
\end{bmatrix}
\tag{29}
$$

$$
f(1) =
c+\log p_1(x_1)-\log p_0(x_0)
\tag{30}
$$

이 된다.

데이터 $x_1$에서 사전분포 방향으로 역적분할 때는

$$
\frac{d}{ds}
\begin{bmatrix}
\phi_{1-s}(x)\\
f(1-s)
\end{bmatrix} =
\begin{bmatrix}
-v_{1-s}(\phi_{1-s}(x))\\
\operatorname{div}(v_{1-s}(\phi_{1-s}(x)))
\end{bmatrix}
\tag{31}
$$

$$
\begin{bmatrix}
\phi_1(x)\\
f(1)
\end{bmatrix} =
\begin{bmatrix}
x_1\\
0
\end{bmatrix}
\tag{32}
$$

로 두고

$$
\log p_1(x_1) =
\log p_0(x_0)-f(0)
\tag{33}
$$

을 계산한다.

고차원에서는 divergence의 정확한 trace가 비싸다. 논문은 $\mathbb{E}[zz^T]=I$인 $z\in\mathbb{R}^d$를 이용한 Hutchinson estimator를 사용한다.

$$
\frac{d}{ds}
\begin{bmatrix}
\phi_{1-s}(x)\\
\tilde f(1-s)
\end{bmatrix} =
\begin{bmatrix}
-v_{1-s}(\phi_{1-s}(x))\\
z^TDv_{1-s}(\phi_{1-s}(x))z
\end{bmatrix}
\tag{34}
$$

행렬 $J=Dv$에 대해

$$
\begin{aligned}
\mathbb{E}_z[z^\top Jz]
&=
\operatorname{tr}\!\left(J\mathbb{E}_z[zz^\top]\right)\\
&=
\operatorname{tr}(J) =
\operatorname{div}(v)
\end{aligned}
\tag{D9}
$$

이므로

$$
\log p_0(x_0)-\tilde f(0)
\tag{35}
$$

은 $\log p_1(x_1)$의 불편추정량이다. 정확한 trace를 무작위 quadratic form으로 바꾸어 계산을 줄이지만, 개별 우도 추정치의 무작위성까지 제거하는 것은 아니다.

### CNF와 데이터 변환의 합성

여기서는 기호의 역할을 구분해야 한다.

- $\varphi$: 학습한 CNF
- $\phi$: 이미지 데이터 변환

전체 변환은 CNF를 적용한 뒤 데이터 변환을 적용하므로

$$
\psi(x)=\phi\circ\varphi(x)
$$

이다. 데이터 공간의 밀도는

$$
p_1(x) =
\psi_*p_0(x) =
\varphi_*p_0(\phi^{-1}(x))
\det D\phi^{-1}(x)
$$

$$
\log p_1(x) =
\log\!\left[
\varphi_*p_0(\phi^{-1}(x))
\right]
+
\log\det D\phi^{-1}(x)
$$

로 전개된다.

논문의 데이터 변환은

$$
\phi(y)=2^7(y+1),
\qquad
\phi^{-1}(x)=2^{-7}x-1
$$

이다. 따라서

$$
D\phi^{-1}(x)=2^{-7}I
$$

이고

$$
\log\det D\phi^{-1}(x) =
-7d\log2.
$$

결국 Eq. 36은

$$
\log p_1(x) =
\log\!\left[
\varphi_*p_0(\phi^{-1}(x))
\right] -
7d\log2
\tag{36}
$$

이다.

BPD는

$$
\operatorname{BPD} =
\mathbb{E}_{x_1}
\left[
-\frac{\log p_1(x_1)}{d\log2}
\right]
\tag{37}
$$

이고, CNF 공간의 밀도로 쓰면

$$
\operatorname{BPD} =
-\frac{
\log\!\left[
\varphi_*p_0(\phi^{-1}(x))
\right]
}{
d\log2
}
+7
$$

이다. CNF $\varphi$와 데이터 변환 $\phi$를 뒤바꾸거나 $7d\log2$의 Jacobian 보정을 빠뜨리면 이미지 공간의 BPD가 잘못 계산된다.

Uniform dequantization의 importance-weighted NLL은 $u_k\sim U(0,1)$에 대해

$$
\log\left(
\frac1K\sum_{k=1}^Kp_t(x+u_k)
\right)
\tag{47}
$$

로 계산한다.

## 확산 SDE와 probability flow의 연결

일반적인 확산 SDE는

$$
dy=f_t\,dt+g_t\,dw
\tag{38}
$$

이고 밀도는 Fokker–Planck 방정식을 따른다.

$$
\frac{dp_t}{dt} =
-\operatorname{div}(f_tp_t)
+
\frac{g_t^2}{2}\Delta p_t
\tag{39}
$$

$\nabla p_t=p_t\nabla\log p_t$를 이용하면

$$
\Delta p_t =
\operatorname{div}
\left(
p_t\nabla\log p_t
\right)
$$

이므로

$$
\begin{aligned}
\frac{dp_t}{dt}
&=
-\operatorname{div}(f_tp_t)
+
\operatorname{div}
\left(
\frac{g_t^2}{2}p_t\nabla\log p_t
\right)\\
&=
-\operatorname{div}
\left[
p_t
\left(
f_t-\frac{g_t^2}{2}\nabla\log p_t
\right)
\right].
\end{aligned}
$$

따라서 같은 주변분포를 생성하는 결정론적 probability flow 벡터장은

$$
w_t =
f_t-\frac{g_t^2}{2}\nabla\log p_t
\tag{40}
$$

이다.

이 관계는 diffusion과 FM이 완전히 분리된 방법이 아님을 보여준다. diffusion path에서는 score를 학습해 Eq. 40의 벡터장을 구성할 수도 있고, FM으로 대응하는 조건부 벡터장을 직접 회귀할 수도 있다. 반면 조건부 OT path는 먼저 SDE의 drift와 diffusion coefficient를 정하지 않고 Eq. 21의 벡터장을 직접 학습한다.

기존의 [DDPM](/posts/ddpm/)이 고정된 이산 diffusion path의 noise prediction을 학습하고 [Score-Based Generative Modeling through SDEs](/posts/score-sde/)이 이를 연속시간 SDE와 probability flow ODE로 확장했다면, FM은 확률 경로 자체를 교체 가능한 설계 변수로 끌어올린다.

## 실험 설정

실험 데이터는 CIFAR-10과 ImageNet 32×32, 64×64, 128×128, 256×256이다. 지표는 BPD 단위 NLL, FID, NFE, Inception Score(IS), PSNR, SSIM이다. 조건부 초해상도 실험은 ImageNet 이미지를 64×64에서 256×256으로 upsampling하고 Saharia et al.의 평가 절차를 따른다.

2D 실험에는 5층, 층당 512-neuron MLP를 사용했다. 이미지 모델은 U-Net 기반이다. 이미지는 center crop 후 목표 해상도로 resize하며, 32×32와 64×64에는 Chrabaszcz et al.의 전처리를 사용한다.

CIFAR-10과 ImageNet-32는 32-bit precision, ImageNet-64·128·256은 16-bit mixed precision으로 학습했다. 옵티마이저는 Adam이며 $\beta_1=0.9$, $\beta_2=0.999$, weight decay는 $0.0$, $\epsilon=1\mathrm{e}{-8}$이다. Polynomial decay에서는 warm-up 동안 $1\mathrm{e}{-8}$에서 peak learning rate까지 증가한 뒤 마지막 단계까지 다시 $1\mathrm{e}{-8}$로 선형 감소한다.

| 하이퍼파라미터 | CIFAR-10 | ImageNet-32 | ImageNet-64 | ImageNet-128 |
|---|---:|---:|---:|---:|
| Channels | 256 | 256 | 192 | 256 |
| Depth | 2 | 3 | 3 | 3 |
| Channels multiple | 1,2,2,2 | 1,2,2,2 | 1,2,3,4 | 1,1,2,3,4 |
| Heads | 4 | 4 | 4 | 4 |
| Attention resolution | 16 | 16,8 | 32,16,8 | 32,16,8 |
| Effective batch size | 256 | 1024 | 2048 | 1536 |
| GPUs | 2 | 4 | 16 | 32 |
| Epochs | 1000 | 200 | 250 | 571 |
| Iterations | 391k | 250k | 157k | 500k |
| Learning rate | 5e-4 | 1e-4 | 1e-4 | 1e-4 |
| Scheduler | Polynomial Decay | Polynomial Decay | Constant | Polynomial Decay |
| Warmup steps | 45k | 20k | - | 20k |

이 표에서 읽어야 할 점은 해상도가 높아질수록 GPU 수만 늘어난 것이 아니라 batch size, channel 구성, precision, iteration도 함께 달라진다는 것이다. 따라서 서로 다른 해상도의 학습 비용을 GPU 수 하나로 비교할 수 없다.

평가는 CIFAR-10과 ImageNet-32·64에서 TensorFlow GAN library를, ImageNet-128에서 Dhariwal & Nichol의 평가 스크립트를 사용한다.

## 실험에서 확인한 것

### 같은 architecture에서 objective와 경로 비교

Table 1은 동일한 architecture와 hyperparameter를 사용한 비교다. baseline에는 수렴을 위해 더 많은 iteration을 허용했다.

| Model | CIFAR NLL↓ | CIFAR FID↓ | CIFAR NFE↓ | IN-32 NLL↓ | IN-32 FID↓ | IN-32 NFE↓ | IN-64 NLL↓ | IN-64 FID↓ | IN-64 NFE↓ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DDPM | 3.12 | 7.48 | 274 | 3.54 | 6.99 | 262 | 3.32 | 17.36 | 264 |
| Score Matching | 3.16 | 19.94 | 242 | 3.56 | 5.68 | 178 | 3.40 | 19.74 | 441 |
| ScoreFlow | 3.09 | 20.78 | 428 | 3.55 | 14.14 | 195 | 3.36 | 24.95 | 601 |
| FM w / Diffusion | 3.10 | 8.06 | 183 | 3.54 | 6.37 | 193 | 3.33 | 16.88 | 187 |
| FM w / OT | **2.99** | **6.35** | **142** | **3.53** | **5.02** | **122** | **3.31** | **14.45** | **138** |

FM-OT는 세 데이터셋에서 NLL, FID, NFE가 모두 가장 낮다. CIFAR-10에서는 2.99, 6.35, 142이고, ImageNet-32에서는 3.53, 5.02, 122, ImageNet-64에서는 3.31, 14.45, 138이다.

FM-Diffusion도 DDPM·Score Matching·ScoreFlow보다 전반적으로 적은 NFE를 기록한다. 이는 같은 diffusion path에서도 학습 parameterization을 FM으로 바꾸는 효과가 있음을 보여준다. 이후 FM-Diffusion을 FM-OT와 비교하면 경로 선택의 추가 효과를 볼 수 있다.

![확산 손실 기반 모델과 FM 기반 모델의 NLL, FID, NFE 종합 비교](/assets/img/posts/flow-matching/table1.png){: w="700" }
_그림 4. 이 표의 핵심은 FM-OT가 품질 지표만 개선한 것이 아니라 동일한 adaptive solver 조건에서 함수 평가 횟수도 함께 낮췄다는 점이다._

ImageNet-128의 무조건부 비교는 다음과 같다. conditioning을 사용하는 IC-GAN은 제외됐다.

| Model | ImageNet-128 NLL↓ | ImageNet-128 FID↓ |
|---|---:|---:|
| MGAN | - | 58.9 |
| PacGAN2 | - | 57.5 |
| Logo-GAN-AE | - | 50.9 |
| Self-cond. GAN | - | 41.7 |
| Uncond. BigGAN | - | 25.3 |
| PGMGAN | - | 21.7 |
| FM w / OT | **2.90** | **20.9** |

FM-OT는 FID 20.9와 NLL 2.90을 보고한다. 다른 모델의 NLL은 표에 없으므로 행 사이에서 직접 비교할 수 있는 지표는 FID다.

ImageNet-64의 학습 중 FID 곡선에서는 FM-OT가 빠르게 수렴한다. ImageNet-128에서는 Dhariwal & Nichol의 4.36m iterations, batch 256과 비교해 FM이 500k iterations, batch 1.5k, 25% 더 큰 모델을 사용했다. 논문은 이를 종합해 FM이 33% 적은 image throughput을 사용했다고 설명한다. iteration만 비교하면 batch size와 모델 크기 차이를 놓치게 된다.

CIFAR-10 FID가 기존 연구보다 높은 원인에 대해서는 CIFAR-10에 최적화되지 않은 architecture일 가능성을 제시한다. 따라서 가장 통제된 근거는 동일 architecture 안에서 objective와 path를 바꾼 Table 1의 비교다.

### 초해상도

| Model | FID↓ | IS↑ | PSNR↑ | SSIM↑ |
|---|---:|---:|---:|---:|
| Reference | 1.9 | 240.8 | - | - |
| Regression | 15.2 | 121.1 | **27.9** | **0.801** |
| SR3 | 5.2 | 180.1 | 26.4 | 0.762 |
| FM w / OT | **3.4** | **200.8** | 24.7 | 0.747 |

FM-OT는 FID 3.4와 IS 200.8로 SR3의 5.2와 180.1보다 좋다. 반면 PSNR 24.7과 SSIM 0.747은 Regression과 SR3보다 낮다. 이 표는 분포 수준의 지각 품질과 입력에 대한 픽셀 단위 정합성이 같은 목표가 아님을 보여준다. FID·IS만 읽으면 복원 정확도의 손실을 놓치고, PSNR·SSIM만 읽으면 생성 분포의 품질 차이를 놓친다.

### NFE와 수치 오차

ImageNet-32 모델을 midpoint scheme으로 적분하고, 256개 noise seed에 대해 1000-NFE 해를 기준으로 per-pixel MSE를 측정했을 때 OT 경로는 같은 오차에 도달하는 데 diffusion 경로의 약 60% NFE만 필요했다.

score matching 모델은 학습 도중 샘플링에 필요한 NFE가 크게 변동한 반면, FM은 학습 과정 내내 거의 일정한 NFE를 유지했다. 최종 NFE뿐 아니라 학습 중 solver 난이도의 변동도 작았다는 결과다.

이 결과가 직선 조건부 경로는 항상 적은 NFE를 보장한다는 정리는 아니다. 다만 같은 모델과 수치 오차 기준에서 OT 경로가 더 적은 함수 평가를 요구했다는 실험적 근거다.

### dequantization 표본 수와 NLL

| Model | CIFAR K=1 | K=20 | K=50 | IN-32 K=1 | K=5 | K=15 | IN-64 K=1 | K=5 | K=10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DDPM | 3.24 | 3.14 | 3.12 | 3.62 | 3.57 | 3.54 | 3.36 | 3.33 | 3.32 |
| Score Matching | 3.28 | 3.18 | 3.16 | 3.65 | 3.59 | 3.57 | 3.43 | 3.41 | 3.40 |
| ScoreFlow | 3.21 | 3.11 | 3.09 | 3.63 | 3.57 | 3.55 | 3.39 | 3.37 | 3.36 |
| FM w / Diffusion | 3.23 | 3.13 | 3.10 | 3.64 | 3.58 | 3.56 | 3.37 | 3.34 | 3.33 |
| FM w / OT | **3.11** | **3.01** | **2.99** | **3.62** | **3.56** | **3.53** | **3.35** | **3.33** | **3.31** |

모든 모델에서 $K$가 커질수록 보고된 BPD가 낮아진다. Table 1의 최종 NLL을 재현할 때 데이터셋마다 사용한 $K$가 다르다는 점을 함께 확인해야 한다. NLL의 소수점 차이를 모델 차이로 해석하기 전에 dequantization 평가 설정이 같은지 확인해야 하는 이유다.

## 무엇이 성능을 만들었나

실험은 두 축을 분리한다.

첫 번째는 같은 diffusion path에서 학습 parameterization만 바꾸는 비교다. FM-Diffusion은 CIFAR-10에서 DDPM보다 FID는 8.06 대 7.48로 높지만 NFE는 183 대 274로 낮다. ImageNet-32에서는 FID 6.37 대 6.99, NFE 193 대 262이고, ImageNet-64에서는 FID 16.88 대 17.36, NFE 187 대 264다. 이는 diffusion path를 유지해도 FM 회귀가 기존 diffusion loss와 다른 결과를 만든다는 근거다.

두 번째는 FM 안에서 diffusion path를 OT path로 바꾸는 비교다. FM-OT는 FM-Diffusion 대비 다음과 같이 개선된다.

- CIFAR-10: NLL 3.10→2.99, FID 8.06→6.35, NFE 183→142
- ImageNet-32: NLL 3.54→3.53, FID 6.37→5.02, NFE 193→122
- ImageNet-64: NLL 3.33→3.31, FID 16.88→14.45, NFE 187→138

따라서 결과를 FM 손실 하나의 효과로만 읽을 수 없다. Theorem 2의 조건부 회귀가 simulation-free 학습을 가능하게 하고, 조건부 OT 경로가 회귀 표적과 생성 궤적을 추가로 단순화한다.

U-Net, Adam, `dopri5`, Hutchinson estimator는 이 방법을 구현하고 평가하는 데 필요하지만 논문의 독자적 기여 자체는 아니다. 오히려 기존 U-Net을 최소 변경해 사용했기 때문에 Table 1에서 objective와 path의 효과를 비교하기 쉬워졌다.

ablation의 범위에도 경계가 있다. canonical affine 벡터장과 같은 밀도 경로를 생성하는 다른 벡터장을 직접 비교하지 않았고, $\sigma_{\min}$의 민감도도 따로 분리하지 않았다. 따라서 불필요한 순환 성분 제거가 NFE를 낮춘다는 설명은 수식에 근거한 설계 해석이며, 실험이 직접 검증한 것은 FM-Diffusion과 FM-OT의 차이다.

## 비용과 경량화 관점

Flow Matching은 CNF 학습에서 비쌌던 수치 ODE 시뮬레이션을 제거한다. 한 학습 스텝은 데이터, 잡음, 시간을 샘플링하고 한 번의 벡터장 회귀를 수행하는 구조다. 이 변화가 큰 U-Net과 ImageNet 규모에서 CNF를 학습할 수 있게 한 직접적인 효율 이점이다.

그러나 전체 파이프라인이 simulation-free인 것은 아니다.

- 학습: ODE 없이 국소 벡터장 회귀
- 생성: $t=0$에서 $1$까지 상태 ODE 적분
- 우도 평가: 역방향 augmented ODE와 divergence 추정
- BPD 평가: 이미지 데이터 변환의 Jacobian 및 dequantization 처리

생성 비용은 대략 벡터장 한 번의 비용과 NFE의 곱에 좌우된다. FM-OT의 NFE는 CIFAR-10 142, ImageNet-32 122, ImageNet-64 138로 비교 대상 중 가장 낮았다. 같은 수치 오차에서 diffusion 경로의 약 60% NFE만 필요했다는 결과도 있다. 파라미터 수를 줄이는 경량화가 아니라, 같은 신경망을 호출하는 횟수를 줄이는 경량화에 가깝다.

반면 ImageNet-128 모델은 비교 대상보다 25% 컸다. FM은 500k iterations와 batch 1.5k를 사용했고 논문은 33% 적은 image throughput을 보고했지만, 모델 크기까지 작았다는 뜻은 아니다. 효율은 최소한 다음 단위를 분리해 읽어야 한다.

- 학습 iteration
- 처리한 이미지 수
- effective batch size
- GPU 수와 precision
- 모델 크기
- 생성 NFE
- 우도 평가를 위한 divergence 계산

하드웨어도 CIFAR-10 2 GPUs, ImageNet-32 4 GPUs, ImageNet-64 16 GPUs, ImageNet-128 32 GPUs로 증가한다. ImageNet-64 이상에서는 16-bit mixed precision을 사용한다. 이는 대규모 학습의 메모리와 처리량을 관리하기 위한 구현 조건이지만, FM 자체가 모델 파라미터 메모리를 줄이는 기법이라는 뜻은 아니다.

Table 1의 NFE는 `dopri5`, `atol=rtol=1e-5` 조건에서 측정됐다. tolerance를 느슨하게 하면 NFE가 줄 수 있지만 수치 오차가 달라지고, solver를 바꾸면 같은 벡터장도 다른 NFE를 보일 수 있다. 그래서 이 논문의 비용 주장은 특정 solver 조건을 포함한 비교로 읽어야 한다.

이 비용 구조는 이후 연구가 출발할 지점을 분명하게 만든다. 학습 ODE를 제거한 다음 남는 병목은 생성 시 수치 적분의 스텝 수와 우도 평가의 divergence 계산이다. 따라서 더 단순한 확률 경로, 더 적은 스텝의 적분, 우도 계산 효율화가 자연스러운 후속 최적화 대상이 된다.

## 한계와 생각해볼 점

논문에는 별도의 한계 섹션이 없다. 다음 내용은 저자가 직접 주의한 경계와 수식·실험에서 드러나는 해석을 구분해 읽어야 한다.

첫째, 저자가 명시했듯 조건부 OT 경로가 최적이라는 사실은 주변 벡터장이 전역 OT 해라는 뜻이 아니다. Eq. 23의 독립적인 $(x_0,x_1)$ 샘플링은 전역 수송비용을 최소화한 coupling이 아니다. 조건부 직선성과 주변 직선성을 구분해야 한다.

둘째, 이론은 정칙성, 양의 밀도, 가역성을 사용한다. Theorem 1은 미분과 적분의 교환에, Theorem 2는 $p_t(x)>0$인 사후분포에, Theorem 3은 affine map의 역함수에 의존한다. 이 조건이 깨지면 각 증명의 핵심 단계도 함께 점검해야 한다.

셋째, $\sigma_{\min}$은 단순한 구현 상수가 아니다. 작을수록 최종 Gaussian이 데이터 샘플에 가까워지지만, $\sigma_{\min}=0$에서는 endpoint map이 붕괴해 가역성을 잃는다. 이 값에 대한 별도의 민감도 ablation은 보고되지 않았다.

넷째, 효율 수치를 하나로 합치기 어렵다. 학습에서는 ODE 제거와 image throughput, 생성에서는 solver 조건에 따른 NFE, 우도 평가에서는 역방향 ODE와 Hutchinson estimator가 각각 비용을 결정한다. 생성 NFE가 감소했다고 해서 우도 평가 비용도 같은 비율로 감소한다고 결론 내릴 수 없다.

다섯째, 실험은 CIFAR-10과 여러 해상도의 ImageNet 이미지에 집중돼 있다. 이 범위에서는 동일 architecture 비교가 FM objective와 OT path의 효과를 지지한다. 다른 데이터 구조에서도 product coupling으로 인한 조건부 경로 중첩이 같은 방식으로 나타나는지는 이 실험만으로 판단할 수 없다.

여섯째, 초해상도 결과는 품질 지표 사이의 목표 차이를 보여준다. FM-OT는 FID와 IS가 좋지만 PSNR과 SSIM은 낮다. 생성 분포의 지각 품질과 입력에 대한 픽셀 단위 충실도를 같은 성능으로 취급하면 결과를 잘못 읽게 된다.

사회적 책임 측면에서 논문은 이미지 생성의 유해 사용 가능성을 언급하고, content-controlled training set과 validation/classification을 완화책으로 논의한다. 대규모 모델의 에너지 수요도 지적한다. Flow Matching이 학습 ODE와 생성 NFE를 줄이는 것은 계산 비용 완화와 연결되지만, 큰 모델과 대규모 데이터 학습의 에너지 문제 자체를 제거하지는 않는다.

