---
title: "simple diffusion: End-to-end diffusion for high resolution images"
date: 2026-09-08 11:19:10 +0900
permalink: /posts/simple-diffusion/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion, image-generation, u-vit, efficiency]
description: "해상도별 노이즈 스케줄과 멀티스케일 손실, 저해상도 중심 계산 배치로 단일 확산 모델이 최대 1024×1024 이미지를 직접 생성하는 방법을 살펴본다."
paper:
  zotero_key: "NEUST8KB"
  authors: "Emiel Hoogeboom*, Jonathan Heek*, Tim Salimans (* Equal contribution)"
  venue: "Proceedings of the 40th International Conference on Machine Learning (ICML 2023), PMLR 202, 2023"
---

## 세 줄 요약

이 논문은 캐스케이드(cascade), 잠재 공간, 노이즈 제거 전문가 앙상블 없이 하나의 확산 모델로 최대 $1024 \times 1024$ 이미지를 직접 생성하려 한다. 핵심은 해상도에 맞게 노이즈 스케줄을 시프트하고, 여러 해상도의 손실을 함께 계산하며, 연산을 저해상도 피처 맵과 $16 \times 16$ 블록에 집중하는 것이다. 단일 모델이라는 구조적 단순성을 얻는 대신 대규모 계산 자원, 가이던스 민감도, 고주파 생성 지연과 같은 비용을 지불한다.

## 이 논문이 풀려는 문제

고해상도 이미지 확산 모델의 어려움은 단순히 픽셀 수가 많다는 데 그치지 않는다. 해상도가 바뀌면 같은 노이즈 스케줄의 의미도 달라지고, U-Net 내부의 메모리·연산 균형도 달라진다. 저해상도에서 잘 작동하던 정규화와 손실 함수까지 그대로 확장되지 않을 수 있다.

기존 방법은 이 문제를 대체로 생성 공간이나 생성 단계를 나누어 해결했다. Latent Diffusion은 저차원 잠재 공간에서 확산을 수행해 픽셀 공간의 비용을 줄이지만, 별도의 잠재 표현을 도입하므로 단일한 end-to-end 픽셀 공간 학습과는 거리가 있다. Cascaded Diffusion은 저해상도 생성과 초해상도 모델을 여러 단계로 나누어 고해상도에 도달한다. 각 단계는 다루기 쉬워지지만 여러 모델을 따로 학습하고 관리해야 한다. Mixtures-of-denoising-experts 역시 시간이나 노이즈 영역별 전문가를 결합하는 대신 시스템 복잡도를 늘린다.

simple diffusion은 반대 방향을 택한다. 모델을 여러 개로 나누거나 입력을 별도의 잠재 공간으로 옮기지 않고, 픽셀 공간의 단일 모델이 고해상도를 직접 다루도록 노이즈 스케줄, 손실, 네트워크의 계산 배치, 정규화를 함께 조정한다.

여기서 중요한 출발점은 기존 코사인 노이즈 스케줄이 해상도에 불변하지 않다는 사실이다. $32 \times 32$나 $64 \times 64$에 맞춘 스케줄을 고해상도 이미지에 그대로 쓰면, 이미지를 평균 풀링해 본 저해상도 구조의 신호 대 잡음비(signal-to-noise ratio, SNR)가 지나치게 높아진다. 그 결과 확산 과정의 대부분 구간에서 전역 구조가 이미 결정되고, 모델이 전역 일관성을 형성할 수 있는 시간 구간은 매우 짧아진다.

계산 구조에도 비슷한 문제가 있다. 해상도를 두 배 높이면서 채널 수를 절반으로 줄이면 FLOPs는 유지할 수 있지만, 처리해야 할 피처 수에 비한 FLOPs인 연산 강도는 절반으로 떨어진다. 가속기가 계산보다 메모리 이동에 더 묶일 수 있고, 큰 활성화 맵 때문에 OOM이 발생하기 쉽다. 따라서 단순히 고해상도 레이어의 채널만 줄이는 방식은 FLOPs 수치가 비슷하더라도 실제 처리 효율이 같지 않다.

정규화 역시 위치를 가려야 한다. 모든 해상도의 residual block에 드롭아웃을 일괄 적용하면 고해상도 모델에서는 정규화가 지나치게 강해져 성능이 나빠진다. 논문의 설계는 이 세 문제를 각각 노이즈 스케줄 시프트, 저해상도 중심의 계산 배치, 선택적 드롭아웃으로 대응한다.

## 확산 모델의 출발점

### 순방향 과정

원본 데이터 $x$에 시간 $t \in [0,1]$의 노이즈를 더한 주변 분포는 Eq. 1이다.

$$
q(z_t \mid x)
=
\mathcal{N}(z_t \mid \alpha_t x,\sigma_t^2 I)
\tag{1}
$$

분산 보존(variance-preserving) 과정에서는

$$
\alpha_t^2 = 1-\sigma_t^2
$$

이며, 시간이 흐를수록 $\alpha_t$는 감소하고 $\sigma_t$는 증가한다. 따라서 같은 분포를 다음 재매개변수화로 샘플링할 수 있다.

$$
z_t=\alpha_t x+\sigma_t\epsilon_t,
\qquad
\epsilon_t\sim\mathcal{N}(0,I).
$$

이 형태가 구현에 유리한 이유는 무작위성을 $\epsilon_t$로 분리하기 때문이다. 네트워크 파라미터가 들어가는 경로와 샘플링 연산을 분리한 채 미분할 수 있다.

$t>s$일 때 두 시점 사이의 마르코프 전이는 Eq. 2로 주어진다.

$$
q(z_t \mid z_s)
=
\mathcal{N}(z_t\mid\alpha_{t\mid s}z_s,\sigma_{t\mid s}^2I)
\tag{2}
$$

여기서

$$
\alpha_{t\mid s}=\frac{\alpha_t}{\alpha_s},
\qquad
\sigma_{t\mid s}^2
=
\sigma_t^2-\alpha_{t\mid s}^2\sigma_s^2.
$$

이 계수들은 Eq. 2를 따라 $z_s$에 다시 노이즈를 더했을 때 Eq. 1의 $z_t$ 주변 분포와 일치하도록 정해진다. 첫 항은 $z_s$에서 남겨 둘 신호이고, 두 번째 항은 $s$와 $t$ 사이에 새로 추가해야 하는 불확실성이다.

### 역방향 분포

원본 $x$를 알고 있을 때 $z_t$로부터 더 이른 $z_s$를 추정하는 사후 분포는 Eq. 3이다.

$$
q(z_s\mid z_t,x)
=
\mathcal{N}(z_s\mid\mu_{t\to s},\sigma_{t\to s}^2I)
\tag{3}
$$

평균과 분산은 다음과 같다.

$$
\mu_{t\to s}
=
\frac{\alpha_{t\mid s}\sigma_s^2}{\sigma_t^2}z_t
+
\frac{\alpha_s\sigma_{t\mid s}^2}{\sigma_t^2}x,
$$

$$
\sigma_{t\to s}^2
=
\frac{\sigma_{t\mid s}^2\sigma_s^2}{\sigma_t^2}.
$$

평균의 첫 항은 현재 상태 $z_t$를 유지하는 부분이고, 두 번째 항은 깨끗한 데이터 $x$의 정보로 복원 방향을 보정하는 부분이다. 실제 생성에서는 $x$를 모르므로 신경망 예측 $\hat{x}=f_\theta(z_t)$를 대입해

$$
p(z_s\mid z_t)
=
q(z_s\mid z_t,x=\hat{x})
$$

를 구성한다. 즉, 네트워크가 전체 역분포를 자유롭게 출력하는 것이 아니라 가우시안 사후분포의 알려진 구조 안에서 알 수 없는 깨끗한 데이터만 추정한다.

### 변분 하한과 실제 학습 목적

연속 시간 확산 마르코프 체인에 Jensen 부등식을 적용하면 로그 가능도에 대한 변분 하한이 나온다.

$$
\log p(x)
\ge
L_x+L_T
-
\mathbb{E}_{t\sim U(0,1)}
\left[
w(t)\|\epsilon_t-\hat{\epsilon}_t\|^2
\right].
$$

여기서

$$
w(t)
=
-\frac{d}{dt}\log\operatorname{SNR}(t),
\qquad
\operatorname{SNR}(t)=\frac{\alpha_t^2}{\sigma_t^2}.
$$

$L_x=-\log p(x\mid z_0)\approx0$은 시작점의 복원 항이고, $L_T=-\operatorname{KL}(q(z_T\mid x)\|p(z_T))\approx0$은 마지막 분포를 사전분포에 맞추는 항이다. 위 ELBO 식과 $L_x$ 정의는 원문의 표기다. 음의 로그 재구성 항으로 정의한 $L_x$를 하한에 더하는 부호와 시간 가중치의 계수 관례에는 정합성 문제가 있다. 실제 가능도 계산에서는 재구성 항의 부호와 확산 손실의 계수를 일관된 정의로 다시 확인해야 한다.

이론적인 하한에는 시간별 가중치 $w(t)$가 들어가지만, 논문은 더 나은 샘플 품질을 위해 실제 학습에서 $w(t)=1$을 사용한다. 따라서 학습 목적은 엄밀한 가능도 가중치를 그대로 따르기보다 모든 시간의 노이즈 예측 오차를 같은 비중으로 줄이는 쪽에 가깝다.

## 해상도가 바뀌면 SNR도 바뀐다

### 평균 풀링에서 출발하는 스케줄 시프트

$d\times d$ 이미지를 $s\times s$ 윈도우로 평균 풀링하면 해상도는 $(d/s)\times(d/s)$가 된다. 독립 노이즈를 $s^2$개 평균 내면 노이즈 표준편차는 $\sigma_t/s$로 줄지만 신호의 스케일은 $\alpha_t$로 유지된다. 따라서 신호 대 노이즈의 비는 $s$배, 그 제곱인 SNR은 $s^2$배가 된다.

$$
\operatorname{SNR}_{d/s\times d/s}(t)
=
\operatorname{SNR}_{d\times d}(t)\cdot s^2
\tag{4}
$$

이 식이 고해상도에서 기존 스케줄이 실패하는 이유를 보여준다. 픽셀 수준에서는 같은 SNR을 적용하더라도, 저해상도로 집계한 전역 구조는 훨씬 덜 오염되어 있다. 모델은 이른 시점부터 전역 구성을 거의 볼 수 있고, 전역 구조를 점진적으로 형성하는 시간 구간은 좁아진다.

![표준 코사인 스케줄과 시프트 스케줄에서 평균 풀링된 이미지의 노이즈 상태 비교](/assets/img/posts/simple-diffusion/figure3.png){: w="800" }
_그림 1. 고해상도 이미지에 같은 스케줄을 그대로 적용할 때와 해상도에 맞춰 시프트할 때, 평균 풀링된 전역 구조가 확산 시간에 따라 어떻게 달라지는지 보여준다._

기준 해상도를 $64\times64$로 잡으면 코사인 스케줄은

$$
\operatorname{SNR}_{64\times64}(t)
=
\frac{1}{\tan^2(\pi t/2)}
$$

이다. $d\times d$ 이미지에서도 $64\times64$ 수준의 저해상도 피처가 같은 유효 SNR을 갖게 하려면 Eq. 4에서 증가하는 비율을 미리 상쇄해야 한다.

$$
\operatorname{SNR}_{d\times d}^{\operatorname{shift}\,64}(t)
=
\operatorname{SNR}_{64\times64}(t)
\left(\frac{64}{d}\right)^2
\tag{5}
$$

로그 공간에서는 다음 상수 이동이 된다.

$$
\log\operatorname{SNR}_{d\times d}^{\operatorname{shift}\,64}(t)
=
-2\log\tan(\pi t/2)
+
2\log(64/d).
$$

해상도 $d$가 커질수록 $2\log(64/d)$는 더 작은 값이 되어 전체 SNR을 낮춘다. 이는 고해상도 이미지에 픽셀당 더 강한 노이즈를 넣는 조정이지만, 평균 풀링된 전역 구조의 관점에서는 기준 해상도와 비슷한 노이즈 강도를 보존한다.

![원본 코사인 스케줄과 시프트 코사인 스케줄의 log SNR 곡선](/assets/img/posts/simple-diffusion/figure5.png){: w="500" }
_그림 2. 시프트는 시간축 자체보다 log SNR의 높이를 해상도 비율에 맞게 이동시킨다._

### 보간 스케줄

시프트 스케줄에는 대가가 있다. 픽셀당 노이즈가 커지므로 고주파 세부 묘사가 확산 과정의 훨씬 후반에 생성된다. 또한 샘플링 가이던스를 강하게 적용하기 어렵다.

텍스트-투-이미지와 가이던스 샘플링에서는 shift 32와 shift 256을 시간에 따라 로그 공간에서 보간한다.

$$
\begin{aligned}
\log\operatorname{SNR}_{512\times512}^{\operatorname{interpolate}(32\to256)}(t)
={}&
t\log\operatorname{SNR}_{512\times512}^{\operatorname{shift}\,256}(t)\\
&+(1-t)
\log\operatorname{SNR}_{512\times512}^{\operatorname{shift}\,32}(t).
\end{aligned}
\tag{6}
$$

$t$가 작을 때는 shift 32 쪽, $t$가 커질수록 shift 256 쪽으로 이동한다. 하나의 고정 시프트에 모든 주파수 대역을 맡기지 않고, 확산 시간에 따라 저·중·고주파 디테일에 배분되는 비중을 조절하는 셈이다.

## 멀티스케일 손실

고해상도 픽셀 공간의 MSE는 수많은 고주파 오차의 합에 지배될 수 있다. 그러면 전역 구조를 결정하는 저해상도 오차가 상대적으로 약해진다. 논문은 동일한 예측을 여러 해상도로 다운샘플링한 뒤 각 해상도에서 손실을 계산한다.

$$
L_\theta^{d\times d}(x)
=
\frac{1}{d^2}
\mathbb{E}_{\epsilon,t}
\left\|
D_{d\times d}[\epsilon]
-
D_{d\times d}
\left[
\hat{\epsilon}_\theta(
\alpha_t x+\sigma_t\epsilon,t
)
\right]
\right\|_2^2.
$$

$D_{d\times d}$는 목표 해상도로 보내는 선형 다운샘플링 연산자다. 선형성이 있으므로

$$
D_{d\times d}[\mathbb{E}(\epsilon\mid x)]
=
\mathbb{E}(D_{d\times d}[\epsilon]\mid x)
$$

가 성립한다. 따라서 다운샘플된 노이즈를 예측하도록 학습해도 원래 조건부 평균 추정과 일관된다.

최종 목적함수는 $32\times32$부터 원래 해상도까지의 손실을 합친다.

$$
\tilde{L}_\theta^{d\times d}(x)
=
\sum_{s\in\{32,64,128,\ldots,d\}}
\frac{1}{s}L_\theta^{s\times s}(x).
$$

$1/s$는 해상도가 커질수록 해당 손실의 상대 비중을 줄인다. 이 항이 없다면 픽셀 수가 많은 고해상도 오차가 목적함수를 지배하기 쉽다. 반대로 저해상도 손실만 과도하게 강조하면 세부 묘사가 약해질 수 있으므로, 모든 스케일을 남기되 가중치를 다르게 둔다.

이 손실은 모든 해상도에서 이득을 주지는 않는다. ImageNet 256에서는 FID train/eval이 $3.76/3.71$에서 $4.00/3.89$로 나빠지고 IS도 $171.6$에서 $171.0$으로 소폭 감소했다. ImageNet 512에서는 $4.85/4.58$, IS $156.1$에서 $4.30/4.28$, IS $171.0$으로 개선됐다. $1024\times1024$ 리사이즈 실험에서도 train FID가 $8.10$에서 $6.06$으로 개선됐다. 즉, 멀티스케일 손실은 해상도가 충분히 높아 고주파 항의 지배가 실제 문제가 될 때 유효한 선택이다.

## 계산을 저해상도로 옮기는 방법

### 왜 $16\times16$인가

고해상도 레이어는 파라미터보다 활성화 메모리가 비싸고, 저해상도 레이어는 그 반대다. 배치 크기 $B=1024$인 예에서 $(B,256,256,128)$ 합성곱은 커널 메모리가 2.8MB에 불과하지만 피처 맵이 16GB이고 총 메모리도 16GB다. 계산량은 9 TFLOPS다. 반면 $(B,16,16,1024)$ 합성곱은 커널 메모리가 180MB로 커지지만 피처 맵은 0.5GB, 총 메모리는 0.7GB이고 계산량은 2.3 TFLOPS다.

따라서 모델 용량을 늘릴 때 고해상도 피처 맵을 계속 키우기보다 파라미터 메모리와 피처 맵 메모리가 더 균형적인 $16\times16$ 모듈에 블록을 집중하는 편이 유리하다. Table 4에서도 $16\times16$ 블록을 2+3개에서 4+5, 8+9, 12+13개로 늘리면 train FID가 3.42, 2.98, 2.46, 2.41로 개선된다. eval FID는 3.59, 3.29, 3.00, 3.03이므로 마지막 확장은 더 이상 평가 성능을 높이지 않는다. 처리 속도 역시 114%, 100%, 76%, 62%로 감소한다.

이 결과는 저해상도 블록 확장이 유효하다는 근거이면서 동시에 수익 체감의 증거다. 8+9에서 12+13으로 갈 때 train FID만 조금 좋아지고 eval FID와 속도는 악화된다. 논문도 $16\times16$ 중심 스케일링이 경험적으로 작동하지만 이상적인 최종 스케일링 방법이라고 단정하지 않는다.

### DWT와 합성곱 패칭

모델 입력에서 해상도를 즉시 줄이면 가장 비싼 고해상도 피처 맵을 우회할 수 있다. 첫 번째 방법은 선형 가역 변환인 5/3 Discrete Wavelet Transform(DWT)이다. 공간 정보를 저주파 및 고주파 성분으로 나누어 채널 축으로 재배치한다. 2단계 DWT를 적용하면 $512\times512\times3$ 입력은 $128\times128\times48$이 된다. 공간 크기는 줄지만 가역 변환이므로 마지막에 역변환해 원래 해상도로 돌아갈 수 있다.

![5/3 DWT 2단계에 따른 저주파와 고주파 응답 맵 분해](/assets/img/posts/simple-diffusion/figure6.jpg){: w="800" }
_그림 3. DWT는 고해상도 공간축을 저주파·고주파 채널로 재배치해 초기 피처 맵의 공간 비용을 줄인다._

대안은 스트라이드 $d$의 $d\times d$ 합성곱으로 패치를 만들고, 출력에서 전치 합성곱으로 복원하는 방법이다. 구현은 더 단순하지만 DWT보다 작은 성능 페널티가 관찰됐다.

ImageNet 512에서 조기 다운샘플링이 없을 때 FID train/eval은 $5.60/5.23$, 속도는 100%다. DWT-1은 $5.42/4.97$과 139%, DWT-2는 $4.85/4.58$과 146%를 기록했다. Conv-$(2\times2)$는 $5.99/5.33$과 137%로 기준보다 품질이 나빠졌고, Conv-$(4\times4)$는 $5.04/4.80$과 146%였다. 같은 146% 속도에서 DWT-2가 Conv-$(4\times4)$보다 FID train과 eval 모두 낮다.

$512\times512$ U-Net에서는 다운샘플링으로 생략한 고해상도 residual block을 없애지 않고 저해상도로 옮겨 전체 블록 수를 유지한다.

- 패칭 없음: `channel_multiplier=[1,1,1,2,4,8,8]`, `num_res_blocks=[1,1,2,2,4,12,4]`
- $2\times$ 다운샘플링: `channel_multiplier=[1,2,2,4,8,8]`, `num_res_blocks=[2,2,2,4,12,4]`
- $4\times$ 다운샘플링: `channel_multiplier=[2,3,4,8,8]`, `num_res_blocks=[3,3,4,12,4]`

따라서 Table 5는 단순히 입력만 축소한 비교가 아니다. 고해상도에서 절약한 블록을 저해상도로 재배치해 모델 용량을 유지하면서 계산 위치를 바꾼 실험이다.

## U-Net에서 U-ViT로

U-Net 설정은 기본 채널 128, 임베딩 채널 1024, 어텐션 해상도 `[8, 16]`, 헤드 수 4를 사용한다. U-ViT는 U-Net의 중간 $16\times16$ 해상도에 있는 합성곱 레이어를 self-attention과 MLP 블록으로 대체한다. 트랜스포머 내부에는 U-Net식 스킵 연결을 추가하지 않고 잔차 연결만 사용한다.

![U-Net과 U-ViT의 구조적 차이](/assets/img/posts/simple-diffusion/figure7.png){: w="700" }
_그림 4. U-ViT는 U-Net의 해상도 계층을 유지하면서 계산이 집중되는 중간 해상도의 합성곱 블록을 트랜스포머 블록으로 바꾼다._

$512$ U-ViT의 기본 구조는 `base_channels=128`, `emb_channels=1024`, `channel_multiplier=[1,2,4,16]`, `num_res_blocks=[2,2,2]`다. $16\times16$ 영역에는 트랜스포머 블록 36개를 두며 헤드 수는 4, 트랜스포머 드롭아웃은 0.2다. `logsnr_input_type='linear'`, `mean_type='v'`, `mean_loss_type='v_mse'`를 사용한다. 패칭은 128 모델에서 사용하지 않고, 256은 `dwt_1`, 512는 `dwt_5/3_2`인 `dwt_2`를 사용한다.

텍스트-투-이미지 모델은 T5 XXL 텍스트 인코더의 임베딩을 사용하고 트랜스포머에 cross-attention을 추가한다. 세부 묘사를 위해 32 해상도의 피처 맵에서도 합성곱 대신 self-attention을 사용한다. 전처리 과정의 회전과 portrait flag를 통해 $5:3$ 가로·세로 비율의 네이티브 생성도 지원한다.

## 구현 관점에서

### $v$-prediction 학습 루프

논문은

$$
v_t=\alpha_t\epsilon_t-\sigma_t x
$$

를 예측한다. $\epsilon$-prediction은 $t=1$ 근처에서 불안정해질 수 있지만, $v$-prediction은 고해상도 학습에서 더 안정적으로 사용됐다. $z_t=\alpha_t x+\sigma_t\epsilon_t$와 함께 보면 두 식은 회전 형태이므로

$$
\hat{\epsilon}_t=\sigma_tz_t+\alpha_t\hat{v}_t
$$

로 노이즈 예측을 복원할 수 있다.

부록 알고리즘을 텐서 관점의 의사코드로 나타내면 다음과 같다.

```python
def training_loss(x, model, schedule, multiscale_sizes=None):
    # x: (B, C, H, W)
    t = uniform(0.0, 1.0, shape=(x.shape[0],))     # (B,)
    eps = standard_normal_like(x)                  # (B, C, H, W)

    logsnr_t = schedule(t)                          # (B,)
    alpha_t, sigma_t = logsnr_to_alpha_sigma(
        logsnr_t
    )                                              # each (B,)

    alpha = alpha_t[:, None, None, None]            # (B, 1, 1, 1)
    sigma = sigma_t[:, None, None, None]            # (B, 1, 1, 1)
    z_t = alpha * x + sigma * eps                   # (B, C, H, W)

    v_hat = model(z_t, logsnr_t)                    # (B, C, H, W)
    eps_hat = sigma * z_t + alpha * v_hat           # (B, C, H, W)

    if multiscale_sizes is None:
        return mean(square(eps_hat - eps))

    total = 0.0
    for s in multiscale_sizes:                      # 32, 64, ..., H
        pred_s = downsample_linear(eps_hat, s)      # (B, C, s, s)
        target_s = downsample_linear(eps, s)        # (B, C, s, s)
        loss_s = sum(square(pred_s - target_s)) / (s * s)
        total += loss_s / s
    return mean(total)
```

실제 구현에서 먼저 확인할 부분은 다음과 같다.

- `alpha_t`, `sigma_t`, `logsnr_t`의 배치 축을 이미지 축에 정확히 브로드캐스트해야 한다.
- 분산 보존 조건 $\alpha_t^2+\sigma_t^2=1$이 스케줄 변환 뒤에도 성립해야 한다.
- 멀티스케일 손실의 $1/d^2$ 정규화와 바깥쪽 $1/s$ 가중치를 혼동하면 해상도별 상대 비중이 달라진다.
- $D[\epsilon]$과 $D[\hat{\epsilon}]$에 같은 선형 다운샘플링을 적용해야 한다.
- U-ViT가 $v$를 출력하는데 이를 $\epsilon$으로 간주해 바로 MSE를 계산하면 부록의 학습 알고리즘과 달라진다.
- DWT를 적용하면 공간 크기가 줄고 채널 수가 늘어난다. 2단계 DWT에서 $(B,3,512,512)$가 $(B,48,128,128)$로 바뀌므로 첫 레이어의 채널 수를 원본 RGB 기준으로 두면 맞지 않는다.

코사인 log SNR 스케줄은 부록에서 다음과 같이 경계를 구성한다.

```python
def logsnr_schedule_cosine(t, logsnr_min, logsnr_max):
    # t: (B,), values in [0, 1]
    t_min = atan(exp(-0.5 * logsnr_max))
    t_max = atan(exp(-0.5 * logsnr_min))
    angle = t_min + t * (t_max - t_min)             # (B,)
    return -2.0 * log(tan(angle))                    # (B,)
```

Eq. 5의 시프트를 적용할 때는 log SNR에 $2\log(64/d)$를 더한다. SNR 자체에 다시 이 값을 곱하거나, 이미 시프트된 값에 해상도 비율을 중복 적용하지 않도록 주의해야 한다.

### 샘플링 루프

학습은 임의의 $t$ 한 점에서 노이즈 예측 오차를 계산하지만, 샘플링은 $t$에서 더 이른 $s$로 여러 번 이동한다. 두 루프는 대칭이 아니다. 샘플링에서는 예측 평균뿐 아니라 역과정 분산과 조건 가이던스까지 결정해야 한다.

```python
def ddpm_sampler_step(z_t, t, s, model, schedule,
                      noise_param=0.2, cond=None, eta=0.0):
    # z_t: (B, C, H, W), with s < t
    logsnr_t = schedule(t)                           # (B,)
    logsnr_s = schedule(s)                           # (B,)
    alpha_t, sigma_t = logsnr_to_alpha_sigma(logsnr_t)
    alpha_s, sigma_s = logsnr_to_alpha_sigma(logsnr_s)

    if cond is None:
        v_hat = model(z_t, logsnr_t)                 # (B, C, H, W)
        eps_hat = sigma_t * z_t + alpha_t * v_hat
    else:
        eps_cond = predict_eps(model, z_t, logsnr_t, cond)
        eps_uncond = predict_eps(model, z_t, logsnr_t, None)
        eps_hat = (1.0 + eta) * eps_cond - eta * eps_uncond

    x_hat = recover_x_from_z_and_eps(
        z_t, eps_hat, alpha_t, sigma_t
    )                                               # (B, C, H, W)

    alpha_s_given_t = alpha_s / alpha_t              # (B,)
    ratio = exp(logsnr_t - logsnr_s)                 # (B,)

    mu = (
        ratio * alpha_s_given_t * z_t
        + (1.0 - ratio) * alpha_s * x_hat
    )                                               # (B, C, H, W)

    # 분산의 곱을 log 공간에서 더한다.
    min_lvar = (
        log1p(-ratio)
        + log_sigmoid(-logsnr_s)
    )                                               # (B,)
    max_lvar = (
        log1p(-ratio)
        + log_sigmoid(-logsnr_t)
    )                                               # (B,)
    lvar = (
        noise_param * max_lvar
        + (1.0 - noise_param) * min_lvar
    )                                               # (B,)
    sigma = sqrt(exp(lvar))                          # (B,)

    noise = standard_normal_like(z_t)                # (B, C, H, W)
    return mu + broadcast(sigma) * noise
```

부록의 기본 `noise_param`은 0.2이고 MSCOCO 평가에서는 1.0이다. 이 값은 최소·최대 로그 분산 경계 사이를 보간하므로 평균 예측과 별개의 샘플 다양성·품질 조절점이다.

시간 인덱싱에서는 $s<t$를 유지해야 한다. 마지막 $t=0$ 경계에서는 추가 노이즈가 필요한지 별도로 처리해야 하며, 연속 시간 $t$와 배열 인덱스를 함께 쓸 경우 첫 단계와 마지막 단계의 off-by-one 오류를 확인해야 한다. `logsnr_t-logsnr_s`의 순서를 바꾸면 비율의 의미가 반전된다.

### Classifier-free guidance

조건부 샘플링에서는 Eq. 7을 사용한다.

$$
\hat{\epsilon}(x)
=
(1+\eta)\hat{\epsilon}(x,\mathrm{cond})
-
\eta\hat{\epsilon}(x)
\tag{7}
$$

논문이 부르는 가이던스 스케일은 $(1+\eta)$다. 따라서 구현 설정에 $\eta$를 저장하는지, $(1+\eta)$를 저장하는지 확인하지 않으면 같은 숫자를 넣고도 다른 강도로 샘플링할 수 있다. 조건부 예측의 계수를 키우고 무조건부 성분을 빼는 방식이라 조건 정합성은 강해질 수 있지만, 실험에서는 IS 상승과 eval FID 악화가 함께 나타난다.

## 정규화와 학습 설정

U-Net은 $16\times16$ 이하의 residual block에만 드롭아웃 0.1을 적용한다. ImageNet 128에서 드롭아웃이 없을 때 700K iteration 기준 FID train/eval은 $3.74/3.91$이다. 128부터 모든 해상도에 적용하면 $3.19/3.85$에 그친다. 시작 해상도를 64로 내리면 $2.27/2.85$, 32에서는 $2.31/2.87$, 16에서는 $2.41/3.03$이다. 수치만 보면 64가 가장 좋지만, 16 설정은 초기 수렴 속도가 빨라 기본값으로 채택됐다. 이는 최고 단일 지표와 전체 학습 동작 사이의 선택이다.

U-Net의 공통 설정은 Adam, $\beta_1=0.9$, $\beta_2=0.99$, $\epsilon=10^{-12}$이며 ImageNet 128만 $\beta_2=0.999$다. 학습률은 $5\times10^{-5}$, warmup은 10,000 step, weight decay는 0.0, EMA 감쇠율은 0.9999, gradient clipping은 1.0, 배치 크기는 512다.

세부 구성은 다음과 같다.

- ImageNet 128: `channel_multiplier=[1,2,4,8,8]`, `num_res_blocks=[3,4,4,12,4]`, shift 64, 1,500,000 step
- ImageNet 256: `channel_multiplier=[1,1,2,4,8,8]`, `num_res_blocks=[1,2,2,4,12,4]`, shift 64, 2,000,000 step
- ImageNet 512: DWT-2와 shift 64, 2,000,000 step

U-ViT는 Adam의 $\beta_1=0.9$, $\beta_2=0.99$, $\epsilon=10^{-12}$, 학습률 $10^{-4}$를 사용한다. warmup 10,000 step, weight decay 0.0, EMA 0.9999, gradient clipping 1.0, 배치 크기 2048이며 500,000 step 학습한다. 텍스트-투-이미지 U-ViT는 700,000 step 학습한다.

## 실험에서 확인한 것

### 노이즈 스케줄은 해상도가 높을수록 더 중요하다

ImageNet 128에서 원본 128 코사인 스케줄의 FID train/eval은 $2.96/3.38$이다. shift 64는 $2.41/3.03$, shift 32는 $2.26/2.88$로 개선된다.

ImageNet 256에서는 차이가 더 크다. 원본 256 스케줄이 $7.65/6.87$인 데 비해 shift 128은 $5.05/4.74$, shift 64는 $3.94/3.89$, shift 32는 $3.76/3.71$이다. 고해상도에서 저해상도 유효 SNR이 과도하게 올라간다는 Eq. 4의 분석과 일치하며, 해상도가 커질수록 스케줄 조정의 효과도 커진다.

### ImageNet 생성 결과

가이던스나 별도 샘플링 수정 없이 비교한 ImageNet 128 결과에서 ADM의 train FID는 5.91이다. CDM은 train/eval FID $3.52/3.76$, IS $128.8\pm2.51$이고, RIN은 train FID 2.75, IS 144.1이다. simple diffusion U-Net은 $2.26/2.88$, IS $137.3\pm2.03$이며 U-ViT 2B는 $1.94/3.23$, IS $171.9\pm3.24$다. U-ViT는 train FID와 IS가 좋아졌지만 eval FID는 U-Net의 2.88보다 나쁜 3.23이다.

ImageNet 256에서 BigGAN-deep은 train FID 6.9와 IS $171.4\pm2$, MaskGIT은 6.18과 182.1, DPC는 4.45와 244.8이다. 확산 모델 중 ADM은 train FID 10.94, CDM은 $4.88/4.63$과 IS $158.71\pm2.26$, LDM-4는 10.56과 103.49, RIN은 4.51과 161.0, DiT-XL/2는 9.62와 121.5다. simple diffusion U-Net은 $3.76/3.71$과 $171.6\pm3.07$, U-ViT 2B는 $2.77/3.75$와 $211.8\pm2.93$이다. 다시 U-ViT가 train FID와 IS를 개선하지만 eval FID는 U-Net과 거의 같고 조금 더 높다.

ImageNet 512에서 MaskGIT은 train FID 7.32와 IS 156.0, DPC는 3.62와 249.4다. ADM은 train FID 23.24, DiT-XL/2는 12.03과 IS 105.3이다. simple diffusion U-Net은 train/eval FID $4.30/4.28$, IS $171.0\pm3.00$이고 U-ViT 2B는 $3.54/4.53$, IS $205.3\pm2.65$다. 세 해상도 모두에서 대형 U-ViT의 train 지표와 IS 향상이 eval FID 향상으로 그대로 이어지지 않는다. 논문이 추가 정규화의 필요성을 언급하는 근거다.

### 텍스트-투-이미지 결과

zero-shot MSCOCO 2014 validation 30K 캡션의 $256\times256$ FID@30K는 GLIDE 12.24, Dalle-2 10.39, Imagen 7.27, Muse 7.88, Parti 7.23, eDiff-I 6.95다. simple diffusion U-ViT 2B는 8.30이다. $512\times512$ 모델의 FID@30K는 9.57이다.

이 결과는 단일 end-to-end 모델이 Dalle-2의 10.39보다 낮은 FID를 얻었음을 보여주지만, Imagen의 7.27과 eDiff-I의 6.95에는 미치지 못한다. 구조적 단순화가 곧 최고 절대 품질을 뜻하지는 않는다.

추가 실험은 가이던스 스케일 1.00, 1.25, 1.40, 1.50, 2.0, 3.0, 4.0에서 zero-shot MSCOCO의 CLIP score와 FID30K 사이 트레이드오프도 비교한다.

### 가이던스 민감도

ImageNet U-ViT의 가이던스 스케일을 1.00에서 3.00까지 높이면 세 해상도 모두 IS는 크게 오르지만 eval FID는 전반적으로 악화된다.

| Guidance | 128 train/eval FID, IS | 256 train/eval FID, IS | 512 train/eval FID, IS |
|---:|---|---|---|
| 1.00 | 1.94 / 3.23, 171.9±3.2 | 2.77 / 3.75, 211.8±2.9 | 3.54 / 4.53, 205.3±2.7 |
| 1.05 | 2.05 / 3.57, 189.9±3.5 | 2.46 / 3.80, 235.3±4.9 | 3.14 / 4.43, 228.5±4.2 |
| 1.10 | 2.35 / 4.10, 207.0±3.5 | 2.44 / 4.08, 256.3±5.0 | 3.02 / 4.60, 248.7±3.4 |
| 1.20 | 3.24 / 5.36, 237.6±3.6 | 2.96 / 5.10, 289.8±4.1 | 3.33 / 5.43, 284.6±2.8 |
| 1.40 | 5.58 / 8.26, 285.2±2.0 | 4.69 / 7.50, 342.2±5.1 | 4.97 / 7.89, 339.9±3.8 |
| 1.80 | 9.77 / 13.06, 340.1±3.6 | 8.21 / 11.81, 398.0±5.4 | 8.38 / 12.15, 401.7±5.2 |
| 2.00 | 11.47 / 14.96, 359.2±5.6 | 9.59 / 13.44, 416.4±4.7 | 9.68 / 13.68, 416.2±4.8 |
| 3.00 | 15.85 / 19.75, 399.2±2.9 | 13.61 / 18.00, 455.7±4.2 | 13.79 / 18.42, 461.4±5.0 |

예를 들어 512에서는 guidance 1.00에서 IS가 205.3이고 eval FID가 4.53이다. guidance 3.00에서는 IS가 461.4로 오르지만 eval FID는 18.42까지 나빠진다. 조건을 강하게 반영하는 방향과 평가 분포를 넓게 덮는 방향이 충돌한다는 뜻이다. 시프트 스케줄은 특히 이 조절에 민감하며, 큰 가이던스를 사용하려면 보간 스케줄이 필요하다.

## 비용과 트레이드오프

이 방법은 여러 생성 모델을 관리하는 복잡성을 줄이지만 계산 비용 자체를 없애지는 않는다. U-Net은 64개 TPUv2 디바이스, 배치 크기 512로 학습한다. ImageNet 256의 패칭 없는 모델은 초당 1.15 step이며, ImageNet 128은 1,500,000 step, 256과 512는 2,000,000 step을 사용한다.

2B 파라미터 U-ViT는 128개 TPUv4, 배치 크기 2048, 500,000 step으로 학습하며 초당 1.5 step이다. 텍스트-투-이미지 모델은 700,000 step을 사용한다. 따라서 “simple”은 학습 규모가 작다는 뜻이라기보다 캐스케이드나 잠재 모델 없이 하나의 end-to-end 생성 경로를 쓴다는 뜻에 가깝다.

경량화 관점에서 가장 직접적인 이득은 조기 다운샘플링이다. DWT-2는 ImageNet 512에서 기준 대비 146%의 step 속도를 내면서 FID도 개선했다. 고해상도 활성화 메모리를 줄이고 절약한 블록을 저해상도로 이동함으로써, 단순 FLOPs 절감보다 가속기 활용률과 메모리 병목을 함께 다룬다.

반면 $16\times16$ 블록 증가는 품질과 속도의 명확한 교환 관계를 만든다. 블록을 4+5에서 8+9로 늘리면 eval FID가 3.29에서 3.00으로 좋아지지만 처리 속도는 100%에서 76%로 내려간다. 12+13에서는 속도가 62%가 되고 eval FID도 3.03으로 더 좋아지지 않는다.

추론 비용도 반복적인 확산 샘플링에 좌우된다. Step당 비용과 전체 네트워크 호출 횟수를 구분해 비교해야 한다. 증류된 U-ViT는 TPUv4에서 텍스트 인코더 시간을 제외하고 단일 이미지를 0.42초, 8장 배치를 2.00초에 생성한다. 배치 생성은 총시간이 늘지만 이미지당 시간은 줄어 하드웨어 병렬성을 더 활용한다.

## 한계와 생각해볼 점

저자가 밝힌 첫 번째 한계는 시프트 스케줄이 고주파 디테일의 생성 시점을 뒤로 미룬다는 점이다. 고해상도 전역 구조의 노이즈 강도를 맞추기 위해 픽셀당 노이즈를 늘렸기 때문에 생기는 직접적인 결과다. 전역 일관성을 형성할 시간은 확보하지만 세부 묘사는 더 늦은 구간에 집중된다.

두 번째는 가이던스 허용 범위다. 단일 시프트 스케줄은 작은 가이던스만 안정적으로 허용하며, 큰 가이던스를 쓰려면 shift 32와 shift 256을 섞는 보간 스케줄이 필요하다. Table 9에서도 가이던스를 높일수록 IS는 상승하지만 eval FID가 민감하게 악화된다. 가이던스 스케일 하나만으로 품질이 단조롭게 좋아진다고 볼 수 없다.

세 번째는 아키텍처 확장의 불완전성이다. 계산을 $16\times16$에 집중하는 전략은 실험적으로 유효하지만, 블록을 계속 늘렸을 때 속도 저하와 평가 성능의 포화가 나타난다. 따라서 이것이 모든 규모에서 유지되는 최종 스케일링 법칙인지는 논문에서 확인되지 않는다.

네 번째는 패칭 방식의 품질 손실이다. 스트라이드 합성곱은 단순하고 속도도 높지만, 같은 146% 처리 속도에서 Conv-$(4\times4)$의 eval FID 4.80은 DWT-2의 4.58보다 높다. 구현 단순성과 품질 사이의 작은 교환 관계다.

다섯 번째는 멀티스케일 손실의 해상도 의존성이다. 512와 1024에서는 개선됐지만 256에서는 FID와 IS가 소폭 나빠졌다. 따라서 이 손실은 기본적으로 항상 켜는 구성이라기보다, 고해상도 손실이 고주파에 지배되는 구간에서 선택해야 하는 장치로 보인다.

여섯 번째는 대형 U-ViT의 과적합 경향이다. 2B 모델은 train FID와 IS를 크게 개선하지만 eval FID에서는 U-Net보다 나은 결과를 일관되게 만들지 못했다. 모델 용량 확대와 함께 추가 정규화가 필요하다는 것이 논문의 해석이다.

마지막으로 텍스트-투-이미지에서는 단일 모델의 단순성을 유지하며 Dalle-2보다 낮은 FID를 기록했지만, Imagen과 eDiff-I의 수치에는 미치지 못했다. 이 논문의 강점은 모든 비교 모델을 절대 품질로 앞서는 데 있다기보다, 고해상도 확산을 반드시 잠재 공간이나 다단계 모델로 분해해야 한다는 전제를 재검토한 데 있다.

내가 이 논문에서 중요하게 보는 지점은 네 가지 설계가 독립적인 요령이 아니라 하나의 병목 구조를 공유한다는 점이다. 스케줄 시프트와 멀티스케일 손실은 해상도가 커질 때 학습 신호의 의미가 바뀌는 문제를 다룬다. DWT와 $16\times16$ 중심 확장은 해상도가 커질 때 하드웨어 비용의 성격이 바뀌는 문제를 다룬다. 선택적 드롭아웃은 같은 정규화 강도가 해상도별로 다른 효과를 내는 문제를 다룬다. 단일 모델을 유지하려면 픽셀 수만 늘리는 것이 아니라 확률 과정, 목적함수, 네트워크 배치, 정규화 위치를 함께 다시 맞춰야 한다는 것이 이 방법의 핵심이다.
