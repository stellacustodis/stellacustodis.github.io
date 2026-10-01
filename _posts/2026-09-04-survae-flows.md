---
title: "SurVAE Flows: Surjections to Bridge the Gap between VAEs and Flows"
date: 2026-09-04 10:43:27 +0900
permalink: /posts/survae-flows/
categories:
  - AI
  - Paper Review
tags: [paper-review, normalizing-flow, vae, surjection, generative-model]
description: "SurVAE Flows가 전단사, 확률적 변환, 전사 변환을 하나의 가능도 계산 틀로 통합하는 방법과 주요 실험 결과를 정리한다."
paper:
  authors: "Didrik Nielsen, Priyank Jaini, Emiel Hoogeboom, Ole Winther, Max Welling"
  venue: "Advances in Neural Information Processing Systems"
  url: "https://proceedings.neurips.cc/paper/2020/hash/9578a63fbe545bd82cc5bbe749636af1-Abstract.html"
  code: "https://github.com/didriknielsen/survae_flows"
---

## 세 줄 요약

SurVAE Flows는 전단사(bijection)만 허용하던 정규화 흐름(normalizing flow)에 전사 변환(surjection)과 확률적 변환을 더해, VAE와 flow를 하나의 변환 프레임워크로 설명한다.

핵심은 각 레이어를 forward 변환, inverse 변환, 가능도 기여도(likelihood contribution), bound gap으로 분해하는 것이다.

이 구성을 이용하면 차원을 줄이는 slicing·max 연산이나 이산화를 위한 rounding, 대칭성과 순열 불변성을 다루는 abs·sort·stochastic permutation을 flow의 조합 가능한 레이어로 사용할 수 있다.

## 이 논문이 풀려는 문제

정규화 흐름의 장점은 가능도 계산이 명확하다는 데 있다. 데이터 $x$와 잠재변수 $z$를 전단사 함수로 연결하면 역변환과 야코비안(Jacobian) 행렬식만으로 $\log p(x)$를 계산할 수 있다. 하지만 전단사는 입력과 출력 사이의 일대일 대응을 요구한다. 그 결과 변환 도중 차원을 바꾸기 어렵고, 이산적인 값이나 서로 분리된 성분을 가진 분포를 표현하는 데 제약이 생긴다.

VAE는 반대쪽 특성을 가진다. $z$에서 $x$로 가는 확률적 변환을 사용하므로 전단사 구조에 묶이지 않고 더 다양한 관계를 표현할 수 있다. 대신 사후분포 $p(z\mid x)$를 직접 계산하기 어려워 근사 사후분포 $q(z\mid x)$를 도입해야 한다. 이때 계산하는 값은 일반적으로 정확한 주변 가능도 $\log p(x)$가 아니라 그 하한인 ELBO다.

두 계열의 차이를 단순화하면 다음과 같다.

| 관점 | 정규화 흐름 | VAE |
|---|---|---|
| 변환 | 결정적 전단사 | 확률적 변환 |
| 역방향 | 결정적으로 계산 가능 | 근사 사후분포 필요 |
| 차원 변경 | 전단사만으로는 불가능 | 가능 |
| 가능도 | exact likelihood | lower bound |
| 주요 제약 | 표현 가능한 매핑의 구조 | posterior approximation의 오차 |

이 간극을 메우기 위해 dequantization, discrete analog, augmented space와 같은 해법이 각각 제안되어 왔다. SurVAE Flows가 던지는 질문은 이런 기법을 서로 무관한 예외로 둘 필요가 있느냐는 것이다. 전단사 외의 변환도 forward와 inverse의 결정성 여부, 그리고 그 변환이 가능도에 더하는 항으로 정리하면 하나의 모듈식 체계 안에 넣을 수 있다는 것이 논문의 출발점이다.

![SurVAE Flow의 네 가지 변환이 forward와 inverse 방향에서 결정적 또는 확률적으로 작동하는 방식](/assets/img/posts/survae-flows/figure1.png){: w="800" }
_논문 Figure 1. Bijective, generative surjection, inference surjection, stochastic transformation을 구분하는 기준은 각 방향의 변환이 결정적인지 확률적인지다._

이 그림에서 먼저 봐야 할 것은 화살표의 방향보다 정보의 관계다. 전단사는 양방향이 모두 결정적이다. stochastic transformation은 양방향에 확률분포가 개입한다. 두 surjection은 그 중간에 위치한다.

- Generative surjection은 $z\to x$가 결정적이고 $x\to z$가 확률적이다.
- Inference surjection은 $x\to z$가 결정적이고 $z\to x$가 확률적이다.

전사 함수는 여러 입력을 하나의 출력으로 보낼 수 있다. 따라서 역방향에서는 원래 입력을 하나로 정할 수 없고, 잃어버린 정보를 확률적으로 복원해야 한다. SurVAE Flows는 이 확률적 역관계를 숨기지 않고 $p(x\mid z)$ 또는 $q(z\mid x)$로 명시한다.

## 핵심 아이디어: 변환을 가능도 장부로 바꾼다

이 논문의 핵심은 새로운 단일 변환을 제안했다는 데 있지 않다. 서로 다른 변환을 동일한 회계 방식으로 기록할 수 있게 했다는 데 있다. 각 레이어는 다음 네 항목으로 기술된다.

1. $z$에서 $x$로 가는 forward transformation
2. $x$에서 $z$로 가는 inverse transformation
3. 해당 레이어가 로그 가능도에 더하는 $V(x,z)$
4. 근사로 인해 생기는 bound gap $E(x,z)$

전체 모델은 이런 레이어들을 연속해서 조합한 것이다. 전단사 레이어에서는 $V$가 익숙한 log-determinant가 되고 $E=0$이다. 확률적 레이어에서는 $V$가 forward와 inverse 조건부분포의 로그 비율이 되며, 근사 사후분포와 실제 사후분포의 차이가 $E$로 남는다.

이를 식으로 정리하면 다음과 같다.

| 변환 | Forward | Inverse | $V(x,z)$ | $E(x,z)$ |
|---|---|---|---|---|
| Bijective | $x=f(z)$ | $z=f^{-1}(x)$ | $\log\left\lvert\det\nabla\_x z\right\rvert$ | $0$ |
| Stochastic | $x\sim p(x\mid z)$ | $z\sim q(z\mid x)$ | $\log \frac{p(x\mid z)}{q(z\mid x)}$ | $\log\frac{q(z\mid x)}{p(z\mid x)}$ |
| Surjective (Gen.) | $x=f(z)$ | $z\sim q(z\mid x)$ | $\log\frac{p(x\mid z)}{q(z\mid x)}$, $p(x\mid z)\to\delta(x-f(z))$ | $\log\frac{q(z\mid x)}{p(z\mid x)}$ |
| Surjective (Inf.) | $x\sim p(x\mid z)$ | $z=f^{-1}(x)$ | $\log\frac{p(x\mid z)}{q(z\mid x)}$, $q(z\mid x)\to\delta(z-f^{-1}(x))$ | $0$ |

이 표는 “surjection이면 항상 exact likelihood인가?”라는 질문에도 답한다. Inference surjection은 inverse가 결정적이므로 표에서 $E=0$이다. 반면 generative surjection은 inverse에 $q(z\mid x)$가 필요하며 stochastic transformation과 같은 형태의 gap이 남는다. 따라서 프레임워크 전체가 언제나 exact한 것이 아니라, 어떤 레이어를 조합했는지에 따라 exact likelihood와 lower bound가 구분된다.

## 방법 — 전단사와 VAE를 하나의 식으로 읽기

### 전단사의 change of variables

전단사 변환에서는 $z=f^{-1}(x)$가 하나로 결정된다. 이때 데이터 밀도는 다음 change-of-variables 식으로 계산된다.

$$
\log p(x)
=
\log p(z)
+
\log\lvert\det J\rvert,
\qquad
z=f^{-1}(x)
\tag{1}
$$

여기서 $J=\nabla\_x f^{-1}(x)$다. 두 항의 역할은 분명하다.

- $\log p(z)$는 역변환된 점이 기저 분포에서 얼마나 그럴듯한지 측정한다.
- $\log\lvert\det J\rvert$는 변환이 국소적으로 부피를 얼마나 늘리거나 줄였는지 보정한다.

두 번째 항을 빼면 서로 다른 부피 변화를 일으키는 변환을 같은 밀도로 취급하게 된다. 좌표만 옮기고 확률 질량이 차지하는 부피가 바뀐 사실을 반영하지 못하는 셈이다.

Eq. 1이 정확히 계산될 수 있는 이유는 $x$가 주어졌을 때 $z$가 하나로 결정되기 때문이다. 별도의 사후분포 근사가 없으므로 posterior approximation에서 오는 gap도 없다. 그러나 이 장점은 전단사라는 강한 조건에서 나온다. 여러 값을 하나로 합치거나 차원을 제거하는 연산은 그대로 넣을 수 없다.

### VAE 분해에서 ELBO gap이 생기는 위치

확률적 변환에서는 $x$ 하나에 대응하는 $z$가 여러 개일 수 있다. 계산하기 어려운 $p(z\mid x)$ 대신 $q(z\mid x)$를 사용하면 로그 가능도는 다음과 같이 분해된다.

$$
\log p(x)
=
\mathbb{E}_{q(z\mid x)}[\log p(x\mid z)]
-
D_{KL}[q(z\mid x)\|p(z)]
+
D_{KL}[q(z\mid x)\|p(z\mid x)]
\tag{2}
$$

앞의 두 항은 ELBO다.

$$
\mathrm{ELBO}(x)
=
\mathbb{E}_{q(z\mid x)}[\log p(x\mid z)]
-
D_{KL}[q(z\mid x)\|p(z)]
$$

첫 항은 $q(z\mid x)$에서 얻은 잠재변수로 $x$를 설명하는 정도다. 두 번째 항은 근사 사후분포가 기저 분포 $p(z)$에서 지나치게 벗어나지 않도록 한다. 마지막 KL 항은 ELBO와 실제 $\log p(x)$ 사이의 차이다.

KL divergence가 음수가 아니므로 ELBO는 $\log p(x)$의 하한이 된다. $q(z\mid x)=p(z\mid x)$라면 마지막 항이 0이 되어 하한이 정확한 값에 닿는다. 반대로 $q$가 실제 posterior를 충분히 표현하지 못하면 gap이 남는다. 즉 확률적 변환의 유연성은 posterior approximation이라는 비용과 맞바뀐다.

이 분해에서 버린 것은 데이터의 일부가 아니라 정확한 posterior 계산이다. ELBO는 마지막 KL 항을 직접 계산하지 않고 앞의 두 항을 최적화한다. 따라서 모델의 생성분포와 근사 사후분포가 함께 학습되더라도, 보고되는 bound가 실제 marginal likelihood와 얼마나 떨어져 있는지는 $q$의 품질에 달려 있다.

### 통합식의 $V$와 $E$

SurVAE Flows는 Eq. 1과 Eq. 2를 다음 형태로 묶는다.

$$
\log p(x)
\simeq
\log p(z)+V(x,z)+E(x,z),
\qquad
z\sim q(z\mid x)
\tag{3}
$$

이 식에서 각 항의 역할은 다음과 같다.

- $\log p(z)$: 다음 레이어 또는 최종 기저 분포가 제공하는 로그 밀도
- $V(x,z)$: 현재 변환이 로그 가능도에 더하는 항
- $E(x,z)$: inverse approximation 때문에 생기는 bound looseness

전단사에서는 $V$가 Eq. 1의 log-determinant이고 $E=0$이다. stochastic transformation에서는 $V$가 $\log p(x\mid z)-\log q(z\mid x)$가 되며, $E$에는 $q(z\mid x)$와 $p(z\mid x)$의 차이가 들어간다.

이 표현이 모듈화에 유리한 이유는 전체 모델의 가능도를 한 번에 새로 유도하지 않아도 되기 때문이다. 레이어마다 $V$와 $E$를 정의한 뒤, 변환을 통과하면서 기여도를 누적할 수 있다. 다만 레이어별 gap도 함께 누적될 수 있으므로, 조합 가능성이 곧 exactness를 뜻하지는 않는다.

## 차원을 버리되 가능도 항을 남기는 surjection

### Tensor slicing surjection

Tensor slicing은 입력 벡터의 일부만 남기는 연산이다. 생성 방향의 slicing은 $z=(z\_1,z\_2)$에서 $x=z\_1$을 남긴다. 역방향에서는 관측값 $x$에 $q(z\_2\mid x)$에서 표본화한 누락 차원을 붙여 더 큰 잠재변수 $z$를 구성한다. 반대로 추론 방향에서 관측 차원을 줄이는 slicing은 생성 방향에서 조건부분포 $p(x\_{\mathrm{drop}}\mid z)$로 제거한 관측 차원을 복원한다.

likelihood contribution은 다음과 같다.

$$
V(x,z)
=
\lim_{\sigma^2\to 0}
\mathbb{E}_{q(z\mid x)}
\left[
\log\frac{p(x\mid z)}{q(z\mid x)}
\right]
=
\mathbb{E}_{q(z_2\mid x)}
[-\log q(z_2\mid x)]
$$

여기서 $p(x\mid z)\to\delta(x-f(z))$인 극한을 사용한다. 결정적 관계를 분산이 0으로 가는 조건부분포로 표현한 것이다. 이 조작을 통해 “일부 텐서를 잘라낸다”는 구조적 연산을 가능도 계산에 들어갈 확률 항으로 바꾼다.

마지막 식의 $-\log q(z\_2\mid x)$는 생성 방향에서 제거한 잠재 성분을 역방향으로 추론하는 비용이다. 이 경우 역방향의 다음 레이어는 $x$보다 큰 $z=(x,z\_2)$를 받는다. 추론 방향의 slicing에서는 다음 레이어가 더 작은 $z$를 받는 대신, 제거한 관측 성분의 $+\log p(x\_{\mathrm{drop}}\mid z)$를 가능도 기여도로 기록한다.

Tensor slicing은 기존 multi-scale architecture를 설명하는 데도 쓰인다. 먼저 전단사로 $X$를 $Y\times E$로 바꾼 뒤 $E$를 slice하고, 남은 $Y$에 다시 전단사를 적용하는 구조다. augmented flow와 slicing을 조합하면 더 큰 공간에서 전단사 변환을 수행한 뒤 필요한 부분만 남기는 모델도 같은 방식으로 표현할 수 있다.

![Tensor slicing으로 표현한 augmented flow와 infinite mixture of flows의 구조](/assets/img/posts/survae-flows/figure3.png){: w="700" }
_논문 Figure 3. 보조 공간을 추가한 뒤 전단사로 변환하고 일부 변수를 slice하는 구조가 SurVAE 레이어의 조합으로 표현된다._

### Rounding surjection과 dequantization

Rounding surjection은 연속적인 입력을 이산 값으로 내리는 연산이다. 서로 다른 연속 값이 하나의 이산 값으로 대응하므로 전단사가 아니라 surjection이다. likelihood contribution은 다음과 같다.

$$
V(x,z)
=
\mathbb{E}_{q(z\mid x)}[-\log q(z\mid x)]
$$

이 식에서도 핵심은 rounding 때문에 사라진 세부 위치를 $q(z\mid x)$가 표현한다는 점이다. 단순히 정수 값만 남기면 연속 공간에서 어느 위치가 그 값으로 대응되었는지 알 수 없다. $-\log q(z\mid x)$ 항은 그 역방향 선택의 확률을 가능도 장부에 반영한다.

논문은 dequantization을 별도의 예외적 전처리가 아니라 round surjection으로 표현한다. 이 관점에서는 “연속 값을 만든 뒤 이산 데이터로 내린다”는 과정 자체가 모델의 변환 레이어가 된다.

## 대칭성과 집합 구조를 다루는 inference surjection

### Abs surjection: 부호를 잠재 선택으로 분리한다

Abs surjection의 inverse는 결정적이다.

$$
z=\lvert x\rvert
$$

하지만 $z$에서 원래 $x$로 돌아가려면 부호 $s\in\{-1,1\}$를 골라야 한다. forward 조건부분포는 다음과 같다.

$$
p(x\mid z)
=
\sum_{s\in\{-1,1\}}
p(x\mid z,s)p(s\mid z)
=
\sum_{s\in\{-1,1\}}
\delta(x-sz)p(s\mid z)
$$

반대 방향은 입력 $x$의 부호가 이미 알려져 있으므로 결정적으로 쓸 수 있다.

$$
q(z\mid x)
=
\sum_{s\in\{-1,1\}}
q(z\mid x,s)p(s\mid x)
=
\sum_{s\in\{-1,1\}}
\delta(z-sx)\delta_{s,\operatorname{sign}(x)}
$$

$\lvert x\rvert$를 취하면 $x$와 $-x$가 같은 $z$로 합쳐진다. 잃어버린 정보는 정확히 부호 하나다. 따라서 likelihood contribution도 선택한 부호의 로그 확률인 $\log p(s\mid z)$로 정리된다.

이 레이어가 필요한 이유는 대칭 구조를 전단사 flow 하나에 모두 맡기지 않기 위해서다. magnitude와 sign을 분리하면 이후의 변환은 $z=\lvert x\rvert$ 공간을 모델링하고, 어느 부호 가지를 선택할지는 $p(s\mid z)$가 담당한다.

논문은 세 개의 대칭적인 synthetic 2D 데이터셋과 하나의 anti-symmetric 데이터셋에서 기존 Flow와 AbsFlow가 학습한 분포를 비교한다. 이 비교에서 중요한 점은 abs 연산이 항상 유리하다는 주장이 아니라, 데이터의 대칭 구조를 명시적인 surjection으로 모델에 넣었을 때와 그렇지 않을 때의 차이를 확인하는 것이다.

![대칭 및 비대칭 2차원 데이터에서 Flow와 AbsFlow가 학습한 분포 비교](/assets/img/posts/survae-flows/figure4.jpg){: w="500" }
_논문 Figure 4. Abs surjection이 표현하는 대칭 구조와 데이터의 실제 구조가 맞는지를 비교해 볼 수 있다._

### Max surjection: 최대값과 나머지 성분을 함께 모델링한다

Max surjection은 $K$개 성분 중 최댓값만 남긴다.

$$
z=\max x
$$

최댓값만으로는 어느 위치가 선택되었는지, 나머지 $K-1$개 값이 무엇이었는지 알 수 없다. 따라서 forward 과정에서는 먼저 최댓값의 위치 $k$를 선택하고, 나머지 성분 $x\_{-k}$를 조건부로 생성한다.

$$
p(x\mid z)
=
\sum_{k=1}^{K}
\delta(x_k-z)\,
p(x_{-k}\mid z,k)\,
p(k\mid z)
$$

inverse는 입력 전체를 보고 최댓값과 그 인덱스를 결정한다.

$$
q(z\mid x)
=
\sum_{k=1}^{K}
\delta(z-x_k)\,
\delta_{k,\arg\max(x)}
$$

가능도 기여도는 두 부분으로 나뉜다.

$$
V(x,z)
=
\log p(k\mid z)
+
\log p(x_{-k}\mid z,k)
$$

첫 항은 어느 위치가 최댓값이었는지를 설명하고, 두 번째 항은 max 연산이 제거한 나머지 값을 설명한다. 둘 중 하나를 빼면 원래 입력의 확률을 복원할 정보가 부족하다. 특히 max pooling을 단순한 결정적 다운스케일링으로만 취급하면 제거된 값을 모델의 가능도에서 놓치게 된다.

### Sort surjection과 stochastic permutation

Sort surjection의 inverse는 입력을 정렬하는 것이다.

$$
z=\operatorname{sort}(x),
\qquad
I=\operatorname{argsort}(x)
$$

forward에서는 정렬된 $z$에 적용할 순열 $I$를 고르고 $x=z\_I$를 만든다. likelihood contribution은 $\log p(I\mid z)$다. 정렬 결과만으로는 원래 순서를 알 수 없으므로, 손실된 정보가 순열 변수에 담긴다.

세 inference surjection을 한 표로 비교하면 구조가 더 분명해진다.

| Surjection | 결정적 inverse가 남기는 값 | Forward가 복원해야 하는 정보 | $V(x,z)$ |
|---|---|---|---|
| Abs | $z=\lvert x\rvert$ | 부호 $s$ | $\log p(s\mid z)$ |
| Max | $z=\max x$ | 위치 $k$와 나머지 $x\_{-k}$ | $\log p(k\mid z)+\log p(x\_{-k}\mid z,k)$ |
| Sort | $z=\operatorname{sort}(x)$ | 순열 $I$ | $\log p(I\mid z)$ |

공통 원리는 “버린 정보를 확률변수로 이름 붙인다”는 것이다. 정보가 사라졌다는 사실을 무시하지 않고, 부호·인덱스·나머지 값·순열 가운데 무엇이 필요한지를 forward distribution에 명시한다.

## 기존 생성모델을 SurVAE 조합으로 다시 읽기

논문의 통합 프레임워크는 여러 모델과 기법을 다음과 같은 레이어 조합으로 표현한다.

| 모델 또는 기법 | SurVAE Flow 표현 |
|---|---|
| Probabilistic PCA | $Z\xrightarrow{\text{stochastic}}X$ |
| VAE | $Z\xrightarrow{\text{stochastic}}X$ |
| Diffusion Models | $Z\xrightarrow{\text{stochastic}}X$ |
| Dequantization | $Z\xrightarrow{\text{round}}X$ |
| ANFs, VFlow | $X\xrightarrow{\text{augment}}X\times E\xrightarrow{\text{bijection}}Z$ |
| Multi-scale Architectures | $X\xrightarrow{\text{bijection}}Y\times E\xrightarrow{\text{slice}}Y\xrightarrow{\text{bijection}}Z$ |
| CIFs, Discretely Indexed Flows, DeepGMMs | $X\xrightarrow{\text{augment}}X\times E\xrightarrow{\text{bijection}}Z\times E\xrightarrow{\text{slice}}Z$ |
| RAD Flows | $X\xrightarrow{\text{partition}}X\_E\times E\xrightarrow{\text{bijection}}Z\times E\xrightarrow{\text{slice}}Z$ |

이 표에서 읽어야 할 것은 서로 다른 모델이 동일하다는 뜻이 아니다. 모델을 구성하는 변환을 stochastic, round, augment, bijection, slice, partition이라는 공통 언어로 기술할 수 있다는 뜻이다.

Probabilistic PCA, VAE, Diffusion Models는 모두 stochastic transformation이라는 큰 범주에 놓인다. Dequantization은 round surjection이다. ANFs와 VFlow는 보조 공간 $E$를 붙인 뒤 확장된 공간에서 bijection을 수행한다. Multi-scale architecture는 전단사로 변환한 결과의 일부를 slice한다. CIFs, Discretely Indexed Flows, DeepGMMs는 augment와 bijection 뒤에 slice를 결합하고, RAD Flows는 partition한 상태에서 같은 흐름을 구성한다.

이렇게 보면 SurVAE Flows의 역할은 모델 이름을 하나 더 추가하는 것보다 설계 공간을 정리하는 데 가깝다. 어떤 정보를 보조 변수로 추가하고, 어떤 변환에서 섞고, 어디에서 제거하며, 제거한 정보의 확률을 어느 항이 담당하는지 비교할 수 있다.

## 구현 관점에서

### 공통 실행 인터페이스

SurVAE 레이어를 코드로 옮긴다면 핵심 반환값은 변환된 텐서뿐 아니라 likelihood contribution이어야 한다. Eq. 3의 장부를 그대로 인터페이스로 만든 최소 의사코드는 다음과 같다.

```python
def inverse_layer(x):
    # x: (B, ...)
    # z: (B, ...)
    # v: (B,)  -- sample별 likelihood contribution
    # e: (B,)  -- sample별 bound gap 또는 그 추정에 필요한 값
    z = inverse_transform(x)
    v = likelihood_contribution(x, z)
    e = bound_gap(x, z)
    return z, v, e


def evaluate(x, layers, base_log_prob):
    # x: (B, ...)
    log_prob = zeros(batch_size=x.shape[0])  # (B,)

    h = x
    for layer in layers:
        h, v, e = layer.inverse(h)
        log_prob = log_prob + v              # (B,)

        # exact likelihood를 계산하는 구성이라면 e == 0
        # lower bound를 평가할 때는 계산 가능한 항만 누적한다.

    log_prob = log_prob + base_log_prob(h)   # (B,)
    return log_prob
```

실제 구현에서 중요한 것은 $V$를 배치 전체의 단일 스칼라로 너무 일찍 줄이지 않는 것이다. 각 샘플에 대한 로그 가능도 기여도를 `(B,)` 형태로 유지해야 마지막에 올바른 축으로 평균이나 합을 계산할 수 있다.

또 하나의 구분은 학습 시 inverse 방향과 생성 시 forward 방향이 대칭적이지 않다는 점이다.

```text
가능도 평가 또는 학습:
x
→ inverse transformation
→ z와 V(x, z) 계산
→ 다음 inverse layer
→ base log-probability와 합산

생성:
z ~ base distribution
→ forward transformation
→ 필요하면 sign, index, permutation, sliced variable을 표본화
→ x
```

Bijective layer에서는 양방향이 모두 결정적이지만, inference surjection에서는 가능도 평가 방향이 결정적이고 생성 방향이 확률적이다. 이 비대칭이 구현의 핵심이다.

### Abs surjection 의사코드

```python
def abs_inverse(x):
    # x: (B, D)
    z = abs(x)                    # (B, D)
    s = sign(x)                   # (B, D), 각 원소가 {-1, 1}
    v = log_prob_sign(s, z)       # (B,), log p(s | z)를 event 축으로 합산
    return z, v


def abs_forward(z):
    # z: (B, D), magnitude
    s = sample_sign(z)            # (B, D), p(s | z)
    x = s * z                     # (B, D)
    return x
```

여기서 틀리기 쉬운 지점은 `sign`을 단순 보조 출력으로 버리는 것이다. $s$의 로그 확률이 $V$에 포함되어야 한다. 또한 표의 Bernoulli 변수는 결과적으로 $\{-1,1\}$ 값을 나타내므로, 구현에서 사용하는 부호 인코딩과 $p(s\mid z)$의 사건 정의가 일치해야 한다.

### Max surjection 의사코드

```python
def max_inverse(x):
    # x: (B, K)
    k = argmax(x, axis=-1)                   # (B,)
    z = gather(x, index=k)                   # (B,)
    x_rest = remove_index(x, k)              # (B, K-1)

    log_p_k = log_prob_index(k, z)            # (B,)
    log_p_rest = log_prob_rest(x_rest, z, k)  # (B,)
    v = log_p_k + log_p_rest                  # (B,)
    return z, v


def max_forward(z, K):
    # z: (B,)
    k = sample_index(z, K)                    # (B,)
    x_rest = sample_rest(z, k)                # (B, K-1)
    x = insert_at(x_rest, index=k, value=z)   # (B, K)
    return x
```

이 구현에서는 세 가지 정합성을 확인해야 한다.

첫째, `remove_index`와 `insert_at`이 같은 인덱스 규칙을 사용해야 한다. 배치별 $k$가 다르므로 단일 슬라이스로 처리하면 잘못된 성분이 빠질 수 있다.

둘째, $z$의 shape을 `(B,)`로 둘지 `(B,1)`로 둘지 일관되게 정해야 한다. 이 차이가 조건부분포에 브로드캐스팅 오류를 만들 수 있다.

셋째, $\log p(k\mid z)$와 $\log p(x\_{-k}\mid z,k)$를 모두 포함해야 한다. 최댓값 위치만 모델링하거나 나머지 값만 모델링하면 Table 2의 $V$와 다른 목적함수를 구현하게 된다.

이미지에서는 같은 원리를 공간 축에 적용한 max pooling surjection을 사용할 수 있다. 논문의 MaxPoolFlow는 max pooling을 포함한 multi-scale SurVAE Flow로 다운스케일링한다.

### Sort와 stochastic permutation 의사코드

```python
def sort_inverse(x):
    # x: (B, N, D) 또는 순서를 가진 N개 원소
    I = argsort_indices(x)         # 순열 인덱스
    z = sort_elements(x, I)        # x와 동일한 원소 수
    v = log_prob_permutation(I, z) # (B,)
    return z, v


def sort_forward(z):
    # z: 정렬된 원소
    I = sample_permutation(z)
    x = apply_permutation(z, I)
    return x
```

이 경우에는 `argsort`가 반환하는 인덱스 정의와 `apply_permutation`의 방향이 맞아야 한다. $x=z\_I$를 구현하면서 inverse permutation을 적용하면 샘플은 만들어지더라도 계산한 $\log p(I\mid z)$와 실제 변환이 불일치할 수 있다.

stochastic permutation은 순서를 고정된 정렬 규칙으로 없애는 대신 순열 자체를 확률적으로 다룬다. SpatialMNIST 실험의 PermuteFlow가 이 구성을 사용한다.

### Tensor slicing과 rounding에서의 주의점

Tensor slicing은 차원을 줄이는 방향이 생성 방향인지 추론 방향인지 구분해야 한다. [원문 Example 1, 4쪽](https://papers.nips.cc/paper/2020/file/9578a63fbe545bd82cc5bbe749636af1-Paper.pdf)의 generative slicing은 $z=(z\_1,z\_2)$에서 $x=z\_1$을 남긴다. 역방향에서는 관측값을 잘라내는 대신 $q(z\_2\mid x)$에서 누락 차원을 표본화해 붙인다.

```python
def slicing_forward(z, split):
    # z: (B, D_keep + D_drop) -> x: (B, D_keep)
    return z[:, :split]


def slicing_inverse(x, dropped_dim):
    # x: (B, D_keep)
    z2 = sample_q_dropped(x, dropped_dim)  # (B, D_drop)
    z = concatenate([x, z2], axis=1)      # (B, D_keep + D_drop)
    v = -log_q_dropped(z2, x)             # (B,)
    return z, v
```

이 코드는 생성 방향의 slicing을 설명하는 의사코드다. `sample_q_dropped`는 $q(z\_2\mid x)$에서 표본을 뽑고, `log_q_dropped`는 같은 조건부분포의 로그 밀도를 누락 차원 전체에 합산해 표본당 하나의 값을 반환해야 한다. 역방향의 한 표본 기여도는 $-\log q(z\_2\mid x)$이며, 위 엔트로피 기대값의 Monte Carlo 추정에 사용된다. Generative slicing의 이 추정치를 일반적인 정확한 주변 가능도와 동일시해서는 안 된다. 반대로 관측값 $x$를 잘라 $z$를 남기는 inference slicing은 제거한 관측 차원의 조건부 로그 밀도 $+\log p(x\_{\mathrm{drop}}\mid z)$를 사용한다. 방향을 바꾸면서 부호만 유지하면 likelihood 계산이 달라진다.

Rounding에서도 이산 결과와 그 결과에 대응한 연속 잠재변수의 관계를 혼동하면 안 된다. forward의 rounding 자체는 결정적이지만 inverse는 여러 연속 값을 가질 수 있으므로 $q(z\mid x)$가 필요하다. 따라서 정수 변환만 구현하고 $-\log q(z\mid x)$를 누락하면 SurVAE likelihood가 아니다.

## 실험에서 확인한 것

논문은 네 종류의 실험 범위를 사용한다.

- 세 개의 symmetric synthetic 2D 데이터셋과 하나의 anti-symmetric synthetic 2D 데이터셋
- SpatialMNIST
- CIFAR-10
- ImageNet32와 ImageNet64

synthetic 실험에서는 Flow가 비교 대상이며 AbsFlow를 통해 대칭 구조를 직접 넣는 효과를 본다. SpatialMNIST에서는 SortFlow, BRUNO, FlowScan, Neural Statistician과 비교한다. 이미지 실험에서는 RealNVP, Glow, Flow++, 논문의 Baseline, MaxPoolFlow를 비교한다.

평가 지표도 데이터 특성에 따라 나뉜다. SpatialMNIST에서는 per-point log-likelihood(PPLL)를 사용하고, 이미지 밀도 모델링에서는 bits/dim을 사용한다. CIFAR-10 샘플 품질은 Inception score와 FID로 비교한다.

어느 구성의 학습 시간이 더 짧은지와 필요한 GPU 메모리, 같은 예산에서의 성능은 이 결과만으로 판단할 수 없다. 이를 비교하려면 하드웨어와 학습 비용을 함께 맞춰야 한다.

### SpatialMNIST: 정렬보다 확률적 순열

SpatialMNIST에서 stochastic permutation을 사용한 PermuteFlow는 $-5.30$ PPLL을 기록했다. SortFlow의 결과는 $-5.53$ PPLL이다. PermuteFlow는 non-autoregressive 모델 사이에서 state-of-the-art 성능을 달성했다.

두 모델의 차이는 순서 정보를 처리하는 방식에 있다. SortFlow는 입력을 결정적인 정렬 표현으로 바꾸고 원래 순열의 가능도를 다룬다. PermuteFlow는 순열을 stochastic permutation으로 모델링한다. 보고된 수치에서는 후자가 더 높은 PPLL을 보였다.

다만 이 결과만으로 모든 집합 데이터에서 stochastic permutation이 정렬보다 낫다고 일반화할 수는 없다. 이 비교의 근거는 SpatialMNIST 실험이다.

### 이미지 밀도 모델링

이미지 모델의 bits/dim 결과는 다음과 같다. 이 지표에서는 낮을수록 좋다.

| Model | CIFAR-10 | ImageNet32 | ImageNet64 |
|---|---:|---:|---:|
| RealNVP | 3.49 | 4.28 | - |
| Glow | 3.35 | 4.09 | 3.81 |
| Flow++ | 3.08 | 3.86 | 3.69 |
| Baseline (Ours) | 3.08 | 4.00 | 3.70 |
| MaxPoolFlow (Ours) | 3.09 | 4.01 | 3.74 |

CIFAR-10에서 Baseline은 3.08, MaxPoolFlow는 3.09 bits/dim이다. ImageNet32에서는 각각 4.00과 4.01이고, ImageNet64에서는 3.70과 3.74다. 세 데이터셋 모두 MaxPoolFlow가 Baseline보다 수치상 조금 높다.

따라서 이 표만 놓고 보면 max pooling surjection이 likelihood를 개선했다고 말할 수는 없다. 더 적절한 해석은 tensor slicing을 사용한 Baseline을 max pooling surjection으로 바꾸더라도 비슷한 bits/dim 범위를 유지했다는 것이다.

다른 모델과 비교하면 CIFAR-10에서 Baseline 3.08은 Flow++의 3.08과 같고 MaxPoolFlow는 3.09다. ImageNet32에서는 Flow++가 3.86으로 Baseline 4.00과 MaxPoolFlow 4.01보다 낮다. ImageNet64에서도 Flow++ 3.69, Baseline 3.70, MaxPoolFlow 3.74 순이다. RealNVP와 Glow의 표에 제시된 값도 함께 보면, 이 실험은 SurVAE layer의 사용 가능성을 보여주지만 모든 데이터셋에서 가장 낮은 bits/dim을 달성한 결과는 아니다.

### CIFAR-10 샘플 품질

CIFAR-10에서 Inception score는 높을수록, FID는 낮을수록 좋다.

| Model | Inception $\uparrow$ | FID $\downarrow$ |
|---|---:|---:|
| DCGAN* | 6.4 | 37.1 |
| WGAN-GP* | 6.5 | 36.4 |
| PixelCNN* | 4.60 | 65.93 |
| PixelIQN* | 5.29 | 49.46 |
| Baseline (Ours) | 5.08 | 49.56 |
| MaxPoolFlow (Ours) | 5.18 | 49.03 |

별표가 붙은 결과는 Ostrovski et al.에서 가져온 값이다.

MaxPoolFlow는 Baseline보다 Inception score가 5.08에서 5.18로 높고 FID는 49.56에서 49.03으로 낮다. Table 4에서 CIFAR-10 bits/dim은 Baseline 3.08, MaxPoolFlow 3.09였으므로, likelihood 지표에서는 Baseline이 근소하게 낮지만 두 샘플 품질 지표에서는 MaxPoolFlow가 더 좋은 값이다.

이 결과는 density estimation과 sample quality가 같은 순서로 움직이지 않을 수 있음을 보여준다. 다만 MaxPoolFlow의 5.18과 49.03은 표의 모든 모델 중 최고가 아니다. DCGAN과 WGAN-GP는 더 높은 Inception score와 더 낮은 FID를 기록했고, PixelIQN의 Inception score도 5.29다. 따라서 결론은 max pooling surjection이 모든 생성 모델을 앞섰다는 것이 아니라, 논문의 자체 Baseline과 비슷한 bits/dim을 유지하면서 샘플 지표를 개선했다는 범위에 두어야 한다.

## 무엇이 성능을 만들었는가

전체 성능을 Abs, Max, Sort의 독립적인 기여로 분해하려면 구성 요소별 비교가 필요하다. likelihood contribution의 각 항을 제거하는 경우도 최종 모델의 수치만으로 효과를 판단할 수 없다.

대신 보고된 비교에서 확인할 수 있는 범위는 두 가지다.

첫째, SpatialMNIST에서는 stochastic permutation을 사용한 PermuteFlow가 SortFlow의 $-5.53$보다 높은 $-5.30$ PPLL을 기록했다. 이는 해당 실험에서 순열을 확률적으로 처리한 구성이 결정적 정렬 구성보다 나은 결과를 냈다는 근거다.

둘째, 이미지 실험에서는 tensor slicing 기반 Baseline과 MaxPoolFlow를 비교할 수 있다. MaxPoolFlow는 세 데이터셋에서 Baseline과 비슷하지만 조금 높은 bits/dim을 기록했고, CIFAR-10에서는 더 높은 Inception score와 더 낮은 FID를 기록했다. 이 비교를 각 구성 요소의 독립 효과로 해석하려면 다른 학습 조건과 구성 요소가 통제되었는지까지 확인해야 한다.

## 비용과 트레이드오프

SurVAE layer는 전단사가 허용하지 않던 연산을 모델 내부에 넣는 대신, 사라진 정보를 위한 확률모형을 요구한다.

Tensor slicing의 계산 비용은 방향에 따라 다르다. 생성 방향 slicing의 역방향은 $q(z\_2\mid x)$에서 표본을 뽑고 로그 밀도를 평가하며 더 큰 잠재 상태를 전달한다. 추론 방향 slicing은 더 작은 상태를 다음 레이어에 전달하지만 제거한 관측 성분의 $p(x\_{\mathrm{drop}}\mid z)$를 평가해야 한다. Max surjection은 max pooling과 같은 다운스케일링을 제공하지만 최댓값 위치 $k$와 나머지 값 $x\_{-k}$의 조건부 확률을 계산하거나 표본화해야 한다. Abs는 magnitude만 남길 수 있지만 부호 분포가 필요하고, Sort는 정렬된 표현을 얻는 대신 순열의 확률을 다뤄야 한다.

이 관계를 경량화 관점에서 보면, 표현 크기를 줄이는 것과 전체 계산량을 줄이는 것은 같은 말이 아니다. 추론 방향 slicing이나 max를 지나면 뒤쪽 레이어가 처리할 상태는 작아질 수 있다. 그러나 surjection 자체에서 제거된 정보를 모델링하는 계산이 추가된다. 어느 쪽의 비용이 더 큰지는 연산량, 파라미터 수, 메모리 사용량, GPU 시간을 함께 측정해야 판단할 수 있다.

가능도 측면의 트레이드오프도 있다.

- Bijective transformation은 $E=0$이지만 차원 변경과 다대일 매핑이 제한된다.
- Inference surjection은 inverse를 결정적으로 유지하면서 차원을 줄일 수 있고 $E=0$이다. 대신 forward 생성 시 제거된 정보를 조건부분포에서 표본화해야 한다.
- Generative surjection과 stochastic transformation은 더 자유로운 관계를 표현하지만 $q(z\mid x)$와 실제 posterior의 차이가 bound gap으로 남을 수 있다.

이미지 실험에서도 공짜 개선은 보이지 않는다. MaxPoolFlow는 Baseline보다 CIFAR-10 샘플 품질 지표가 좋아졌지만 bits/dim은 CIFAR-10 3.09 대 3.08, ImageNet32 4.01 대 4.00, ImageNet64 3.74 대 3.70으로 조금 높았다. 구조적 inductive bias를 얻는 대신 density estimation 지표가 같은 방향으로 개선되지는 않은 결과다.

샘플링 비용도 생성 경로의 연산을 기준으로 봐야 한다. inference surjection의 생성 방향에서는 sign, max index, 나머지 값, permutation과 같은 변수를 표본화해야 한다. 따라서 bijective flow처럼 모든 레이어를 결정적 역함수로만 통과하는 구조와는 생성 경로가 다르다.

## 구현할 때 확인할 체크리스트

SurVAE Flow를 수식에서 코드로 옮길 때 먼저 확인할 항목은 다음과 같다.

1. 각 레이어가 bijective, stochastic, generative surjection, inference surjection 중 어디에 속하는가.
2. 가능도 평가 방향에서 변환이 결정적인가, 아니면 $q(z\mid x)$ 표본이 필요한가.
3. $V(x,z)$에 포함되어야 할 모든 사건을 계산했는가.
4. 해당 레이어의 $E(x,z)$가 0인지, posterior approximation gap이 남는지 구분했는가.
5. slice한 변수나 max에서 제거한 값을 텐서에서 버리면서 가능도 항에서도 함께 버리지 않았는가.
6. permutation의 방향과 `argsort` 인덱스 정의가 일치하는가.
7. max index $k$를 배치별로 처리하고 있는가.
8. event 차원의 로그 확률을 합산하되 batch 차원은 유지하는가.
9. 학습·가능도 평가의 inverse 경로와 생성의 forward 경로를 별도로 시험했는가.
10. exact likelihood 결과와 lower bound 결과를 같은 종류의 수치로 오해하지 않았는가.

특히 레이어가 실행된다는 사실만으로 구현이 맞다고 판단하기 어렵다. 예를 들어 max 연산 자체는 쉽게 구현되지만 $\log p(k\mid z)$ 또는 $\log p(x\_{-k}\mid z,k)$를 누락해도 텐서 shape은 정상일 수 있다. 이 경우 생성 샘플은 나오더라도 논문이 정의한 likelihood contribution과 다른 모델이 된다.

## 한계와 생각해볼 점

구조와 실험 결과를 해석할 때는 다음 조건을 살펴야 한다.

다만 결과와 수식에서 확인되는 범위 안에서는 몇 가지 판단 지점을 구분할 수 있다.

첫째, 프레임워크가 다양한 변환을 포괄한다는 것과 모든 변환이 exact likelihood를 제공한다는 것은 다르다. Table 1에서 generative surjection과 stochastic transformation은 bound gap을 가진다. 모델을 조합할 때는 이름이 SurVAE Flow라는 사실보다 실제로 어떤 레이어가 포함됐는지를 봐야 한다.

둘째, 구조적 가정을 넣는 효과는 데이터와 맞을 때 평가해야 한다. Abs는 대칭성, Sort와 stochastic permutation은 순서 및 exchangeability, Max는 max pooling 구조를 모델에 넣는다. 이런 가정이 다른 데이터나 모달리티에서도 같은 효과를 낼지는 이 실험만으로 확인되지 않는다. 실험 근거는 synthetic 2D 데이터, SpatialMNIST, CIFAR-10, ImageNet32, ImageNet64에 한정된다.

셋째, 효율성의 정량적 이득은 판단할 자료가 없다. 차원을 줄이는 레이어가 후속 계산을 줄일 가능성은 있지만, 제거된 변수의 조건부분포를 계산하고 생성 시 표본화하는 비용도 생긴다. 하드웨어, 학습 시간, 메모리, 파라미터 수가 보고되지 않았으므로 MaxPoolFlow가 Baseline보다 계산 효율적이라고 단정할 수 없다.

넷째, 별도의 ablation이 없기 때문에 각 확률 항과 레이어 설계의 기여도를 분리하기 어렵다. Table 4와 Table 5는 Baseline과 MaxPoolFlow의 결과를 비교하게 해 주지만, max index 모델링과 나머지 값의 조건부분포가 각각 성능에 얼마나 영향을 주었는지는 알 수 없다.

그럼에도 SurVAE Flows의 유용한 관점은 남는다. 차원 축소나 정렬처럼 기존 flow의 전단사 조건을 깨뜨리는 연산을 무조건 모델 바깥으로 밀어내지 않고, 그 연산이 잃는 정보를 확률변수로 정의한 뒤 likelihood contribution을 계산할 수 있다. 이 논문에서 도출할 수 있는 설계 원칙은 간단하다.

> 비가역 연산을 넣고 싶다면, 무엇이 사라지는지 먼저 이름 붙이고 그 정보의 확률을 어느 항에서 계산할지 정해야 한다.
{: .prompt-tip }

이 원칙을 따르면 dequantization, augmentation, multi-scale slicing, abs, max, sort, stochastic permutation을 서로 단절된 기법이 아니라 같은 변환 언어 위에서 비교할 수 있다. 반대로 손실된 정보를 설명할 분포나 가능도 항을 정의하지 못한다면, 그 연산은 SurVAE Flow의 모듈로 완성되지 않은 것이다.
