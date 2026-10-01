---
title: "Auto-Encoding Variational Bayes"
date: 2026-08-25 21:00:00 +0900
permalink: /posts/auto-encoding-variational-bayes/
categories:
  - AI
  - Paper Review
tags: [paper-review, vae, variational-inference, reparameterization, generative-model]
description: "사후분포를 인식 모델로 근사하고 재매개변수화로 하한을 미분 가능하게 만든 VAE 원논문을 정리한다. 주변 우도에서 ELBO를 유도하는 과정과 가우시안 VAE의 구체화, Full VB 확장까지 따라간다."
related: [ldm, vqgan, ddpm]
paper:
  authors: "Diederik P. Kingma, Max Welling"
  venue: "ICLR 2014 (읽은 판본은 arXiv 1312.6114v11, 2022 개정)"
  arxiv: "https://arxiv.org/abs/1312.6114"
---

## 세 줄 요약

Auto-Encoding Variational Bayes(AEVB)는 다루기 어려운 사후분포를 인식 모델(recognition model)로 근사하고, 변분 하한(variational lower bound)을 재매개변수화해 표준 확률적 경사법으로 학습한다. 핵심은 잠재변수 샘플링을 파라미터와 독립적인 노이즈의 미분 가능한 변환으로 바꾸어, 높은 분산을 갖는 naïve gradient estimator를 피하는 데 있다. 연속 잠재변수를 갖는 i.i.d. 데이터에서는 이 구조가 확률적 인코더와 디코더를 함께 학습하는 variational auto-encoder(VAE)로 구체화된다.

## 이 논문이 풀려는 문제

잠재변수 모델에서 관측값 $x$의 주변 우도는 잠재변수 $z$를 적분해야 얻는다.

$$
p_\theta(x)=\int p_\theta(x,z)\,dz
$$

문제는 이 적분이 일반적으로 계산 불가능하다는 데서 시작한다. 주변 우도 자체를 평가하거나 미분할 수 없고, 참 사후분포 $p_\theta(z|x)$도 계산할 수 없다. 따라서 참 사후분포를 사용하는 EM 알고리즘을 그대로 적용할 수 없다. 평균장 변분 베이즈(mean-field variational Bayes)로 방향을 바꾸어도 필요한 기댓값을 분석적으로 풀어야 하는데, 일반적인 모델에서는 그 적분 역시 다루기 어렵다.

데이터 규모가 커지면 계산 문제는 한층 더 분명해진다. 전체 데이터셋을 매번 사용하는 배치 최적화는 비싸고, Monte Carlo EM과 같은 샘플링 기반 해법은 데이터포인트마다 비용이 큰 내부 샘플링 루프를 요구한다. 데이터가 많을수록 단순히 모델의 우도만 정의하는 것으로는 부족하며, 미니배치 단위로 학습 가능한 추정기가 필요하다.

근사 사후분포 $q_\phi(z|x)$를 도입한 뒤에도 경사를 어떻게 구할지가 남는다. 다음과 같은 score-function 형태의 naïve Monte Carlo 추정기는 이론적으로 경사를 표현하지만 분산이 매우 크다.

$$
\nabla_\phi \mathbb{E}_{q_\phi(z)}[f(z)]
\simeq
\frac{1}{L}\sum_{l=1}^{L}
f(z)\nabla_\phi\log q_\phi(z^{(l)})
$$

이 식에서는 목적 함수 항 $f(z)$가 샘플별 확률 점수 $\nabla_\phi\log q_\phi(z^{(l)})$에 곱해진다. 목적 함수 값과 점수가 확률적 표본에 따라 함께 흔들리므로 실용적인 최적화에 쓰기 어려울 정도로 분산이 커질 수 있다. AEVB의 재매개변수화(reparameterization)는 무작위성을 $z$ 자체에서 파라미터와 독립적인 보조 노이즈 $\epsilon$으로 옮긴다. 그러면 샘플링된 계산 경로를 따라 $f$를 직접 미분할 수 있다.

이 설계는 세 문제를 동시에 겨냥한다.

1. 생성 모델 파라미터 $\theta$에 대한 효율적인 approximate ML 또는 MAP 추정
2. 관측값 $x$가 주어졌을 때 잠재변수 $z$에 대한 효율적인 approximate posterior inference
3. 관측변수 $x$에 관한 효율적인 approximate marginal inference

AEVB와 비교되는 wake-sleep 알고리즘은 두 목적 함수를 동시에 최적화하며, 그 두 목적을 합쳐도 주변 우도나 그 하한 하나를 최적화하는 것으로 해석되지 않는다. 반면 AEVB는 명시적인 변분 하한을 공통 목적으로 사용한다. 다만 wake-sleep은 이 논문의 재매개변수화가 전제하는 연속 잠재변수뿐 아니라 이산 잠재변수에도 적용할 수 있고, 데이터포인트당 계산 복잡도가 AEVB와 같다는 장점이 있다. 두 방법의 차이는 단순한 계산량보다 최적화 대상과 적용 가능한 잠재변수의 범위에 있다.

## 핵심 아이디어

AEVB의 본질은 샘플을 없애는 것이 아니라 샘플링을 미분 가능한 계산 그래프 안으로 옮기는 것이다. 근사 사후분포에서 직접 $z\sim q_\phi(z|x)$를 뽑는 대신, 파라미터와 독립적인 $\epsilon\sim p(\epsilon)$을 뽑고 $z=g_\phi(\epsilon,x)$로 만든다. 무작위성은 $\epsilon$에 남지만, $\phi$가 $z$에 미치는 영향은 $g_\phi$라는 명시적인 경로로 드러난다.

연속 잠재변수를 갖는 i.i.d. 데이터에서는 데이터포인트마다 별개의 변분 파라미터를 반복 최적화하는 대신, $x$를 입력받아 근사 사후분포의 파라미터를 출력하는 확률적 인코더 $q_\phi(z|x)$를 학습한다. 이 인식 모델은 참 사후분포 $p_\theta(z|x)$를 빠르게 근사한다. 디코더 $p_\theta(x|z)$는 잠재변수에서 관측값의 분포 파라미터를 계산한다.

논문에서 제시한 VAE 예시는 다음과 같이 구체화된다.

- 사전분포는 $p_\theta(z)=\mathcal{N}(z;\mathbf 0,\mathbf I)$이다.
- 인코더는 대각 공분산을 갖는 다변량 정규분포 $q_\phi(z|x)$의 평균과 표준편차를 출력한다.
- 디코더는 이진 데이터에는 베르누이 분포, 실수 데이터에는 다변량 정규분포의 파라미터를 출력한다.
- 인코더와 디코더는 각각 하나의 은닉층을 갖는 완전연결 MLP로 구성된다.

가우시안 사전분포, 대각 가우시안 인코더, 단일 은닉층 MLP는 일반 AEVB에 필수적인 조건이 아니라 논문이 다룬 VAE 예시의 단순화된 선택이다. 더 일반적인 AEVB에서 핵심 조건은 $q_\phi(z|x)$의 샘플을 미분 가능한 변환으로 나타낼 수 있다는 점이다.

## 방법 — 주변 우도에서 학습 가능한 하한까지

### 주변 우도와 변분 하한

데이터포인트 $x^{(i)}$에 대해 Eq. 1은 주변 로그 우도를 두 항으로 분해한다.

$$
\log p_\theta(x^{(i)})
=
D_{KL}\left(
q_\phi(z|x^{(i)})
\|\|
p_\theta(z|x^{(i)})
\right)
+
\mathcal{L}(\theta,\phi;x^{(i)})
\tag{1}
$$

첫 항은 근사 사후분포와 참 사후분포 사이의 KL divergence다. 두 번째 항 $\mathcal{L}$은 변분 하한이다. 이 식은 근사 사후분포가 참 사후분포와 일치할수록 하한이 주변 로그 우도에 가까워진다는 관계를 보여준다.

KL divergence는 음수가 아니므로 Eq. 1에서 곧바로 Eq. 2가 나온다.

$$
\log p_\theta(x^{(i)})
\ge
\mathcal{L}(\theta,\phi;x^{(i)})
=
\mathbb{E}_{q_\phi(z|x)}
\left[
-\log q_\phi(z|x)+\log p_\theta(x,z)
\right]
\tag{2}
$$

이 하한을 최대화하면 두 효과가 함께 생긴다. $\theta$는 관측 데이터를 잘 설명하도록 갱신되고, $\phi$는 하한과 실제 주변 로그 우도 사이의 KL 간격을 줄이는 방향으로 갱신된다. 참 사후분포를 직접 계산하지 않으면서도 인식 모델을 학습할 수 있는 이유가 여기에 있다.

결합분포를 $p_\theta(x,z)=p_\theta(x|z)p_\theta(z)$로 전개하면 Eq. 3을 얻는다.

$$
\mathcal{L}(\theta,\phi;x^{(i)})
=
-D_{KL}\left(
q_\phi(z|x^{(i)})\|\|p_\theta(z)
\right)
+
\mathbb{E}_{q_\phi(z|x^{(i)})}
\left[
\log p_\theta(x^{(i)}|z)
\right]
\tag{3}
$$

첫 항은 근사 사후분포가 사전분포에서 지나치게 벗어나지 않게 하는 정규화 항이다. 이 항을 빼면 각 입력을 재구성하는 데만 유리한 잠재 표현을 만들 수 있지만, 잠재공간 전체를 사전분포에서 샘플링해 생성하는 구조와의 연결이 사라진다. 두 번째 항은 기대 로그 우도이며, 오토인코더 관점에서는 기대 음의 재구성 오차에 대응한다. 이 항이 없으면 잠재변수가 입력을 설명해야 할 이유가 없다.

따라서 Eq. 3은 재구성 품질과 사전분포에 맞춘 잠재공간 사이의 트레이드오프를 하나의 하한 안에 배치한다. 하한의 정규화 효과가 잠재변수 수 증가를 곧바로 과적합으로 이어지지 않게 했다는 실험 결과도 이 구조와 연결된다.

### 재매개변수화가 바꾸는 미분 경로

Eq. 4는 근사 사후분포의 샘플을 보조 노이즈의 변환으로 표현한다.

$$
\tilde z=g_\phi(\epsilon,x),
\qquad
\epsilon\sim p(\epsilon)
\tag{4}
$$

여기서 $p(\epsilon)$은 $\phi$에 의존하지 않는다. 따라서 $\phi$를 바꾸었을 때 샘플 $z$가 어떻게 변하는지가 $g_\phi$를 통해 명시적으로 나타난다. 이 치환의 이점은 샘플링 연산을 제거하는 것이 아니라, 샘플링 때문에 끊겼던 미분 경로를 복원하는 데 있다.

변수 치환을 기대값에 적용하면 Eq. 5가 된다.

$$
\begin{aligned}
\mathbb{E}_{q_\phi(z|x^{(i)})}[f(z)]
&=
\mathbb{E}_{p(\epsilon)}
\left[
f(g_\phi(\epsilon,x^{(i)}))
\right] \\
&\simeq
\frac{1}{L}\sum_{l=1}^{L}
f(g_\phi(\epsilon^{(l)},x^{(i)})),
\qquad
\epsilon^{(l)}\sim p(\epsilon)
\end{aligned}
\tag{5}
$$

왼쪽에서는 적분 분포 자체가 $\phi$에 의존하지만, 오른쪽에서는 고정된 노이즈 분포 아래에서 미분 가능한 함수의 기댓값을 구한다. Monte Carlo 근사에서 포기하는 것은 기댓값의 정확한 적분이며, 대신 $L$개 샘플의 평균을 사용한다. 샘플 수가 유한하므로 추정 오차는 남지만, naïve estimator처럼 $f(z)$와 score function을 곱하는 형태를 피할 수 있다.

재매개변수화 뒤에는 $\epsilon$을 고정한 표본 경로마다 $g_\phi$를 통해 $\phi$에 대한 미분을 전달할 수 있다. 즉 분포 파라미터가 변할 때 표본 위치가 어떻게 이동하는지를 계산 그래프가 직접 표현한다. 이것이 표준 확률적 경사법을 그대로 사용할 수 있게 하는 핵심이며, 인코더의 파라미터와 디코더의 파라미터를 하나의 하한에서 함께 학습하게 한다.

논문은 $g_\phi$를 구성하는 세 전략을 제시한다.

1. 역누적분포함수(inverse CDF)를 직접 계산할 수 있는 경우: Exponential, Cauchy 등이 여기에 해당한다.
2. 위치-척도 계열(location-scale family): Laplace, Gaussian, Uniform 등에 대해 $g(\epsilon)=\text{location}+\text{scale}\cdot\epsilon$ 형태를 사용한다.
3. 조합(composition): Log-Normal, Gamma, Dirichlet 등 더 복잡한 변수를 재매개변수화 가능한 구성 요소의 조합으로 표현한다.

세 접근이 모두 실패할 때도 PDF를 계산하는 것과 비슷한 시간 복잡도를 요구하는 inverse CDF 근사법을 사용할 수 있다고 설명한다. 따라서 재매개변수화는 가우시안 하나에만 묶인 아이디어가 아니지만, 분포별로 미분 가능한 샘플 생성 경로를 확보해야 한다.

### 두 가지 SGVB 추정기

Eq. 2 전체에 Eq. 5를 적용하면 일반적인 stochastic gradient variational Bayes(SGVB) 추정기인 Eq. 6을 얻는다.

$$
\tilde{\mathcal{L}}^A(\theta,\phi;x^{(i)})
=
\frac{1}{L}\sum_{l=1}^{L}
\left[
\log p_\theta(x^{(i)},z^{(i,l)})
-
\log q_\phi(z^{(i,l)}|x^{(i)})
\right]
\tag{6}
$$

$$
z^{(i,l)}=g_\phi(\epsilon^{(i,l)},x^{(i)}),
\qquad
\epsilon^{(i,l)}\sim p(\epsilon)
$$

이 형태는 결합 로그 확률과 근사 사후 로그 확률을 모두 샘플로 평가한다. 두 항을 함께 사용해야 하한이 된다. $-\log q_\phi$ 항을 빠뜨리면 근사분포의 엔트로피에 해당하는 보상이 사라져 원래의 변분 목적과 다른 값을 최적화하게 된다.

KL divergence를 분석적으로 적분할 수 있다면 Eq. 3에서 KL 항은 정확히 계산하고 기대 로그 우도만 샘플링할 수 있다.

$$
\tilde{\mathcal{L}}^B(\theta,\phi;x^{(i)})
=
-D_{KL}\left(
q_\phi(z|x^{(i)})\|\|p_\theta(z)
\right)
+
\frac{1}{L}\sum_{l=1}^{L}
\log p_\theta(x^{(i)}|z^{(i,l)})
\tag{7}
$$

Eq. 7은 Eq. 6보다 분산이 낮다. KL 항의 Monte Carlo 오차를 제거하고 재구성 항에만 샘플링을 남겼기 때문이다. 계산 가능한 부분까지 굳이 확률적으로 추정하지 않는 것이 분산 감소의 핵심이다. 재매개변수화와 분석적 KL은 서로 다른 역할을 맡는다. 전자는 샘플 경로를 미분 가능하게 만들고, 후자는 이미 정확히 적분할 수 있는 항에서 표본 오차를 제거한다.

전체 데이터셋 크기가 $N$이고 미니배치 크기가 $M$일 때 Eq. 8은 데이터포인트별 하한을 미니배치에서 합한 뒤 $N/M$을 곱한다.

$$
\mathcal{L}(\theta,\phi;X)
\simeq
\tilde{\mathcal{L}}^M(\theta,\phi;X^M)
=
\frac{N}{M}\sum_{i=1}^{M}
\tilde{\mathcal{L}}(\theta,\phi;x^{(i)})
\tag{8}
$$

$N/M$은 미니배치 합을 전체 데이터 합의 규모로 맞추는 항이다. 이를 빠뜨리면 데이터 우도 항과 데이터셋 전체에 한 번 적용되는 다른 항을 결합할 때 상대적인 크기가 달라질 수 있다. 논문의 Algorithm 1은 이 추정기의 $\nabla_{\theta,\phi}$를 계산하고 SGD나 Adagrad 같은 표준 최적화로 두 파라미터 집합을 함께 갱신한다.

## 가우시안 VAE로 구체화하기

### 대각 가우시안 인코더

VAE 예시에서 인코더는 Eq. 9의 분포를 출력한다.

$$
\log q_\phi(z|x^{(i)})
=
\log\mathcal{N}
\left(
z;\mu^{(i)},\sigma^{2(i)}\mathbf I
\right)
\tag{9}
$$

대각 공분산 가정은 잠재 차원별 평균과 분산만 예측하면 되게 한다. 인코더 MLP는 입력마다 $\mu^{(i)}$와 $\sigma^{(i)}$를 계산하고, 샘플은 위치-척도 재매개변수화로 만든다.

$$
z^{(i,l)}
=
\mu^{(i)}
+
\sigma^{(i)}\odot\epsilon^{(l)},
\qquad
\epsilon^{(l)}\sim\mathcal{N}(0,\mathbf I)
$$

사전분포도 표준 정규분포이므로 KL 항을 분석적으로 계산할 수 있다. Eq. 7에 이 결과를 넣으면 Eq. 10이 된다.

$$
\begin{aligned}
\mathcal{L}(\theta,\phi;x^{(i)})
\simeq\;&
\frac{1}{2}\sum_{j=1}^{J}
\left(
1+\log((\sigma_j^{(i)})^2)
-(\mu_j^{(i)})^2
-(\sigma_j^{(i)})^2
\right) \\
&+
\frac{1}{L}\sum_{l=1}^{L}
\log p_\theta(x^{(i)}|z^{(i,l)})
\end{aligned}
\tag{10}
$$

첫 줄은 $-D_{KL}(q_\phi(z|x^{(i)})\|\|p_\theta(z))$다. 평균 제곱 항은 잠재 평균이 원점에서 멀어지는 것을, 분산 항은 분산이 사전분포의 단위 분산에서 벗어나는 것을 제약한다. $\log((\sigma_j^{(i)})^2)$ 항은 분산을 무조건 작게 만드는 방향과 균형을 이룬다. 둘째 줄은 디코더의 로그 우도다. 인코더가 만든 잠재변수가 관측값을 설명하도록 만드는 데이터 적합 항이다.

### KL 항의 해석적 유도

부록의 두 적분을 결합하면 Eq. 10의 첫 항이 왜 그 형태인지 확인할 수 있다. $p(z)=\mathcal N(0,\mathbf I)$이고 $q(z)=\mathcal N(\mu,\sigma^2\mathbf I)$일 때 사전분포에 대한 기대 로그 확률은 다음과 같다.

$$
\int q_\theta(z)\log p(z)\,dz
=
-\frac{J}{2}\log(2\pi)
-\frac{1}{2}\sum_{j=1}^{J}
\left((\mu_j)^2+(\sigma_j)^2\right)
$$

반면 근사 사후분포의 기대 로그 밀도는

$$
\int q_\theta(z)\log q_\theta(z)\,dz
=
-\frac{J}{2}\log(2\pi)
-\frac{1}{2}\sum_{j=1}^{J}
\left(1+\log((\sigma_j)^2)\right)
$$

이다. $-D_{KL}(q\|\|p)$는 첫 적분에서 두 번째 적분을 빼는 형태다. 두 식에 공통인 $-\frac{J}{2}\log(2\pi)$가 소거되고 차원별 항만 남는다.

$$
-D_{KL}(q_\phi(z)\|\|p_\theta(z))
=
\frac{1}{2}\sum_{j=1}^{J}
\left(
1+\log((\sigma_j)^2)-(\mu_j)^2-(\sigma_j)^2
\right)
$$

여기서는 근사를 사용하지 않는다. 대각 가우시안 근사 사후분포와 표준 가우시안 사전분포라는 가정 덕분에 KL을 정확히 적분한다. Eq. 10에서 확률적으로 추정하는 부분은 디코더 로그 우도의 기댓값뿐이다. 이 가정을 다른 분포로 바꾸면 같은 닫힌형식이 유지된다는 보장은 없으며, 그 경우 일반 추정기 Eq. 6이나 해당 분포에 맞는 다른 해석적 계산이 필요하다.

### 베르누이 디코더와 가우시안 디코더

이진 관측값에 대한 디코더는 Eq. 11의 다변량 베르누이 로그 우도를 사용한다.

$$
\log p(x|z)
=
\sum_{i=1}^{D}
\left[
x_i\log y_i
+
(1-x_i)\log(1-y_i)
\right]
\tag{11}
$$

$$
y=f_\sigma\left(
W_2\tanh(W_1z+b_1)+b_2
\right)
$$

단일 은닉층 MLP가 잠재변수 $z$를 베르누이 확률 $y$로 변환한다. 각 차원의 두 항은 $x_i=1$인 경우와 $x_i=0$인 경우의 로그 확률을 각각 담당한다. 이 식이 Eq. 10의 $\log p_\theta(x|z)$ 자리에 들어가므로, 별도의 재구성 손실을 임의로 추가하는 것이 아니라 선택한 관측분포의 로그 우도를 최대화한다.

실수 관측값에는 Eq. 12의 다변량 정규분포를 사용한다.

$$
\log p(x|z)
=
\log\mathcal{N}(x;\mu,\sigma^2\mathbf I)
\tag{12}
$$

$$
\mu=W_4h+b_4,
\qquad
\log\sigma^2=W_5h+b_5,
\qquad
h=\tanh(W_3z+b_3)
$$

이 경우 디코더는 평균뿐 아니라 로그 분산도 출력한다. 인코더로 사용할 때는 Eq. 12에서 $x$와 $z$의 역할을 교환한다. Frey Face 실험의 가우시안 디코더에서는 평균이 $(0,1)$에 있도록 sigmoid activation으로 제약했다.

관측분포의 선택은 Eq. 3의 문제 정의와 직접 연결된다. 인코더와 KL 항이 잠재공간의 형태를 정한다면, 디코더의 확률분포는 무엇을 데이터 적합으로 간주할지를 정한다. 따라서 베르누이와 가우시안 디코더는 같은 네트워크 출력에 임의의 손실을 붙인 두 구현이 아니라, 서로 다른 조건부 우도 $p_\theta(x|z)$를 정의한 두 생성 모델이다.

## 구현 관점에서

### 미니배치 학습 루프

Algorithm 1과 Eq. 8을 텐서 연산으로 옮기면 다음과 같은 구조가 된다. 특정 라이브러리 API가 아니라 계산 순서를 나타내는 의사코드다.

```python
# X: 전체 데이터, shape (N, D)
# encoder(x) -> mu, sigma, each shape (M, J)
# decoder_log_prob(x, z) -> log p_theta(x|z), shape (L, M)

for each optimization_step:
    x = sample_minibatch(X, size=M)            # (M, D)

    mu, sigma = encoder(x)                     # (M, J), (M, J)
    epsilon = sample_standard_normal(L, M, J) # (L, M, J)

    z = mu[None, :, :] + sigma[None, :, :] * epsilon
                                                # (L, M, J)

    log_px_given_z = decoder_log_prob(x, z)   # (L, M)
    reconstruction = mean(log_px_given_z, axis=0)
                                                # (M,)

    negative_kl = 0.5 * sum(
        1 + log(sigma**2) - mu**2 - sigma**2,
        axis=-1,
    )                                           # (M,)

    elbo_per_item = negative_kl + reconstruction
                                                # (M,)
    minibatch_elbo = (N / M) * sum(elbo_per_item)
                                                # scalar

    gradient = grad(minibatch_elbo, theta, phi)
    theta, phi = optimizer_ascent(theta, phi, gradient)
```

논문의 실험에서는 $M=100$, $L=1$을 사용했다. $L=1$이면 샘플 차원은 크기가 1이지만, 구현에서 그 축을 명시적으로 유지하면 여러 샘플로 확장할 때 데이터 축과 잠재 축을 혼동하기 어렵다.

목적은 하한을 최대화하는 것이다. 일반적인 최소화 인터페이스를 사용한다면 부호를 뒤집어 $-\tilde{\mathcal L}^M$을 손실로 사용해야 한다. 특히 Eq. 10의 첫 항은 이미 음의 KL이므로, 이를 다시 양의 KL처럼 더하면 정규화 방향이 반대가 된다.

### 일반 SGVB와 분석적 KL의 분기

KL을 닫힌형식으로 계산할 수 없는 분포에서는 Eq. 6을 그대로 구현해야 한다.

```python
# x: (M, D)
# z: (L, M, J)
log_joint = log_p_theta_xz(x, z)       # (L, M)
log_q = log_q_phi_z_given_x(z, x)      # (L, M)

elbo_per_item = mean(log_joint - log_q, axis=0)
                                           # (M,)
```

가우시안 예시처럼 KL을 분석적으로 계산할 수 있다면 Eq. 7과 Eq. 10의 분해를 사용하는 편이 분산이 낮다. 두 구현을 섞어 KL을 분석적으로 더하면서 `log_joint - log_q`까지 사용하면 같은 정규화 효과를 중복 계산하게 된다.

Eq. 6과 Eq. 7의 분기는 단순한 코드 최적화가 아니다. 어떤 항을 Monte Carlo로 근사했고 어떤 항을 정확히 계산했는지를 결정하는 수학적 선택이다. 손실 함수 구현을 검증할 때는 최종 스칼라 값만 볼 것이 아니라, 샘플링되는 항과 분석적으로 계산되는 항이 유도식과 일치하는지 확인해야 한다.

### 학습, 추론, 생성은 같은 루프가 아니다

학습할 때는 $x$가 주어지고 인코더를 통해 $q_\phi(z|x)$에서 잠재 샘플을 만든다.

```text
x
→ encoder
→ (mu, sigma)
→ epsilon을 이용해 z 재매개변수화
→ decoder가 log p(x|z) 계산
→ KL + 기대 로그 우도로 theta와 phi 갱신
```

관측값의 잠재 표현을 추론할 때도 $x\to q_\phi(z|x)$ 경로를 사용하지만, 파라미터를 갱신할 필요는 없다. 반면 새로운 데이터를 생성할 때는 인코더를 통과하지 않는다.

```python
z = sample_standard_normal(B, J)  # (B, J), z ~ p_theta(z)
x = sample_from_decoder(z)        # (B, D), x ~ p_theta(x|z)
```

즉 학습 중의 $z$는 근사 사후분포에서, 생성 중의 $z$는 사전분포에서 온다. Eq. 3의 KL 항이 필요한 실무적 이유도 여기에 있다. 학습 시 인코더가 만드는 잠재분포와 생성 시 사용하는 사전분포가 지나치게 다르면, 사전분포에서 뽑은 잠재값을 디코더가 유효한 데이터로 바꾸기 어렵다.

학습 루프에는 인코더, 재매개변수화, 디코더, KL 계산, 역전파가 모두 들어간다. 추론 루프는 입력을 조건으로 근사 사후분포를 계산하지만 학습 목적을 구성하지 않는다. 생성 루프는 입력과 인코더가 없고 사전분포에서 시작한다. 이 비대칭을 무시하면 학습 때 사용한 근사 사후 샘플을 생성 샘플로 오해하거나, 생성 시 불필요하게 인코더 입력을 요구하는 구현이 된다.

### 구현에서 틀리기 쉬운 지점

첫째, $\sigma$, $\sigma^2$, $\log\sigma^2$를 구분해야 한다. Eq. 9의 분포에는 분산 $\sigma^2$가 들어가고, Eq. 10의 KL에는 $\log\sigma^2$와 $\sigma^2$가 들어가지만, 재매개변수화에서는 표준편차 $\sigma$를 곱한다. 인코더가 내놓는 표준편차는 양수여야 한다.

둘째, 샘플 축 $L$, 미니배치 축 $M$, 잠재 축 $J$를 분리해야 한다. 재구성 로그 우도는 먼저 샘플 축에서 평균을 내고, KL은 데이터포인트별로 잠재 축을 합한다. 이 순서를 잘못 잡으면 의도하지 않은 축까지 평균되어 목적 함수의 상대 크기가 달라진다.

셋째, Eq. 8의 $N/M$ 스케일과 데이터포인트 평균을 혼용하지 않아야 한다. 전체 데이터 하한의 합을 근사하려는지, 단순히 미니배치 평균을 최적화하려는지 구현 전반에서 일관되어야 한다.

넷째, 관측분포와 디코더 출력을 맞춰야 한다. Eq. 11은 베르누이 확률 $y$를, Eq. 12는 가우시안 평균과 로그 분산을 요구한다. 두 경우 모두 Eq. 10의 재구성 항은 해당 분포의 로그 우도다.

다섯째, $L=1$은 논문 실험의 실제 설정이지만 모든 기댓값을 정확히 계산한다는 뜻은 아니다. 미니배치를 계속 바꾸고 새로운 노이즈를 샘플링하면서 확률적 경사를 누적하는 구성이다.

여섯째, 샘플 인덱스와 데이터 인덱스를 섞지 않아야 한다. $z^{(i,l)}$에서 $i$는 데이터포인트, $l$은 해당 데이터포인트에 대한 Monte Carlo 표본이다. 하나의 노이즈 표본을 미니배치 전체에 의도치 않게 공유하면 Eq. 5와 Eq. 7에서 가정한 표본 구조와 다른 추정기가 된다.

일곱째, 이 모델에는 확산 모델과 같은 시간 인덱스 $t$나 누적곱 경계 조건이 없다. 여기서 경계에 해당하는 핵심은 샘플 수와 데이터 축의 처리, 그리고 학습과 생성에서 서로 다른 분포로부터 $z$를 얻는다는 점이다. 다른 생성 모델의 샘플링 루프 구조를 그대로 가져오면 AEVB의 단일 사전 샘플 생성 경로와 맞지 않는다.

## 실험 설정

논문은 MNIST와 Frey Face에서 AEVB를 wake-sleep 및 Monte Carlo EM과 비교했다. 평가는 변분 하한과 추정 주변 우도라는 두 관점으로 이루어졌다.

| 항목 | 설정 |
|---|---|
| 데이터셋 | MNIST, Frey Face |
| 비교 방법 | Wake-sleep, Monte Carlo EM |
| 평가 지표 | Variational lower bound, estimated marginal likelihood |
| 파라미터 초기화 | 모든 파라미터를 $\mathcal N(0,0.01)$에서 샘플링 |
| 파라미터 정규화 | $p(\theta)=\mathcal N(0,\mathbf I)$에 해당하는 weight decay |
| 최적화 | Adagrad |
| global stepsize 후보 | $\{0.01,0.02,0.1\}$에서 초기 성능으로 선택 |
| 미니배치 크기 | $M=100$ |
| 데이터포인트별 샘플 수 | $L=1$ |

이 표에서 우선 읽어야 할 것은 미니배치 크기와 표본 수다. AEVB는 $M=100$인 미니배치에서 데이터포인트별 잠재 표본을 하나만 사용하면서 하한을 최적화했다. 즉 실험에서의 확장성은 큰 $L$로 기댓값을 정밀하게 적분한 결과가 아니라, 낮은 분산의 추정기를 작은 표본 수로 반복 적용한 결과다.

하한 비교 실험에서 인코더와 디코더는 MNIST에 각각 500개, Frey Face에 각각 200개의 은닉 유닛을 사용했다. 이 선택은 기존 auto-encoder 문헌을 따랐고, Frey Face에서는 과적합 방지가 고려되었다. 저자에 따르면 알고리즘 간 상대 성능은 이 은닉 유닛 선택에 크게 민감하지 않았다.

하한 비교 학습은 40 GFLOPS의 Intel Xeon CPU에서 훈련 샘플 100만 개당 20~40분이 걸렸다. 이 수치는 GPU 환경이나 다른 구현으로 일반화할 수 있는 절대 처리량이라기보다, 보고된 실험 환경에서 AEVB의 온라인 미니배치 학습 비용을 보여주는 기준이다.

주변 우도 실험에서는 인코더와 디코더에 각각 100개의 은닉 유닛을 사용하고 잠재변수를 3개로 제한했다. 더 높은 차원의 잠재공간에서는 주변 우도 추정치가 불안정해졌기 때문이다. 이는 모델 학습 자체의 잠재 차원 제한이라기보다, 사용한 주변 우도 추정 절차가 저차원에서만 안정적이었다는 제약과 연결해서 읽어야 한다.

## 실험에서 확인한 것

### 하한 최적화 성능

Figure 2에서 AEVB는 모든 비교 조건에서 wake-sleep보다 훨씬 빠르게 수렴하고 더 나은 변분 하한에 도달했다. 이 비교에서 읽어야 할 핵심은 두 방법의 데이터포인트당 계산 복잡도가 같더라도, 하나의 주변 우도 하한을 직접 최적화하는 AEVB의 경사 추정 방식이 실제 최적화 경로에서 차이를 만들었다는 점이다.

잠재변수 수를 늘려도 과적합으로 이어지지 않았으며, 저자는 이를 하한의 정규화 효과와 연결한다. 각 실험에서 추정기 분산은 1보다 작아 그림에서 생략되었다. 다만 원문에는 공식 ablation이 없으므로, 이 결과만으로 KL 항이나 재매개변수화 중 어느 요소가 얼마만큼의 개선을 만들었는지는 분리해 판단할 수 없다.

![다양한 잠재 공간 차원에서 AEVB와 wake-sleep의 하한 최적화 성능 비교](/assets/img/posts/auto-encoding-variational-bayes/figure2.png){: w="700" }
_그림 2. 동일한 데이터포인트당 복잡도를 갖는 두 방법이 실제 하한 수렴 속도와 도달점에서는 어떻게 달라지는지를 보여준다._

### 주변 우도 추정

Figure 3의 주변 우도 비교는 $N_{\text{train}}=1000$과 $N_{\text{train}}=50000$ 조건에서 수행되었다. Monte Carlo EM은 온라인 알고리즘이 아니어서 AEVB나 wake-sleep과 달리 전체 MNIST 데이터셋에 효율적으로 적용할 수 없었다. 데이터 규모가 커졌을 때 미니배치 학습 가능 여부가 단순한 구현 편의가 아니라 비교 가능한 실험 범위 자체를 결정한 셈이다.

![훈련 데이터 수에 따른 AEVB, wake-sleep, Monte Carlo EM의 주변 우도 추정치 비교](/assets/img/posts/auto-encoding-variational-bayes/figure3.png){: w="700" }
_그림 3. 훈련 데이터 규모가 달라질 때 세 방법의 주변 우도 추정 결과와 온라인 학습 가능성의 차이를 함께 확인할 수 있다._

주변 우도 추정은 단순히 인코더가 낸 하한을 주변 우도로 간주하는 방식이 아니다. 부록의 절차에서는 gradient-based MCMC인 Hybrid Monte Carlo(HMC)를 사용해 사후분포에서 샘플을 얻고, 이 샘플에 밀도 추정기 $q(z)$를 적합한 뒤 주변 우도를 계산한다. 이 추정기는 5차원 미만의 저차원 잠재공간에서 유효하다고 설명된다.

평가는 훈련 세트와 테스트 세트 각각의 첫 1,000개 데이터포인트에서 이루어졌다. 데이터포인트마다 사후분포 표본 50개를 사용했고, 샘플링에는 4번의 HMC leapfrog step을 적용했다. 이 설정은 결과가 전체 데이터포인트의 정확한 주변 우도 계산이 아니라, 제한된 평가 표본과 저차원 잠재공간에서 수행한 샘플링 기반 추정임을 뜻한다.

Appendix D의 추정식은 다음과 같다.

$$
p_\theta(x^{(i)})
\simeq
\left(
\frac{1}{L}\sum_{l=1}^{L}
\frac{q(z^{(l)})}
{
p_\theta(z^{(l)})
p_\theta(x^{(i)}|z^{(l)})
}
\right)^{-1},
\qquad
z^{(l)}\sim p_\theta(z|x^{(i)})
$$

출발점은 주변 우도의 역수다.

$$
\frac{1}{p_\theta(x^{(i)})}
=
\int
p_\theta(z|x^{(i)})
\frac{q(z)}{p_\theta(x^{(i)},z)}
\,dz
$$

사후분포 아래의 이 기댓값을 Monte Carlo 평균으로 바꾸고 마지막에 역수를 취하면 위 추정식을 얻는다. 분모의 $p_\theta(z)p_\theta(x^{(i)}|z)$는 결합분포 $p_\theta(x^{(i)},z)$다. 이 절차는 사후 샘플을 얻기 위한 HMC와 별도의 밀도 추정을 요구하므로, AEVB 학습 루프보다 평가 비용이 크고 잠재 차원이 높을 때 불안정해질 수 있다. 논문이 주변 우도 실험에서 잠재변수를 3개로 제한한 이유도 이 평가 절차의 적용 범위와 연결된다.

Monte Carlo EM 비교에서는 $\nabla_z\log p_\theta(z|x)$로 사후분포의 기울기를 구하고, 목표 수락률 90%인 10번의 HMC leapfrog step으로 샘플링한 뒤 5번의 weight update step을 수행했다. 모든 알고리즘은 파라미터 업데이트에 Adagrad stepsize와 이에 수반되는 annealing schedule을 사용했다. Monte Carlo EM은 데이터포인트별 내부 샘플링과 여러 weight update를 포함하므로, 큰 데이터셋에서 온라인으로 확장하기 어렵다는 배경의 비용 문제가 실험 절차에도 그대로 드러난다.

### 학습된 잠재공간과 생성 샘플

Figure 4는 2차원 잠재공간에서 학습한 데이터 매니폴드를 시각화한다. 단위 정사각형 위에 선형 간격의 좌표를 놓고, 가우시안 inverse CDF를 적용해 표준 정규 사전분포에 대응하는 $z$ 값으로 변환한다. 이후 각 $z$에 대해 학습된 생성 모델 $p_\theta(x|z)$를 그린다. 단순히 $z$의 직교 좌표를 균일 간격으로 훑는 것이 아니라, 사전분포의 누적 확률 공간에서 균일하게 점을 잡는 절차다.

![가우시안 사전분포의 누적 확률 좌표를 따라 시각화한 2차원 학습 데이터 매니폴드](/assets/img/posts/auto-encoding-variational-bayes/figure4.jpg){: w="700" }
_그림 4. 인접한 잠재 좌표가 디코더의 출력 공간에서 어떻게 이어지는지 확인하기 위한 시각화다._

Figure 5는 여러 잠재 차원을 가진 학습된 생성 모델에서 무작위로 뽑은 샘플을 보여준다. 이 생성 경로에서는 입력 데이터를 인코딩하지 않고 사전분포에서 $z$를 뽑아 디코더에 전달한다.

![여러 잠재 공간 차원에서 학습한 생성 모델의 무작위 샘플](/assets/img/posts/auto-encoding-variational-bayes/figure5.jpg){: w="700" }
_그림 5. 근사 사후분포를 사용한 재구성이 아니라, 사전분포에서 시작하는 실제 생성 경로의 결과를 보여준다._

## 무엇이 성능을 만들었나

원문에는 구성 요소를 하나씩 제거한 ablation 실험이 없다. 따라서 AEVB가 wake-sleep보다 빠르게 수렴했다는 결과를 특정 단일 요소의 효과로 수치화할 수는 없다.

논문 안에서 직접 확인할 수 있는 논증은 세 수준으로 제한된다. 첫째, naïve Monte Carlo gradient estimator는 높은 분산 때문에 목적에 부적합하고, 재매개변수화된 추정기는 실험에서 1보다 작은 추정기 분산을 보였다. 둘째, Eq. 7은 계산 가능한 KL을 분석적으로 처리하므로 Eq. 6보다 낮은 분산을 갖는다. 셋째, 하한의 정규화가 잠재변수 수 증가를 과적합으로 연결하지 않는 효과가 관찰되었다.

다만 “재매개변수화 없음”, “분석적 KL 없음”, “KL 항 없음”을 동일한 설정에서 각각 비교한 수치는 제시되지 않았다. 그러므로 각 요소가 최종 수렴 속도나 주변 우도에 기여한 양을 분리해 말하는 것은 논문의 실험 범위를 넘어선다.

## Full VB로 확장하기

본문의 VAE 예시는 글로벌 파라미터 $\theta$를 점 추정하고 데이터포인트별 잠재변수 $z$에 변분 추론을 적용한다. 부록의 Full VB는 한 단계 더 나아가 $\theta$ 자체에도 근사 사후분포 $q_\phi(\theta)$를 둔다. 이때 파라미터에 대한 hyperprior $p_\alpha(\theta)$가 도입된다.

Eq. 13은 전체 데이터 $X$의 주변 로그 우도를 파라미터 사후분포에 관한 KL과 하한으로 분해한다.

$$
\log p_\alpha(X)
=
D_{KL}\left(
q_\phi(\theta)\|\|p_\alpha(\theta|X)
\right)
+
\mathcal{L}(\phi;X)
\tag{13}
$$

KL의 비음수성으로부터 Eq. 14의 Full VB 하한을 얻는다.

$$
\mathcal{L}(\phi;X)
=
\int q_\phi(\theta)
\left(
\log p_\theta(X)
+\log p_\alpha(\theta)
-\log q_\phi(\theta)
\right)d\theta
\tag{14}
$$

여기서는 데이터 적합도뿐 아니라 파라미터 근사 사후분포가 hyperprior에서 벗어나는 정도도 목적에 포함된다. 그러나 $\log p_\theta(X)$ 안에는 각 데이터포인트의 잠재변수를 적분하는 문제가 남아 있다.

Eq. 15는 Eq. 1과 같은 데이터포인트별 분해를 다시 사용한다.

$$
\log p_\theta(x^{(i)})
=
D_{KL}\left(
q_\phi(z|x^{(i)})\|\|p_\theta(z|x^{(i)})
\right)
+
\mathcal{L}(\theta,\phi;x^{(i)})
\tag{15}
$$

그 하한을 적분 형태로 쓰면 Eq. 16이다.

$$
\mathcal{L}(\theta,\phi;x^{(i)})
=
\int q_\phi(z|x)
\left(
\log p_\theta(x^{(i)}|z)
+\log p_\theta(z)
-\log q_\phi(z|x)
\right)dz
\tag{16}
$$

Eq. 17은 잠재변수의 재매개변수화를 다시 도입한다.

$$
\tilde z=g_\phi(\epsilon,x),
\qquad
\epsilon\sim p(\epsilon)
\tag{17}
$$

이를 Eq. 16에 대입하면 적분 분포가 $q_\phi(z|x)$에서 고정된 노이즈 분포 $p(\epsilon)$으로 바뀐다.

$$
\begin{aligned}
\mathcal{L}(\theta,\phi;x^{(i)})
=
\int p(\epsilon)
\big(
&\log p_\theta(x^{(i)}|z)
+\log p_\theta(z) \\
&-\log q_\phi(z|x)
\big)\big|_{z=g_\phi(\epsilon,x^{(i)})}
\,d\epsilon
\end{aligned}
\tag{18}
$$

Full VB에서는 파라미터에도 같은 아이디어를 적용한다.

$$
\tilde\theta=h_\phi(\zeta),
\qquad
\zeta\sim p(\zeta)
\tag{19}
$$

Eq. 14에 이 치환을 적용하면 Eq. 20이 된다.

$$
\mathcal{L}(\phi;X)
=
\int p(\zeta)
\left(
\log p_\theta(X)
+\log p_\alpha(\theta)
-\log q_\phi(\theta)
\right)\big|_{\theta=h_\phi(\zeta)}
d\zeta
\tag{20}
$$

이제 데이터포인트와 잠재변수, 글로벌 파라미터의 샘플링을 한 추정식에 묶기 위해 Eq. 21의 약어를 정의한다.

$$
\begin{aligned}
f_\phi(x,z,\theta)
=\;&
N\left(
\log p_\theta(x|z)
+\log p_\theta(z)
-\log q_\phi(z|x)
\right) \\
&+\log p_\alpha(\theta)-\log q_\phi(\theta)
\end{aligned}
\tag{21}
$$

$N$은 하나의 샘플링된 데이터포인트가 전체 데이터 합을 대표하도록 데이터 관련 항을 확장한다. 반면 글로벌 파라미터의 prior와 posterior 항은 데이터포인트마다 $N$번 중복되는 항이 아니므로 바깥에 남는다.

Eq. 18과 Eq. 20에 Monte Carlo 근사를 적용하면 Eq. 22의 Full VB 추정기가 된다.

$$
\mathcal{L}(\phi;X)
\simeq
\frac{1}{L}\sum_{l=1}^{L}
f_\phi\left(
x^{(l)},
g_\phi(\epsilon^{(l)},x^{(l)}),
h_\phi(\zeta^{(l)})
\right)
\tag{22}
$$

파라미터와 잠재변수 모두 대각 가우시안 근사분포를 사용하면 Eq. 23과 같다.

$$
\log q_\phi(\theta)
=
\log\mathcal N
\left(
\theta;\mu_\theta,\sigma_\theta^2\mathbf I
\right),
\qquad
\log q_\phi(z|x)
=
\log\mathcal N
\left(
z;\mu_z,\sigma_z^2\mathbf I
\right)
\tag{23}
$$

구체적인 재매개변수화는 다음 두 위치-척도 변환이다.

$$
\tilde\theta
=
\mu_\theta+\sigma_\theta\odot\zeta,
\qquad
\zeta\sim\mathcal N(0,\mathbf I)
$$

$$
\tilde z
=
\mu_z+\sigma_z\odot\epsilon,
\qquad
\epsilon\sim\mathcal N(0,\mathbf I)
$$

구체적인 Full VB 예시에서는 $p_\alpha(\theta)=\mathcal N(0,\mathbf I)$와 $p_\theta(z)=\mathcal N(0,\mathbf I)$를 사용한다. 따라서 파라미터와 잠재변수 양쪽의 KL을 분석적으로 적분할 수 있고, Eq. 24의 낮은 분산 추정기를 얻는다.

$$
\begin{aligned}
\mathcal{L}(\phi;X)\simeq
\frac{1}{L}\sum_{l=1}^{L}
N\Bigg(
&
\frac{1}{2}\sum_{j=1}^{J}
\left[
1+\log((\sigma_{z,j}^{(l)})^2)
-(\mu_{z,j}^{(l)})^2
-(\sigma_{z,j}^{(l)})^2
\right] \\
&+
\log p_{\theta^{(l)}}(x^{(i)}|z^{(i)})
\Bigg)
+
\frac{1}{2}\sum_{j=1}^{J}
\left[
1+\log((\sigma_{\theta,j}^{(l)})^2)
-(\mu_{\theta,j}^{(l)})^2
-(\sigma_{\theta,j}^{(l)})^2
\right]
\end{aligned}
\tag{24}
$$

첫 번째 KL 형태의 합은 데이터포인트별 잠재변수 $z$에 관한 정규화이고, 로그 우도와 함께 $N$배 된다. 마지막 합은 글로벌 파라미터 $\theta$에 관한 정규화다. Eq. 22에서 두 KL 부분을 분석적으로 적분하고 데이터 우도만 샘플 평가한다는 점에서, Eq. 7을 글로벌 파라미터까지 확장한 구조로 읽을 수 있다.

Algorithm 2는 Eq. 22를 최대화하기 위한 확률적 경사를 계산한다.

```python
# g: phi에 대한 누적 gradient
g = 0

for l in range(L):
    x = sample_datapoint(X)                  # (D,)
    epsilon = sample_noise_for_z()           # (J_z,)
    z = g_phi(epsilon, x)                    # (J_z,)

    zeta = sample_noise_for_theta()           # (J_theta,)
    theta_sample = h_phi(zeta)                # (J_theta,)

    g = g + (1 / L) * grad_phi(
        f_phi(x, z, theta_sample)             # scalar
    )

return g                                      # shape(phi)
```

이 알고리즘은 stochastic gradient를 반환하며 실제 파라미터 갱신은 포함하지 않는다. 본문의 Algorithm 1처럼 반환된 경사를 최적화기에 전달하는 단계가 별도로 필요하다. 또한 글로벌 파라미터까지 분포로 표현하므로, 점 추정 VAE보다 파라미터별 평균과 분산을 저장하고 샘플링해야 한다. 부록은 이 확장을 제시하지만 글로벌 파라미터에 대한 SGVB 실험은 향후 연구로 남겨 두었다.

## 비용과 트레이드오프

AEVB의 학습 비용은 데이터포인트별로 인코더와 디코더를 통과시키고 $L$개의 잠재 샘플을 평가하는 데서 나온다. 논문 실험에서는 $L=1$이므로 데이터포인트마다 비싼 내부 MCMC 루프를 두지 않는다. 이 점이 10번의 HMC leapfrog step과 5번의 weight update를 사용하는 Monte Carlo EM과 구별되는 효율상의 핵심이다.

메모리는 모델 파라미터 외에 미니배치의 인코더 출력 $\mu,\sigma$와 재매개변수화 샘플 $z$를 저장하는 데 필요하다. 샘플 수 $L$을 늘리면 $z$ 및 디코더 중간 활성값의 샘플 축도 함께 커진다. 논문은 $L=1$에서 작은 추정기 분산을 보고했으므로 해당 실험에서는 추가 샘플 비용을 지불하지 않았다.

추론 시 관측값의 잠재분포를 구하는 작업은 인코더 한 번으로 amortize된다. 매 데이터포인트마다 별도 최적화나 HMC를 수행하는 방식보다 큰 데이터셋에 유리하다. 반면 생성은 사전분포에서 $z$를 뽑고 디코더를 한 번 통과시키므로 반복적인 역과정이나 MCMC 샘플링을 요구하지 않는다.

품질을 위해 지불한 대가는 근사 사후분포의 제약이다. VAE 예시의 대각 가우시안 $q_\phi(z|x)$는 평균과 차원별 분산만 표현한다. 일반 AEVB가 이 분포에 한정되지는 않지만, 다른 분포를 쓰려면 미분 가능한 재매개변수화 전략과 경우에 따라 새로운 KL 계산이 필요하다.

분산이 낮은 Eq. 7과 Eq. 10은 가우시안 사전분포와 대각 가우시안 근사 사후분포 덕분에 KL을 닫힌형식으로 계산할 수 있을 때 얻는 이점이다. 더 복잡한 분포 표현력을 선택하면 Eq. 6처럼 더 많은 항을 Monte Carlo로 추정해야 할 수 있고, 분산이나 계산량이 증가할 가능성이 있다. 논문 안에는 이 복잡한 분포들과 가우시안 예시를 정량 비교한 결과가 없다.

경량화 관점에서 AEVB는 파라미터 수를 줄이는 방법이라기보다 추론과 학습 절차를 계산 가능하게 만드는 방법이다. 데이터포인트별 반복 추론을 하나의 인코더 순전파로 대체하고 $L=1$로 학습할 수 있다는 점은 데이터 규모가 커질 때 중요한 효율 이점이다. 반대로 인코더라는 별도 네트워크가 추가되며, Full VB까지 확장하면 모든 글로벌 파라미터에 대한 분포 파라미터와 샘플링 비용도 필요하다. 따라서 계산 효율은 모델이 작아진다는 뜻이 아니라, 비싼 데이터포인트별 최적화와 MCMC 내부 루프를 amortized inference로 치환한다는 의미에서 이해해야 한다.

보고된 하한 비교 실험에서는 40 GFLOPS의 Intel Xeon CPU로 훈련 샘플 100만 개당 20~40분이 걸렸다. 이 수치는 당시의 CPU 계산 비용을 보여준다. 따라서 현대 하드웨어에서의 처리량이나 파라미터 효율을 추가 수치로 환산할 수는 없다. 논문에서 근거를 갖고 비교할 수 있는 비용은 미니배치 학습 가능 여부, 데이터포인트별 샘플 수, HMC 내부 루프, 보고된 CPU 처리 시간이다.

주변 우도 평가는 학습보다 훨씬 무겁다. 데이터포인트별 HMC 샘플, 밀도 추정, 여러 표본을 요구하고 5차원 미만에서 유효하다는 제약도 있다. 모델을 높은 차원의 잠재공간으로 확장하더라도 같은 평가법이 안정적으로 따라오지는 않는다. 학습 알고리즘의 확장성과 평가 추정기의 확장성을 분리해서 봐야 하는 이유다.

이 비용 구조는 이후 연구가 출발할 질문도 분명하게 만든다. 더 복잡한 잠재분포를 사용하면서 낮은 분산을 유지하는 방법, 글로벌 파라미터까지 변분 추론할 때 늘어나는 메모리와 샘플링 비용을 다루는 방법, 고차원 모델에서도 안정적인 평가를 수행하는 방법이 필요하다. 논문은 이 가운데 글로벌 파라미터에 대한 SGVB를 부록에서 수식으로 확장하고 실험은 향후 연구로 남긴다.

## 한계와 생각해볼 점

저자는 방법론이 온라인 또는 비정상(non-stationary) 환경, 예를 들어 스트리밍 데이터에도 적용될 수 있다고 설명하지만 본문에서는 단순화를 위해 고정 데이터셋만 가정한다. 따라서 시간에 따라 데이터 분포가 변하는 상황에서 인코더와 디코더가 어떻게 적응하는지는 실험으로 확인되지 않는다.

재매개변수화는 연속 잠재변수에서 미분 가능한 샘플 생성 경로를 확보할 때 특히 자연스럽다. wake-sleep이 이산 잠재변수에도 적용될 수 있다고 명시적으로 대비되는 만큼, 이 논문의 주된 AEVB 구성만으로 이산 잠재변수를 같은 방식으로 처리할 수 있다고 확대 해석해서는 안 된다.

주변 우도 추정기는 5차원 미만의 저차원 공간에서 유효하며, 실제 실험도 3개의 잠재변수를 사용했다. 더 높은 잠재 차원에서 추정치가 불안정해졌으므로, Figure 3의 평가 결과가 고차원 잠재모델에서도 같은 신뢰도로 유지되는지는 논문에서 확인되지 않는다.

Full VB는 글로벌 파라미터 $\theta$까지 재매개변수화하는 수식과 Algorithm 2를 제공하지만, 이에 관한 실험은 향후 연구로 남았다. 부록의 유도는 계산 가능한 확장 방향을 보여주지만, 점 추정 VAE 대비 품질·계산량·메모리의 실제 차이는 제시된 결과만으로 판단할 수 없다.

저자가 제시한 향후 연구 방향은 네 갈래다.

- 심층 신경망을 사용한 계층적 생성 아키텍처 학습
- 시계열 모델에 대한 적용
- 글로벌 파라미터에 대한 SGVB 적용
- 복잡한 노이즈 분포 학습에 유용한 지도 잠재변수 모델

일반화 가능성에 대한 논문 안의 근거는 MNIST와 Frey Face라는 두 데이터셋, 이진·실수 관측값에 대응하는 베르누이 및 가우시안 디코더, 그리고 여러 재매개변수화 가능 분포의 구성 전략이다. 반면 시계열, 계층적 생성 모델, 글로벌 파라미터의 변분 추론은 확장 가능성이 수식 또는 향후 연구 방향으로 제시되었을 뿐 실험으로 검증되지는 않았다.

내가 이 논문에서 가장 중요하게 읽는 지점은 특정 네트워크 구조가 아니라 확률적 계산을 최적화 가능한 계산 그래프로 바꾸는 방식이다. 변분 하한 자체는 Eq. 1~3에서 이미 정의되지만, Eq. 4~8이 그 하한을 대규모 데이터에서 실제로 학습할 수 있는 알고리즘으로 만든다. 재매개변수화는 분포에 의존하는 샘플링을 고정된 노이즈와 미분 가능한 변환으로 분리하고, 분석적 KL은 정확히 계산할 수 있는 항의 표본 분산을 제거하며, 인식 모델은 데이터포인트별 추론 비용을 하나의 순전파로 amortize한다. 세 설계가 각각 미분 가능성, 분산, 데이터 규모라는 앞의 문제에 대응한다.

동시에 효율성은 아무 조건 없이 얻어지는 것이 아니다. 미분 가능한 재매개변수화, 계산 가능한 로그 밀도, 적절한 근사 사후분포가 필요하고, 더 복잡한 사후분포나 고차원 주변 우도 평가는 별도의 비용과 불안정성을 가져올 수 있다. AEVB의 기여는 이 조건을 숨기는 데 있지 않고, 조건이 성립할 때 변분 추론과 생성 모델 학습을 하나의 확률적 경사 최적화 문제로 연결한 데 있다.
