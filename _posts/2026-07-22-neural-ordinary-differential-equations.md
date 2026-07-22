---
title: "[논문 리뷰] Neural Ordinary Differential Equations"
date: 2026-07-22 00:00:00 +0900
layout: post
permalink: /posts/neural-ordinary-differential-equations/
categories:
  - AI
  - Paper Review
tags: [paper-review, neural-ode, continuous-depth, normalizing-flow, differential-equation, generative-model]
math: true
related: [self-flow, dl-foundational-roadmap]
paper:
  authors: "Ricky T. Q. Chen, Yulia Rubanova, Jesse Bettencourt, David Duvenaud"
  venue: "NeurIPS 2018"
  url: "https://proceedings.neurips.cc/paper_files/paper/2018/hash/69386f6bb1dfed68692a24c8686939b9-Abstract.html"
---

> 이 글은 개인 Obsidian에 작성해 두었던 학습 노트를 다시 검토하고 다듬은 글이다. 논문의 모든 실험을 재현하기보다는, Neural ODE가 신경망의 깊이를 어떻게 연속적인 관점으로 바꾸는지 이해하는 데 초점을 맞춘다.

## 한 줄 요약

Neural ODE는 은닉 상태를 여러 층으로 차례로 갱신하는 대신, **은닉 상태의 변화율을 신경망으로 학습하고 ODE solver로 최종 상태를 계산**한다.

## 이산적인 층에서 연속적인 깊이로

Residual Network의 한 블록은 다음처럼 쓸 수 있다.

$$
h_{t+1} = h_t + f(h_t, \theta_t)
$$

이 식은 현재 상태 $h_t$에 신경망이 예측한 변화량을 더한다. 관점을 바꾸면, 이는 연속적인 동역학을 한 단계 전진시키는 Euler discretization과 닮아 있다. 층 사이의 간격을 더 작게 만들면 다음의 미분방정식으로 이어진다.

$$
\frac{dh(t)}{dt} = f(h(t), t, \theta)
$$

여기서 신경망 $f$는 상태 자체가 아니라 상태의 순간적인 변화율을 나타낸다. 입력 $h(t_0)$에서 출력 $h(t_1)$을 얻는 과정은 미리 정해진 블록을 순서대로 통과하는 것이 아니라, 초기값 문제를 푸는 과정이 된다.

$$
h(t_1) = h(t_0) + \int_{t_0}^{t_1} f(h(t), t, \theta)\,dt
$$

![Residual Network와 ODE Network의 비교](/assets/img/posts/neural-ode/resnet-vs-ode-network.png)
_Residual Network는 정해진 지점에서 상태를 갱신하지만, ODE Network는 연속적인 변화율을 모델링한다. 그림 출처: Neural ODE 논문._

## ODE solver가 네트워크의 실행을 결정한다

Neural ODE에서는 출력 계산을 범용 ODE solver에 맡긴다.

$$
h(t_1) = \operatorname{ODESolve}(h(t_0), f, t_0, t_1, \theta)
$$

solver는 사용자가 지정한 오차 허용 범위를 만족하도록 함수 $f$를 필요한 만큼 평가한다. 따라서 모든 입력이 반드시 동일한 횟수의 연산을 거칠 필요가 없다. 이 특성은 다음과 같은 장점을 만든다.

### 적응적인 연산량

변화가 단순한 구간에서는 큰 간격으로, 급격한 구간에서는 작은 간격으로 적분할 수 있다. 허용 오차를 조절하면 정확도와 계산량 사이의 균형도 바꿀 수 있다. 다만 높은 정확도를 요구하거나 동역학이 풀기 어려운 형태라면 함수 평가 횟수(NFE)가 크게 증가할 수 있다.

### 연속적인 파라미터화

일반적인 깊은 네트워크는 층마다 서로 다른 파라미터를 갖는다. Neural ODE는 하나의 동역학 함수가 시간에 따른 변화를 설명하기 때문에 깊이를 연속적인 축으로 해석할 수 있다. 이것이 항상 더 적은 파라미터나 더 빠른 실행을 보장하는 것은 아니지만, 모델 구조를 설계하는 새로운 관점을 제공한다.

### 불규칙한 시계열

연속 시간 모델은 관측 간격이 일정하지 않은 데이터도 자연스럽게 다룰 수 있다. 정해진 시간 간격마다 상태를 갱신하는 RNN과 달리, 원하는 시점의 상태를 solver로 평가할 수 있기 때문이다.

## 역전파와 adjoint method

가장 까다로운 부분은 ODE solver를 통과한 결과에 대해 gradient를 계산하는 일이다. solver의 모든 내부 연산을 일반적인 계산 그래프에 저장하면 메모리 사용량이 커진다. 논문은 이를 피하기 위해 adjoint state를 사용한다.

손실 $L$에 대한 상태의 gradient를 다음처럼 정의하자.

$$
a(t) = \frac{\partial L}{\partial h(t)}
$$

그러면 $a(t)$ 역시 다른 ODE를 따라 움직이며, 출력 시점에서 입력 시점 방향으로 적분해 gradient를 구할 수 있다. 이 방식은 forward 과정의 모든 중간 상태를 저장하지 않아도 된다는 장점이 있다.

하지만 “상수 메모리”라는 표현은 주의해서 받아들여야 한다. 역방향 적분 중 상태를 재구성할 때 수치 오차가 생길 수 있고, 안정성을 높이기 위해 checkpointing이나 solver 내부 상태 저장을 함께 사용하기도 한다. 즉 메모리, 계산량, 수치 정확도 사이의 trade-off가 존재한다.

## Continuous Normalizing Flow와의 연결

Neural ODE의 중요한 응용 중 하나가 Continuous Normalizing Flow(CNF)다. 기존 normalizing flow는 invertible layer를 쌓고 각 변환의 Jacobian determinant를 계산한다. 연속 시간으로 이동하면 확률밀도의 변화는 instantaneous change-of-variables 식으로 표현할 수 있다.

$$
\frac{d \log p(h(t))}{dt}
= -\operatorname{Tr}\left(\frac{\partial f}{\partial h(t)}\right)
$$

이 관점은 이후 Flow Matching과 여러 연속 시간 생성 모델을 이해하는 기반이 된다. Neural ODE 자체는 범용적인 연속 깊이 모델이지만, 생성 모델의 맥락에서는 “샘플이 시간에 따라 어떤 vector field를 따라 이동하는가”라는 질문으로 이어진다.

## 정리

Neural ODE의 핵심은 단순히 ODE solver를 신경망에 붙이는 것이 아니다. 네트워크의 깊이를 이산적인 층의 개수가 아니라 **상태가 연속적으로 변화하는 시간**으로 다시 정의한다는 데 있다.

- Residual update는 Euler discretization으로 해석할 수 있다.
- 신경망은 상태가 아니라 상태의 변화율을 학습한다.
- ODE solver가 정확도에 맞춰 함수 평가 횟수를 결정한다.
- adjoint method는 메모리 사용을 줄일 수 있지만 수치 오차와 추가 계산을 고려해야 한다.
- Continuous Normalizing Flow와 Flow Matching으로 이어지는 수학적 토대를 제공한다.

논문: [Neural Ordinary Differential Equations (NeurIPS 2018)](https://proceedings.neurips.cc/paper_files/paper/2018/hash/69386f6bb1dfed68692a24c8686939b9-Abstract.html)
