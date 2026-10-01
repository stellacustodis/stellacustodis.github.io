---
title: "Image and Video Tokenization with Binary Spherical Quantization"
date: 2026-08-25 21:00:00 +0900
permalink: /posts/binary-spherical-quantization/
categories:
  - AI
  - Paper Review
tags: [paper-review, visual-tokenizer, quantization, video-tokenization, transformer]
description: "Binary Spherical Quantization이 코드북 없이 이미지와 비디오를 이산 토큰으로 압축하는 원리와 생성·압축 성능, 비용상의 트레이드오프를 정리한다."
related: [vqgan, rq-vae, improved-video-vae-for-latent-video-diffusion]
paper:
  authors: "Yue Zhao, Yuanjun Xiong, Philipp Kraehenbuehl"
  venue: "The Thirteenth International Conference on Learning Representations"
  url: "https://openreview.net/forum?id=yGnsH3gQ6U"
  code: "https://github.com/zhaoyue-zephyrus/bsq-vit"
---

## 세 줄 요약

이 논문은 이미지와 비디오를 하나의 Transformer 구조로 처리하는 시각 토크나이저와 이진 구면 양자화(Binary Spherical Quantization, BSQ)를 제안한다.

BSQ는 잠재 벡터를 단위 초구면(unit hypersphere)에 투영한 뒤 각 좌표의 부호만 남겨, 학습되는 코드북 없이 $2^L$개의 이산 토큰을 표현하고 양자화 오차를 유한하게 제한한다.

코드북 전체를 열거하지 않고 차원별 베르누이 분포로 엔트로피를 계산할 수 있지만, 큰 토큰 공간을 생성 모델에서 다루려면 서브토큰 그룹화와 추가 디코딩 단계가 필요하다.

## 이 논문이 풀려는 문제

이미지 생성 모델에서 토크나이저는 픽셀 공간과 생성 모델이 다룰 이산 토큰 공간을 연결한다. 이미지 $X$를 인코더로 압축하고 양자화한 뒤 디코더가 복원하도록 학습하면, 이후의 생성 모델은 픽셀을 직접 생성하는 대신 압축된 토큰을 예측할 수 있다.

문제는 이 구조를 비디오로 확장할 때 나타난다. CNN 기반 VQ-VAE 계열은 이미지의 공간 합성곱을 비디오의 시공간 합성곱으로 바꾸기 위해 구조를 상당히 수정해야 하고 계산 비용도 증가한다. 반대로 비디오를 서로 독립적인 이미지의 나열로 처리하면 움직임을 양자화에 반영하지 못한다. 프레임 사이에 반복되는 시각 정보도 매번 다시 압축하므로 시간 방향의 중복을 활용하기 어렵다.

코드북 기반 벡터 양자화(vector quantization, VQ)에는 별도의 확장성 문제도 있다. 코드북 크기를 $K$라고 하면 최근접 코드를 찾는 비용이 $K$에 선형으로 증가한다. 작은 데이터셋에서는 큰 코드북이 쉽게 과적합할 수 있고, 더 큰 어휘가 필요한 비디오에서는 이 문제가 특히 부담스럽다.

Lookup-Free Quantization(LFQ)은 명시적인 코드북 조회를 없애지만, 논문이 지적하는 핵심 약점은 양자화 오차가 상한 없이 커질 수 있다는 점이다. 입력 벡터의 크기에 제한이 없는데 출력은 좌표별 부호로 고정되므로, 입력 노름이 커질수록 두 벡터 사이 거리도 계속 커질 수 있다. 이 때문에 commitment loss가 필요하고 학습도 더 어렵다고 설명한다.

압축 관점에서도 빈틈이 있다. 높은 성능의 현대 비디오 압축기는 변환 부호화와 움직임 보상을 결합하는 하이브리드 코더에 의존한다. 학습 기반 방식인 VCT는 무겁게 설계된 이미지 압축 모델을 요구하며 시간 문맥 창도 짧다. 따라서 이 논문이 겨냥하는 문제는 단순히 “새 양자화기를 만들자”가 아니다. 다음 세 조건을 함께 만족하는 토크나이저를 만들려는 시도다.

1. 이미지와 비디오를 같은 모델 구조로 처리한다.
2. 코드북 크기가 커져도 양자화와 엔트로피 계산 비용이 폭증하지 않는다.
3. 생성과 압축에 모두 사용할 수 있는 이산 표현을 만든다.

## 핵심 아이디어

BSQ의 핵심은 양자화하기 전에 잠재 벡터의 크기를 버리고 방향만 남기는 것이다. 인코더 출력 $z\in\mathbb{R}^d$를 $L$차원으로 투영하고, 이 벡터를 단위 구면으로 정규화한 뒤 각 좌표를 양수 또는 음수로 양자화한다. $L$개의 부호가 곧 $L$비트 토큰이므로, 학습 파라미터가 없는 암묵적 코드북의 크기는 $2^L$이다.

이 설계에서 $\ell_2$ 정규화는 부가적인 안정화 기법이 아니라 LFQ와 BSQ를 가르는 핵심이다. 정규화 전 벡터 $v$의 크기가 아무리 크더라도 $u=v/\|v\|_2$는 단위 구면 위에 놓인다. 양자화된 벡터 $\hat u$도 각 좌표가 $\pm1/\sqrt L$이므로 노름이 1이다. 입력과 출력이 같은 단위 구면 위에 있기 때문에 양자화 오차를 유한하게 제한할 수 있다.

두 번째 축은 Transformer 기반 인코더와 디코더다. 입력 패치의 시간 관계를 블록 단위 인과적 어텐션(block-wise causal attention)으로 제한하면 이미지와 비디오를 같은 인터페이스로 학습할 수 있다. 이미지는 $T=1$인 비디오로 취급하고, 비디오는 현재 프레임을 복원할 때 현재와 과거 프레임의 토큰만 사용한다.

양자화기와 백본의 역할은 구분해서 볼 필요가 있다. BSQ는 코드북 검색과 엔트로피 계산의 확장성을 개선한다. 반면 시간 중복을 활용하고 가변 길이 비디오를 처리하는 능력은 Transformer와 인과적 마스크에서 나온다.

## VQ와 LFQ에서 출발하기

### 최근접 코드로 바꾸는 VQ

일반적인 VQ는 연속 잠재 벡터 $z$에 가장 가까운 코드북 항목을 선택한다.

$$
\hat{z}=q_{VQ}(z)=c_k
=\arg\min_{c_{\hat{k}}\in C}\|z-c_{\hat{k}}\|_2
\tag{1}
$$

여기서 $C$는 학습되는 코드북이고 $c_k$는 선택된 항목이다. 이 식은 연속 벡터를 이산 토큰으로 바꾸는 목적을 직접 표현하지만, $K=|C|$가 커지면 후보와의 거리를 계산하는 비용도 커진다. 코드북 항목이 충분히 사용되지 않으면 표현 가능한 어휘와 실제 사용 어휘 사이의 차이도 생긴다.

전체 토크나이저는 양자화 오차만 줄이지 않는다.

$$
\underset{E,G,q}{\operatorname{minimize}}\;
\mathbb{E}_X\left[
L_{VQ}(E,G,q)
+\eta L_{LPIPS}(E,G,q)
+\lambda L_{GAN}(E,G,q)
\right]
\tag{2}
$$

$E$, $G$, $q$는 각각 인코더, 디코더, 양자화기다. $L_{VQ}$는 이산 병목을 학습하고, $L_{LPIPS}$는 지각적으로 중요한 차이를, $L_{GAN}$은 복원 영상의 현실감을 담당한다. 픽셀 오차만 줄이면 수치상 가까운 평균적 복원을 만들 수 있지만, 지각 품질이나 생성 모델이 사용하는 특징까지 보존된다고 보장할 수 없다.

VQ와 LFQ 계열에서는 연속 벡터가 선택된 코드에서 지나치게 멀어지지 않도록 commitment loss를 사용한다.

$$
L_{commit}(\hat z,z)
=
\|\operatorname{sg}(\hat z)-z\|
\tag{3}
$$

$\operatorname{sg}$는 stop-gradient다. 양자화된 목표점 쪽으로는 이 항의 기울기를 흘리지 않고, 인코더 출력 $z$가 선택된 이산 표현에 가까워지도록 만든다. 뒤의 ablation에서 BSQ는 이 항을 제거했을 때 오히려 가장 좋은 구성을 보이는데, 논문은 그 이유를 구면 정규화로 양자화 오차가 이미 제한되기 때문이라고 설명한다.

### 코드 사용량을 조절하는 엔트로피 목적

LFQ는 유효 코드를 충분히 사용하기 위해 다음 엔트로피 목적을 둔다.

$$
L_{entropy}
=
\mathbb{E}[H(q(z))]
-\gamma H[\mathbb{E}[q(z)]]
\tag{4}
$$

첫 항은 각 입력의 양자화 분포가 얼마나 불확실한지를 나타낸다. 이 값을 줄이면 개별 입력은 특정 코드에 선명하게 배정된다. 두 번째 항에는 음수가 붙어 있으므로 데이터셋 전체에서 평균 코드 분포의 엔트로피를 키운다. 즉 모든 입력이 같은 소수의 코드로 몰리는 붕괴를 막는다.

하드 양자화는 직접 미분할 수 없으므로 LFQ는 코드북 위의 부드러운 확률을 사용한다.

$$
\hat q(c\mid z)
=
\frac{\exp[-\tau(c-z)^2]}
{\sum_{c\in C_{LFQ}}\exp[-\tau(c-z)^2]}
\tag{5}
$$

$\tau$는 코드와 입력 사이 거리 차이가 확률에 얼마나 강하게 반영되는지를 결정한다. 이 분포 덕분에 식 (4)를 학습에 사용할 수 있지만, 코드북 전체를 다루는 계산은 어휘가 커질수록 부담이 된다. BSQ는 코드북의 곱 구조를 이용해 이 계산을 $L$개의 이진 문제로 바꾼다.

## 방법 — Binary Spherical Quantization

### 투영, 정규화, 부호 양자화

BSQ의 순전파는 네 단계로 정리된다.

$$
v=\operatorname{Linear}(z)\in\mathbb{R}^L,\qquad L\ll d
$$

$$
u=\frac{v}{\|v\|_2}
$$

$$
\hat u=\frac{1}{\sqrt L}\operatorname{sign}(u)
$$

$$
\hat z=\operatorname{Linear}(\hat u)\in\mathbb{R}^d
$$

$\operatorname{sign}(0)$은 1로 정의한다. 따라서 가능한 출력 집합은

$$
C_{BSQ}
=
\left\{-\frac{1}{\sqrt L},\frac{1}{\sqrt L}\right\}^L
$$

이다. 각 좌표에 두 선택지가 있으므로 유효 어휘 크기는 $2^L$이지만, $2^L$개의 벡터를 파라미터로 저장하지 않는다. 코드북 크기를 늘리기 위해 필요한 것은 명시적 항목 추가가 아니라 병목 차원 $L$의 증가다.

하드 부호 함수의 미분 문제에는 straight-through estimator(STE)를 사용한다.

$$
\operatorname{sign}_{STE}(x)
=
\operatorname{sg}(\operatorname{sign}(x)-x)+x
$$

순전파에서는 $\operatorname{sign}(x)$가 나오지만, 역전파에서는 stop-gradient 안의 항이 사라져 $x$를 통과하는 기울기를 사용한다. 다만 BSQ에서는 정규화 $u=v/\|v\|_2$가 앞에 있으므로, LFQ처럼 모든 좌표의 기울기가 단순히 1이 되지는 않는다. Table 7이 제시한 BSQ의 좌표별 기울기는 다음과 같다.

$$
\frac{\partial\hat u_i}{\partial v_i}
=
\frac{1}{\sqrt L}
\left(1-\frac{v_i^2}{\|v\|_2^2}\right)
$$

위 기울기 식은 원문 Table 7의 표기다. 다만 $u=v/\|v\|_2$의 일반적인 Jacobian에는 $1/\|v\|_2$ 인자가 포함되므로, 이 표기를 정규화 연산의 도함수와 그대로 동일시하면 안 된다. 아래 의사코드의 `stop_gradient(u_hat - u) + u`는 역전파를 $u$의 Jacobian으로 두는 STE 관례이며, 부호 함수의 STE 뒤에 $1/\sqrt L$을 곱하는 관례와 스케일이 다르다.

추론 시에는 부호 벡터를 정수 토큰으로 바꿀 수 있다.

$$
k=\sum_{i=1}^{L}\mathbf{1}[v_i>0]2^{i-1}
$$

$i$번째 부호가 정수의 $(i-1)$번째 비트가 된다. 역변환은 bitshift와 bitwise AND로 각 비트를 꺼낸 뒤, 비트값을 $\pm1/\sqrt L$로 되돌린다. 이 정의에서는 $v_i=0$일 때 양자화 출력은 양수지만 토큰 식은 엄격한 부등식 $v_i>0$을 사용한다. 두 규칙이 경계에서 다르게 읽힐 수 있으므로 실제 구현에서는 논문의 정의를 그대로 대조해야 한다.

### $2^L$개 코드를 열거하지 않는 확률 계산

단위 구면 위의 입력 $u$와 코드 $c$는 모두 노름이 1이다. 따라서 거리를 사용하는 대신 내적을 사용해 부드러운 양자화 분포를 쓸 수 있다.

$$
\hat q(c\mid u)
=
\frac{\exp(\tau c^\top u)}
{\sum_{c\in C_{BSQ}}\exp(\tau c^\top u)}
=
\prod_{d=1}^{L}\sigma(2\tau c_du_d)
\tag{7}
$$

오른쪽의 곱 형태가 계산 효율의 핵심이다. 코드 집합이 $C=\Omega^L$이고

$$
\Omega=
\left\{-\frac{1}{\sqrt L},\frac{1}{\sqrt L}\right\}
$$

이면 분모는 다음과 같이 분해된다.

$$
\sum_{c\in C}e^{\tau u^\top c}
=
\sum_{c\in C}\prod_{d=1}^{L}e^{\tau u_dc_d}
=
\prod_{d=1}^{L}\sum_{c_d\in\Omega}e^{\tau u_dc_d}
\tag{12}
$$

전체 코드의 합이 각 차원에 대한 두 선택지의 합을 곱한 형태로 바뀐다. 이를 정리하면 식 (7)의 시그모이드 곱이 된다. $2^L$개 코드에 대한 확률을 만들 필요 없이 $L$개의 베르누이 확률만 계산하면 되므로 복잡도는 병목 차원 $L$에 선형이다.

곱분포의 엔트로피는 주변분포 엔트로피의 합이므로 식 (4)의 첫 항도 정확하게 분해된다.

$$
\mathbb{E}_u[H(\hat q(c\mid u))]
=
\mathbb{E}_u
\left[
\sum_{d=1}^{L}H(\hat q(c_d\mid u_d))
\right]
\tag{8}
$$

이 식에서 독립성은 단순한 계산 편의가 아니다. 코드북을 좌표별 이진 선택의 데카르트 곱으로 만든 설계 자체에서 나온다.

반면 데이터셋 전체의 평균 분포에서는 좌표 사이 상관관계가 생길 수 있다. 따라서 두 번째 엔트로피 항은 다음과 같이 근사한다.

$$
H(\mathbb{E}_u[\hat q(c\mid u)])
\approx
H(\tilde q(c))
=
\sum_{d=1}^{L}
H(\mathbb{E}_{u_d}[\hat q(c_d\mid u_d)])
\tag{9}
$$

여기서

$$
Q(c)=\mathbb{E}_u[\hat q(c\mid u)]
$$

이고, $\tilde q$는 $Q$에 가장 가까운 factorized distribution이다. 부록의 M-projection 전개는 최적 주변분포가

$$
\tilde q_d(c_d)^*
=
\mathbb{E}_u[\sigma(2u_dc_d)]
$$

임을 보이고,

$$
D(Q\|\tilde q)
=
H(\tilde q)-H(Q)\ge 0
$$

를 얻는다. 따라서 factorized entropy $H(\tilde q)$는 실제 결합 엔트로피 $H(Q)$의 상한이다. 이 근사가 버리는 것은 좌표 사이 상호정보, 즉 상관관계다. 논문은 최대 상관 분포에서도 근사 오차를 분석했고 실제 설정인 $\tau=1/100$에서는 오차가 거의 없다고 보고한다.

> BSQ가 “독립적인 비트만 만든다”는 뜻은 아니다. 입력별 soft distribution은 곱으로 계산하지만, 데이터셋 전체에서 비트 사이 상관관계가 생길 수 있어 식 (9)는 정확한 등식이 아니라 상한을 주는 근사다.
{: .prompt-info }

### 구면 정규화가 양자화 오차를 제한하는 이유

BSQ는 다음 오차 상한을 갖는다.

$$
\mathbb{E}_u[d(u,\hat u)]
<
\sqrt{2-\frac{2}{\sqrt L}}
<
\sqrt 2
\tag{10}
$$

$d(u,\hat u)=\|u-\hat u\|$다. 두 벡터 모두 단위 노름이므로

$$
\|u-\hat u\|_2^2
=
2-2u^\top\hat u
$$

형태로 볼 수 있다. BSQ에서는

$$
u^\top\hat u
=
\frac{\|u\|_1}{\sqrt L}
$$

이다. 단위 $\ell_2$ 노름을 유지하면서 $\ell_1$ 노름이 가장 작아지는 축 정렬 벡터(axis-aligned vector)가 가장 큰 오차를 만든다. 이를 이용한 느슨한 상한이 부록의 식 (13)이다.

$$
\mathbb{E}_u[d(u,\hat u)]
=
\mathbb{E}_u[d_{\max}(u,\hat u)]
<
\sqrt{2-\frac{2}{\sqrt L}}
<
\sqrt2
\tag{13}
$$

더 촘촘한 상한은 구면 전체에서 거리의 기대값을 적분해 구한다.

$$
\mathbb{E}_u[d(u,\hat u)]
=
\frac{
\int\cdots\int_{S^{L-1}}dS^{L-1}V\,d(u,\hat u)
}{
\int\cdots\int_{S^{L-1}}dS^{L-1}V
}
\tag{14}
$$

$S^{L-1}$은 단위 $L$-sphere이고 표면적은 $2\pi^{L/2}/\Gamma(L/2)$로 주어진다. 모든 부호 조합이 대칭이므로, 모든 좌표가 양수인 부분영역 $A_{L-1}$만 적분해도 된다.

$$
\mathbb{E}_u[d(u,\hat u)]
=
\frac{
\int\cdots\int_{A_{L-1}}dS^{L-1}V\,d(u,\hat u)
}{
\int\cdots\int_{A_{L-1}}dS^{L-1}V
}
\tag{15}
$$

초구면 좌표 $\phi_1,\ldots,\phi_{L-1}$로 각 $u_i$를 전개하면 분자의 거리는 다음 형태가 된다.

$$
\int_0^{\frac{\pi}{2}}\cdots\int_0^{\frac{\pi}{2}}
dS^{L-1}V
\left\{
\left[\cos(\phi_1)-\frac1{\sqrt L}\right]^2
+\cdots+
\left[
\sin(\phi_1)\cdots\sin(\phi_{L-1})-\frac1{\sqrt L}
\right]^2
\right\}^{\frac12}
\tag{16}
$$

삼각함수 항등식과 부등식을 적용하면 이를 더 단순한 적분으로 상계할 수 있다.

$$
\int\cdots\int_{A_{L-1}}
dS^{L-1}V
\left[
2-\frac{2}{\sqrt L}\cos(\phi_1)
\right]^{\frac12}
\tag{17}
$$

이 적분을 $\phi_1$과 나머지 $S^{L-2}$ 영역으로 분리하면

$$
\int_0^{\frac{\pi}{2}}
\int\cdots\int_{A_{L-1}}
dS^{L-2}V
\left[
2-\frac{2}{\sqrt L}\cos(\phi_1)
\right]^{\frac12}
\sin^{L-2}(\phi_1)d\phi_1
\tag{18}
$$

이 되고, 부분영역의 표면적으로 나누어 최종적으로 다음 상한을 얻는다.

$$
\mathbb{E}_u[d(u,\hat u)]
<
\frac{2\Gamma(\frac L2)}
{\sqrt\pi\Gamma(\frac{L-1}{2})}
\int_0^{\frac{\pi}{2}}
\left[
2-\frac{2}{\sqrt L}\cos(\phi_1)
\right]^{\frac12}
\sin^{L-2}(\phi_1)d\phi_1
\tag{19}
$$

식 (13)은 최악의 방향을 이용한 간단한 상한이고, 식 (14)~(19)는 구면의 대칭성과 표면적을 이용해 평균 오차에 더 가까운 상한을 만든다. 두 유도 모두 입력이 단위 구면 위에 있다는 가정에 의존한다. 정규화를 제거하면 $v$의 노름이 제한되지 않으므로 이 논법을 적용할 수 없고, Table 7의 LFQ처럼 기대 양자화 오차가 unbounded인 경우로 돌아간다.

## 이미지와 비디오를 통합하는 Transformer

입력 비디오는

$$
X\in\mathbb{R}^{T\times H\times W\times3}
$$

이고, 각 프레임을 겹치지 않는 $1\times p\times p$ 패치로 나눈다. 시간축 크기가 1인 패치를 쓰므로 한 패치는 한 프레임 안의 공간 영역만 포함한다. 패치를 펼쳐 선형 투영한 뒤 Transformer Encoder 층을 통과시켜 잠재 표현을 만든다.

공간 위치 임베딩 $PE_s\in\mathbb{R}^{N\times d}$와 시간 위치 임베딩 $PE_t\in\mathbb{R}^{T\times d}$는 factorized 형태로 더한다. 시간 위치 임베딩은 0으로 초기화한다. 이미지 사전학습 모델을 비디오로 확장할 때 처음부터 임의의 시간 편향을 주지 않고, 기존 공간 표현을 유지한 채 시간 정보를 학습하게 하는 설계로 읽을 수 있다.

블록 단위 인과적 마스크는 시간 $t$의 시각 토큰을 복원할 때 시간 $t$와 그 이전 토큰만 참조하도록 제한한다. 같은 프레임 안의 패치까지 일렬로 인과화하는 것이 아니라 프레임 블록을 기준으로 과거와 현재를 허용한다. $T=1$이면 이 구조가 그대로 이미지 토크나이저가 되며, 추론 시에는 가변 길이 비디오에도 적용할 수 있다.

![이미지와 비디오를 통합하는 블록 단위 인과적 어텐션](/assets/img/posts/binary-spherical-quantization/figure3.png){: w="700" }
_그림 3. 현재 프레임의 패치는 현재 및 과거 프레임의 시각 패치만 참조한다. 이미지 입력은 $T=1$인 특수한 경우다._

디코더는 양자화된 잠재 표현을 Transformer Decoder에 통과시킨 뒤 두 층 MLP로 픽셀을 복원한다.

$$
(\hat x_1,\ldots,\hat x_N)
=
\operatorname{MLP}
\left(
\operatorname{TransformerDecoder}
(\hat z_1,\ldots,\hat z_N)
\right)
$$

MLP는 $\operatorname{Linear}\circ\operatorname{Tanh}\circ\operatorname{Linear}$ 구조다. 비디오 미세조정에서는 각 프레임을 2D StyleGAN에 개별적으로 입력하고 프레임별 손실을 합산한다. 백본은 시간 문맥을 사용하지만 adversarial loss는 프레임 단위로 계산된다는 비대칭이 있다.

## 생성과 압축에 토큰을 사용하는 방법

### 큰 어휘를 처리하는 Masked LM

$L$비트 BSQ 토큰은 이론상 $2^L$개의 값을 가질 수 있다. 양자화 단계에서는 부호 연산만 하면 되지만, 생성 모델이 $2^L$ 크기의 임베딩 테이블과 출력 분류기를 직접 가지면 다시 거대한 어휘 문제가 생긴다.

논문은 토큰을 그룹과 독립적인 서브토큰으로 나누는 Masked LM 설계를 사용한다. 어휘 크기를 한 번에 다루는 대신 더 작은 서브토큰을 예측하고, 그 대가로 디코딩 단계 수를 늘린다. 즉 BSQ의 지수적 표현력은 공짜가 아니다. 양자화기에서는 효율적이지만 생성 모델에서는 출력 공간을 구조화해야 한다.

실험의 Masked LM은 post-LN Transformer 24층, 은닉 차원 768이며 batch size 1024로 1M step 학습한다. AdamW의 $\beta_1=0.9$, $\beta_2=0.96$, weight decay는 0.045다. cosine unmasking, temperature 15, 20% condition masking을 사용한다. classifier-free guidance는 $\alpha=0.5$로 다음 로짓을 만든다.

$$
\operatorname{logits}
=
\operatorname{logits}_{uncond}
+
(1+\alpha)
\left(
\operatorname{logits}_{cond}
-
\operatorname{logits}_{uncond}
\right)
$$

### Arithmetic coding

압축에서는 토큰열의 조건부 확률을 autoregressive model로 예측한다.

$$
P_t(k_1,\ldots,k_N)
=
P_t(k_1)
P_t(k_2\mid k_1)
\cdots
P_t(k_N\mid k_1,\ldots,k_{N-1})
\tag{6}
$$

Arithmetic coding(AC)은 이 확률에 따라 현재 구간을 세분화한다. $n$번째 위치에서 기호 $y$에 할당되는 구간은

$$
I_n(y)
=
\left[
l_{n-1}
+
(u_{n-1}-l_{n-1})
\sum_{x=1}^{y-1}\rho(x\mid x_{<n}),
\;
l_{n-1}
+
(u_{n-1}-l_{n-1})
\sum_{x=1}^{y}\rho(x\mid x_{<n})
\right)
\tag{11}
$$

이다. $[l_{n-1},u_{n-1})$는 이전 단계까지 좁혀진 구간이고, $\rho(x\mid x_{<n})$는 다음 토큰의 조건부 확률이다. 전체 토큰을 처리한 뒤 최종 구간 안의 이진 소수 $\lambda$를 고르면 비트스트림이 된다. 디코더는 동일한 조건부 확률과 $\lambda$를 사용해 어느 하위 구간에 속하는지 반복적으로 판정하고 원래 토큰열을 복원한다.

AC용 autoregressive Transformer는 24층, 은닉 차원 768이며 8 GPU에서 batch size 64로 학습했다. AdamW 설정은 $\beta_1=0.9$, $\beta_2=0.96$, weight decay 0.045이고 학습에는 약 1주가 걸렸다.

## 구현 관점에서

### 토크나이저의 순전파

다음 코드는 논문의 수식을 텐서 연산 순서로 옮긴 의사코드다.

```python
def bsq_tokenize(x, spatial_pe, temporal_pe):
    # x: (B, T, H, W, 3)
    patches = patchify(x, patch_size=(1, p, p))
    # patches: (B, T, N_spatial, 3 * p * p)

    h = linear_patch_projection(patches)
    # h: (B, T, N_spatial, d)

    h = h + spatial_pe[None, None, :, :]
    h = h + temporal_pe[None, :, None, :]
    # temporal_pe: (T, d), zero-initialized

    z = transformer_encoder(
        h,
        attention_mask=blockwise_causal_mask(T, N_spatial),
    )
    # z: (B, T, N_spatial, d)

    v = project_down(z)
    # v: (B, T, N_spatial, L)

    u = v / l2_norm(v, axis=-1, keepdims=True)
    # u: (B, T, N_spatial, L), ||u||_2 = 1

    hard = sign_with_zero_mapped_to_positive(u)
    u_hat = hard / sqrt(L)
    # u_hat: (B, T, N_spatial, L), each value is ±1/sqrt(L)

    u_hat_ste = stop_gradient(u_hat - u) + u
    z_hat = project_up(u_hat_ste)
    # z_hat: (B, T, N_spatial, d)

    decoded = transformer_decoder(
        z_hat,
        attention_mask=blockwise_causal_mask(T, N_spatial),
    )
    pixels = linear_2(tanh(linear_1(decoded)))
    # pixels: patch-shaped outputs

    x_hat = unpatchify(pixels)
    # x_hat: (B, T, H, W, 3)
    return x_hat, v, u, u_hat
```

$v=0$일 때는 정규화의 분모가 0이 되므로 구현에서 그 경계를 어떻게 처리할지 별도로 정해야 한다. 반면 `sign(0) -> 1`은 명시된 규칙이므로 일반적인 부호 함수의 0 반환값을 그대로 사용하면 코드가 달라진다.

학습 루프에서는 hard code를 사용한 복원을 만들되 STE로 인코더까지 기울기를 보낸다.

```python
for x in training_data:
    # x: (B, T, H, W, 3)
    x_hat, v, u, u_hat = bsq_tokenize(
        x, spatial_pe, temporal_pe
    )

    loss_mse = reconstruction_loss(x_hat, x)
    loss_lpips = perceptual_loss(x_hat, x)
    loss_gan = adversarial_loss_per_frame(x_hat, x)
    # video: compute on each frame and sum

    bit_prob = channelwise_bernoulli_probability(u, tau)
    # bit_prob: (B, T, N_spatial, L)

    sample_entropy = sum_binary_entropies(bit_prob)
    dataset_entropy_upper = sum_binary_entropies(
        average_over_data(bit_prob)
    )
    loss_entropy = sample_entropy - gamma * dataset_entropy_upper

    loss = (
        loss_mse
        + 0.1 * loss_lpips
        + 0.1 * loss_gan
        + loss_entropy
    )
    update_encoder_quantizer_decoder(loss)
```

이미지 토크나이저 설정에서 perceptual loss와 adversarial loss 가중치는 각각 0.1이고 엔트로피 항의 $\gamma$는 1이다. Table 7의 BSQ 목적에는 $L_{MSE}$, $L_{LPIPS}$, $L_{GAN}$, $L_{entropy}$가 들어가며 commitment loss는 포함되지 않는다.

### 추론에서 정수 토큰으로 바꾸기

```python
def bits_to_token_id(v):
    # v: (..., L)
    bits = (v > 0)
    # bits: (..., L), boolean

    token_id = 0
    for i in range(L):
        token_id += bits[..., i] << i
    # token_id: (...), integer in [0, 2**L - 1]
    return token_id


def token_id_to_bsq(token_id):
    # token_id: (...)
    coords = []
    for i in range(L):
        bit_i = (token_id >> i) & 1
        coord_i = (2 * bit_i - 1) / sqrt(L)
        coords.append(coord_i)
    return stack(coords, axis=-1)
    # (..., L)
```

이 부분에서 가장 쉬운 실수는 비트 순서다. 식의 $2^{i-1}$과 코드의 0-based 인덱스를 일치시켜야 한다. 인코더와 디코더가 서로 다른 endianness를 사용하면 정수 범위는 정상인데 복원되는 부호 벡터만 달라져 오류를 찾기 어렵다.

### 학습 루프와 생성 루프는 대칭이 아니다

토크나이저 학습에서는 한 번의 인코더 순전파로 모든 BSQ 비트를 얻는다. 반면 Masked LM 생성은 일부 토큰을 마스킹한 상태에서 시작해 여러 디코딩 단계에 걸쳐 서브토큰을 채운다.

```python
tokens = initialize_masked_subtokens(batch_size, sequence_length, groups)

for step in range(num_decode_steps):
    logits_cond = masked_lm(tokens, condition)
    logits_uncond = masked_lm(tokens, no_condition)

    logits = logits_uncond + (1 + alpha) * (
        logits_cond - logits_uncond
    )
    tokens = update_masked_subtokens(
        tokens,
        logits,
        schedule="cosine",
        temperature=15,
    )

bsq_codes = combine_subtokens(tokens)
video_or_image = tokenizer_decoder(bsq_codes)
```

서브토큰을 나누면 출력층의 어휘 부담은 줄지만 업데이트할 예측 단위와 디코딩 과정이 늘어난다. Table 3의 12단계와 32단계 결과 차이는 이 비용과 품질의 교환을 보여준다.

### 재현할 때 확인할 지점

- 공간 패치 크기는 $1\times p\times p$다. 시간축까지 $p$만큼 묶으면 논문의 입력 구조가 달라진다.
- 블록 인과 마스크는 프레임 단위다. 시간 $t$는 미래 프레임을 볼 수 없지만 현재 프레임의 패치는 같은 시간 블록에 속한다.
- 시간 위치 임베딩은 0으로 초기화한다.
- BSQ 확률과 엔트로피는 $2^L$ 코드 전체를 열거하지 않고 $L$개 차원으로 계산해야 한다.
- 추론의 `sign(0)` 규칙과 토큰 ID의 부등식, 비트 순서를 구현 전체에서 일관되게 유지해야 한다.
- 비디오 adversarial loss는 각 프레임을 2D StyleGAN에 개별 입력한 뒤 합산한다.
- 평가 시 기본 공간 다운샘플 비율은 $p=8$이며 MaskGIT만 $p=16$이다.
- 이미지 resize 보간법에 따라 Table 1과 Table 8의 수치가 달라진다. 전처리를 기록하지 않으면 같은 모델을 평가하고도 다른 결과가 나온다.
- Table 1의 표준편차는 반복 학습 간 편차가 아니라 샘플 간 편차다.

## 실험 설정

이미지 토크나이저는 ImageNet ILSVRC2012에서 학습하고 ImageNet-1k validation과 MS-COCO 2017val에서 평가했다. ImageNet-1k에는 학습 이미지 1.28M개와 검증 이미지 50,000개가 있고, COCO 2017val에는 5,000개 이미지가 있다.

평가 전처리는 짧은 변을 256픽셀로 resize한 뒤 중앙에서 $256\times256$을 crop한다. Table 1은 Lánczos interpolation, Table 8은 bilinear interpolation을 사용한다. ViT-VQGAN을 제외한 모델은 같은 전처리로 재평가했다.

비디오 토크나이저는 ImageNet 사전학습 체크포인트에서 시작해 UCF-101에서 500K step, 1600 epoch를 추가 학습했다. UCF-101은 13,320개 비디오 클립으로 구성되고 split 1은 학습 9,537개, 검증 3,783개다.

압축 평가는 Kodak, MCL-JCV, UVG를 사용한다. MCL-JCV에는 30개의 1080p 비디오가 있고 해상도는 $1{,}920\times1{,}080$, 프레임 레이트는 24~30 FPS다. UVG는 16개의 4K 비디오로 구성되며 50/120 FPS이고, 실험에서는 120 FPS인 $1{,}920\times1{,}080$ YUV 8bit 비디오 7개를 사용했다.

H.264와 H.265 비교에는 FFmpeg의 `-preset medium`, `-bf 0`, `-pix_fmt yuv420p`, `-threads 4` 설정을 사용했다. CRF 범위는 17~47이고 $1{,}920\times1{,}080$과 $640\times360$ 해상도를 평가했다.

이미지 토크나이저는 GPU당 batch size 32, total learning rate $10^{-4}$로 200 epoch, 약 1M step 학습했다. 세부 optimizer는 AdamW로 $\beta_1=0.9$, $\beta_2=0.99$, weight decay $10^{-4}$, base learning rate $4\times10^{-7}$ 및 half-period cosine annealing을 사용한다. 이미지 사전학습과 비디오 미세조정을 포함한 전체 일정은 8-GPU A5000 서버 두 대에서 약 5일이 걸렸다.

처리량은 4개의 A5000 GPU와 Threadripper 32-Core CPU가 있는 별도 서버에서 측정했다.

## 이미지 재구성에서 확인한 것

![COCO2017 및 ImageNet-1K 이미지 재구성 결과](/assets/img/posts/binary-spherical-quantization/table1.png){: w="900" }
_표 1. Lánczos 전처리에서 비교한 이미지 재구성 결과. 왼쪽 네 지표는 COCO2017 val, 오른쪽 네 지표는 ImageNet-1k val이다._

18비트 BSQ는 COCO에서 PSNR 25.08, SSIM 0.7662, LPIPS 0.0744, rFID 5.81을 기록했다. ImageNet에서는 각각 25.36, 0.7578, 0.0761, 1.14다. 36비트로 늘리면 COCO는 27.64, 0.8485, 0.0412, 3.42로, ImageNet은 27.88, 0.8410, 0.0432, 0.41로 개선된다. 병목 비트 수 증가가 픽셀 정확도와 지각 품질을 모두 높이는 대신 토큰당 표현량을 늘리는 결과다.

EMA를 적용한 36비트 모델의 COCO 결과는 PSNR 27.92, SSIM 0.8526, LPIPS 0.0380, rFID 3.34다. ImageNet은 PSNR 28.14, 원문 v1 Table 1에 기록된 SSIM $0.0814\pm0.0814$, LPIPS 0.0400, rFID 0.45다. 이 SSIM 값은 원문 자체의 의심스러운 표기이므로 임의로 다른 수치로 고치거나 EMA의 SSIM 효과를 판단하는 근거로 사용하지 않는다.

비교군의 ImageNet rFID는 DALL-E dVAE 36.84, MaskGIT 2.23, ViT-VQGAN 1.55, SD-VAE 1.x 10비트 1.52, 14비트 1.23, KL 버전 1.35, SD-VAE 2.x 0.78, SDXL-VAE 0.72다. 36비트 BSQ의 0.41은 이 표에서 가장 낮고, COCO에서는 SDXL-VAE의 rFID 4.23보다 BSQ 36비트의 3.42가 낮다.

처리량은 BSQ 모델이 GPU당 45.1로, DALL-E dVAE 34.0, MaskGIT 37.6, ViT-VQGAN 7.5, SD-VAE 계열 18.9~22.4보다 높다. 다만 BSQ 모델은 174M 파라미터로 54M MaskGIT나 68M SD-VAE보다 크다. 양자화기가 효율적이라는 사실과 전체 네트워크가 작다는 주장은 구분해야 한다.

COCO는 ImageNet과 성격이 다른 scene 중심 데이터다. ImageNet에서 학습한 모델을 COCO에 적용한 결과는 학습 데이터 밖의 장면 구성으로 어느 정도 일반화되는지 보는 근거가 된다.

![ImageNet으로 학습한 모델의 COCO 재구성](/assets/img/posts/binary-spherical-quantization/figure9.jpg){: w="800" }
_그림 5. ImageNet 학습 모델을 COCO 2017val에 적용한 정성적 결과다._

Table 8은 같은 모델을 bilinear interpolation으로 평가한다. DALL-E dVAE, MaskGIT, ViT-VQGAN, 세 SD-VAE 1.x 설정, SD-VAE 2.x, SDXL-VAE와 BSQ 세 설정을 모두 같은 표 구조로 비교한다.

Bilinear 조건에서 36비트 BSQ는 COCO PSNR 29.85, SSIM 0.8862, LPIPS 0.0341, rFID 3.07이고 ImageNet은 30.12, 0.8803, 0.0355, 0.36이다. EMA 모델은 COCO 30.19, 0.8904, 0.0314, 3.07, ImageNet 30.45, 0.8843, 0.0329, 0.42다.

같은 표에서 ImageNet rFID는 DALL-E dVAE 32.63, MaskGIT 1.98, ViT-VQGAN 1.55, SD-VAE 1.x의 세 설정이 1.40·1.13·1.22, SD-VAE 2.x가 0.70, SDXL-VAE가 0.67이다. COCO rFID는 같은 순서에서 48.60, 8.47, 미보고, 6.49·5.75·5.94, 4.26, 3.93이다. 전처리만 달라져 Table 1과 절대 수치가 크게 달라지므로, 서로 다른 보간 조건의 결과를 직접 우열 비교해서는 안 된다.

## 비디오 재구성에서 확인한 것

![UCF-101 비디오 재구성 결과](/assets/img/posts/binary-spherical-quantization/table2.png){: w="900" }
_표 2. 왼쪽 네 지표는 UCF-101 split-1 train, 오른쪽은 validation 결과다._

비디오에 적응하지 않은 이미지 토크나이저 상태에서도 BSQ 18비트는 VQ 14비트보다 낫다. 학습 split에서 VQ는 PSNR 25.64, SSIM 0.8142, LPIPS 0.1120, rFVD 357이고 BSQ는 25.86, 0.8273, 0.1089, 326이다. validation에서도 VQ의 rFVD 382에 비해 BSQ는 342다.

비디오 미세조정 뒤에는 차이가 훨씬 커진다. VQ 기반 non-BC ViT는 train/validation rFVD 9.16/12.79, BC ViT는 10.76/14.17이다. BSQ 18비트는 non-BC에서 7.34/10.57, BC에서 8.08/11.62다. 인과 제약이 없는 모델보다 BC 모델의 재구성 지표가 조금 낮지만, BC 구조는 가변 길이 추론과 시간 순서에 맞는 복원이라는 기능적 제약을 지불하고 얻는다.

36비트 BC BSQ는 train에서 PSNR 33.80, SSIM 0.9606, LPIPS 0.0159, rFVD 4.10이며 validation에서는 33.55, 0.9588, 0.0167, 6.21이다. 표의 비교군인 MaskGIT은 train rFVD 216, TATS는 162, MAGVIT-L은 25, MAGVIT-v2 두 설정은 16.12와 8.62다. 일부 지표가 보고되지 않은 행이 있으므로 공통으로 제시된 rFVD 중심으로 읽는 편이 안전하다.

## 생성 성능에서 확인한 것

![ImageNet-1K 이미지 생성 성능](/assets/img/posts/binary-spherical-quantization/table3.png){: w="760" }
_표 3. 생성 단계 수와 FID뿐 아니라 precision과 recall의 균형을 함께 봐야 한다._

BigGAN은 1 step에서 FID 6.02, IS 145.8, precision 0.86, recall 0.35다. ADM은 1,000 step에서 FID 5.91, IS 93.3, precision 0.70, recall 0.65다. 12-step Masked LM에서 VQ는 FID 9.4, FSQ는 8.5, BSQ는 5.69를 기록한다.

BSQ의 디코딩을 32 step으로 늘리면 FID는 5.44, IS는 139.6이 된다. 12 step의 IS 48.5보다 크게 높아지고 recall도 0.42에서 0.50으로 늘지만, precision은 0.85에서 0.80으로 내려간다. 생성 단계를 늘리면 품질과 분포 포괄성이 개선되는 대신 추론 비용이 증가하고 precision-recall의 균형도 달라진다.

![BSQ-ViT와 생성 모델의 정성적 비교](/assets/img/posts/binary-spherical-quantization/figure10.jpg){: w="800" }
_논문 Figure 10. BigGAN, ADM, BSQ-ViT+Masked-LM과 실제 ImageNet 이미지를 클래스별로 비교한 결과다._

## 압축 성능에서 확인한 것

Kodak 이미지 압축에서 JPEG2000은 0.2986 BPP, PSNR 29.192, MS-SSIM 11.574 dB, LPIPS 0.1892이고 WebP는 0.2963 BPP, 29.151, 12.193, 0.1655다. MAGVIT2는 0.2812 BPP에서 PSNR 23.467, MS-SSIM 8.103, LPIPS 0.1260이고 VQ는 같은 BPP에서 26.987, 12.580, 0.0944다.

BSQ는 0.2812 BPP에서 PSNR 27.785, MS-SSIM 12.852, LPIPS 0.0823이다. AC를 적용하면 복원 지표는 그대로 유지하면서 BPP가 0.2073으로 내려간다. 같은 토큰을 더 짧은 비트스트림으로 표현한 것이므로 손실 양자화 성능과 무손실 엔트로피 부호화 이득을 분리해 읽어야 한다.

MCL-JCV 비디오에서 MAGVIT은 0.0391 BPP, PSNR 23.70, MS-SSIM 0.846, LPIPS 0.144이고 MAGVIT-v2는 0.0508 BPP, 27.83, 0.92, 0.104다. H.264는 0.1373 BPP에서 35.415, 0.9796, 0.0949, H.265는 35.670, 0.9807, 0.0908이다.

BSQ는 AC 없이 0.2333 BPP에서 PSNR 33.698, MS-SSIM 0.9818, LPIPS 0.0501이다. AC를 적용하면 0.1373 BPP로 줄면서 세 복원 지표는 유지된다. 같은 BPP의 H.264와 H.265보다 PSNR은 낮지만 LPIPS는 더 낮고 MS-SSIM은 더 높다. 어떤 지표를 우선하는지에 따라 결론이 달라지는 지점이다.

![Kodak 이미지 압축의 정성적 비교](/assets/img/posts/binary-spherical-quantization/figure11.jpg){: w="800" }
_논문 Figure 11. 원본, JPEG2000, WebP, BSQ 복원에서 창문·머리카락·깃털의 세부 표현을 비교한다._

![MCL-JCV와 UVG의 비디오 압축 비교](/assets/img/posts/binary-spherical-quantization/figure8.png){: w="800" }
_그림 6. MCL-JCV와 UVG의 rate-distortion 비교는 학습 데이터와 평가 비디오의 해상도 및 분포 차이에 민감하다._

Kodak의 rate-distortion 곡선도 같은 교환을 여러 bitrate 구간에서 보여준다.

![Kodak 이미지 압축의 rate-distortion 곡선](/assets/img/posts/binary-spherical-quantization/figure12.png){: w="700" }
_그림 7. 단일 동작점뿐 아니라 비트율 변화에 따른 재구성 품질의 추세를 확인한다._

## 무엇이 성능을 만들었나

### BSQ, VQ, LFQ 비교

VQ 10비트는 코드북 $1024\times32$에서 PSNR 23.61, SSIM 0.6873, LPIPS 0.1214, rFID 7.05이며 코드 사용률은 57.5%다. VQ 14비트는 $16384\times8$ 코드북을 모두 사용하면서 25.76, 0.7834, 0.0669, 4.27을 기록한다. 16비트 $65536\times8$로 늘려도 사용률은 100%지만 PSNR 25.67, LPIPS 0.0706, rFID 6.61로 오히려 나빠진다. 코드가 모두 사용됐다는 사실만으로 더 큰 코드북의 성능 향상이 보장되지는 않는다.

BSQ 10비트는 PSNR 24.11, SSIM 0.7250, LPIPS 0.0919, rFID 4.51이며 코드 사용률은 100%다. 14비트에서는 25.26, 0.7710, 0.0784, 4.60, 사용률 99.8%이고, 18비트에서는 25.97, 0.7990, 0.0629, 2.66, 사용률 93.8%다. $L=18$에서 모든 지표가 같은 비트 규모의 비교보다 강하다.

정규화를 제거해 LFQ가 된 18비트 설정은 PSNR 18.58, SSIM 0.4828, LPIPS 0.2951, rFID 30.7로 악화되고 코드 사용률은 0.6%까지 떨어진다. 이 결과는 구면 투영이 단지 오차 상한을 위한 이론적 장치가 아니라 실제 코드 붕괴를 막는 데도 연결된다는 근거다.

### 손실 항별 역할

![학습 손실과 엔트로피 근사 그룹 크기 ablation](/assets/img/posts/binary-spherical-quantization/table6.png){: w="820" }
_표 6. 위쪽은 leave-one-out loss ablation, 아래쪽은 데이터셋 엔트로피 근사의 그룹 크기 비교다._

모든 손실을 넣으면 rFID 2.95, 코드 사용률 45.6%다. $L_{commit}$을 제거하면 rFID 2.83, 코드 사용률 93.8%로 좋아진다. bounded quantization error를 가진 BSQ에서는 commitment loss가 필수가 아니라는 논문의 설명과 일치한다.

개별 입력의 엔트로피 $H(p(c\mid u))$를 제거하면 rFID 2.44, 코드 사용률 78.3%다. rFID만 보면 가장 낮지만 코드 사용량은 commitment loss만 뺀 구성보다 작다. 따라서 한 지표만 보고 이 항이 무의미하다고 결론내릴 수 없다.

데이터셋 엔트로피 최대화 항 $-H(\mathbb{E}[p(c\mid u)])$을 제거하면 rFID가 13.8로 악화되고 코드 사용률이 13.3%로 붕괴한다. 이 항이 입력 전체를 다양한 코드로 분산시키는 역할을 한다는 식 (4)의 해석이 ablation으로 확인된다.

$L_{LPIPS}$를 제거하면 rFID는 19.2, 코드 사용률은 6.9%다. 지각 손실은 단순히 눈에 보이는 선명도만 조절하는 것이 아니라 낮은 FID와 높은 코드 사용률에도 강하게 연결된다. 다만 왜 이런 상호작용이 생기는지에 대한 더 깊은 분석은 저자가 논문 범위 밖이라고 밝혔다.

### 엔트로피 근사의 그룹 크기

$L=18$에서 전체를 한 그룹으로 다루는 $g=18$은 OOM이며 속도는 70.0ms다. $g=9$는 rFID 2.83, 코드 사용률 93.8%, 0.335ms이고 $g=6$은 2.76, 95.2%, 0.232ms다. $g=3$은 3.32, 96.0%, 0.233ms다.

제안한 완전 factorized 근사인 $g=1$은 rFID 2.86, 코드 사용률 95.1%, 0.212ms로 가장 빠르다. $g=6$보다 rFID는 조금 높지만 실행 시간과 메모리 측면에서 유리하고, $g=18$처럼 결합분포를 크게 묶을 때의 OOM을 피한다. 식 (9)에서 버린 상관관계와 계산 효율 사이의 실제 교환이다.

### LFQ와의 구조적 차이

![BSQ와 LFQ의 출력, 기울기, 오차, 목적 함수 비교](/assets/img/posts/binary-spherical-quantization/table7.png){: w="860" }
_표 7. $\ell_2$ 정규화 하나가 출력 공간, STE 기울기, 오차 상한, commitment loss 필요 여부를 연쇄적으로 바꾼다._

LFQ의 출력은 $\hat v=\operatorname{sign}(v)$이고 STE 기울기는 $\partial\hat v_i/\partial v_i=1$이다. 기대 양자화 오차는 unbounded이며 목적 함수에 $L_{commit}$이 포함된다.

BSQ는

$$
\hat u
=
\frac1{\sqrt L}\operatorname{sign}
\left(\frac v{\|v\|_2}\right)
$$

를 사용하고 기울기에는 정규화가 반영된다. 오차는 식 (10)의 상한을 가지며 목적 함수에서 commitment loss를 뺀다. 데이터셋 엔트로피는 정확한 결합 엔트로피 대신 factorized upper bound $\hat H$로 계산한다. 이 표는 BSQ가 LFQ에 단순한 normalization layer를 추가한 정도가 아니라, 학습 목적과 계산 방식까지 함께 바꾼 설계임을 보여준다.

## 비용과 트레이드오프

BSQ의 직접적인 효율 이득은 명시적 코드북을 제거하는 데 있다. VQ는 $K$개 코드와의 최근접 검색이 필요하지만 BSQ의 hard quantization은 $L$개 좌표의 정규화와 부호 판정으로 끝난다. soft entropy도 $2^L$개 조합을 열거하지 않고 $L$개의 이진 엔트로피로 계산한다.

그러나 전체 시스템이 경량 모델인 것은 아니다. 이미지 재구성 표의 BSQ-ViT는 174M 파라미터이며, 이미지와 비디오 토크나이저 학습에는 16개의 A5000 GPU를 사용해 약 5일이 들었다. Masked LM 역시 16 GPU에서 1M step 학습하고, AC 확률 모델은 8 GPU에서 약 1주를 학습한다. 양자화 단계의 확장성 개선이 백본과 생성·압축 모델의 학습 비용을 제거하지는 않는다.

추론에서도 용도별 비용이 다르다. 토크나이저 인코딩은 한 번의 순전파와 $L$비트 부호화로 끝난다. 생성에서는 $2^L$ 어휘를 직접 다루지 않기 위해 서브토큰으로 나누고 여러 Masked LM 단계를 실행한다. Table 3에서 12 step보다 32 step이 더 좋은 FID와 IS를 얻지만 디코딩 횟수는 증가한다. 압축에서는 AC가 BPP를 낮추지만 autoregressive 조건부 확률 계산과 entropy coding 시간이 추가된다.

속도 비교에서 $1{,}920\times1{,}080$ 입력의 VCT는 encode 494ms, entropy coding 30.5ms, decode 168ms로 1.4 FPS다. H.264는 2.6 FPS이고, BSQ 방식은 encode 55.8ms, entropy coding 42.2ms, decode 64.8ms로 6.1 FPS다. 단, VCT 속도에는 이미지 인코더 시간이 포함되지 않았다.

$640\times360$에서는 VCT가 22.2ms, 4.24ms, 10.1ms로 27.3 FPS이고 H.264는 22.4 FPS다. BSQ 방식은 6.2ms, 4.69ms, 7.2ms로 55.2 FPS다. 두 해상도 모두 전체 처리량은 높지만, 1080p에서는 entropy coding 42.2ms가 인코더 55.8ms에 가까운 비용을 차지한다. 양자화기가 빨라질수록 확률 모델과 부호화가 다음 병목으로 드러날 수 있다.

표현력 측면의 대가는 비트 수다. $L$을 늘리면 암묵적 어휘는 지수적으로 커지고 재구성 품질도 좋아지지만 토큰당 비트 수와 생성 모델이 처리할 출력 구조가 커진다. $L=36$의 좋은 복원 성능은 $L=18$과 같은 압축률에서 얻은 결과가 아니다.

## 한계와 생각해볼 점

저자가 명시한 첫 번째 한계는 지각 손실의 역할이다. $L_{LPIPS}$를 제거하면 rFID와 코드 사용률이 크게 나빠지지만, 지각 손실이 왜 엔트로피 목적 및 코드 사용과 이렇게 강하게 상호작용하는지에 대한 분석은 논문 범위를 벗어난다.

두 번째 한계는 UVG에서 HEVC와 VCT보다 낮은 성능이다. 논문은 UCF-101이 약 9K개의 $320\times240$ 비디오로 구성된 반면 VCT는 수백만 개의 고해상도 인터넷 비디오로 학습됐다는 데이터 규모와 해상도 차이를 원인으로 가정한다. 더 다양하고 압축 아티팩트가 없는 비디오를 학습에 추가하면 격차가 줄어들 것이라고 예상한다.

이 결과는 일반화 가능성을 두 층으로 나눠 보게 한다. ImageNet에서 학습한 이미지 토크나이저는 COCO와 Kodak에서도 평가됐고, 이미지 사전학습 뒤 UCF-101 미세조정으로 비디오까지 확장됐다. 따라서 데이터셋과 작업을 넘나드는 적용 가능성에는 실험 근거가 있다. 반면 고해상도 비디오 압축에서 경쟁력을 유지하려면 학습 데이터 규모와 품질이 충분해야 한다는 제한도 UVG 결과에서 드러난다.

내가 보기에는 BSQ의 가장 중요한 기여는 “$2^L$개의 코드를 만들었다”는 사실보다, 큰 이산 공간을 세 위치에서 서로 다르게 처리한 데 있다. 양자화에서는 부호 비트로, 엔트로피 정규화에서는 차원별 베르누이로, 생성에서는 그룹화된 서브토큰으로 다룬다. 같은 거대한 어휘를 어느 단계에서도 정면으로 열거하지 않는다.

다만 논문 범위만으로는 다른 모달리티에서도 구면 정규화와 이진 병목이 같은 성능을 낼지 알 수 없다. 이미지와 비디오에서는 공간 패치와 시간 인과성이 분명하지만, 다른 입력 구조에 어떤 백본과 마스크가 필요한지는 제시되지 않는다. 또한 더 큰 $L$, 더 긴 비디오, 더 큰 생성 모델에서 엔트로피의 factorized upper bound가 계속 충분한지도 이 실험만으로 확정할 수 없다.
