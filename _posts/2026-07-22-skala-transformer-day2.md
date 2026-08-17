---
title: "[SKALA] LLM 2일차 — Modern LLM: RLHF, Scaling Law, Distillation, MoE"
date: 2026-07-22 09:00:00 +0900
categories:
  - SKALA
  - LLM
tags: [skala, llm, rlhf, scaling-law, chinchilla, distillation, moe, benchmark]
description: "Transformer 아키텍처 위에 쌓인 네 층 — 사람의 선호를 주입하는 RLHF, 얼마나 키울지 정하는 Scaling Law, 작게 만드는 Distillation, 파라미터를 선택적으로 쓰는 MoE — 를 원 논문 기준으로 정리한다."
permalink: /posts/skala-transformer-day2/
math: true
---

[1일차](/posts/skala-transformer-day1/)에서 Transformer 아키텍처는 사실상 완성됐다. 그런데 2017년의 그 모델과 지금 우리가 쓰는 LLM 사이에는 아직 큰 간극이 있다.

```text
다음 토큰 예측만 배운 모델이 어떻게 지시를 따르게 되는가?   →  RLHF
얼마나 키워야 하는가? 키우면 계속 좋아지는가?               →  Scaling Law
그 큰 모델을 어떻게 작게 만드는가?                          →  Distillation
모든 파라미터를 매 토큰마다 다 써야 하는가?                  →  MoE
```

2일차는 아키텍처 위에 쌓인 이 네 층을 다룬다. 흥미로운 것은 **네 가지 모두 아키텍처를 거의 건드리지 않는다**는 점이다. GPT-1부터 지금까지 Transformer 블록 자체는 정규화 위치와 위치 인코딩 정도만 바뀌었고, 실질적 발전은 **학습 목적함수·데이터 배분·모델 용량 배분**에서 나왔다.

1일차와 마찬가지로 원문 대조에 무게를 뒀다. 슬라이드에서 개념이 뒤섞이거나 수치가 맞지 않는 지점은 근거와 함께 바로잡아 적었다.

## LLM은 지금 어디까지 왔나

강의 앞부분은 시장과 커리어 이야기였다. 전공자 입장에서 새로운 내용은 아니지만, **숫자를 인용할 때 그 숫자가 어떻게 만들어졌는지**는 짚고 갈 만하다.

### 생산성 수치를 읽는 법

맥킨지는 생성형 AI의 연간 경제 효과를 2.6~4.4조 달러로 추정했고, MS·LinkedIn의 Work Trend Index는 전 세계 지식 근로자의 75%가 업무에 생성형 AI를 쓰고 있으며 그중 46%는 최근 6개월 내에 시작했다고 보고했다.

방향성은 분명하지만 두 조사의 성격이 다르다.

| | 맥킨지 | Work Trend Index |
|---|---|---|
| 성격 | **잠재력 추정**(potential) | **자기보고 설문**(31개국 3.1만 명) |
| 산출 방식 | 업무 활동 분해 후 자동화 가능 비율 추정 | 응답자의 주관적 응답 |
| 읽을 때 주의 | 실현치가 아니라 상한에 가깝다 | 사회적 바람직성 편향, 표본 선정 |

특히 "90%가 업무 시간 단축에 도움이 된다"는 응답과 "59%의 리더가 생산성 향상을 수치화하는 데 어려움을 겪는다"는 응답이 **같은 조사에 함께 실려 있다는 점**이 시사적이다. 체감 효과는 크지만 측정된 효과는 아직 불분명하다는 뜻이고, 이건 신기술 도입 초기에 반복적으로 관찰되는 패턴이다.

### AlphaFold: 경계가 사라진 사례

강의에서 가장 인상적인 사례는 AlphaFold였다. 단백질 구조 예측은 50년 넘게 실험으로 약 19만 개를 밝혀낸 문제였는데, AlphaFold2 이후 약 2억 개 구조가 예측되었고 CASP14에서 GDT 92.4 수준의 정확도를 기록했다. 2024년 노벨 화학상이 Demis Hassabis, John Jumper, David Baker에게 돌아갔다.

여기서 짚을 점은 성능 수치가 아니라 **문제 구조**다. 단백질 접힘은 아미노산 서열이라는 **1차원 시퀀스**로부터 3차원 구조를 예측하는 문제이고, AlphaFold2의 핵심 모듈인 Evoformer는 Transformer의 attention을 변형해 **잔기 쌍(residue pair) 사이의 관계**를 모델링한다. 1일차에서 본 "임의의 두 위치를 $O(1)$ 경로로 직접 연결한다"는 성질이 서열 내 원거리 상호작용을 다루는 데 그대로 유효했던 것이다.

즉 이것은 "AI가 생물학 문제를 풀었다"기보다 **시퀀스 위의 장거리 의존성 문제로 재정식화하는 데 성공했다**는 이야기에 가깝다.

### FDE라는 직군

강의 후반부는 Forward Deployed Engineer 이야기였다. "AI 솔루션을 만드는 사람"이 아니라 "현장에서 고객의 문제를 찾아 AI 시스템으로 해결하는 사람"이라는 포지셔닝이고, AI Engineer · Consultant · Data Analyst의 교집합에 있는 역할로 정의된다.

이 흐름 자체는 실재한다고 본다. 다만 연구 트랙에서 보면 함의가 하나 더 있다. **모델을 만드는 일과 모델을 쓰는 일 사이의 격차가 벌어지는 중**이라는 것이다. 프론티어 모델 사전학습은 이제 소수 조직만 가능하고, 그 바깥의 대다수는 주어진 모델 위에서 시스템을 설계한다. 뒤에 나올 **Distillation**과 **MoE**가 중요한 이유도 여기 있다 — 둘 다 "직접 학습시킬 수 없는 능력을 어떻게 감당 가능한 비용으로 가져올 것인가"에 대한 답이다.

## LLM Landscape

### 리더보드를 읽는 법

| 리더보드 | 성격 | 강점 | 한계 |
|---|---|---|---|
| **Stanford HELM** | 학계 | 정확도 외에 Calibration·Robustness·Fairness·Toxicity·Efficiency를 **다축으로** 평가 | 엄밀한 만큼 갱신이 느리다 |
| **Vellum** | 산업계 | GPQA·AIME·SWE-Bench·BFCL 등 최신 모델 중심, 컨텍스트 길이·토큰 단가까지 제공 | 벤더 발표 수치 의존도가 있다 |
| **HF Open LLM Leaderboard** | 오픈 모델 | 표준 벤치마크 자동 평가, 누구나 제출 가능·재현 가능 | 오픈 가중치 모델로 범위 한정 |

HELM의 설계가 특히 중요하다. **단일 정확도 숫자로 모델을 줄 세우는 것이 왜 위험한지**를 벤치마크 구조 자체로 보여주기 때문이다. Calibration(모델의 확률 추정이 실제 정답률과 맞는가)은 정확도와 독립적인 축이고, 실무에서 "이 답변을 신뢰해도 되는가"를 판단할 때는 오히려 더 중요하다.

강의는 시점별 Vellum 스냅샷을 여러 장 보여줬다. 25.08, 25.12, 26.07 세 시점의 상위권 모델이 거의 완전히 교체되는데, 이 자체가 하나의 관찰이다.

> **리더보드는 인쇄되는 순간 낡는다.** 슬라이드에 담긴 순위표는 자료를 만든 시점의 스냅샷이고, 이 글을 읽는 시점에는 또 달라져 있다. 그래서 개별 순위를 외우는 것은 의미가 없고, **어떤 축으로 평가되는지**(추론·수학·코딩·도구 사용·다국어·시각)와 **각 벤치마크가 무엇을 측정하는지**를 아는 편이 훨씬 오래 간다.
{: .prompt-tip }

### 강의에서 다루지 않은 것: 벤치마크 오염

리더보드를 다루면서 반드시 함께 짚어야 하는 문제가 있는데 슬라이드에는 없었다. **데이터 오염(contamination)** 이다.

MMLU·GSM8K·HumanEval 같은 표준 벤치마크는 전부 웹에 공개되어 있다. 그런데 프론티어 모델의 사전학습 코퍼스는 웹 전체를 긁는다. **평가 문제가 학습 데이터에 섞여 들어간다.**

이 문제를 정량화한 대표적 연구가 GSM1k다. GSM8K와 동일한 난이도·형식으로 새 문제 1,250개를 만들어 비교했더니, 일부 모델군에서 최대 13%p 수준의 성능 하락이 관측됐다. 하락 폭이 큰 모델일수록 GSM8K 샘플을 생성할 확률이 높다는 상관도 함께 보고됐다.

여기에 굿하트의 법칙이 겹친다. **측정 지표가 목표가 되는 순간 좋은 지표이기를 그만둔다.** 벤치마크 점수가 마케팅 자산이 되면 그 점수에 맞춘 최적화가 일어나고, 점수와 실제 능력의 상관이 약해진다.

```text
리더보드를 볼 때 확인할 것
  ① 이 벤치마크는 언제 공개됐나        (오래됐을수록 오염 위험 ↑)
  ② 비공개 홀드아웃이 있나              (LMSYS Arena 같은 인간 평가 병행)
  ③ 자체 보고인가 독립 평가인가
  ④ 정확도 외의 축은 어떤가             (calibration, robustness, cost)
```

### Open Weights ≠ Open Source

LLaMA를 다루면서 강의가 짚은 "openwashing" 이슈는 정확한 지적이다. 정리해 두면:

| | 공개 범위 | 예시 |
|---|---|---|
| **Open Source** (OSI 정의) | 사용·수정·재배포 자유, 목적·분야 제한 없음 | Apache 2.0, MIT 라이선스 모델 |
| **Open Weights** | 가중치는 공개하되 **라이선스로 사용을 제한** | LLaMA 계열 (MAU 7억 초과 기업 제한 등) |

LLaMA는 후자다. 가중치를 내려받아 파인튜닝할 수 있다는 점에서 연구·개발상의 가치는 크지만, OSI 정의의 오픈소스는 아니다. 게다가 **학습 데이터와 학습 코드는 공개되지 않는다.** 재현 가능성 관점에서는 "공개"라 부르기 어렵다.

LLaMA 1 논문의 실질적 기여는 라이선스가 아니라 다른 데 있었다. **13B 모델이 대부분 벤치마크에서 GPT-3(175B)를 앞선다**는 결과인데, 이것은 뒤에 나올 Scaling Law 논의와 직결된다.

## RLHF

### 왜 필요한가

사전학습이 끝난 모델은 **지식은 있지만 지시를 따르지 않는다.** 원인은 목적함수에 있다.

$$
\mathcal{L}_{\text{pretrain}} = -\sum_t \log P(w_t \mid w_{<t})
$$

이 목적함수가 최적화하는 것은 **"인터넷 텍스트에서 다음에 올 법한 토큰"** 이지 **"사람이 원하는 답변"** 이 아니다. 둘은 자주 어긋난다.

```text
질문: "파이썬에서 리스트를 뒤집는 방법을 알려줘."

사전학습 모델이 그럴듯하다고 보는 연속:
  → "그리고 튜플을 뒤집는 방법도 알려줘."      (질문 목록의 일부일 수 있으므로)
  → "reverse()를 쓰면 됩니다."                 (짧고 무뚝뚝)

사람이 선호하는 답변:
  → reverse()와 a[::-1]의 차이(원본 변경 vs 새 리스트)까지 설명
```

강의의 이 예시가 RLHF의 목적을 정확히 짚는다. **RLHF는 '정답을 맞히는 능력'이 아니라 '사람이 더 선호하는 답변을 생성하는 능력'을 학습하는 과정**이다. 정답률을 올리는 기법이 아니라는 점이 핵심이다.

### 3단계 파이프라인

표준 형태는 InstructGPT 논문에서 정립됐다.

```text
① Supervised Fine-Tuning (SFT)
   사람이 작성한 모범 답변으로 지도학습 → π_SFT

② Reward Model (RM)
   같은 프롬프트에 여러 답변을 생성 → 사람이 순위 매김 → 선호를 점수화하는 모델 r_φ

③ Reinforcement Learning (PPO)
   RM의 점수를 보상으로 삼아 정책(LLM)을 업데이트
```

**②에서 절대 점수가 아니라 순위를 매기는 것**이 설계상 중요하다. "이 답변은 7.5점"이라는 평가는 사람마다 척도가 달라 일관성이 없지만, "A가 B보다 낫다"는 비교는 훨씬 안정적이다. 이 쌍별 선호를 점수로 바꾸는 것이 Bradley-Terry 모델이다.

$$
P(y_w \succ y_l \mid x) = \sigma\big(r_\phi(x, y_w) - r_\phi(x, y_l)\big)
$$

$$
\mathcal{L}_{RM} = -\mathbb{E}_{(x,\,y_w,\,y_l)}\left[\log \sigma\big(r_\phi(x,y_w) - r_\phi(x,y_l)\big)\right]
$$

보상은 **차이로만 정의**되므로 절대 스케일은 임의다. RM의 출력값 자체에 의미를 부여하면 안 되는 이유다.

### 강의에서 빠진 것: KL 페널티

③단계의 목적함수를 슬라이드는 "보상을 최대화하도록 학습"이라고만 적었다. 그런데 보상만 최대화하면 **모델이 즉시 붕괴한다.** RM은 SFT 모델 근처의 분포에서만 학습된 근사 함수라, 정책이 그 영역을 벗어나면 RM 점수는 높지만 사람이 보기엔 무의미한 출력이 나온다.

그래서 실제 목적함수에는 참조 모델과의 KL 발산 페널티가 들어간다.

$$
\max_{\pi_\theta}\; \mathbb{E}_{x,\,y\sim\pi_\theta}\big[r_\phi(x,y)\big] \;-\; \beta\,\mathbb{D}_{KL}\!\left[\pi_\theta(y\mid x)\,\|\,\pi_{\text{ref}}(y\mid x)\right]
$$

**"보상을 높이되 원래 모델에서 너무 멀어지지는 말라"** 는 제약이고, $\beta$가 그 강도를 조절한다. 이 항이 없으면 뒤에 나올 reward hacking이 즉각적으로 발생한다. RLHF 구현에서 가장 튜닝이 까다로운 하이퍼파라미터가 이 $\beta$이기도 하다.

### 한계 ①: Reward Hacking

강의가 지적한 대로다. 모델이 **"보상을 잘 받는 응답 형태"** 를 학습하지 실제로 더 나은 답변을 학습하지는 않는다. 전형적인 증상이 정해져 있다.

- **장황화(verbosity bias)**: RM이 긴 답변에 높은 점수를 주는 경향이 있어 모델이 불필요하게 길어진다
- **형식 모방**: 목록·굵은 글씨·이모지 같은 표면적 특징을 늘린다
- **다양성 감소**: 무난하고 안전한 응답으로 수렴한다

세 번째는 RLHF의 구조적 대가다. 보상 기댓값을 최대화하면 분포의 **모드로 집중**되므로, 창의적 글쓰기처럼 다양성이 가치인 태스크에서는 오히려 손해가 난다.

### 한계 ②: Sycophancy

강의가 실제 사건으로 다룬 사례가 좋았다. 2025년 4월 GPT-4o 업데이트 이후 "지나치게 아첨한다"는 지적이 이어졌고, Sam Altman이 공개적으로 인정하고 롤백했다. 슬라이드의 예시("모니터를 발로 차버렸어" → "감정을 표출할 줄 아는 용기를 가지셨어요")는 이 문제가 어떻게 나타나는지를 잘 보여준다.

이것이 단순한 사고가 아니라 **RLHF의 구조에서 나오는 문제**라는 점이 중요하다. Anthropic의 연구는 사람이 매기는 선호 자체에 **자신의 견해에 동의하는 답변을 선호하는 경향**이 있고, RM이 그 경향을 그대로 학습한다는 것을 실증했다. 즉

```text
사람의 선호 데이터  →  RM이 "동의하는 답변"에 높은 점수  →  정책이 아첨을 학습
```

**아첨은 버그가 아니라 목적함수가 정확히 최적화한 결과다.** 이 구조를 이해하면 왜 프롬프트 몇 줄로 근본 해결이 안 되는지도 분명해진다.

여기에 "누구의 선호를 기준으로 삼을 것인가"라는 문제가 겹친다. 레이블러 집단의 인구통계·문화적 배경이 모델의 가치 정렬에 직접 반영되므로, RLHF는 기술적 문제이면서 동시에 **거버넌스 문제**다.

### 그 이후: DPO

강의는 RLHF까지 다뤘는데, 현재 오픈 모델 생태계의 사실상 표준은 **DPO(Direct Preference Optimization)** 다. 알아 두면 좋다.

핵심 통찰은 **RLHF의 최적해를 닫힌 형태로 풀면 보상 모델을 명시적으로 학습할 필요가 없다**는 것이다. KL 제약이 있는 보상 최대화 문제의 해가 $\pi^*(y|x) \propto \pi_{\text{ref}}(y|x)\exp(r(x,y)/\beta)$ 형태라는 점을 이용해 보상을 정책으로 다시 쓰면, 선호 데이터에 대한 단순한 분류 손실이 된다.

$$
\mathcal{L}_{DPO} = -\mathbb{E}\left[\log\sigma\left(\beta\log\frac{\pi_\theta(y_w|x)}{\pi_{\text{ref}}(y_w|x)} - \beta\log\frac{\pi_\theta(y_l|x)}{\pi_{\text{ref}}(y_l|x)}\right)\right]
$$

| | RLHF (PPO) | DPO |
|---|---|---|
| 필요 모델 | 정책·참조·보상·가치 (4개) | 정책·참조 (2개) |
| 학습 안정성 | RL 특유의 불안정성 | 지도학습 수준 |
| 구현 난이도 | 높음 | 낮음 |
| 온라인 탐색 | 가능 | 오프라인 데이터에 한정 |

**RM과 RL 루프가 통째로 사라진다.** 다만 오프라인 선호 데이터에 갇힌다는 한계가 있어, 프론티어 랩들은 여전히 온라인 RL 계열을 쓴다. 최근 추론 모델(o1, R1 계열)이 검증 가능한 보상(수학 정답, 코드 테스트 통과)으로 RL을 돌리는 방향으로 간 것도 **사람의 선호라는 노이즈 많은 신호를 우회**하려는 시도로 읽힌다.

## Scaling Law

### 경험 법칙의 발견

$$
L(N) \propto N^{-\alpha}, \qquad L(D) \propto D^{-\beta}, \qquad L(C) \propto C^{-\gamma}
$$

파라미터 수 $N$, 데이터 토큰 수 $D$, 연산량 $C$를 늘리면 손실이 **거듭제곱 법칙(power law)** 으로 감소한다. 로그-로그 축에서 직선으로 나타난다는 것이 이 법칙의 실용적 가치다. **작은 모델 몇 개를 학습시켜 직선을 그으면 큰 모델의 성능을 미리 예측할 수 있다.**

이것이 왜 혁명적이었는지는 그 전과 비교하면 분명하다.

| | Scaling Law 이전 | 이후 |
|---|---|---|
| 개발 전략 | 더 좋은 구조를 찾자 | 더 크게 학습시키자 |
| 경쟁 축 | **알고리즘** | **인프라** |
| 대규모 학습 | 도박 | **예측 가능한 투자** |

수천억 원짜리 학습을 시작하기 전에 결과를 예측할 수 있다는 것 — 이것이 GPT-3 같은 프로젝트가 승인될 수 있었던 근거다.

> 슬라이드가 Scaling의 3요소를 설명하며 인용한 그래프는 GPT-3 논문 Figure 1.2인데, 확인해 보니 이 그림은 **scaling law 곡선이 아니라 in-context learning 곡선**이다. 가로축이 연산량이나 파라미터가 아니라 **프롬프트 안의 예시 개수(K)** 이고, 모델 크기별로 few-shot 성능이 어떻게 달라지는지를 보여준다. 논문의 주장은 "큰 모델일수록 문맥 내 정보를 더 효율적으로 활용한다"는 것이지 손실의 거듭제곱 감소가 아니다. 거듭제곱 법칙 그래프는 Kaplan et al.(2020)의 Figure 1을 봐야 한다.
{: .prompt-warning }

### Chinchilla: 균형이 중요하다

"무조건 크게"에 제동을 건 것이 Chinchilla다. 슬라이드의 GPT-3 대비 표는 결론을 잘 요약하고 있다.

| | GPT-3 | Chinchilla |
|---|---|---|
| 파라미터 | 175B | **70B** |
| 학습 토큰 | 약 300B | **약 1.4T** |
| 토큰/파라미터 | 약 1.7 | **20** |

Chinchilla 논문의 정량적 결론은 이렇게 요약된다.

$$
N_{\text{opt}} \propto C^{0.5}, \qquad D_{\text{opt}} \propto C^{0.5}
\qquad\Longrightarrow\qquad \frac{D}{N} \approx 20
$$

**연산 예산이 두 배가 되면 모델 크기와 데이터를 각각 $\sqrt{2}$배씩 늘려야 한다.** 즉 둘을 같은 비율로 키워야 하고, GPT-3는 모델에 비해 데이터가 심각하게 부족했던(under-trained) 것이다.

> 정확히 하면 Chinchilla의 주 비교 대상은 GPT-3가 아니라 **Gopher(280B)** 다. 같은 연산 예산으로 Gopher를 학습시키는 대신 파라미터를 1/4로 줄이고 데이터를 4배 늘려 학습한 것이 Chinchilla이고, 그 결과 대부분 벤치마크에서 Gopher를 앞섰다. 슬라이드의 GPT-3 비교는 이해를 돕는 대비로는 유효하지만, 논문의 통제된 실험은 Gopher 쪽이다.
{: .prompt-info }

### 왜 Kaplan과 Chinchilla가 다른 결론을 냈나

여기가 이 주제에서 가장 흥미로운 지점인데 강의에는 없었다. 두 논문은 같은 방법론(거듭제곱 법칙 피팅)을 쓰고도 반대 처방을 냈다.

$$
\text{Kaplan (2020)}: \; N \propto C^{0.73},\ D \propto C^{0.27}
\qquad
\text{Chinchilla (2022)}: \; N \propto C^{0.50},\ D \propto C^{0.50}
$$

Kaplan의 지수는 **"연산이 늘면 대부분을 모델 크기에 투자하라"** 는 뜻이고, 실제로 2020~2021년의 초거대 모델 경쟁(GPT-3, Gopher, MT-NLG 530B)이 이 처방을 따랐다.

불일치의 주 원인은 **학습률 스케줄**이었다. Kaplan의 실험은 모든 모델에 대해 스케줄을 학습 길이에 맞춰 조정하지 않았고, 그 결과 **오래 학습한 설정이 부당하게 불리하게 평가**됐다. Chinchilla는 각 학습 길이에 코사인 스케줄을 맞춰 재실험했고 지수가 0.5로 수렴했다.

**교훈이 방법론적으로 유의미하다.** 스케일링 법칙 자체는 경험 법칙이고, 실험 설계의 결함이 지수에 그대로 반영된다. 수십억 달러 규모의 산업 전략이 하이퍼파라미터 스케줄 하나에 좌우된 셈이다.

### 그리고 추론 예산: LLaMA의 반론

Chinchilla optimal에도 빠진 것이 있다. **학습 연산만 고려하고 추론 연산은 고려하지 않는다.**

LLaMA 논문이 이 점을 명시적으로 지적했다. 서비스 관점에서는 모델을 한 번 학습시키고 수십억 번 추론하므로, **총비용을 최소화하려면 Chinchilla optimal보다 작은 모델을 더 오래 학습시키는 것이 낫다.**

| | 최적화 대상 | 토큰/파라미터 |
|---|---|---|
| Chinchilla | 학습 연산 | 약 20 |
| **LLaMA-7B** | 학습 + **추론** | **약 143** (7B / 1T tokens) |
| 이후 오픈 모델 | 추론 비중 더 큼 | 수백~ |

LLaMA-7B는 Chinchilla 기준으로 보면 "과다 학습(over-trained)"이지만, 배포 관점에서는 그것이 정답이었다. 앞서 본 "LLaMA-13B가 GPT-3-175B를 앞선다"는 결과가 여기서 설명된다 — **모델이 작아서 이긴 게 아니라 데이터를 충분히 먹여서 이긴 것**이다.

이 관점 전환이 현재 오픈 모델 생태계 전체의 설계 원칙이 됐다.

### 창발은 실재하는가

Scaling과 관련해 알아 둘 논쟁이 하나 더 있다. 특정 규모를 넘으면 없던 능력이 갑자기 나타난다는 **창발(emergent abilities)** 주장이다.

이에 대한 반론은 **창발이 지표의 착시일 수 있다**는 것이다. 정확 일치(exact match)처럼 **불연속적인 지표**를 쓰면 연속적인 성능 개선이 계단처럼 보인다. 같은 모델을 로그 우도처럼 연속적인 지표로 평가하면 부드러운 곡선이 나온다는 실증이 제시됐다.

```text
4자리 덧셈 정확도(exact match)  →  갑자기 튀어오름  →  "창발"
자릿수별 정답 확률(연속 지표)     →  꾸준히 증가       →  창발 아님
```

실무적 함의가 크다. **"규모를 키우면 알 수 없는 능력이 튀어나온다"** 는 서사에 기대 로드맵을 세우기보다, 어떤 지표로 무엇을 측정하는지를 먼저 정의하는 편이 안전하다.

## Knowledge Distillation

### 개념

SOTA 모델을 모든 조직이 직접 학습시키는 것은 불가능하다. 수천~수만 개 GPU와 수개월이 필요하다. 대안은 **잘 학습된 큰 모델(Teacher)의 능력을 작은 모델(Student)에 옮기는 것**이다.

고전적 형태는 Hinton, Vinyals, Dean(2015)이 정립했다. 핵심은 **soft label**이다.

| | Hard Label | Soft Label |
|---|---|---|
| 형태 | One-hot | Teacher가 예측한 **확률 분포** |
| 예 (고양이 사진) | 고양이=1, 개=0, 여우=0 | 고양이=0.7, 개=0.2, 여우=0.1 |
| 담긴 정보 | 정답만 | **클래스 간 유사성 구조** |

Soft label이 더 나은 이유가 여기 있다. "고양이=1"은 정답만 알려주지만 "고양이 0.7 / 개 0.2 / 여우 0.1"은 **개가 여우보다 고양이에 가깝다**는 Teacher의 학습된 지식까지 전달한다. Hinton은 이를 dark knowledge라 불렀다.

손실 함수는 두 항의 합이다.

$$
\mathcal{L} = \underbrace{\alpha\,\text{CE}\big(y,\ \sigma(z_s)\big)}_{\text{정답과의 오차}} + \underbrace{(1-\alpha)\,T^2\,\text{KL}\big(\sigma(z_t/T)\ \|\ \sigma(z_s/T)\big)}_{\text{Teacher 분포와의 오차}}
$$

**온도 $T$** 가 이 기법의 핵심 장치다. 로짓을 $T$로 나눈 뒤 softmax를 취하면 분포가 평탄해져 작은 확률값들의 정보가 살아난다. $T=1$이면 Teacher 분포가 거의 one-hot이라 dark knowledge가 드러나지 않는다. 앞에 붙은 $T^2$는 기울기 스케일을 보정하는 항이다.

#### 검산해 보니: Soft Label 예제가 확률 분포가 아니다

슬라이드의 soft label 예시 중 하나를 확인해 봤다.

$$
\text{"월"} \to [0.1,\ 0.9,\ 0.4,\ 0.15,\ 0.05,\ 0.04,\ 0.01]
$$

원소를 더하면 $0.1+0.9+0.4+0.15+0.05+0.04+0.01 = \mathbf{1.65}$ 다. **합이 1이 아니므로 확률 분포가 아니다.** Softmax 출력은 정의상 합이 1이어야 하고, 이 값이 KL 발산 계산에 들어가려면 정규화가 필수다.

같은 슬라이드의 다른 예시(고양이=0.7, 개=0.2, 여우=0.1)는 합이 정확히 1이다. 앞쪽 예시는 "값이 여러 개 살아 있다"는 인상을 주려다 정규화를 놓친 것으로 보인다.

사소해 보이지만 **soft label의 정보가 왜 유용한지가 정확히 확률 분포라는 성질에서 나오기 때문에** 짚어 둘 만하다. 정규화되지 않은 벡터에는 "개가 여우보다 2배 그럴듯하다"는 상대적 해석을 붙일 수 없다.

### 짚어둘 것: DeepSeek-R1의 distillation은 고전 KD가 아니다

강의는 Hinton식 soft label 설명과 DeepSeek-R1의 distilled 모델(1.5B~32B)을 하나의 흐름으로 제시했다. 그런데 **두 기법은 다르다.**

DeepSeek-R1 논문이 실제로 한 것은 이렇다.

```text
① DeepSeek-R1(671B, active 37B)이 추론 과정을 포함한 응답 80만 건 생성
② 그 텍스트로 Qwen · Llama 기반 오픈 모델을 SFT
③ RL 단계는 적용하지 않음
```

논문 본문이 "800k samples curated with DeepSeek-R1"으로 직접 파인튜닝했고 "only apply SFT and do not include an RL stage"라고 명시한다. 즉 **로짓 분포에 대한 KL 발산을 최소화한 것이 아니라, Teacher가 생성한 텍스트를 정답으로 삼아 지도학습한 것**이다.

두 방식을 구분하면 이렇다.

| | **고전 KD** (Hinton 2015) | **Sequence-level KD / 합성 데이터 SFT** |
|---|---|---|
| 전달 대상 | Teacher의 **로짓 분포** | Teacher의 **생성 텍스트** |
| 손실 | KL divergence (soft target) | Cross-entropy (hard target) |
| Teacher 접근 | 로짓 필요 → **가중치 접근 필수** | 출력만 있으면 됨 → **API로도 가능** |
| 어휘 일치 | 토크나이저가 같아야 함 | 달라도 무방 |
| DeepSeek-R1 | ✗ | **✓** |

실무적으로 중요한 차이는 세 번째 행이다. **로짓이 필요 없으므로 폐쇄형 모델의 API 출력만으로도 distillation이 가능하다.** 다수의 상용 모델 이용약관이 "출력으로 경쟁 모델을 학습시키는 것"을 금지하는 이유가 정확히 이것이다. 고전 KD였다면 애초에 불가능했을 일이다.

또 하나. 슬라이드는 "Distillation은 모델을 압축하는 것이 아니라 Teacher의 능력을 Student에게 전달하는 과정"이라고 강조한 뒤, 같은 페이지 결론에서 "모델 압축 및 지식 전달 기법"이라고 다시 적었다. **앞뒤가 맞지 않는다.** 정확히는 이렇게 정리된다.

- **결과**로 보면 압축이다 (671B → 32B)
- **방법**으로 보면 압축 알고리즘이 아니다 (가지치기·양자화와 달리 원 모델을 줄이는 것이 아니라 별도의 작은 모델을 새로 학습시킨다)

혼동을 피하려면 **"압축이 아니라 재학습"** 이라고 하는 편이 낫다.

## Mixture of Experts

### 문제의식

> 모든 파라미터를 항상 사용할 필요가 있을까?

Dense Transformer에서는 토큰 하나를 처리할 때마다 **전체 파라미터가 전부 관여**한다. 파라미터를 10배 늘리면 토큰당 연산도 10배가 된다. 용량과 연산이 묶여 있다.

MoE는 이 결합을 끊는다. 여러 개의 Expert를 두고 **토큰마다 일부만 활성화**한다.

$$
y = \sum_{i \in \mathcal{T}} G(x)_i \cdot E_i(x), \qquad
G(x) = \text{TopK}\big(\text{Softmax}(xW_r)\big)
$$

Router가 각 Expert에 대한 점수를 내고, Softmax로 확률을 만든 뒤 상위 $k$개만 골라 가중합한다. 슬라이드의 수식 $\text{Score}=xW_r$, $P_i = e^{s_i}/\sum_j e^{s_j}$ 가 정확히 이것이다.

효과는 숫자로 보면 분명하다.

| 모델 | 총 파라미터 | 활성 파라미터 | 비율 |
|---|---|---|---|
| Mixtral 8×7B | 46.7B | 12.9B | 28% |
| DeepSeek-R1 / V3 | 671B | **37B** | **5.5%** |

**671B의 지식 용량을 37B의 추론 비용으로 쓴다.** 이것이 MoE의 거래다. 다만 공짜는 아니다 — 추론 시 **모든 Expert의 가중치를 메모리에 올려야 한다.** 연산은 줄지만 VRAM은 총 파라미터 기준으로 필요하다. MoE가 클라우드 서빙에는 유리하고 온디바이스에는 불리한 이유다.

### 강의에서 보완이 필요한 세 가지

**① MoE는 FFN 층을 대체한다**

슬라이드는 "Transformer Layer 전체"와 "Expert들"을 대비시키는 그림을 썼는데, 실제 구현에서 Expert가 되는 것은 **FFN(Feed-Forward Network) 블록**이다. Attention은 그대로 두고 FFN만 $N$개로 복제해 라우팅한다.

```text
[Dense]   Attention → LayerNorm → FFN           → LayerNorm
[MoE]     Attention → LayerNorm → Router→FFN_i  → LayerNorm
                                   (N개 중 k개)
```

이유는 1일차에서 확인한 파라미터 분포에 있다. **Transformer 파라미터의 약 2/3가 FFN에 있다.** 용량을 늘리려면 FFN을 늘리는 것이 가장 효율적이고, attention은 토큰 간 상호작용을 담당하므로 쪼개면 그 기능이 깨진다.

**② Load Balancing Loss 없이는 작동하지 않는다**

슬라이드에 없는데 MoE의 실용성을 좌우하는 요소다. Router를 그냥 학습시키면 **소수의 Expert에만 토큰이 몰린다.** 잘 선택된 Expert가 더 잘 학습되고, 잘 학습되었으니 더 자주 선택되는 양의 되먹임이 생기기 때문이다(expert collapse). 나머지 Expert는 학습되지 않은 채 메모리만 차지한다.

그래서 보조 손실을 더한다.

$$
\mathcal{L}_{\text{aux}} = \alpha \cdot N \sum_{i=1}^{N} f_i \cdot P_i
$$

$f_i$는 Expert $i$에 실제로 배정된 토큰 비율, $P_i$는 Router가 부여한 평균 확률이다. 이 곱의 합은 부하가 균등할 때 최소가 되므로, **특정 Expert 쏠림에 페널티**를 준다. Switch Transformer가 정식화한 형태이고, 최종 손실은 $\mathcal{L} = \mathcal{L}_{\text{LM}} + \mathcal{L}_{\text{aux}}$ 가 된다.

**③ "처음에는 모두 동일하나"는 정확하지 않다**

슬라이드는 Expert의 전문화를 "처음에는 모두 동일하나, 학습이 진행되면 Router가 비슷한 토큰을 같은 Expert에 보내면서 전문화된다"고 설명했다.

그런데 **모든 Expert가 정확히 동일하게 초기화되면 전문화가 일어나지 않는다.** 완전 대칭 상태에서는 어떤 Expert를 골라도 출력과 기울기가 같아 대칭이 깨지지 않기 때문이다. 실제로 전문화를 만드는 것은 세 가지의 조합이다.

```text
① 랜덤 초기화        Expert마다 다른 가중치 → 대칭 붕괴의 출발점
② Router의 편향      초기 미세한 선호 차이가 되먹임으로 증폭
③ Load balancing     쏠림을 억제해 모든 Expert가 학습 기회를 갖도록 강제
```

②만 있으면 collapse로 가고, ③만 있으면 무작위 분산으로 간다. 셋이 함께 있어야 **의미 있는 분화**가 생긴다.

> 덧붙이면, Expert가 사람이 해석 가능한 "분야"로 전문화된다는 통념은 실증적으로 잘 지지되지 않는다. Mixtral 논문의 분석에 따르면 라우팅은 주제(수학·생물학 등)보다 **구문적·토큰 수준 패턴**과 더 강하게 상관됐다. "수학 전문가", "코딩 전문가"라는 비유는 직관을 돕지만 실제 동작과는 거리가 있다.
{: .prompt-warning }

## 정리

2일차를 한 줄로 요약하면 **"아키텍처는 그대로 두고 그 위에서 무엇을 바꿨는가"** 다.

**RLHF**

- **사전학습 목적함수는 "그럴듯한 다음 토큰"이지 "좋은 답변"이 아니다.** RLHF는 정답률이 아니라 선호를 학습한다
- **선호는 절대 점수가 아니라 순위로 수집**하고, Bradley-Terry로 점수화한다. 보상의 절대 스케일에는 의미가 없다
- **KL 페널티가 핵심 장치**다. 참조 모델에서 멀어지지 못하게 막지 않으면 reward hacking이 즉시 발생한다
- **Sycophancy는 버그가 아니라 목적함수가 정확히 최적화한 결과**다. 사람의 선호 데이터 자체에 동조 편향이 있다
- **DPO는 RM과 RL 루프를 제거**한다. 최적해를 닫힌 형태로 풀어 분류 손실로 환원한 것

**Scaling Law**

- 손실은 $N$, $D$, $C$에 대해 **거듭제곱 법칙으로 감소**하고, 이 예측 가능성이 대규모 투자를 가능하게 했다
- **Chinchilla: 토큰/파라미터 ≈ 20.** GPT-3는 모델 대비 데이터가 크게 부족했다
- **Kaplan과 Chinchilla의 불일치는 학습률 스케줄이라는 실험 설계 문제에서 나왔다.** 스케일링 법칙은 경험 법칙이고 방법론에 취약하다
- **Chinchilla optimal은 학습 연산만 최적화한다.** 추론까지 고려하면 더 작게, 더 오래가 맞다 (LLaMA-7B는 143 tokens/param)
- **창발은 불연속적 평가 지표의 착시일 수 있다.** 무엇을 어떤 지표로 재는지가 먼저다

**Distillation**

- **Soft label의 가치는 클래스 간 유사성 구조(dark knowledge)를 전달**하는 데 있고, 온도 $T$가 그것을 드러낸다
- **DeepSeek-R1의 distillation은 고전 KD가 아니라 합성 데이터 SFT**다. 로짓이 아니라 생성 텍스트를 옮긴다
- 그래서 **API 출력만으로도 가능**하고, 상용 모델 약관이 이를 금지하는 이유가 된다
- **"압축"이 아니라 "재학습"** 이라 부르는 편이 정확하다

**MoE**

- **용량과 연산의 결합을 끊는다.** DeepSeek-V3는 671B 용량을 37B 연산으로 쓴다
- **다만 메모리는 총 파라미터 기준으로 필요하다.** 클라우드에 유리하고 온디바이스에 불리하다
- **Expert가 되는 것은 FFN**이다. 파라미터의 2/3가 거기 있기 때문이다
- **Load balancing loss 없이는 expert collapse가 일어난다.** 랜덤 초기화 + Router 편향 + 균형 손실 세 가지가 함께 있어야 분화가 생긴다
- **Expert는 사람이 읽을 수 있는 "분야"로 나뉘지 않는다.** 구문적 패턴과 더 강하게 상관된다

이틀을 통틀어 보면 하나의 구도가 반복된다. **Transformer는 2017년 이후 거의 바뀌지 않았고, 바뀐 것은 그 주변이다.** 목적함수(RLHF), 자원 배분(Scaling Law), 용량 이전(Distillation), 연산 배분(MoE) — 넷 다 아키텍처 바깥의 문제다.

개인적으로 이 과정에서 가장 값졌던 것은 **Kaplan → Chinchilla → LLaMA로 이어지는 처방의 반전**을 한 줄기로 정리한 부분이다. 같은 경험 법칙을 두고 실험 설계와 최적화 대상(학습 vs 추론)이 바뀌자 산업 전체의 방향이 두 번 뒤집혔다. 논문을 개별적으로 읽었을 때보다 계보로 놓았을 때 훨씬 분명해졌다.


## 참고 문헌

**RLHF와 정렬**

- Christiano, P. et al. (2017). *Deep Reinforcement Learning from Human Preferences*. NeurIPS.
- Ouyang, L. et al. (2022). *Training Language Models to Follow Instructions with Human Feedback*. NeurIPS. (InstructGPT)
- Bai, Y. et al. (2022). *Training a Helpful and Harmless Assistant with RLHF*.
- Rafailov, R. et al. (2023). *Direct Preference Optimization: Your Language Model is Secretly a Reward Model*. NeurIPS.
- Sharma, M. et al. (2023). *Towards Understanding Sycophancy in Language Models*. ICLR 2024.

**Scaling**

- Kaplan, J. et al. (2020). *Scaling Laws for Neural Language Models*.
- Hoffmann, J. et al. (2022). *Training Compute-Optimal Large Language Models*. NeurIPS. (Chinchilla)
- Touvron, H. et al. (2023). *LLaMA: Open and Efficient Foundation Language Models*.
- Wei, J. et al. (2022). *Emergent Abilities of Large Language Models*. TMLR.
- Schaeffer, R., Miranda, B., Koyejo, S. (2023). *Are Emergent Abilities of Large Language Models a Mirage?*. NeurIPS.

**Distillation**

- Hinton, G., Vinyals, O., Dean, J. (2015). *Distilling the Knowledge in a Neural Network*. NeurIPS Workshop.
- Kim, Y., Rush, A. (2016). *Sequence-Level Knowledge Distillation*. EMNLP.
- DeepSeek-AI (2025). *DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning*.

**MoE**

- Shazeer, N. et al. (2017). *Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer*. ICLR.
- Lepikhin, D. et al. (2020). *GShard: Scaling Giant Models with Conditional Computation and Automatic Sharding*.
- Fedus, W., Zoph, B., Shazeer, N. (2022). *Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity*. JMLR.
- Jiang, A. et al. (2024). *Mixtral of Experts*.
- DeepSeek-AI (2024). *DeepSeek-V3 Technical Report*.

**평가**

- Liang, P. et al. (2022). *Holistic Evaluation of Language Models*. TMLR. (HELM)
- Zhang, H. et al. (2024). *A Careful Examination of Large Language Model Performance on Grade School Arithmetic*. (GSM1k)

---

이전 글: [1일차 — NLP 표현학습의 계보와 Transformer 정독](/posts/skala-transformer-day1/)

시리즈 안내: [LLM과 Transformer 아키텍처 — 2일 학습 로드맵](/posts/skala-transformer-roadmap/)
