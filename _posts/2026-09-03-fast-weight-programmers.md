---
title: "[논문 리뷰] Linear Transformers Are Secretly Fast Weight Programmers"
date: 2026-09-03 15:00:00 +0900
permalink: /posts/fast-weight-programmers/
categories:
  - AI
  - Paper Review
tags: [paper-review, linear-transformer, fast-weights, deltanet, delta-rule, efficient-attention, associative-memory]
description: "Linear attention을 입력이 매 순간 다시 쓰는 fast-weight memory로 해석하고, additive update의 용량·수정 한계를 delta rule과 DPFP로 보완한 ICML 2021 논문을 정리한다."
related: [deltanet, paper-review-transformer-variants, paper-review-transformer]
paper:
  authors: "Imanol Schlag, Kazuki Irie, Jürgen Schmidhuber"
  venue: "ICML 2021"
  url: "https://proceedings.mlr.press/v139/schlag21a.html"
  arxiv: "https://arxiv.org/abs/2102.11174"
  code: "https://github.com/ischlag/fast-weight-transformers"
---

## 세 줄 요약

linearized self-attention은 과거의 키와 값을 모두 보관하는 대신, 두 벡터의 외적을 누적한 행렬을 매 시점 갱신하는 Fast Weight Programmer로 해석할 수 있다.\
$d_{dot}$차원 메모리가 서로 다른 연상을 간섭 없이 저장하려면 변환된 키들이 직교해야 하므로, 완벽히 분리할 수 있는 연상의 수는 최대 $d_{dot}$개로 제한된다.  
이 논문은 기존 값을 먼저 읽고 오차만 수정하는 델타 규칙(delta rule), 합 정규화(sum normalisation), 결정론적 차원 확장인 DPFP를 결합해 가산 갱신의 용량과 수정 한계를 완화한다.

## 이 논문이 풀려는 문제

표준 Transformer의 self-attention은 길이 $L$인 시퀀스에서 $O(L^2)$의 연산을 요구하고, 과거 키와 값을 저장하는 메모리도 $L$에 따라 선형으로 늘어난다. 컨텍스트 윈도우가 길어질수록 비용이 빠르게 커지므로 실제 모델에서는 처리할 문맥 길이를 제한하게 된다.

linear Transformer 계열은 커널 특징 맵(feature map)을 사용해 연산 순서를 바꾼다. 모든 과거 키와 값을 별도로 유지하지 않고, 값과 변환된 키의 외적을 하나의 고정 크기 행렬에 누적한다. 이렇게 하면 시퀀스 길이에 대해 선형 시간과 상수 크기 상태를 얻을 수 있다.

문제는 이 고정 크기 상태가 무한한 메모리가 아니라는 점이다. 기존의 가산 규칙은 매번

$$
W^{(i)}
=
W^{(i-1)}
+
v^{(i)}\otimes\phi(k^{(i)})
\tag{17}
$$

만 수행한다. 새 연상을 계속 더하지만 이전 연상을 선택적으로 수정하거나 지우는 명령은 없다. 변환된 키들이 직교하지 않으면 한 키를 조회할 때 다른 키에 연결된 값까지 섞인다. $d_{dot}$차원 공간에서 간섭 없이 구분할 수 있는 서로 다른 연상의 수는 최대 $d_{dot}$개이므로, 더 긴 시퀀스에서는 초과용량 상태에 놓일 수 있다. 다만 시퀀스 길이가 $d_{dot}$보다 길다는 사실만으로 필연적인 초과용량 상태라고 단정할 수는 없다. 같은 키의 반복처럼 실제로 저장해야 하는 서로 다른 연상의 수를 함께 봐야 한다.

논문은 이 문제를 세 갈래로 나눈다.

첫째, linear Transformer의 상태 행렬이 사실상 빠른 가중치(fast weights)이며, linear attention은 오래된 Fast Weight Programmer의 특수한 형태라는 점을 보인다.

둘째, 가산식 대신 현재 저장값과 목표값의 오차를 계산해 수정하는 델타 규칙을 도입한다. 메모리를 무조건 키우기보다 필요한 연상을 덮어쓸 수 있게 만드는 변화다.

셋째, 특징 맵의 출력 차원 $d_{dot}$ 자체를 결정론적으로 확장하는 DPFP(Deterministic Parameter-Free Projection)를 제안한다. 이는 $\operatorname{ELU}+1$처럼 입력 차원을 그대로 유지하는 특징 맵보다 더 큰 연상 공간을 제공하면서, FAVOR+처럼 무작위 특징을 뽑아 출력 분산을 만들지 않는다.

## linear Transformer를 빠른 가중치로 읽기

### 고전적인 Fast Weight Programmer

Fast Weight Programmer에서는 학습을 통해 천천히 바뀌는 가중치와 입력에 따라 매 시점 즉시 바뀌는 가중치를 분리한다. 먼저 느린 네트워크가 입력 $x^{(i)}$로부터 두 활성화 패턴을 만든다.

$$
a^{(i)},b^{(i)}
=
W_a x^{(i)},W_b x^{(i)}
\tag{1}
$$

여기서 $W_a$와 $W_b$는 일반적인 학습 파라미터다. 반면 $a^{(i)}$와 $b^{(i)}$의 외적으로 갱신되는 $W^{(i)}$는 입력 시퀀스 안에서 바뀌는 빠른 가중치다.

$$
W^{(i)}
=
\sigma\left(
W^{(i-1)}
+
a^{(i)}\otimes b^{(i)}
\right)
\tag{2}
$$

외적 $a^{(i)}\otimes b^{(i)}$는 하나의 벡터를 다른 벡터와 연결하는 연상 메모리 항으로 볼 수 있다. 다음 출력은 이 빠른 가중치에 현재 입력을 곱해 얻는다.

$$
y^{(i)}
=
W^{(i)}x^{(i)}
\tag{3}
$$

느린 네트워크가 매 시점 어떤 행렬을 만들 것인지 프로그래밍하고, 만들어진 행렬이 실제 계산을 수행한다는 의미에서 programmer라는 이름이 붙는다.

### Softmax를 빼면 self-attention도 같은 형태가 된다

self-attention에서는 입력으로부터 키, 값, 쿼리를 만든다.

$$
k^{(i)},v^{(i)},q^{(i)}
=
W_kx^{(i)},W_vx^{(i)},W_qx^{(i)}
\tag{4}
$$

시점 $i$까지의 키와 값을 열 방향으로 모으면

$$
K^{(i)}
=
[K^{(i-1)},k^{(i)}]
\in\mathbb{R}^{d_{key}\times i},
\tag{5}
$$

$$
V^{(i)}
=
[V^{(i-1)},v^{(i)}]
\in\mathbb{R}^{d_{value}\times i}
\tag{6}
$$

가 된다. 표준 self-attention 출력은 시간 축에 softmax를 적용한

$$
y^{(i)}
=
V^{(i)}
\operatorname{softmax}
\left(
(K^{(i)})^\top q^{(i)}
\right)
\tag{7}
$$

이다. 논문에서는 $1/\sqrt{d_{key}}$ 스케일을 일반성을 잃지 않고 생략한다.

여기서 softmax를 제거하면 행렬 곱을 외적의 합으로 다시 쓸 수 있다.

$$
\begin{aligned}
y^{(i)}
&=
V^{(i)}(K^{(i)})^\top q^{(i)}\\
&=
\left(
\sum_{j=1}^{i}
v^{(j)}\otimes k^{(j)}
\right)
q^{(i)}.
\end{aligned}
\tag{8}
$$

괄호 안을 빠른 가중치로 정의하면

$$
W^{(i)}
=
\sum_{j=1}^{i}
v^{(j)}\otimes k^{(j)}
\tag{9}
$$

이고, 이는 다음 점화식과 같다.

$$
W^{(i)}
=
W^{(i-1)}
+
v^{(i)}\otimes k^{(i)}
\tag{10}
$$

출력은

$$
y^{(i)}
=
W^{(i)}q^{(i)}
\tag{11}
$$

로 계산된다. Eq. 10은 Eq. 2에서 활성화 함수 $\sigma$를 항등 함수로 놓고 $W_a=W_v$, $W_b=W_k$로 대응시킨 형태다. 따라서 softmax가 없는 self-attention은 외적을 누적해 빠른 가중치를 만들고 쿼리로 이를 읽는 FWP다.

이 등가성의 핵심은 단순히 두 수식의 모양이 비슷하다는 데 있지 않다. linear Transformer의 상태를 압축된 과거 토큰이 아니라 느린 네트워크가 입력마다 다시 쓰는 가중치 행렬로 읽으면, 가산 외에도 삭제나 오차 수정 같은 프로그래밍 명령을 설계할 수 있다.

## 커널 선형화와 상수 크기 상태

softmax attention은 커널 형태로 다음과 같이 풀어 쓸 수 있다.

$$
y^{(i)}
=
\frac{
\sum_{j=1}^{i}
v^{(j)}
\kappa(k^{(j)},q^{(i)})
}{
\sum_{j'=1}^{i}
\kappa(k^{(j')},q^{(i)})
},
\qquad
\kappa(k,q)
=
\exp(k\cdot q).
\tag{12}
$$

linear attention은 이 커널을 특징 맵의 내적으로 대체한다.

$$
\kappa'(k,q)
=
\phi(k)^\top\phi(q),
\qquad
\phi:
\mathbb{R}^{d_{key}}
\rightarrow
\mathbb{R}^{d_{dot}}.
$$

그러면 Eq. 12는

$$
y^{(i)}
=
\frac{
\sum_{j=1}^{i}
v^{(j)}
\phi(k^{(j)})^\top\phi(q^{(i)})
}{
\sum_{j'=1}^{i}
\phi(k^{(j')})\cdot\phi(q^{(i)})
}
\tag{13}
$$

이 된다. 결합법칙을 이용해 쿼리에 의존하는 항을 합 밖으로 꺼내면

$$
y^{(i)}
=
\frac{
\left(
\sum_{j=1}^{i}
v^{(j)}
\phi(k^{(j)})^\top
\right)
\phi(q^{(i)})
}{
\left(
\sum_{j'=1}^{i}
\phi(k^{(j')})
\right)
\cdot\phi(q^{(i)})
}.
\tag{14}
$$

이 변형이 계산량을 바꾼다. 분자의 누적 행렬과 분모의 누적 벡터를

$$
W^{(i)}
=
\sum_{j=1}^{i}
v^{(j)}
\otimes\phi(k^{(j)}),
\tag{15}
$$

$$
z^{(i)}
=
\sum_{j=1}^{i}
\phi(k^{(j)})
\tag{16}
$$

로 정의하면, 과거의 모든 키와 값을 다시 읽지 않고 다음 두 상태만 갱신하면 된다.

$$
W^{(i)}
=
W^{(i-1)}
+
v^{(i)}\otimes\phi(k^{(i)}),
\tag{17}
$$

$$
z^{(i)}
=
z^{(i-1)}
+
\phi(k^{(i)}).
\tag{18}
$$

최종 출력은

$$
y^{(i)}
=
\frac{
W^{(i)}\phi(q^{(i)})
}{
z^{(i)}\cdot\phi(q^{(i)})
}.
\tag{19}
$$

시퀀스가 길어져도 유지하는 상태는 $W^{(i)}\in\mathbb{R}^{d_{value}\times d_{dot}}$와 $z^{(i)}\in\mathbb{R}^{d_{dot}}$뿐이다. 대신 $d_{dot}$이 메모리 용량과 매 시점 계산량을 함께 결정하는 새로운 병목이 된다.

## 왜 메모리 용량이 $d_{dot}$에 묶이는가

Eq. 15에 키 $\phi(k^{(\ell)})$을 곱하면 다음 구조가 된다.

$$
W^{(i)}\phi(k^{(\ell)})
=
\sum_{j=1}^{i}
v^{(j)}
\left[
\phi(k^{(j)})^\top
\phi(k^{(\ell)})
\right].
$$

$j=\ell$인 항만 남으려면 서로 다른 변환 키의 내적이 0이어야 한다. 즉, 완벽한 검색을 위해서는 연상에 사용되는 키들이 서로 직교해야 한다. 키가 직교하지 않으면 다른 값 벡터가 내적 크기만큼 섞여 크로스토크와 검색 오차를 만든다.

$d_{dot}$차원 공간에서 서로 직교하는 0이 아닌 벡터는 최대 $d_{dot}$개이므로, 간섭 없이 분리할 수 있는 서로 다른 연상의 수도 최대 $d_{dot}$개다. 이는 시퀀스 길이 자체에 대한 경계가 아니라, 메모리가 동시에 구분해야 하는 연상의 수에 대한 경계다. 논문은 이 해석을 텐서 곱 표상(Tensor Product Representation)과 Smolensky의 크로스토크 및 검색 오류에 관한 정리와 연결한다. 논문 자체에는 별도의 번호가 붙은 Lemma나 Theorem이 없지만, 이 직교성 논증이 뒤의 설계와 실험을 묶는 중심 이론이다.

![연상 수가 내적 공간의 용량에 접근할 때 나타나는 검색 오차](/assets/img/posts/fast-weight-programmers/figure2.png){: w="700" }
_그림 1. Linear 및 DPFP 모델에서는 서로 다른 연상의 수가 각 모델의 $d_{dot}$ 한계에 접근하면서 검색 오차가 증가한다. 특징 맵은 저장 가능한 직교 연상의 수를 결정한다._

가산 규칙의 문제는 용량뿐만이 아니다. 같은 키에 새 값을 연결해도 기존 값을 명시적으로 제거하지 않기 때문에 오래된 값과 새로운 값이 함께 남는다. 따라서 논문은 차원을 늘리는 DPFP와 별도로 기존 연상을 수정하는 델타 규칙을 도입한다.

## 델타 규칙 — 새 값을 더하지 말고 오차를 수정하기

### 현재 메모리의 예측을 먼저 읽는다

현재 키가 이미 어떤 값에 연결되어 있는지를 이전 메모리에서 조회한다.

$$
\bar{v}^{(i)}
=
W^{(i-1)}
\phi(k^{(i)}).
\tag{20}
$$

그다음 느린 네트워크가 현재 입력으로부터 쓰기 강도(write-strength)를 만든다.

$$
\beta^{(i)}
=
\sigma(W_\beta x^{(i)}),
\qquad
\beta^{(i)}
\in[0,1].
\tag{21}
$$

$W_\beta\in\mathbb{R}^{1\times d}$이며, $\beta^{(i)}$는 현재 입력에 직접 의존한다. 다층 모델에서는 첫 레이어를 제외한 $x^{(i)}$가 이전 레이어에서 얻은 전체 문맥 정보를 포함하므로 상위 레이어의 쓰기 강도는 문맥을 반영할 수 있다.

새로 쓸 값은 목표값과 기존 조회값의 볼록 결합이다.

$$
v_{new}^{(i)}
=
\beta^{(i)}v^{(i)}
+
(1-\beta^{(i)})
\bar{v}^{(i)}.
\tag{22}
$$

$\beta^{(i)}=0$이면 기존 연상을 유지하고, $\beta^{(i)}=1$이면 현재 목표값으로 완전히 수정하는 방향이다.

### 쓰기와 삭제를 하나의 오차 수정으로 묶는다

메모리 갱신을 쓰기와 삭제로 분리하면

$$
W^{(i)}
=
W^{(i-1)}
+
\underbrace{
v_{new}^{(i)}
\otimes
\phi(k^{(i)})
}_{\text{write}}
-
\underbrace{
\bar{v}^{(i)}
\otimes
\phi(k^{(i)})
}_{\text{remove}}
\tag{23}
$$

가 된다. 기존 키에 연결된 값을 제거한 뒤 같은 키에 보간된 새 값을 쓰는 구조다.

Eq. 22를 대입하면 두 항은 다음 델타 규칙으로 정리된다.

$$
W^{(i)}
=
W^{(i-1)}
+
\beta^{(i)}
\left(
v^{(i)}
-
\bar{v}^{(i)}
\right)
\otimes
\phi(k^{(i)}).
\tag{24}
$$

여기서 $v^{(i)}-\bar{v}^{(i)}$는 현재 메모리의 검색 오차다. 이미 목표값을 정확히 저장했다면 오차가 0이므로 같은 내용을 다시 더하지 않는다. 순수 가산식이 입력마다 메모리의 크기를 계속 밀어 올리는 것과 다른 지점이다.

정규화를 사용하지 않는 출력은

$$
y^{(i)}
=
W^{(i)}
\phi(q^{(i)})
\tag{25}
$$

이다.

### Attention normalisation과 sum normalisation은 다른 정규화다

기존 linear attention의 attention normalisation을 유지하려면 누적자

$$
z^{(i)}
=
z^{(i-1)}
+
\phi(k^{(i)}),
\qquad
z^{(0)}=0
\tag{26}
$$

를 관리한다. 현재 키에 저장된 값을 읽을 때는

$$
\bar{v}^{(i)}
=
\frac{
W^{(i-1)}
\phi(k^{(i)})
}{
z^{(i-1)}
\cdot
\phi(k^{(i)})
}
\tag{27}
$$

를 사용하며, 첫 시점에는 $\bar{v}^{(1)}=0$으로 둔다. 출력은

$$
y^{(i)}
=
\frac{
W^{(i)}
\phi(q^{(i)})
}{
z^{(i)}
\cdot
\phi(q^{(i)})
}.
\tag{28}
$$

하지만 긴 시퀀스에서는 $z^{(i)}$가 계속 커져 수치 불안정을 만들 수 있다. 논문이 별도로 제안하는 sum normalisation은 누적자 기반 정규화가 아니라 각 특징 벡터의 성분 합을 1로 맞추는 방식이다.

$$
\phi'(q^{(i)})
=
\frac{
\phi(q^{(i)})
}{
\sum_{j=1}^{d_{dot}}
\phi(q^{(i)})_j
}.
\tag{29}
$$

키에도 같은 정규화를 적용한다. 실험에서는 이 합 정규화를 제거한 Delta Network가 모두 발산했으므로, 선택적인 후처리가 아니라 델타 갱신을 안정화하는 핵심 구성 요소로 보아야 한다.

## 합 정규화가 필요한 이유

부록은 Eq. 29가 쓰기와 삭제의 크기를 어떻게 맞추는지를 행렬의 열 단위로 전개한다. 임의의 행렬을 데카르트 기저 $e^{(i)}$로 쓰면

$$
W
=
\sum_{i=1}^{d_{key}}
w^{(i)}
\otimes
e^{(i)}.
\tag{41}
$$

키 $k$로 현재 값을 조회하고 델타 갱신을 적용하면

$$
\bar{v}
=
Wk
\tag{42}
$$

와

$$
W'
=
W
+
(v-\bar{v})
\otimes k
\tag{43}
$$

를 얻는다. 키를 $k=\sum_i k_i e^{(i)}$로 전개하면 Eq. 43은

$$
W'
=
W
+
(v-\bar{v})
\otimes
\sum_{i=1}^{d_{key}}
k_i e^{(i)}
\tag{44}
$$

이고, 외적의 선형성에 의해

$$
W'
=
W
+
\sum_{i=1}^{d_{key}}
k_i(v-\bar{v})
\otimes
e^{(i)}
\tag{45}
$$

가 된다. Eq. 41을 대입해 동일한 기저끼리 묶으면

$$
W'
=
\sum_{i=1}^{d_{key}}
w^{(i)}
\otimes
e^{(i)}
+
\sum_{i=1}^{d_{key}}
k_i(v-\bar{v})
\otimes
e^{(i)}
\tag{46}
$$

$$
\begin{aligned}
&=
\sum_{i=1}^{d_{key}}
\left[
w^{(i)}
+
k_i(v-\bar{v})
\right]
\otimes
e^{(i)}.
\end{aligned}
\tag{47}
$$

따라서 각 열은

$$
w'^{(i)}
=
w^{(i)}
+
k_i(v-\bar{v})
\tag{48}
$$

로 갱신된다. 한편 조회값은

$$
\bar{v}
=
Wk
=
W
\sum_{j=1}^{d_{key}}
k_j e^{(j)}
=
\sum_{j=1}^{d_{key}}
k_jw^{(j)}
\tag{49}
$$

이므로,

$$
w'^{(i)}
=
w^{(i)}
+
k_i
\left(
v
-
\sum_{j=1}^{d_{key}}
k_jw^{(j)}
\right)
\tag{50}
$$

$$
\begin{aligned}
&=
w^{(i)}
+
k_iv
-
\sum_{j=1}^{d_{key}}
k_ik_jw^{(j)}.
\end{aligned}
\tag{51}
$$

여기서 양의 쓰기 항은 $k_i v$이고 삭제 항의 전체 가중치는 $\sum_j k_i k_j$다. 둘의 스케일이 맞으려면

$$
\sum_{j=1}^{d_{key}}
k_i k_j
=
k_i,
$$

즉,

$$
\sum_{j=1}^{d_{key}}
k_j
=
1
$$

이어야 한다. 키 성분의 합을 1로 만드는 sum normalisation이 필요한 이유다. 이 조건이 없으면 쓰기와 삭제가 서로 다른 크기로 작동해 상태가 안정적으로 수정되지 않을 수 있다.

부록 A.1의 Eq. 38~40은 델타 규칙 자체도 같은 방식으로 확인한다.

$$
W^{(i)}
=
W^{(i-1)}
+
\left(
v_{new}^{(i)}
-
\bar{v}^{(i)}
\right)
\otimes
\phi(k^{(i)})
\tag{38}
$$

$$
v_{new}^{(i)}
-
\bar{v}^{(i)}
=
\beta^{(i)}v^{(i)}
+
(1-\beta^{(i)})
\bar{v}^{(i)}
-
\bar{v}^{(i)}
\tag{39}
$$

$$
\begin{aligned}
&=
\beta^{(i)}
\left(
v^{(i)}
-
\bar{v}^{(i)}
\right).
\end{aligned}
\tag{40}
$$

Eq. 40을 Eq. 38에 넣으면 본문의 Eq. 24가 그대로 나온다. 별도의 근사를 사용한 유도가 아니라 쓰기와 삭제를 대수적으로 묶은 결과다.

## 다른 게이트 규칙과 무엇이 다른가

비교 대상인 Peng et al.의 갱신식은

$$
W^{(i)}
=
(1-\beta^{(i)})
W^{(i-1)}
+
\beta^{(i)}
v^{(i)}
\otimes
\phi(k^{(i)})
\tag{52}
$$

이다. 이 식은 새로운 연상을 쓸 때 이전 행렬 전체에 $(1-\beta^{(i)})$를 곱한다.

두 직교 연상이 저장된

$$
W
=
v_1\otimes k_1
+
v_2\otimes k_2
\tag{53}
$$

를 생각해 보자. 새 키 $k_3$가 $k_2$와 같을 때 바꾸고 싶은 것은 $k_2$에 연결된 값뿐이다. Peng 규칙과 제안된 델타 규칙 모두 $k_3=k_2$ 방향의 값을

$$
W'k_2
=
(1-\beta)v_2
+
\beta v_3
$$

로 갱신한다.

차이는 무관한 키에서 나타난다. Eq. 52의 Peng 규칙은 이전 행렬 전체를 감쇠시키므로

$$
W'k_1
=
(1-\beta)v_1
$$

이 된다. 반면 Eq. 24의 델타 규칙은 현재 키 방향의 오차만 외적으로 갱신하므로

$$
W'k_1
=
v_1
$$

을 유지한다. 델타 규칙의 장점은 단순한 게이트 추가가 아니라 수정할 키와 무관한 연상을 보존하는 국소성에 있다.

## DPFP — 무작위성 없이 내적 공간 넓히기

### 기존 특징 맵의 한계

Katharopoulos et al.의 특징 맵은 요소별로

$$
\phi(x)
=
\operatorname{ELU}(x)+1
=
\begin{cases}
x+1,&x>0\\
\exp(x),&x\le0
\end{cases}
\tag{30}
$$

을 적용한다. 양수성 조건을 만족하지만 출력 차원은 입력과 같은 $d_{dot}=d_{key}$다. 따라서 특징 맵 자체가 메모리의 직교 차원을 늘리지는 않는다.

FAVOR+는 먼저

$$
h(x)
=
\frac{1}{\sqrt{2}}
\exp\left(
-\frac{\lVert x\rVert^2}{2}
\right)
\tag{31}
$$

를 정의하고,

$$
\phi(x)
=
\frac{h(x)}{\sqrt{m}}
\begin{bmatrix}
\exp(Rx)\\
\exp(-Rx)
\end{bmatrix}
\tag{32}
$$

로 softmax 커널을 근사한다. $R\in\mathbb{R}^{m\times d_{key}}$의 각 행은 $\mathcal{N}(0,I_{d_{key}})$에서 뽑으며 출력 차원은 $d_{dot}=2m$이다. 학습 중에는 미니배치마다 특징을 다시 뽑고 평가에서는 한 세트를 고정한다. $m$을 키우면 근사 공간을 넓힐 수 있지만 무작위 샘플링이 출력 분산과 추가 복잡도를 만든다. 제시된 선택 기준은 $m$을 $d_{key}\log(d_{key})$ 차수로 두는 것이다.

### 부호 조합을 분리하는 2-팩터 특징

DPFP는 무작위 투영 대신 양수부와 음수부의 곱을 사용한다. $r(a)=\max(0,a)$라 두면 2차원 키는 네 특징으로 매핑된다.

$$
\phi_1(k)
=
r(k_1)r(k_2),
\tag{33}
$$

$$
\phi_2(k)
=
r(-k_1)r(k_2),
\tag{34}
$$

$$
\phi_3(k)
=
r(k_1)r(-k_2),
\tag{35}
$$

$$
\phi_4(k)
=
r(-k_1)r(-k_2).
\tag{36}
$$

각 특징은 서로 다른 부호 조합에서 활성화된다. 같은 2차원 평면을 보더라도 부호 패턴을 분리된 좌표에 배치하므로 원래 공간보다 직교 연상을 만들 여지가 커진다.

![DPFP가 2차원 입력을 네 개의 정류 특징으로 분리하는 과정](/assets/img/posts/fast-weight-programmers/figure1.png){: w="500" }
_그림 2. 양수부와 음수부의 2-팩터 곱이 서로 다른 활성 영역을 만들고, 2차원 입력을 4차원 특징으로 옮긴다._

일반화된 DPFP는 $[k;-k]$에서 일정 거리만큼 떨어진 성분을 곱한다.

$$
\phi_i^\nu(k)
=
r\left(
\begin{bmatrix}
k\\
-k
\end{bmatrix}_i
\right)
r\left(
\begin{bmatrix}
k\\
-k
\end{bmatrix}_{i+\nu}
\right),
\tag{37}
$$

여기서 $i\in[1,2d_{key}]$이고 $\nu\in\{1,\ldots,d_{key}/2-1\}$이다. 여러 shift를 연결하면

$$
d_{dot}
=
2d_{key}\nu
$$

가 된다. $\nu$를 늘릴수록 저장 공간은 넓어지지만 빠른 가중치의 열 수도 함께 늘어난다. 따라서 DPFP는 용량을 무료로 늘리는 장치가 아니라, 무작위성 대신 결정론적 계산과 더 큰 상태를 지불하는 선택이다.

## 구현 관점에서

### DPFP 특징 맵

부록의 구현은 Eq. 37을 그대로 벡터 연산으로 옮긴다.

```python
def dpfp(x, nu):
    # x: (..., d_key)
    x = concat([relu(x), relu(-x)], dim=-1)
    # x: (..., 2 * d_key)

    x_rolled = concat(
        [roll(x, shifts=j, dim=-1) for j in range(1, nu + 1)],
        dim=-1,
    )
    # x_rolled: (..., 2 * d_key * nu)

    x_repeat = concat([x] * nu, dim=-1)
    # x_repeat: (..., 2 * d_key * nu)

    return x_repeat * x_rolled
    # (..., d_dot), d_dot = 2 * d_key * nu
```

구현에서 확인할 첫 지점은 출력 차원이다. shift마다 $2d_{key}$개의 특징이 생기므로 최종 차원은 반드시 $2d_{key}\nu$여야 한다. roll 범위를 `1`부터 `nu`까지 잡는 부분도 Eq. 37의 shift 정의와 맞아야 한다.

### 델타 메모리의 순차 갱신

다음은 sum normalisation을 사용하고 attention normalisation은 사용하지 않는 핵심 순환을 식에서 직접 옮긴 의사코드다.

```python
# x:       (B, L, d)
# W:       (B, d_value, d_dot)
# W_beta:  (1, d)
W = zeros(B, d_value, d_dot)

for i in range(L):
    x_i = x[:, i, :]                  # (B, d)

    k = project_key(x_i)              # (B, d_key)
    v = project_value(x_i)            # (B, d_value)
    q = project_query(x_i)            # (B, d_key)
    beta = sigmoid(project_beta(x_i)) # (B, 1)

    phi_k = feature_map(k)            # (B, d_dot)
    phi_q = feature_map(q)            # (B, d_dot)

    phi_k = phi_k / sum(phi_k, dim=-1, keepdim=True)
    phi_q = phi_q / sum(phi_q, dim=-1, keepdim=True)

    v_old = matvec(W, phi_k)          # (B, d_value)
    error = v - v_old                 # (B, d_value)

    W = W + outer(beta * error, phi_k)
    # outer: (B, d_value, 1) * (B, 1, d_dot)
    # W:     (B, d_value, d_dot)

    y_i = matvec(W, phi_q)            # (B, d_value)
```

Eq. 20은 반드시 갱신 전의 $W^{(i-1)}$로 계산해야 한다. 먼저 $W$를 갱신한 뒤 `v_old`를 조회하면 Eq. 24와 다른 알고리즘이 된다. 또한 `beta`는 값 차원 전체에 적용되는 스칼라이므로 브로드캐스트 축을 잘못 잡아 특징 차원별 게이트처럼 사용하지 않도록 주의해야 한다.

Sum normalisation의 분모는 특징 성분의 합이다. 추출본에는 분모가 0에 가까운 경우의 별도 안정화 방식이 제시되어 있지 않으므로, 실제 구현에서는 특징 맵의 출력과 분모 처리 방식을 원 구현과 대조해야 한다. 임의의 안정화 항을 추가하면 수식과 다른 모델이 될 수 있다.

Attention normalisation을 사용하는 변형은 별도의 $z$ 상태가 필요하다.

```python
W = zeros(B, d_value, d_dot)
z = zeros(B, d_dot)

for i in range(L):
    phi_k = feature_map(k_i)          # (B, d_dot)
    phi_q = feature_map(q_i)          # (B, d_dot)

    if i == 0:
        v_old = zeros(B, d_value)
    else:
        denom_read = dot(z, phi_k)    # (B, 1)
        v_old = matvec(W, phi_k) / denom_read

    W = W + outer(beta_i * (v_i - v_old), phi_k)
    z = z + phi_k

    denom_out = dot(z, phi_q)         # (B, 1)
    y_i = matvec(W, phi_q) / denom_out
```

첫 시점의 $\bar v^{(1)}=0$ 경계를 놓치면 0으로 초기화된 $z^{(0)}$ 때문에 바로 0으로 나누게 된다. 조회에는 갱신 전 $z^{(i-1)}$를, 출력에는 갱신 후 $z^{(i)}$를 사용한다는 순서도 중요하다.

### 학습과 순차 추론은 상태를 다르게 다룬다

학습에서는 느린 가중치 $W_k,W_v,W_q,W_\beta$를 역전파로 최적화한다. 빠른 가중치 $W^{(i)}$는 optimizer가 직접 갱신하는 파라미터가 아니라 시퀀스 안에서 Eq. 24를 반복해 생성되는 상태다.

자동 미분으로 모든 $W^{(i)}$를 저장하면 스텝별 행렬이 GPU 메모리에 남아 메모리를 초과할 수 있다. 논문은 기존 공개 CUDA 커널을 수정해 역전파 중 빠른 가중치를 재계산하고, 한 개의 가중치만 저장하는 방식을 사용했다. 계산을 다시 하는 대신 활성 상태 메모리를 줄이는 체크포인팅과 유사한 트레이드오프다.

비절단 문맥 실험에서는 이전 학습 세그먼트의 빠른 가중치를 다음 세그먼트로 이월하지만 역전파 범위는 각 384단어 세그먼트 안으로 제한한다. 따라서 상태 전달과 그래디언트 전달을 같은 것으로 취급하면 안 된다.

순차 추론이나 언어 생성에서는 이전 시점의 $W$를 다음 시점으로 넘기기만 하면 된다.

```text
초기 상태 W^(0) = 0
각 입력 또는 생성 시점 i:
  1. 느린 네트워크로 k, v, q, beta 계산
  2. 갱신 전 W에서 현재 키의 기존 값 조회
  3. 오차 beta * (v - v_old) 계산
  4. W를 한 번 갱신
  5. 갱신된 W에서 q에 대한 출력 계산
  6. W만 다음 시점으로 전달
```

논문 추출본에는 출력 분포에서 다음 토큰을 선택하는 별도의 샘플링 규칙이 없다. 이 글에서의 추론 루프는 빠른 가중치 메모리의 갱신 부분만을 뜻한다.

## 실험 설정

### 합성 검색 태스크

각 값 $v(i)$에는 $\mathbb{R}^{S}$의 고정 원-핫 벡터 $v^{(i)}$가 할당되며 값 전체는 정규직교 기저를 이룬다. 키 임베딩은 학습 가능한 함수 $e:\mathcal K\rightarrow\mathbb R^{d_{emb}}$에서 얻는다. 쓰기 키와 쿼리는 각각

$$
k
=
W_K[e(k);v],
\qquad
q
=
W_Qe(q)
$$

로 생성된다. $L$번의 쓰기 후 메모리에서 $\hat v\in\mathbb R^S$를 읽으며 손실은

$$
l(\hat v,v^*)
=
\sum_{j=1}^{S}
\frac{1}{2}
(v_j^*-\hat v_j)^2
$$

이다. 평가는 20개 시퀀스를 뽑아 가능한 모든 쿼리를 검사한다. 예를 들어 $S=100$이면 평가 배치는 $100\times20=2000$개다. 별도 언급이 없는 optimizer 하이퍼파라미터에는 Adam의 기본값을 사용한다.

Setting 1은 메모리 용량을 확인한다. 키를 복원 없이 뽑고 $L=S$로 두며, $S$를 20에서 600까지 20씩 늘린다. 미니배치 크기는 32이고 평가 손실이 0.001보다 작아지거나 1000스텝 동안 진전이 없을 때까지 학습한다.

Linear-Attention은 $d_{key}=d_{dot}=64$이며, 연상이 60개 이상이 되자 오차가 누적되기 시작했다. DPFP-1, DPFP-2, DPFP-3도 각각 $d_{dot}=128,256,384$인 용량 한계 부근에서 오차가 증가했다. FAVOR+는 모든 설정에서 손실 0에 도달하지 못했고, softmax attention은 가장 높은 용량을 보였지만 500개가 넘는 키에서는 완전 수렴에 어려움을 겪었다. 부록의 Figure 4는 이 실험을 600개 고유 키·값까지 확장한 학습 곡선으로 제시한다.

Setting 2는 같은 키의 값을 수정하는 능력을 본다. 복원 추출로 $S=20$개의 고유 키·값을 사용하고 시퀀스 길이를 $L=2S=40$으로 둔다. 목표는 중복 키가 나왔을 때 가장 최근 값을 검색하는 것이다.

![같은 키가 반복되는 환경에서 갱신 규칙별 학습 곡선](/assets/img/posts/fast-weight-programmers/figure3.png){: w="700" }
_그림 3. 순수 가산 규칙은 이전 값을 지우지 못하지만, DPFP-1과 sum normalisation을 결합한 델타 규칙은 가장 낮은 평가 손실로 빠르게 수렴한다._

$\tanh$를 사용하는 이전 FWP 구조와 sum normalisation 없이 DPFP-1만 적용한 변형보다, 델타 규칙과 DPFP-1 및 sum normalisation을 결합한 모델이 가장 낮은 손실로 수렴했다. 부록의 추가 실험은 고유 키 수를 20에서 200까지 바꾼 최종 평가 손실을 제시한다. FAVOR+와 델타 규칙을 함께 사용한 경우에는 NaN이 발생해 해당 비교에서 제외됐다.

### WMT14 영어-독일어 번역

번역 실험은 FAIRSEQ 기반 Transformer “big” 구성으로 수행했다. 인코더와 디코더는 각각 6레이어이며 은닉 차원 1024, 16개 헤드, FFN 차원 4096, 32K BPE를 사용한다. 3개의 V100 GPU에서 GPU당 최대 3584토큰을 처리하고, 16배치 그래디언트 누적과 45에포크 학습을 적용했다. 학습에는 약 4일이 걸렸으며 검증 BLEU로 최적 모델을 선택했다. 모델 평균이나 모델별 튜닝은 사용하지 않았다.

| Model | Valid $d_{dot}=64$ | Valid $d_{dot}=256$ | Valid $d_{dot}=512$ | Test $d_{dot}=64$ | Test $d_{dot}=256$ | Test $d_{dot}=512$ |
|---|---:|---:|---:|---:|---:|---:|
| Standard | 26.6 | - | - | 27.7 | - | - |
| Linear | 25.5 | - | - | 26.8 | - | - |
| Performer | 24.2 | 24.9 | 26.7 | 24.4 | 25.3 | 27.7 |
| DPFP | - | 26.2 | 26.2 | - | 26.9 | 27.1 |

DPFP는 $d_{dot}=256$에서 검증 26.2, 테스트 26.9를 기록해 Linear Transformer의 25.5/26.8보다 개선됐다. Performer는 차원을 64에서 512로 늘리며 24.2/24.4에서 26.7/27.7까지 좋아졌고, DPFP는 256에서 512로 늘려도 26.2/26.9에서 26.2/27.1로 변화가 작았다. 표준 Transformer의 테스트 BLEU 27.7에는 DPFP가 미치지 못했다.

$d_{key}=64$인 이 실험에서 특징 차원과 하이퍼파라미터의 관계는 다음과 같다.

| $d_{dot}$ | 256 | 384 | 512 |
|---|---:|---:|---:|
| Performer $m$ | 128 | 192 | 256 |
| DPFP $\nu$ | 2 | 3 | 4 |

동일한 $d_{dot}$을 만들 때 Performer는 무작위 특징 수 $m$을, DPFP는 shift 수 $\nu$를 조절한다.

### WikiText-103 언어 모델링

WikiText-103은 학습 28K개 기사와 103M단어, 검증 60개 기사와 218K단어, 테스트 60개 기사와 246K단어로 구성되며 어휘 크기는 약 268K다.

제한 문맥 실험에서는 학습 텍스트를 길이 $L$의 독립 세그먼트로 나눠 역전파한다. 평가는 배치 크기 1의 길이 $L$ 슬라이딩 윈도우로 수행한다. 첫 세그먼트에서는 모든 위치를 평가하지만 이후 윈도우에서는 마지막 위치만 perplexity 계산에 사용한다.

언어 모델은 $D=H d_{dot}$의 관계를 사용하며 헤드 수 $H=8$, FFN 차원 2048, 16개 레이어로 구성된다. Small 구성은 $D=128$, $L=256$, 약 40M 파라미터이며 배치 96개 시퀀스로 약 120에포크 학습한다. Medium은 $D=256$, $L=384$, 약 90M 파라미터이며 배치 56개로 약 70에포크 학습한다. 두 설정 모두 V100 GPU 2개에서 4일 미만 학습했고, Adam의 학습률은 0.00025, 웜업은 2000스텝, 드롭아웃은 10%다. Performer의 무작위 특징 수는 Small에서 $m=8$, Medium에서 $m=16$이다.

| Model | Update Rule | small Valid | small Test | medium Valid | medium Test |
|---|---|---:|---:|---:|---:|
| Transformer | - | 33.0 | 34.1 | 27.9 | 29.6 |
| Linear Transformer | sum | 37.1 | 38.3 | 31.1 | 33.0 |
| Delta Network | delta | 34.1 | 35.5 | 29.7 | 31.5 |
| Performer | sum | 39.0 | 39.6 | 32.2 | 33.8 |
| Performer | delta | 36.1 | 37.2 | 30.0 | 31.8 |

Linear Transformer는 Small 테스트 38.3에서 Delta Network 35.5로, Medium 테스트 33.0에서 31.5로 개선됐다. Performer도 Small/Medium 테스트에서 가산 규칙의 39.6/33.8이 델타 규칙의 37.2/31.8로 낮아졌다. 델타 규칙의 추가 게이트 파라미터는 Small 16K, Medium 33K로 전체 모델 크기에 비해 작다. 다만 표준 Transformer의 테스트 34.1과 29.6에는 각각 미치지 못했다.

정규화와 위치 인코딩의 조합은 다음과 같다.

| Position Encoding | Attention Normalisation | Valid | Test |
|---|---|---:|---:|
| Yes | Yes | 30.4 | 32.1 |
| No | Yes | 29.2 | 31.2 |
| Yes | No | 29.7 | 31.5 |
| No | No | 28.1 | 31.1 |

Sum normalisation이 적용된 상태에서는 위치 인코딩과 attention normalisation을 모두 제거한 구성이 검증 28.1, 테스트 31.1로 가장 좋았다. 위치 인코딩이 있는 29.7/31.5보다 개선됐고, attention normalisation을 추가한 29.2/31.2보다도 소폭 좋았다.

비절단 문맥 실험에서는 세그먼트 사이로 fast-weight memory를 계속 넘기되 역전파는 384단어 세그먼트 내부로 제한했다. Delta Network에서는 위치 인코딩과 attention normalisation을 모두 제거했다.

| Model | Prms. in M | State size in M | Valid | Test |
|---|---:|---:|---:|---:|
| Linear Transformer | 89.8 | 0.13 | >260 | >260 |
| Delta Network | 89.9 | 0.13 | 27.8 | 29.4 |
| Transformer-XL | 90.9 | 0.13 | 65.7 | 65.5 |
| Transformer-XL | 90.9 | 1.05 | 29.3 | 30.1 |
| Transformer-XL | 90.9 | 2.10 | 26.4 | 27.4 |
| Transformer-XL | 90.9 | 6.29 | 24.6 | 25.5 |

같은 0.13M 상태에서 Linear Transformer는 260을 넘었고 Transformer-XL은 65.7/65.5였지만, Delta Network는 27.8/29.4였다. Attention normalisation을 제거한 Linear Transformer는 이 환경에서 perplexity가 1600 이상으로 더 치솟았다.

여기서 0.13M은 학습 가능한 파라미터 수가 아니라 평가 중 유지되는 state size다. Table 4의 학습 가능한 파라미터 수는 Linear Transformer가 89.8M, Delta Network가 89.9M이다.

반대로 Transformer-XL은 상태 크기를 1.05M, 2.10M, 6.29M으로 늘리면서 테스트 perplexity를 30.1, 27.4, 25.5로 낮췄다. Delta Network가 작은 고정 상태에서 효율적이라는 결과와 충분히 큰 상태를 허용한 Transformer-XL의 절대 성능이 더 좋다는 결과를 함께 읽어야 한다.

부록의 상태 크기 계산에서 Linear Transformer와 Delta Network는 레이어당

$$
8\text{ heads}
\times
32\text{ key dim}
\times
32\text{ value dim}
=
8192
$$

개의 상태를 가지며, 16레이어에서는 약 $0.13\times10^6$개의 평가 상태가 된다.

Transformer-XL의 평가 설정에서 memory/target segment length와 상태 크기의 대응은 다음과 같다.

| Memory/Target segment length | State size |
|---|---:|
| 15/1 | 0.13M |
| 64/64 | 1.05M |
| 128/128 | 2.10M |
| 384/384 | 6.29M |

Transformer-XL은 학습 시 비교 모델과 같은 384단어 역전파 범위를 맞추기 위해 memory와 target segment length를 모두 384로 두었고, 평가에서는 위와 같이 segment length를 바꿨다.

## 무엇이 성능을 만들었나

### 델타 규칙은 초과용량 밖에서도 유효했다

$d_{dot}=256$으로 이미 비-초과용량 상태인 Small 설정에서도 델타 규칙은 성능을 개선했다.

| Model | Update Rule | Valid | Test |
|---|---|---:|---:|
| Transformer | - | 33.0 | 34.1 |
| Performer | sum | 38.0 | 38.8 |
| Performer | delta | 36.0 | 37.0 |
| DPFP | sum | 37.7 | 38.8 |
| DPFP | delta | 33.9 | 35.0 |

Performer는 38.0/38.8에서 36.0/37.0으로, DPFP는 37.7/38.8에서 33.9/35.0으로 개선됐다. 따라서 델타 규칙의 효과를 단순히 $d_{dot}$보다 많은 연상을 담는 상황에만 한정하기는 어렵다. 같은 키에 연결된 값을 수정하고 불필요한 누적을 줄이는 성질도 성능에 기여한 것으로 해석할 수 있다.

반면 $\nu=2$ 또는 $m=32$로 $d_{dot}$을 두 배 늘렸을 때는 추가 이득이 없었다. 이미 $d_{dot}=256$으로 용량이 충분한 조건에서는 차원 확장이 자동으로 성능 향상으로 이어지지 않았다.

### Sum normalisation은 안정성 조건이었다

Sum normalisation을 제거한 모든 Delta Network는 학습 중 발산했다. 부록의 Eq. 41~51은 이 결과를 쓰기와 삭제 항의 가중치 균형으로 설명한다. 실험 결과와 수학적 유도가 같은 설계 결정을 지지한다.

### Attention normalisation은 추가할수록 좋은 구성 요소가 아니었다

Sum normalisation을 사용한 상태에서 attention normalisation을 추가하면 검증 perplexity가 28.1에서 29.2로, 테스트 perplexity가 31.1에서 31.2로 변했다. 비절단 문맥에서는 누적자 $z^{(i)}$가 계속 증가해 수치 불안정의 원인이 됐다. 기존 linear attention에서 필요했던 정규화가 델타 규칙과 sum normalisation을 결합한 모델에서도 반드시 유리한 것은 아니었다.

### 절대 위치 인코딩도 제거하는 편이 나았다

Attention normalisation이 없는 조건에서 절대 위치 인코딩을 제거하면 검증 perplexity가 29.7에서 28.1로, 테스트 perplexity가 31.5에서 31.1로 개선됐다. 이 실험 범위에서는 fast-weight 상태 갱신 자체가 순서를 따라 진행되므로 별도의 절대 위치 인코딩이 이득을 주지 않았다.

## 비용과 트레이드오프

표준 self-attention은 시퀀스 길이에 대해 $O(L^2)$ 계산을 사용하고, 과거 키와 값을 저장하는 상태가 $O(L)$로 증가한다. linear attention과 Delta Network는 매 시점 $d_{value}\times d_{dot}$ 행렬을 갱신하므로 전체 시간은 시퀀스 길이에 선형이고 순차 추론의 상태 크기는 길이와 무관하다.

그러나 실제 비용은 $d_{dot}$에 비례한다. DPFP에서 $d_{dot}=2d_{key}\nu$이므로 $\nu$를 키우면 이론적 메모리 용량뿐 아니라 빠른 가중치의 크기, 외적 갱신량, 역전파 재계산 비용도 함께 증가한다. FAVOR+ 역시 $d_{dot}=2m$이므로 $m$을 늘리면 근사 품질과 비용 사이의 교환이 생긴다.

WikiText-103 Small 언어 모델에서 측정한 추론 처리량과 GPU 메모리는 다음과 같다.

- Linear Transformer의 가산 규칙: 66K words/sec, 13GB
- Delta Network: 63K words/sec, 14GB
- 표준 Transformer의 PyTorch 구현: 33K words/sec, 17GB
- Table 5 조건의 DPFP 모델: 63K words/sec
- 같은 조건의 Performer 모델: 57K words/sec

Delta Network는 순수 가산 Linear Transformer보다 처리량이 66K에서 63K words/sec로 낮아지고 메모리는 13GB에서 14GB로 증가했다. 그 대가로 WikiText-103 perplexity와 긴 문맥 안정성이 개선됐다. 표준 Transformer보다는 약 두 배에 가까운 처리량을 보였고 GPU 메모리도 적게 사용했다.

학습 비용도 가볍다고 보기는 어렵다. 번역 모델은 V100 세 장에서 약 4일, 언어 모델은 V100 두 장에서 4일 미만 학습했다. 자동 미분으로 빠른 가중치 전체를 저장할 수 없어 커스텀 CUDA 역전파가 필요했다는 점도 구현 비용이다. 상태 메모리를 줄이기 위해 역전파 때 빠른 가중치를 다시 계산하므로 메모리 효율과 재계산 비용을 교환한다.

경량화 관점에서 이 방법의 강점은 파라미터 수를 크게 줄이는 데 있지 않다. Table 2의 모델들은 게이트로 인한 16K 또는 33K 차이를 제외하면 파라미터 수가 거의 같다. 핵심은 긴 시퀀스에서 평가 상태가 문맥 길이에 따라 커지지 않는다는 점이다. 반대로 더 큰 $d_{dot}$이 필요해지면 고정 상태 자체가 커지므로 필요한 연상 용량과 실제 배포 메모리 사이에서 $\nu$나 $m$을 선택해야 한다.

## 한계와 생각해볼 점

저자가 제시한 첫 번째 한계는 큰 상태를 허용한 Transformer-XL의 절대 성능이다. Delta Network는 0.13M 상태로 테스트 perplexity 29.4를 기록했지만, 6.29M 상태의 Transformer-XL은 25.5를 기록했다. 고정된 작은 상태에서 효율적이라는 장점이 더 큰 메모리를 사용하는 모델의 최고 품질까지 보장하지는 않는다.

둘째, softmax memory는 합성 검색에서 500개가 넘는 키까지 제안된 linear attention 변형보다 높은 절대 용량과 성능을 유지했다. DPFP가 $d_{dot}$을 확장해도 유한 차원이라는 사실은 바뀌지 않는다.

셋째, FAVOR+와 델타 규칙을 결합한 합성 Setting 2에서는 NaN이 발생했다. 무작위 특징과 델타 갱신의 결합이 어떤 조건에서 안정적인지는 이 실험만으로 확인되지 않는다.

넷째, 이미 비-초과용량 상태인 언어 모델에서 $d_{dot}$을 두 배 늘려도 성능이 좋아지지 않았다. 용량을 확장하는 것과 태스크 성능을 높이는 것은 같은 문제가 아니다.

이 결과에서 특히 주의해서 볼 부분은 상수 메모리의 의미다. 상태가 시퀀스 길이와 함께 증가하지 않는다는 뜻이지, 상태 크기가 작거나 계산 비용이 무시할 만하다는 뜻은 아니다. $d_{dot}$을 늘릴수록 용량과 비용이 함께 증가하며, 언어 모델 실험에서는 충분한 용량을 넘긴 뒤 추가 확장이 이득을 주지 않았다.

또한 sum normalisation은 모든 Delta Network가 발산하지 않도록 하는 핵심 조건이었지만, 특징 합이 매우 작을 때의 구체적인 수치 처리는 추출본에서 확인되지 않는다. FAVOR+와 델타 규칙의 NaN 결과까지 고려하면 실제 재구현에서는 정규화 분모와 빠른 가중치의 수치 범위를 별도로 점검해야 한다.

이 논문이 보여준 중요한 흐름은 efficient attention을 단순한 softmax 근사 문제로만 보지 않았다는 점이다. linear attention을 연상 메모리이자 입력으로 프로그래밍되는 빠른 가중치로 해석하자 특징 맵의 근사 정확도 외에도 메모리 용량, 삭제 규칙, 쓰기 강도, 상태 안정성이라는 설계 축이 드러난다. DPFP는 공간을 넓히고, 델타 규칙은 그 공간을 수정 가능하게 만들며, sum normalisation은 쓰기와 삭제가 같은 척도에서 작동하도록 한다. 세 요소가 각각 다른 실패 원인을 담당한다는 것이 이 논문의 핵심이다.
