---
title: "[논문 리뷰] Sliced Score Matching: A Scalable Approach to Density and Score Estimation"
date: 2026-08-15 08:00:00 +0900
permalink: /posts/sliced-score-matching/
categories:
  - AI
  - Paper Review
tags: [paper-review, score-matching, score-based, density-estimation, variance-reduction]
description: "score matching의 Hessian trace 계산을 무작위 투영으로 우회해 고차원에서 쓸 수 있게 만든 논문. NCSN 이후 score-based 생성모델의 계산적 전제."
related: [ncsn, ncsnv2, score-sde, ddpm]
paper:
  authors: "Yang Song, Sahaj Garg, Jiaxin Shi, Stefano Ermon (Stanford University, Tsinghua University)"
  venue: "UAI 2019"
  arxiv: "https://arxiv.org/abs/1905.07088"
---

> 이 글은 개인 Obsidian에 정리해 둔 논문 노트를 블로그 형식으로 다시 편집한 글이다. Hessian trace 계산을 랜덤 투영으로 우회한다는 아이디어와 그 대가에 초점을 맞춘다.

## 세 줄 요약

Sliced Score Matching(SSM)은 고차원 스코어(score) 전체를 직접 비교하는 대신 랜덤 방향에 투영한 값들을 맞춰, 표준 score matching의 Hessian trace 계산 비용을 줄인다. 목적함수를 부분적분하면 데이터 분포의 미지 스코어가 사라지고, Hessian 전체 대신 Hessian-vector product만으로 학습할 수 있다. 이 계산상의 변화는 일관성(consistency)과 점근적 정규성(asymptotic normality)을 유지하면서 깊은 비정규화 밀도 모델, 암묵적 분포의 score estimation, VAE와 WAE 학습까지 연결된다.

## 이 논문이 풀려는 문제

밀도 모델 $p_m(x;\theta)$의 스코어는 로그 밀도의 입력 그래디언트다.

$$
s_m(x;\theta)=\nabla_x\log p_m(x;\theta).
$$

정규화 상수를 계산하기 어려운 모델에서도 스코어는 유용하다. $\log p_m$에 입력과 무관한 정규화 상수가 더해져 있더라도 $x$로 미분하면 사라지기 때문이다. 따라서 비정규화 밀도 $\tilde p_m$만 알아도

$$
s_m(x;\theta)=\nabla_x\log \tilde p_m(x;\theta)
$$

를 계산할 수 있다.

스코어가 필요한 곳은 명시적 밀도 추정에 한정되지 않는다. 암묵적 모델에서 표본을

$$
x=g_\theta(\epsilon)
$$

처럼 재매개변수화(reparameterization)하면, 변분 추론에 들어가는 엔트로피 그래디언트가 분포의 스코어 $\nabla_x\log q_\theta(x)$와 생성 함수의 파라미터 미분 $\nabla_\theta g_\theta(\epsilon)$의 곱을 포함하는 형태로 전개된다. 암묵적 분포는 표본을 만들 수 있어도 $\log q_\theta(x)$를 직접 평가하기 어려우므로, 그 스코어를 데이터에서 추정할 수 있다면 엔트로피 항을 최적화할 통로가 열린다.

이 관계는 엔트로피를 재매개변수화해 직접 미분하면 더 분명해진다.

$$
H(q_\theta) =
-E_{\epsilon}
\left[
\log q_\theta(g_\theta(\epsilon))
\right].
$$

$x=g_\theta(\epsilon)$로 두고 연쇄법칙을 적용하면

$$
\begin{aligned}
\nabla_\theta H(q_\theta) =
-E_\epsilon\Big[
&\left.\nabla_\theta\log q_\theta(x)\right|_{x=g_\theta(\epsilon)}\\
&+
\nabla_x\log q_\theta(x)^\top
\nabla_\theta g_\theta(\epsilon)
\Big].
\end{aligned}
$$

첫 항은 고정된 $x$에서 밀도 자체가 변하는 항이며, 그 기대값은

$$
E_{q_\theta(x)}
\left[
\nabla_\theta\log q_\theta(x)
\right] =
\int q_\theta(x)
\frac{\nabla_\theta q_\theta(x)}{q_\theta(x)}dx =
\nabla_\theta\int q_\theta(x)dx =
0
$$

이다. 따라서

$$
\nabla_\theta H(q_\theta) =
-E_\epsilon
\left[
\nabla_x\log q_\theta(x)^\top
\nabla_\theta g_\theta(\epsilon)
\right].
$$

즉 암묵적 분포에서 엔트로피 값 자체를 평가하지 못하더라도, 스코어를 추정하면 엔트로피의 파라미터 그래디언트를 구성할 수 있다.

문제는 기존 score matching을 깊은 모델과 고차원 데이터에 적용할 때 생기는 계산량이다. 표준 목적함수는 로그 밀도의 Hessian trace를 포함한다. 데이터 차원이 $D$라면 trace의 각 대각 성분을 구하기 위해 차원에 비례하는 forward·backward 연산이 필요하다. Algorithm 2 기준으로 스코어를 구하는 한 번의 그래디언트 연산에 더해 $D$개 좌표 각각을 다시 미분하므로 총 $D+1$회의 gradient operation이 필요하다.

기존의 효율화 방법에도 제약이 있었다.

- Denoising Score Matching(DSM)은 원본 데이터에 노이즈를 더한 뒤 오염된 분포의 스코어를 학습한다. 이 방식으로 직접 복원되는 것은 원본이 아니라 noise-corrupted distribution이며, 노이즈 분산 $\sigma$ 선택에 민감하다.
- Approximate Backpropagation은 근사 오차에 대한 이론적 보장이 없고, 기존 실험 범위가 단일 은닉층에 국한되어 있었다.
- Curvature Propagation은 분석이 실제 분산이 아니라 pseudo-variance를 다루며, 신경망 노드별 노이즈 주입과 복소수 구현을 요구한다.
- Approximate Backpropagation과 Curvature Propagation 모두 일반적인 역전파를 그대로 쓰기 어렵고, 일관되지 않은 파라미터 추정이나 큰 추정 분산이 문제가 될 수 있다.

이 논문의 질문은 그래서 명확하다. 전체 Hessian trace를 정확히 계산하지 않으면서도 원래 score matching이 목표로 삼던 밀도 또는 스코어를 식별할 수 있는가? SSM의 답은 “랜덤 방향으로 잘라서 본다”이다.

## 표준 Score Matching에서 출발하기

### Fisher divergence와 관측할 수 없는 데이터 스코어

가장 직접적인 목표는 모델 스코어와 데이터 스코어 사이의 제곱 오차다.

$$
\mathcal{L}(\theta)
\triangleq
\frac{1}{2}E_{p_d}
\left[
\left\|s_m(x;\theta)-s_d(x)\right\|_2^2
\right].
\tag{1}
$$

여기서

$$
s_d(x)=\nabla_x\log p_d(x)
$$

이고, Eq. 1은 Fisher divergence다. 모델이 데이터 분포를 정확히 표현하면 두 스코어가 같아져 목적함수가 0이 된다.

하지만 표본만 주어진 상황에서는 $p_d(x)$도, $s_d(x)$도 직접 알 수 없다. Eq. 1을 그대로 최소화할 수 없는 이유다. 제곱을 전개하면

$$
\begin{aligned}
\mathcal L(\theta)
={}&
\frac12E_{p_d}\|s_m(x;\theta)\|_2^2 -
E_{p_d}[s_m(x;\theta)^\top s_d(x)]\\
&+
\frac12E_{p_d}\|s_d(x)\|_2^2.
\end{aligned}
$$

마지막 항은 $\theta$에 무관하므로 $C$로 묶을 수 있다. 교차항은 $s_{d,i}p_d=\partial_{x_i}p_d$를 사용하면

$$
\begin{aligned}
-E_{p_d}[s_m^\top s_d]
&=
-\sum_{i=1}^D
\int
s_{m,i}(x;\theta)
\frac{\partial p_d(x)}{\partial x_i}dx\\
&=
-\sum_{i=1}^D
\int
\left[
s_{m,i}(x;\theta)p_d(x)
\right]_{x_i=-\infty}^{x_i=\infty}
dx_{\setminus i}\\
&\quad+
\sum_{i=1}^D
\int
p_d(x)
\frac{\partial s_{m,i}(x;\theta)}{\partial x_i}dx.
\end{aligned}
$$

경계항이 0이라는 조건 아래 남는 것은

$$
E_{p_d}
\left[
\sum_{i=1}^D
\frac{\partial s_{m,i}}{\partial x_i}
\right] =
E_{p_d}
\left[
\operatorname{tr}(\nabla_xs_m)
\right]
$$

이다. 따라서 표준 score matching 목적함수는

$$
J(\theta)
\triangleq
E_{p_d}
\left[
\operatorname{tr}(\nabla_xs_m(x;\theta))
+
\frac{1}{2}\|s_m(x;\theta)\|_2^2
\right].
\tag{2}
$$

두 목적함수는

$$
\mathcal{L}(\theta)=J(\theta)+C
$$

의 관계를 갖는다. $C$는 $\theta$와 무관하므로 Eq. 2를 최소화하는 것은 Eq. 1을 최소화하는 것과 같다.

Eq. 2의 두 항은 서로 다른 역할을 한다. $\frac12\|s_m\|^2$는 모델 스코어의 크기를 억제한다. 이것만 두면 모든 입력에서 $s_m=0$인 해가 유리해지므로 데이터 분포의 구조를 회복할 수 없다. 반면 divergence 항인 $\operatorname{tr}(\nabla_xs_m)$는 부분적분을 통해 사라진 데이터 스코어와의 교차항을 대신한다. 두 항이 함께 있어야 모델 스코어를 데이터 스코어 쪽으로 움직이는 목적함수가 된다.

밀도 모델의 스코어를 다시 입력으로 미분하면

$$
\nabla_xs_m(x;\theta) =
\nabla_x^2\log\tilde p_m(x;\theta).
\tag{3}
$$

즉 Eq. 2의 첫 항은 로그 비정규화 밀도의 Hessian trace다. 유한표본 목적함수는

$$
\hat J(\theta;x_1^N) =
\frac1N\sum_{i=1}^N
\left[
\operatorname{tr}(\nabla_xs_m(x_i;\theta))
+
\frac12\|s_m(x_i;\theta)\|_2^2
\right]
$$

가 된다. 병목은 통계적 정의가 아니라 이 trace를 계산하는 방법에 있다.

## 핵심 아이디어 — 스코어를 랜덤 방향으로 잘라 보기

### 투영된 오차도 원래 스코어를 식별할 수 있는가

SSM은 벡터 전체의 오차 대신 랜덤 벡터 $v$ 방향으로 투영한 스칼라 오차를 사용한다.

$$
\mathcal{L}(\theta;p_v)
\triangleq
\frac12E_{p_v}E_{p_d}
\left[
\left(
v^\top s_m(x;\theta)-v^\top s_d(x)
\right)^2
\right].
\tag{4}
$$

허용되는 투영 분포 $p_v$는 다음 조건을 만족해야 한다.

$$
E_{p_v}[vv^\top]\succ0,
\qquad
E_{p_v}[\|v\|_2^2]<\infty.
$$

스코어 오차를

$$
\delta(x)=s_m(x;\theta)-s_d(x),
\qquad
\Sigma_v=E_{p_v}[vv^\top]
$$

라고 두면 투영 오차는

$$
E_{p_v}[(v^\top\delta)^2] =
E_{p_v}[\delta^\top vv^\top\delta] =
\delta^\top\Sigma_v\delta
$$

가 된다. $\Sigma_v\succ0$이면

$$
\delta^\top\Sigma_v\delta
\ge
\lambda_{\min}(\Sigma_v)\|\delta\|_2^2
$$

이므로 0이 아닌 스코어 오차는 목적함수에서 사라질 수 없다. 반대로 $\Sigma_v$에 영공간이 있으면 그 부분공간의 오차는 검출되지 않는다.

이 계산은 랜덤 투영이 단순한 계산 편법이 아니라 식별가능성의 일부임을 보여준다. 예를 들어 $D>1$에서 하나의 고정된 방향 $v_0$만 계속 사용하면

$$
E[vv^\top]=v_0v_0^\top
$$

은 rank 1이다. $v_0^\top\delta=0$인 모든 비영벡터 $\delta$가 목적함수 0을 만들 수 있으므로 Lemma 1의 결론이 깨진다. 좌표 일부만 고정적으로 고르는 경우에도 선택되지 않은 좌표 방향이 같은 영공간이 된다.

두 번째 조건은 목적함수와 증명에서 사용하는 모멘트가 유한하도록 만든다. 논문이 제시한 예시는 다변량 표준정규분포 $\mathcal N(0,I_D)$, $\{\pm1\}^D$ 위의 다변량 Rademacher 분포, 초구 $S^{D-1}$ 위의 균등분포다.

내가 보기에는 저자가 DSM처럼 입력에 노이즈를 넣는 대신 목적함수의 trace만 랜덤화한 선택이 핵심이다. DSM을 택하면 학습 대상이 noise-corrupted distribution의 스코어로 바뀌어 원래 $p_d$에 대한 Eq. 1과의 정확한 동치가 사라진다. SSM은 $p_d$를 바꾸지 않고 $E[vv^\top]$을 통해 오차를 관측하는 방식을 바꾸므로, 이후의 부분적분 등식과 식별가능성을 그대로 유지할 수 있다.

### 부분적분으로 데이터 스코어를 제거하기

Eq. 4를 전개하면 부록의 Eq. 14가 된다.

$$
\begin{aligned}
\mathcal{L}(\theta;p_v) =
\frac12E_{p_v}E_{p_d}
\big[
&(v^\top s_m(x;\theta))^2
+(v^\top s_d(x))^2\\
&-2(v^\top s_m(x;\theta))(v^\top s_d(x))
\big].
\end{aligned}
\tag{14}
$$

데이터 스코어의 제곱은 $\theta$와 무관하므로 $C$에 넣으면 Eq. 15처럼 정리된다.

$$
\mathcal{L}(\theta;p_v) =
E_{p_v}E_{p_d}
\left[
-(v^\top s_m)(v^\top s_d)
+\frac12(v^\top s_m)^2
\right]+C.
\tag{15}
$$

남은 문제는 교차항이다. $s_{d,i}(x)=\partial_{x_i}\log p_d(x)$이므로 $s_{d,i}(x)p_d(x)=\partial_{x_i}p_d(x)$이다. 이를 성분별로 풀면 Eq. 17의 적분이 나타난다.

$$
-E_{p_v}\sum_{i=1}^D
\int
(v^\top\nabla_x\log p_m)v_i
\frac{\partial p_d}{\partial x_i}\,dx.
\tag{17}
$$

여기서 $a(x)=v^\top s_m(x;\theta)$로 두면 각 좌표에 대한 부분적분은

$$
-\int a(x)v_i\frac{\partial p_d(x)}{\partial x_i}dx =
-\int
\left[
a(x)v_ip_d(x)
\right]_{-\infty}^{\infty}
dx_{\setminus i}
+
\int
p_d(x)v_i
\frac{\partial a(x)}{\partial x_i}dx
$$

이다. 또한

$$
\frac{\partial a(x)}{\partial x_i} =
\sum_{j=1}^D
v_j
\frac{\partial s_{m,j}(x;\theta)}{\partial x_i}
$$

이므로 모든 좌표를 합친 내부 항은

$$
\sum_{i,j}
v_iv_j
\frac{\partial s_{m,j}}{\partial x_i} =
v^\top\nabla_xs_m\,v
$$

가 된다. Jacobian의 인덱스 convention을 반대로 잡으면 중간 표현은 $v^\top(\nabla_xs_m)^\top v$가 되지만, 스칼라 이차형식은 전치해도 값이 같다.

부분적분에서 생기는 경계항은

$$
E_{p_v}\sum_{i=1}^D
\int
(v^\top s_m(x;\theta))v_i p_d(x)
\Big|_{-\infty}^{\infty}
dx_{\setminus i}
$$

형태다. Theorem 1의 무한대 경계 조건은 바로 이 항을 0으로 만들기 위해 필요하다. 경계항이 남으면 모델에 의존하는 추가 항이 생기므로 Eq. 4와 실제 학습 목적함수의 동치가 깨진다.

경계항을 소거한 뒤에는

$$
-E_{p_v}E_{p_d}
\left[
(v^\top s_m)(v^\top s_d)
\right] =
E_{p_v}E_{p_d}
\left[
v^\top\nabla_xs_m\,v
\right]
\tag{16}
$$

를 얻는다. 따라서 학습 가능한 목적함수는

$$
J(\theta;p_v)
\triangleq
E_{p_v}E_{p_d}
\left[
v^\top\nabla_xs_m(x;\theta)v
+
\frac12(v^\top s_m(x;\theta))^2
\right].
\tag{5}
$$

Theorem 1이 정식으로 보이는 등식은 다음과 같다.

$$
\begin{aligned}
\mathcal L(\theta;p_v)
&=
\frac12E_{p_v}E_{p_d}
\left[
(v^\top s_m-v^\top s_d)^2
\right]\\
&=
E_{p_v}E_{p_d}
\left[
v^\top\nabla_xs_m\,v
+\frac12(v^\top s_m)^2
\right]+C.
\end{aligned}
\tag{13}
$$

즉,

$$
\mathcal L(\theta;p_v)=J(\theta;p_v)+C.
\tag{6}
$$

이 유도에서 버린 것은 데이터 스코어 제곱처럼 $\theta$와 무관한 상수항이고, 0으로 소거한 것은 가정에 의해 무한대에서 사라지는 경계항이다. 근사로 바꾼 것이 아니라, 조건 아래 목적함수를 정확히 다시 쓴 것이다.

### Hessian trace를 Hessian-vector product로 바꾸기

Eq. 5의 첫 항은

$$
v^\top\nabla_xs_m(x;\theta)v
$$

이다. $J_xs_m=\nabla_xs_m$이라 하고 $a(x)=v^\top s_m(x;\theta)$로 두면 reverse-mode automatic differentiation은

$$
\nabla_xa(x) =
(J_xs_m)^\top v
$$

를 계산한다. 여기에 다시 $v$를 내적하면

$$
v^\top\nabla_xa(x) =
v^\top(J_xs_m)^\top v =
v^\top(J_xs_m)v
$$

를 얻는다. 마지막 등식은 스칼라 이차형식이 전치에 불변이기 때문이다. 밀도 모델에서는 $J_xs_m=\nabla_x^2\log\tilde p_m$이므로 이것이 정확히 Hessian-vector product의 이차형식이다. Hessian 행렬의 $D^2$개 원소를 만들 필요는 없다.

투영 하나에는 스코어를 구하는 미분과 투영된 스코어를 다시 미분하는 연산이 필요하므로 두 번의 gradient operation이 필요하다. $M$개 투영을 공유된 스코어에 적용하면 총 $M+1$회다. 표준 SM의 $D+1$회와 비교하면 $M\ll D$인 영역에서 계산상 이점이 생긴다.

유한표본 추정량은 Eq. 7이다.

$$
\hat J(\theta;x_1^N,v_{11}^{NM})
\triangleq
\frac1{NM}\sum_{i=1}^N\sum_{j=1}^M
\left[
v_{ij}^\top\nabla_xs_m(x_i;\theta)v_{ij}
+
\frac12(v_{ij}^\top s_m(x_i;\theta))^2
\right].
\tag{7}
$$

각 데이터마다 독립적인 랜덤 투영을 뽑아 평균하며, 이는 $J(\theta;p_v)$의 불편 추정량이다. $M$을 늘리면 투영으로 인한 변동은 줄지만 gradient operation 수가 함께 늘어난다.

## 분산 감소와 Hutchinson 관점

### 왜 SSM-VR의 두 번째 항에는 랜덤 방향이 없는가

$p_v$가 $\mathcal N(0,I)$ 또는 Rademacher이면 $E[vv^\top]=I$이므로

$$
\begin{aligned}
E_{p_v}[(v^\top s_m)^2]
&=
E_{p_v}[s_m^\top vv^\top s_m]\\
&=
s_m^\top E[vv^\top]s_m\\
&=
\|s_m\|_2^2.
\end{aligned}
$$

이 항의 기대값을 이미 정확히 알고 있으므로 매번 랜덤 투영으로 추정할 필요가 없다. Eq. 8의 SSM-VR은 이를 이용한다.

$$
\hat J_{vr}(\theta;x_1^N,v_{11}^{NM})
\triangleq
\frac1{NM}\sum_{i=1}^N\sum_{j=1}^M
\left[
v_{ij}^\top\nabla_xs_m(x_i;\theta)v_{ij}
+
\frac12\|s_m(x_i;\theta)\|_2^2
\right].
\tag{8}
$$

$\frac12\|s_m\|^2$는 $j$에 의존하지 않으므로 구현할 때는 투영 반복문 밖에서 데이터별 한 번만 계산해도 된다. 같은 식을 Hutchinson trace estimator 관점으로 쓰면

$$
\frac1N\sum_{i=1}^N
\left(
\frac1M\sum_{j=1}^M
v_{ij}^\top\nabla_xs_m\,v_{ij}
+
\frac12\|s_m(x_i;\theta)\|_2^2
\right)
$$

가 된다. 랜덤화가 필요한 것은 trace 항이고, 스코어 norm 항까지 랜덤화하면 목적함수의 기대값은 같더라도 불필요한 분산을 더한다.

이 치환은 모든 투영 분포에 그대로 적용되는 것이 아니다. 일반적인 $\Sigma_v=E[vv^\top]$에서는

$$
E[(v^\top s_m)^2] =
s_m^\top\Sigma_vs_m
$$

이다. 예를 들어 단위 초구의 균등분포는 $\Sigma_v=I/D$이므로 정확한 치환항은 $\|s_m\|^2/(2D)$이다. Eq. 8의 $\frac12\|s_m\|^2$를 그대로 사용하면 curvature 항과 score-norm 항의 상대 스케일이 달라져 원래 SSM 목적함수의 불편 추정량이 아니다. 초구 벡터에 $\sqrt D$를 곱해 covariance를 $I$로 만들거나, norm 항에 $1/D$를 반영해야 한다.

부록 D는 이를 control variate로 더 명시적으로 설명한다. 다음을 두면

$$
c(\theta;x,v)=\frac12(v^\top s_m(x;\theta))^2,
$$

그 기대값은 $\frac12\|s_m(x;\theta)\|_2^2$이다. 따라서

$$
\begin{aligned}
\hat J_{vr}
\triangleq \hat J
-\frac1N\sum_{i=1}^N\beta(x_i)
\left[
\frac1M\sum_{j=1}^M c(\theta;x_i,v_{ij})
-\frac12\|s_m(x_i;\theta)\|_2^2
\right]
\end{aligned}
$$

는 불편성을 유지한다. 대괄호 안의 기대값이 0이기 때문이다.

고정된 $x$에서 원래의 투영별 추정값을 $Y$라 두면 control variate를 적용한 분산은

$$
\operatorname{Var}_v
\left[
Y-\beta(c-E_v[c])
\right] =
\operatorname{Var}_v(Y)
-2\beta\operatorname{Cov}_v(Y,c)
+\beta^2\operatorname{Var}_v(c)
$$

이다. 이를 $\beta$로 미분하면 분산을 최소화하는 계수는

$$
\beta^*(x) =
\frac{\operatorname{Cov}_v(Y,c\mid x)}
{\operatorname{Var}_v(c\mid x)}
$$

가 된다. 논문은 이 값을 매번 추정하는 대신 $\beta(x)\equiv1$을 사용했고, 이 선택이 Eq. 8의 형태를 만든다.

> SSM과 SSM-VR은 기대 목적함수는 같지만 유한한 미니배치와 작은 $M$에서의 최적화 잡음이 다르다. 실험에서 variance reduction이 성능을 크게 개선했다는 결과는 이 차이가 실제 학습에서 중요하다는 근거다.
{: .prompt-tip }

내가 보기에는 Rademacher를 사용한 선택도 단순한 구현 취향 이상이다. 표준정규와 Rademacher는 모두 $E[vv^\top]=I$라서 같은 모집단 목적함수를 만들지만, Lemma 5의 점근 분산에서는 Gaussian에만 $\frac2M\sum_iV_{ii}$가 추가된다. 각 성분의 제곱이 항상 1인 Rademacher는 대각 성분의 무작위성을 없애므로, 동일한 covariance를 만족하는 두 후보 중 이론상 더 작은 추가 분산을 갖는다.

## 밀도가 아니라 스코어 함수 자체를 학습하기

암묵적 분포 $q(x)$에서는 비정규화 로그 밀도조차 주어지지 않을 수 있다. 이 경우 별도의 신경망 $h(x;\theta)$로 스코어를 직접 근사한다. 논문이 제시한 목적함수는

$$
E_{p_v}E_{p_d}
\left[
v^\top\nabla_xh(x;\theta)v
+
\frac12(v^\top h(x;\theta))^2
\right]
$$

이며, 부분적분 조건 아래

$$
\frac12E_{p_v}E_{p_d}
\left[
\left(
v^\top h(x;\theta) -
v^\top\nabla_x\log q(x)
\right)^2
\right]+C
$$

와 같다.

이 식은 $h$가 미지의 $\nabla_x\log q$를 직접 관측하지 않고도 그 투영을 맞추게 한다. 다만 일반적인 신경망 $h(x;\theta)$는 curl-free라고 보장되지 않으므로 어떤 스칼라 로그 밀도의 gradient가 아닐 수 있다. 밀도 모델에서 $s_m=\nabla_x\log\tilde p_m$로 정의한 경우와, 자유로운 벡터장 $h$를 score estimator로 학습하는 경우를 구현에서 구분해야 한다.

여기에는 분명한 설계 교환이 있다. $h=\nabla_x\phi_\theta$로 제한하면 integrability를 보장해 스칼라 에너지 $\phi_\theta$와 연결할 수 있지만, $h$를 얻기 위한 입력 미분과 $\nabla_xh$를 얻기 위한 추가 미분이 필요하다. 반대로 벡터장 $h$를 직접 출력하면 표현과 계산이 단순해지지만, 유한한 모델 용량과 최적화 오차 아래에서 학습된 장을 전역적인 로그 밀도로 적분할 수 있다는 보장은 잃는다. 이 논문의 VAE·WAE 적용은 정규화된 밀도 자체보다 엔트로피 그래디언트에 사용할 국소적인 score approximation이 필요하므로 후자를 택한 것으로 읽힌다.

비교 대상인 kernel score estimator는 Stein identity에 기초한다.

$$
E_{q(x)}
\left[
h(x)\nabla_x\log q(x)^\top+\nabla_xh(x)
\right]=0.
\tag{12}
$$

SSM은 커널 시스템을 구성하는 대신 신경망 벡터장과 랜덤 투영 목적함수를 사용한다. 실험에서는 커널 방법이 데이터 하나당 여러 sample을 사용하므로, SSM의 $M$을 동일한 수준까지 늘린 비교도 함께 제시한다.

## NCE와 만나는 지점

논문은 SSM을 Noise Contrastive Estimation(NCE)의 작은 이동량 극한과도 연결한다. 고정된 작은 벡터 $v$에 대해

$$
h(x;\theta)
\triangleq
\frac{p_m(x;\theta)}
{p_m(x;\theta)+p_m(x-v;\theta)},
\qquad
p_n(x)=p_d(x+v)
$$

로 두고 다음 이진 분류 목적함수를 생각한다.

$$
-E_{p_d}[\log h(x;\theta)]
-E_{p_n}[\log(1-h(x;\theta))].
\tag{10}
$$

$l(x)=\log p_m(x;\theta)$라 두면 이동된 로그 밀도 차이는

$$
\begin{aligned}
l(x+v)-l(x)
&=
s_m(x)^\top v
+\frac12v^\top\nabla_xs_m(x)v
+o(\|v\|_2^2),\\
l(x-v)-l(x)
&=
-s_m(x)^\top v
+\frac12v^\top\nabla_xs_m(x)v
+o(\|v\|_2^2).
\end{aligned}
$$

한편 logistic loss에 나타나는 softplus는 0 근방에서

$$
\log(1+e^a) =
\log2+\frac12a+\frac18a^2+o(a^2)
$$

로 전개된다. Eq. 10을 $p_d$에 대한 기대값으로 변수 치환한 뒤 나타나는 양·음 이동 항에 이 전개를 적용하면, $s_m^\top v$에 비례하는 1차항은 서로 소거된다. 선형 부분의 제곱에서는

$$
\frac18(s_m^\top v)^2
+
\frac18(-s_m^\top v)^2 =
\frac14(s_m^\top v)^2
$$

가 남고, 각 로그 밀도 차이의 2차항에서는 $v^\top\nabla_xs_mv$가 남는다. 계수를 정리한 Proposition 1의 결과는

$$
\begin{aligned}
J_{NCE}(\theta) =
2\log2
+\frac14E_{p_d}
\left[
v^\top\nabla^2\log p_m(x;\theta)v
+\frac12(\nabla\log p_m(x;\theta)^\top v)^2
\right]
+o(\|v\|_2^2).
\end{aligned}
$$

본문의 Eq. 11도 같은 내용을 다음처럼 표현한다.

$$
\frac14E_{p_d}
\left[
v^\top\nabla_xs_m(x;\theta)v
+\frac12(s_m(x;\theta)^\top v)^2
\right]
+2\log2+o(\|v\|_2^2).
\tag{11}
$$

대괄호 안이 한 방향에 대한 SSM 목적함수다. 여기서는 Eq. 13처럼 정확한 등식이 아니라 $\|v\|_2\to0$에서의 2차 근사다. 버린 것은 $o(\|v\|_2^2)$에 들어가는 고차항이며, $v$가 충분히 작지 않으면 SSM과 NCE 목적함수가 가깝다는 결론을 그대로 적용할 수 없다.

## 관련 리뷰와 연결

[NCSN](/posts/ncsn/)과 이 논문은 모두 관측할 수 없는 데이터 스코어를 신경망으로 학습한다는 출발점을 공유하지만, 없애려는 병목은 다르다. SSM은 원래 분포의 Fisher divergence를 유지한 채 Hessian trace를 랜덤 투영으로 추정한다. NCSN은 여러 노이즈 규모에서 DSM을 사용해 noise-perturbed distribution의 score를 학습하고, annealed Langevin dynamics로 표본을 생성한다. [Score SDE](/posts/score-sde/)는 이 노이즈 수준을 연속 시간으로 확장해 reverse-time SDE의 score를 학습한다. 따라서 SSM의 핵심은 “score objective의 공간 미분을 어떻게 싸게 계산할 것인가”이고, NCSN과 Score SDE의 핵심은 “노이즈에 따라 달라지는 score를 어떻게 학습해 생성 과정에 연결할 것인가”다. SSM 자체에는 시간 인덱스나 역방향 생성 dynamics가 없다.

## 구현 관점에서

### SSM과 SSM-VR 학습 단계

다음은 Algorithm 1과 Eq. 7·8을 배치 연산으로 옮긴 의사코드다. `grad(y, x)`는 스칼라 `y`의 $x$에 대한 그래디언트를 뜻하며, 최종 파라미터 미분까지 이어질 수 있도록 중간 미분 그래프를 보존해야 한다.

```python
def sliced_score_matching(log_unnormalized, x, M, variance_reduced):
    # x: (B, D)
    # log_unnormalized(x): (B,)
    logp = log_unnormalized(x)                 # (B,)
    score = grad(sum(logp), x)                 # (B, D)

    curvature_sum = zeros(B)                   # (B,)
    projected_score_sq_sum = zeros(B)          # (B,)

    for j in range(M):
        v = sample_projection(B, D)             # (B, D)
        projected_score = sum(v * score, dim=1) # (B,)

        # grad(sum_i v_i^T s_m(x_i), x):
        # 각 배치 원소에 대한 Jacobian-vector product
        jtv = grad(sum(projected_score), x)     # (B, D)
        curvature = sum(v * jtv, dim=1)         # (B,)

        curvature_sum += curvature
        projected_score_sq_sum += projected_score ** 2

    curvature_term = curvature_sum / M          # (B,)

    if variance_reduced:
        score_term = 0.5 * sum(score ** 2, dim=1)       # (B,)
    else:
        score_term = 0.5 * projected_score_sq_sum / M   # (B,)

    loss = mean(curvature_term + score_term)     # scalar
    return loss
```

이 함수가 만드는 것은 학습 loss다. 그 다음 $\theta$로 미분해 optimizer를 갱신한다. 이 논문에는 diffusion model처럼 시간 인덱스를 역순으로 도는 별도의 샘플링 루프가 없다. 밀도 모델은 학습된 목적함수와 AIS 평가로 다루고, VAE·WAE의 생성 표본은 학습된 decoder를 통해 얻는다. 따라서 학습 루프와 생성 루프가 대칭이어야 한다고 가정하면 안 된다.

구현에서 특히 조심할 지점은 다음과 같다.

- `grad(v^T score, x)`만 계산하고 끝내면 결과는 $(B,D)$ 벡터다. 여기에 다시 $v$를 내적해야 $v^\top\nabla_xs_m v$가 된다.
- 배치 전체를 합쳐 미분하더라도 데이터별 $v_{ij}$를 유지해야 한다. 모든 데이터에 우연히 같은 투영을 공유하는 구현은 Eq. 7의 $v_{ij}$ 표기와 다르다.
- $M$ 평균은 curvature 항과 기본 SSM의 projected-score 항에 적용한다. SSM-VR의 $\frac12\|s_m\|^2$는 $j$와 무관하므로 반복해서 합한 뒤 나누는 대신 한 번만 계산하는 편이 명확하다.
- 입력 $x$에 대한 두 번째 미분뿐 아니라 그 결과를 다시 $\theta$로 미분해야 한다. 중간 미분을 상수처럼 끊으면 학습 그래디언트에서 curvature 항이 사라진다.
- score estimator $h$를 쓰는 경우에는 $h:(B,D)\to(B,D)$를 직접 출력하지만, 밀도 모델에서는 먼저 스칼라 $\log\tilde p_m:(B,D)\to(B)$를 만들고 입력 gradient로 score를 얻는다.
- Rademacher를 사용할 때 각 성분은 $\pm1$이다. 초구 균등분포와는 벡터 norm의 스케일이 다르므로 서로 바꾸면서 목적함수 스케일까지 동일하다고 가정할 수 없다.

### 표준 SM과 연산 구조 비교

Algorithm 2는 같은 스코어를 만든 뒤 Jacobian의 대각 원소를 좌표별로 구한다.

```python
def standard_score_matching(log_unnormalized, x):
    # x: (B, D)
    logp = log_unnormalized(x)             # (B,)
    score = grad(sum(logp), x)             # (B, D)

    loss_per_example = 0.5 * sum(score ** 2, dim=1)  # (B,)

    for d in range(D):
        component = score[:, d]                    # (B,)
        component_grad = grad(sum(component), x)   # (B, D)
        loss_per_example += component_grad[:, d]   # (B,)

    return mean(loss_per_example)
```

표준 SM은 $D+1$회의 gradient operation, SSM은 $M+1$회를 사용한다. SSM의 효율은 모델 파라미터 수가 아니라 입력 차원 $D$와 투영 수 $M$의 관계에서 나온다. $M$이 $D$에 가까워지면 계산 이점이 사라진다는 저자의 한계도 이 구조에서 바로 확인할 수 있다.

### DKEF의 해석적 내부 최적화

DKEF 실험의 비정규화 로그 밀도는

$$
\log\tilde p_f(x)=f(x)+\log q_0(x),
\qquad
f(x)=\sum_{l=1}^L\alpha_l k(x,z_l)
$$

이고, 커널은 세 Gaussian kernel의 혼합이다.

$$
k_w(x,y) =
\sum_{r=1}^R
\rho_r
\exp\left(
-\frac{1}{2\sigma_r^2}
\|\phi_{w_r}(x)-\phi_{w_r}(y)\|^2
\right),
\qquad R=3,\quad\rho_r\ge0.
$$

Proposition 2는 다른 파라미터를 고정하면 SSM 목적함수가 $\alpha$에 대한 이차식이 됨을 이용한다.

$$
\hat J(\theta,\lambda_\alpha;x_1^N,v_{11}^{NM}) =
\frac12\alpha^\top(G+\lambda_\alpha I)\alpha+\alpha^\top b.
$$

여기서

$$
G_{l,l'} =
\frac1{NM}\sum_{i=1}^N\sum_{j=1}^M
\left(v_{ij}^\top\nabla_xk(x_i,z_l)\right)
\left(v_{ij}^\top\nabla_xk(x_i,z_{l'})\right)
$$

이고,

$$
\begin{aligned}
b_l =
\frac1{NM}\sum_{i=1}^N\sum_{j=1}^M
\big[
&v_{ij}^\top\nabla_x^2k(x_i,z_l)v_{ij}\\
&+(\nabla_xk(x_i,z_l)^\top v_{ij})
(v_{ij}^\top\nabla_x\log q_0(x_i))
\big].
\end{aligned}
$$

목적함수를 $\alpha$로 미분하면

$$
\nabla_\alpha\hat J =
(G+\lambda_\alpha I)\alpha+b
$$

이다. $G$는 투영된 kernel gradient들의 Gram matrix이므로 양의 준정부호이고, $\lambda_\alpha>0$이면

$$
G+\lambda_\alpha I\succ0.
$$

따라서 stationary point는 유일한 전역 최소점이며,

$$
(G+\lambda_\alpha I)\alpha+b=0
$$

에서

$$
\alpha=-(G+\lambda_\alpha I)^{-1}b
$$

를 얻는다. 구현에서는 역행렬을 명시적으로 만드는 대신 같은 선형시스템을 푸는 편이 수치적으로 적절하다.

이 결과가 DKEF 실험의 2단계 최적화를 뒷받침한다. 구현에서는 미니배치 200개를 $\alpha$ 계산용 100개와 loss 계산용 100개로 분리한다. 내가 보기에는 이 내부 해석해는 SSM 자체의 기여라기보다 DKEF라는 선형-in-parameter 구조를 활용한 최적화 장치다. inducing point와 feature network까지 모두 확률적 경사하강으로 뒤섞는 대신, convex한 $\alpha$ 블록을 정확히 제거해 나머지 비선형 파라미터의 최적화 문제를 좁힌다.

## 왜 이 추정량을 믿을 수 있는가

### 식별가능성: 투영만 보아도 충분한 조건

Lemma 1은

$$
\mathcal L(\theta;p_v)=0
\iff
\theta=\theta^*
$$

를 주장한다. 모든 $x$에서 밀도가 양수이고 모델이 식별 가능하며 $E[vv^\top]\succ0$이라는 조건을 사용한다. 투영 오차의 기대값이 0이면 양의 정부호 이차형식 때문에 $s_m=s_d$여야 한다. 이후 식별가능성을 적용해 참 파라미터 $\theta^*$를 얻는다.

양의 정부호 조건은 “랜덤 방향을 충분히 다양하게 뽑는다”는 직관을 엄밀하게 만든다. 특정 부분공간만 투영한다면 그 직교 여공간의 스코어 오차는 검출되지 않으므로 Lemma 1이 성립하지 않는다. 모든 점에서의 positive density 조건도 로그 밀도와 스코어를 비교하는 논증을 지지한다.

양의 정부호만으로 유한표본 최적화가 잘 conditioned된다는 뜻은 아니다. $\lambda_{\min}(\Sigma_v)$가 매우 작으면 그 고유벡터 방향의 오차는 목적함수에 약하게 반영된다. 식별가능성은 유지되더라도 좁은 방향의 학습 신호가 작아질 수 있으므로, $E[vv^\top]=I$인 isotropic projection은 단순한 표기 편의가 아니라 방향별 감도를 균등하게 만드는 선택이다.

### 목적함수의 균등수렴

일관성을 보이려면 한 파라미터에서의 표본 평균 수렴만으로는 부족하다. 경험 목적함수의 최소점이 참 목적함수의 최소점으로 가야 하므로 파라미터 공간 전체에서 오차가 함께 작아져야 한다.

Assumption 7은 $\nabla_xs_m$과 $s_ms_m^\top$이 $\theta$에 대해 Lipschitz이고, 그 계수 $L_1(x),L_2(x)$의 2차 적률이 유한하다고 둔다.

$$
\|\nabla_xs_m(x;\theta_1)-\nabla_xs_m(x;\theta_2)\|_F
\le
L_1(x)\|\theta_1-\theta_2\|_2,
$$

$$
\|s_m(x;\theta_1)s_m(x;\theta_1)^\top
-s_m(x;\theta_2)s_m(x;\theta_2)^\top\|_F
\le
L_2(x)\|\theta_1-\theta_2\|_2.
$$

Assumption 8은

$$
E_{p_v}[\|vv^\top\|_F^2]<\infty
$$

를 요구한다. Lemma 2는 이 조건들과 Cauchy–Schwarz, Jensen 부등식을 사용해 표본별 목적함수

$$
f(\theta;x,v) =
v^\top\nabla_xs_m(x;\theta)v
+\frac12(v^\top s_m(x;\theta))^2
$$

에 대해

$$
|f(\theta_1;x,v)-f(\theta_2;x,v)|
\le
L(x,v)\|\theta_1-\theta_2\|_2
$$

를 얻는다. 제시된 Lipschitz 상수는

$$
L(x,v) =
\sqrt{
\sum_{i,j}v_iv_j
\left(
2L_1^2(x)+\frac12L_2^2(x)
\right)
}.
$$

이 연속성은 경험 목적함수의 요동을 파라미터 거리로 제어하기 위한 장치다.

Lemma 3은 compact한 파라미터 공간 $\Theta$에서 다음 균등수렴 경계를 보인다.

$$
E_{p_v,p_d}
\sup_{\theta\in\Theta}
|\hat J(\theta)-J(\theta;p_v)|
\le
O\left(
\operatorname{diam}(\Theta)\sqrt{\frac{D}{N}}
\right).
\tag{18}
$$

여기서 이 절의 $D$는 데이터 차원이 아니라 파라미터 공간 $\Theta$의 차원이다. 두 기호를 구현 비용의 입력 차원과 혼동하지 않아야 한다.

증명은 먼저 symmetrization trick으로 경험 과정의 오차를 Rademacher 확률변수 $\epsilon_i$를 포함한 다음 상한으로 바꾼다.

$$
2E\sup_{\theta\in\Theta}
\frac1{NM}\sum_{i=1}^N\sum_{j=1}^M
\epsilon_i f(\theta;x_i,v_{ij}).
\tag{19}
$$

이 과정을 sub-Gaussian 과정으로 보고, Lemma 2의 Lipschitz 상수로 metric을 정의한다.

$$
d(\theta_1,\theta_2) =
\frac1{\sqrt N}
\sqrt{
\frac1{NM}\sum_{i=1}^N\sum_{j=1}^M
L^2(x_i,v_{ij})
}
\|\theta_1-\theta_2\|_2.
$$

compactness는 이 metric에서 유한한 covering number를 갖도록 한다. 그 상한은

$$
N(\Theta,d,\epsilon)
\le
\left(
1+
\frac{
\sqrt{\frac1{NM}\sum_{i,j}L^2(x_i,v_{ij})}
\operatorname{diam}(\Theta)
}{
\sqrt N\,\epsilon
}
\right)^D
$$

이다. 이를 Dudley entropy integral에 넣으면 Eq. 20을 거쳐

$$
\le
2
\sqrt{
\frac1{NM}\sum_{i=1}^N\sum_{j=1}^M
L^2(x_i,v_{ij})
}
\sqrt{\frac DN}
\operatorname{diam}(\Theta)
\tag{21}
$$

를 얻는다. 이 흐름에서 Jensen과 Cauchy–Schwarz는 랜덤 Lipschitz 계수의 모멘트를 상계하는 데 쓰이고, symmetrization과 covering-number 적분은 한 파라미터의 수렴을 $\Theta$ 전체의 수렴으로 확장한다.

### 일관성

Theorem 2는 Assumption 1부터 8까지의 조건 아래 $\hat\theta_{N,M}$이 $N$ 증가에 따라 $\theta^*$로 확률수렴한다고 주장한다. 핵심 부등식은 Eq. 22다.

$$
\begin{aligned}
J(\hat\theta_{N,M};p_v)-J(\theta^*;p_v)
\le{}&
\sup_{\theta\in\Theta}|\hat J(\theta)-J(\theta;p_v)|\\
&+|\hat J(\theta^*)-J(\theta^*;p_v)|\\
\le{}&
2\sup_{\theta\in\Theta}|\hat J(\theta)-J(\theta;p_v)|.
\end{aligned}
\tag{22}
$$

이 부등식은 다음 분해에서 나온다.

$$
\begin{aligned}
J(\hat\theta)-J(\theta^*)
={}&
[J(\hat\theta)-\hat J(\hat\theta)]\\
&+
[\hat J(\hat\theta)-\hat J(\theta^*)]\\
&+
[\hat J(\theta^*)-J(\theta^*)].
\end{aligned}
$$

$\hat\theta$가 경험 목적함수의 최소점이므로 가운데 항은 0 이하이고, 나머지 두 항을 균등 오차로 상계하면 Eq. 22를 얻는다. Lemma 3에 의해 우변이 0으로 수렴하고, 마지막에는 Lemma 1의 식별가능성을 사용해 목적함수 값의 수렴을 파라미터의 수렴으로 연결한다.

논문은 이 consistency가 기존 Hyvärinen 결과에서 말하는 “local consistency”보다 강한 구분임을 밝힌다. 이는 Assumption 1부터 8까지가 충족되는 이론적 설정에서의 결과다.

### 점근적 정규성과 $M$의 역할

점근적 정규성을 위해서는 목적함수의 Hessian도 파라미터 근방에서 안정적이어야 한다. Assumption 9는 로그 밀도의 좌표별 2차 미분과 스코어 곱 항의 $\theta$-Hessian 차이를 각각 $M_{ij}(x)$와 $N_{ij}(x)$로 Lipschitz 제어하고, 이 함수들의 2차 적률이 유한하다고 요구한다.

Lemma 4는 이를 이용해

$$
\|\nabla_\theta^2f(\theta_1;x,v_1^M)
-\nabla_\theta^2f(\theta_2;x,v_1^M)\|_F
\le
L(x,v_1^M)\|\theta_1-\theta_2\|_2
$$

를 얻는다. 제시된 상수의 제곱은

$$
L^2(x,v_1^M) =
\frac1{M^2}
\sum_{i,j,p,q}
v_{p,i}v_{p,j}v_{q,i}v_{q,j}
\left(
\frac12M_{ij}^2(x)+\frac12N_{ij}^2(x)
\right)
$$

이며 유한한 2차 적률을 갖는다. 증명은 Hessian 차이의 Frobenius norm을 성분별로 전개하고 Cauchy–Schwarz와 Jensen으로 상계한다.

공분산을 쓰기 위해 부록은 다음 기호를 정의한다.

$$
\Sigma_{ij}\triangleq(E_{p_v}[vv^\top])_{ij},
\qquad
S_{ijpq}\triangleq E_{p_v}[v_iv_jv_pv_q],
$$

$$
\begin{aligned}
V_{ijpq}\triangleq\frac12E_{p_d}
\Big[
&\left(
\nabla_\theta\partial_i\partial_jl_m
+\frac12\nabla_\theta(\partial_il_m\partial_jl_m)
\right)\\
&\left(
\nabla_\theta\partial_p\partial_ql_m
+\frac12\nabla_\theta(\partial_pl_m\partial_ql_m)
\right)^\top
\Big],
\end{aligned}
$$

$$
V_{ij}\triangleq V_{iijj},
\qquad
W_{ij}\triangleq V_{ijij}.
$$

참값에서는

$$
E_{p_d,p_v}[\nabla_\theta f(\theta^*;x,v_1^M)] =
\nabla_\theta J(\theta^*;p_v)=0
$$

이다. Eq. 23의 $1/M$ 구조는 투영 평균의 4차 모멘트를 직접 전개하면 보인다. 다음을 두자.

$$
\bar Z_{ij} =
\frac1M\sum_{r=1}^M v_{r,i}v_{r,j}.
$$

그러면

$$
\begin{aligned}
E[\bar Z_{ij}\bar Z_{pq}]
&=
\frac1{M^2}
\sum_{r=1}^M\sum_{s=1}^M
E[v_{r,i}v_{r,j}v_{s,p}v_{s,q}]\\
&=
\frac{M(M-1)}{M^2}\Sigma_{ij}\Sigma_{pq}
+
\frac{M}{M^2}S_{ijpq}\\
&=
\left(1-\frac1M\right)\Sigma_{ij}\Sigma_{pq}
+
\frac1M S_{ijpq}.
\end{aligned}
$$

$r\ne s$인 항은 독립성 때문에 2차 모멘트의 곱으로 분해되고, $r=s$인 항만 한 투영의 4차 모멘트를 남긴다. 이를 파라미터 gradient의 좌표별 공분산과 결합하면 Lemma 5의 식을 얻는다.

$$
\operatorname{Var}_{p_d,p_v}
[\nabla_\theta f(\theta^*;x,v_1^M)] =
\sum_{i,j,p,q}
\left[
\left(1-\frac1M\right)\Sigma_{ij}\Sigma_{pq}
+\frac1M S_{ijpq}
\right]V_{ijpq}.
\tag{23}
$$

표준정규 투영에서는 이 항이

$$
\sum_{i,j}V_{ij}
+\frac2M\sum_iV_{ii}
+\frac2M\sum_{i\ne j}W_{ij}
$$

로, Rademacher 투영에서는

$$
\sum_{i,j}V_{ij}
+\frac2M\sum_{i\ne j}W_{ij}
$$

로 정리된다. Rademacher에서는 대각 방향의 추가 분산 항이 빠진다는 차이가 있다.

Theorem 3의 출발점은 경험 목적함수의 1차 조건을 $\theta^*$ 주위에서 Taylor 전개한 Eq. 24다.

$$
\begin{aligned}
0={}&P_N\nabla_\theta f(\theta^*;x,v_1^M)\\
&+
\left(
P_N\nabla_\theta^2f(\theta^*;x,v_1^M)
+
E_{\hat\theta_{N,M},x,v_1^M}
\right)
(\hat\theta_{N,M}-\theta^*).
\end{aligned}
\tag{24}
$$

이를 파라미터 오차에 대해 풀고 $\sqrt N$을 곱하면

$$
\begin{aligned}
\sqrt N(\hat\theta_{N,M}-\theta^*) =
-&
\left(
P_N\nabla_\theta^2f(\theta^*;x,v_1^M)
+
E_{\hat\theta_{N,M},x,v_1^M}
\right)^{-1}\\
&\times
\sqrt N P_N\nabla_\theta f(\theta^*;x,v_1^M).
\end{aligned}
$$

Lemma 4와 일관성은 Taylor remainder를 $o_p(1)$로 만들고, law of large numbers는 첫 행렬을 모집단 Hessian으로 보낸다. gradient 평균에는 central limit theorem을 적용하고 Slutsky 정리를 사용하면

$$
\sqrt N(\hat\theta_{N,M}-\theta^*) = -
[\nabla_\theta^2J(\theta^*;p_v)+o_p(1)]^{-1}
\sqrt N P_N\nabla_\theta f(\theta^*;x,v_1^M)
$$

에서 점근적 정규성이 나온다.

Rademacher projection에 대한 구체적인 점근 공분산은 Eq. 9다.

$$
\Sigma
\triangleq
[\nabla_\theta^2J(\theta^*)]^{-1}
\left(
\sum_{1\le i,j\le D}V_{ij}
+
\frac2M\sum_{1\le i\ne j\le D}W_{ij}
\right)
[\nabla_\theta^2J(\theta^*)]^{-1}.
\tag{9}
$$

여기서 $M$이 커질수록 추가 항이 줄어든다. 그러나 저자가 밝힌 대로 Rademacher SSM의 점근 분산은 표준 SM보다 항상 크고, $M$을 늘릴수록 그 차이가 줄어든다. 계산량을 낮추는 대가로 통계적 효율 일부를 지불하는 구조다.

Corollary 1은 같은 논법을 표준 SM에 적용한다.

$$
\sqrt N(\hat\theta_N-\theta^*)
\to
\mathcal N
\left(
0,
[\nabla_\theta^2J(\theta^*)]^{-1}
\left(\sum_{i,j}V_{ij}\right)
[\nabla_\theta^2J(\theta^*)]^{-1}
\right).
$$

따라서 SSM의 이론은 새로운 추정량만 설명하는 데 그치지 않고, 표준 SM의 consistency와 asymptotic normality도 같은 틀에서 정리한다.

### 이론이 실제 구현에서 깨지는 지점

내가 보기에는 이론과 신경망 구현 사이에서 가장 조용히 깔린 가정은 경계 조건, smoothness, compactness다.

첫째, 부분적분 등식은 경계항이 0일 때만 성립한다. 무한 지지집합에서는 $p_d(x)s_m(x;\theta)$가 충분히 빠르게 감소해야 하고, bounded support라면 무한대 대신 실제 경계에서 flux가 사라져야 한다. 밀도가 경계에서 0이 아니거나 모델 스코어가 발산하면 Eq. 16에 경계항이 추가되어 학습 목적함수는 Fisher divergence와 더 이상 상수 차이가 아니다.

둘째, Assumption 7과 9는 입력 및 파라미터 미분의 Lipschitz 성질을 요구한다. softplus처럼 매끄러운 활성화는 이 방향과 맞지만, ReLU 기반 score estimator는 kink에서 고전적 Hessian이 정의되지 않는다. 데이터 분포 아래 거의 모든 점에서 미분 가능하다는 사실만으로 부록의 정리를 그대로 얻으려면 weak derivative나 almost-everywhere argument가 추가로 필요하다.

셋째, Lemma 3은 compact한 $\Theta$를 사용하지만 일반적인 신경망 학습은 가중치를 명시적인 compact 집합에 제한하지 않는다. 정규화나 bounded parameterization 없이 Adam으로 학습했다는 사실만으로 이 가정이 자동 충족되지는 않는다. 따라서 정리는 추정량의 통계적 타당성을 설명하지만, 실험의 모든 신경망 최적화 trajectory에 그대로 적용되는 무조건적 보장은 아니다.

## 밀도 추정 실험

### DKEF 설정

DKEF는 Parkinsons, RedWine, WhiteWine의 UCI 데이터셋 세 개에서 평가했다. RedWine과 WhiteWine에는 각 차원별로 $[-d,d]$의 균등 노이즈를 더해 dequantization을 수행했다. 여기서 $d$는 해당 차원에서 인접한 두 값 사이 거리의 중앙값이다. 전체 데이터에는 PCA whitening과 표준편차 0.05의 전처리 노이즈를 적용했다.

데이터의 10%를 test로 분리하고, 나머지에서 다시 10%를 validation으로 사용했다. 비교 대상은 SM, DSM, Approximate Backpropagation, Curvature Propagation이다. 평가 지표는 test SM loss와 AIS로 계산한 log-likelihood다.

모델 및 학습 설정은 다음과 같다.

- Gaussian kernel 혼합 수는 $R=3$이고 length scale $\sigma_r$은 1.0, 3.3, 10.0으로 초기화했다.
- feature network는 층당 30 unit인 은닉층 3개를 사용하고 skip connection과 softplus를 적용했다.
- 가중치는 $\mathcal N(0,1/30)$으로 초기화했다.
- $L=200$개 inducing point $z_l$은 훈련 데이터로 초기화하되 학습 가능한 파라미터로 두었다.
- $L_2$ 정규화 계수 $\lambda_\alpha$는 0.01로 초기화하고 학습했다.
- Adam 학습률은 $10^{-2}$, 배치는 200, random seed는 15개이며 validation loss patience는 200이다.
- 배치 200개는 $\alpha$ 계산용 100개와 loss 계산용 100개로 나눴다.
- SSM은 다변량 Rademacher projection을 사용하고, 별도 표시가 없으면 $M=1$이다.
- CP는 noise sample 하나를 사용했다.
- AIS proposal은 $\mathcal N(0,2I)$이고 1,000,000 samples를 사용했다.

DSM의 $\sigma$는 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.20, 0.24, 0.28, 0.32, 0.40, 0.48, 0.56, 0.64, 1.28을 두 개 seed로 탐색했다. 이 넓은 탐색 범위는 DSM이 노이즈 분산 선택에 민감하다는 비교 배경과 연결된다.

Figure 1의 test SM loss에서는 SSM-VR이 기본 SM과 비슷한 성능을 보였고, variance reduction이 기본 SSM을 크게 개선했다. SSM은 다른 효율적 방법보다 우수했으며, DSM이 SSM과 비슷한 결과를 보인 데이터셋은 RedWine뿐이었다. Approximate Backpropagation의 loss는 $10^9$보다 커 Figure 1에서 제외됐다.

Figure 3은 같은 모델들의 log-likelihood를 비교한다. Approximate Backpropagation의 log-likelihood가 $-10^6$보다 작아 그래프에서 제외됐다는 점은 단순한 시각적 누락이 아니라 결과 범위를 해석할 때 포함해야 할 정보다.

Figure 2는 다변량 표준정규분포에서 미니배치 100개의 평균 실행 시간과 메모리 확장성을 비교한다. 표준 SM은 12GB GPU에서 차원이 400을 넘으면 OOM이 발생했다. SSM의 목적은 단지 목적함수를 조금 빠르게 근사하는 것이 아니라, 입력 차원에 비례해 늘어나는 trace 계산 때문에 실행 자체가 어려워지는 구간을 피하는 데 있다.

### NICE 설정과 결과

NICE 실험은 MNIST를 $[-1/512,1/512]$ 범위로 dequantize한 뒤 $[-0.001,0.001]$로 clipping하고 logit transform을 적용했다. 모델은 coupling layer 4개를 사용하고, 각 coupling layer에는 은닉층 5개가 있어 총 20개 hidden layer가 된다. 각 층은 1000 units이며 final scale layer와 softplus를 사용했다.

학습은 Adam $10^{-3}$, 100 epochs, 배치 128로 수행했다. train-validation 비율은 90/10이고, 100 iteration마다 exact SM loss를 평가해 가장 좋은 checkpoint를 선택했다. 모델 하나의 학습 시간은 약 2시간이었다. 표준 SM은 한 epoch에 7시간이 걸려 비교에서 제외됐다.

DSM의 $\sigma$는 0.01, 0.05, 0.10, 0.20, 0.28, 0.50, 1.00, 1.50과 heuristic 값 1.74를 탐색했다.

| Method | Test SM Loss | Test LL |
|---|---:|---:|
| MLE | -579 | -791 |
| SSM-VR | -8054 | -3355 |
| SSM | -2428 | -2039 |
| DSM ($\sigma=0.10$) | -3035 | -4363 |
| DSM ($\sigma=1.74$) | -97 | -8082 |
| CP | -1694 | -1517 |
| Approx BP | -48 | -2288 |

Table 1에서 읽어야 할 점은 test SM loss와 test log-likelihood의 순위가 일치하지 않는다는 것이다. SSM-VR은 SM loss가 -8054로 가장 낮지만 LL은 -3355이며, MLE의 LL은 -791이다. DSM도 $\sigma=0.10$과 1.74 사이에서 SM loss와 LL이 크게 변한다. 따라서 특정 score matching loss를 더 낮춘 결과를 곧바로 더 높은 likelihood와 동일시할 수 없다.

내 판단으로 이 불일치는 SSM-VR의 실패라기보다 목적함수와 평가 지표의 차이를 드러낸다. score matching은 정규화 상수를 보지 않고 입력 미분의 국소적 일치를 측정하는 반면, log-likelihood는 정규화된 전역 확률질량을 평가한다. Eq. 1이 0이면 두 밀도를 식별할 수 있다는 이론과, 제한된 모델·유한표본·불완전한 최적화에서 두 지표의 순위가 같아야 한다는 주장은 서로 다르다.

## 암묵적 VAE와 WAE에 적용하기

### 두 목적함수에서 score estimation이 들어갈 자리

VAE의 ELBO는 다음과 같다.

$$
E_{p_d}
\left[
E_{q_\phi(z|x)}
\log p_\theta(x|z)p(z) -
E_{q_\phi(z|x)}
\log q_\phi(z|x)
\right].
$$

암묵적 encoder에서는 $q_\phi(z|x)$에서 표본을 만들 수 있어도 로그 밀도를 계산하기 어려울 수 있다. SSM으로 학습한 score estimator는 재매개변수화된 엔트로피 그래디언트에 필요한 스코어를 제공한다. 학습 초반에는 score network가 정확해질 시간이 필요해 SSM 성능이 상대적으로 낮았다는 관찰도 보고됐다. 주 모델과 score estimator가 동시에 학습되는 구조에서는 초기 score 오차가 변분 목적함수 최적화에 바로 영향을 준다는 뜻이다.

WAE 목적함수는

$$
E_{p_d}
\left[
E_{q_\phi(z|x)}
\left[
c(x,p_\theta(x|z))-\lambda\log p(z)
\right]
\right]
-\lambda H(q_\phi(z))
$$

이다. 여기서도 암묵적 aggregated posterior의 엔트로피 $H(q_\phi(z))$를 최적화하는 데 score estimation을 사용할 수 있다. WAE 실험에서는 implicit decoder 설정을 사용했다.

MNIST와 CelebA를 사용했고, CelebA는 $140\times140$ crop 후 $64\times64$로 resize했다. 비교 방법은 ELBO, SSM, Stein, Spectral이다. RMSProp 학습률은 MNIST 0.001, CelebA 0.0001이며, 두 데이터 모두 100,000 iterations와 배치 128을 사용했다. kernel estimator는 데이터 하나당 MNIST에서 100 samples, CelebA에서 20 samples를 사용했다.

MNIST likelihood는 1,000 intermediate distributions와 은닉층 3개의 shallow fully connected network를 사용한 AIS로 빠르게 평가했다.

### MNIST NLL

| Method | VAE, Latent 8 | VAE, Latent 32 | WAE, Latent 8 | WAE, Latent 32 |
|---|---:|---:|---:|---:|
| ELBO | 96.87 | 89.06 | N/A | N/A |
| SSM | 95.50 | 89.25 (88.29†) | 98.24 | 90.37 |
| Stein | 96.71 | 91.84 | 99.05 | 91.70 |
| Spectral | 96.60 | 94.67 | 98.81 | 92.55 |

Table 2에서 SSM은 VAE latent dimension 8에서 95.50, latent dimension 32에서 89.25를 기록했다. $M=100$으로 kernel method와 계산 비용을 맞춘 결과는 latent dimension 32에서 88.29다. 기본 SSM이 $M=1$을 사용한다는 설정과 함께 보면, 더 많은 투영을 쓰면 품질이 개선될 수 있지만 그 비교에는 kernel method와 같은 수준의 sample 비용이 들어간다.

WAE에서는 SSM이 latent dimension 8과 32에서 각각 98.24와 90.37이고, Stein은 99.05와 91.70, Spectral은 98.81과 92.55다. 이 범위에서는 SSM의 NLL이 두 kernel estimator보다 낮다.

### CelebA FID의 학습 진행

| Method | 10k | 40k | 70k | 100k |
|---|---:|---:|---:|---:|
| VAE ELBO | 96.20 | 73.70 | 69.42 | 66.32 |
| VAE SSM | 108.52 | 70.28 | 66.52 | 62.50 |
| VAE Stein | 126.60 | 118.87 | 120.51 | 126.76 |
| VAE Spectral | 131.90 | 125.04 | 128.36 | 133.93 |
| WAE SSM | 84.11 | 61.09 | 56.23 | 54.33 |
| WAE Stein | 82.93 | 63.46 | 58.53 | 57.61 |
| WAE Spectral | 82.30 | 62.47 | 58.03 | 55.96 |

VAE SSM은 10k에서 108.52로 ELBO의 96.20보다 높지만, 40k부터는 70.28 대 73.70으로 역전되고 100k에는 62.50 대 66.32가 된다. 이는 score network가 학습 초기에 정확해질 시간이 필요하다는 관찰과 일치한다.

VAE Stein과 Spectral은 40k 이후에도 FID가 각각 118.87 이상, 125.04 이상이며 100k에는 126.76과 133.93이다. WAE에서는 세 방법의 격차가 더 작다. 10k에는 Stein 82.93과 Spectral 82.30이 SSM 84.11보다 낮지만, 40k에는 SSM이 61.09로 가장 낮아지고 100k에는 SSM 54.33, Spectral 55.96, Stein 57.61 순이다. 한 시점의 결과만 보면 초기와 후기의 결론이 달라지므로 학습 iteration 전체를 함께 보아야 한다.

Table 4부터 Table 7은 정량표가 아니라 생성 표본 비교다. 추출본에서 이미지 셀은 판독할 수 없으므로 ELBO, SSM, Stein, Spectral 사이의 시각적 우열은 판단하지 않는다. 구성은 다음과 같다.

- Table 4: MNIST의 VAE 표본을 latent dimension 8과 32에서 ELBO, SSM, Stein, Spectral별로 비교한다.
- Table 5: CelebA의 VAE 표본을 ELBO, SSM, Stein, Spectral의 2×2 배치로 비교한다.
- Table 6: MNIST의 WAE 표본을 latent dimension 8과 32에서 SSM, Stein, Spectral별로 비교한다.
- Table 7: CelebA의 WAE 표본을 SSM, Stein, Spectral별로 비교한다.

## 재현에 필요한 네트워크 구조

### MNIST

MNIST에서는 $D_\epsilon=D_z$이고 $D_z$는 8 또는 32다.

| 구성 요소 | 구조 | 적용 |
|---|---|---|
| Encoder | Linear(784, 256), Tanh → Linear(256, 256), Tanh → Linear(256, $D_z$) | ELBO VAE, WAE |
| Implicit Encoder | Linear(784+$D_\epsilon$, 256), Tanh → Linear(256, 256), Tanh → Linear(256, $D_z$) | Implicit VAE |
| Decoder | Linear($D_z$, 256), Tanh → Linear(256, 256), Tanh → Linear(256, 784), Sigmoid | 전체 |
| Implicit VAE Score Estimator | Linear(784+$D_z$, 256), Tanh → Linear(256, 256), Tanh → Linear(256, $D_z$) | Implicit VAE |
| WAE Score Estimator | Linear($D_z$, 256), Tanh → Linear(256, 256), Tanh → Linear(256, $D_z$) | WAE |

Implicit VAE의 score estimator는 관측 $x$와 latent $z$를 함께 입력받는 반면, WAE score estimator는 $z$만 입력받는다. 두 모델에서 같은 “score estimator”라는 이름을 쓰더라도 입력 shape가 다르다.

### CelebA

CelebA에서도 $D_\epsilon=D_z$이며 $D_z$는 8 또는 32다. 표에서 $m$은 feature-map 규모, $c$는 출력 채널 수를 나타내는 표기다.

- Encoder는 $5\times5$ convolution을 사용해 $1m$, $2m$, $4m$, $8m$ maps로 늘린다. 각 층은 stride $2\times2$, padding 2, ReLU를 사용한 뒤 512 Dense, ReLU와 $D_z$ Dense로 이어진다. ELBO VAE와 WAE가 사용한다.
- Implicit Encoder는 $x$와 `ReLU(Dense($\epsilon$))`를 channel 방향으로 결합한 뒤 같은 $1m\to2m\to4m\to8m$ convolution 경로, 512 Dense, $D_z$ Dense를 사용한다.
- Decoder는 Dense, ReLU 뒤에 $5\times5$ transposed convolution을 $4m\to2m\to1m\to c$ maps 순으로 적용한다. 각 층은 stride $2\times2$, padding 2, output padding 1이며 마지막 활성화는 Tanh다.
- Implicit VAE의 Score Estimator는 $x$와 `ReLU(Dense($z$))`를 channel 방향으로 결합하고, $1m\to2m\to4m\to8m$ convolution과 512 Dense, $D_z$ Dense를 거친다.
- WAE의 Score Estimator는 `ReLU(Dense($z$))`를 한 채널로 reshape한 뒤 같은 convolution 경로와 512 Dense, $D_z$ Dense를 사용한다.

SSM의 미분은 score estimator 출력의 입력 Jacobian에 작용한다. 따라서 score estimator가 어느 변수의 스코어를 근사하는지에 따라 미분 대상과 출력 차원을 일치시켜야 한다.

## 무엇이 성능을 만들었나

이 논문에는 독립된 ablation table이 없다. 따라서 구성 요소별 수치적 인과관계는 직접 비교가 있는 범위에서만 분리해 읽어야 한다.

첫째, 기본 SSM과 SSM-VR의 차이다. DKEF 결과에서 variance reduction이 SSM 성능을 크게 개선했고 SSM-VR은 표준 SM과 비슷한 성능을 보였다. 이는 Eq. 8에서 기대값을 알고 있는 projected-score 제곱항을 정확한 $\|s_m\|^2$로 바꾼 설계가 유한표본 최적화에 중요하다는 증거다.

둘째, 투영 수 $M$의 효과다. MNIST VAE latent dimension 32에서 기본 SSM NLL은 89.25이고 $M=100$에서는 88.29다. 다만 $M=100$ 결과는 데이터마다 100 samples를 쓰는 kernel method와 계산 비용을 맞춘 조건이다. 품질 개선만 떼어 “무료 이득”으로 읽으면 안 된다.

DSM의 여러 $\sigma$ 결과도 민감도를 보여주지만, 이는 SSM 내부 구성 요소의 ablation은 아니다. NICE에서 $\sigma=0.10$과 1.74는 test SM loss가 -3035와 -97, test LL이 -4363과 -8082로 크게 다르다. 노이즈 규모가 복원 대상과 최적화 결과를 바꾼다는 기존 방법의 한계를 수치로 확인하는 비교에 가깝다.

내가 보기에는 논문의 기여는 세 층으로 나뉜다. 첫 번째이자 핵심은 Fisher divergence의 식별력을 유지하면서 trace를 랜덤 이차형식으로 바꾼 Eq. 5와, 이를 일반적인 reverse-mode autodiff로 계산하게 만든 것이다. 두 번째는 이 랜덤 추정량의 consistency와 asymptotic normality를 정리하고 $M$에 따른 계산·분산 교환을 식으로 드러낸 것이다. 세 번째는 SSM-VR이다. 수학적으로는 기대값을 아는 항을 control variate로 치환한 비교적 단순한 장치지만, DKEF 결과를 보면 실제 성능에는 핵심적이다. NCE 연결, DKEF의 $\alpha$ 해석해, VAE·WAE 적용은 앞의 두 기여가 다른 추정 문제와 모델에서 작동함을 보여주는 연결 및 검증으로 보는 편이 맞다.

## 비용과 트레이드오프

SSM의 계산상 핵심 비율은 $D+1$ 대 $M+1$이다. 입력 차원 $D$가 크고 작은 $M$으로 충분한 경우 표준 SM보다 Hessian 관련 gradient operation을 크게 줄인다. DKEF 차원 확장 실험에서 표준 SM이 12GB GPU로 400차원을 넘기지 못한 결과는 이 차이가 메모리 병목에도 연결됨을 보여준다.

하지만 SSM은 trace를 정확히 계산하지 않고 랜덤 추정한다. 저자가 밝힌 대로 Rademacher SSM의 점근 분산은 표준 SM보다 항상 크다. $M$을 늘리면 Eq. 23과 Eq. 9의 $1/M$ 추가 항이 줄지만, 동시에 gradient operation 수가 증가한다. $M$이 데이터 차원에 가까워지면 표준 SM에 대한 계산 우위를 잃는다.

경량화 관점에서 보면 SSM은 모델 파라미터를 줄이는 방법이 아니다. 네트워크 크기와 score estimator의 파라미터 메모리는 그대로이며, 입력에 대한 고차 미분 경로를 랜덤 방향 몇 개로 제한해 학습 시 활성값과 미분 계산의 부담을 낮추는 방법이다. 추론 모델 자체를 압축하는 quantization이나 pruning과 목적이 다르다.

암묵적 VAE와 WAE에서는 별도의 score estimator도 학습해야 한다. SSM이 kernel estimator보다 sample 수를 적게 사용할 수 있더라도 score network의 forward·backward와 입력 Jacobian-vector product 비용이 새로 생긴다. CelebA 결과에서 초기 SSM 성능이 낮은 현상은 계산 비용뿐 아니라 보조 score network가 충분히 학습될 때까지 기다려야 하는 최적화 비용도 있음을 보여준다.

DKEF에서는 $M=1$이 기본값이지만 15 seeds, validation patience 200, AIS 1,000,000 samples를 사용했다. NICE는 표준 SM을 제외해 한 epoch 7시간의 비용을 피했지만 각 모델 학습에는 약 2시간이 들었다. 따라서 목적함수 한 스텝의 효율과 전체 실험 비용은 구분해야 한다. 특히 AIS 기반 likelihood 평가는 학습 목적함수의 효율화와 별개의 평가 비용이다.

## 한계와 생각해볼 점

저자가 명시한 한계는 세 가지다.

첫째, $M$이 데이터 차원에 가까워지면 SSM은 표준 SM에 대한 계산 이점을 잃는다. 이는 구현 복잡도의 $M+1$ 대 $D+1$ 비교에서 직접 나온다.

둘째, Rademacher SSM의 점근 분산은 표준 SM보다 항상 크다. $M$이 증가할수록 차이는 줄지만 계산량도 함께 증가한다. 작은 $M$의 확장성과 큰 $M$의 통계적 효율 사이에서 선택해야 한다.

셋째, 기존 Hyvärinen의 결과는 이 논문에서 증명하는 consistency보다 약한 local consistency로 구분된다. SSM의 더 강한 결론은 compactness, 식별가능성, 경계 조건, smoothness와 유한 모멘트 조건을 포함한 Assumption 1부터 9의 틀 안에서 성립한다.

내가 구현 관점에서 추가로 주의해서 읽은 부분은 목적함수의 불편성과 실제 학습 안정성이 같지 않다는 점이다. Eq. 7이 불편 추정량이라는 사실만으로 작은 $M$에서 최적화가 안정적이라고 결론 내릴 수는 없다. DKEF에서 SSM-VR이 기본 SSM보다 크게 개선된 결과가 그 차이를 보여준다. 새 데이터와 모델에서는 $M$, projection 분포, control-variate 계수가 별도의 최적화 설계 변수가 된다.

또한 일반 신경망 score estimator가 curl-free가 아닐 수 있다는 각주는 중요하다. 추정된 벡터장이 downstream 엔트로피 그래디언트에 유용할 수는 있어도, 항상 어떤 정규화 가능한 밀도의 로그 gradient로 적분된다고 볼 수는 없다. 밀도 복원까지 요구하는 응용이라면 자유로운 $h$ 대신 energy parameterization이나 integrability 제약이 필요하고, 그 대가로 미분 깊이와 계산량이 늘어난다.

실험 범위에 관한 유보는 한 번만 두는 것이 적절하다. 이 논문은 UCI 표형 데이터, MNIST, CelebA와 fully connected·convolutional 구조에서 가능성을 보였지만, 더 높은 해상도·다른 모달리티·더 큰 score network에서 같은 $M$과 projection 분포가 충분한지는 별도의 검증 문제다. 특히 차원이 커질수록 한 투영이 싸다는 사실과, 원하는 통계적 효율을 위해 작은 $M$이 충분하다는 사실은 서로 다른 주장이다.

