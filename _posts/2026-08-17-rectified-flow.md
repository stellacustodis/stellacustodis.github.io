---
title: "[논문 리뷰] Flow Straight and Fast: Learning to Generate and Transfer Data with Rectified Flow"
date: 2026-08-17 21:20:00 +0900
permalink: /posts/rectified-flow/
categories:
  - AI
  - Paper Review
tags: [paper-review, rectified-flow, generative-model, ode, optimal-transport]
description: "선형 보간의 속도를 회귀하고 reflow로 coupling을 직선화해 생성과 도메인 변환의 ODE 샘플링 비용을 줄이는 Rectified Flow를 수식과 구현 관점에서 정리한다."
related: [flow-matching, score-sde, ddim]
paper:
  authors: "Xingchao Liu, Chengyue Gong, Qiang Liu"
  venue: "ICLR 2023"
  url: "https://openreview.net/forum?id=XVjTT1nw5z"
  code: "https://github.com/gnobitab/RectifiedFlow"
---

> 이 글은 개인 Obsidian에 정리해 둔 논문 노트를 블로그 형식으로 다시 편집한 글이다. 선형 보간의 속도를 회귀하고 reflow로 생성 궤적을 직선화하는 과정에 초점을 맞춘다.

## 세 줄 요약

Rectified flow는 두 분포에서 뽑은 표본을 선형 보간하고, 보간점에서 끝점 변위의 조건부 평균을 예측하는 최소제곱 문제로 생성·변환 ODE를 학습한다. 학습된 ODE가 만든 새로운 coupling으로 같은 절차를 반복하는 reflow는 궤적을 점차 직선에 가깝게 만들어 적은 함수 평가 횟수(Number of Function Evaluations, NFE)에서도 품질을 유지하게 한다. 이 과정은 주변분포 보존과 convex transport cost의 비증가로 정당화되지만, 비선형 경로나 고차원 최적 전송으로 확장하면 보장의 범위가 좁아진다.

이 글에서 다루는 논문은 Xingchao Liu, Chengyue Gong, Qiang Liu의 **FLOW STRAIGHT AND FAST: LEARNING TO GENERATE AND TRANSFER DATA WITH RECTIFIED FLOW**이며 ICLR 2023에 발표되었다. 저자들이 공개한 공식 코드는 [gnobitab/RectifiedFlow](https://github.com/gnobitab/RectifiedFlow)에서 확인할 수 있다.

## 이 논문이 풀려는 문제

생성 모델에서는 품질뿐 아니라 표본 하나를 얻기 위해 모델을 몇 번 호출해야 하는지도 중요하다. GAN은 한 번의 순전파로 표본을 생성할 수 있지만 학습 불안정성, mode collapse, 구조나 데이터셋이 바뀔 때의 민감한 튜닝 문제가 있다. 반면 VAE, normalizing flow, autoregressive model 같은 maximum likelihood 계열은 복잡한 모델에서 likelihood 계산이 어려워 근사 추론을 도입하거나 모델 구조를 제한해야 한다. 이때 표현력과 계산량 사이의 trade-off가 커진다.

ODE·SDE 기반 diffusion 계열은 다른 학습 경로를 제공하지만, 생성할 때 neural force field를 반복 호출하며 수치적 solver를 실행해야 한다. CIFAR10 결과에서 Rectified Flow ODE의 full simulation은 104~127 NFE, VP·sub-VP ODE는 140~146 NFE, SDE는 2,000 Euler step을 사용한다. 서로 다른 적분법의 숫자를 같은 wall-clock 비율로 해석할 수는 없지만, 반복적인 U-Net 호출이 추론 비용의 핵심이라는 점은 분명하다.

생성과 도메인 변환(domain transfer)이 서로 분리되어 연구되어 왔다는 문제도 있다. 생성은 단순한 기준분포에서 데이터분포로 이동하는 문제이고, 쌍 없는 이미지 변환은 서로 다른 데이터분포를 연결하는 문제다. 후자에는 cycle-consistency 같은 별도 장치가 추가되곤 한다. 최적 전송(Optimal Transport, OT)은 둘을 하나의 분포 이동 문제로 표현할 수 있지만, 고차원 대규모 데이터에서 최적 coupling을 직접 구하기는 어렵다.

Rectified flow는 OT를 곧바로 풀지 않는다. 먼저 임의의 coupling에서 두 끝점을 잇는 선분을 만들고, 그 선분들을 평균적으로 따라가는 ODE를 최소제곱으로 학습한다. 이 ODE가 만드는 coupling은 원래 coupling과 끝점 주변분포가 같고, rectifiability 조건 아래에서 convex transport cost가 더 크지 않다. 이어서 이 coupling을 다음 학습 데이터로 사용하면 경로가 점차 펴진다. 생성과 변환은 시작분포와 도착분포만 다를 뿐 같은 학습·시뮬레이션 절차가 된다.

## 핵심 아이디어 — 선분을 학습하고 coupling을 다시 연결한다

$X_0\sim\pi_0$, $X_1\sim\pi_1$인 표본 쌍을 생각하자. 두 표본의 선형 보간은

$$
X_t=(1-t)X_0+tX_1,\qquad t\in[0,1]
$$

이고 속도는 시간에 무관한 $X_1-X_0$다. 따라서 임의의 $t$를 뽑아 $(X_t,t)$에서 이 속도를 회귀할 수 있다.

문제는 여러 선분이 같은 위치를 통과할 수 있다는 점이다. 같은 $(x,t)$에서 서로 다른 표본 쌍이 다른 방향을 요구하면 하나의 결정론적 속도장 $v(x,t)$이 모든 방향을 동시에 표현할 수 없다. 제곱 오차의 최적해는 그 위치를 지나는 방향들의 조건부 평균이 된다. 이 평균 속도로 ODE를 풀면 원래 선분을 그대로 복제하는 대신 끝점의 연결 관계를 다시 배선(rewiring)한다.

![교차하는 선형 보간을 속도장이 다시 연결하는 과정](/assets/img/posts/rectified-flow/figure2.png){: w="700" }
_그림 1. 교차하는 선분의 방향을 조건부 평균으로 결합해 결정론적인 ODE coupling으로 다시 연결하는 rectification 과정이다._

이 재연결은 시각적 조작에 그치지 않는다. ODE 해의 존재와 유일성이 보장되는 조건에서는 모든 시점의 주변분포를 보존하고, 임의의 convex 함수로 측정한 변위 비용을 증가시키지 않는다. 새 ODE로 $(Z_0,Z_1)$을 만든 뒤 다시 선형 보간하여 속도장을 학습하는 reflow를 반복하면 coupling은 straight flow의 고정점에 가까워진다.

직선화가 중요한 이유는 Euler 근사의 오차다. 속도가 시간과 위치에 따라 크게 달라지는 굽은 궤적에는 작은 step이 많이 필요하다. 반대로 constant-speed 선분에서는 실제 속도, 끝점 변위, 한 번의 Euler update가 모두 $Z_1-Z_0$로 일치한다. Rectified flow는 ODE를 제거하기보다 한 번의 큰 step으로도 적분하기 쉬운 ODE를 만드는 접근이다.

## 조건부 속도 회귀

논문의 기본 목적함수는 다음과 같다.

$$
\min_v \int_0^1
\mathbb{E}\left[
\left\|(X_1-X_0)-v(X_t,t)\right\|^2
\right]dt,
\qquad
X_t=tX_1+(1-t)X_0.
\tag{1}
$$

$X_1-X_0$는 선형 경로의 목표 속도이고, $X_t$는 속도장을 평가할 위치다. 시간 $t$를 입력하면 같은 공간 위치에서도 이동 단계에 따라 다른 속도를 표현할 수 있다. 고정된 $(x,t)$에서 제곱 오차를 최소화하면

$$
v^X(x,t)=\mathbb{E}[X_1-X_0\mid X_t=x]
\tag{2}
$$

를 얻는다.

$Y=X_1-X_0$, $m_t(x)=\mathbb{E}[Y\mid X_t=x]$라고 두면 이 결론은 조건부 분산 분해로 확인할 수 있다.

$$
\begin{aligned}
\mathbb{E}[\|Y-a\|^2\mid X_t=x]
&=\mathbb{E}[\|Y-m_t(x)\|^2\mid X_t=x]\\
&\quad+\|m_t(x)-a\|^2.
\end{aligned}
\tag{D1}
$$

교차항은 $\mathbb{E}[Y-m_t(x)\mid X_t=x]=0$이므로 사라진다. 따라서 전체 손실은

$$
\begin{aligned}
\mathcal L(v)
&=\int_0^1\mathbb{E}\|Y-m_t(X_t)\|^2dt\\
&\quad+\int_0^1\mathbb{E}\|m_t(X_t)-v(X_t,t)\|^2dt
\end{aligned}
\tag{D2}
$$

로 나뉜다. 첫째 항은 입력 coupling이 정한 제거 불가능한 조건부 분산이고, 둘째 항만 모델이 줄일 수 있다. 네트워크 용량만 키워서는 첫째 항을 없앨 수 없지만, reflow로 coupling을 바꾸면 같은 위치를 통과하는 속도들의 분산 자체를 줄일 수 있다.

Eq. 1은 ODE 전체를 푼 뒤 손실을 계산할 필요가 없다는 계산상 장점도 있다. 학습할 때는 endpoint 쌍과 시간 하나를 표본화하고 보간점에서 네트워크를 한 번 평가하면 된다. 반면 생성할 때는 앞 step의 출력이 다음 step의 입력이므로 속도장을 순차적으로 호출해야 한다. 학습은 독립적인 one-point regression이고 추론은 rollout이라는 비대칭이 생긴다. 학습 손실이 작더라도 큰 Euler step에서 발생하는 누적 오차가 작다는 보장은 없으며, 이 간격을 줄이는 절차가 reflow와 distillation이다.

## ODE, 시간 반전, 주변분포 보존

학습된 속도장은

$$
dZ_t=v(Z_t,t)dt
$$

에 사용된다. $\pi_0$에서 시작해 정방향으로 풀면 $\pi_1$로 이동한다. 역방향에서는 $\tilde X_0\sim\pi_1$에서

$$
d\tilde X_t=-v(\tilde X_t,t)dt
$$

를 풀고 $X_t=\tilde X_{1-t}$로 둔다. Eq. 1은 시간 반전과 $X_0,X_1$ 교환에 대해 대칭이므로 별도의 역방향 모델이 필요하지 않다. 다만 구현에서는 solver의 증가 변수, 네트워크에 전달하는 시간, update 부호를 함께 맞춰야 한다. 속도 앞의 부호만 바꾸고 시간 입력을 잘못 유지하면 다른 ODE를 적분하게 된다.

Rectified flow의 적분 표현은 Eq. 11이다.

$$
Z_t=Z_0+\int_0^t v^X(Z_t,t)dt,
\qquad Z_0=X_0.
\tag{11}
$$

원문은 적분 내부와 상한에 같은 기호를 사용한다. 구현과 해석에서는 이를

$$
Z_t=Z_0+\int_0^t v^X(Z_s,s)ds
$$

처럼 적분 변수 $s$를 분리해 읽는 편이 명확하다.

Theorem D.3은 선형 보간 프로세스 $X$가 rectifiable하고 $Z$가 그 rectified flow이면 모든 $t\in[0,1]$에 대해

$$
Law(Z_t)=Law(X_t)
$$

임을 보인다. 출발점은 임의의 테스트 함수 $h$에 대한 식이다.

$$
\frac{d}{dt}\mathbb{E}[h(X_t)] =
\mathbb{E}[\nabla h(X_t)^\top\dot X_t] =
\mathbb{E}[\nabla h(X_t)^\top v^X(X_t,t)].
\tag{12}
$$

$\nabla h(X_t)$는 $X_t$가 주어지면 정해지므로 조건부 기댓값 안으로 넣을 수 있다.

$$
\begin{aligned}
\mathbb{E}[\nabla h(X_t)^\top\dot X_t]
&=\mathbb{E}\!\left[
\nabla h(X_t)^\top
\mathbb{E}[\dot X_t\mid X_t]
\right].
\end{aligned}
\tag{D3}
$$

선형 경로에서는 $\dot X_t=X_1-X_0$이므로 안쪽 기댓값이 Eq. 2의 $v^X$다. 밀도 $\pi_t$가 존재하고 부분적분의 경계항을 처리할 수 있으면 Eq. 12는 약한 의미의 continuity equation으로 바뀐다.

$$
\dot\pi_t+\nabla\cdot(v_t^X\pi_t)=0.
\tag{13}
$$

$X_t$의 주변분포와 $Z_t$의 분포가 같은 초기조건과 같은 continuity equation을 만족하고 그 해가 유일하므로 두 분포가 일치한다. 여기서 유일성은 필수 조건이다. 같은 초기분포와 속도장에 여러 분포 해가 존재한다면 같은 방정식을 만족한다는 사실만으로 분포의 일치를 결론 낼 수 없다.

Definition D.4에서 선형 보간 coupling이 rectifiable하다는 것은 $v^X$가 locally bounded이고 Eq. 11의 해가 존재하며 유일하다는 조건에 기대고 있다. Support 밖의 속도장은 0과 같은 값으로 연장할 수 있다. 따라서 “회귀의 population optimum이 존재한다”와 “그 optimum이 유일한 ODE transport를 정의한다”는 별개의 단계다.

조건부 밀도가 불규칙하거나 coupling이 특이하면 속도장이 급격히 변할 수 있다. 부록은 조건부 밀도가 존재하지 않을 때 $(X_0,X_1)$과 독립인 Gaussian noise를 더해 평활화하는 방법을 제시한다. 이는 이론적 속도장의 regularity를 다루는 장치이며, 기본 rectified-flow 학습이 noise 주입을 요구한다는 뜻은 아니다.

## 조건부 밀도와 비모수 추정

$X_1$이 주어졌을 때 $X_0$의 조건부 밀도 $\rho(\cdot\mid X_1)$가 존재하면 Eq. 2는 다음처럼 구체화된다.

$$
v^X(z,t)=
\mathbb{E}\left[
\frac{X_1-z}{1-t}\eta_t(X_1,z)
\right],
\qquad
\eta_t(X_1,z)=
\frac{
\rho\left(\frac{z-tX_1}{1-t}\mid X_1\right)
}{
\mathbb{E}\left[
\rho\left(\frac{z-tX_1}{1-t}\mid X_1\right)
\right]
}.
\tag{6}
$$

$X_t=z$와 $X_1=x_1$을 고정하면

$$
x_0=\frac{z-tx_1}{1-t},
\qquad
X_1-X_0=\frac{x_1-z}{1-t}.
\tag{D4}
$$

변수 치환의 Jacobian $(1-t)^{-d}$는 $X_1\mid X_t=z$를 정규화할 때 분자와 분모에서 소거된다. 남는 조건부 밀도 가중치가 $\eta_t$이며, 현재 위치와 양립하는 끝점 후보들이 속도에 얼마나 기여하는지를 나타낸다.

Eq. 6에는 $1/(1-t)$가 있으므로 $t=1$에서 그대로 계산하면 안 된다. Eq. 1의 미니배치 학습은 $X_1-X_0$를 직접 target으로 사용해 이 특이점을 피한다. Eq. 6을 직접 구현한다면 시간 표본화 구간과 경계 처리가 필요하다.

$\log\eta_t$가 미분 가능하면 속도장의 공간 미분은

$$
\nabla_z v^X(z,t) =
\frac{1}{1-t}
\mathbb{E}\left[
\left(
(X_1-z)\nabla_z\log\eta_t(X_1,z)-1
\right)\eta_t(X_1,z)
\right]
$$

로 표현된다. 벡터 속도장의 Jacobian으로 읽으면 $-1$은 해당 차원의 identity 항이다. 이를 통해 조건부 밀도의 regularity를 속도장의 Lipschitz 성질과 연결할 수 있고, $v^X$가 임의의 $a<1$에 대해 $[0,a]$에서 uniformly Lipschitz이면 ODE 해의 유일성을 확보할 수 있다.

조건부 밀도를 모를 때는 커널 기반 Nadaraya–Watson 추정을 사용할 수 있다.

$$
v^{X,h}(z,t)=
\mathbb{E}\left[
\frac{X_1-z}{1-t}\omega_h(X_t,z)
\right].
\tag{7}
$$

부록의 k-NN 근사는 $z$에 가까운 상위 $m$개 보간점만 사용한다.

$$
v^{X,h}(z,t)\approx
\frac{
\sum_{i\in knn(z,m)}
\frac{x_1^{(i)}-z}{1-t}\,
\omega_h(x_t^{(i)},z)
}{
\sum_{i\in knn(z,m)}
\omega_h(x_t^{(i)},z)
}.
\tag{D5}
$$

기본 설정은 bandwidth $h=1$, 이웃 수 $m=100$, 시뮬레이션 step $N=100$이다. 유한한 경험분포와 알려진 밀도로 속도를 지나치게 정확히 계산하면 훈련점을 그대로 복원하는 과적합이 생길 수 있어, 신경망이나 비모수 모델의 평활 근사가 유익하다는 설명도 함께 제시된다.

고차원에서는 가까운 이웃이라는 기준 자체가 약해질 수 있다. 따라서 이 비모수 추정은 이론적 속도장을 시각화하는 데는 유용하지만, 이미지 생성의 주된 구현은 U-Net 기반 $v_\theta(x,t)$이다. 신경망은 국소 커널 회귀를 전역 함수 근사와 표현 학습으로 대체한다.

## 직선성과 경로 교차

Flow $Z_t$의 직선성(straightness)은 다음 함수로 측정한다.

$$
S(Z)=
\int_0^1
\mathbb{E}\left[
\left\|(Z_1-Z_0)-\dot Z_t\right\|^2
\right]dt.
\tag{3}
$$

$S(Z)=0$이면 $\dot Z_t=Z_1-Z_0$가 전 구간에서 성립하므로

$$
Z_t=(1-t)Z_0+tZ_1
$$

인 constant-speed 선분이 된다. 끝점만 비교하는 비용과 달리 Eq. 3은 같은 끝점을 잇더라도 중간에서 크게 굽는 경로를 구분한다.

Straight flow의 속도장은 inviscid Burgers 방정식

$$
\partial_t v+(\partial_zv)v=0
$$

을 만족한다. 이는 ODE 궤적을 따라 계산한 속도의 material derivative가 0이라는 뜻이다. 논문은 이 residual을 직접 regularization하지 않고 reflow로 endpoint pairing을 바꾼다. Burgers residual을 직접 줄이려면 시간 미분과 Jacobian-vector product가 필요하고, 그것만으로 올바른 시작·도착 주변분포가 보장되는 것도 아니다. Reflow는 Eq. 1의 단순한 1차 회귀 형식을 유지하면서 straight flow의 고정점으로 이동한다.

경로 교차가 남기는 조건부 분산은 Eq. 14로 측정한다.

$$
V((X_0,X_1))
:=
\int_0^1
\mathbb{E}\left[
\left\|
X_1-X_0-\mathbb{E}[X_1-X_0\mid X_t]
\right\|^2
\right]dt.
\tag{14}
$$

$V=0$이면 같은 $(X_t,t)$를 지나는 경로들의 속도가 사실상 하나뿐이다. 결정론적 속도장이 원래 선분을 오차 없이 표현할 수 있고 rectification 후에도 coupling이 바뀌지 않는다.

Theorem D.6은 rectifiable coupling에 대해 다음이 동치임을 보인다.

1. 어떤 strictly convex 비용에서 rectification 전후 비용이 같다.
2. RectFlow 연산의 고정점이다.
3. ODE 궤적이 원래 선형 보간과 일치한다.
4. Eq. 14의 $V$가 0이다.

Strict convexity는 Jensen 부등식의 등호 조건에서 필요하다. 평균의 비용과 비용의 평균이 같으려면 조건부 평균에 섞인 속도들이 같아야 하며, 이로부터 $V=0$이 따라온다.

## Convex transport cost가 증가하지 않는 이유

Theorem D.5는 $(X_0,X_1)$이 rectifiable하고 $(Z_0,Z_1)$이 rectified coupling이면 임의의 convex 함수 $c$에 대해

$$
\mathbb{E}[c(Z_1-Z_0)]
\le
\mathbb{E}[c(X_1-X_0)]
$$

가 성립한다고 말한다. $Y=X_1-X_0$라 두면 두 번의 Jensen 부등식으로 전개할 수 있다.

$$
\begin{aligned}
\mathbb{E}[c(Z_1-Z_0)]
&=
\mathbb{E}\left[
c\left(\int_0^1v^X(Z_t,t)dt\right)
\right]\\
&\le
\int_0^1\mathbb{E}[c(v^X(Z_t,t))]dt\\
&=
\int_0^1\mathbb{E}[c(v^X(X_t,t))]dt\\
&=
\int_0^1
\mathbb{E}\left[
c\left(\mathbb{E}[Y\mid X_t]\right)
\right]dt\\
&\le
\int_0^1\mathbb{E}[c(Y)]dt\\
&=
\mathbb{E}[c(Y)].
\end{aligned}
\tag{D6}
$$

첫 번째 부등식은 시간 평균에 Jensen 부등식을 적용한 결과다. 가운데 등식은 Theorem D.3의 주변분포 보존을 사용한다. 두 번째 부등식은 조건부 평균에 대한 Jensen 부등식이다.

이 정리는 비용이 증가하지 않는다고 말할 뿐, 항상 전역 최적 coupling에 도달한다고 말하지 않는다. Rectified flow는 OT solver라기보다 주어진 coupling의 비용과 적분 난이도를 개선하는 연산으로 읽는 편이 정확하다.

## Reflow의 개선량

제곱 비용에서는 transport cost 감소량이 두 항으로 정확히 분해된다.

$$
\mathbb{E}\|X_1-X_0\|^2 -
\mathbb{E}\|Z_1-Z_0\|^2 =
S(Z)+V((X_0,X_1)).
\tag{15}
$$

$Y=X_1-X_0$, $m_t=v^X(X_t,t)$라 두면 조건부 분산 분해에서

$$
V((X_0,X_1)) =
\mathbb{E}\|Y\|^2 -
\int_0^1\mathbb{E}\|m_t\|^2dt.
\tag{D7}
$$

한편 $u_t=v^X(Z_t,t)=\dot Z_t$와 $\Delta Z=Z_1-Z_0=\int_0^1u_tdt$를 사용해 Eq. 3을 전개하면

$$
S(Z) =
\int_0^1\mathbb{E}\|u_t\|^2dt -
\mathbb{E}\|\Delta Z\|^2.
\tag{D8}
$$

Theorem D.3에 의해 $X_t$와 $Z_t$의 주변분포가 같으므로 $m_t(X_t)$와 $v^X(Z_t,t)$의 제곱 기댓값도 같다. 식 (D7)과 식 (D8)을 더하면 중간 속도 항이 소거되어 Eq. 15가 나온다. $S$는 새 ODE의 굽음을, $V$는 원래 선형 경로들의 방향 충돌을 나타낸다.

Theorem D.7은 reflow를 재귀적으로 적용할 때

$$
\sum_{k=0}^{K}
\left[
S(Z^{k+1})+
V((Z_0^k,Z_1^k))
\right]
\le
\mathbb{E}\|X_1-X_0\|^2
$$

이고,

$$
\min_{k\le K}
\left(
S(Z^k)+V((Z_0^k,Z_1^k))
\right)
=\mathcal O(1/K)
$$

임을 보인다. 각 단계의 coupling이 rectifiable하고 초기 제곱 이동량의 기댓값이 유한하다는 가정이 필요하다. 증명은 Eq. 15를 단계별로 적용한 뒤 transport cost 차이를 telescoping sum으로 더한다.

이 결과는 모든 단계가 같은 속도로 단조 개선된다는 뜻이 아니다. 첫 $K$단계 중 적어도 하나에 대한 최솟값 보장이며, 실제 신경망의 조건부 속도 추정 오차도 포함하지 않는다. 저자가 reflow를 지나치게 반복하면 추정 오차가 누적될 수 있다고 경고하는 이유다.

![Reflow에 따라 생성 궤적이 직선에 가까워지는 결과](/assets/img/posts/rectified-flow/figure6.png){: w="700" }
_그림 2. CIFAR10에서 reflow에 따른 straightness 변화와 픽셀 궤적을 함께 보여준다._

## 최적 전송과의 관계

Theorem D.8은 strictly convex $c$에 대해 이미 $c$-optimal인 rectifiable coupling은 straight coupling이라고 말한다. 최적 coupling은 rectification 후 비용이 더 낮아질 수 없으므로 Theorem D.5의 부등식이 등식이 되고, Theorem D.6에 의해 straightness가 따라온다. 따라서 straightness는 이 조건에서 OT의 필요조건이다.

역은 고차원에서 보장되지 않는다. $d\ge2$에서는 straight coupling이라는 사실만으로 특정 convex cost의 최적 coupling이라고 결론 내릴 수 없다. Quadratic OT를 목표로 한다면 $v=\nabla f$ 형태의 gradient field로 속도장을 제한하는 추가 수정이 필요하다. Rectified flow는 가능한 straight fixed point 중 전역 OT 해를 선택하는 조건보다 low-NFE 생성에 필요한 직선화를 우선한다.

1차원에서는 관계가 강해진다. Lemma D.9에 따르면 coupling이 straight하다는 것은 deterministic하고 monotonic하다는 것과 동치다. ODE 해가 교차하지 않으므로 순서가 보존되고, 반대로 단조 coupling에서는 선형 보간 경로가 교차하지 않는다.

Theorem D.10은 1차원에서 straight coupling이 존재한다면 유일하고, 최솟값이 유한하게 존재하는 모든 convex cost에 동시에 최적인 deterministic monotonic coupling과 일치한다고 설명한다. 이 결론을 고차원으로 그대로 일반화해서는 안 된다.

## 비선형 경로와 Probability Flow ODE

선형 보간을 임의의 미분 가능 경로로 바꾸면 목적함수는 다음처럼 일반화된다.

$$
\min_v
\int_0^1
\mathbb{E}\left[
w_t\left\|v(X_t,t)-\dot X_t\right\|^2
\right]dt.
\tag{8}
$$

예를 들어

$$
X_t=\alpha_tX_1+\beta_tX_0
$$

이고 끝점 조건은 $\alpha_1=\beta_0=1$, $\alpha_0=\beta_1=0$이다. 목표 속도는

$$
\dot X_t=\dot\alpha_tX_1+\dot\beta_tX_0
$$

이며 population optimum은

$$
v^X(z,t)=\mathbb{E}[\dot X_t\mid X_t=z]
$$

가 된다. $w_t>0$이 시간에만 의존하면 최적 속도 자체보다 시간대별 학습 비중을 바꾼다.

일반 경로에서도 Eq. 12와 continuity equation 논증을 $\dot X_t$로 반복할 수 있어 주변분포는 보존된다. 그러나 convex transport-cost 감소는 그대로 따라오지 않는다. 같은 Jensen 전개로 얻는 것은

$$
\mathbb{E}[c(Z_1-Z_0)]
\le
\int_0^1\mathbb{E}[c(\dot X_t)]dt
\tag{D9}
$$

이다. 한편 $X_1-X_0=\int_0^1\dot X_tdt$이므로

$$
\mathbb{E}[c(X_1-X_0)]
\le
\int_0^1\mathbb{E}[c(\dot X_t)]dt.
\tag{D10}
$$

두 endpoint cost는 같은 상한을 가질 뿐 서로의 대소가 정해지지 않는다. Constant-speed 선형 보간에서는 $\dot X_t=X_1-X_0$이므로 이 간격이 사라진다. 비상수 속도의 직선 보간에서는 transport-cost 감소가 convex이면서 $m$-homogeneous인 비용 함수, $m\in(0,1]$인 경우로 제한된다.

VP ODE와 sub-VP ODE에 공통으로 쓰이는 schedule은

$$
\alpha_t=
\exp\left(
-\frac14a(1-t)^2-\frac12b(1-t)
\right)
\tag{9}
$$

이고 기본값은 $a=19.9$, $b=0.1$이다.

$$
\text{VP ODE: }\beta_t=\sqrt{1-\alpha_t^2},
\qquad
\text{sub-VP ODE: }\beta_t=1-\alpha_t^2.
\tag{10}
$$

Proposition C.1은 $\alpha_1=1$, $\beta_1=0$ 아래에서 PF-ODE 변형을

$$
X_t=\alpha_tX_1+\beta_t\xi,
\qquad \xi\sim\mathcal N(0,I)
$$

형태의 Eq. 8 인스턴스로 본다. PF-ODE의 시작 계수가 정확한 끝점 조건을 충족하지 않으면 $X_0\approx\beta_0\xi$로 근사하고 초기분포를 $\mathcal N(0,\beta_0^2I)$로 둔다. Rectified flow의 선형 endpoint 보간에는 이 근사가 필요하지 않다.

VE ODE는 $\alpha_t=1$과

$$
\beta_t=\sigma_{\min}\sqrt{r^{2(1-t)}-1}
$$

을 사용한다. 기본 $\sigma_{\min}=0.01$이며 $\sigma_{\max}=r\sigma_{\min}$을 훈련 데이터 쌍의 최대 유클리드 거리만큼 크게 설정한다. 이 경로는 직선이지만 속도가 일정하지 않다. 기하학적으로 직선이라는 것과 one-step Euler로 정확히 적분할 수 있는 constant-speed 경로를 구분해야 한다.

이 관점에서 [DDIM](/posts/ddim/)과 [Score-SDE](/posts/score-sde/)의 Probability Flow ODE도 Eq. 8 안에 놓을 수 있다. 공통점은 noise와 data 분포를 결정론적 ODE로 연결한다는 점이다. 차이는 PF-ODE 계열이 주어진 $\alpha_t,\beta_t$ schedule을 따르는 반면, 선형 rectified flow는 endpoint displacement를 회귀하고 reflow로 coupling 자체를 다시 구성한다는 점이다.

기존 neural ODE의 maximum likelihood 학습은

$$
\min_v D(\pi_1;\rho_{v,\pi_0})
\tag{5}
$$

로 표현된다. $D$는 KL divergence 같은 분포 차이이고 $\rho_{v,\pi_0}$는 ODE 시뮬레이션 후의 밀도다. Eq. 5가 최종 분포를 비교하는 관점이라면 Eq. 1은 미리 만든 보간점의 속도를 supervised regression처럼 맞춘다.

## 특징을 보존하는 이미지 변환

쌍 없는 이미지 변환에서는 출력분포만 맞추면 입력과 무관한 이미지로 이동할 수 있다. 논문은 두 도메인을 구별하도록 학습한 분류기의 잠재 표현 $h(x)$를 사용해 Eq. 1을 수정한다.

$$
\min_v
\int_0^1
\mathbb{E}\left[
\left\|
\nabla h(X_t)^\top
\left(
X_1-X_0-v(X_t,t)
\right)
\right\|_2^2
\right]dt.
\tag{4}
$$

선형 경로에서 특징의 변화율은

$$
\frac{d}{dt}h(X_t) =
\nabla h(X_t)^\top(X_1-X_0)
$$

이다. Eq. 4는 픽셀 공간의 모든 속도 오차를 동일하게 벌주기보다 특징을 크게 바꾸는 방향의 오차를 강조한다.

잔차를 $r=X_1-X_0-v(X_t,t)$라고 두면

$$
\|\nabla h(X_t)^\top r\|^2 =
r^\top
\underbrace{\nabla h(X_t)\nabla h(X_t)^\top}_{G_h(X_t)}
r.
\tag{D11}
$$

즉 feature Jacobian이 만드는 위치 의존 metric에서 속도 오차를 측정한다. 다만 $r$가 $\nabla h(X_t)^\top$의 null space에 있으면 손실은 그 오차를 보지 못한다. 분류기 특징이 보존해야 할 정체성을 표현하지 못하면 원하는 변환과 loss metric이 어긋날 수 있다. $h$는 사전학습된 ImageNet 모델을 fine-tuning하여 두 도메인을 구분하도록 만든 분류기의 잠재 표현이다.

## 구현 — 학습과 샘플링의 비대칭

이미지 shape을 `(B, C, H, W)`로 두면 Eq. 1의 기본 학습은 다음과 같다.

```python
# x0, x1: (B, C, H, W), coupling을 유지한 endpoint 쌍
# t:      (B, 1, 1, 1)
# xt, target, pred: (B, C, H, W)

t = uniform_time(B)
xt = (1 - t) * x0 + t * x1
target = x1 - x0
pred = velocity_model(xt, t)
loss = mse(pred, target)
update_model(loss)
```

$t$를 `(B,)`로 두면 broadcasting 축이 의도와 달라질 수 있으므로 이미지에서는 `(B,1,1,1)`처럼 명시하는 편이 안전하다. Reflow 단계에서는 이전 ODE가 만든 $(Z_0,Z_1)$의 pairing을 유지해야 한다. 양 끝을 별도로 shuffle하면 이전 flow의 coupling 정보가 사라진다.

정방향 Euler는 다음과 같다.

```python
# z0: (B, C, H, W), z0 ~ pi_0
z = z0

for i in range(N):
    t = i / N                         # 0, ..., (N-1)/N
    t_batch = full_time(B, t)         # (B, 1, 1, 1)
    z = z + velocity_model(z, t_batch) / N

z1 = z
```

마지막 평가 시점은 $t=1$이 아니라 $(N-1)/N$이다. `range(N + 1)`을 사용하면 한 step을 초과한다. $N=1$이면 정확히 $z_1=z_0+v(z_0,0)$이 된다.

역방향에서는 시간과 부호를 함께 바꾼다.

```python
# z1: (B, C, H, W), z1 ~ pi_1
z = z1

for i in range(N):
    t = 1 - i / N
    t_batch = full_time(B, t)
    z = z - velocity_model(z, t_batch) / N

z0 = z
```

이 표기는 첫 평가에서 $t=1$을 사용한다. 네트워크와 solver의 endpoint 관례를 일관되게 정해야 하며, Eq. 6처럼 $t=1$에 특이점이 있는 해석식을 사용한다면 별도 경계 처리가 필요하다.

논문은 상수 step Euler 외에도 상대·절대 허용 오차를 사용하는 SciPy RK45를 사용한다. RK45의 NFE는 고정된 시간격자 수가 아니라 adaptive solver가 실제로 요청한 속도장 평가 횟수다. Euler의 $N$과 RK45의 NFE가 같다고 해서 동일한 시간 위치에서 평가한 것은 아니다.

학습은 매 표본마다 독립적인 시간을 뽑지만 샘플링은 이전 예측 상태에 조건부로 이어진다. 이 차이 때문에 훈련 분포의 보간점 $X_t$에서 작은 평균 오차가 rollout 상태에서도 유지된다고 보장할 수 없다.

## Reflow와 distillation

Reflow는 현재 flow로 paired endpoints를 만든 뒤 새 속도장을 학습한다.

```python
# Phase A: 현재 flow가 연결한 endpoint 쌍 생성
paired_data = []

for z0 in source_batches:             # (B, C, H, W)
    z = z0
    for i in range(N):
        t = i / N
        t_batch = full_time(B, t)     # (B, 1, 1, 1)
        z = z + velocity_model(z, t_batch) / N
    paired_data.append((z0, z))

# Phase B: pairing을 유지한 채 새 flow 학습
for z0, z1 in paired_data:
    t = uniform_time(B)               # (B, 1, 1, 1)
    zt = (1 - t) * z0 + t * z1
    target = z1 - z0
    pred = new_velocity_model(zt, t)
    update_model(mse(pred, target))
```

CIFAR10에서는 reflow용 endpoint 400만 쌍을 생성하고 다음 flow를 30만 step 동안 fine-tuning한다. 추론 step 감소의 대가로 별도의 데이터 생성·저장과 추가 학습이 필요하다.

![1-rectified flow와 reflow 이후 2-rectified flow의 Euler 궤적](/assets/img/posts/rectified-flow/figure1.jpg){: w="700" }
_그림 3. 같은 Euler step 수에서 reflow 전후의 생성·변환 궤적을 비교한다._

직선화된 flow의 one-step map은

$$
\hat T(z_0)=z_0+v(z_0,0)
$$

이다. 정확한 ODE endpoint와의 차이는

$$
\begin{aligned}
Z_1-\hat T(Z_0)
&=\int_0^1v(Z_t,t)dt-v(Z_0,0)\\
&=\int_0^1[v(Z_t,t)-v(Z_0,0)]dt.
\end{aligned}
\tag{D12}
$$

Full simulation의 endpoint가 정확하다는 사실만으로 이 오차가 작아지지는 않는다. 궤적 전체에서 속도가 초기 속도와 비슷해야 one-step Euler가 성공한다.

Distillation은 reflow 차수 $k$에서 얻은 paired data로

$$
\mathbb{E}\left[
\left\|
(Z_1^k-Z_0^k)-v(Z_0^k,0)
\right\|^2
\right]
$$

를 최소화한다.

```python
# z0, z1: (B, C, H, W), k-th flow의 paired endpoints
target = z1 - z0
pred = one_step_velocity(z0, t=0)
loss = mse(pred, target)
update_model(loss)

generated = z0 + one_step_velocity(z0, t=0)
```

Distillation은 최종 단계에만 적용한다. 먼저 reflow로 궤적을 직선화하고 마지막에 one-step map을 압축해야 한다. One-step generator 학습에는 rectification 차수와 무관하게 LPIPS similarity를 사용한다.

$k$-step generator를 fine-tuning할 때는

$$
t\in\{0,1/k,\ldots,(k-1)/k\}
$$

에서 시간을 표본화한다. 실제 Euler solver가 평가하는 시작 격자에 학습 시간을 맞추며, $t=1$은 update 시작점이 아니므로 제외한다.

## 모델과 최적화 설정

CIFAR10과 이미지 변환에는 DDPM++ U-Net을, 고해상도 생성에는 NCSN++를 사용한다.

CIFAR10 설정은 Adam, learning rate $2\times10^{-4}$, dropout 0.15, EMA ratio 0.999999다. 이미지 변환은 AdamW, batch size 4, 1,000 epochs, dropout 0.1, EMA 0.9999, $\beta=(0.9,0.999)$, weight decay 0.1을 사용한다. 학습률은

$$
\{5\times10^{-4},2\times10^{-4},5\times10^{-5},2\times10^{-5},5\times10^{-6}\}
$$

에서 탐색한다.

Domain adaptation은 AdamW, batch size 16, 50k iteration, learning rate $10^{-4}$, weight decay 0.1, OneCycle schedule을 사용한다. 추론은 100-step uniform discretization이다.

하드웨어, 총 GPU 시간, 모델 파라미터 수는 보고되지 않았다. 따라서 비용 비교는 NFE와 추가 학습 절차를 중심으로 해야 하며, wall-clock 속도나 메모리 감소율을 수치로 환산할 수 없다.

## 실험 설정

CIFAR10은 $32\times32$ 비조건부 생성으로 FID, Inception Score(IS), Recall을 평가한다. Table 1(a)는 같은 DDPM++ 구조 안에서 Rectified Flow, VP·sub-VP ODE, VP·sub-VP SDE를 비교한다. Table 1(b)는 서로 다른 architecture와 학습 recipe의 문헌 결과를 모은 비교다.

고해상도 생성은 LSUN Bedroom, LSUN Church, CelebA-HQ, AFHQ Cat의 $256\times256$ 이미지를 사용한다. AFHQ Cat은 데이터가 6,000장 미만이므로 5,000장으로 FID를 계산한다.

이미지 변환은 AFHQ 15,000장, MetFace 1,336장, CelebA-HQ 30,000장을 80/20으로 분할하고 $512\times512$로 resize한다. Domain adaptation은 DomainNet의 6개 도메인·345개 범주와 Office-Home의 4개 도메인·65개 범주에서 사전학습 모델의 마지막 hidden-layer representation을 변환하고 test Accuracy를 평가한다.

## CIFAR10 결과 — one-step과 full simulation

Table 1(a)의 괄호 안 수치는 distillation 결과다.

| Method | NFE | IS ↑ | FID ↓ | Recall ↑ |
|---|---:|---:|---:|---:|
| 1-Rectified Flow (+Distill), 1-step | 1 | 1.13 (9.08) | 378 (6.18) | 0.0 (0.45) |
| 2-Rectified Flow (+Distill), 1-step | 1 | 8.08 (9.01) | 12.21 (4.85) | 0.34 (0.50) |
| 3-Rectified Flow (+Distill), 1-step | 1 | 8.47 (8.79) | 8.15 (5.21) | 0.41 (0.51) |
| VP ODE (+Distill), 1-step | 1 | 1.20 (8.73) | 451 (16.23) | 0.0 (0.29) |
| sub-VP ODE (+Distill), 1-step | 1 | 1.21 (8.80) | 451 (14.32) | 0.0 (0.35) |
| 1-Rectified Flow, RK45 | 127 | 9.60 | 2.58 | 0.57 |
| 2-Rectified Flow, RK45 | 110 | 9.24 | 3.36 | 0.54 |
| 3-Rectified Flow, RK45 | 104 | 9.01 | 3.96 | 0.53 |
| VP ODE, RK45 | 140 | 9.37 | 3.93 | 0.51 |
| sub-VP ODE, RK45 | 146 | 9.46 | 3.16 | 0.55 |
| VP SDE, Euler | 2000 | 9.58 | 2.55 | 0.58 |
| sub-VP SDE, Euler | 2000 | 9.56 | 2.61 | 0.58 |

표에서 먼저 읽어야 할 것은 첫 Eq. 1 학습만으로 one-step 생성이 해결되지 않는다는 점이다. 1-Rectified Flow의 직접 one-step FID는 378이고 Recall은 0.0이다. 한 번 reflow한 2-Rectified Flow는 distillation 전에도 FID 12.21, Recall 0.34로 개선되고, 3-Rectified Flow는 FID 8.15, Recall 0.41이다.

Distillation 후 FID는 1-, 2-, 3-Rectified Flow에서 각각 6.18, 4.85, 5.21이다. 2-Rectified Flow가 3-Rectified Flow보다 좋으므로 reflow 차수가 늘수록 최종 one-step FID가 단조 개선된다고 말할 수 없다.

Full simulation에서는 반대 trade-off가 보인다. 1-Rectified Flow의 FID 2.58이 가장 좋고 reflow 후에는 3.36, 3.96으로 나빠진다. 대신 NFE는 127에서 110, 104로 줄어든다. Reflow의 주효과는 충분한 solver step에서 최고 품질을 높이는 것보다 거친 discretization에서도 적분하기 쉬운 경로를 만드는 데 있다.

2,000-step VP·sub-VP SDE는 FID 2.55와 2.61이고 1-Rectified Flow RK45는 127 NFE에서 2.58이다. 이 결과는 평가 횟수 차이를 보여주지만, SDE Euler step과 adaptive RK45 호출의 실제 비용이 동일하다는 뜻은 아니다.

Table 1(b)는 같은 구조 안의 통제 비교가 아니라, 서로 다른 architecture와 학습 recipe로 보고된 문헌 결과를 모은 표다.

| Method | NFE ↓ | IS ↑ | FID ↓ | Recall ↑ |
|---|---:|---:|---:|---:|
| **GAN (One-Step Generation)** | | | | |
| SNGAN | 1 | 8.22 | 21.7 | 0.44 |
| StyleGAN2 | 1 | 9.18 | 8.32 | 0.41 |
| StyleGAN-XL | 1 | - | 1.85 | 0.47 |
| StyleGAN2 + ADA | 1 | 9.40 | 2.92 | 0.49 |
| StyleGAN2 + DiffAug | 1 | 9.40 | 5.79 | 0.42 |
| TransGAN + DiffAug | 1 | 9.02 | 9.26 | 0.41 |
| **GAN with U-Net (One-step Generation)** | | | | |
| TDPM (T=1) | 1 | 8.65 | 8.91 | 0.46 |
| Denoising Diffusion GAN (T=1) | 1 | 8.93 | 14.6 | 0.19 |
| **ODE (One Step Generation, N=1)** | | | | |
| DDIM Distillation | 1 | 8.36 | 9.36 | 0.51 |
| NCSN++ (VE ODE) (+Distill) | 1 | 1.18 (2.57) | 461 (254) | 0.0 (0.0) |
| Progressive | 1 | - | 9.12 | - |
| DDIM | 1 | - | >20 | - |
| **ODE (Full Simulation, RK45 / Adaptive N)** | | | | |
| NCSN++ (VE ODE) | 176 | 9.35 | 5.38 | 0.56 |
| **SDE (Full Simulation, Euler)** | | | | |
| DDPM | 1000 | 9.46 | 3.21 | 0.57 |
| NCSN++ (VE SDE) | 2000 | 9.83 | 2.38 | 0.59 |
| **ODE (Full Simulation, Euler)** | | | | |
| DDIM | 10 | - | 13.36 | - |
| DDIM | 100 | - | 4.16 | - |

서로 다른 구조의 문헌 결과 중 one-step FID는 SNGAN 21.7, StyleGAN2 8.32, StyleGAN-XL 1.85, StyleGAN2+ADA 2.92, StyleGAN2+DiffAug 5.79, TDPM 8.91, DDIM Distillation 9.36이다. 2-Rectified Flow+Distill의 4.85는 여러 one-step 기준보다 낮지만 StyleGAN-XL과 StyleGAN2+ADA보다는 높다. Architecture와 학습 recipe가 다르므로 이 비교는 통제된 순위라기보다 one-step rectified flow가 문헌의 실용적 FID 범위에 들어오는지를 보여준다.

VE ODE는 RK45 176 NFE에서 FID 5.38이지만 one-step FID는 461이고 distillation 후에도 254다. DDIM은 10-step FID 13.36에서 100-step FID 4.16으로 개선된다. 이 대비는 곡률과 비상수 속도 schedule이 low-NFE 생성의 병목이 될 수 있다는 문제의식을 뒷받침한다.

![적은 Euler step에서 Rectified Flow와 기존 ODE의 비교](/assets/img/posts/rectified-flow/figure10.jpg){: w="700" }
_그림 4. VE·VP·sub-VP ODE와 달리 2-Rectified Flow가 1~3 step에서도 식별 가능한 이미지를 생성하는지를 비교한다._

## AFHQ Cat과 domain adaptation

AFHQ Cat 결과는 다음과 같다.

| Method | NFE | FID ↓ |
|---|---:|---:|
| 1-Rectified Flow (+Distill) | 1 | 227.82 (25.38) |
| 2-Rectified Flow (+Distill) | 1 | 167.79 (28.60) |
| 1-Rectified Flow | 201 | 13.71 |
| 2-Rectified Flow | 166 | 20.67 |

Full simulation에서는 1-Rectified Flow가 FID 13.71로 더 좋지만 201 NFE를 사용하고, 2-Rectified Flow는 166 NFE에서 FID 20.67이다. Distillation된 one-step 결과도 1-Rectified Flow의 25.38이 2-Rectified Flow의 28.60보다 낮다. Straightness의 이론적 개선과 최종 distillation FID의 단조 개선은 같은 주장이 아니다.

Domain adaptation 결과는 다음과 같다.

| Dataset | ERM | IRM | ARM | Mixup | MLDG | CORAL | Ours |
|---|---:|---:|---:|---:|---:|---:|---:|
| OfficeHome | 66.5 ± 0.3 | 64.3 ± 2.2 | 64.8 ± 0.3 | 68.1 ± 0.3 | 66.8 ± 0.6 | 68.7 ± 0.3 | 69.2 ± 0.5 |
| DomainNet | 40.9 ± 0.1 | 33.9 ± 2.8 | 35.5 ± 0.2 | 39.2 ± 0.1 | 41.2 ± 0.1 | 41.5 ± 0.2 | 41.4 ± 0.1 |

OfficeHome에서 Ours는 $69.2\pm0.5$로 표에서 가장 높다. DomainNet에서는 $41.4\pm0.1$로 CORAL의 $41.5\pm0.2$보다 0.1 낮다. 두 데이터셋에서 모두 최고라고 말할 수는 없지만, 같은 rectified-flow 원리가 feature-domain transfer에서도 경쟁 가능한 결과를 낸다.

## 무엇이 성능을 만들었나

CIFAR10에서 reflow와 distillation의 역할이 분리되어 나타난다. 직접 one-step FID는 1-Rectified Flow의 378에서 2-Rectified Flow의 12.21로 낮아지고, distillation 후 4.85가 된다.

- Reflow는 이전 ODE가 만든 coupling으로 target을 재구성해 조건부 속도 분산과 궤적 굽음을 줄인다.
- Distillation은 직선화된 endpoint displacement를 $t=0$의 단일 update로 압축한다.

Figure 5에서는 $N\lesssim80$인 구간에서 reflow 단계가 증가할수록 FID와 Recall이 개선된다. 충분히 많은 step보다 거친 discretization에서 효과가 두드러진다. 부록 Figure 11~13에서도 VP·sub-VP ODE의 굽은 궤적과 한 번의 reflow 후 거의 직선에 가까워진 rectified-flow 궤적을 비교한다.

Figure 14는 2-hidden-layer, hidden size 64인 네트워크에서 L2 regularization과 kernel bandwidth $h$에 따른 trajectory fitting을 보여준다. Toy 실험의 relative transport cost는 이산 L2 OT 해와 비교해 계산하지만, 고차원에서는 임의의 속도장에도 이 값이 0이 될 수 있다. 이 지표만으로 고차원 OT coupling을 찾았다고 판단해서는 안 된다.

결과를 만든 핵심은 U-Net이나 Adam 자체보다 다음 연결에 있다.

1. 선형 endpoint interpolation을 조건부 속도 회귀로 바꾸어 주변분포 보존 ODE를 얻는다.
2. 그 ODE의 coupling으로 다시 학습해 $V$와 $S$를 줄인다.
3. 직선화된 endpoint displacement를 one-step map으로 distill한다.

첫 flow의 full simulation 품질은 이미 좋지만 one-step에서는 무너진다. Reflow가 바꾸는 것은 주로 모델의 표현력보다 coupling과 수치 적분 난이도다.

## 생성 밖의 활용

Figure 15는 비자연스럽게 이어 붙인 고양이 이미지 $z_1$을 역방향 ODE로 보내 잠재 코드 $z_0$를 얻은 뒤, 이를 기준분포의 높은 확률 영역으로 이동시키는 편집을 보여준다. 결정론적 방법은

$$
z_0'=\alpha z_0,\qquad \alpha\in(0,1)
$$

이고 확률론적 방법은

$$
z_0'=\alpha z_0+\sqrt{1-\alpha^2}\xi,
\qquad \xi\sim\mathcal N(0,I)
$$

이다. 수정된 $z_0'$를 정방향 ODE로 보내 자연스러운 이미지 $z_1'$을 얻는다.

Figure 16~17은 두 잠재 코드를

$$
\sqrt{\alpha}z_0+\sqrt{1-\alpha}z_1
$$

로 보간한다. Figure 19는 역방향 ODE로 얻은 잠재 코드를 정방향 ODE로 복원하는 embedding·reconstruction을 보여주고, Figure 21은 $N=100$에서 여러 도메인 사이의 translation trajectory를 제시한다.

이 결과는 같은 양방향 ODE를 generation, inversion, reconstruction, interpolation, unpaired translation에 사용할 수 있음을 보여준다. 다만 편집 결과는 주로 시각적으로 제시되므로 생성 FID의 비교 우위를 편집 품질이나 정체성 보존의 정량적 우위로 확대해서는 안 된다.

## 비용과 경량화 관점

Rectified flow의 직접적인 경량화 대상은 파라미터 수가 아니라 NFE다. CIFAR10에서 SDE full simulation은 2,000 Euler step, ODE full simulation은 104~176 NFE를 사용하지만 reflow와 distillation을 결합하면 NFE 1에서 FID 4.85를 얻는다. 반복적인 U-Net 호출이 지연과 처리량의 병목인 환경에서는 한 번의 호출로 압축할 수 있다는 점이 중요하다.

모델 파라미터 수가 줄었다는 근거는 없다. 같은 계열의 DDPM++·NCSN++ 속도 네트워크를 적게 호출하는 방식이므로 parameter memory가 감소한다고 말할 수 없다. 여러 step의 activation을 순차적으로 폐기할 수 있는 추론에서는 NFE 감소가 peak activation memory와 같은 비율로 이어지는 것도 아니다.

추론 비용 감소는 추가 학습 비용과 교환된다. Reflow마다 현재 ODE를 시뮬레이션해 paired endpoints를 생성하고 새 모델을 fine-tuning해야 한다. CIFAR10에서는 400만 쌍 생성과 30만 step 학습이 추가되며 마지막 distillation도 필요하다. 비용을 제거했다기보다 반복 추론 비용 일부를 사전 계산과 학습으로 옮긴 셈이다.

품질과 NFE 사이의 선택도 남는다. CIFAR10에서 1-Rectified Flow full simulation은 127 NFE에서 FID 2.58이고, 2-Rectified Flow+Distill은 1 NFE에서 FID 4.85다. AFHQ Cat에서도 full simulation FID 13.71과 one-step distillation FID 25.38 사이에 차이가 있다. 배포 목표가 최소 지연인지 최고 품질인지에 따라 선택점이 달라진다.

후속 경량화 문제는 여기서 자연스럽게 나온다. Low-NFE 품질을 유지하면서 reflow용 endpoint 생성과 추가 학습을 줄이거나, 직선화된 flow를 더 안정적으로 one-step에 압축해야 한다.

## 한계와 해석

첫째, reflow에는 추정 오차가 누적될 수 있다. 이론은 정확한 조건부 속도장 $v^X$를 전제로 하지만 실제 모델은 유한한 데이터와 네트워크로 이를 근사한다. 이전 근사 ODE의 출력을 다음 학습분포로 사용하므로 지나친 반복은 오차까지 coupling에 반영할 수 있다.

둘째, 비선형 rectified flow는 주변분포를 보존하지만 일반 convex transport-cost 감소와 reflow straightening을 보장하지 않는다. PF-ODE를 Eq. 8의 공통 형식으로 표현할 수 있다는 사실과 선형 rectified flow의 효율 보장을 공유한다는 주장은 구분해야 한다.

셋째, 고차원의 straight coupling은 특정 비용의 최적 coupling이라는 보장이 없다. Quadratic OT가 직접적인 목표라면 gradient field 제약 같은 별도 구조가 필요하다.

넷째, 비유클리드 기하나 경로 제약은 다루지 않는다. 데이터가 manifold에 놓여 있거나 중간 상태가 특정 제약을 만족해야 한다면 유클리드 선형 보간이 의미 있는 경로를 만들지 않을 수 있다. Rectified flow는 선택한 보간 프로세스의 주변분포를 보존하므로, 보간 자체가 off-manifold 상태를 포함하면 ODE도 그 중간 분포를 따른다.

다섯째, 훈련점과 rollout 상태의 오차 분포가 다를 수 있다. Eq. 1은 독립적으로 표본화한 $X_t$에서 평균 회귀 오차를 줄이지만 solver는 자신의 이전 출력 위에서 속도장을 반복 평가한다. Reflow는 이전 모델이 실제로 방문한 상태를 다음 학습에 포함하지만, 동시에 이전 모델의 오차도 전달한다.

Rectified flow의 중요한 관점 전환은 생성 모델의 경량화를 파라미터 수만의 문제로 보지 않는 데 있다. 먼저 endpoint를 연결하는 coupling을 바꾸고, 그 coupling의 ODE 궤적을 적분하기 쉬운 형태로 만든 뒤, 마지막에 한 번의 update로 압축한다. Full simulation 품질과 low-NFE 품질이 다른 문제라는 점을 수식과 실험 양쪽에서 드러낸 것이 이 논문의 핵심이다.

