---
title: "[논문 리뷰] 정렬과 스케일링 — RLHF·DPO와 Scaling Law 9편"
date: 2026-08-07 12:00:00 +0900
layout: post
permalink: /posts/paper-review-alignment-scaling/
categories:
  - AI
  - Paper Review
tags: [paper-review, rlhf, dpo, alignment, scaling-law, chinchilla, llama, emergence]
math: true
related: [paper-review-transformer, paper-review-efficiency-eval, skala-transformer-day2]
---

앞의 세 글이 **아키텍처**를 다뤘다면, 이 글부터는 아키텍처 위에 쌓인 층이다. 두 갈래가 있다.

- **정렬(Alignment)** — 다음 토큰 예측만 배운 모델을 어떻게 사람이 원하는 대로 행동하게 만드는가
- **스케일링(Scaling)** — 얼마나 키워야 하는가, 키우면 무엇이 일어나는가

두 주제를 한 글에 묶은 이유는 **둘 다 "사전학습 이후"의 문제**이면서 서로 얽혀 있기 때문이다. 정렬은 규모가 커진 뒤에야 필요해졌고, 스케일링 법칙의 처방은 정렬·추론 비용을 고려하면서 두 번 뒤집혔다.

## 1부. 정렬

### 1. Deep Reinforcement Learning from Human Preferences
**Christiano, Leike, Brown, Martic, Legg, Amodei (OpenAI / DeepMind) · NeurIPS, 2017**

> RLHF의 원형. **보상 함수를 사람이 설계하지 않고 학습**한다.

**배경** — 강화학습의 고질적 문제는 보상 설계다. "백플립을 해라" 같은 목표를 수식으로 적기 어렵고, 어설프게 적으면 에이전트가 그 허점을 파고든다(reward hacking).

**핵심 아이디어** — 보상 함수를 직접 쓰는 대신, 사람에게 **두 개의 짧은 궤적 중 어느 쪽이 나은지** 묻는다. 이 비교 데이터로 보상 모델을 학습하고, 그 보상으로 정책을 학습한다.

```text
정책 실행 → 궤적 쌍 제시 → 사람이 선호 선택 → 보상 모델 갱신 → 정책 갱신 → 반복
```

**절대 점수가 아니라 비교를 쓰는 것**이 설계의 핵심이다. "이 행동은 7.5점"은 사람마다 척도가 다르지만 "A가 B보다 낫다"는 훨씬 안정적이다.

**결과** — Atari와 MuJoCo 과제에서, 에이전트가 환경과 상호작용한 횟수의 **1% 미만**에 해당하는 사람 피드백만으로 학습에 성공했다. 보상을 명세하기 어려운 백플립 같은 행동도 약 1시간 분량의 사람 평가로 학습시켰다.

**의의** — 5년 뒤 언어모델에 그대로 이식된다. 언어 생성이야말로 "좋은 답변"을 수식으로 적을 수 없는 대표적 영역이기 때문이다.

### 2. Training Language Models to Follow Instructions with Human Feedback (InstructGPT)
**Ouyang, Wu, Jiang 외 (OpenAI) · NeurIPS, 2022**

> RLHF를 언어모델에 적용해 **파라미터 100배 차이를 뒤집은** 논문. ChatGPT의 직계 조상.

**배경** — GPT-3는 지식은 있지만 지시를 따르지 않았다. 원인은 목적함수에 있다.

$$
\mathcal{L}_{\text{pretrain}} = -\sum_t \log P(w_t\mid w_{<t})
$$

이 함수가 최적화하는 것은 "인터넷 텍스트에서 다음에 올 법한 토큰"이지 "사용자가 원하는 답변"이 아니다. 논문은 이 어긋남을 **misalignment**라 부르고, 정렬의 목표를 **helpful · honest · harmless**로 정식화했다.

**핵심 아이디어** — 3단계 파이프라인.

```text
① SFT          레이블러가 작성한 모범 답변으로 지도학습
② Reward Model 같은 프롬프트에 여러 답변 → 레이블러가 순위 → 선호를 점수화
③ PPO          RM 점수를 보상으로 정책 갱신
```

②의 손실은 Bradley-Terry 모델을 따른다.

$$
\mathcal{L}_{RM} = -\mathbb{E}\left[\log\sigma\big(r_\phi(x,y_w)-r_\phi(x,y_l)\big)\right]
$$

③의 목적함수에는 **KL 페널티**가 들어간다. RM은 SFT 모델 근처에서만 학습된 근사 함수라, 정책이 그 영역을 벗어나면 점수만 높고 무의미한 출력이 나온다.

$$
\max_{\pi_\theta}\ \mathbb{E}\big[r_\phi(x,y)\big] - \beta\,\mathbb{D}_{KL}\!\left[\pi_\theta\,\|\,\pi_{\text{ref}}\right]
$$

여기에 사전학습 분포를 섞는 항(PPO-ptx)을 더해 공개 NLP 벤치마크 성능 하락(alignment tax)을 완화했다.

**결과** — 가장 인용되는 수치가 이것이다. **1.3B InstructGPT의 출력이 175B GPT-3보다 선호됐다.** 파라미터 130배 차이를 정렬로 뒤집었다.

**의의** — "모델을 키우는 것"과 "모델을 쓸모 있게 만드는 것"이 다른 문제라는 것을 보였다. ChatGPT의 대중적 성공이 새 아키텍처가 아니라 이 정렬 작업에서 나왔다는 점이 중요하다.

### 3. Direct Preference Optimization: Your Language Model is Secretly a Reward Model
**Rafailov, Sharma, Mitchell, Ermon, Manning, Finn (Stanford) · NeurIPS, 2023**

> 보상 모델과 RL 루프를 **통째로 제거**한 논문.

**배경** — RLHF는 잘 작동하지만 무겁다. 정책·참조·보상·가치 네 모델을 동시에 다뤄야 하고, PPO 특유의 불안정성 때문에 재현이 어렵다.

**핵심 아이디어** — KL 제약이 있는 보상 최대화 문제의 **최적해가 닫힌 형태로 알려져 있다**는 점에서 출발한다.

$$
\pi^*(y\mid x) \propto \pi_{\text{ref}}(y\mid x)\exp\!\left(\frac{r(x,y)}{\beta}\right)
$$

이 식을 보상에 대해 뒤집으면 $r$을 **정책으로 표현**할 수 있다. 이를 Bradley-Terry 손실에 대입하면 보상 모델이 사라지고, 선호 데이터에 대한 단순한 분류 손실만 남는다.

$$
\mathcal{L}_{DPO} = -\mathbb{E}\left[\log\sigma\left(\beta\log\frac{\pi_\theta(y_w|x)}{\pi_{\text{ref}}(y_w|x)} - \beta\log\frac{\pi_\theta(y_l|x)}{\pi_{\text{ref}}(y_l|x)}\right)\right]
$$

제목의 "Your Language Model is Secretly a Reward Model"이 정확히 이 뜻이다. **언어모델 자체가 암묵적으로 보상을 표현하고 있다.**

| | RLHF (PPO) | DPO |
|---|---|---|
| 필요 모델 | 4개 | **2개** |
| 학습 성격 | 강화학습 | **지도학습** |
| 구현 난이도 | 높음 | 낮음 |
| 온라인 탐색 | 가능 | 오프라인 데이터에 한정 |

**의의** — 오픈 모델 생태계에서 사실상 표준이 됐다. 개인적으로 이 논문이 이 묶음에서 가장 인상적이었는데, **새 기법을 추가한 것이 아니라 기존 문제를 다시 풀어서 절반을 없앤** 유형이기 때문이다. 다만 오프라인 선호 데이터에 갇힌다는 한계가 있어 프론티어 랩들은 여전히 온라인 RL 계열을 쓴다.

### 4. Towards Understanding Sycophancy in Language Models
**Sharma, Tong, Korbak 외 (Anthropic) · ICLR, 2024**

> 아첨이 버그가 아니라 **목적함수가 정확히 최적화한 결과**임을 보인 논문.

**배경** — RLHF로 학습된 어시스턴트들이 사용자의 견해에 동조하는 경향이 관찰됐다. 2025년 4월 GPT-4o가 지나친 아첨으로 롤백된 사건이 대표적이다. 문제는 이것이 우연한 결함인지 구조적 귀결인지였다.

**핵심 아이디어** — 두 단계로 접근한다.

1. **현상 확인** — 5개 상용 어시스턴트에서 sycophancy를 일관되게 관측했다. 사용자가 견해를 밝히면 답변이 그쪽으로 기울고, 사용자가 이의를 제기하면 정답이었던 답을 철회한다.
2. **원인 규명** — 사람의 선호 데이터 자체를 분석했다. **사람과 선호 모델 모두 상당한 비율로, 정확하지만 무뚝뚝한 답변보다 설득력 있게 쓰인 아첨성 답변을 선호**했다.

```text
사람의 선호 데이터에 동조 편향이 있다
  → 보상 모델이 그 편향을 학습한다
    → 정책이 아첨을 최적화한다
```

**의의** — RLHF의 구조적 한계를 실증했다는 점에서 중요하다. 프롬프트 몇 줄이나 시스템 메시지로 근본 해결이 안 되는 이유가 여기 있다. 더 넓게는 **"인간 선호를 목표로 삼는 것"의 위험** — 사람이 좋아하는 것과 사람에게 좋은 것이 다를 수 있다는 문제 — 를 구체적 데이터로 제기했다.

## 2부. 스케일링

### 5. Scaling Laws for Neural Language Models
**Kaplan, McCandlish, Henighan 외 (OpenAI / Johns Hopkins) · arXiv, 2020**

> 대규모 학습을 **도박에서 예측 가능한 투자로** 바꾼 논문.

**배경** — 모델을 키우면 좋아진다는 것은 경험적으로 알려져 있었지만, 얼마나 좋아질지를 미리 알 수 없었다. 수백억 원짜리 학습을 결과를 모른 채 시작해야 했다.

**핵심 아이디어** — 손실이 파라미터 수 $N$, 데이터 $D$, 연산량 $C$에 대해 **거듭제곱 법칙**을 따른다는 것을 광범위한 실험으로 보였다.

$$
L(N)\propto N^{-\alpha},\qquad L(D)\propto D^{-\beta},\qquad L(C)\propto C^{-\gamma}
$$

로그-로그 축에서 직선이고, 이 직선이 **7자리 이상의 규모 범위에서 유지**됐다. 실용적 함의가 결정적이다 — 작은 모델 몇 개로 직선을 그으면 큰 모델의 성능을 미리 예측할 수 있다.

부수적 발견들도 흥미롭다. 아키텍처 세부(깊이 대 너비 비율 등)의 영향은 규모에 비하면 미미했고, 큰 모델이 **샘플 효율이 더 좋다**는 관찰도 나왔다.

**결론과 그 영향** — Kaplan의 처방은 $N\propto C^{0.73}$, $D\propto C^{0.27}$ 이었다. **"연산이 늘면 대부분을 모델 크기에 투자하라"** 는 뜻이고, 2020~2021년의 초거대 모델 경쟁(GPT-3 175B, Gopher 280B, MT-NLG 530B)이 정확히 이 처방을 따랐다.

**의의** — 아키텍처 경쟁이 인프라 경쟁으로 바뀐 분기점이다. 그리고 2년 뒤 이 처방이 뒤집힌다.

### 6. Training Compute-Optimal Large Language Models (Chinchilla)
**Hoffmann, Borgeaud, Mensch 외 (DeepMind) · NeurIPS, 2022**

> 당시 거대 모델들이 **전부 데이터 부족 상태**였음을 보인 논문.

**배경** — Kaplan의 처방대로 모델만 키운 결과, 175B~530B 모델들이 쏟아졌다. 그런데 정말 최적이었을까?

**핵심 아이디어** — 70M부터 16B까지 **400개 이상의 모델**을 5B~500B 토큰 범위에서 학습시켜 세 가지 독립적인 방법으로 최적 배분을 추정했다. 세 방법 모두 같은 결론을 냈다.

$$
N_{\text{opt}}\propto C^{0.5},\qquad D_{\text{opt}}\propto C^{0.5}
\qquad\Longrightarrow\qquad \frac{D}{N}\approx 20
$$

**연산 예산이 두 배가 되면 모델과 데이터를 각각 $\sqrt{2}$배씩** — 즉 같은 비율로 늘려야 한다.

**검증** — Gopher(280B)와 **동일한 연산 예산**으로 파라미터를 1/4로 줄이고 데이터를 4배 늘린 Chinchilla(70B, 1.4T 토큰)를 학습시켰다. 결과는 Gopher, GPT-3, Jurassic-1, MT-NLG를 대부분 벤치마크에서 앞섰다.

| | GPT-3 | Gopher | Chinchilla |
|---|---|---|---|
| 파라미터 | 175B | 280B | **70B** |
| 학습 토큰 | 300B | 300B | **1.4T** |
| 토큰/파라미터 | 1.7 | 1.1 | **20** |

**Kaplan과 왜 달랐나** — 같은 방법론으로 반대 결론이 나온 이유가 흥미롭다. 주 원인은 **학습률 스케줄**이었다. Kaplan의 실험은 스케줄을 학습 길이에 맞춰 조정하지 않아 **오래 학습한 설정이 부당하게 불리하게 평가**됐다. Chinchilla는 각 학습 길이에 코사인 스케줄을 맞춰 재실험했고 지수가 0.5로 수렴했다.

수십억 달러 규모의 산업 전략이 하이퍼파라미터 스케줄 하나에 좌우된 셈이다. 경험 법칙이 실험 설계에 얼마나 취약한지를 보여주는 사례다.

### 7. LLaMA: Open and Efficient Foundation Language Models
**Touvron, Lavril, Izacard 외 (Meta AI) · arXiv, 2023**

> Chinchilla optimal에 **추론 비용**이라는 변수를 추가한 논문.

**배경** — Chinchilla는 학습 연산만 최적화한다. 그런데 실제 서비스는 모델을 한 번 학습시키고 **수십억 번 추론**한다.

**핵심 아이디어** — 논문 서론이 직접 지적한다. Chinchilla는 학습 예산을 최적화하지만 **추론 예산을 무시**하며, 목표 성능에 도달하기까지 학습이 더 오래 걸리더라도 **추론이 싼 작은 모델이 결국 낫다**는 것이다.

$$
\text{LLaMA-7B}: \ 1\text{T tokens} \ / \ 7\text{B params} \;\approx\; 143 \ \text{tokens/param}
$$

Chinchilla 기준(20)으로 보면 7배 "과다 학습"이지만, 배포 관점에서는 이쪽이 맞다.

**두 번째 기여** — **공개 데이터만** 사용했다. Common Crawl, C4, GitHub, Wikipedia, Books, arXiv, StackExchange로 구성했고, 독점 데이터 없이도 경쟁력 있는 모델이 가능함을 보였다.

**결과** — LLaMA-13B가 대부분 벤치마크에서 **GPT-3(175B)를 앞섰다.** 65B는 Chinchilla-70B, PaLM-540B와 경쟁 가능한 수준이었다.

**짚어둘 점** — 흔한 오해가 있다. LLaMA-13B가 GPT-3를 이긴 것은 **모델이 작아서**가 아니라 **데이터를 충분히 먹여서**다. 그리고 이 모델은 OSI 정의의 오픈소스가 아니다. 가중치는 공개하되 라이선스로 사용을 제한하는 **open weights**이며, 학습 데이터와 코드는 공개되지 않았다.

**의의** — 오픈 LLM 생태계 전체의 설계 원칙이 됐다. "작게, 오래"가 표준이 된 출발점이다.

### 8. Emergent Abilities of Large Language Models
**Wei, Tay, Bommasani 외 (Google Research / Stanford / DeepMind) · TMLR, 2022**

> 규모를 넘기면 **없던 능력이 나타난다**는 주장.

**배경** — Scaling Law는 손실이 매끄럽게 감소한다고 말한다. 그런데 개별 태스크 성능은 그렇게 보이지 않았다.

**핵심 아이디어** — 창발적 능력을 다음과 같이 정의한다. **작은 모델에는 없고 큰 모델에는 있는 능력**, 즉 작은 모델의 성능으로는 외삽해 예측할 수 없는 능력.

```text
특정 규모 이전   무작위 수준
특정 규모 이후   급격히 상승
```

논문은 few-shot 프롬프팅 과제(3자리 산술, 대학 수준 시험, 단어 해독 등)와 프롬프팅 전략(Chain-of-Thought, instruction following)에서 이런 패턴을 다수 수집했다. CoT가 특정 규모 이상에서만 효과가 있다는 관찰이 대표적이다.

**의의** — "더 키우면 예상 못 한 것이 나온다"는 서사의 근거가 됐고, 동시에 AI 안전 논의에서 예측 불가능성의 근거로도 인용됐다.

### 9. Are Emergent Abilities of Large Language Models a Mirage?
**Schaeffer, Miranda, Koyejo (Stanford) · NeurIPS, 2023 (Outstanding Paper)**

> 창발이 **모델의 성질이 아니라 평가 지표의 성질**일 수 있다는 반론.

**배경** — 8번 논문의 주장이 널리 받아들여지던 시점에 나온 정면 반박이다.

**핵심 아이디어** — 창발이 관측되는 태스크들의 공통점은 **불연속적이거나 비선형인 평가 지표**를 쓴다는 것이다.

```text
4자리 덧셈, exact match 기준
  → 자릿수 하나만 틀려도 0점
  → 토큰별 정확도가 꾸준히 올라도 전체 정답률은 갑자기 튀어오른다

같은 모델, 토큰 편집거리 같은 연속 지표
  → 부드럽게 개선
```

저자들은 세 가지로 논증했다. ① 같은 모델·같은 출력을 연속 지표로 재평가하면 창발이 사라진다, ② 창발이 보고되지 않은 태스크에서도 지표를 불연속으로 바꾸면 **창발을 인위적으로 만들어낼 수 있다**, ③ 비전 모델에서도 같은 조작이 가능하다.

**의의** — 실무적 함의가 크다. 능력의 등장을 논하기 전에 **무엇을 어떤 지표로 재는지**를 먼저 정의해야 한다. "규모를 키우면 알 수 없는 능력이 튀어나온다"는 서사에 기대 로드맵을 세우는 것은 위험하다.

두 논문이 완전히 배타적인 것은 아니다. Wei 등이 수집한 사례 중 일부는 지표 문제로 설명되지만, 모든 경우가 그런지는 여전히 논쟁 중이다. 다만 **주장의 입증 책임이 창발 쪽으로 넘어간 것**은 분명하다.

## 정리

**정렬**

| 논문 | 핵심 |
|---|---|
| Christiano 2017 | 보상을 설계하지 말고 **비교로 학습**하라 |
| InstructGPT 2022 | SFT → RM → PPO + **KL 페널티**. 1.3B가 175B를 이겼다 |
| DPO 2023 | 최적해를 닫힌 형태로 풀어 **RM과 RL을 제거** |
| Sycophancy 2023 | 아첨은 버그가 아니라 **선호 데이터의 편향이 최적화된 결과** |

**스케일링**

| 논문 | 처방 | 뒤집은 것 |
|---|---|---|
| Kaplan 2020 | $N\propto C^{0.73}$ — 모델 위주 | 예측 불가능성 |
| Chinchilla 2022 | $D/N\approx 20$ — 균형 | Kaplan (원인: 학습률 스케줄) |
| LLaMA 2023 | 143 tokens/param — 작게, 오래 | Chinchilla (추론 예산 미고려) |
| Wei 2022 → Schaeffer 2023 | 창발 주장 → 지표 착시 반론 | — |

이 묶음에서 가장 배울 점이 많았던 것은 **Kaplan → Chinchilla → LLaMA의 연쇄 반전**이다. 같은 경험 법칙을 두고 실험 설계(학습률 스케줄)와 최적화 대상(학습 vs 추론)이 바뀌자 산업 전체의 방향이 두 번 뒤집혔다. 논문을 개별적으로 읽었을 때는 각각 타당해 보이는데, 계보로 놓으니 **경험 법칙이 얼마나 취약한 전제 위에 서 있는지**가 드러난다.

Schaeffer et al.의 창발 반박도 같은 맥락이다. 관측된 현상이 대상의 성질인지 측정 도구의 성질인지를 구분하는 작업 — 실험과학에서 늘 요구되는 것인데, 이 분야에서는 자주 생략된다.

---

이전 글: [Transformer 아키텍처 개선 9편](/posts/paper-review-transformer-variants/)

관련 글: [SKALA LLM 2일차 — Modern LLM](/posts/skala-transformer-day2/)

다음 글: [효율화와 평가 10편](/posts/paper-review-efficiency-eval/)
