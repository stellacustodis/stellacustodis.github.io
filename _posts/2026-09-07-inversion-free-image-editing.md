---
title: "Inversion-Free Image Editing with Language-Guided Diffusion Models"
date: 2026-09-07 09:00:00 +0900
permalink: /posts/inversion-free-image-editing/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion, image-editing, attention-control, consistency-model]
description: "InfEdit은 명시적 역전 과정 없이 DDCM 기반 가상 역전과 3-브랜치 어텐션 제어로 텍스트 기반 이미지 편집을 수행한다. LCM 백본에서는 12스텝, 단일 A40 GPU 기준 2.22초의 순방향 시간을 보고한다."
paper:
  authors: "Sihan Xu, Yidong Huang, Jiayi Pan, Ziqiao Ma, Joyce Chai"
  venue: "CVPR Open Access version (pp. 9452–9461)"
  code: "https://sled-group.github.io/InfEdit/"
---

## 세 줄 요약

InfEdit은 입력 이미지의 잠재변수를 별도의 역전(inversion) 과정으로 복원하지 않고, DDCM(Denoising Diffusion Consistent Model)의 일관성 노이즈(consistency noise)를 이용해 이미지 편집을 시작한다.

여기에 소스·레이아웃·타깃의 3개 브랜치를 사용하는 UAC(Unified Attention Control)를 결합해, 강체 편집에는 크로스 어텐션(cross-attention)을, 비강체 편집에는 상호 셀프 어텐션(mutual self-attention)을 활용한다.

그 결과 LCM(Latent Consistency Model) 백본에서 12스텝, 단일 A40 GPU 기준 $2.22 \pm 0.02$초의 편집을 보고한다.

## 이 논문이 풀려는 문제

텍스트 기반 이미지 편집에서 핵심 문제는 문장을 바꾸되 이미지의 나머지 구조를 얼마나 보존할 것인가이다. 예를 들어 “갈색 곰”을 “초록색 곰”으로 바꾸는 작업은 색상이라는 비교적 강체적인 변경에 가깝지만, “앉아 있는 곰”을 “서 있는 곰”으로 바꾸는 작업은 객체의 자세와 내부 구조까지 달라지는 비강체(non-rigid) 편집이다. 두 경우에 동일한 제어 방식만 적용하면 한쪽에서는 편집 충실도가 떨어지거나 다른 쪽에서는 원본 구도가 무너질 수 있다.

초기의 텍스트 기반 확산 모델 편집 방법들은 추가 마스크 레이어를 사용하거나 모델을 다시 학습해야 했다. 이런 방법은 특정 편집 영역을 명시적으로 지정하거나 편집 목적에 맞게 모델을 조정할 수 있지만, 새로운 입력마다 바로 적용하는 제로샷(zero-shot) 편집과는 거리가 있다.

역전 기반 방법은 입력 이미지를 확산 과정의 잠재 궤적 위에 올려놓는 방식이다. DDIM Inversion, Null-text Inversion, Negative-prompt Inversion, StyleDiffusion 등은 편집 브랜치가 참조할 앵커를 얻기 위해 역전 단계를 먼저 수행한다. 이 과정은 편집 자체와 별도로 시간이 들고, 여러 단계의 역전에서 오차가 누적될 수 있다.

특히 기존 듀얼 브랜치 방식은 소스 잠재변수와 타깃 잠재변수의 궤적을 계속 비교하거나 타깃 궤적을 보정한다. 그러나 각 시점에서 조금씩 발생한 오차가 이후 단계로 전달되면 원본 보존과 편집 지시 수행 사이의 균형을 잡기 어려워진다. InfEdit은 이 문제를 각 시점의 타깃 잠재변수 $z_t^{\mathrm{tgt}}$를 계속 보정하는 대신, 네트워크가 예측한 초기값 $z_0^{\mathrm{tgt}}$를 직접 보정하는 방식으로 다룬다.

또 다른 문제는 일관성 모델과 기존 역전 기법의 구조적 비호환성이다. 일관성 모델(CM)과 잠재 일관성 모델(LCM)은 여러 확산 단계를 적은 샘플링 스텝으로 건너뛸 수 있다. 반면 기존 역전 기반 편집법은 확산 샘플링 변형에 의존하므로, LCM의 다단계 일관성 샘플링을 그대로 적용하기 어렵다. 논문은 확산 역과정의 분산 스케줄을 특정 방식으로 선택하면 방향 항을 없애고 LCM 샘플링과 같은 형태를 얻을 수 있다고 주장한다.

어텐션 제어에도 서로 다른 한계가 있다. Prompt-to-Prompt(P2P)와 Plug-and-Play(PnP)는 크로스 어텐션 또는 셀프 어텐션 맵을 대체해 원본 이미지의 레이아웃과 공간 정보를 보존한다. 따라서 객체의 색상이나 단어 수준의 의미를 바꾸는 강체 편집에는 적합하지만, 객체 추가·삭제나 자세 변경처럼 공간 구조 자체가 달라지는 편집에는 한계가 있다.

MasaCtrl은 상호 셀프 어텐션을 사용해 비강체 편집을 지원한다. 하지만 전체 샘플링 과정에서 타깃 쿼리 $Q^{\mathrm{tgt}}$를 사용하면 다중 객체나 복잡한 배경에서 원본의 객체 구도가 크게 변할 수 있다. 반대로 크로스 어텐션 제어와 상호 셀프 어텐션 제어를 두 브랜치에서 순차적으로 결합하면 전역 어텐션 정제가 제대로 작동하지 않는 문제가 생긴다. InfEdit의 UAC는 이 두 제어를 단순히 이어 붙이지 않고, 별도의 레이아웃 브랜치를 매개로 통합한다.

관련 연구의 선택지를 정리하면 다음과 같다.

- SDEdit은 소스 이미지에 가우시안 노이즈를 추가해 편집하지만 재구성 품질이 저하될 수 있다.
- DDIM Inversion은 잠재공간과 이미지 사이의 결정론적 매핑을 제공하지만 다단계 역전에서 오차가 누적된다.
- Null-text Inversion은 널 텍스트 프롬프트를 피벗 튜닝해 실제 이미지의 편집 품질을 높였지만 시간이 많이 들고 완전히 정확하지 않다.
- Negative-prompt Inversion은 DDIM 역전을 근사해 속도를 높였지만 재구성 품질을 희생한다.
- CycleDiffusion, Editing-friendly Inversion, Direct Inversion은 각 역전 단계의 소스 잠재변수를 타깃 편집의 기준으로 사용하지만, 역전 자체의 누적 오차와 시간 비용을 피하지 못한다.
- P2P와 PnP는 레이아웃과 공간 정보를 보존하는 데 초점을 둔다.
- MasaCtrl은 공간 속성을 수정하면서 의미를 보존하려 한다.
- P2Plus는 분류기 없는 가이드(CFG)의 텍스트 조건부 및 무조건부 브랜치 모두에 편집을 적용해 P2P 패러다임을 확장한다.

## 핵심 아이디어

InfEdit의 구조는 두 가지 변환으로 요약할 수 있다. 첫째, DDCM을 이용해 입력 이미지의 초기 잠재변수 $z_0$를 알고 있다는 사실을 일관성 노이즈 계산에 활용한다. 그러면 역전 네트워크나 추가 파라미터 튜닝 없이도 특정 시점의 잠재변수에서 $z_0$를 가리키는 노이즈 표현을 닫힌 형태로 계산할 수 있다.

둘째, UAC는 소스 브랜치와 타깃 브랜치 사이에 레이아웃 브랜치를 하나 더 둔다. 소스 브랜치는 원본의 구조 정보를 제공하고, 타깃 브랜치는 새 프롬프트에 따른 편집을 수행한다. 레이아웃 브랜치는 두 브랜치에서 얻은 상호 셀프 어텐션 정보를 받아 구조를 매개한다. 이 구조 덕분에 크로스 어텐션은 의미 변경을 제어하고, 셀프 어텐션은 구조 변경을 허용하면서도 원본 구도를 직접 타깃 쿼리에 전부 맡기지 않는다.

## 방법 — 수식으로

### 1. 확산 모델의 기본 전방 과정

확산 모델은 초기 잠재변수 $z_0$에 점진적으로 노이즈를 추가해 $z_t$를 만든다.

$$
z_t=\sqrt{\alpha_t}z_0+\sqrt{1-\alpha_t}\varepsilon,
\qquad
\varepsilon\sim\mathcal{N}(\mathbf{0},\mathbf{I})
$$

여기서 $z_0$는 데이터 분포에서 온 초기 잠재변수이고, $\alpha_t$는 시점별 분산 스케줄이다. $\varepsilon$은 표준 가우시안 노이즈이며, $z_t$는 $z_0$와 노이즈가 섞인 시점 $t$의 잠재변수다. $\alpha_t$가 작아질수록 $z_t$에서 원본의 비중은 줄고 노이즈 비중은 커진다.

노이즈 예측 네트워크는 다음 목적을 최소화하도록 학습된다.

$$
\min_\theta
\mathbb{E}_{z_0,\varepsilon,t}
\left[
d\left(\varepsilon,\varepsilon_\theta(z_t,t)\right)
\right]
$$

$\varepsilon_\theta$는 $z_t$와 시점 $t$를 입력으로 받아 그 안에 섞인 노이즈를 예측한다. $d$는 실제 노이즈와 예측 노이즈 사이의 거리이고, $\theta$는 네트워크 파라미터다. Eq. 1이 데이터를 노이즈 공간으로 보내는 과정이라면, Eq. 2는 그 노이즈를 추정하는 역과정을 학습하는 식이다.

### 2. 일반적인 확산 역과정에서 방향 항을 보기

확산 역과정의 일반적인 샘플링 식은 다음과 같다.

$$
\begin{aligned}
z_{t-1}
=&\sqrt{\alpha_{t-1}}
\left(
\frac{
z_t-\sqrt{1-\alpha_t}\varepsilon_\theta(z_t,t)
}{
\sqrt{\alpha_t}
}
\right)
&&\text{(predicted $z_0$)}
\\
&+\sqrt{1-\alpha_{t-1}-\sigma_t^2}\,
\varepsilon_\theta(z_t,t)
&&\text{(direction to $z_t$)}
\\
&+\sigma_t\varepsilon_t,
\qquad
\varepsilon_t\sim\mathcal{N}(\mathbf{0},\mathbf{I})
&&\text{(random noise)}
\end{aligned}
$$

첫 번째 항은 현재 잠재변수에서 네트워크가 추정한 초기 샘플 $\bar z_0$를 계산한 뒤, 이를 다음 시점의 스케일로 옮긴 것이다. 두 번째 항은 현재 시점 $z_t$를 향하는 방향 성분이다. 세 번째 항은 샘플링에 다시 주입하는 랜덤 노이즈다. $\sigma_t$는 이 랜덤 노이즈의 크기를 정한다.

첫 번째 항 안의 초기 샘플 예측은 다음 함수로 쓸 수 있다.

$$
\bar z_0=f_\theta(z_t,t)
=
\frac{
z_t-\sqrt{1-\alpha_t}\varepsilon_\theta(z_t,t)
}{
\sqrt{\alpha_t}
}
$$

이 함수는 $z_t$에서 노이즈 예측을 빼고 $\sqrt{\alpha_t}$로 나누어 $z_0$를 복원한다. 편집에서는 이 복원값이 원본 이미지의 의미와 구조를 얼마나 잘 보존하는지가 중요하다.

### 3. 일관성 모델과 다단계 샘플링

일관성 모델은 같은 확률 궤적 위에 있는 서로 다른 시점의 샘플을 동일한 초기값으로 매핑하려 한다. 그 학습 목적은 다음과 같다.

$$
\min_{\theta,\theta^-;\phi}
\mathbb{E}_{z_0,t}
\left[
d\left(
f_\theta(z_{t_{n+1}},t_{n+1}),
f_{\theta^-}(\hat z^\phi_{t_n},t_n)
\right)
\right]
$$

여기서 $f_\theta$는 일관성 전이를 나타내는 학습 가능한 네트워크다. $f_{\theta^-}$는 타깃 네트워크이며, 다음과 같은 지수 이동 평균 방식으로 갱신된다.

$$
\theta^-\leftarrow\mu\theta^-+(1-\mu)\theta
$$

$\hat z^\phi_{t_n}$은 $z_{t_{n+1}}$에서 얻은 다음 시점의 1단계 추정치다. 이 목적 함수의 핵심은 두 시점의 출력이 같은 초기 샘플을 가리키도록 만드는 것이다.

다단계 일관성 샘플링은 다음과 같이 표현된다.

$$
\begin{aligned}
\hat z_{\tau_i}
&=
z_0^{(\tau_{i+1})}
+
\sqrt{\tau_i^2-t_0^2}\,\varepsilon
\\
z_0^{(\tau_i)}
&=
f_\theta(\hat z_{\tau_i},\tau_i)
\end{aligned}
$$

$\tau_{1:n}\in[t_0,T]$는 사용할 타임스텝 수열이다. 먼저 더 큰 시점에서 얻은 $z_0^{(\tau_{i+1})}$에 노이즈를 다시 추가해 $\hat z_{\tau_i}$를 만든 뒤, 일관성 함수가 이를 다시 초기값 $z_0^{(\tau_i)}$로 매핑한다.

텍스트 조건 $c$를 사용하는 잠재 일관성 모델에서는 식이 다음과 같이 확장된다.

$$
\begin{aligned}
\hat z_{\tau_i}
&=
\sqrt{\alpha_{\tau_i}}\,
z_0^{(\tau_{i+1})}
+
\sigma_{\tau_i}\varepsilon
\\
z_0^{(\tau_i)}
&=
f_\theta(\hat z_{\tau_i},\tau_i,c)
\end{aligned}
$$

이 식은 LCM이 텍스트 조건을 받으면서도 여러 확산 단계를 건너뛰는 방식을 나타낸다. InfEdit이 해결해야 할 문제는 이 다단계 샘플링 구조를 이미지 편집에 연결하는 것이다. 일반적인 역전 과정은 확산 샘플링 궤적을 필요로 하지만, InfEdit은 분산 스케줄을 조정해 같은 형태의 갱신식을 직접 구성한다.

### 4. Proposition 1: DDCM의 구성

논문의 Proposition 1은 Eq. 3에서 다음 분산을 선택하면 전방 과정이 다단계 잠재 일관성 샘플링과 일치한다고 말한다.

$$
\sigma_t=\sqrt{1-\alpha_{t-1}}
$$

이 값을 Eq. 3에 대입하면 방향 항의 계수는 다음과 같이 된다.

$$
\sqrt{
1-\alpha_{t-1}-\sigma_t^2
}
=
\sqrt{
1-\alpha_{t-1}-(1-\alpha_{t-1})
}
=
0
$$

따라서 네트워크가 예측한 방향 항 전체가 사라지고, 다음 식만 남는다.

$$
\begin{aligned}
z_{t-1}
=&
\sqrt{\alpha_{t-1}}
\left(
\frac{
z_t-\sqrt{1-\alpha_t}\varepsilon_\theta(z_t,t)
}{
\sqrt{\alpha_t}
}
\right)
\\
&+
\sqrt{1-\alpha_{t-1}}\varepsilon_t,
\qquad
\varepsilon_t\sim\mathcal{N}(\mathbf{0},\mathbf{I})
\end{aligned}
$$

첫 번째 항은 예측된 초기 샘플이고, 두 번째 항은 다음 시점에 맞는 랜덤 노이즈다. 방향 항이 없어졌다는 것은 다음 시점의 잠재변수가 현재 시점의 네트워크 예측 방향에 의해 추가로 이동하지 않는다는 뜻이다.

이제 이미지 편집처럼 초기 샘플 $z_0$가 이미 주어진 상황을 생각한다. 논문은 네트워크의 노이즈 예측자 대신, $z_t$와 $z_0$를 이용하는 일반화된 노이즈 표현 $\varepsilon'(z_t,t;z_0)$를 도입한다.

$$
z_{t-1}
=
\sqrt{\alpha_{t-1}}f(z_t,t;z_0)
+
\sqrt{1-\alpha_{t-1}}\varepsilon_t
$$

여기서

$$
f(z_t,t;z_0)
=
\frac{
z_t-\sqrt{1-\alpha_t}\varepsilon'(z_t,t;z_0)
}{
\sqrt{\alpha_t}
}
$$

이다. 이 식은 Eq. 8의 첫 번째 항을 $f(z_t,t;z_0)$로 다시 쓴 것이다. $f$가 실제 초기 샘플 $z_0$를 가리키도록 하려면 다음 조건을 만족해야 한다.

$$
f(z_t,t;z_0)=z_0
$$

이를 $\varepsilon'$에 대해 풀면 다음 닫힌 형태가 나온다.

$$
\varepsilon^{\mathrm{cons}}
=
\varepsilon'(z_t,t;z_0)
=
\frac{
z_t-\sqrt{\alpha_t}z_0
}{
\sqrt{1-\alpha_t}
}
$$

이 유도가 중요한 이유는 $\varepsilon^{\mathrm{cons}}$를 학습할 필요가 없다는 데 있다. Eq. 1을 $z_0$에 대해 대수적으로 정리하면 바로 얻을 수 있으므로, 이미지의 초기 잠재변수와 현재 시점의 잠재변수가 주어졌을 때 일관성에 필요한 노이즈를 계산할 수 있다.

Proposition 1의 논리 흐름은 다음과 같다.

1. 일반 확산 역과정에 $\sigma_t=\sqrt{1-\alpha_{t-1}}$를 대입한다.
2. 방향 항의 계수가 0이 되어 Eq. 8을 얻는다.
3. 초기 샘플을 알고 있다는 편집 상황에 맞춰 네트워크 노이즈 예측자를 $\varepsilon'$로 일반화한다.
4. 재구성 함수가 $z_0$를 정확히 가리키도록 $\varepsilon'$를 직접 푼다.
5. 그 결과 신경망 파라미터 최적화 없이 다단계 일관성 샘플링과 같은 형태의 전방 과정을 구성한다.

논문은 이 과정에서 $z_t$가 신경망 예측 없이 참값 $z_0$를 직접 가리키고, $z_{t-1}$이 이전 단계의 $z_t$에 의존하지 않는 비마르코프(non-Markovian) 전방 과정이 된다고 설명한다. 이 성질이 DDCM과 가상 역전의 수학적 기반이다.

### 5. Virtual Inversion: 초기값을 직접 보정하기

Virtual Inversion(VI)은 소스 브랜치와 타깃 브랜치를 동일한 무작위 터미널 노이즈에서 시작한다.

$$
z_{\tau_1}^{\mathrm{src}}
=
z_{\tau_1}^{\mathrm{tgt}}
\sim\mathcal{N}(0,I)
$$

소스 브랜치는 소스 프롬프트를 사용하고, 타깃 브랜치는 편집된 프롬프트를 사용한다. 한 시점에서 소스 브랜치의 네트워크 예측 노이즈와 DDCM이 계산한 일관성 노이즈의 차이를 구한다.

$$
\Delta\varepsilon^{\mathrm{cons}}
=
\varepsilon^{\mathrm{cons}}
-
\varepsilon_{\tau_n}^{\mathrm{src}}
$$

이 차이는 원본 이미지의 초기 잠재변수와 현재 소스 샘플 사이의 관계를 타깃 브랜치에 전달하는 보정량으로 사용된다. 타깃 브랜치의 예측 초기값은 다음처럼 갱신된다.

$$
z_0^{\mathrm{tgt}}
=
f_\theta
\left(
z_{\tau_n}^{\mathrm{tgt}},
\tau_n,
\varepsilon_{\tau_n}^{\mathrm{tgt}}
-
\varepsilon_{\tau_n}^{\mathrm{src}}
+
\varepsilon_{\tau_n}^{\mathrm{cons}}
\right)
$$

기존 듀얼 브랜치 방식이 각 시점의 $z_t^{\mathrm{tgt}}$를 지속적으로 교정했다면, VI는 타깃 네트워크가 예측하는 초기값 $z_0^{\mathrm{tgt}}$에 보정 정보를 직접 넣는다. 논문이 기대하는 효과는 샘플링 단계마다 발생하는 오차가 누적되는 것을 줄이는 것이다.

Figure 2의 비교도 이 차이를 보여준다. DDIM은 반복적인 역전 과정과 재구성 오차의 영향을 받는다. CycleDiffusion은 $q$-sampling으로 소스 잠재변수를 얻은 다음 타깃 궤적을 보정한다. DDCM은 임의의 무작위 노이즈에서 시작할 수 있고, 각 시점의 잠재변수가 신경망 예측 없이 초기 샘플을 직접 가리키도록 구성된다.

### 6. 어텐션의 기본 연산

U-Net의 크로스 어텐션과 셀프 어텐션은 다음 연산을 공유한다.

$$
\mathrm{Attention}(K,Q,V)
=
MV
=
\mathrm{softmax}
\left(
\frac{QK^T}{\sqrt d}
\right)V
$$

$Q$, $K$, $V$는 각각 쿼리(query), 키(key), 밸류(value)다. $d$는 $Q$와 $K$의 차원이며, 어텐션 맵 $M$은

$$
M=\mathrm{softmax}\left(\frac{QK^T}{\sqrt d}\right)
$$

로 정의된다. 이미지 공간의 위치를 $N$개, 텍스트 토큰 수를 $L$개라고 쓰면 크로스 어텐션 맵은 개념적으로 $(B,N,L)$ 형태로 볼 수 있다. $M_{i,j}$는 공간 위치 $i$가 토큰 $j$의 밸류를 얼마나 집계할지 나타낸다.

크로스 어텐션에서는 이미지 특징이 쿼리이고 텍스트 토큰이 키와 밸류가 된다. 셀프 어텐션에서는 같은 공간 특징에서 $Q$, $K$, $V$가 만들어진다. 따라서 크로스 어텐션 맵은 어떤 단어가 어느 위치에 영향을 주는가를, 셀프 어텐션은 공간 위치들이 어떤 구조적 관계를 갖는가를 제어하는 데 이용할 수 있다.

### 7. Cross-Attention Control: 강체 변경

#### 전역 어텐션 정제

소스 프롬프트와 타깃 프롬프트의 공통 단어에 대해서는 소스의 공간 배치를 보존할 수 있다. 논문의 정제 함수는 다음과 같다.

$$
\mathrm{Refine}
(M^{\mathrm{src}},M^{\mathrm{tgt}})_{i,j}
=
\begin{cases}
(M^{\mathrm{tgt}})_{i,j}
&\text{if }A(j)=\mathrm{None}
\\
(M^{\mathrm{src}})_{i,A(j)}
&\text{otherwise}
\end{cases}
$$

$A$는 타깃 프롬프트의 토큰과 소스 프롬프트의 대응 토큰을 나타내는 정렬 함수다. 대응되는 토큰이 있으면 타깃 맵의 해당 위치에 소스 어텐션 맵을 주입한다. 대응되는 토큰이 없으면 타깃 어텐션 맵을 그대로 유지한다.

이 식의 목적은 모든 토큰을 소스와 동일하게 만드는 것이 아니다. 편집으로 새로 바뀌거나 추가된 토큰은 타깃 프롬프트의 어텐션을 따르게 하고, 공통 의미를 가진 토큰은 소스의 공간 배치를 참고하게 한다.

정제는 전체 샘플링 단계에서 적용하지 않는다.

$$
\mathrm{CrossEdit}
(M^{\mathrm{src}},M^{\mathrm{tgt}},t)
=
\begin{cases}
\mathrm{Refine}(M^{\mathrm{src}},M^{\mathrm{tgt}})
&t\geq\tau_c
\\
M^{\mathrm{tgt}}
&t<\tau_c
\end{cases}
$$

초기 단계인 $t\geq\tau_c$에서는 전역 구조를 잡기 위해 소스 어텐션을 주입한다. 이후 $t<\tau_c$에서는 타깃 어텐션을 그대로 사용해 편집된 의미가 공간에 반영될 여지를 남긴다. 정제를 끝까지 고정하면 변경된 내용까지 원본 위치에 지나치게 묶일 수 있기 때문이다.

#### 국소 어텐션 블렌딩

특정 단어 영역을 직접 혼합하기 위해 타깃 단어와 소스 단어의 어텐션 맵을 각각 이진 마스크로 바꾼다.

$$
\begin{aligned}
m^{\mathrm{tgt}}
&=
\mathrm{Threshold}
\left[
M_t^{\mathrm{tgt}}(w^{\mathrm{tgt}}),
a^{\mathrm{tgt}}
\right]
\\
m^{\mathrm{src}}
&=
\mathrm{Threshold}
\left[
M_t^{\mathrm{src}}(w^{\mathrm{src}}),
a^{\mathrm{src}}
\right]
\\
z_t^{\mathrm{tgt}}
&=
(1-m^{\mathrm{tgt}}+m^{\mathrm{src}})
\odot z_t^{\mathrm{src}}
+
(m^{\mathrm{tgt}}-m^{\mathrm{src}})
\odot z_t^{\mathrm{tgt}}
\end{aligned}
$$

이때 $w^{\mathrm{tgt}}$는 타깃 프롬프트에서 추가하거나 강조할 의미 단어이고, $w^{\mathrm{src}}$는 소스에서 보존할 단어다. $a^{\mathrm{tgt}}$와 $a^{\mathrm{src}}$는 어텐션 맵을 마스크로 바꾸는 임계값이다.

마스크는 다음처럼 정의된다.

$$
\mathrm{Threshold}(M,a)_{i,j}
=
\begin{cases}
1&M_{i,j}\geq a
\\
0&M_{i,j}<a
\end{cases}
$$

이진 마스크가 1인 위치와 0인 위치의 조합에 따라 소스 잠재변수와 타깃 잠재변수가 공간적으로 혼합된다. 구현할 때는 $m$의 해상도와 $z_t$의 해상도가 다를 수 있으므로, 어텐션 맵을 잠재변수 공간에 맞춰 정렬하는 과정이 필요하다. 아래 연산은 두 텐서가 같은 공간 해상도로 정렬되어 있다고 가정한다.

### 8. Mutual Self-Attention Control: 비강체 변경

상호 셀프 어텐션은 U-Net의 공간 특징에서 추출한 $Q$, $K$, $V$를 조작한다.

$$
\begin{aligned}
\mathrm{SelfEdit}
(&\{Q^{\mathrm{src}},K^{\mathrm{src}},V^{\mathrm{src}}\},
\{Q^{\mathrm{tgt}},K^{\mathrm{tgt}},V^{\mathrm{tgt}}\},t)
\\
&=
\begin{cases}
\{Q^{\mathrm{src}},K^{\mathrm{src}},V^{\mathrm{src}}\}
&t\geq\tau_s
\\
\{Q^{\mathrm{tgt}},K^{\mathrm{src}},V^{\mathrm{src}}\}
&t<\tau_s
\end{cases}
\end{aligned}
$$

초기 단계에서는 소스의 $Q$, $K$, $V$를 유지한다. 이 시점에는 전체적인 공간 구조와 객체 배치를 먼저 형성해야 하기 때문이다. 후기 단계에서는 타깃 쿼리 $Q^{\mathrm{tgt}}$를 사용하지만, 키와 밸류는 소스의 $K^{\mathrm{src}}$, $V^{\mathrm{src}}$를 참조한다. 따라서 타깃 프롬프트가 새로운 구조를 만들 수 있는 여지는 남기면서, 소스 특징이 가진 공간 관계를 함께 참고한다.

이 설계는 MasaCtrl처럼 전체 과정에서 타깃 쿼리를 사용하는 방식과 다르다. 초기 구조 형성 단계까지 타깃 브랜치에 맡기지 않고, 소스 특징으로 레이아웃을 먼저 안정화한다는 점이 핵심이다.

### 9. UAC의 3개 브랜치

UAC는 다음 세 브랜치로 구성된다.

- 소스 브랜치 $z^{\mathrm{src}}$: 원본 프롬프트와 원본 이미지의 구조를 유지한다.
- 레이아웃 브랜치 $z^{\mathrm{lay}}$: 소스와 타깃 사이의 구조 정보를 중간에서 매개한다.
- 타깃 브랜치 $z^{\mathrm{tgt}}$: 편집된 프롬프트에 따라 최종 결과를 생성한다.

UAC는 크로스 어텐션과 상호 셀프 어텐션을 한 번씩 순차적으로 적용하는 구조가 아니다. 먼저 소스와 타깃 사이의 상호 셀프 어텐션 결과를 레이아웃 브랜치에 주입하고, 그 레이아웃 브랜치의 크로스 어텐션을 이용해 타깃 브랜치를 제어한다.

구체적으로, $z_\tau^{\mathrm{src}}$와 $z_\tau^{\mathrm{tgt}}$ 사이에서 상호 셀프 어텐션을 수행해

$$
\hat Q^{\mathrm{lay}},
\hat K^{\mathrm{lay}},
\hat V^{\mathrm{lay}}
$$

를 얻는다. 이 결과를 레이아웃 브랜치의 노이즈 예측에 주입한다. 이후 레이아웃 어텐션 맵 $M^{\mathrm{lay}}$와 타깃 어텐션 맵 $M^{\mathrm{tgt}}$ 사이에 크로스 어텐션 제어를 적용해 타깃 노이즈 $\varepsilon_c^{\mathrm{tgt}}$를 예측한다. 마지막으로 샘플링 갱신 뒤 타깃·소스 블렌드 마스크를 적용해 다음 타깃 잠재변수를 만든다.

![기존 2-브랜치 방식과 3-브랜치 방식의 곰 편집 비교](/assets/img/posts/inversion-free-image-editing/figure4.png){: w="800" }
_그림 1. 앉아 있는 갈색 곰을 서 있는 초록색 곰으로 편집할 때, 입력 이미지와 2-브랜치 타깃 출력, 3-브랜치 레이아웃 출력, 3-브랜치 타깃 출력을 비교한다._

## 구현 관점에서

### DDCM 기반 가상 역전의 의사코드

아래 의사코드는 논문의 Eq. 10과 Algorithm 1의 흐름을 구현 관점에서 다시 쓴 것이다. 네트워크 호출은 프레임워크별 API 대신 각 연산의 역할을 나타내는 함수로 표현한다.

```python
# z_tau: (B, C, H, W)
# eps:   (B, C, H, W)
# alpha[t]: scalar 또는 (B, 1, 1, 1)로 브로드캐스트 가능한 값

def consistency_noise(z_t, z_0, alpha_t):
    # z_t, z_0: (B, C, H, W)
    return (z_t - sqrt(alpha_t) * z_0) / sqrt(1 - alpha_t)

def virtual_inversion(z0, source_prompt, target_prompt, timesteps):
    # timesteps: 큰 시점에서 작은 시점으로 순회한다고 가정
    z_src = random_normal_like(z0)  # (B, C, H, W)
    z_tgt = z_src.clone()            # 동일한 터미널 노이즈에서 시작

    for tau in timesteps:
        eps_src = predict_noise(z_src, tau, source_prompt)
        eps_tgt = predict_noise(z_tgt, tau, target_prompt)

        eps_cons = consistency_noise(
            z_t=z_src,
            z_0=z0,
            alpha_t=alpha[tau],
        )

        # 소스 브랜치도 다음 시점의 상태로 전이한다.
        z_src_next = source_ddcm_step(
            z_src=z_src,
            z0=z0,
            eps_src=eps_src,
            tau=tau,
        )

        # 타깃 브랜치의 초기값 예측에 소스-일관성 차이를 반영
        z0_tgt = predict_initial(
            z_t=z_tgt,
            t=tau,
            noise_condition=eps_tgt - eps_src + eps_cons,
        )

        z_tgt = sample_next(z0_tgt, tau)
        z_src = z_src_next

    return z_tgt
```

다만 이 코드는 논문의 수식을 설명하기 위한 형태다. 실제 구현에서는 `predict_initial`, `source_ddcm_step`, `sample_next`의 네트워크 입력 형식과 타임스텝 수열을 백본 설정에 맞춰야 한다. 중요한 구현 원칙은 다음 세 가지다.

첫째, 소스와 타깃은 동일한 터미널 노이즈에서 시작해야 한다. 두 브랜치의 초기 랜덤성이 다르면 이후 차이가 프롬프트 편집 때문인지 초기 노이즈 때문인지 분리하기 어렵다.

둘째, 소스 브랜치는 각 타임스텝에서 현재 상태에 맞춰 전이해야 한다. 같은 초기 터미널 노이즈를 모든 스텝에서 반복 참조하면 $\varepsilon_{\tau_n}^{\mathrm{src}}$가 각 시점의 소스 잠재변수를 나타내지 못한다.

셋째, $\varepsilon^{\mathrm{cons}}$의 분모 $\sqrt{1-\alpha_t}$를 계산할 때 스케줄의 경계값을 조심해야 한다. $1-\alpha_t$가 0에 가까운 시점에서는 수치적으로 불안정해질 수 있으므로, 실제 구현에서는 사용하려는 타임스텝의 정의와 경계 처리를 일관되게 유지해야 한다.

논문의 핵심은 현재 잠재변수 $z_t^{\mathrm{tgt}}$를 매번 직접 수정하는 데 있지 않다. $z_0^{\mathrm{tgt}}$ 예측에 노이즈 조건을 주입해 샘플링 갱신을 유도한다. 이 위치를 바꾸면 VI가 의도한 오차 누적 완화 구조와 달라진다.

### UAC 의사코드

다음은 [원문 Algorithm 3](https://arxiv.org/html/2312.04965)의 상태 전이를 설명하는 의사코드이며, 검증된 실행 구현은 아니다. `unet_with_features`는 같은 U-Net 호출의 노이즈 예측·셀프 어텐션 특징·크로스 어텐션 맵을 반환한다. `sample_joint`는 Algorithm 3의 결합된 VI/DDCM 샘플링을 의미한다. 세 브랜치를 같은 다음 타임스텝으로 갱신하고 원본 초기 잠재변수 `z0_src`를 참조하며, 독립적인 일반 디노이저 세 번으로 대체해서는 안 된다. 샘플러의 스케줄과 공유 난수 계약은 실제 백본에 맞춰 별도로 구현해야 한다. 반환된 소스·타깃·레이아웃 상태는 이 순서를 유지해 모두 다음 스텝의 입력으로 넘긴다.

```python
# z_src, z_lay, z_tgt: (B, C, H, W)
# Q/K/V: (B, N, d), N은 공간 위치 수
# M:     (B, N, L), L은 텍스트 토큰 수

def uac_step(z_src, z_lay, z_tgt, z0_src, t,
             source_prompt, target_prompt,
              tau_c, tau_s, source_threshold, target_threshold):
    # 1. 소스·타깃의 공간 특징에서 Q/K/V 추출
    eps_src, (q_src, k_src, v_src), m_src = unet_with_features(
        z_src, t, source_prompt
    )
    _, (q_tgt, k_tgt, v_tgt), m_tgt = unet_with_features(
        z_tgt, t, target_prompt
    )

    # 2. 상호 셀프 어텐션으로 레이아웃 정보 구성
    if t >= tau_s:
        q_lay, k_lay, v_lay = q_src, k_src, v_src
    else:
        q_lay, k_lay, v_lay = q_tgt, k_src, v_src

    # 3. 레이아웃 브랜치의 노이즈 예측
    eps_lay, m_lay = predict_with_attention(
        z_lay, t, source_prompt, q_lay, k_lay, v_lay
    )

    # 4. 소스·레이아웃·타깃의 크로스 어텐션 맵 계산
    # m_src / m_tgt는 위 U-Net 호출에서, m_lay는 레이아웃 호출에서 얻는다.

    if t >= tau_c:
        m_tgt_refined = refine(m_lay, m_tgt)
    else:
        m_tgt_refined = m_tgt

    # 5. 정제된 맵을 이용해 타깃 노이즈 예측
    eps_tgt = predict_with_cross_attention(
        z_tgt, t, target_prompt, m_tgt_refined
    )

    # 6. 샘플링 갱신
    z_src_next, z_tgt_next, z_lay_next = sample_joint(
        [z_src, z_tgt, z_lay], [eps_src, eps_tgt, eps_lay], t, z0_src
    )

    # 7. Eq. 13의 소스·타깃 어텐션 맵으로 블렌딩 마스크 생성
    mask_tgt = threshold(
        attention_for_word(m_tgt, target_prompt),
        target_threshold,
    )
    mask_src = threshold(
        attention_for_word(m_src, source_prompt),
        source_threshold,
    )

    z_tgt_next = (
        (1 - mask_tgt + mask_src) * z_src_next
        + (mask_tgt - mask_src) * z_tgt_next
    )

    return z_src_next, z_tgt_next, z_lay_next
```

여기서 `q_lay`, `k_lay`, `v_lay`는 레이아웃 브랜치의 어텐션 계산을 위한 중간 표현이다. 초기 단계에서는 소스의 모든 셀프 어텐션 텐서를 유지하고, 후기 단계에서는 타깃 쿼리만 사용한다. `k_src`, `v_src`를 계속 참조하는 이유는 타깃이 새로운 의미를 만들더라도 소스의 공간 관계를 완전히 버리지 않게 하기 위해서다.

실제 코드로 옮길 때 특히 조심할 지점은 다음과 같다.

- $t\geq\tau_c$와 $t<\tau_c$의 경계를 뒤집지 않아야 한다.
- $t\geq\tau_s$와 $t<\tau_s$ 역시 초기·후기 단계의 의미를 확인해야 한다.
- Eq. 13의 마스크 연산은 원소별 곱이며, 채널 축과 공간 축으로 올바르게 브로드캐스트되어야 한다.
- $M^{\mathrm{src}}$, $M^{\mathrm{tgt}}$, $M^{\mathrm{lay}}$의 토큰 인덱스가 서로 다른 프롬프트의 토큰 위치와 섞이지 않도록 $A(j)$ 정렬을 유지해야 한다.
- LCM을 사용할 때는 일반 SD의 스텝 수와 LCM의 스텝 수를 동일한 의미로 해석하면 안 된다. Table 1과 Table 2는 백본에 따라 스텝 수와 CLIP Score가 달라짐을 보여준다.
- $a^{\mathrm{src}}$, $a^{\mathrm{tgt}}$, $\tau_c$, $\tau_s$는 어텐션 제어의 강도와 적용 시점을 결정하므로 재현하려는 설정과 일치시켜야 한다.

학습 루프와 샘플링 루프도 분리해서 이해해야 한다. Eq. 2와 Eq. 5는 각각 확산 모델과 일관성 모델을 학습하는 목적 함수다. 반면 InfEdit의 VI와 UAC는 추가 파라미터 튜닝 없이 이미 학습된 백본의 샘플링 과정에 개입한다. 즉, 이 논문의 효율성 주장은 새로운 편집 데이터셋으로 모델을 다시 학습한 결과가 아니라, 기존 백본의 추론 루프에 수식 기반 보정과 어텐션 제어를 추가한 결과다.

## 실험에서 확인한 것

### 실험 구성

논문은 PIE-Bench와 Image-to-Image Translation 두 종류의 데이터로 평가한다.

PIE-Bench는 다음 9개 편집 시나리오를 포함한다.

- Delete Object
- Change Content
- Add Object
- Change Pose
- Change Object
- Change Color
- Change Style
- Change Material
- Change Background

Image-to-Image Translation에서는 장면 수준의 Summer $\leftrightarrow$ Winter 변환과 객체 수준의 Horse $\leftrightarrow$ Zebra 변환을 사용한다.

역전 기반 베이스라인은 DDIM, CycleDiffusion, Null-Text, Negative Prompt, StyleDiffusion, Direct Inversion이다. 어텐션 제어 베이스라인은 P2P, PnP, MasaCtrl이다. 기본 백본으로는 Stable Diffusion v1.4와 LCM을 사용한다.

평가 지표는 네 그룹으로 나뉜다.

- 이미지 품질: FID.
- 번역 품질: 전체 이미지와 편집 영역에 대한 CLIPScore.
- 번역 일관성: Structure Distance, 배경 보존 PSNR·LPIPS·MSE·SSIM.
- 효율성: 역전 시간, 순방향 생성 시간, 샘플링 스텝 수.

PSNR과 SSIM은 높을수록 좋고, Structure Distance·LPIPS·MSE는 낮을수록 좋다. 표의 LPIPS와 MSE는 각각 $10^3$, $10^4$ 단위로 표시되어 있으므로 원시 값과 혼동하면 안 된다.

### Table 1: PIE-Bench 종합 비교

| Method | Structure Distance↓ | PSNR↑ | LPIPS↓ | MSE↓ | SSIM↑ | CLIP Whole↑ | CLIP Edited↑ | Inverse Time↓ | Forward Time↓ | Steps↓ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DDIM / P2P | 69.43 | 17.87 | 208.80 | 219.88 | 71.14 | 25.01 | 22.44 | 10.93 ± 0.01 | 12.79 ± 0.01 | 50 |
| CycleD / P2P | 6.06 | 28.25 | 43.96 | 25.85 | 85.61 | 23.68 | 20.87 | N/A | 4.55 ± 0.02 | 32 |
| NT / P2P | 13.44 | 27.03 | 60.67 | 35.86 | 84.11 | 24.75 | 21.86 | 132.39 ± 7.69 | 12.90 ± 0.01 | 50 |
| NP / P2P | 16.17 | 26.21 | 69.01 | 39.73 | 83.40 | 24.61 | 21.87 | 4.14 ± 0.00 | 12.78 ± 0.01 | 50 |
| StyleD / P2P | 11.65 | 26.05 | 66.10 | 38.63 | 83.42 | 24.78 | 21.72 | 810.17 ± 7.77 | 28.18 ± 1.30 | 50 |
| DI / P2P | 11.65 | 27.22 | 54.55 | 32.86 | 84.76 | 25.02 | 22.10 | 16.83 ± 0.02 | 12.87 ± 0.01 | 50 |
| VI / P2P | 14.22 | 27.52 | 47.98 | 34.17 | 85.05 | 24.89 | 22.03 | N/A | 4.50 ± 0.01 | 32 |
| VI* / P2P | 15.61 | 26.64 | 55.85 | 41.15 | 84.66 | 24.57 | 21.69 | N/A | 2.60 ± 0.00 | 15 |
| VI* / UAC | 13.78 | 28.51 | 47.58 | 32.09 | 85.66 | 25.03 | 22.22 | N/A | 2.22 ± 0.02 | 12 |

별표가 붙은 행은 LCM을 백본으로 사용하고, 나머지는 SD v1.4를 사용한다. VI/P2P 행은 SD v1.4에서 32스텝을 사용한 결과이며, VI*/P2P와 VI*/UAC는 LCM 결과다.

이 표에서 먼저 눈에 띄는 것은 역전 시간이다. VI 계열은 명시적 역전 시간이 N/A로 표시된다. VI*/UAC는 12스텝과 $2.22\pm0.02$초의 순방향 시간으로 가장 빠른 결과를 기록했다. StyleDiffusion은 역전 시간 $810.17\pm7.77$초와 순방향 시간 $28.18\pm1.30$초로, 속도 측면에서 큰 부담이 있다. Null-text Inversion도 역전 시간이 $132.39\pm7.69$초로 보고됐다.

품질 측면에서는 속도만 높아진 것이 아니다. VI*/UAC는 PSNR 28.51, LPIPS 47.58, MSE 32.09, SSIM 85.66, 전체 이미지 CLIP 25.03, 편집 영역 CLIP 22.22를 기록했다. VI*/P2P와 비교하면 PSNR은 26.64에서 28.51로 올라가고, LPIPS는 55.85에서 47.58로, MSE는 41.15에서 32.09로 낮아졌다. SSIM은 84.66에서 85.66으로, 전체 이미지 CLIP은 24.57에서 25.03으로, 편집 시간은 2.60초에서 2.22초로 개선됐다.

다만 Structure Distance만 보면 StyleDiffusion과 Direct Inversion이 각각 11.65로 VI*/UAC의 13.78보다 낮다. 논문은 이를 편집 거리 감소와 편집 충실도 사이의 근본적인 트레이드오프로 설명한다. 원본과 가까운 결과를 만드는 것만으로는 편집 지시를 잘 따른다고 할 수 없다. 논문 본문은 Direct Inversion과 CycleDiffusion이 구조 거리에서는 우수하지만, 편집 지시를 수행하지 못하고 소스 이미지를 그대로 남기는 실패가 빈번하다고 설명한다.

### Table 2: SD v1.4와 LCM의 스텝별 비교

| Method | Backbone | 2 steps | 4 steps | 8 steps | 16 steps | 32 steps |
|---|---|---:|---:|---:|---:|---:|
| InfEdit (VI+P2P) | SD 1.4 | 21.47 | 22.17 | 23.16 | 24.45 | 25.18 |
| InfEdit (VI+P2P) | LCM | 25.76 | 25.33 | 24.76 | 25.08 | 26.68 |

SD v1.4는 2스텝에서 21.47로 시작해 32스텝에서 25.18까지 점진적으로 높아진다. 반면 LCM은 2스텝에서 이미 25.76을 기록해 SD v1.4의 32스텝 결과를 넘어선다. LCM의 점수는 4스텝 25.33, 8스텝 24.76, 16스텝 25.08, 32스텝 26.68로 측정됐다.

이 결과가 보여주는 것은 단순히 스텝 수가 적어도 된다는 사실만은 아니다. InfEdit의 DDCM 수식이 LCM의 다단계 샘플링 형태와 맞기 때문에, VI와 LCM을 결합할 수 있다는 점이 중요하다. 다만 LCM 결과가 모든 스텝 수에서 단조롭게 증가하는 것은 아니므로, 적은 스텝 수와 품질 사이의 관계는 백본 및 설정에 따라 확인해야 한다.

### 9개 편집 태스크별 비교

Figure 5a는 Delete Object, Change Content, Add Object, Change Pose, Change Object, Change Color, Change Style, Change Material, Change Background에 대해 P2P, MasaCtrl, UAC의 CLIP Score를 비교한다. UAC는 9개 태스크 전반에서 P2P와 MasaCtrl보다 지속적으로 높은 CLIP Score를 기록했다.

Figure 5b는 같은 9개 태스크의 PSNR을 비교한다. UAC는 배경과 구조 보존 일관성에서도 P2P와 MasaCtrl보다 높은 결과를 보이며, 전반적으로 가장 높은 일관성을 달성했다.

Figure 5c는 SD v1.4와 LCM에서 스텝 수에 따른 CLIP Score를 비교한다. 이 분석은 백본 선택이 단순한 속도 문제가 아니라, 적은 스텝에서 편집 품질을 유지할 수 있는지와 직접 연결된다는 점을 보여준다.

## 무엇이 성능을 만들었나

### VI가 역전 비용을 제거한 효과

SD v1.4에서 VI/P2P는 역전 시간이 N/A이면서 32스텝의 순방향 시간 4.50초를 기록했다. PSNR 27.52, LPIPS 47.98, SSIM 85.05, 전체 이미지 CLIP 24.89를 달성해 DDIM의 PSNR 17.87, NT의 27.03, NP의 26.21, StyleD의 26.05와 비교해 배경 보존 측면에서 경쟁력 있는 결과를 보였다.

이 비교에서 VI의 기여는 단순히 시간을 줄이는 데만 있지 않다. 입력 이미지의 초기 잠재변수를 이용해 일관성 노이즈를 직접 계산하므로, 역전 브랜치가 별도로 필요하지 않다. 따라서 역전 품질과 역전 시간 사이의 추가적인 선택을 줄인다.

### LCM이 순방향 스텝을 줄인 효과

VI*/P2P는 LCM에서 15스텝, 2.60초의 순방향 시간을 사용한다. SD v1.4 기반 VI/P2P의 32스텝, 4.50초와 비교하면 백본 교체만으로도 스텝 수와 시간이 함께 줄어든다.

Table 2에서 LCM은 2스텝에서도 CLIP Score 25.76을 기록한다. 이는 SD v1.4의 32스텝 점수 25.18보다 높다. 따라서 LCM은 InfEdit의 무역전 구조와 결합될 때, 역전 비용뿐 아니라 순방향 샘플링 비용도 줄이는 역할을 한다.

### UAC가 크로스 어텐션의 한계를 보완한 효과

VI*/P2P에서 VI*/UAC로 바꾸면 PSNR, LPIPS, MSE, SSIM, CLIP Whole이 모두 개선된다. 특히 전체 이미지 CLIP은 24.57에서 25.03으로, 편집 영역 CLIP은 21.69에서 22.22로 올라간다. 이는 소스 공간 구조를 강하게 보존하는 것과 타깃 의미를 반영하는 것 사이에서 UAC의 3-브랜치 설계가 더 나은 균형을 제공했음을 시사한다.

UAC의 역할은 P2P와 MasaCtrl 중 하나를 선택하는 것이 아니다. P2P가 잘하는 공통 단어의 공간 배치 보존과, MasaCtrl이 목표로 하는 비강체 의미 편집을 레이아웃 브랜치로 연결한다. 그림 1의 곰 예시처럼 자세와 색상을 동시에 바꾸는 상황에서 이 조합이 중요하다.

## 비용과 트레이드오프

InfEdit의 가장 큰 장점은 명시적 역전 과정과 추가 파라미터 튜닝을 사용하지 않는다는 점이다. 논문은 이를 튜닝 프리(tuning-free) 프레임워크로 설명한다. 따라서 학습 비용은 새로 발생하지 않고, 비용의 중심은 U-Net을 몇 번 실행하는지와 어텐션 맵을 얼마나 저장·조작하는지로 이동한다.

보고된 시간은 단일 NVIDIA A40 GPU 기준이다. VI*/UAC는 12스텝에서 $2.22\pm0.02$초, VI*/P2P는 15스텝에서 $2.60\pm0.00$초다. 역전 시간이 별도로 필요하지 않다는 점까지 고려하면, 이미지 편집 서비스에서 입력마다 역전 브랜치를 실행해야 하는 방식보다 지연시간을 예측하기 쉽다.

반면 UAC는 단일 타깃 브랜치만 실행하는 구조는 아니다. 소스·레이아웃·타깃 세 브랜치의 정보를 관리해야 하므로, 단순한 한 번의 순방향 샘플링보다 메모리와 어텐션 계산량이 커질 가능성이 있다. 이 비용은 세 브랜치의 메모리 사용량과 파라미터 수를 함께 측정해야 판단할 수 있다.

품질과 구조 보존 사이의 트레이드오프도 남아 있다. Structure Distance를 낮추는 결과가 반드시 편집 지시를 잘 수행한다는 의미는 아니다. StyleDiffusion은 구조 거리에서 유리하지만 배경 보존과 CLIP 유사도에서 효과적인 편집의 한계를 보였다. Direct Inversion과 CycleDiffusion 역시 구조 거리 수치는 좋지만 소스 이미지를 그대로 남기는 실패가 빈번했다.

경량화 관점에서 보면 이 논문의 선택은 두 단계다. DDCM과 VI는 역전 단계를 제거해 입력별 준비 비용을 줄이고, LCM은 샘플링 스텝을 줄여 순방향 비용을 낮춘다. UAC는 품질과 비강체 편집 능력을 보강하지만, 그 대가로 세 브랜치와 어텐션 제어를 관리해야 한다. 즉, 무조건 가장 작은 모델을 제안한 것이 아니라, 역전 비용을 없애고 적은 스텝의 백본을 활용해 편집 지연시간을 줄이는 방향의 효율화다.

## 한계와 생각해볼 점

논문이 본문에서 밝힌 한계는 StyleDiffusion 대비 Structure Distance가 다소 밀릴 수 있다는 점이다. 저자들은 이를 이미지 편집 거리 감소와 편집 충실도 향상 사이의 근본적인 트레이드오프로 설명한다. 원본과 가까운 결과를 유지하는 것과 텍스트 지시를 충실히 반영하는 것이 항상 같은 방향은 아니다.

논문은 정성적 비교를 위한 상세 샘플을 Appendix에 수록했다고 설명한다. 성능 범위는 샘플이 사용한 모델과 편집 조건에 맞춰 해석해야 한다.

구현 관점에서 주의할 지점은 임계값과 스케줄이다. $a^{\mathrm{src}}$, $a^{\mathrm{tgt}}$, $\tau_c$, $\tau_s$는 어텐션 제어의 강도와 적용 시점을 결정한다. 논문의 정성적 결과를 재현하려면 이 설정과 프롬프트 토큰 정렬 방식을 함께 맞춰야 한다.

또 하나는 세 브랜치의 비용이다. UAC가 단일 A40에서 2초대 결과를 보고했더라도 다른 GPU나 더 큰 해상도에서 같은 지연시간이 유지되는지는 별도로 측정해야 한다. 세 브랜치의 메모리 사용량과 어텐션 저장량, 해상도별 실행 비용도 함께 비교해야 한다.

일반화 가능성도 실험 범위 안에서 판단해야 한다. PIE-Bench의 9개 언어 유도 편집 태스크와 Summer/Winter, Horse/Zebra 변환에서는 UAC와 LCM 조합이 유리한 결과를 보였다. 다른 데이터 분포, 다른 이미지 해상도, 다른 모달리티, 더 큰 모델 규모에서도 같은 결과가 유지되는지는 별도 검증이 필요하다. 따라서 모든 이미지 편집에 적용된다고 확대해석하기보다는, 입력 이미지의 초기 잠재변수를 알고 있고 텍스트 조건부 확산 백본을 사용하는 편집 문제에서 검증된 설계로 이해하는 편이 정확하다.

## 정리

InfEdit의 핵심은 이미지 편집에서 필수처럼 여겨졌던 역전 단계를 없애는 데 있다. DDCM은 분산 스케줄을 $\sigma_t=\sqrt{1-\alpha_{t-1}}$로 선택해 확산 역과정의 방향 항을 제거하고, 초기 잠재변수 $z_0$가 주어진다는 사실을 이용해 일관성 노이즈를 닫힌 형태로 계산한다.

VI는 이 노이즈를 타깃의 예측 초기값에 직접 반영한다. 그 결과 각 시점의 타깃 잠재변수를 계속 보정하는 방식보다 오차 누적을 줄이는 경로를 취한다.

UAC는 소스·레이아웃·타깃 세 브랜치로 크로스 어텐션과 상호 셀프 어텐션을 통합한다. 초기에는 소스 구조를 이용해 레이아웃을 형성하고, 후기에는 타깃 쿼리와 소스 키·밸류를 조합해 비강체 편집을 허용한다.

실험에서는 LCM 백본과 UAC를 결합한 VI* / UAC가 12스텝, $2.22\pm0.02$초의 순방향 시간과 함께 배경 보존 및 CLIP 지표에서 좋은 균형을 보였다. 이 논문을 구현할 때 가장 중요한 부분은 Eq. 10의 일관성 노이즈 계산 자체보다도, 동일한 터미널 노이즈 사용, 타임스텝 경계, 토큰 정렬, 어텐션 맵과 잠재변수의 공간 정렬, 그리고 $\tau_c$·$\tau_s$ 스케줄을 정확히 유지하는 것이다.