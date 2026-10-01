---
title: "Common Diffusion Noise Schedules and Sample Steps are Flawed"
date: 2026-09-08 11:10:47 +0900
permalink: /posts/common-diffusion-noise-schedules/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion-model, noise-schedule, stable-diffusion, classifier-free-guidance]
description: "확산 모델의 학습과 추론 사이에 발생하는 terminal SNR 및 샘플 타임스텝 불일치를 분석하고, 이를 바로잡는 네 가지 수정 방법을 정리한다."
paper:
  zotero_key: "TQM9I3K9"
  authors: "Shanchuan Lin, Bingchen Liu, Jiashi Li, Xiao Yang"
  venue: "WACV"
---

## 세 줄 요약

널리 쓰이는 확산 모델은 마지막 학습 타임스텝에도 원본 신호를 조금 남겨 두면서, 추론은 신호가 전혀 없는 Gaussian 노이즈에서 시작하는 학습-추론 불일치를 갖는다. 이 논문은 마지막 신호 대 잡음비(signal-to-noise ratio, SNR)를 정확히 0으로 만들고, 이에 맞춰 $v$ 예측·trailing 타임스텝·Classifier-Free Guidance 재스케일링을 함께 적용한다. Stable Diffusion 2.1-base를 파인튜닝한 실험에서 이 수정 조합은 극단적인 밝기의 이미지 생성 범위를 넓히면서 FID를 22.96에서 21.66으로 낮추고 IS를 34.11에서 36.16으로 높였다.

## 이 논문이 풀려는 문제

확산 모델의 순방향 과정은 데이터에 Gaussian 노이즈를 단계적으로 더해 정보를 파괴한다. 역방향 과정은 반대로 노이즈가 섞인 상태에서 시작해 데이터를 복원한다. 이 설명만 보면 학습의 마지막 상태 $x_T$와 추론의 초기 상태가 당연히 같은 분포일 것 같지만, 실제로 널리 쓰이는 노이즈 스케줄은 그렇지 않다.

학습 중 만들어지는 $x_T$에는 원본 $x_0$의 신호가 조금 남아 있다. 반면 추론은 평균이 0인 순수 Gaussian 노이즈에서 시작한다. 모델은 학습 중에만 관찰한 저주파 신호, 특히 채널별 평균과 연결되는 밝기 정보를 사용할 수 있는데, 추론 입력에서는 그 정보가 사라진다.

Stable Diffusion의 사례가 이 차이를 수치로 보여준다. 마지막 타임스텝 $T=1000$에서도

$$
x_T = 0.068265 \cdot x_0 + 0.997667 \cdot \epsilon
\tag{10}
$$

이므로 원본 신호 계수 $\sqrt{\bar{\alpha}_T}$가 $0.068265$만큼 남는다. 이에 대응하는 $\operatorname{SNR}(T)$는 $0.004682$다. 값만 보면 작아 보이지만, 잔존 신호에는 이미지의 채널별 평균처럼 공간 전체에 걸친 저주파 정보가 들어갈 수 있다. 학습된 모델은 이 단서를 참조해 복원을 시작하지만, 실제 생성에서는 그 단서가 없는 순수 노이즈를 받는다.

논문은 이 불일치가 생성 밝기 범위를 제한한다고 해석한다. 밝기 범위를 $[-1,1]$로 놓으면 순수 Gaussian 노이즈의 평균은 0 근처이므로, 모델은 중간 밝기 주변의 결과를 내는 쪽으로 치우친다. 그 결과 “Solid black color”나 “A white background”처럼 목표 밝기가 명시적인 프롬프트도 제대로 따르기 어렵다.

노이즈 스케줄만의 문제도 아니다. DDIM과 PNDM 등에서 사용되는 leading 방식은 적은 수의 샘플 타임스텝을 고를 때 학습의 마지막 타임스텝 $T$를 포함하지 않는다. 모델을 $t=T$까지 학습해 놓고도 추론은 $t<T$에서 시작하는 셈이다. 마지막 SNR을 0으로 고친 뒤에도 샘플러가 그 타임스텝을 방문하지 않는다면 학습과 추론의 시작점을 맞췄다고 할 수 없다.

기존의 offset noise는 다른 방향에서 밝기 문제를 완화한다. 픽셀마다 독립적인 노이즈에 채널 공유 편향을 더해 모델이 입력 평균을 믿지 않도록 만든다. 이 방법은 밝거나 어두운 이미지를 생성할 수 있게 하지만, 픽셀 노이즈의 독립동일분포(i.i.d.) 가정을 깨뜨린다. 논문은 이를 확산 과정 자체를 일관되게 고치는 해법이라기보다, 모델이 평균 신호를 무시하도록 만드는 임시적인 트릭으로 본다. 실제 데이터 분포와 맞지 않을 정도로 지나치게 밝거나 어두운 결과를 만들 수 있다는 점도 지적한다.

이 논문의 설계는 따라서 네 부분이 묶여 있다.

1. 마지막 SNR이 정확히 0이 되도록 노이즈 스케줄을 재조정한다.
2. SNR 0에서 학습 신호를 유지할 수 있도록 $\epsilon$ 예측을 $v$ 예측으로 바꾼다.
3. 추론이 반드시 마지막 타임스텝 $T$에서 시작하도록 trailing 타임스텝을 사용한다.
4. 낮은 SNR에서 증폭되는 Classifier-Free Guidance의 과다노출을 재스케일링으로 완화한다.

한 요소만 바꾸는 패치가 아니라, 순방향 과정의 종점과 역방향 과정의 시작점을 맞춘 뒤 그 변화로 발생하는 학습 목표와 guidance의 부작용까지 함께 처리하는 구성이다.

## 순방향 확산에서 terminal SNR이 의미하는 것

### 마르코프 전이와 닫힌 형태

순방향 확산 과정은 다음 조건부 결합분포로 정의된다.

$$
q(x_{1:T}\mid x_0)
:=
\prod_{t=1}^{T}q(x_t\mid x_{t-1})
\tag{1}
$$

$x_0$는 원본 데이터이고, $x_1,\ldots,x_T$는 점차 노이즈가 증가하는 잠재 변수다. Eq. 1의 곱 형태는 현재 상태 $x_t$가 직전 상태 $x_{t-1}$에만 의존하는 마르코프 구조를 나타낸다.

각 전이는 다음 Gaussian 분포다.

$$
q(x_t\mid x_{t-1})
:=
\mathcal{N}
\left(
x_t;
\sqrt{1-\beta_t}\,x_{t-1},
\beta_t\mathbf{I}
\right)
\tag{2}
$$

$\beta_t$는 학습되는 값이 아니라 미리 정의한 분산 스케줄이다. 평균에 곱해지는 $\sqrt{1-\beta_t}$는 이전 신호를 줄이고, 공분산 $\beta_t\mathbf I$는 그만큼 새 노이즈를 추가한다. 논문이 variance-preserving 정식화를 택하는 이유도 이 신호와 노이즈의 균형 안에서 terminal SNR을 정확히 제어할 수 있기 때문이다.

$\alpha_t:=1-\beta_t$와 $\bar{\alpha}_t:=\prod_{s=1}^{t}\alpha_s$를 정의하면, $t$번의 전이를 하나씩 실행하지 않고도 $x_0$에서 $x_t$로 바로 갈 수 있다.

$$
q(x_t\mid x_0)
:=
\mathcal{N}
\left(
x_t;
\sqrt{\bar{\alpha}_t}\,x_0,
(1-\bar{\alpha}_t)\mathbf I
\right)
\tag{3}
$$

Eq. 3의 평균에 있는 $\sqrt{\bar{\alpha}_t}$는 $t$까지 살아남은 원본 신호의 크기이고, 분산 $1-\bar{\alpha}_t$는 누적된 노이즈의 크기다. 이를 재매개변수화하면

$$
x_t
:=
\sqrt{\bar{\alpha}_t}x_0
+
\sqrt{1-\bar{\alpha}_t}\epsilon,
\qquad
\epsilon\sim\mathcal N(\mathbf 0,\mathbf I)
\tag{4}
$$

을 얻는다. 이 표현은 임의의 $t$에 대한 학습 샘플을 한 번에 만들 수 있게 한다. 순방향 체인을 $1$부터 $t$까지 실제로 반복할 필요가 없으며, 무작위성도 외부 노이즈 $\epsilon$으로 분리된다.

Eq. 4에서 신호 분산은 $\bar{\alpha}_t$, 노이즈 분산은 $1-\bar{\alpha}_t$이므로 SNR은

$$
\operatorname{SNR}(t)
:=
\frac{\bar{\alpha}_t}{1-\bar{\alpha}_t}
\tag{5}
$$

이다. 따라서 terminal SNR이 0이라는 조건은 단순히 “마지막 노이즈가 충분히 크다”는 정성적 표현이 아니다.

$$
\operatorname{SNR}(T)=0
\quad\Longleftrightarrow\quad
\bar{\alpha}_T=0
\quad\Longleftrightarrow\quad
\sqrt{\bar{\alpha}_T}=0
$$

이때 Eq. 4는 $x_T=\epsilon$이 되어 학습의 마지막 입력과 추론의 초기 순수 Gaussian 노이즈가 같은 형태가 된다. variance-preserving 정식화에서는 $\bar{\alpha}_T=0$을 만들려면 마지막 누적곱에 포함되는 $\alpha_T$가 0이어야 하므로 $\beta_T=1$이다.

### 실제 스케줄은 얼마나 많은 신호를 남기는가

논문이 비교한 세 스케줄은 모두 $T=1000$에서 SNR이 정확히 0이 아니다.

| Schedule | $\operatorname{SNR}(T)$ | $\sqrt{\bar{\alpha}_T}$ |
|---|---:|---:|
| Linear | $4.035993\times10^{-5}$ | $0.006353$ |
| Cosine | $2.428735\times10^{-9}$ | $4.928220\times10^{-5}$ |
| Stable Diffusion | $0.004682$ | $0.068265$ |

Linear 스케줄은

$$
\beta_t
=
0.0001(1-i)+0.02i,
\qquad
i=\frac{t-1}{T-1}
$$

를 사용한다. Cosine 스케줄은

$$
\bar{\alpha}_t=\frac{f(t)}{f(0)},
\qquad
f(t)=
\cos\left(
\frac{i+0.008}{1+0.008}\cdot\frac{\pi}{2}
\right)^2
$$

에서 인접한 누적곱의 비로 $\beta_t$를 만들되, $\beta_t$를 최대 $0.999$로 클리핑한다. 이 클리핑이 $\beta_T=1$을 막기 때문에 terminal SNR이 정확히 0에 도달하지 않는다. 논문에 따르면 Cosine 스케줄은 재조정 알고리즘을 적용할 필요 없이 이 클리핑만 제거하면 된다.

Stable Diffusion 스케줄은

$$
\beta_t
=
\left(
\sqrt{0.00085}(1-i)+\sqrt{0.012}i
\right)^2
$$

를 사용하며, 세 스케줄 중 마지막 잔존 신호가 가장 크다. 이 표에서 읽어야 할 핵심은 수치의 상대적인 크기만이 아니다. Cosine 스케줄처럼 terminal SNR이 극히 작더라도 수학적으로 0은 아니며, Stable Diffusion에서는 Eq. 10으로 드러날 만큼 원본 신호가 남는다.

## 역방향 과정과 예측 타깃

순방향 과정이 정보를 파괴한다면 생성 모델은 다음 역방향 결합분포를 학습한다.

$$
p_\theta(x_{0:T})
:=
p(x_T)
\prod_{t=1}^{T}
p_\theta(x_{t-1}\mid x_t)
\tag{6}
$$

$p(x_T)$가 생성 시작점의 사전분포이고, $p_\theta(x_{t-1}\mid x_t)$가 한 단계씩 데이터를 복원하는 전이다. 각 전이는

$$
p_\theta(x_{t-1}\mid x_t)
:=
\mathcal N
\left(
x_{t-1};
\tilde{\mu}_t,
\tilde{\beta}_t\mathbf I
\right)
\tag{7}
$$

로 매개변수화된다. $\beta_t$가 작을 때 역방향 단계가 Gaussian으로 근사된다는 성질을 이용한 형태다.

모델이 노이즈 $\epsilon$을 예측한다면 평균은

$$
\tilde{\mu}_t
:=
\frac{1}{\sqrt{\alpha_t}}
\left(
x_t-
\frac{\beta_t}{\sqrt{1-\bar{\alpha}_t}}\epsilon
\right)
\tag{8}
$$

로 나타낼 수 있다. Eq. 4를 $x_0$에 대해 풀고 이를 순방향 사후확률의 평균에 대입한 결과다. 첫 항 $x_t$는 현재 상태를 유지하는 기준이고, 예측된 $\epsilon$에 곱해지는 두 번째 항은 현재 상태에서 제거할 노이즈의 크기를 정한다. 전체를 $\sqrt{\alpha_t}$로 나누어 한 단계 이전의 스케일로 돌린다.

사후확률 분산은

$$
\tilde{\beta}_t
:=
\frac{1-\bar{\alpha}_{t-1}}
{1-\bar{\alpha}_t}
\beta_t
\tag{9}
$$

이다. 현재까지 누적된 노이즈와 직전 단계까지 누적된 노이즈의 비율이 한 단계 역전이의 불확실성을 조절한다. Eq. 8과 Eq. 9는 각각 역방향 Gaussian의 평균과 분산을 채운다.

여기서 terminal SNR을 0으로 만들면 기존 $\epsilon$ 예측의 약점이 드러난다. $t=T$에서 $x_T=\epsilon$이므로 모델 입력에 이미 정답 노이즈가 그대로 들어 있다. 모델이 입력을 복사하기만 해도 $\epsilon$ 예측 손실을 줄일 수 있으므로, 이 타임스텝에서는 데이터 분포를 배우도록 유도하는 학습 신호가 사라진다.

논문은 이를 피하기 위해 속도(velocity) 예측을 사용한다.

$$
v_t
=
\sqrt{\bar{\alpha}_t}\epsilon
-
\sqrt{1-\bar{\alpha}_t}x_0
\tag{11}
$$

낮은 노이즈 영역에서는 $\epsilon$ 성분이 크게 반영되고, terminal SNR에 가까워질수록 $x_0$ 성분이 지배한다. 따라서 $t=T$에서도 단순히 입력 노이즈를 복사하는 것으로 목표를 맞출 수 없다.

학습 손실은

$$
\mathcal L
=
\lambda_t
\left\lVert
v_t-\tilde v_t
\right\rVert_2^2,
\qquad
\lambda_t=1
\tag{12}
$$

이다. $\tilde v_t$는 모델 예측이고, 논문은 모든 타임스텝에 동일한 가중치 $\lambda_t=1$을 적용한다.

> 원문 설명과 수식 사이에는 구현에 직접 영향을 주는 부호 모순이 있다. 본문은 $\bar{\alpha}_T=0$일 때 $v_T=x_0$라고 설명하지만, Eq. 11에 그대로 대입하면 $v_T=-x_0$이다. 뒤의 Eq. 19도 $x_0=-v$를 준다. 따라서 수식을 기준으로 구현하면 terminal target은 $-x_0$이다.
{: .prompt-warning }

부호와 무관하게 논문의 핵심 논리는 유지된다. terminal step의 목표가 입력 노이즈 자체가 아니라 데이터 $x_0$와 연결되므로, 모델은 순수 노이즈만 보고 조건부 데이터 분포의 L2 평균에 해당하는 출력을 학습해야 한다. 다만 실제 코드를 옮길 때는 Eq. 11과 Eq. 19가 같은 부호 규약을 사용하도록 반드시 확인해야 한다.

## Zero terminal SNR 스케줄 만들기

### 왜 $\sqrt{\bar{\alpha}_t}$ 공간에서 조정하는가

기존 스케줄을 통째로 새로 설계할 수도 있지만, 논문의 Algorithm 1은 원래 곡선의 형태를 가능한 한 유지하면서 끝점만 0으로 옮긴다. 조정 대상은 SNR 자체가 아니라 Eq. 4의 신호 혼합 계수인 $\sqrt{\bar{\alpha}_t}$다.

기존 값을 $a_t=\sqrt{\bar{\alpha}_t}$라고 하자. 알고리즘은 먼저 마지막 값 $a_T$를 모든 점에서 빼서 종점을 0으로 이동한다. 이 연산만 적용하면 시작점도 $a_1-a_T$로 줄어든다. 따라서 시작값 $a_1$을 복구하는 비율

$$
\frac{a_1}{a_1-a_T}
$$

을 다시 곱한다. 중간 타임스텝의 최종 변환은

$$
\sqrt{\bar{\alpha}_t}
\leftarrow
\left(
\sqrt{\bar{\alpha}_t}
-
\sqrt{\bar{\alpha}_T}
\right)
\frac{
\sqrt{\bar{\alpha}_1}
}{
\sqrt{\bar{\alpha}_1}
-
\sqrt{\bar{\alpha}_T}
},
\qquad
t=2,\ldots,T-1
$$

이다.

이 아핀 변환은 두 경계조건을 동시에 만족한다.

- $t=1$에서는 원래 $\sqrt{\bar{\alpha}_1}$을 보존한다.
- $t=T$에서는 $\sqrt{\bar{\alpha}_T}=0$이 된다.

중간점은 같은 선형 변환을 받으므로 원래 곡선의 상대적인 모양을 보존한다. 논문은 SNR 공간에서 직접 변환하는 것보다 $\sqrt{\bar{\alpha}_t}$ 공간에서 조정하는 편이 기존 스케줄 곡선을 더 잘 유지한다고 설명한다.

조정된 $\bar{\alpha}_t$에서 다시 $\alpha_t$와 $\beta_t$를 복원하면 된다.

$$
\alpha_t
=
\frac{\bar{\alpha}_t}{\bar{\alpha}_{t-1}},
\qquad
\beta_t=1-\alpha_t
$$

마지막 누적곱이 0이므로 마지막 $\alpha_T$는 0, $\beta_T$는 1이 된다. 앞으로 새 스케줄을 설계한다면 사후 보정보다 처음부터 $\beta_T=1$을 경계조건으로 포함하는 것이 논문의 제안이다.

### 구현 의사코드

다음 코드는 Algorithm 1과 $\alpha_t,\bar{\alpha}_t,\beta_t$의 정의만 옮긴 의사코드다. 배열 인덱스는 논문의 $1,\ldots,T$ 대신 구현에서 흔한 $0,\ldots,T-1$을 사용한다.

```python
def rescale_zero_terminal_snr(betas):
    # betas: (T,)
    alphas = 1.0 - betas                         # (T,)
    alpha_bar = cumulative_product(alphas)       # (T,)
    sqrt_alpha_bar = sqrt(alpha_bar)             # (T,)

    first = sqrt_alpha_bar[0]
    terminal = sqrt_alpha_bar[-1]

    # 종점을 0으로 평행이동한 뒤 첫 값을 원래 크기로 복원한다.
    sqrt_alpha_bar = sqrt_alpha_bar - terminal   # (T,)
    sqrt_alpha_bar = (
        sqrt_alpha_bar
        * first
        / (first - terminal)
    )                                            # (T,)

    alpha_bar_new = sqrt_alpha_bar ** 2           # (T,)

    # alpha_bar[t] / alpha_bar[t-1]로 단일 단계 alpha를 복원한다.
    alphas_new = empty_like(alpha_bar_new)        # (T,)
    alphas_new[0] = alpha_bar_new[0]
    alphas_new[1:] = (
        alpha_bar_new[1:] / alpha_bar_new[:-1]
    )

    betas_new = 1.0 - alphas_new                  # (T,)
    return betas_new
```

여기서 확인할 경계조건은 `sqrt_alpha_bar[-1] == 0`, `betas_new[-1] == 1`이다. 부동소수점 계산에서는 이론적 경계가 실제 배열에서도 의도한 값으로 표현되는지 점검해야 한다. 특히 이후 샘플러가 $\alpha_T=0$을 분모로 사용하는 식을 갖고 있다면 스케줄 생성은 성공해도 샘플링은 실패할 수 있다.

Cosine 스케줄에는 이 재조정이 필요하지 않다. 이 경우 terminal SNR을 막고 있던 $\beta_t\le0.999$ 클리핑을 제거하는 것이 논문이 제시한 처리다. 반대로 non-cosine 스케줄에는 위 재조정이 필요하다.

## 학습 루프 — $\epsilon$ 예측에서 $v$ 예측으로

학습 중에는 데이터 $x_0$, 무작위 타임스텝 $t$, Gaussian 노이즈 $\epsilon$을 뽑는다. Eq. 4로 $x_t$를 만들고 Eq. 11로 목표 $v_t$를 구성한다.

```python
def training_step(model, x0, condition, alpha_bar):
    # x0:        (B, C, H, W)
    # condition: 모델의 조건 입력
    # alpha_bar: (T,)

    t = sample_timesteps(batch_size=x0.shape[0])  # (B,)
    eps = standard_normal_like(x0)                # (B, C, H, W)

    a = sqrt(alpha_bar[t])                        # (B,)
    s = sqrt(1.0 - alpha_bar[t])                  # (B,)
    a = reshape_for_broadcast(a)                  # (B, 1, 1, 1)
    s = reshape_for_broadcast(s)                  # (B, 1, 1, 1)

    xt = a * x0 + s * eps                         # (B, C, H, W)
    v_target = a * eps - s * x0                   # (B, C, H, W), Eq. 11

    v_pred = model(xt, t, condition)              # (B, C, H, W)
    loss = squared_l2(v_target - v_pred)          # scalar, lambda_t = 1
    return loss
```

여기서 자주 틀릴 수 있는 부분은 네 가지다.

첫째, 논문의 타임스텝은 $1,\ldots,T$지만 실제 배열은 대개 $0,\ldots,T-1$이다. 논문의 $t=T$는 코드의 `t == T - 1`에 해당한다. 스케줄은 올바르게 고쳤지만 샘플러가 `T`를 배열 인덱스로 사용하면 범위를 벗어나고, 반대로 마지막 인덱스를 빼면 논문이 지적한 불일치가 그대로 남는다.

둘째, $\bar{\alpha}_t$는 $\alpha_t$의 누적곱이다. $\beta_t$를 누적하거나 $\alpha_t$ 대신 $\sqrt{\alpha_t}$를 누적하면 Eq. 4의 분산 관계가 달라진다.

셋째, Eq. 11의 부호 규약을 샘플러의 Eq. 17·Eq. 19와 일치시켜야 한다. 학습에서는 $v=a\epsilon-sx_0$를 쓰면서 복원에서는 반대 부호 공식을 쓰면 모델 출력에서 $x_0$와 $\epsilon$을 올바르게 복구할 수 없다.

넷째, terminal step을 학습 배치에서 실제로 표본화해야 한다. 배열 범위를 반열림 구간으로 구현하면서 마지막 인덱스가 빠지면 zero terminal SNR을 설계해 놓고도 해당 경계조건을 학습하지 않는 결과가 된다.

## 샘플링 루프 — 마지막 타임스텝부터 시작하기

### Leading, Linspace, Trailing

모델이 총 $T$개 타임스텝으로 학습되었더라도 생성에서는 보통 그보다 적은 $S$개 스텝만 선택한다. 논문은 선택 방식을 세 종류로 비교한다.

| 방식 | 이산화 | $T=1000,\ S=10$일 때 선택 |
|---|---|---|
| Leading | $\operatorname{arange}(1,T+1,\lfloor T/S\rfloor)$ | 1, 101, 201, 301, 401, 501, 601, 701, 801, 901 |
| Linspace | $\operatorname{round}(\operatorname{linspace}(1,T,S))$ | 1, 112, 223, 334, 445, 556, 667, 778, 889, 1000 |
| Trailing | $\operatorname{round}(\operatorname{flip}(\operatorname{arange}(T,0,-T/S)))$ | 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000 |

Leading은 $T=1000$까지 학습한 모델을 $t=901$에서 시작하게 한다. zero terminal SNR 스케줄이라면 $t=1000$만 순수 노이즈에 대응하므로, leading은 시작 분포를 다시 어긋나게 만든다.

Linspace는 양 끝인 1과 1000을 모두 포함한다. 그러나 $x_1$과 $x_0$의 차이는 작은 $\beta_1$에 의한 미세한 노이즈뿐이어서, 제한된 샘플 예산에서 $t=1$을 반드시 포함하는 효용은 작다.

Trailing은 마지막 타임스텝을 포함하면서 뒤쪽을 기준으로 균등 간격을 잡는다. $S$가 작을수록 한 스텝의 가치가 커지므로, 거의 변화가 없는 $t=1$보다 올바른 초기조건인 $t=T$를 확보하는 편이 효율적이라는 논리다.

구현에서는 논문의 1 기반 표기를 그대로 복사하지 말고 배열 인덱스로 변환해야 한다.

```python
def trailing_timesteps(total_steps, sample_steps):
    # 논문 표기는 1..T, 구현 배열은 0..T-1이라고 가정한다.
    paper_steps = round_values(
        reverse(arange(total_steps, 0, -total_steps / sample_steps))
    )                                             # (S,)
    indices = paper_steps - 1                     # (S,)
    return reverse(indices)                       # 생성 순서: T-1에서 작은 t로
```

위 코드는 개념을 드러내기 위한 의사코드다. 실제 구현에서는 반올림 후 중복되는 인덱스가 없는지, 반환 순서가 노이즈에서 데이터 방향인지 확인해야 한다. Table 2는 선택된 집합을 오름차순으로 보여주지만 실제 역확산은 큰 $t$에서 작은 $t$로 진행한다.

### $v$에서 $\epsilon$과 $x_0$ 복원하기

Eq. 4와 Eq. 11을 연립하면 $v$ 예측에서 두 종류의 값을 복원할 수 있다.

$$
\epsilon
=
\sqrt{\bar{\alpha}_t}v
+
\sqrt{1-\bar{\alpha}_t}x_t
\tag{17}
$$

$$
x_0
=
\sqrt{\bar{\alpha}_t}x_t
-
\sqrt{1-\bar{\alpha}_t}v
\tag{19}
$$

두 식은 같은 $v$ 출력에서 노이즈와 깨끗한 데이터 예측을 얻는 회전 형태의 변환이다. terminal step에서는 $\sqrt{\bar{\alpha}_T}=0$이므로 Eq. 17은 $\epsilon=x_T$가 되고 Eq. 19는 $x_0=-v$가 된다. 이것이 앞서 지적한 부호 확인의 기준이다.

DDPM에서 Eq. 17로 $\epsilon$을 복원한 뒤 다음 평균식을 그대로 쓰는 것은 안전하지 않다.

$$
\tilde{\mu}_t
:=
\frac{1}{\sqrt{\alpha_t}}
\left(
x_t-
\frac{\beta_t}
{\sqrt{1-\bar{\alpha}_t}}
\epsilon
\right)
\tag{18}
$$

Eq. 18은 Eq. 8과 같은 $\epsilon$ 정식화다. zero terminal SNR에서는 $\beta_T=1$, $\alpha_T=0$이므로 $1/\sqrt{\alpha_T}$가 영분모를 만든다. 괄호 안에서도 terminal step의 신호가 소거되는 특이한 형태가 발생한다. 수학적으로 동등한 식이라도 경계에서 계산 안정성은 같지 않다.

논문은 대신 Eq. 19로 $x_0$를 복원하고 다음 사후평균을 사용하라고 제안한다.

$$
\tilde{\mu}_t
:=
\frac{
\sqrt{\bar{\alpha}_{t-1}}\beta_t
}{
1-\bar{\alpha}_t
}x_0
+
\frac{
\sqrt{\alpha_t}(1-\bar{\alpha}_{t-1})
}{
1-\bar{\alpha}_t
}x_t
\tag{20}
$$

terminal step에서 $1-\bar{\alpha}_T=1$이므로 분모가 0이 아니다. 또한 $\alpha_T=0$이어서 $x_t$ 항의 계수는 0이 되고, 복원한 $x_0$를 사용하는 첫 항이 남는다. 즉 Eq. 20은 zero terminal SNR 경계조건을 직접 다룰 수 있는 형태다.

DDIM에서는 $v$에서 Eq. 17의 $\epsilon$과 Eq. 19의 $x_0$를 모두 구한 뒤

$$
x_{t-1}
=
\sqrt{\bar{\alpha}_{t-1}}x_0
+
\sqrt{
1-\bar{\alpha}_{t-1}-\sigma_t^2
}\epsilon
+
\sigma_t z
\tag{21}
$$

를 적용한다. 여기서 $z\sim\mathcal N(\mathbf0,\mathbf I)$이고, $\sigma_t$는 확률적 변동의 크기를 정한다.

$$
\sigma_t(\eta)
=
\eta
\sqrt{
\frac{
1-\bar{\alpha}_{t-1}
}{
1-\bar{\alpha}_t
}
}
\sqrt{
1-
\frac{
\bar{\alpha}_t
}{
\bar{\alpha}_{t-1}
}
},
\qquad
\eta\in[0,1]
\tag{22}
$$

$\eta$가 Eq. 21의 추가 Gaussian 노이즈 크기를 조절한다. 샘플러 구현에서 중요한 것은 Eq. 21만 복사하는 것이 아니라, 그 입력인 $x_0$와 $\epsilon$을 동일한 $v$ 부호 규약으로 복원하는 것이다.

```python
def decode_v(xt, v, alpha_bar_t):
    # xt, v:       (B, C, H, W)
    # alpha_bar_t: (B, 1, 1, 1)
    a = sqrt(alpha_bar_t)
    s = sqrt(1.0 - alpha_bar_t)

    eps = a * v + s * xt                          # Eq. 17
    x0 = a * xt - s * v                           # Eq. 19
    return eps, x0


def ddpm_posterior_mean_from_x0(
    xt, x0, alpha_t, alpha_bar_t, alpha_bar_prev, beta_t
):
    # 모든 상태 텐서: (B, C, H, W)
    # 모든 스케줄 값: 브로드캐스트 가능한 (B, 1, 1, 1)
    coef_x0 = (
        sqrt(alpha_bar_prev) * beta_t
        / (1.0 - alpha_bar_t)
    )
    coef_xt = (
        sqrt(alpha_t) * (1.0 - alpha_bar_prev)
        / (1.0 - alpha_bar_t)
    )
    return coef_x0 * x0 + coef_xt * xt             # Eq. 20
```

역확산의 마지막 경계인 $t=1$에서 $t=0$으로 갈 때의 처리도 샘플러가 명시해야 한다. 인덱스가 $t-1$을 참조하는 만큼 배열 경계를 별도로 점검해야 한다.

## Classifier-Free Guidance가 과다노출을 만드는 이유

Classifier-Free Guidance(CFG)는 긍정 조건 출력과 부정 조건 출력의 차이를 확대한다.

$$
x_{\mathrm{cfg}}
=
x_{\mathrm{neg}}
+
w(x_{\mathrm{pos}}-x_{\mathrm{neg}})
\tag{13}
$$

$w=1$이면 $x_{\mathrm{pos}}$가 되고, 더 큰 $w$는 두 조건의 차이를 강하게 반영한다. 논문의 실험은 $w=7.5$를 사용한다. 그러나 terminal SNR이 0에 가까워지면 CFG가 극도로 민감해져 출력 스케일이 팽창하고 이미지가 과다노출될 수 있다.

논문은 먼저 긍정 조건 출력과 CFG 출력의 표준편차를 계산한다.

$$
\sigma_{\mathrm{pos}}
=
\operatorname{std}(x_{\mathrm{pos}}),
\qquad
\sigma_{\mathrm{cfg}}
=
\operatorname{std}(x_{\mathrm{cfg}})
\tag{14}
$$

두 표준편차는 이미지별로 계산한다. 단일 이미지에서는 스칼라이지만, `(B, C, H, W)` 배치에서는 C·H·W 차원만 줄여 `(B, 1, 1, 1)`로 유지한다. 다음으로 각 이미지의 CFG 출력을 해당 긍정 조건 출력의 표준편차에 맞춘다.

$$
x_{\mathrm{rescaled}}
=
x_{\mathrm{cfg}}
\frac{
\sigma_{\mathrm{pos}}
}{
\sigma_{\mathrm{cfg}}
}
\tag{15}
$$

이 비율은 방향이나 공간적 패턴을 새로 만드는 항이 아니라 전체 출력 스케일을 조정하는 항이다. $\sigma_{\mathrm{cfg}}$가 지나치게 커졌다면 비율이 1보다 작아져 과도한 진폭을 줄인다.

다만 재스케일된 출력만 사용하면 이미지가 지나치게 밋밋해질 수 있다. 최종 출력은 원래 CFG와 재스케일 결과를 보간한다.

$$
x_{\mathrm{final}}
=
\phi x_{\mathrm{rescaled}}
+
(1-\phi)x_{\mathrm{cfg}}
\tag{16}
$$

$\phi=0$이면 기존 CFG를 그대로 사용하고, $\phi=1$이면 표준편차를 완전히 맞춘 결과만 사용한다. 논문은 $\phi=0.7$을 사용했으며, $\phi\in[0.5,0.75]$에서 과다노출을 막으면서 가장 좋은 시각적 결과를 관찰했다.

```python
def rescale_cfg(x_pos, x_neg, guidance_weight, phi):
    # x_pos, x_neg: (B, C, H, W)
    x_cfg = (
        x_neg
        + guidance_weight * (x_pos - x_neg)
    )                                             # (B, C, H, W), Eq. 13

    sigma_pos = x_pos.std(dim=(1, 2, 3), keepdim=True)  # (B, 1, 1, 1)
    sigma_cfg = x_cfg.std(dim=(1, 2, 3), keepdim=True)  # (B, 1, 1, 1)

    x_rescaled = (
        x_cfg * sigma_pos / sigma_cfg
    )                                             # (B, C, H, W), Eq. 15

    x_final = (
        phi * x_rescaled
        + (1.0 - phi) * x_cfg
    )                                             # (B, C, H, W), Eq. 16
    return x_final
```

Eq. 15는 $\sigma_{\mathrm{cfg}}$로 나누므로 구현에서는 분모가 어떤 값을 가질 수 있는지 확인해야 한다.

Imagen의 dynamic thresholding은 image-space 모델을 위한 방식이다. 반면 이 재스케일은 출력의 표준편차를 기준으로 하므로 논문은 image-space 모델과 latent-space 모델 모두에 적용할 수 있다고 설명한다.

## 전체 구현 흐름

논문의 네 수정 사항은 다음 순서로 연결된다.

```text
기존 beta 스케줄
    ↓
sqrt(alpha_bar) 공간에서 terminal 값을 0으로 재조정
    ↓
v 목표로 학습
    ↓
추론 타임스텝에 반드시 T를 포함
    ↓
v에서 x0와 epsilon을 일관된 부호로 복원
    ↓
DDPM은 x0 정식화, DDIM은 x0·epsilon 정식화 사용
    ↓
CFG 출력의 표준편차를 재조정
```

학습과 추론이 완전히 대칭인 것은 아니다. 학습에서는 임의의 $t$를 한 번 뽑아 Eq. 4로 $x_t$를 직접 만들고 $v_t$를 회귀한다. 추론에서는 순수 노이즈 $x_T$에서 시작해 선택된 타임스텝을 역순으로 방문한다. 논문의 문제 제기는 이 비대칭 자체가 아니라, 두 과정이 공유해야 할 시작 분포와 타임스텝 경계가 기존 구현에서 맞지 않았다는 데 있다.

통합된 DDIM 형태의 의사코드는 다음과 같다.

```python
def sample_ddim(model, condition_pos, condition_neg,
                alpha_bar, sample_steps, w=7.5, phi=0.7):
    # alpha_bar: (T,)
    # xt:        (B, C, H, W)

    timesteps = trailing_timesteps(
        total_steps=len(alpha_bar),
        sample_steps=sample_steps,
    )                                             # (S,), 큰 인덱스부터 사용

    xt = standard_normal(sample_shape)             # (B, C, H, W)

    for t, t_prev in adjacent_reverse_pairs(timesteps):
        v_pos = model(xt, t, condition_pos)        # (B, C, H, W)
        v_neg = model(xt, t, condition_neg)        # (B, C, H, W)

        v = rescale_cfg(v_pos, v_neg, w, phi)      # (B, C, H, W)

        ab_t = broadcast(alpha_bar[t])             # (1, 1, 1, 1)
        eps, x0 = decode_v(xt, v, ab_t)            # 각각 (B, C, H, W)

        sigma_t = compute_sigma_from_eq22(
            alpha_bar[t],
            alpha_bar[t_prev],
        )
        z = standard_normal_like(xt)               # (B, C, H, W)

        xt = (
            sqrt(alpha_bar[t_prev]) * x0
            + sqrt(
                1.0 - alpha_bar[t_prev] - sigma_t**2
            ) * eps
            + sigma_t * z
        )                                         # Eq. 21

    return xt
```

이 의사코드에서 `adjacent_reverse_pairs`는 역확산 시점 쌍을, Eq. 22의 $\eta$는 샘플러의 입력을 나타낸다. 마지막 경계 처리와 구체적인 API는 사용할 샘플러에 맞춰 정해야 한다. 중요한 구현 검사는 다음과 같다.

- 첫 추론 인덱스가 논문의 $t=T$, 즉 0 기반 배열의 `T-1`인지 확인한다.
- 마지막 $\bar{\alpha}$가 0이고 마지막 $\beta$가 1인지 확인한다.
- 학습의 Eq. 11과 추론의 Eq. 17·Eq. 19가 같은 $v$ 부호를 쓰는지 확인한다.
- DDPM에서 terminal step에 Eq. 18을 직접 사용하지 않는다.
- Table 2의 오름차순 표기와 실제 역방향 실행 순서를 혼동하지 않는다.
- 정량 평가와 정성 평가에서 negative prompt 조건이 다르다는 점을 구분한다.

## 실험 설정

저자들은 Stable Diffusion 2.1-base를 파인튜닝했다. 학습 데이터는 원래 Stable Diffusion 학습 데이터와 유사하게 필터링한 LAION 데이터셋이다. 배치 크기는 2048, 학습률은 $10^{-4}$, EMA decay는 0.9999이며 50k iteration 동안 학습했다. GPU 기종과 수량, 총 학습 시간은 보고되지 않았다.

비교 대상은 세 모델이다.

- 공식 배포된 `SD v2.1-base official`
- 같은 저자 데이터로 기존 설정을 유지해 학습한 `SD with our data, no fixes`
- zero terminal SNR, $v$ 예측, trailing 샘플 스텝, CFG rescale을 모두 적용한 `SD with fixes (Ours)`

정량 평가는 COCO 2014 validation에서 무작위로 선별한 이미지 10k장과 해당 캡션을 사용했다. 모든 모델은 DDIM 50스텝, guidance weight 7.5, negative prompt 없음이라는 동일한 조건에서 평가됐다. 지표는 낮을수록 좋은 FID와 높을수록 좋은 IS다.

| Model | FID $\downarrow$ | IS $\uparrow$ |
|---|---:|---:|
| SD v2.1-base official | 23.76 | 32.84 |
| SD with our data, no fixes | 22.96 | 34.11 |
| SD with fixes (Ours) | 21.66 | 36.16 |

공식 모델과 수정 모델만 비교하면 데이터 차이가 섞일 수 있다. 따라서 해석의 중심은 같은 저자 데이터로 학습한 `no fixes`와 `Ours`의 비교다. 수정 조합은 FID를 22.96에서 21.66으로 낮추고 IS를 34.11에서 36.16으로 높였다. 논문이 네 구성 요소 각각의 정량 기여도를 별도 행으로 분리한 표는 제시하지 않았으므로, 이 차이를 어느 한 요소의 효과로 귀속해서는 안 된다.

정성 비교는 숫자가 보여주기 어려운 밝기 범위를 다룬다. Figure 3의 비교는 DDIM 50스텝, trailing 선택, guidance weight 7.5, rescale factor 0.7 조건에서 수행됐다. 한 쌍의 이미지는 같은 seed를 사용했고 서로 다른 negative prompt를 사용했다. 이는 negative prompt를 사용하지 않은 정량 평가와 조건이 다르다.

![기존 Stable Diffusion과 네 가지 수정을 적용한 모델의 밝기 범위 비교](/assets/img/posts/common-diffusion-noise-schedules/figure3.jpg){: w="700" }
_그림 1. 기존 참조 모델과 수정 모델을 비교하면 zero terminal SNR을 포함한 수정 조합이 매우 어둡거나 밝은 프롬프트를 표현하는 범위를 넓힌다. 정량 평가와 달리 이 정성 비교에는 서로 다른 negative prompt가 사용됐다._

## 무엇이 동작을 바꾸었나

### 적은 샘플 스텝에서는 trailing의 차이가 커진다

샘플 스텝 선택 비교는 DDIM 샘플러, 같은 seed, “A close-up photograph of two men smiling in bright light”라는 고정 프롬프트를 사용했다.

$S=5$처럼 샘플 스텝 수가 극단적으로 작을 때 trailing은 linspace보다 눈에 띄게 나은 결과를 보였다. 반면 $S=25$처럼 일반적인 스텝 수에서는 두 방식의 시각적 품질 차이가 미묘했다. 이는 두 방식 모두 마지막 타임스텝 $T$를 포함하지만, 매우 작은 예산에서는 거의 변화가 없는 $t=1$을 쓰지 않고 뒤쪽 구간에 스텝을 배분하는 trailing의 이점이 더 커진다는 논리와 맞는다.

이 결과는 경량화 관점에서도 중요하다. 추론 스텝을 줄이는 것은 모델 파라미터를 줄이지 않고도 지연시간을 낮추는 직접적인 방법이다. 다만 스텝 수가 줄어들수록 어떤 타임스텝을 남길지가 더 민감해진다. 논문은 스케줄 이산화가 단순한 구현 세부사항이 아니라, 적은 스텝 예산에서 품질을 좌우하는 선택임을 보여준다.

### 첫 단계는 다양성을 만드는 단계가 아니다

zero terminal SNR로 완벽히 수렴한 이상적인 모델을 생각하면, $t=T$에서 입력은 순수 노이즈다. 그러나 $v$ 예측 목표는 데이터와 연결되어 있다. L2 손실 아래의 최적 예측은 데이터 분포의 평균이며, 텍스트 조건부 모델이라면 주어진 프롬프트에 조건화된 데이터 분포의 L2 평균이다.

따라서 이상적인 모델은 서로 다른 노이즈 $x_T$를 받아도 첫 단계에서 같은 조건부 평균을 예측한다. 저자들의 실제 모델도 $t=T$에서 입력 노이즈와 무관하게 거의 같은 결과를 예측했다. 논문은 이 관찰에 따라 첫 입력 노이즈가 다양성에 기여하지 않고, 신경망 입력 형태를 유지하는 구조적 편의를 위해 남아 있다고 설명한다.

다양성은 두 번째 샘플 스텝부터 생긴다. DDPM에서는 첫 단계의 같은 $x_0$ 예측에 서로 다른 Gaussian 노이즈가 더해진다. DDIM에서는 서로 다른 예측 노이즈가 이후 사후확률을 달라지게 한다. 즉 “초기 Gaussian 노이즈가 곧 최종 샘플의 다양성을 결정한다”는 단순한 설명은 zero terminal SNR의 첫 단계 동작을 충분히 설명하지 못한다.

### Guidance rescale은 강도와 안정성 사이의 절충이다

Guidance rescale 비교는 DDIM 25스텝과 guidance weight 7.5를 사용했다. 프롬프트는 얼룩말, 눈 덮인 올빼미의 수채화, 세 색상의 앵무새가 무대에서 노래하는 장면의 세 종류였고 서로 다른 negative prompt가 사용됐다.

$\phi=0$은 Eq. 16에서 기존 CFG를 그대로 사용하는 설정이며, terminal SNR이 0에 가까울 때 심한 과다노출을 보였다. $\phi\in[0.5,0.75]$에서는 과다노출이 억제되고 가장 좋은 시각적 결과가 관찰됐다. 그러나 $\phi=1$로 완전히 재스케일된 출력만 사용하면 CFG의 강한 효과를 지나치게 누를 수 있다. 그래서 논문이 채택한 $\phi=0.7$은 원래 CFG의 조건 강화 효과와 스케일 안정성을 섞는 절충점이다.

### Offset noise는 다른 문제 설정을 만든다

Offset noise는

$$
\epsilon_{hwc}
\sim
\mathcal N(0.1\delta_c,\mathbf I),
\qquad
\delta_c\sim\mathcal N(0,\mathbf I)
$$

로 노이즈를 샘플링한다. 같은 채널의 모든 공간 위치가 $\delta_c$를 공유하므로 픽셀 노이즈는 더 이상 독립동일분포가 아니다. 그 결과 입력 노이즈의 평균이 실제 이미지 평균을 안정적으로 반영하지 않게 되고, 모델은 모든 타임스텝에서 입력 평균을 무시하도록 학습된다. 이 특성 덕분에 밝고 어두운 샘플을 생성할 수 있다.

그러나 논문의 zero terminal SNR 접근과는 철학이 다르다. Offset noise는 학습과 추론의 확산 경계를 일치시키는 대신 평균 신호를 신뢰할 수 없게 만든다. 논문은 이 방법이 확산 과정의 수학적 정식화와 맞지 않고, 실제 데이터 분포보다 과도하게 밝거나 어두운 이미지를 만들 수 있다고 지적한다.

## 비용과 트레이드오프

이 방법의 장점은 모델 아키텍처를 새로 제안하거나 파라미터 수를 늘리는 데 있지 않다. 핵심 변경은 스케줄, 학습 타깃, 타임스텝 선택, guidance 후처리에 있다. 따라서 논문에서 확인되는 추가 계산은 CFG 출력의 표준편차 계산과 재스케일링 같은 텐서 연산이다. 다만 전체 학습·추론 비용이 얼마나 변했는지, GPU 시간이나 메모리가 얼마나 증가했는지는 보고되지 않았다.

학습 측면에서는 기존 Stable Diffusion 2.1-base를 배치 2048로 50k iteration 파인튜닝했다. 이는 수정 사항이 체크포인트에 즉시 적용되는 추론 전용 패치만은 아니라는 뜻이다. terminal SNR을 0으로 바꾸면 $\epsilon$ 예측이 자명해지므로 $v$ 목표로 다시 학습해야 한다.

추론 측면에서는 trailing 방식이 적은 스텝 예산을 더 효율적으로 쓸 가능성을 보여준다. 특히 $S=5$에서 linspace보다 눈에 띄는 차이가 관찰됐기 때문에, 샘플링 스텝을 줄여 지연시간을 낮추려는 경우 타임스텝 선택 정책을 함께 검토해야 한다. 반면 $S=25$에서는 차이가 미묘했으므로 일반적인 스텝 수에서 trailing이 큰 품질 향상을 항상 보장한다고 확대해석할 수는 없다.

품질을 얻기 위해 지불하는 가장 명확한 비용은 구성 요소 간 결합이다. zero terminal SNR만 적용하면 $\epsilon$ 예측의 terminal target이 무의미해진다. $v$ 예측으로 바꾸더라도 샘플러가 $T$를 건너뛰면 학습-추론 불일치가 남는다. 마지막 타임스텝에서 시작하면 CFG가 과다노출에 민감해져 재스케일링이 필요하다. 다시 말해 각각은 독립적인 토글이라기보다 같은 경계조건을 일관되게 유지하기 위한 묶음이다.

또 다른 트레이드오프는 CFG 강도와 출력 스케일 사이에 있다. $\phi$를 높이면 과다노출을 억제하지만 완전한 재스케일링은 이미지를 밋밋하게 만들 수 있다. 논문이 보고한 유효 범위 $[0.5,0.75]$와 선택값 0.7은 이 절충을 반영한다.

일반화 범위에도 경계가 있다. guidance rescale은 image-space와 latent-space 모델 모두에 적용할 수 있다고 설명되지만, 스케줄 재조정은 variance-preserving 정식화에 한정된다. 다른 데이터셋이나 모달리티, 모델 규모에서 같은 정량 효과가 나타나는지는 제시된 실험만으로 확인할 수 없다.

## 한계와 생각해볼 점

저자가 밝힌 첫 번째 한계는 정식화의 범위다. zero terminal SNR 재조정은 variance-preserving 과정에서 사용해야 한다. Variance-exploding 정식화는 수학적으로 terminal SNR 0에 진정으로 도달할 수 없으므로 Algorithm 1을 그대로 옮길 수 없다.

두 번째로, Algorithm 1은 기존 non-cosine 스케줄을 위한 보정이다. Cosine 스케줄은 $\beta_t$를 0.999로 제한한 클리핑을 제거하는 것으로 terminal SNR 0을 만들 수 있다. 모든 스케줄에 같은 변환을 기계적으로 적용해서는 안 된다.

세 번째로, terminal SNR을 0으로 바꾸면 $\epsilon$ 예측을 유지할 수 없다. $t=T$에서 입력이 곧 $\epsilon$이 되므로 데이터에 관한 학습 신호가 사라진다. 논문이 제안한 수정 조합에서 $v$ 예측은 선택적인 개선이 아니라 경계조건을 바꾼 결과 필요한 학습 목표다.

네 번째로, CFG는 terminal SNR이 0에 가까울수록 과다노출에 민감해진다. Dynamic thresholding은 image-space 모델용이므로 latent-space까지 함께 다루기 위해 guidance rescale을 사용한다. 다만 $\phi$는 품질과 스케일 억제 사이의 하이퍼파라미터이며, 논문에서 좋은 결과를 보인 범위가 모든 설정에서 그대로 유지되는지는 확인되지 않는다.

다섯 번째로, 이상적으로 수렴한 모델에서는 첫 terminal 입력 노이즈가 다양성을 만들지 않는다. 실제 모델에서도 거의 같은 예측이 관찰됐지만 “almost exact”이지 완전한 동일성으로 보고된 것은 아니다. 따라서 이상적 분석과 유한하게 학습된 모델의 동작을 구분해야 한다.

여섯 번째로, DDPM 구현에서 $\epsilon$ 정식화인 Eq. 18을 terminal step에 적용하면 $\alpha_T=0$ 때문에 영분모가 발생한다. 모델이 올바르게 학습되어도 샘플러 수식이 이 경계조건을 처리하지 못하면 생성이 실패한다. Eq. 19로 $x_0$를 복원하고 Eq. 20의 $x_0$ 정식화를 사용해야 한다.

추가로 주의할 점은 원문의 $v_T$ 부호 모순이다. 원문의 설명은 $v_T=x_0$라고 하지만 Eq. 11과 Eq. 19는 $v_T=-x_0$를 요구한다. 이는 설명상의 사소한 표기 문제가 아니라 학습 타깃과 샘플러 변환을 반대로 만들 수 있는 구현 문제다. 따라서 구현자는 한 부호 규약을 선택한 뒤 Eq. 11, Eq. 17, Eq. 19가 대수적으로 서로 역변환인지 테스트해야 한다.

정량 실험에서도 분리해서 읽어야 할 부분이 있다. 공식 SD v2.1-base와 저자 모델은 학습 데이터 조건이 같다고 볼 수 없으므로, 직접적인 수정 효과는 같은 저자 데이터로 학습한 `no fixes`와 `Ours` 사이에서 읽는 편이 타당하다. 그러나 Table 3은 네 수정 사항을 모두 적용한 결과만 보여준다. 각 구성 요소가 FID와 IS에 얼마나 기여했는지, 하나를 제거했을 때 수치가 얼마나 변하는지는 논문에서 확인되지 않는다.

하드웨어 기종, GPU 수, 총 학습 시간도 보고되지 않았다. 배치 크기와 iteration 수는 알 수 있지만 실제 재현 비용을 산정할 정보는 부족하다. 다른 모델 규모, 다른 모달리티, 다른 데이터 분포에서 같은 효과가 유지되는지도 논문의 범위 밖이다.

그럼에도 이 논문의 문제 제기는 실무적으로 분명하다. 확산 모델에서 노이즈 스케줄은 단순한 하이퍼파라미터 배열이 아니다. 마지막 누적곱, 학습 목표, 샘플러 시작 인덱스, 역변환 수식, guidance 스케일까지 하나의 경계조건으로 연결된다. 특히 샘플링 스텝을 줄이는 효율화 작업에서는 “몇 번 실행하는가”뿐 아니라 “어느 타임스텝을 남기는가”가 함께 품질을 결정한다.
