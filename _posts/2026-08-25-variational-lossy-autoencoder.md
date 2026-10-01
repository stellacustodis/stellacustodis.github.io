---
title: "Variational Lossy Autoencoder"
date: 2026-08-25 21:00:00 +0900
permalink: /posts/variational-lossy-autoencoder/
categories:
  - AI
  - Paper Review
tags: [paper-review, vae, autoregressive-model, representation-learning, normalizing-flow]
description: "제한된 수용 영역의 자기회귀 디코더와 AF 사전분포로 국소 정보와 전역 구조의 역할을 나누는 VLAE를 수학, 구현, 실험 및 비용 관점에서 살펴본다."
paper:
  authors: "Xi Chen, Diederik P. Kingma, Tim Salimans, Yan Duan, Prafulla Dhariwal, John Schulman, Ilya Sutskever, Pieter Abbeel"
  venue: "International Conference on Learning Representations"
  url: "https://openreview.net/forum?id=BysvGP5ee"
---

## 세 줄 요약

Variational Lossy Autoencoder(VLAE)는 변분 오토인코더(Variational Autoencoder, VAE)에 강력한 자기회귀(autoregressive) 디코더를 붙이되, 디코더의 수용 영역(receptive field)을 제한해 국소 통계만 처리하게 한다. 그 결과 디코더가 혼자 복원하기 어려운 전역 구조는 잠재 코드(latent code)를 통해 전달되고, 국소적인 세부 정보는 손실될 수 있는 표현이 만들어진다. 여기에 자기회귀 흐름(Autoregressive Flow, AF) 사전분포를 결합해 근사 사후분포와 실제 사후분포의 차이에서 생기는 비효율도 줄인다.

## 이 논문이 풀려는 문제

생성 모델에서 표현 학습(representation learning)을 한다는 말은 그 자체로 충분한 목표가 아니다. 관측 데이터 $x$를 설명하는 잠재 변수 $z$를 도입하더라도, 어떤 정보를 $z$에 넣고 어떤 정보를 디코더가 직접 처리해야 하는지는 자동으로 정해지지 않는다. 같은 데이터 분포를 설명하면서도 서로 전혀 다른 잠재 표현을 만들 수 있기 때문에, 구체적인 가정이 없다면 생성 모델을 통한 표현 학습은 ill-posed 문제다.

VAE는 이 문제를 잠재 변수 모델과 변분 추론(variational inference)으로 다룬다. 인코더 $q(z|x)$가 관측값을 잠재 코드로 옮기고, 디코더 $p(x|z)$가 이를 다시 관측 공간으로 복원한다. 그러나 이 구성만으로는 잠재 코드가 사람이 기대하는 전역 구조나 의미 정보를 담는다고 보장할 수 없다. 어떤 정보가 $z$로 이동할지는 디코더의 표현력과 구조적 편향에 크게 좌우된다.

반대편에는 PixelRNN이나 PixelCNN과 같은 자기회귀 모델이 있다. 이들은 관측 변수를 순서대로 조건화해 복잡한 데이터 분포를 직접 모델링할 수 있다. 강력한 생성 모델이지만, 기본 형태에는 확률적 잠재 변수의 계층 구조가 없으므로 표현 학습에 바로 사용하기는 어렵다.

두 모델을 단순히 결합한다고 문제가 해결되는 것도 아니다. 표현력이 충분히 높은 자기회귀 디코더는 잠재 코드 없이도 데이터의 구조를 모델링할 수 있다. 이때 변분 목적함수는 $q(z|x)$를 사전분포 $p(z)$와 같게 만들어 KL 발산을 0에 가깝게 줄이는 방향으로 갈 수 있다. 디코더가 모든 일을 맡고 인코더가 전달하는 정보가 사라지는 것이다.

VLAE의 출발점은 이 실패를 최적화 기법만으로 막기보다, 디코더가 볼 수 있는 정보의 범위를 구조적으로 제한하는 데 있다. 디코더에는 국소적인 이웃만 보여주고, 그 범위 밖의 상관관계를 설명하려면 잠재 코드를 사용하도록 만든다. 표현 학습 목표를 “좋은 표현을 찾아라”라고 모호하게 두는 대신, 정보가 배치될 위치를 모델 구조로 지정하는 접근이다.

## 핵심 아이디어 — 정보를 어디에 둘 것인가

VLAE는 관측 데이터의 정보를 두 통로에 나누어 배치한다.

- 제한된 수용 영역을 가진 자기회귀 디코더는 인접 픽셀 사이의 국소 통계를 처리한다.
- 디코더의 수용 영역만으로 포착할 수 없는 전역 구조는 잠재 코드 $z$를 통해 전달한다.

예를 들어 디코더가 현재 픽셀 주변의 작은 패치만 볼 수 있다면, 가까운 픽셀 사이의 질감이나 짧은 거리의 의존성은 직접 모델링할 수 있다. 반면 이미지 전체의 윤곽이나 멀리 떨어진 영역 사이의 관계는 국소 문맥만으로 알기 어렵다. 복원 우도를 높이려면 인코더가 이런 정보를 $z$에 넣어야 한다.

이 설계에서 중요한 조절 손잡이는 디코더의 수용 영역이다. 수용 영역이 너무 작으면 잠재 코드가 많은 정보를 전달해야 하지만 디코더가 국소 통계조차 충분히 처리하지 못할 수 있다. 수용 영역이 커지면 밀도 추정 성능은 좋아질 수 있지만, 디코더가 더 많은 정보를 직접 모델링하므로 잠재 표현은 더 많은 세부 정보를 버릴 수 있다. CIFAR10에서 수용 영역이 $4\times2$일 때 3.12 bits/dim, $7\times4$일 때 2.95 bits/dim이었다는 결과가 이 품질-표현 트레이드오프를 보여준다.

다만 “디코더를 제한하면 전역 정보가 반드시 잠재 코드로 이동한다”는 주장은 유한한 학습 과정에서 자동으로 보장되는 성질이 아니다. 논문이 제시하는 정보 선호 성질(information preference property)은 변분 하한이 충분히 잘 최적화된 경우에 대한 점근적 주장이다. 실제 학습에서는 잠재 변수가 일찍 무시되는 현상을 막기 위해 free bits, KL annealing과 같은 안정화 기법이 여전히 필요할 수 있다.

또 하나의 구성 요소는 학습 가능한 사전분포다. 단순한 사전분포가 복잡한 집계 사후분포를 충분히 표현하지 못하면 $q(z|x)$와 실제 사후분포 $p(z|x)$ 사이에 간극이 남는다. VLAE는 사전분포를 자기회귀 흐름으로 파라미터화해 이 간극을 줄인다. 특히 IAF(Inverse Autoregressive Flow)를 사후분포에 넣는 대신 AF를 사전분포에 배치하면, 학습 비용을 늘리지 않으면서 더 깊은 생성 경로를 구성할 수 있다는 것이 논문의 주장이다.

![원본과 VLAE의 손실 압축 결과 비교](/assets/img/posts/variational-lossy-autoencoder/figure1.png){: w="700" }
_그림 1. Statically Binarized MNIST에서 VLAE의 잠재 코드는 국소적인 픽셀 세부 정보를 버리면서도 숫자의 전역 구조를 유지한다. 이 결과는 수용 영역 제한을 통해 정보의 위치를 나눈다는 설계 의도를 시각적으로 보여준다._

## 방법 — 변분 하한에서 손실 표현까지

### 데이터 우도와 변분 하한

데이터셋 $X$의 각 관측값이 모델 $p$에서 생성된다고 할 때 최대화하려는 로그우도는 식 (1)이다.

$$
\log p(X)=\sum_{i=1}^{N}\log p(x^{(i)})
\tag{1}
$$

문제는 잠재 변수 $z$를 도입한 뒤의 주변우도

$$
p(x)=\int p(x,z)\,dz
$$

를 직접 계산하고 미분하기 어려울 수 있다는 점이다. 그래서 계산 가능한 근사 사후분포 $q(z|x)$를 곱하고 나누면 다음과 같이 쓸 수 있다.

$$
\log p(x)
=
\log \mathbb{E}_{q(z|x)}
\left[
\frac{p(x,z)}{q(z|x)}
\right].
$$

로그의 오목성에 Jensen 부등식을 적용하면 기대값 바깥의 로그를 안으로 이동한 하한을 얻는다.

$$
\log p(x)
\ge
\mathbb{E}_{q(z|x)}
[\log p(x,z)-\log q(z|x)]
=
\mathcal{L}(x;\theta).
\tag{2}
$$

여기서 버린 것은 근사 사후분포와 실제 사후분포 사이의 간극이다. 두 분포가 일치할 때만 하한이 실제 로그우도와 같아진다. 따라서 변분 하한을 높이는 일은 데이터 우도를 높이는 일과 추론 모델 $q(z|x)$를 실제 사후분포에 가깝게 만드는 일을 함께 수행한다.

식 (3)은 이 하한을 다시 적은 것이다.

$$
\mathcal{L}(x;\theta)
=
\mathbb{E}_{q(z|x)}
[\log p(x,z)-\log q(z|x)].
\tag{3}
$$

결합분포를 $p(x,z)=p(x|z)p(z)$로 분해하면 익숙한 VAE 목적함수 형태가 나온다.

$$
\mathcal{L}(x;\theta)
=
\mathbb{E}_{q(z|x)}[\log p(x|z)]
-
D_{KL}(q(z|x)\Vert p(z)).
\tag{4}
$$

첫 항은 주어진 잠재 코드로 관측 데이터를 얼마나 잘 설명하는지를 나타낸다. 음의 복원 오차로 읽을 수 있으며, 이 항만 최적화하면 인코더는 복원에 유용한 정보를 제한 없이 $z$에 담으려 한다.

둘째 항은 그 정보 전달에 부과되는 비용이다. $q(z|x)$가 사전분포 $p(z)$에서 멀어질수록 비용이 커진다. 이 항을 제거하면 잠재 공간이 사전분포와 정렬되지 않아 생성 시 사전분포에서 뽑은 코드가 학습 중 본 코드와 달라질 수 있다. 반대로 KL 항의 영향이 지나치게 강하거나 디코더가 $z$ 없이도 충분히 강하면 $q(z|x)=p(z)$에 가까워져 잠재 코드가 정보를 전달하지 않게 된다.

이 목적함수는 손실 압축의 관점에서도 읽을 수 있다. KL 항은 잠재 경로로 보내는 정보량에 대응하고, 복원 항은 그 제한된 정보로 데이터를 얼마나 잘 설명하는지에 대응한다. VLAE는 이 두 항의 계수만 바꾸는 대신 디코더 구조를 제한해 “어떤 종류의 정보를 잠재 경로가 담당해야 하는가”까지 지정한다.

### Bits-Back Coding으로 본 VAE의 비효율

잠재 코드 $z$를 먼저 보내고, 그 조건 아래에서 $x$를 보내는 순진한 코딩 방식을 생각하면 기대 코드 길이는 식 (5)다.

$$
C_{naive}(x)
=
\mathbb{E}_{x\sim data,\;z\sim q(z|x)}
[-\log p(z)-\log p(x|z)].
\tag{5}
$$

$-\log p(z)$는 잠재 코드를 사전분포에 따라 전송하는 비용이고, $-\log p(x|z)$는 잠재 코드가 주어진 뒤 관측값을 전송하는 비용이다. 이 방식은 인코더가 $q(z|x)$를 이용해 $z$를 선택했다는 사실에서 얻을 수 있는 이득을 반영하지 않는다.

Bits-Back Coding은 $\log q(z|x)$만큼의 정보를 되돌려 받는다고 해석해 기대 코드 길이를 다음과 같이 쓴다.

$$
C_{BitsBack}(x)
=
\mathbb{E}_{x\sim data,\;z\sim q(z|x)}
[
\log q(z|x)-\log p(z)-\log p(x|z)
].
\tag{6}
$$

식 (6)의 괄호 안에 음수를 묶으면 식 (3)의 변분 하한과 정확히 대응한다.

$$
C_{BitsBack}(x)
=
\mathbb{E}_{x\sim data}[-\mathcal{L}(x)].
\tag{7}
$$

즉 VAE의 음의 변분 하한을 최소화하는 일은 Bits-Back 방식의 기대 코드 길이를 줄이는 일로 해석할 수 있다. 이 관점은 KL 항이 단순한 정규화 항이 아니라 잠재 코드 사용에 따르는 실질적인 정보 비용이라는 점을 드러낸다.

논문은 같은 코드 길이를 실제 사후분포와의 차이로 다시 분해한다. 식 (8)은 식 (6)을 반복해 출발점을 명확히 한다.

$$
C_{BitsBack}(x)
=
\mathbb{E}_{x\sim data,\;z\sim q(z|x)}
[
\log q(z|x)-\log p(z)-\log p(x|z)
].
\tag{8}
$$

Bayes 규칙을 사용해 정리하면 다음 식을 얻는다.

$$
C_{BitsBack}(x)
=
\mathbb{E}_{x\sim data}
\left[
-\log p(x)
+
D_{KL}(q(z|x)\Vert p(z|x))
\right].
\tag{9}
$$

첫 항은 생성 모델 자체의 데이터 부호화 비용이다. 둘째 항은 근사 사후분포가 실제 사후분포와 일치하지 않아서 추가로 지불하는 비용이다. 표현력이 부족한 $q(z|x)$나 부적절한 사전분포는 이 차이를 키울 수 있다.

모델 분포 $p(x)$에 대한 교차 엔트로피는 실제 데이터 분포의 엔트로피보다 작을 수 없으므로 다음 부등식이 성립한다.

$$
C_{BitsBack}(x)
\ge
\mathbb{E}_{x\sim data}
\left[
-\log p_{data}(x)
+
D_{KL}(q(z|x)\Vert p(z|x))
\right].
\tag{10}
$$

첫 항을 Shannon 엔트로피로 쓰면 최종적으로 다음 하한이 된다.

$$
C_{BitsBack}(x)
\ge
H(data)
+
\mathbb{E}_{x\sim data}
[D_{KL}(q(z|x)\Vert p(z|x))].
\tag{11}
$$

식 (11)은 비효율의 원인을 두 층으로 나눈다. 모델 $p(x)$가 실제 데이터 분포와 다르면 식 (9)의 음의 로그우도에서 비용이 생긴다. 추론 모델 $q(z|x)$가 실제 사후분포와 다르면 KL 항에서 추가 비용이 생긴다. 데이터 엔트로피에 도달하려면 생성 모델이 데이터 분포를 맞추고 근사 사후분포도 실제 사후분포를 맞춰야 한다.

이 분해는 학습 가능한 AF 사전분포를 도입하는 이유와 연결된다. 사전분포의 표현력을 높이면 잠재 공간의 복잡한 분포를 더 잘 수용할 수 있고, 결과적으로 변분 추론과 Bits-Back 부호화에서 남는 비효율을 줄일 여지가 생긴다.

### AF 사전분포와 변수 변환

일반적인 VAE 하한을 로그 밀도의 합으로 다시 쓰면 식 (12)다.

$$
\mathcal{L}(x;\theta)
=
\mathbb{E}_{z\sim q(z|x)}
[
\log p(x|z)+\log p(z)-\log q(z|x)
].
\tag{12}
$$

VLAE는 사전분포 $p(z)$를 고정된 단순 분포로 두지 않고, 연속 잡음 $\epsilon\sim u(\epsilon)$을 자기회귀 흐름 $f$로 변환해 $z=f(\epsilon)$로 만든다. 변수 변환 공식에 따라

$$
\log p(z)
=
\log u(\epsilon)
+
\log\det\left(\frac{d\epsilon}{dz}\right)
$$

이며, 이를 식 (12)에 대입하면 식 (13)이 된다.

$$
\mathcal{L}(x;\theta)
=
\mathbb{E}_{z\sim q(z|x),\;\epsilon=f^{-1}(z)}
\left[
\log p(x|f(\epsilon))
+
\log u(\epsilon)
+
\log\det\left(\frac{d\epsilon}{dz}\right)
-
\log q(z|x)
\right].
\tag{13}
$$

여기서 $\log u(\epsilon)$은 기반 잡음 분포에서의 밀도이고, 로그 행렬식 항은 $f$가 공간을 늘리거나 줄이면서 바뀐 밀도를 보정한다. 이 항의 부호나 역변환 방향을 잘못 구현하면 계산되는 사전분포 밀도 자체가 달라진다.

식 (13)의 마지막 두 항을 묶으면 식 (14)가 된다.

$$
\mathcal{L}(x;\theta)
=
\mathbb{E}_{z\sim q(z|x),\;\epsilon=f^{-1}(z)}
\left[
\log p(x|f(\epsilon))
+
\log u(\epsilon)
-
\left(
\log q(z|x)
-
\log\det\left(\frac{d\epsilon}{dz}\right)
\right)
\right].
\tag{14}
$$

마지막 괄호는 IAF posterior를 사용하는 경우와 형태적으로 대응한다. 차이는 흐름을 추론 경로에 둘지 생성 경로의 사전분포에 둘지다. VLAE는 AF prior를 택해 생성 모델 쪽의 표현력을 높인다. 논문은 이 선택이 IAF posterior 대신 더 깊은 디코더 경로를 제공하면서도 학습 비용을 늘리지 않는다고 설명한다.

## Free Bits가 필요한 이유

수용 영역을 제한해도 학습 초기에 디코더가 잠재 코드를 무시하는 방향으로 수렴하면 원하는 정보 배치가 만들어지지 않을 수 있다. 부록은 이를 안정화하기 위한 free bits와 Soft Free Bits 목적함수를 다룬다. 두 목적함수는 잠재 변수를 사용하는 방향으로 학습을 조정한다.

확률적 유닛을 $K$개 그룹으로 나눴을 때 free bits 대체 목적함수는 다음과 같다.

$$
\tilde{\mathcal{L}}_{\lambda}
=
\mathbb{E}_{x\sim\mathcal{M}}
\mathbb{E}_{q(z|x)}
[\log p(x|z)]
-
\sum_{j=1}^{K}
\max\left(
\lambda,
\mathbb{E}_{x\sim\mathcal{M}}
[D_{KL}(q(z_j|x)\Vert p(z_j))]
\right).
$$

각 그룹의 평균 KL이 $\lambda$보다 작으면 목적함수에 들어가는 값은 고정된 $\lambda$다. 따라서 해당 구간에서는 KL을 더 줄여도 목적함수가 좋아지지 않는다. 인코더가 잠재 정보를 완전히 버려 KL을 0으로 만드는 압력이 약해지는 이유다. 반대로 KL이 $\lambda$를 넘으면 실제 KL이 다시 비용으로 들어오므로 잠재 경로가 제한 없이 많은 정보를 보내지는 못한다.

이 방식은 $\lambda$ 경계에서 목적함수의 동작이 급격하게 바뀐다. Soft Free Bits는 고정된 절단 대신 KL 항의 가중치 $\gamma$를 조절한다.

$$
\mathcal{L}_{SoftFreeBits}(x;\theta)
=
\mathbb{E}_{q(z|x)}[\log p(x|z)]
-
\gamma D_{KL}(q(z|x)\Vert p(z)).
$$

$\gamma$는 0과 1 사이의 smoothing parameter다. KL이 목표치 $\lambda$보다 설정된 비율 이상 높으면 $\gamma$를 10% 증가시켜 KL 비용을 강화하고, KL이 $\lambda$보다 낮으면 $\gamma$를 10% 감소시켜 잠재 정보 사용을 덜 억제한다. 실험한 허용 비율 범위는 3%에서 30%였고, 주로 5%를 사용했다.

이 제어는 단순히 KL 항을 일정 비율로 약화하는 것과 다르다. 현재 KL이 목표 정보량보다 높은지 낮은지에 따라 $\gamma$가 움직이는 피드백 제어에 가깝다. 구현할 때는 현재 미니배치의 변동만 보고 $\gamma$가 과도하게 흔들리지 않도록, 논문이 정의한 목표치와 갱신 조건을 그대로 구분해야 한다.

## 구현 관점에서

### 학습 루프

아래 구현 골격은 근사 사후분포 $q(z|x)$의 샘플링을 별도 함수로 추상화하고, 목적함수와 AF prior 계산을 나타낸다.

```python
def train_step(x, domain, gamma=None):
    # binary image: x -> (B, 1, 28, 28)
    # CIFAR10:      x -> (B, 3, 32, 32)

    q = encoder(x)
    z = differentiable_sample(q)

    # binary image: z -> (B, 64)
    # CIFAR10:      z -> (B, 16, 8, 8)

    # AF prior density: z = f(epsilon), so density evaluation uses f^{-1}
    epsilon, log_det_inverse = af_prior.inverse(z)
    log_pz = log_u(epsilon) + log_det_inverse       # (B,)
    log_qz_x = q.log_prob(z)                        # (B,)

    # Teacher-forced autoregressive likelihood.
    # The mask must prevent the target pixel/channel from leaking into its own input.
    log_px_z = local_decoder.log_prob(x, condition=z)  # (B,)

    kl = log_qz_x - log_pz                          # (B,)
    reconstruction = log_px_z                       # (B,)

    if gamma is None:
        objective = mean(reconstruction - kl)
    else:
        objective = mean(reconstruction - gamma * kl)

    loss = -objective
    update_parameters(loss)
    return mean(-log_px_z), mean(kl)
```

가장 먼저 확인할 부분은 AF의 방향이다. 사전분포에서 표본을 만들 때는 $\epsilon$을 뽑아 $z=f(\epsilon)$를 계산하지만, 관측된 $z$의 로그 밀도를 평가할 때는 $\epsilon=f^{-1}(z)$와 $\log\det(d\epsilon/dz)$가 필요하다. 생성 방향의 Jacobian과 역변환 방향의 Jacobian을 혼동하면 식 (13)의 부호가 뒤집힌다.

두 번째는 자기회귀 마스크다. 학습 시 전체 이미지를 한 번에 넣더라도 현재 위치의 값을 예측 입력에서 볼 수 없어야 한다. 현재 픽셀이나 현재 채널이 마스크를 통해 새면 NLL은 좋아 보이지만 올바른 자기회귀 분포를 학습한 것이 아니다.

세 번째는 free bits의 집계 단위다. 부록의 식은 각 표본의 KL을 즉시 $\lambda$와 비교하는 형태가 아니라, 데이터 분포에 대한 그룹별 평균 KL을 비교한다. 미니배치 구현에서는 이 기대값을 배치 평균으로 근사하게 되므로, 확률적 유닛 그룹 $z_j$의 축과 배치 축을 혼동하지 않아야 한다.

Soft Free Bits를 사용한다면 $\gamma$ 갱신은 모델 파라미터 갱신과 분리해 생각할 수 있다.

```python
def update_soft_free_bits_gamma(gamma, measured_kl, target_kl, tolerance):
    # tolerance was explored from 3% to 30%; 5% was used mainly.
    upper = target_kl * (1 + tolerance)

    if measured_kl > upper:
        gamma = gamma * 1.10
    elif measured_kl < target_kl:
        gamma = gamma * 0.90

    return clip_to_zero_one(gamma)
```

이 코드는 목적함수의 구조를 보여주는 의사코드다. 갱신 빈도와 경계 처리는 실제 학습 설정에 맞춰야 한다.

### 샘플링 루프

학습할 때는 정답 이미지가 있으므로 마스킹된 연산으로 여러 위치의 조건부 로그확률을 함께 계산할 수 있다. 생성할 때는 아직 생성되지 않은 픽셀을 입력으로 사용할 수 없으므로 자기회귀 순서대로 값을 만들어야 한다.

```python
def sample(num_samples, domain):
    epsilon = sample_base_noise(num_samples)
    z = af_prior.forward(epsilon)

    # binary image: z -> (B, 64)
    # CIFAR10:      z -> (B, 16, 8, 8)

    x = empty_image_batch(num_samples, domain)

    for position in autoregressive_order(x):
        local_context = visible_values_in_receptive_field(x, position)
        distribution = local_decoder.predict(
            position=position,
            local_context=local_context,
            condition=z,
        )
        x[position] = sample_from(distribution)

    return x
```

학습과 샘플링의 비대칭은 VLAE의 비용을 이해하는 핵심이다. 학습에서는 이미 주어진 픽셀을 조건으로 로그우도를 계산할 수 있지만, 생성에서는 앞선 출력을 기다려야 한다. 저자가 단순한 VAE보다 생성이 느리다고 밝힌 이유가 이 순차적 디코딩이다.

### 이진 이미지 모델

이진 이미지 모델의 연속 잠재 변수는 64차원이다. 디코더는 필터 12개를 사용하는 $3\times3$ masked convolution 6계층 PixelCNN 변형이며, 수용 영역을 국소 패치로 제한한다. 활성화 함수는 ELU다.

인코더와 디코더의 기본 뼈대는 ResNet이다. 이진 이미지용 디코더는 기존의 $28\times28\times1$ 출력 대신 $28\times28\times4$를 출력하고, 이를 원본 이미지와 결합해 $28\times28\times5$ 형태를 사용한다. 채널 우선 구현으로 옮긴다면 내부 텐서 배치는 달라질 수 있지만, 원본 1채널과 조건 특징 4채널을 결합한다는 의미는 유지해야 한다.

masked convolution 사이에는 $1\times1$ convolution ResNet block 4개가 추가된다. masked convolution의 가중치는 공유했다. 다만 다른 데이터셋에서는 이 공유를 해제했을 때 성능이 높아졌다고 보고되어 있으므로, 가중치 공유를 모델의 본질적인 제약으로 일반화해서는 안 된다.

이진 이미지용 AF prior는 은닉 유닛 640개와 ReLU를 사용하는 3-layer mean-only MADE를 4스텝 쌓는다. 학습 설정은 다음과 같다.

- Adamax 학습률: 0.002
- Free bits: 0.01 nats/data-dim
- Polyak averaging: $\alpha=0.998$
- Validation으로 설정을 조정한 뒤 train과 validation 세트를 합쳐 재학습
- Data-dependent initialization을 적용한 weight normalization
- TensorFlow 구현

이 설정을 재현할 때는 검증 세트로 조정한 모델의 결과와, 조정 이후 train·validation을 합쳐 재학습한 최종 모델의 결과를 구분해야 한다. Polyak averaging을 적용한다면 원래 파라미터와 평균 파라미터 중 어느 쪽으로 평가했는지도 일관되게 관리해야 한다.

### CIFAR10 모델

CIFAR10에서는 잠재 표현이 16개의 $8\times8$ feature map, 즉 `(B, 16, 8, 8)` 형태다. 인코더는 다음 순서의 ResNet 구조를 사용한다.

```text
2 ResNet blocks
→ Conv(stride=2)
→ 2 ResNet blocks
→ Conv(stride=2)
→ 3 ResNet blocks
→ 1×1 convolution
```

디코더는 대칭 구조다. 채널 수는 $32\times32$ feature map 구간에서 48, 그 밖의 구간에서 96이다.

사전분포에는 은닉층 2개와 128개 feature map을 가진 PixelCNN 기반 AF를 6스텝 적용한다. 매 두 flow 사이마다 stochastic-unit 순서를 뒤집는다. 이 순서 반전을 빠뜨리면 연속된 흐름이 같은 자기회귀 방향만 사용하게 되므로, 논문이 구성한 변환과 달라진다.

관측 디코더는 channel-autoregressive Conditional PixelCNN++이며 64개 feature map으로 이루어진 4개 block을 사용한다. block 사이에는 Gated ResNet conditioning을 적용한다. 수용 영역별 vertical/horizontal convolution 깊이는 다음과 같다.

| 수용 영역 | Vertical convolution | Horizontal convolution |
|---|---:|---:|
| $4\times2$ | 1층 | 2층 |
| $5\times3$ | 2층 | 2층 |
| $7\times4$ | 3층 | 3층 |

따라서 수용 영역 실험은 단순히 마스크 크기 하나만 바꾸는 비교가 아니다. vertical·horizontal stack의 깊이도 함께 달라진다. 구현에서 동일한 깊이를 유지한 채 마스크 범위만 바꾸면 논문과 같은 조건이 아니다.

DenseNet VLAE는 기존 ResNet block 2개를 3스텝 DenseNet block 1개로 교체한다. CIFAR10의 $7\times4$ Grayscale 수용 영역 실험은 컬러 입력을 다음 식으로 변환했다.

$$
0.299R + 0.587G + 0.114B
$$

이 조건은 공간적 수용 영역과 색상 의존성이 잠재 코드에 미치는 영향을 나눠 살펴보기 위한 설정이다. 컬러 채널을 유지한 결과와 grayscale 결과를 비교할 때 전처리 차이를 빼먹으면, 잠재 코드가 보존한 색상 정보에 대한 해석이 달라진다.

![CIFAR10에서 수용 영역과 색상 조건에 따른 손실 표현](/assets/img/posts/variational-lossy-autoencoder/figure3.jpg){: w="700" }
_그림 2. CIFAR10에서 디코더의 공간적 수용 영역과 색상 입력 조건을 바꾸면 잠재 코드가 보존하는 형태와 색상 세부 정보가 달라진다. “전역 정보”가 고정된 의미 집합이 아니라 디코더가 직접 처리할 수 없는 통계에 의해 결정된다는 점이 중요하다._

## 실험 설정

평가는 Statically Binarized MNIST, Dynamically Binarized MNIST, OMNIGLOT, Caltech-101 Silhouettes, CIFAR10에서 수행했다. 비교 대상에는 Normalizing flows, DRAW, Discrete VAE, PixelRNN, IAF VAE, Deep GMMs, Real NVP, PixelCNN++ 등이 포함된다.

이진 이미지 데이터셋은 테스트 Negative Log-Likelihood(NLL)를 사용했고, 주변 NLL은 4,096개의 importance sample로 추정했다. CIFAR10은 bits/dim으로 평가했으며, VLAE의 likelihood는 512개의 importance sample로 근사했다. 두 평가에서 importance sample 수가 다르므로, 추정 방식과 표의 수치를 재현할 때 이 설정을 함께 기록해야 한다.

다른 모델과 벽시계 시간이나 GPU 비용을 비교하려면 하드웨어와 전체 학습 시간을 같은 기준으로 측정해야 한다.

Statically Binarized MNIST에서 수동으로 조정한 동일한 하이퍼파라미터를 Dynamically Binarized MNIST, OMNIGLOT, Caltech-101 Silhouettes에도 그대로 적용했다. OMNIGLOT에는 별도의 fine-tuning 결과도 함께 보고했다. 데이터셋마다 전면적인 하이퍼파라미터 탐색을 반복하지 않고도 여러 이진 이미지 데이터셋에서 성능이 유지되었다는 점은 설정의 이전 가능성을 보여준다. 다만 이 근거는 2D 이미지 데이터 안에서만 성립한다.

## 실험에서 확인한 것

### Statically Binarized MNIST

| Model | NLL Test |
|---|---:|
| Normalizing flows (Rezende & Mohamed, 2015) | 85.10 |
| DRAW (Gregor et al., 2015) | < 80.97 |
| Discrete VAE (Rolfe, 2016) | 81.01 |
| PixelRNN (van den Oord et al., 2016a) | 79.20 |
| IAF VAE (Kingma et al., 2016) | 79.88 |
| AF VAE | 79.30 |
| VLAE | 79.03 |

VLAE의 테스트 NLL은 79.03으로 표에서 가장 낮다. 잠재 변수 모델인 IAF VAE의 79.88과 AF VAE의 79.30보다 낮고, 잠재 변수 없이 강한 자기회귀 분포를 모델링하는 PixelRNN의 79.20보다도 낮다. 제한된 자기회귀 디코더와 잠재 코드의 역할 분담이 밀도 추정 성능을 포기하지 않고도 작동했음을 보여주는 결과다.

수렴한 VLAE의 평균 KL은

$$
\mathbb{E}
[D_{KL}(q(z|x)\Vert p(z))]
=
13.3\text{ nats}
=
19.2\text{ bits}
$$

였다. Factorized decoding을 사용하는 VAE의 평균 37.3 bits보다 적은 정보가 잠재 코드로 전달되었다. VLAE의 “lossy”는 단지 복원 이미지가 흐려졌다는 뜻이 아니라, KL로 측정되는 잠재 경로의 정보량이 실제로 감소했다는 의미를 가진다. 국소 정보는 자기회귀 디코더가 담당하므로 잠재 코드가 모든 픽셀 세부 사항을 운반할 필요가 없다.

또한 IAF posterior 대신 AF prior를 사용했을 때 Statically Binarized MNIST의 train NLL은 0.8 nat, test NLL은 0.6 nat 감소했다. 이는 흐름을 사후분포가 아니라 사전분포에 배치하는 선택이 훈련 데이터에만 맞춘 개선으로 끝나지 않고 테스트 NLL에도 반영되었음을 보여준다.

### Dynamically Binarized MNIST

| Model | NLL Test |
|---|---:|
| Convolutional VAE + HVI (Salimans et al., 2014) | 81.94 |
| DLGM 2hl + IWAE (Burda et al., 2015a) | 82.90 |
| Discrete VAE (Rolfe, 2016) | 80.04 |
| LVAE (Kaae Sønderby et al., 2016) | 81.74 |
| DRAW + VGP (Tran et al., 2015) | < 79.88 |
| IAF VAE (Kingma et al., 2016) | 79.10 |
| Unconditional Decoder | 87.55 |
| VLAE | 78.53 |

VLAE는 78.53을 기록했다. Unconditional Decoder의 87.55와 비교하면, 제한된 자기회귀 디코더만으로는 부족하고 잠재 경로가 데이터 설명에 실질적으로 기여한다는 점이 드러난다. IAF VAE의 79.10보다도 낮아 AF prior와 수용 영역 제약을 결합한 설계가 전체 결과에 반영되었다.

### OMNIGLOT

| Model | NLL Test |
|---|---:|
| VAE [1] | 106.31 |
| IWAE [1] | 103.38 |
| RBM (500 hidden) [2] | 100.46 |
| DRAW [3] | < 96.50 |
| Conv DRAW [4] | < 91.00 |
| Unconditional Decoder | 95.02 |
| VLAE | 90.98 |
| VLAE (fine-tuned) | 89.83 |

동일한 하이퍼파라미터를 적용한 VLAE는 90.98이고, OMNIGLOT에 맞춰 fine-tuning한 결과는 89.83이다. 별도의 조정 없이도 Unconditional Decoder의 95.02보다 낮았고, fine-tuning으로 추가 개선이 나타났다.

하지만 OMNIGLOT의 정성 결과에서는 손실 코드가 원하는 의미 정보를 항상 보존하지 않았다. 일부 사례에서는 의미적으로 중요한 정보도 함께 사라졌다. 디코더가 처리할 수 없는 통계가 자동으로 사람이 원하는 semantics와 일치하는 것은 아니다. 보존하고 싶은 통계를 과제와 데이터셋에 맞게 먼저 정하고, 그 정보가 디코더의 국소 경로로 우회하지 못하도록 제약을 설계해야 한다.

### Caltech-101 Silhouettes

| Model | NLL Test |
|---|---:|
| RWS SBN [1] | 113.3 |
| RBM [2] | 107.8 |
| NAIS NADE [3] | 100.0 |
| Discrete VAE [4] | 97.6 |
| SpARN [5] | 88.48 |
| Unconditional Decoder | 89.26 |
| VLAE | 77.36 |

VLAE의 NLL은 77.36이다. Unconditional Decoder는 89.26, SpARN은 88.48이었다. 이 데이터셋에서도 잠재 변수와 제한된 자기회귀 디코더의 결합이 자기회귀 디코더 단독보다 낮은 NLL을 보였다.

### CIFAR10

| Method | bits/dim $\le$ |
|---|---:|
| **Results with tractable likelihood models** | |
| Uniform distribution [1] | 8.00 |
| Multivariate Gaussian [1] | 4.70 |
| NICE [2] | 4.48 |
| Deep GMMs [3] | 4.00 |
| Real NVP [4] | 3.49 |
| PixelCNN [1] | 3.14 |
| Gated PixelCNN [5] | 3.03 |
| PixelRNN [1] | 3.00 |
| PixelCNN++ [6] | 2.92 |
| **Results with variationally trained latent-variable models** | |
| Deep Diffusion [7] | 5.40 |
| Convolutional DRAW [8] | 3.58 |
| ResNet VAE with IAF [9] | 3.11 |
| ResNet VLAE | 3.04 |
| DenseNet VLAE | 2.95 |

ResNet VLAE는 3.04 bits/dim으로 ResNet VAE with IAF의 3.11보다 낮다. DenseNet VLAE는 2.95로 더 낮아지며, 표의 tractable likelihood 모델 가운데 PixelCNN++의 2.92와 가까운 수준이다. 잠재 변수 모델이 강한 자기회귀 계열과 비슷한 밀도 추정 범위에 접근하면서 동시에 제어 가능한 손실 표현을 제공한다는 것이 이 비교에서 읽어야 할 지점이다.

다만 VLAE 수치는 512개 importance sample을 사용한 근사 likelihood다. Tractable likelihood 모델과 동일한 방식으로 정확한 likelihood를 계산한 값으로 취급해서는 안 된다.

수용 영역별로는 $4\times2$ VLAE가 3.12 bits/dim, $7\times4$ VLAE가 2.95 bits/dim을 기록했다. 더 큰 수용 영역을 가진 디코더가 관측 공간의 의존성을 더 많이 직접 처리하면서 밀도 추정 수치는 좋아졌다. 그 대신 잠재 코드가 보존하는 세부 형태와 색상 정보도 달라진다. 따라서 수용 영역 크기는 NLL만 보고 고를 하이퍼파라미터가 아니라, 원하는 표현의 정보 범위와 함께 결정해야 한다.

## 무엇이 성능을 만들었나

Dynamically Binarized MNIST의 ablation은 무조건부 PixelCNN, Gaussian prior를 가진 잠재 변수 모델, AF prior를 가진 모델을 순서대로 비교한다.

| Model | NLL Test | KL |
|---|---:|---:|
| Unconditional PixelCNN | 87.55 | 0 |
| PixelCNN Decoder + Gaussian Prior | 79.48 | 10.60 |
| PixelCNN Decoder + AF Prior | 78.94 | 11.73 |

Unconditional PixelCNN은 잠재 변수가 없으므로 KL이 0이고 NLL은 87.55다. Gaussian prior와 잠재 경로를 추가하면 KL 10.60만큼의 정보를 사용하면서 NLL이 79.48로 낮아진다. 제한된 PixelCNN 디코더에 잠재 코드가 추가되었을 때 성능이 크게 개선되므로, 디코더가 무시하는 전역 정보를 잠재 경로가 실제로 보완하고 있음을 알 수 있다.

Gaussian prior를 AF prior로 바꾸면 NLL은 79.48에서 78.94로 0.54 낮아지고, KL은 10.60에서 11.73으로 1.13 증가한다. 더 유연한 사전분포가 단순히 같은 잠재 표현의 밀도만 더 잘 맞춘 것이 아니라, 잠재 코드가 더 많은 정보를 전송할 수 있게 한 결과로 읽을 수 있다.

이 ablation에서 세 구성 요소의 역할은 다음처럼 정리된다.

- 제한된 PixelCNN 디코더만 사용하면 국소 구조는 처리할 수 있지만 NLL이 87.55에 머문다.
- 잠재 변수를 추가하면 디코더 범위 밖의 정보를 전달해 NLL이 79.48로 개선된다.
- Gaussian prior를 AF prior로 교체하면 더 복잡한 잠재 분포를 모델링하며 NLL이 78.94로 추가 개선되고 KL도 11.73으로 증가한다.

따라서 최종 성능을 AF prior 하나의 효과로만 설명할 수는 없다. 먼저 제한된 디코더와 잠재 코드의 역할 분담이 큰 폭의 개선을 만들고, AF prior가 그 잠재 경로를 더 유연하게 만든다.

## 비용과 트레이드오프

VLAE가 얻는 것은 제어 가능한 정보 배치와 높은 밀도 추정 성능이고, 지불하는 비용은 자기회귀 디코더의 순차성이다. 일반적인 VAE 디코더가 관측값을 병렬적으로 생성할 수 있는 구조라면, PixelCNN 계열 디코더는 앞에서 생성된 값을 조건으로 다음 값을 생성해야 한다. 저자도 단순한 VAE보다 생성이 느리다는 점을 명시적인 한계로 적었다.

학습 비용에서는 AF prior와 IAF posterior의 배치가 중요하다. 논문은 IAF posterior 대신 AF prior를 사용하면 학습 비용 증가 없이 더 깊은 생성 경로를 가질 수 있다고 설명한다. 그러나 AF prior 자체는 이진 이미지에서 4스텝 MADE, CIFAR10에서 6스텝 PixelCNN으로 구성된다. 따라서 “추가 비용이 없다”는 표현은 해당 설계 비교의 문맥에서 이해해야 하며, 전체 VLAE가 단순한 고정 prior VAE와 계산량이나 메모리 사용량이 같다는 뜻으로 확대할 근거는 없다.

평가 비용도 작지 않다. 이진 이미지의 marginal NLL은 4,096개 importance sample, CIFAR10 VLAE는 512개 importance sample을 사용해 추정했다. 샘플 수가 늘어나면 likelihood 추정은 정교해질 수 있지만 평가 계산량과 메모리 부담도 증가한다.

경량화 관점에서는 두 종류의 비용을 분리해야 한다.

첫째는 표현의 정보량이다. Statically Binarized MNIST에서 VLAE의 잠재 코드는 19.2 bits를 사용해 factorized decoding VAE의 37.3 bits보다 더 손실적인 표현을 만들었다. 저장하거나 후속 모델에 전달할 잠재 표현 자체는 더 작은 정보량으로 전역 구조를 보존할 수 있다.

둘째는 생성기의 실행 비용이다. 작은 잠재 코드를 얻었다고 해서 전체 생성기가 가벼워지는 것은 아니다. 자기회귀 디코더는 픽셀을 순차적으로 생성하며, CIFAR10 모델은 여러 block의 Conditional PixelCNN++와 다단계 AF prior를 사용한다. 표현 압축과 빠른 생성은 서로 다른 목표다.

수용 영역도 동일한 트레이드오프를 만든다. 작은 수용 영역은 더 많은 정보를 잠재 코드로 밀어 넣지만 디코더의 밀도 모델링 능력을 제한한다. 큰 수용 영역은 CIFAR10의 bits/dim을 3.12에서 2.95로 개선했지만, 디코더가 더 많은 세부 통계를 직접 처리하게 한다. 실제 적용에서는 다음 중 무엇이 우선인지 정해야 한다.

- 밀도 추정 성능
- 잠재 코드가 보존해야 할 정보의 범위
- 생성 지연 시간
- 잠재 표현의 정보량
- AF prior와 자기회귀 디코더가 요구하는 모델 복잡도

하드웨어, 학습 시간, 파라미터 수는 보고되지 않았으므로 이 항목들의 절대 비용이나 다른 모델 대비 속도 배율은 판단할 수 없다.

## 이 논문의 자리

VLAE는 VAE와 자기회귀 생성 모델 중 하나를 선택하지 않고 두 모델의 구조적 강점을 분리해 사용한다. VAE는 확률적 잠재 표현과 추론 경로를 제공하고, PixelCNN 계열은 국소적인 관측 통계를 정밀하게 모델링한다. 핵심은 강한 디코더를 그대로 붙이는 것이 아니라, 수용 영역을 조절해 잠재 변수와 디코더 사이의 업무 경계를 만든 데 있다.

이 관점은 posterior collapse를 단순한 학습 실패로만 보지 않게 한다. 디코더가 잠재 변수 없이도 데이터를 설명할 수 있다면, KL을 지불하면서 $z$를 사용할 이유가 없다. 따라서 KL annealing이나 free bits는 최적화 과정에서 잠재 경로를 살려 두는 역할을 하고, 수용 영역 제한은 최적화가 끝난 뒤에도 그 경로가 담당할 정보가 남도록 구조를 설계하는 역할을 한다. 두 접근은 대체재라기보다 서로 다른 층의 문제를 다룬다.

AF prior 역시 표현력이 높은 분포를 어디에 배치할지에 대한 선택이다. IAF를 inference model에 두어 $q(z|x)$를 복잡하게 만드는 대신, AF를 prior에 두어 생성 경로의 $p(z)$를 복잡하게 만든다. 식 (13)과 식 (14)는 두 구성이 변수 변환 관점에서 대응됨을 보여주며, 실험에서는 AF prior가 train과 test NLL을 모두 낮췄다.

일반화 가능성에 대한 근거는 제한적이다. 동일한 하이퍼파라미터가 여러 이진 이미지 데이터셋에서 좋은 결과를 냈고 CIFAR10에서도 ResNet·DenseNet 구성으로 성능을 보였으므로, 특정 이미지 데이터셋 하나에만 맞춘 아이디어는 아니다. 그러나 모든 실험이 2D 이미지에 한정되어 있다. 오디오나 비디오처럼 시간축의 의존성이 중요한 데이터에서도 어떤 수용 영역이 국소 정보와 전역 정보를 나누는지는 이 결과만으로 알 수 없다.

## 한계와 생각해볼 점

저자가 밝힌 첫 번째 한계는 생성 속도다. VLAE의 디코더는 자기회귀적이므로 단순한 VAE보다 샘플 생성이 느리다. 잠재 표현이 더 손실적이고 작아졌다는 사실이 픽셀 생성 과정까지 병렬화해 주지는 않는다. 빠른 온라인 생성이 중요한 환경에서는 밀도 추정 성능과 표현 제어의 이득이 순차 디코딩 비용을 상쇄하는지 따로 평가해야 한다.

두 번째 한계는 실험 범위다. 결과는 2D 이미지에 한정되어 있으며, 오디오와 비디오처럼 temporal aspect를 가진 데이터로의 확장은 향후 과제로 남아 있다. 다른 모달리티에서도 “국소 정보는 제한된 자기회귀 모델, 전역 정보는 잠재 코드”라는 분해가 가능해 보이지만, 어떤 시간 범위를 국소 수용 영역으로 정의해야 하는지는 논문에서 확인되지 않는다.

세 번째로, OMNIGLOT 결과는 구조적 제약만으로 원하는 의미 표현을 보장할 수 없음을 보여준다. VLAE가 보존하는 것은 사람이 의미 있다고 지정한 정보가 아니라, 제한된 디코더가 직접 모델링하지 못하는 정보다. 두 집합이 겹칠 수는 있지만 항상 같지는 않다. 따라서 분류, 검색, 압축과 같은 특정 과제에 사용하려면 어떤 통계를 보존해야 하는지 먼저 정하고 디코더의 공간·채널·시간 의존성을 그에 맞춰 설계해야 한다.

이 논문에서 가장 중요한 지점은 잠재 표현의 성질을 손실 함수 하나에 맡기지 않았다는 점이다. 복원 항과 KL 항은 정보량의 균형을 조절하지만, 어떤 정보가 남을지는 디코더의 구조가 결정한다. VLAE는 수용 영역이라는 구체적인 설계 변수로 그 구조를 조절했다.

반면 수용 영역과 semantic information의 관계를 자동으로 선택하는 방법은 논문 범위 밖이다. CIFAR10의 공간적 수용 영역과 grayscale 조건처럼 사람이 보존할 통계를 예상해 구조를 정해야 한다. 데이터와 과제가 바뀌었을 때 적절한 제약을 자동으로 찾을 수 있는지, 더 큰 모델에서도 같은 정보 선호 성질이 안정적으로 나타나는지, 실제 생성 지연 시간이 어느 정도인지는 제시된 결과만으로 판단할 수 없다.
