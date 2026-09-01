---
title: "[SKALA] LLM 1일차 — NLP 표현학습의 계보와 Transformer 정독"
date: 2026-07-21 09:00:00 +0900
categories:
  - SKALA
  - LLM
tags: [skala, llm, transformer, self-attention, nlp, word2vec, rnn, lstm, attention]
description: "One-hot에서 Word2Vec, RNN·Seq2Seq의 병목과 Attention의 등장까지 표현학습의 계보를 원 논문 기준으로 되짚고, Attention Is All You Need의 각 구성요소를 설계 근거와 함께 정독한다."
permalink: /posts/skala-transformer-day1/
math: true
---

이 모듈의 1일차는 Transformer를 바로 열지 않는다. 대신 **왜 Transformer 같은 것이 필요했는가**를 NLP 표현학습의 계보를 따라 먼저 재구성하고, 그 위에서 원 논문을 연다. 개인적으로는 이 구성이 맞다고 본다. Self-Attention의 각 구성요소는 전부 **앞선 접근이 실패한 지점에 대한 응답**이고, 그 실패를 모르면 설계 근거가 임의의 규칙처럼 보인다.

글은 세 덩어리로 이어진다.

```text
① Software 3.0        LLM이 바꾼 개발 패러다임과 그 구조적 한계
② 표현학습의 계보      One-hot → Word2Vec → RNN/LSTM → Seq2Seq → Attention
   + 선형대수          유사도 · 내적 · 선형변환 · Softmax
③ Transformer         Attention Is All You Need 정독
```

전공 영역이라 요약보다는 원문 확인에 무게를 뒀다. 슬라이드가 압축한 서술을 논문 원문·직접 계산과 대조했고, 어긋난 곳은 근거와 함께 바로잡아 적었다. 또 원 논문(2017)과 현재 프로덕션 LLM이 갈라지는 지점(Post-LN → Pre-LN, 절대 위치 인코딩 → RoPE 등)은 강의 범위를 넘더라도 함께 표시했다.

## Software 3.0이라는 문제의식

### 세 개의 패러다임

| | Software 1.0 | Software 2.0 | Software 3.0 |
|---|---|---|---|
| 프로그램의 실체 | 사람이 쓴 **소스 코드** | 학습된 **신경망 가중치** | 자연어 **프롬프트** |
| 작성 주체 | 프로그래머 | 최적화 알고리즘(SGD) | 프로그래머(자연어로) |
| 컴파일러 | 인터프리터/컴파일러 | Optimizer | LLM |
| 사람이 하는 일 | 규칙을 명시 | 데이터셋과 손실함수 설계 | 목표·역할·제약 정의 |

이 계보는 Andrej Karpathy가 2017년 "Software 2.0"에서 제시한 구분을 확장한 것이다. 원문의 핵심 주장은 **신경망 가중치가 코드의 한 형태**라는 것 — 즉 우리는 프로그램 공간(program space)에서 사람이 손으로 짤 수 있는 아주 좁은 영역만 탐색해 왔는데, 경사하강법은 그보다 훨씬 넓은 영역을 탐색한다는 관점이다. "Software 3.0"은 여기에 **프롬프트가 새로운 프로그램**이라는 층을 얹는다.

강의자료는 Software 3.0을 "AI 에이전트가 명령어와 데이터셋을 받아 프로그램을 생성한다"로 정의했는데, Karpathy의 프레이밍은 조금 다르다. 그쪽은 **LLM 자체가 실행 환경이고 프롬프트가 그 위에서 도는 프로그램**이라는 데 방점이 있다. 두 정의는 배타적이지 않지만 강조점이 다르다.

- 에이전트 관점: "AI가 코드를 대신 짜 준다" → **생산성** 이야기
- 실행환경 관점: "자연어가 곧 실행된다" → **인터페이스** 이야기

실무적으로는 후자가 더 중요하다고 본다. 코드 생성은 결국 Software 1.0 산출물을 더 빨리 만드는 것이지만, 프롬프트가 프로그램이라면 **버전 관리·테스트·디버깅의 대상 자체가 바뀐다.** 실제로 프롬프트 회귀 테스트나 eval 파이프라인이 최근 몇 년 사이 별도 도구 스택으로 자리 잡은 것이 이 변화의 결과다.

### LLM의 구조적 한계

강의가 나열한 네 가지 한계는 정확한데, 각각이 **왜 원리적으로 제거되기 어려운지**를 짚어 두는 편이 유용하다.

**Black Box** — Software 2.0의 한계를 그대로 승계한다. 다만 스케일이 문제를 질적으로 바꿨다. 수십억 파라미터에서는 개별 뉴런이 해석 가능한 개념에 대응하지 않고 **중첩(superposition)** 되어 있다. 하나의 뉴런이 여러 특징을 동시에 표현하기 때문에, 파라미터 수를 줄이지 않는 한 뉴런 단위 해석은 원리적으로 막힌다. 최근 sparse autoencoder 계열 연구가 이 중첩을 풀어내려는 시도다.

**Bias** — 학습 데이터의 분포를 그대로 반영한다. 강의가 지적한 "**silently fail**"이 정확한 표현이다. 편향은 에러를 던지지 않고 그럴듯한 출력 안에 섞여 나오므로 탐지 자체가 별도 문제다.

**Hallucination** — 이 부분은 강의의 설명("정답을 찾는 모델이 아니라 다음 토큰을 가장 그럴듯하게 예측하는 모델")이 본질을 정확히 짚었다. 덧붙이면, 사전학습의 목적함수가 **다음 토큰의 로그 우도**인 이상 모델은 "모른다"는 상태를 표현할 유인이 없다. 학습 코퍼스에 "나는 이것을 모른다"라는 문장이 정답으로 등장하는 빈도가 낮기 때문이다. RLHF나 검색 증강(RAG)은 이 유인 구조를 사후에 바꾸려는 시도이지 근본 해결이 아니다.

**Non-determinism** — 여기는 원인을 분리해서 볼 필요가 있다.

```text
① 샘플링 비결정성   temperature > 0, top-p/top-k 샘플링
                    → temperature=0으로 제거 가능

② 수치 비결정성     GPU 병렬 리덕션의 부동소수점 결합법칙 미성립
                    배치 크기·커널 선택에 따라 합산 순서가 달라짐
                    → temperature=0이어도 완전히 제거되지 않음
```

`temperature=0`으로 두면 결정적이라고 흔히 말하지만, 실제로는 ②가 남는다. 부동소수점 덧셈은 결합법칙이 성립하지 않아 $(a+b)+c \ne a+(b+c)$이고, GPU가 리덕션 순서를 배치 구성에 따라 바꾸면 로짓의 최하위 비트가 흔들린다. 상위 두 토큰의 로짓이 근접한 상황에서 argmax가 뒤집히면 그 뒤 생성 전체가 갈라진다. **재현성이 필요한 평가 파이프라인에서는 배치 크기까지 고정해야 하는 이유**가 이것이다.

## 언어를 수치로 바꾸기: 이산 표현

기계가 언어를 다루려면 수치화가 선행된다. 수집한 전체 말뭉치가 **Corpus**, 그중 태스크를 위해 뽑은 단어 집합이 **Vocabulary**다.

### One-hot과 Bag of Words

가장 단순한 방법은 $|V|$개 단어에 인덱스를 부여하고 해당 위치만 1인 벡터를 만드는 것이다. 문장은 단어 벡터의 합으로 표현하면 빈도 벡터, 즉 **BoW(Bag of Words)** 가 된다.

$$
\text{"아주 아주 위험 합니다"} \;\to\; [0,\ 0,\ 2,\ 1,\ 1]
$$

여기서 One-hot의 결정적 성질을 하나 짚고 가야 한다. **서로 다른 두 One-hot 벡터는 항상 직교한다.**

$$
\mathbf{e}_i \cdot \mathbf{e}_j = 0 \quad (i \ne j) \quad\Longrightarrow\quad \cos(\mathbf{e}_i, \mathbf{e}_j) = 0
$$

"사과"와 "오렌지"의 유사도가 0이고, "사과"와 "가방"의 유사도도 0이다. 값이 부정확한 게 아니라 **표현 공간이 유사도라는 개념 자체를 담을 수 없다.** 이후 모든 임베딩 연구의 출발점이 여기다.

### N-gram: 순서를 일부 되살리기

BoW는 순서 정보를 완전히 버린다. `(not good)`과 `(good not)`이 같은 벡터가 된다. N-gram은 연속된 $n$개 단어를 하나의 단위로 묶어 국소적 순서를 보존한다.

$$
\text{"I am studying bigram model"} \to \{\text{I am},\ \text{am studying},\ \text{studying bigram},\ \text{bigram model}\}
$$

문제는 vocabulary 크기다. 단어 수가 $|V|$일 때 bigram 공간은 최악의 경우 $|V|^2$, $n$-gram은 $|V|^n$으로 폭증한다. 실제 코퍼스에서 관측되는 조합은 그중 극히 일부라 **대부분의 카운트가 0**이 되고, 이것이 전통적 n-gram 언어모델에서 스무딩(Kneser-Ney 등)이 필수였던 이유다. $n$을 키울수록 문맥은 길어지지만 데이터 희소성이 기하급수적으로 악화된다.

### TF-IDF: 단어의 변별력

빈도만 보면 "은/는/이/가"가 가장 중요한 단어가 된다. TF-IDF는 **문서 내 빈도**와 **문서 간 희소성**을 곱해 변별력을 준다.

$$
\text{TF}(t,d) = \frac{\text{문서 } d \text{에서 } t \text{의 등장 횟수}}{\text{문서 } d \text{의 전체 단어 수}}
$$

$$
\text{IDF}(t,D) = \log\frac{|D|}{|\{d \in D : t \in d\}|}
$$

$$
\text{TF-IDF}(t,d,D) = \text{TF}(t,d)\times\text{IDF}(t,D)
$$

IDF의 로그가 하는 일이 핵심이다. 로그가 없으면 희소한 단어의 가중치가 문서 수에 선형으로 비례해 폭주한다. 로그를 씌우면 **문서 수가 10배 늘 때 가중치는 일정량만 증가**하도록 눌린다.

> 실무에서 쓰는 scikit-learn의 `TfidfVectorizer`는 슬라이드의 기본형이 아니라 평활화된 형태 $\text{IDF}(t) = \log\frac{1+n}{1+\text{df}(t)} + 1$ 을 쓴다. 분모가 0이 되는 것을 막고, 모든 문서에 등장하는 단어의 IDF가 0이 되어 완전히 소거되는 것도 방지한다. **손으로 계산한 값과 라이브러리 출력이 다른 이유가 대개 이것이다.**
{: .prompt-tip }

### 빈도 기반 표현의 한계

정리하면 셋이다.

**① 순서 소실** — BoW·TF-IDF는 토픽 분류나 문서 검색처럼 순서가 중요하지 않은 태스크에서는 지금도 강력한 베이스라인이다. 하지만 어순이 의미를 결정하는 태스크에서는 쓸 수 없다.

**② 차원 문제** — vocabulary가 커지면 벡터 차원이 그만큼 커진다. 이를 "차원의 저주"로 부르는데, 정확히 짚으면 두 가지가 겹쳐 있다. 하나는 **희소성**(대부분의 성분이 0이라 학습 신호가 부족)이고, 다른 하나는 **거리 집중 현상**이다. 차원 $d$가 커지면 임의의 두 점 사이 거리의 최댓값과 최솟값 비가 1로 수렴해, 거리 기반 유사도의 변별력 자체가 사라진다.

**③ 의미 부재** — 앞서 본 직교성 문제다. "동생"과 "아우"는 표기가 다르지만 의미가 같은데, One-hot 공간에서는 이 사실을 표현할 방법이 없다.

## 의미는 어디서 오는가

### Thesaurus라는 실패한 시도

세 번째 문제를 정면으로 풀려는 시도가 **사람이 직접 의미 관계를 구축하는 것**이었다. 프린스턴대가 1985년부터 만든 **WordNet**이 대표적이다. Synset(동의어 집합)을 노드로 두고 Hypernym(상위어)·Hyponym(하위어)·Meronym(부분 관계)을 엣지로 연결한 그래프다.

이 구조 위에서는 경로 길이로 유사도를 정의할 수 있다. NLTK로 `car`와 다른 단어들의 `path_similarity`를 재면 대략 이런 값이 나온다.

```text
car ↔ novel        0.0556
car ↔ dog          0.0769
car ↔ motorcycle   0.3333
```

관계의 방향은 맞다. 문제는 확장성이다.

- 신조어와 의미 변화를 따라가지 못한다
- 구축 비용이 막대하다 (WordNet은 수십 년의 인력 투입 결과다)
- 도메인마다 다시 만들어야 한다

**세상의 모든 단어를 사람이 정의하는 것은 불가능하다**는 결론이 여기서 나온다. 그렇다면 의미를 어디서 가져올 것인가.

### 분포가설

답은 언어학에서 왔다. **단어의 의미는 그 단어가 나타나는 문맥에 의해 결정된다**는 것이 분포가설(distributional hypothesis)이다.

```text
같은 부모에게서 태어난 형제 중 나이가 적은 쪽을 부를 때 [아우]라 부른다
친척 형제 혹은 같은 부모에게서 태어난 형제 중에서 나이가 적은 사람을 [동생]이라 부른다
   → 두 단어의 주변 문맥이 유사하다 → 두 단어의 의미가 유사하다
```

정의를 열거하지 않고도 **분포만 관찰하면** 유의어를 찾을 수 있다. Thesaurus가 못 한 일을 데이터가 대신한다.

#### 확인해 보니: 인용의 출처가 다르다

강의자료는 이 절의 제사(題辭)로 다음 문장을 Zellig Harris에게 귀속시켰다.

> "You shall know a word by the company it keeps."

원문을 확인해 보니 이 문장은 **J.R. Firth의 것**이다. Firth가 1957년 논문 *A Synopsis of Linguistic Theory 1930-1955*에서 쓴 표현이고, 분포주의 언어학을 대표하는 인용구로 자리 잡았다.

Zellig Harris는 1954년 *Distributional Structure*에서 **분포가설을 이론적으로 정식화**한 사람이다. 슬라이드 하단의 출처 표기(Harris, 1954)는 개념의 출처로서 정확하고, 잘못된 것은 문장의 귀속뿐이다.

| | 기여 |
|---|---|
| **Harris (1954)** | 분포가설의 정식화 — 분포가 다르면 의미가 다르다는 구조주의적 논증 |
| **Firth (1957)** | "You shall know a word by the company it keeps" — 같은 발상의 대중적 정식화 |

둘은 동시대 분포주의 전통을 공유하지만 다른 문헌이다. 사소해 보여도 NLP 논문 서론에서 반복 인용되는 문장이라, 잘못 귀속된 채로 두면 계속 재생산된다.

## Word2Vec: 분포가설의 신경망 구현

### 두 개의 아키텍처

분포가설을 **예측 문제**로 바꾼 것이 Word2Vec이다. 주변 단어와 중심 단어의 관계를 분류 문제로 정의하고, 그 부산물로 얻어지는 은닉층 가중치를 임베딩으로 쓴다.

강의자료의 예시는 `you say goodbye and i say hello.`에서 주변 단어(You, Say, And, I)를 입력, 중심 단어(Goodbye)를 타깃으로 두는 표였다. 확인해 보면 이건 두 아키텍처 중 **CBOW**에 해당하는데, 원 논문은 두 가지를 제안했고 성질이 꽤 다르다.

| | **CBOW** (Continuous Bag-of-Words) | **Skip-gram** |
|---|---|---|
| 입력 → 출력 | 문맥 $\to$ 중심 단어 | 중심 단어 $\to$ 문맥 |
| 목적함수 | $\log p(w_t \mid w_{t-k},\dots,w_{t+k})$ | $\sum_{-k \le j \le k,\, j\ne 0} \log p(w_{t+j} \mid w_t)$ |
| 학습 속도 | 빠름 (문맥을 평균내어 1회 예측) | 느림 (단어당 $2k$회 예측) |
| 저빈도어 | 약함 (평균에 묻힘) | **강함** |
| 실무 선호 | — | **Skip-gram + Negative Sampling(SGNS)** |

슬라이드의 표는 각 문맥 단어를 개별 행으로 나열해서 CBOW와 Skip-gram의 중간처럼 보이는데, CBOW는 문맥 벡터를 **평균(또는 합)내어 한 번에** 예측한다는 점이 핵심 차이다. 저빈도어에서 Skip-gram이 강한 이유도 여기서 나온다 — 평균을 내면 드문 단어의 신호가 흔한 단어에 희석되지만, Skip-gram은 각 (중심, 문맥) 쌍을 독립 샘플로 취급한다.

### 계산량 문제와 Negative Sampling

슬라이드는 이를 "분류(Classification) 문제로 정의한 후 학습"이라고 서술했는데, 이 표현을 그대로 구현하면 학습이 불가능하다. 출력층이 vocabulary 전체에 대한 softmax이기 때문이다.

$$
p(w_O \mid w_I) = \frac{\exp(\mathbf{v}'^{\top}_{w_O}\mathbf{v}_{w_I})}{\sum_{w=1}^{|V|}\exp(\mathbf{v}'^{\top}_{w}\mathbf{v}_{w_I})}
$$

분모가 $|V|$개 항의 합이다. $|V| = 10^6$이면 **샘플 하나당 100만 번의 내적**이 필요하고, 이를 모든 (중심, 문맥) 쌍에 대해 반복해야 한다.

Mikolov et al.의 두 번째 논문(NeurIPS 2013)이 제시한 해법이 **Negative Sampling**이다. 다중 클래스 분류를 이진 분류로 바꾼다.

$$
\log\sigma(\mathbf{v}'^{\top}_{w_O}\mathbf{v}_{w_I}) + \sum_{i=1}^{k}\mathbb{E}_{w_i \sim P_n(w)}\left[\log\sigma(-\mathbf{v}'^{\top}_{w_i}\mathbf{v}_{w_I})\right]
$$

"이 (중심, 문맥) 쌍이 실제 코퍼스에서 온 것인가, 무작위로 만든 가짜인가"를 판별하게 하고, 가짜는 $k$개(보통 5~20개)만 샘플링한다. 분모 계산이 사라지고 **샘플당 $k+1$번의 내적**으로 줄어든다.

노이즈 분포 $P_n(w)$로는 유니그램 분포의 $3/4$ 제곱을 썼다.

$$
P_n(w) = \frac{U(w)^{3/4}}{\sum_{w'} U(w')^{3/4}}
$$

지수 $3/4$는 이론적 유도가 아니라 실험적으로 고른 값이다. 이 지수는 흔한 단어의 확률을 눌러 드문 단어가 negative로 뽑힐 기회를 늘린다. 논문 자체가 "we found it to outperform significantly"라고만 적었을 뿐, 왜 하필 $3/4$인지에 대한 이론적 설명은 제시하지 않았다.

> 이 두 번째 논문에는 **subsampling of frequent words**도 함께 제안돼 있다. 빈도 $f(w)$인 단어를 확률 $1-\sqrt{t/f(w)}$로 버려서, "the" 같은 단어가 학습을 지배하는 것을 막는다. 학습 속도와 저빈도어 품질을 동시에 개선하는 트릭이라 실무에서는 negative sampling만큼 중요하다.
{: .prompt-tip }

### 벡터 산술: king − man + woman

Word2Vec이 유명해진 결정적 계기는 임베딩 공간에서 **선형 유추(linear analogy)** 가 작동한다는 관찰이었다.

$$
\mathbf{v}_{\text{king}} - \mathbf{v}_{\text{man}} + \mathbf{v}_{\text{woman}} \approx \mathbf{v}_{\text{queen}}
$$

`Spain:Madrid = Korea:Seoul` 같은 국가-수도 관계가 일정한 방향 벡터로 나타나는 시각화도 널리 인용된다.

#### 짚어둘 것: 이 결과는 평가 방식에 크게 의존한다

강의에서는 이 예시가 결론처럼 제시됐는데, 실제로는 후속 연구에서 상당한 비판을 받은 결과다. 알고 넘어갈 가치가 있다.

표준 평가는 **3CosAdd**를 쓴다.

$$
\hat{w} = \underset{w \in V \setminus \{a,\, a^*,\, b\}}{\arg\max} \cos\left(\mathbf{v}_w,\; \mathbf{v}_{a^*} - \mathbf{v}_a + \mathbf{v}_b\right)
$$

핵심은 $V \setminus \{a, a^*, b\}$ — **입력으로 쓴 세 단어를 후보에서 제외한다**는 조건이다. 이 제외 조건을 빼면 `king − man + woman`의 최근접 이웃은 대개 **`king` 자기 자신**이 된다. 벡터 연산의 결과가 원래 위치에서 크게 움직이지 않기 때문이다.

즉 "임베딩 공간이 성별 관계를 방향 벡터로 인코딩했다"는 해석은 과장이고, 실제로 일어나는 일은 **`king` 근처에서 `queen` 쪽으로 약간 기울어진 지점**을 찾은 뒤 `king`을 후보에서 빼는 것에 가깝다. Levy와 Goldberg가 이 문제를 지적하며 곱셈 기반 대안(3CosMul)을 제안했고, 이후 여러 후속 연구가 유추 태스크가 임베딩 품질의 지표로 과대평가되었음을 보였다.

같은 저자들의 다른 논문(NeurIPS 2014)은 더 근본적인 결과를 냈다. **SGNS는 shifted PMI 행렬의 암묵적 분해와 동치**라는 것이다.

$$
\mathbf{v}_w^{\top}\mathbf{v}'_c \;\approx\; \text{PMI}(w, c) - \log k
$$

여기서 $k$는 negative sample 개수다. 이 결과는 Word2Vec을 "신경망이라 잘 되는 것"이 아니라 **고전적 분포 의미론(count-based)의 효율적 근사**로 재해석하게 만들었다. GloVe가 명시적으로 공기 행렬을 분해하는 목적함수를 세운 것도 같은 흐름이다.

> 이 계보를 알아두면 실무 판단이 달라진다. 임베딩 품질을 유추 태스크 정확도로 평가하는 것은 **태스크 성능과 상관이 약하다**. 실제 다운스트림 태스크로 평가하거나, 최소한 유사도 상관(WordSim-353, SimLex-999) 같은 보완 지표를 함께 봐야 한다.
{: .prompt-warning }

## 언어모델과 순차 처리

### LM의 정의

언어모델은 **단어 시퀀스에 확률을 할당하는 모델**이다.

$$
P(w_1, w_2, \ldots, w_n) = \prod_{t=1}^{n} P(w_t \mid w_1, \ldots, w_{t-1})
$$

연쇄법칙으로 분해하면 결국 "앞의 문맥이 주어졌을 때 다음 단어의 확률"을 추정하는 문제가 된다. 강의의 예시대로 "퇴근 후 공항에 택시를 타고 갔는데, 탑승시간에 늦어서 결국 비행기를 (   )"에서 빈칸을 채우는 능력이 곧 언어 이해와 맞닿아 있다는 관점이다.

이 정의가 중요한 이유는 **GPT 계열이 지금도 정확히 이 목적함수만 쓴다**는 점이다. 아키텍처는 n-gram → RNN → Transformer로 바뀌었지만 풀고 있는 문제는 동일하다.

### RNN과 기울기 소실

문장은 순차 데이터이므로 시계열 모델이 자연스럽다. RNN은 hidden state $h_t$에 이전 문맥을 누적한다.

$$
h_t = \tanh(W_{hh}h_{t-1} + W_{xh}x_t + b)
$$

문제는 학습이다. BPTT에서 시점 $t$의 손실을 시점 $k$의 파라미터로 미분하면 야코비안의 곱이 나온다.

$$
\frac{\partial h_t}{\partial h_k} = \prod_{i=k+1}^{t}\frac{\partial h_i}{\partial h_{i-1}} = \prod_{i=k+1}^{t} W_{hh}^{\top}\,\text{diag}\big(\tanh'(\cdot)\big)
$$

같은 행렬이 $t-k$번 곱해진다. $W_{hh}$의 최대 특이값이 1보다 작으면 곱은 지수적으로 0에 수렴하고(**기울기 소실**), 1보다 크면 발산한다(**기울기 폭발**). 여기에 $\tanh' \le 1$이 곱해지므로 소실 쪽이 훨씬 흔하다.

이 분석은 Bengio et al.(1994)이 정식화했고, Hochreiter의 1991년 학위논문이 먼저 지적했다. 결과적으로 **시퀀스가 길수록 앞쪽 시점이 사실상 학습되지 않는다** — 장기 의존성 학습 실패다.

폭발은 gradient clipping으로 실용적 대응이 가능하지만, **소실은 clipping으로 해결되지 않는다.** 신호가 0으로 사라진 것을 되살릴 방법이 없기 때문이다. 구조를 바꿔야 했던 이유다.

### LSTM과 GRU

LSTM은 cell state $c_t$라는 별도 경로를 두고, 게이트로 정보 흐름을 제어한다.

$$
\begin{aligned}
f_t &= \sigma(W_f[h_{t-1}, x_t] + b_f) &&\text{(forget)}\\
i_t &= \sigma(W_i[h_{t-1}, x_t] + b_i) &&\text{(input)}\\
o_t &= \sigma(W_o[h_{t-1}, x_t] + b_o) &&\text{(output)}\\
c_t &= f_t \odot c_{t-1} + i_t \odot \tilde{c}_t\\
h_t &= o_t \odot \tanh(c_t)
\end{aligned}
$$

기울기 소실이 완화되는 이유는 $c_t = f_t \odot c_{t-1} + \cdots$ 라는 **덧셈 갱신** 구조에 있다. $\partial c_t/\partial c_{t-1} = f_t$ 이므로, forget gate가 1에 가까우면 기울기가 감쇠 없이 통과한다. RNN처럼 가중치 행렬이 반복 곱해지지 않는다.

> 여기서 한 가지 짚을 것이 있다. 강의자료를 포함해 많은 자료가 LSTM을 "Hochreiter & Schmidhuber, 1997"로 인용하면서 forget gate가 있는 그림을 함께 싣는데, **원 논문(1997)에는 forget gate가 없다.** 입력·출력 게이트만 있었고, cell state가 무한정 누적되어 포화되는 문제가 있었다. Forget gate는 Gers, Schmidhuber, Cummins가 2000년 *Learning to Forget*에서 추가한 것이고, 오늘날 "LSTM"이라 부르는 것은 이 확장판이다.
{: .prompt-warning }

GRU(Cho et al., 2014)는 게이트를 둘(reset, update)로 줄이고 cell state와 hidden state를 통합해 파라미터를 약 3/4로 줄였다. 성능은 태스크에 따라 엇갈리지만 대체로 비슷하고 학습이 빠르다.

### Seq2Seq와 병목

기계번역처럼 입력과 출력 길이가 다른 문제를 위해 Encoder-Decoder 구조가 등장했다(Sutskever et al., 2014). Encoder가 입력 전체를 하나의 **context vector**로 압축하고, Decoder가 그로부터 출력을 생성한다.

```text
I  am  a  student  →  [Encoder] → c → [Decoder] →  je  suis  étudiant
                                  ↑
                          고정 길이 벡터 하나
```

구조적 문제가 바로 보인다. **입력 길이와 무관하게 context vector의 차원이 고정**되어 있다. 10단어 문장이든 100단어 문단이든 같은 크기 벡터에 밀어 넣어야 하므로, 입력이 길어지면 정보가 소실되고 번역 품질이 급격히 떨어진다. Bahdanau et al.이 논문에서 실제로 문장 길이에 따른 BLEU 하락 곡선을 제시하며 지적한 문제다.

## Attention의 등장

### 매 시점 전체를 다시 보기

해법은 단순하다. **하나로 압축하지 말고, 디코더가 매 시점 인코더의 모든 hidden state를 다시 참조하게 한다.**

$$
c_i = \sum_{j=1}^{T_x} \alpha_{ij} h_j, \qquad
\alpha_{ij} = \frac{\exp(e_{ij})}{\sum_{k=1}^{T_x}\exp(e_{ik})}, \qquad
e_{ij} = a(s_{i-1}, h_j)
$$

디코더의 각 시점 $i$마다 **다른 context vector $c_i$** 를 만든다. $\alpha_{ij}$는 "출력 $i$를 만들 때 입력 $j$를 얼마나 볼 것인가"의 가중치이고, 이 값이 곧 정렬(alignment)에 해당한다. Bahdanau가 논문 제목에 "Jointly Learning to Align and Translate"를 넣은 이유다.

정렬 점수 함수 $a(\cdot)$의 선택지가 이후 갈렸다.

| 방식 | 점수 함수 | 출처 |
|---|---|---|
| Additive (concat) | $\mathbf{v}^{\top}\tanh(W[s;h])$ | Bahdanau et al., 2015 |
| Dot-product | $s^{\top}h$ | Luong et al., 2015 |
| General | $s^{\top}Wh$ | Luong et al., 2015 |

Luong의 dot-product 방식이 Transformer의 Scaled Dot-Product Attention으로 직결된다. 파라미터가 없고 행렬곱 한 번으로 계산되어 **GPU에서 압도적으로 빠르기** 때문이다.

#### 정확히 해둘 것: 병렬화는 attention이 아니라 recurrence 제거에서 온다

강의자료는 이 절에서 "Attention 기반의 병렬처리가 가능한 생성 모델 구조인 Transformer"라고 서술했는데, 인과를 분명히 해둘 필요가 있다.

```text
2015 Bahdanau Attention  =  RNN + Attention
                            → 장기 의존성은 개선
                            → 병렬화는 여전히 불가 (h_t 계산이 h_{t-1}에 의존)

2017 Transformer         =  Attention only, recurrence 제거
                            → 모든 시점을 동시에 계산 가능
                            → 병렬화 달성
```

**Attention 자체는 병렬화와 무관하다.** 2015~2016년의 attention 기반 NMT 모델들은 여전히 RNN 위에서 돌았고 순차 처리 제약을 그대로 안고 있었다. Transformer의 기여는 attention을 발명한 것이 아니라 **"recurrence 없이 attention만으로도 충분하다"는 것을 실증한 것**이고, 병렬화라는 실질 이득은 정확히 recurrence를 뺀 데서 나온다. 논문 제목이 "Attention Is All You Need"인 이유가 이것이다 — attention이 좋다는 주장이 아니라, **attention *만* 있으면 된다**는 주장이다.

### Contextual Embedding

Word2Vec의 근본 한계는 **한 단어 = 하나의 고정 벡터**라는 점이다.

```text
동음이의어   "배"  = 과일 / 선박 / 신체        → 항상 같은 벡터
다의어       "paper" = 종이 / 논문 / 과목      → 하나의 벡터에 섞임
문맥 의존    "cold beer" vs "cold weather"     → 뉘앙스 차이 반영 불가
```

Attention 기반 모델은 **같은 단어라도 문맥에 따라 다른 벡터**를 생성한다. `He deposited money in the bank`의 `bank`와 `They had a picnic on the river bank`의 `bank`가 임베딩 공간의 다른 지점에 놓인다.

> 강의는 이 대목을 "Transformer 기반(BERT, GPT 등) Contextual Embedding"으로 묶었는데, 계보를 정확히 하면 **최초의 널리 쓰인 contextual embedding은 ELMo(Peters et al., 2018)이고 이것은 Transformer가 아니라 양방향 LSTM 기반**이다. 즉 문맥 임베딩이라는 아이디어와 Transformer라는 아키텍처는 독립적인 기여다. ELMo가 "문맥에 따라 벡터를 바꾼다"를 먼저 보였고, BERT가 여기에 Transformer와 MLM(Masked Language Modeling) 사전학습을 결합해 성능을 끌어올렸다.
{: .prompt-warning }

## 전이학습과 GPT 계보

### Transfer Learning

딥러닝 모델이 최종 문제를 풀기 위해 중간 단계의 개념을 스스로 구조화하는 것을 **Representation Learning**이라 한다. 그 중간 표현을 유사한 데이터로 미리 학습해 두고 재사용하는 것이 **Transfer Learning**이다.

Vision에서 먼저 자리 잡았고(ImageNet 사전학습 → 파인튜닝), NLP에서는 Word Embedding이 1세대 pretrained model이었다. 다만 임베딩은 **입력층만** 전이한다는 한계가 있었고, ELMo·BERT·GPT에 이르러 **모델 전체**를 전이하는 형태로 발전했다.

### GPT 세 버전

| | 연도 | 논문 | 파라미터 | 핵심 |
|---|---|---|---|---|
| GPT-1 | 2018 | *Improving Language Understanding by Generative Pre-Training* | 117M | 사전학습 + 태스크별 파인튜닝 |
| GPT-2 | 2019 | *Language Models are Unsupervised Multitask Learners* | 1.5B | 파인튜닝 없이 zero-shot |
| GPT-3 | 2020 | *Language Models are Few-Shot Learners* | 175B | **In-context learning** |

GPT-3의 파라미터는 GPT-2의 약 117배로, 슬라이드의 "100배+"가 맞다.

> GPT-1의 제목은 확인해 보니 슬라이드 표기("Improving Language Understanding **with Unsupervised Learning**")와 다르다. 그쪽은 OpenAI **블로그 포스트**의 제목이고, 논문 제목은 "Improving Language Understanding **by Generative Pre-Training**"이다. 약어 GPT가 여기서 나온다.
{: .prompt-warning }

세 논문의 진짜 차이는 크기가 아니라 **패러다임**이다. GPT-1은 태스크마다 파인튜닝이 필요했고, GPT-2는 파인튜닝 없이도 일부 태스크가 되는 것을 보였으며, GPT-3는 **가중치를 전혀 갱신하지 않고 프롬프트 안의 예시만으로** 태스크를 수행하는 in-context learning을 제시했다. 앞서 본 Software 3.0의 "프롬프트가 프로그램"이라는 주장이 실증된 지점이 정확히 여기다.

### 학습 데이터

GPT-3의 학습 코퍼스 구성은 논문 Table 2.2에 있다.

| 데이터셋 | 토큰 수 | 학습 믹스 비중 | 300B 학습 시 epoch |
|---|---|---|---|
| Common Crawl (filtered) | 410B | 60% | 0.44 |
| WebText2 | 19B | 22% | 2.9 |
| Books1 | 12B | 8% | 1.9 |
| Books2 | 55B | 8% | 0.43 |
| Wikipedia | 3B | 3% | 3.4 |

#### 확인해 보니: 코퍼스 크기와 학습 토큰 수는 다르다

토큰 수를 더하면 $410 + 19 + 12 + 55 + 3 = 499\text{B}$, 약 500B다. 강의자료는 이를 "약 500bil Token이 포함된 데이터셋 학습"이라고 적었는데, **실제 학습에 사용한 토큰은 300B**다.

표의 마지막 열이 이 사실을 드러낸다. Common Crawl은 0.44 epoch만 돌았고(전체의 44%만 봤다), Wikipedia는 3.4 epoch을 돌았다(3.4번 반복해서 봤다). **데이터셋 크기에 비례해 샘플링하지 않고 품질에 따라 가중치를 다르게 준 것**이 GPT-3 데이터 전략의 핵심이다. 논문이 명시적으로 "which we intentionally do not make proportional to the size of the dataset"이라고 밝힌 부분이다.

같은 맥락에서 "45TB"라는 수치도 구분이 필요하다. 45TB는 **필터링 전 Common Crawl 원본**(압축 평문 기준)이고, 품질 필터링과 중복 제거를 거친 뒤에는 약 570GB로 줄었다. 데이터 규모를 인용할 때 세 숫자가 서로 다른 것을 가리킨다.

```text
45TB     Common Crawl 원본 (필터링 전)
570GB    필터링 후 Common Crawl
499B     전체 코퍼스 토큰 수
300B     실제 학습 토큰 수  ← 컴퓨트 예산이 결정한 값
```

## Transformer를 읽기 위한 선형대수

여기부터는 뒤의 Transformer 절을 위한 도구 정리다. 아는 내용이지만 **Attention 수식의 각 항이 무엇을 하는지 대응시키기 위해** 짚어둔다.

### 유사도와 거리

| | Similarity | Distance (Dissimilarity) |
|---|---|---|
| 질문 | 얼마나 닮았는가 | 얼마나 떨어져 있는가 |
| 값이 클 때 | 유사함 | 유사하지 않음 |
| 범위 | 척도에 따라 다름 | $[0, \infty)$ 인 경우가 많음 |

#### 확인해 보니: $1 - \text{Similarity} = \text{Distance}$ 는 일반적으로 성립하지 않는다

강의자료는 이 관계를 큰 글씨로 강조했는데, 이는 **정규화된 유사도에 한정된 항등식**이다.

성립하는 경우:

$$
d_{\cos}(\mathbf{a},\mathbf{b}) = 1 - \cos(\mathbf{a},\mathbf{b}), \qquad
d_{J}(A,B) = 1 - J(A,B)
$$

성립하지 않는 경우: **유클리드 거리는 상한이 없다.** $d(\mathbf{a},\mathbf{b}) \in [0,\infty)$ 이므로 $1 - s$ 형태로 쓸 수 없다. $\mathbf{a}=(0,0)$, $\mathbf{b}=(100,100)$이면 거리는 141.4인데, 어떤 유사도 $s \in [0,1]$을 넣어도 $1-s \le 1$이라 표현이 불가능하다.

슬라이드 자체에도 이 모순이 드러나 있다. 같은 페이지에서 Distance를 "최소값은 0, 서로 비슷하지 않을수록 값이 큼"이라고 **상한 없이** 정의해 놓고, 아래에서 $1 - s$로 쓰면 값이 $[0,1]$에 갇힌다. 두 서술이 양립하지 않는다.

> 하나 더. **코사인 거리는 거리 공리를 만족하지 않는다.** 삼각부등식이 깨진다. 진짜 metric이 필요하면 각거리 $d_\theta = \frac{1}{\pi}\arccos(\cos\theta)$를 써야 한다. k-NN이나 클러스터링에서 metric 가정을 쓰는 알고리즘(예: metric tree 기반 인덱싱)에 코사인 거리를 넣으면 조용히 틀린 결과가 나온다.
{: .prompt-danger }

### Euclidean Distance와 Cosine Similarity

$$
d(\mathbf{x}_i, \mathbf{x}_j) = \sqrt{\sum_{k=1}^{n}(x_{ik} - x_{jk})^2}
$$

$$
\cos(\mathbf{A},\mathbf{B}) = \frac{\mathbf{A}\cdot\mathbf{B}}{\|\mathbf{A}\|\|\mathbf{B}\|} = \frac{\sum_{i=1}^{n}A_iB_i}{\sqrt{\sum A_i^2}\sqrt{\sum B_i^2}}
$$

> 강의자료는 코사인을 "밑변길이 / 빗변길이"로 설명하면서 두 벡터 $\overrightarrow{AB}$, $\overrightarrow{AC}$에 대해 $\cos A = ac/ab$ 라고 적었는데, 이는 **직각삼각형에서만 성립하는 특수 케이스**다. 일반적으로 두 벡터가 이루는 각의 코사인은 위 내적 공식으로 정의되고, 기하학적으로는 **한 벡터를 다른 벡터 방향으로 정사영한 길이의 비**다. 임의의 삼각형 $ABC$에서 $\cos A = AC/AB$는 각 $C$가 직각일 때만 참이다.
{: .prompt-warning }

### 두 척도는 다른 것을 잰다

강의의 Case Study가 이 차이를 잘 보여준다. 세 문서를 (강아지, 고양이, 토끼) 빈도 벡터로 표현한다.

| | 내용 | 벡터 |
|---|---|---|
| 문서1 | 강아지 고양이 | $(1,1,0)$ |
| 문서2 | 강아지 고양이 토끼 | $(1,1,1)$ |
| 문서3 | 강아지×3 고양이×3 | $(3,3,0)$ |

직접 계산하면 두 척도가 정반대 답을 준다.

$$
d(\text{1},\text{2}) = \sqrt{0+0+1} = 1.000, \qquad d(\text{1},\text{3}) = \sqrt{4+4+0} = 2.828
$$

$$
\cos(\text{1},\text{2}) = \frac{2}{\sqrt{2}\sqrt{3}} = 0.8165, \qquad \cos(\text{1},\text{3}) = \frac{6}{\sqrt{2}\sqrt{18}} = 1.000
$$

- **유클리드 기준**: 문서2가 더 가깝다 (거리 1 < 2.83)
- **코사인 기준**: 문서3이 완전히 동일하다 ($\cos = 1$)

해석이 갈리는 이유가 명확하다. 문서3은 문서1과 **단어 구성비가 완전히 같고 길이만 3배**다. 코사인은 크기를 정규화하므로 이를 동일하게 보고, 유클리드는 크기 차이를 그대로 거리로 센다.

**문서 검색에서 코사인을 쓰는 이유가 이것이다.** 문서 길이가 제각각인데 길이 차이를 유사도 차이로 세면 긴 문서가 항상 불리해진다. 반대로 크기 자체가 의미를 갖는 경우(예: 절대 매출액 벡터)에는 유클리드가 맞다.

### 내적: Attention의 핵심 연산

$$
\vec{a}\cdot\vec{b} = |\vec{a}||\vec{b}|\cos\theta = \sum_{i=1}^{d} a_i b_i
$$

이 등식의 좌변과 우변이 각각 다른 이야기를 한다.

- **$|\vec{a}||\vec{b}|\cos\theta$**: 기하학적 의미 — 한 벡터를 다른 벡터에 정사영한 길이 × 그 벡터의 길이
- **$\sum a_i b_i$**: 계산 방법 — 성분별 곱의 합, $O(d)$

내적은 **크기와 방향을 모두 반영한 유사도**다. 정사영된 길이가 짧다 = 각도가 크다 = 유사도가 작다. 뒤에 나올 $QK^{\top}$가 정확히 이 연산이고, 코사인 유사도와 달리 **정규화를 하지 않는다**는 점이 $\sqrt{d_k}$ 스케일링이 필요해지는 원인이 된다.

### 행렬곱과 선형변환

행렬곱의 각 원소는 행 벡터와 열 벡터의 내적이다.

$$
A = \begin{bmatrix}2&1&3\\4&0&2\end{bmatrix},\quad
B = \begin{bmatrix}5&2\\1&4\\3&7\end{bmatrix}
\;\Longrightarrow\;
AB = \begin{bmatrix}20&29\\26&22\end{bmatrix}
$$

$(AB)_{11} = 2\cdot5 + 1\cdot1 + 3\cdot3 = 20$ 처럼 계산된다. 검산해 보니 슬라이드의 네 원소 모두 맞다.

**Matrix Multiplication = Row × Column Dot Products.** 이 한 줄이 Transformer 절 내내 쓰인다. Attention Score Matrix의 $(i,j)$ 원소가 "$i$번째 토큰이 $j$번째 토큰을 얼마나 주목하는가"인 이유가 바로 행렬곱의 정의다.

**선형변환**은 벡터의 덧셈과 스칼라배를 보존하면서 벡터를 다른 벡터로 옮기는 함수이고, 행렬곱이 그 계산 방법이다.

$$
T(\mathbf{u}+\mathbf{v}) = T(\mathbf{u})+T(\mathbf{v}), \qquad T(c\mathbf{v}) = cT(\mathbf{v})
$$

원점을 보존하고 직선을 직선으로 보낸다. 회전·확대·축소·반사, 그리고 차원 변경이 모두 여기 포함된다.

#### 검산해 보니: 예제의 결과가 다르다

강의자료의 첫 예제는 3차원 벡터를 2차원으로 보내는 변환이었다.

$$
\mathbf{x} = \begin{bmatrix}1&2&3\end{bmatrix},\qquad
W = \begin{bmatrix}2&0\\1&-1\\0&1\end{bmatrix}
$$

$$
\mathbf{x}W = \begin{bmatrix}
1(2)+2(1)+3(0) & 1(0)+2(-1)+3(1)
\end{bmatrix}
= \begin{bmatrix}\mathbf{4} & 1\end{bmatrix}
$$

슬라이드는 결과를 $[2, 1]$로 표기했지만, 계산하면 첫 성분은 $2+2+0 = 4$다. 두 번째 성분 $0-2+3=1$은 맞다.

변환의 요지 — 3차원 벡터가 $2\times$ 열이 2개인 행렬을 만나 2차원으로 사영된다 — 는 그대로 유효하다.

### 신경망 학습을 선형변환으로 보기

슬라이드의 두 번째 그림이 좋았다. 8개 단어를 10차원으로 표현한 $X\,(8\times10)$에 $W\,(10\times5)$를 곱하면 $Y\,(8\times5)$가 된다.

$$
\underbrace{X}_{8\times10} \times \underbrace{W}_{10\times5} = \underbrace{Y}_{8\times5}
$$

**딥러닝의 학습이란 $W$를 조금씩 수정해 데이터가 "의미 있는 위치"에 놓이도록 벡터 공간을 재배치하는 과정**이라는 정리가 정확하다. 단어가 변하는 것이 아니라 단어를 표현하는 벡터가 변한다.

이 관점이 곧이어 직접 쓰인다. $W^Q, W^K, W^V$는 같은 입력 임베딩을 **세 개의 서로 다른 부분공간으로 사영**하는 선형변환이고, "질의로서의 나 / 참조 대상으로서의 나 / 전달할 내용으로서의 나"라는 세 역할을 분리하는 장치다.

### Softmax

$$
\text{Softmax}(z_i) = \frac{e^{z_i}}{\sum_{j=1}^{n} e^{z_j}}
$$

실수 점수를 확률 분포로 바꾼다. 출력은 $[0,1]$, 합은 1, 그리고 **입력의 순서 관계를 보존**한다(단조 증가).

지수를 쓰는 이유가 중요하다. 단순히 $z_i / \sum z_j$로 정규화하면 음수가 처리되지 않고, 지수는 **차이를 증폭**한다. 점수 차 1은 $e^1 \approx 2.72$배의 확률 비로 변환된다. 이 증폭 성질이 attention에서 "주목할 곳에 집중"을 만들어내는 동시에, 입력 스케일이 커지면 분포가 one-hot에 가까워져 기울기가 죽는 원인이 된다. 뒤에 나올 $\sqrt{d_k}$ 스케일링이 바로 이 문제를 다룬다.

> 실제 구현은 오버플로 방지를 위해 항상 최댓값을 빼고 계산한다. $\text{Softmax}(z_i) = \frac{e^{z_i - \max_j z_j}}{\sum_j e^{z_j - \max_j z_j}}$ 로, 수학적으로 동일하지만 $e^{z}$가 `inf`가 되는 것을 막는다.
{: .prompt-tip }

검산해 보면 슬라이드의 예시 값은 근사치다. 점수 $(2.1,\ 1.3,\ 0.2,\ -0.5)$에 대한 정확한 softmax는 다음과 같다.

| 점수 | 슬라이드 | 계산값 |
|---|---|---|
| 2.1 | 0.58 | 0.5977 |
| 1.3 | 0.26 | 0.2685 |
| 0.2 | 0.09 | 0.0894 |
| −0.5 | 0.07 | 0.0444 |

앞의 세 개는 반올림 수준이지만 마지막 값은 0.07과 0.044로 차이가 있다. 개념 설명용 도식이라 정확도가 본질은 아니지만, 지수의 증폭 효과를 체감하려면 정확한 값이 낫다 — 점수 차이가 2.6일 때 확률 비가 13.5배($e^{2.6}$)라는 사실이 슬라이드 값(8.3배)보다 분명히 드러난다.

---

여기까지가 준비다. 이제 원 논문을 열고, 앞에서 정리한 문제들 — 고정 context vector의 병목, recurrence로 인한 순차 제약, 내적의 비정규화 — 이 각각 어떤 장치로 해결되는지 대응시킨다.

## Attention Is All You Need

### 문제의식

2017년 Google Brain·Google Research 팀이 NMT 연구 과정에서 낸 논문이다. 당시 주류였던 두 접근에 각각 한계가 있었다.

| 접근 | 한계 |
|---|---|
| RNN/LSTM/GRU 기반 Seq2Seq | $h_t$가 $h_{t-1}$에 의존 → **병렬화 불가**, 장기 의존성 여전히 취약 |
| CNN 기반 (ConvS2S, ByteNet) | 병렬화는 되지만 멀리 떨어진 토큰을 잇기 위해 **깊은 계층이 필요** |

CNN 쪽 한계가 특히 정량적으로 드러난다. 커널 크기 $k$인 합성곱으로 길이 $n$의 시퀀스 양 끝을 연결하려면 $O(n/k)$층(dilated면 $O(\log_k n)$층)이 필요하다. 즉 **두 토큰 사이의 경로 길이가 거리에 따라 늘어난다.**

논문의 제안은 단순하다. **RNN도 CNN도 없이 Self-Attention만으로 시퀀스를 처리한다.**

### 왜 이것이 통했는가

논문 Table 1의 비교가 이 아키텍처의 정당화 전부라고 봐도 된다. 강의자료에는 없는데, 설계 근거를 이해하는 데 가장 중요한 표다.

| 층 유형 | 층당 복잡도 | 순차 연산 | 최대 경로 길이 |
|---|---|---|---|
| **Self-Attention** | $O(n^2 \cdot d)$ | $O(1)$ | $\mathbf{O(1)}$ |
| Recurrent | $O(n \cdot d^2)$ | $O(n)$ | $O(n)$ |
| Convolutional | $O(k \cdot n \cdot d^2)$ | $O(1)$ | $O(\log_k n)$ |

두 열이 핵심이다.

**순차 연산 $O(1)$** — 모든 시점을 동시에 계산할 수 있다. GPU 활용률이 근본적으로 달라진다.

**최대 경로 길이 $O(1)$** — 임의의 두 토큰이 **단 한 번의 연산으로 직접 연결**된다. RNN에서 100단어 떨어진 토큰을 잇던 100단계의 곱셈 체인이 사라지므로, 시간축을 따라 장거리 정보를 전달할 때 생기던 기울기 문제를 크게 완화한다. 다만 여러 층을 통과하는 깊이 방향의 기울기 소실·폭주까지 구조적으로 제거되는 것은 아니다.

복잡도만 보면 $O(n^2d)$가 $O(nd^2)$보다 불리해 보이지만, **$n < d$이면 self-attention이 더 싸다.** 논문 당시 문장 단위 번역은 $n \approx 70$, $d = 512$였으므로 실제로 유리했다. 이 부등식이 뒤집히는 지점(긴 컨텍스트)이 이후 efficient attention 연구가 폭발한 이유다.

### 실험 결과

WMT 2014 기준 성능이다.

| 모델 | EN-DE BLEU | EN-FR BLEU | 학습 비용 (FLOPs) |
|---|---|---|---|
| GNMT + RL | 24.6 | 39.92 | $1.4\times10^{20}$ |
| ConvS2S | 25.16 | 40.46 | $1.5\times10^{20}$ |
| ConvS2S (Ensemble) | 26.36 | 41.29 | $1.2\times10^{21}$ |
| **Transformer (base)** | 27.3 | 38.1 | $\mathbf{3.3\times10^{18}}$ |
| **Transformer (big)** | **28.4** | **41.8** | $2.3\times10^{19}$ |

주목할 것은 BLEU가 아니라 오른쪽 열이다. base 모델은 **기존 최고 모델보다 두 자릿수 적은 연산량**으로 SOTA를 넘겼다. big 모델도 앙상블 대비 1/50 수준이다. 성능 향상보다 **효율 개선의 폭**이 이 논문의 진짜 충격이었고, 이것이 곧 "더 키울 수 있다"는 신호가 되어 LLM 시대를 열었다.

### 파라미터 구성 확인

base 모델의 하이퍼파라미터는 $d_{\text{model}}=512$, $h=8$, $d_k=d_v=64$, $d_{ff}=2048$, $N=6$이다. 논문이 밝힌 65M 파라미터와 맞는지 계산해 봤다.

$$
\begin{aligned}
\text{Encoder layer} &= \underbrace{4d_{\text{model}}^2}_{W^Q,W^K,W^V,W^O} + \underbrace{2\,d_{\text{model}}d_{ff}}_{\text{FFN}} = 1{,}048{,}576 + 2{,}097{,}152 = 3.15\text{M}\\
\text{Decoder layer} &= 3.15\text{M} + \underbrace{4d_{\text{model}}^2}_{\text{cross-attn}} = 4.19\text{M}
\end{aligned}
$$

| 구성 | 파라미터 |
|---|---|
| Encoder 6층 | $6 \times 3.15\text{M} = 18.9\text{M}$ |
| Decoder 6층 | $6 \times 4.19\text{M} = 25.2\text{M}$ |
| Embedding (입출력 공유) | $\approx 37{,}000 \times 512 \approx 19\text{M}$ |
| **합계** | $\approx 63\text{M}$ — 논문이 밝힌 65M과 일치 |

여기서 눈여겨볼 비율이 하나 있다. **원 논문의 encoder layer에서는 FFN이 self-attention보다 파라미터가 2배 많다.** $2 \times 512 \times 2048 = 2.1\text{M}$ vs $4 \times 512^2 = 1.05\text{M}$. 따라서 이 블록의 두 구성만 비교하면 파라미터의 3분의 2가 FFN에 있다. decoder의 cross-attention이나 embedding을 포함한 전체 모델, 또는 FFN 비율이 다른 현대 LLM까지 모두 같은 비율인 것은 아니다. MoE(Mixture of Experts)가 주로 FFN을 전문가로 쪼개는 이유를 이해하는 데는 이 비중이 중요한 단서가 된다.

## Self-Attention

### Q, K, V

입력 임베딩 $X$에 세 개의 학습 가능한 행렬을 곱해 세 표현을 만든다.

$$
Q = XW^Q, \qquad K = XW^K, \qquad V = XW^V
$$

| | 역할 | 비유 |
|---|---|---|
| **Q**uery | 내가 무엇을 찾고 있는가 | 검색어 |
| **K**ey | 나는 어떤 정보로 검색될 수 있는가 | 색인 |
| **V**alue | 내가 실제로 전달할 내용 | 문서 본문 |

앞서 정리한 선형변환 관점이 그대로 적용된다. **같은 입력을 세 개의 서로 다른 부분공간으로 사영**해 "질의로서의 나 / 참조 대상으로서의 나 / 전달할 내용으로서의 나"를 분리한다.

#### 왜 세 개로 분리하는가

강의에서 다루지 않은 부분인데, 설계 이해에 중요하다. 만약 $Q = K$라면(즉 $W^Q = W^K$) 어떻게 되는가?

$$
QK^{\top} = XW^Q(XW^Q)^{\top} = XW^Q W^{Q\top}X^{\top}
$$

이 **softmax 이전 score 행렬**은 대칭이다. 다만 행마다 분모가 다른 row-wise softmax를 거치면 최종 attention weight는 일반적으로 대칭이 아니다. 따라서 $Q=K$여도 비대칭 가중치와 의존 관계를 전혀 표현할 수 없는 것은 아니다. $W^Q \ne W^K$를 두면 질의와 참조 대상의 역할을 서로 다른 부분공간에서 학습하고, softmax 이전 score부터 비대칭으로 만들 수 있어 더 유연하다.

$V$를 따로 두는 이유도 같은 맥락이다. "누구를 볼지 결정하는 기준"과 "그 대상에서 실제로 가져올 내용"은 다른 정보일 수 있다. 검색 시스템에서 색인과 본문을 분리하는 것과 같다.

### Score Matrix

$$
S = QK^{\top} \in \mathbb{R}^{n\times n}
$$

$(i,j)$ 원소는 $i$번째 토큰의 query와 $j$번째 토큰의 key의 내적, 즉 **$i$번째 토큰이 $j$번째 토큰을 얼마나 주목하는가**다. 앞서 본 "행렬곱의 각 원소는 행 벡터와 열 벡터의 내적"이 그대로 쓰인다.

### $\sqrt{d_k}$ 스케일링

$$
\text{Attention}(Q,K,V) = \text{Softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}}\right)V
$$

강의는 "$d_k$가 커질수록 내적 값의 분산이 커져서 softmax의 기울기가 작아지는 문제를 해소"라고 설명했다. 정확하고 논문 각주의 서술과도 일치한다. 다만 **왜 하필 $\sqrt{d_k}$인지**는 유도해 두는 편이 낫다.

$q$와 $k$의 각 성분이 독립이고 평균 0, 분산 1이라 가정하자. 내적은

$$
q\cdot k = \sum_{i=1}^{d_k} q_i k_i
$$

각 항 $q_ik_i$에 대해 독립성으로부터

$$
E[q_ik_i] = E[q_i]E[k_i] = 0, \qquad
\text{Var}(q_ik_i) = E[q_i^2k_i^2] = E[q_i^2]E[k_i^2] = 1
$$

독립인 $d_k$개 항의 합이므로

$$
E[q\cdot k] = 0, \qquad \text{Var}(q\cdot k) = d_k, \qquad \text{sd}(q\cdot k) = \sqrt{d_k}
$$

**표준편차가 정확히 $\sqrt{d_k}$이므로, $\sqrt{d_k}$로 나누면 분산이 1로 정규화된다.** 이것이 그 값을 쓰는 이유다.

직접 난수 실험으로 확인해 봤다.

| $d_k$ | 측정 분산 | 이론값 | 표준편차 |
|---|---|---|---|
| 8 | 8.13 | 8 | 2.85 |
| 64 | 63.86 | 64 | 7.99 |
| 512 | 509.52 | 512 | 22.57 |

$d_k=512$면 로짓이 대략 $\pm 22$ 범위로 흩어진다. Softmax에 이런 값이 들어가면 어떻게 되는가.

$$
\text{Softmax}([22, 0, \ldots]) \;\to\; [\,\approx 1,\ \approx 0,\ \ldots\,]
$$

분포가 사실상 one-hot이 되고, 이 지점에서 softmax의 야코비안

$$
\frac{\partial p_i}{\partial z_j} = p_i(\delta_{ij} - p_j)
$$

이 $p_i \to 1$ 또는 $p_i \to 0$ 양쪽에서 모두 0으로 수렴한다. **기울기가 사라져 학습이 멈춘다.** 앞서 본 "지수가 차이를 증폭한다"는 성질의 부작용이 정확히 이 지점에서 나타난다.

> 스케일링을 $d_k$로 나누면(제곱근이 아니라) 분산이 $1/d_k$로 과도하게 눌려 softmax가 거의 균등분포가 되고, 이번엔 attention이 아무것도 선택하지 못한다. **$\sqrt{d_k}$는 두 극단 사이의 정확한 지점**이다.
{: .prompt-tip }

### 출력

$$
\text{Attention Output} = \underbrace{\text{Softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}}\right)}_{n\times n,\ \text{각 행의 합}=1} V
$$

각 행이 확률 분포이므로, 출력의 $i$번째 행은 **모든 토큰의 value를 주목도 비율로 섞은 가중평균**이다. 이것이 곧 문맥 벡터다.

여기서 정확히 해둘 점이 있다. **주어진 attention 가중치 하에서 출력은 $V$에 대해 선형(볼록결합)이다.** 즉 attention은 값들을 재조합할 뿐 새로운 특징을 만들지 못한다. 뒤에 나올 FFN이 필요한 이유가 여기서 나온다.

## Multi-Head Attention

### 관점의 분할

$$
\text{MultiHead}(Q,K,V) = \text{Concat}(\text{head}_1,\ldots,\text{head}_h)W^O
$$

$$
\text{head}_i = \text{Attention}(QW_i^Q,\ KW_i^K,\ VW_i^V)
$$

같은 시퀀스를 서로 다른 부분공간에서 여러 번 attend한다. 한 head는 문법적 의존(주어-동사 일치)에, 다른 head는 의미적 유사성에, 또 다른 head는 국소적 인접성에 특화되는 식이다.

### 계산량이 늘지 않는다

핵심 설계다. $h$개의 head를 두면서 **각 head의 차원을 $d_k = d_{\text{model}}/h$로 줄인다.**

$$
d_{\text{model}} = 512,\quad h = 8 \;\Longrightarrow\; d_k = d_v = 64
$$

$$
h \times (n^2 \cdot d_k) = 8 \times (n^2 \times 64) = n^2 \times 512 = n^2 \cdot d_{\text{model}}
$$

**attention 행렬곱의 선도항은 단일 head로 $d_{\text{model}}$ 전체를 쓰는 것과 같다.** 실제 실행 시간과 메모리는 head별 커널 호출, reshape, 병렬화 방식 같은 구현 오버헤드에 따라 달라질 수 있다. 공짜로 관점을 여러 개 얻는 것이 아니라, 하나의 넓은 관점을 여러 개의 좁은 관점으로 **분할**하는 것이다. 이 트레이드오프를 아는 것이 중요하다 — head 수를 늘리면 각 head의 차원은 그만큼 줄어든다.

### $W^O$는 왜 필요한가

강의가 이 부분을 잘 설명했다. Concat한 벡터는 **head별 특징이 흩어진 상태**다. 앞의 64차원은 문법 관점, 다음 64차원은 의미 관점 하는 식으로 블록이 나뉘어 있고, 이 블록들은 아직 서로 상호작용한 적이 없다.

$$
W^O \in \mathbb{R}^{hd_v \times d_{\text{model}}}
$$

$W^O$는 이 블록들을 **선형결합해 재조합**한다. 다음 층이 쓸 수 있는 통합 표현 공간으로 투영하는 과정이고, 이것이 없으면 head들이 끝까지 독립적인 채널로 남는다.

## Residual Connection과 Layer Normalization

### 원 논문의 구성

$$
\text{Output} = \text{LayerNorm}\big(x + \text{Sublayer}(x)\big)
$$

**Residual Connection**은 두 가지를 한다.

- **정보 보존**: attention이 계산한 값만 쓰면 원래 입력 정보가 손실될 수 있다. 기존 표현 위에 관계 정보를 *보강*하는 구조가 된다
- **기울기 경로 확보**: $\partial(x + F(x))/\partial x = I + \partial F/\partial x$ 이므로 항등 경로를 따라 기울기가 감쇠 없이 흐른다. 6층, 12층, 96층으로 쌓아도 학습이 되는 이유

**Layer Normalization**은 각 토큰의 특징 차원에 대해 정규화한다. Batch Normalization과 정규화 축이 다르다는 점이 중요하다.

$$
\text{LN}(x) = \gamma \odot \frac{x - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta,
\qquad \mu = \frac{1}{d}\sum_{i=1}^{d}x_i
$$

```text
BatchNorm : 배치 축으로 정규화  → 배치 크기에 의존, 시퀀스 길이가 다르면 곤란
LayerNorm : 특징 축으로 정규화  → 샘플 하나만으로도 계산 가능
```

가변 길이 시퀀스를 다루는 NLP에서 BatchNorm이 쓰기 어려운 이유가 이것이다. 패딩된 위치가 배치 통계를 오염시키고, 추론 시 배치 크기가 1이면 통계 자체가 무의미해진다.

### Post-LN과 Pre-LN

강의는 원 논문 그대로 $\text{LayerNorm}(x + \text{Sublayer}(x))$를 제시했다. 이를 **Post-LN**이라 부르는데, 현재 대부분의 LLM은 이 형태를 쓰지 않는다.

$$
\underbrace{x_{l+1} = \text{LN}\big(x_l + F(x_l)\big)}_{\textbf{Post-LN} \text{ — 원 논문}}
\qquad
\underbrace{x_{l+1} = x_l + F\big(\text{LN}(x_l)\big)}_{\textbf{Pre-LN} \text{ — 현대 LLM}}
$$

차이가 결정적이다. Post-LN에서는 residual 경로가 **LayerNorm을 통과**하므로 항등 경로가 깨진다. 층이 깊어질수록 초기 기울기가 불안정해지고, 원 논문 설정에서 학습률 warmup에 민감했던 이유가 여기 있다.

Pre-LN에서는 $x_l$에서 $x_{l+1}$로 가는 **순수한 항등 경로**가 유지된다. Xiong et al.(ICML 2020)은 이를 이론적으로 분석하고, 논문에서 시험한 설정에서는 warmup 없이도 안정적으로 학습할 수 있음을 보였다. 일반적으로 warmup이 언제나 불필요하다는 보장은 아니지만 의존도를 낮췄고, GPT-2 이후 널리 쓰이는 구성이 됐다.

| | Post-LN | Pre-LN |
|---|---|---|
| 채택 | Vaswani et al. 2017 | GPT-2 이후, LLaMA, PaLM 등 |
| Warmup | 설정에 민감 | 의존도가 낮음, 논문 실험에서는 생략 가능 |
| 최종 성능 | 잘 수렴시키면 약간 우세하다는 보고 | 안정성이 압도적 |
| 깊은 모델 | 깊어질수록 불안정해지기 쉬움 | 깊이 확장에 상대적으로 유리 |

> LLaMA 계열은 여기서 한 걸음 더 나가 **RMSNorm**을 쓴다. 평균을 빼는 연산을 생략하고 RMS로만 정규화하는데, 성능 손실 없이 연산이 줄어든다는 것이 Zhang & Sennrich(2019)의 결과다. 원 논문 코드를 읽다가 LLaMA 구현을 보면 `LayerNorm`이 `RMSNorm`으로 바뀌어 있는 이유다.
{: .prompt-tip }

## Position-wise Feed-Forward Network

$$
\text{FFN}(x) = \max(0,\ xW_1 + b_1)W_2 + b_2
$$

$d_{\text{model}}=512 \to d_{ff}=2048 \to d_{\text{model}}=512$로, 중간에서 **4배로 확장했다가 다시 압축**한다. "Position-wise"는 각 토큰에 독립적으로, 동일한 가중치로 적용된다는 뜻이다.

### 왜 필요한가

강의의 설명("Attention은 거의 선형변환의 조합이므로 표현력이 부족")은 방향이 맞는데, 정밀하게 다시 쓰면 이렇다.

Softmax 자체는 비선형이므로 attention 전체가 선형인 것은 아니다. 하지만 **attention 가중치가 정해지고 나면 출력은 $V$의 볼록결합**이다. 즉 attention은 기존 표현들을 *섞을* 수는 있어도 새로운 특징 축을 *만들* 수는 없다.

이 직관에는 정량적 근거도 있다. Dong et al.(ICML 2021)은 논문의 가정 아래 **skip connection과 FFN이 없는 순수 self-attention을 쌓으면 출력이 깊이에 대해 이중지수적으로 rank-1에 수렴한다**는 것을 증명했다. 모든 토큰의 표현이 하나의 방향으로 붕괴한다는 뜻이다. 논문 제목이 "Attention is Not All You Need"인 것이 이 결과를 압축한다. 이 이론적 설정에서는 FFN과 residual이 붕괴를 막는 핵심 요소다.

### 활성함수의 변천

원 논문은 ReLU를 썼지만 이후 계속 바뀌었다.

| 모델 | 활성함수 | 비고 |
|---|---|---|
| Transformer (2017) | ReLU | $\max(0,x)$ |
| BERT, GPT-2/3 | **GeLU** | $x\Phi(x)$, 0 근처에서 부드러움 |
| LLaMA, PaLM | **SwiGLU** | 게이트 구조, $d_{ff}$를 $\frac{2}{3}\times4d$로 조정해 파라미터 보정 |

SwiGLU는 게이트 때문에 행렬이 3개(원래 2개)라서, 파라미터를 맞추려고 $d_{ff}$를 $\frac{8}{3}d_{\text{model}}$ 수준으로 줄인다. LLaMA 설정 파일에서 `intermediate_size`가 4배가 아닌 어중간한 값인 이유다.

## Positional Encoding

### 문제

Self-Attention은 집합 연산이다. $QK^{\top}$는 토큰의 위치를 전혀 참조하지 않으므로, 입력 순서를 섞어도 각 토큰의 출력은 그대로다(순열 등변, permutation-equivariant).

```text
"나는 밥을 먹었다"  vs  "밥이 나를 먹었다"
   → attention 구조만으로는 구분 불가
```

Recurrence를 제거하면서 잃어버린 것이 정확히 **순서 정보**다. 이를 별도로 주입해야 한다.

### 사인파 인코딩

$$
PE_{(pos,\,2i)} = \sin\!\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right), \qquad
PE_{(pos,\,2i+1)} = \cos\!\left(\frac{pos}{10000^{2i/d_{\text{model}}}}\right)
$$

차원 인덱스 $i$에 따라 주파수가 기하급수적으로 달라진다. 낮은 차원은 빠르게 진동해 국소 위치를, 높은 차원은 천천히 진동해 전역 위치를 인코딩한다.

논문이 이 형태를 고른 이유는 **상대 위치가 선형변환으로 표현되기 때문**이다. 고정 오프셋 $k$에 대해 삼각함수 덧셈정리로부터

$$
\begin{bmatrix}\sin(\omega(pos+k))\\ \cos(\omega(pos+k))\end{bmatrix} =
\begin{bmatrix}\cos\omega k & \sin\omega k\\ -\sin\omega k & \cos\omega k\end{bmatrix}
\begin{bmatrix}\sin(\omega\,pos)\\ \cos(\omega\,pos)\end{bmatrix}
$$

우변의 행렬이 **회전행렬**이다. $PE_{pos+k}$가 $PE_{pos}$의 선형함수이므로 모델이 상대 위치를 학습하기 쉬울 것이라는 가설이었다.

논문은 학습형 위치 임베딩도 실험했고 성능이 거의 같았다고 보고한다. 사인파를 택한 명시적 이유는 **학습 시보다 긴 시퀀스로 외삽할 수 있을지 모른다**는 기대였다.

### 그 이후

그 기대는 실제로는 잘 실현되지 않았다. 절대 위치 인코딩은 학습 길이를 넘어가면 성능이 급격히 무너진다. 현재 표준은 다른 접근이다.

**RoPE (Rotary Position Embedding)** — 위치 정보를 임베딩에 *더하지* 않고, query와 key 벡터를 위치에 비례한 각도만큼 **회전**시킨다.

$$
\langle R_m q,\; R_n k\rangle = \langle q,\; R_{n-m}k \rangle
$$

내적의 **위치 의존성이 상대 거리 $n-m$로만 들어가게** 되어, 상대 위치를 구조적으로 표현한다. 내적 값 전체는 회전 전 $q,k$의 내용에도 당연히 의존한다. 위 사인파 유도에 등장한 회전행렬을 attention 내부로 옮긴 셈이다. LLaMA, Qwen, Mistral 등 대부분의 오픈 LLM이 채택했다.

**ALiBi** — 위치 임베딩을 아예 없애고 attention score에 거리 비례 페널티를 더한다.

$$
\text{score}_{ij} = q_i k_j^{\top} - m\cdot|i-j|
$$

구현이 단순하고 외삽 성능이 좋다.

> 컨텍스트 길이 확장 기법 중 Position Interpolation은 RoPE에 넣는 position index를 기존 범위로 선형 축소하고 짧게 파인튜닝한다. 회전 각도의 base나 주파수를 조정하는 방법은 별도의 RoPE scaling 계열이다. 절대 위치 인코딩도 보간·확장 기법이 있으므로 RoPE만 가능한 일은 아니지만, 상대 위치 구조를 이용해 긴 문맥으로 확장하기 편하다는 장점이 있다.
{: .prompt-tip }

## Decoder

### Masked Self-Attention

Encoder의 self-attention은 양방향이다. 모든 토큰이 모든 토큰을 본다. 그런데 **생성**에서는 이것이 성립하면 안 된다. 다음 토큰을 예측하는 시점에 그 답을 이미 보고 있다면 학습이 무의미하다.

해결은 미래 위치를 가리는 것이다.

$$
\text{mask}_{ij} = \begin{cases}0 & j \le i\\ -\infty & j > i\end{cases}
\qquad
\text{Attention} = \text{Softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_k}} + \text{mask}\right)V
$$

**구현상 중요한 점**: softmax 이후에 0을 대입하는 것이 아니라, **softmax 이전에 $-\infty$(실제로는 `-1e9` 같은 큰 음수)를 더한다.** $e^{-\infty}=0$이 되어 자연스럽게 확률 0이 되고, 남은 위치들의 합이 1로 정규화된다. 사후에 0을 넣으면 행의 합이 1이 아니게 되어 가중평균이 깨진다.

강의자료의 마스크 예시를 검산해 보면 이 성질이 정확히 반영돼 있다.

| | I | study | AI | hard | 행 합 |
|---|---|---|---|---|---|
| I | 1.0 | — | — | — | 1.0 |
| study | 0.3 | 0.7 | — | — | 1.0 |
| AI | 0.1 | 0.3 | 0.6 | — | 1.0 |
| hard | 0.3 | 0.2 | 0.1 | 0.4 | 1.0 |

각 행이 정확히 1로 정규화되어 있다. 마스킹 후 재정규화가 제대로 반영된 예시다.

### 빠진 조각: Cross-Attention

강의는 Decoder를 "인코딩된 벡터와 자기 자신의 출력에 대한 masked self-attention을 통해 목표 문장을 생성"이라고 서술했는데, 이 문장은 두 개의 서로 다른 sublayer를 하나로 합쳐 놓았다. **Decoder 층에는 attention이 두 개 있다.**

$$
\begin{aligned}
&\text{① Masked Self-Attention} && Q,K,V \leftarrow \text{decoder 자신}\\
&\text{② Cross-Attention} && Q \leftarrow \text{decoder},\quad K,V \leftarrow \textbf{encoder 출력}\\
&\text{③ FFN}
\end{aligned}
$$

Cross-attention이 정확히 **앞서 본 Bahdanau attention의 자리**다. 디코더가 매 시점 인코더의 전체 출력을 다시 참조하는 그 연산이고, Seq2Seq의 고정 context vector 병목을 푸는 장치다. 이것이 빠지면 인코더와 디코더가 연결되지 않는다.

정리하면 Transformer에는 세 종류의 attention이 있다.

| 위치 | Q 출처 | K, V 출처 | 마스킹 |
|---|---|---|---|
| Encoder self-attention | Encoder | Encoder | 없음(양방향) |
| Decoder masked self-attention | Decoder | Decoder | **인과 마스크** |
| **Decoder cross-attention** | Decoder | **Encoder** | 없음 |

세 번째 행이 강의자료에서 설명되지 않은 부분이다.

### 학습: Loss는 어디서 계산되는가

강의는 "Training step마다 Attention Score와 Ground Truth를 비교하여 Loss 계산"이라고 적었는데, 확인해 보니 이 서술은 정확하지 않다.

Attention score는 **중간 표현**이고 정답 레이블이 존재하지 않는다. 실제 학습 신호는 다음 경로로 흐른다.

```text
Decoder 최종 출력 (n × d_model)
   → Linear (d_model → |V|)        ← 어휘 크기로 투영
   → Softmax                        ← 어휘에 대한 확률 분포
   → Cross-Entropy(예측분포, 정답 다음 토큰)
```

$$
\mathcal{L} = -\frac{1}{n}\sum_{t=1}^{n}\log P(w_t \mid w_{<t})
$$

즉 **최종 로짓과 정답 토큰 사이의 cross-entropy**다. Attention score는 이 손실을 역전파하는 과정에서 간접적으로 학습될 뿐, 직접적인 감독 대상이 아니다. 이 구분이 중요한 이유는, attention 가중치를 "모델이 무엇을 보는지에 대한 설명"으로 해석할 때의 한계와 직결되기 때문이다. Attention은 명시적으로 정렬을 학습하도록 감독받은 적이 없다.

학습 시에는 **Teacher Forcing**을 쓴다. 디코더 입력으로 모델의 이전 출력이 아니라 정답 시퀀스를 오른쪽으로 한 칸 민 것(`shifted right`)을 넣는다. 인과 마스크 덕분에 모든 시점의 손실을 **한 번의 forward로 병렬 계산**할 수 있고, 이것이 학습 속도의 핵심이다.

### 추론: 여기서는 병렬화가 안 된다

주의할 비대칭이 있다.

```text
학습  : teacher forcing + causal mask  →  전체 시퀀스 1회 forward, 완전 병렬
추론  : 토큰을 하나 생성 → 입력에 붙임 → 다시 forward → 반복
        → 순차적, 병렬화 불가
```

"Transformer는 병렬 처리가 된다"는 서술은 **학습에 대한 이야기**다. 자기회귀 생성은 본질적으로 순차적이고, 이것이 LLM 추론 지연의 근본 원인이다.

매 스텝 전체를 다시 계산하지 않기 위해 **KV Cache**를 쓴다. 이전 토큰들의 $K$, $V$는 바뀌지 않으므로 저장해 두고 새 토큰의 것만 계산한다. 대신 메모리를 먹는다.

$$
\text{KV Cache 크기} = 2 \times n_{\text{layers}} \times n_{\text{heads}} \times d_{\text{head}} \times n_{\text{tokens}} \times \text{bytes}
$$

긴 컨텍스트에서 이 값이 모델 가중치보다 커지는 일이 흔하고, **MQA / GQA**가 등장한 이유가 이것이다. 여러 query head가 key/value head를 공유해 캐시 크기를 $h$배 줄인다.

## 계산 복잡도와 그 이후

Self-attention의 $O(n^2 d)$는 시퀀스가 길어지면 치명적이다.

| 컨텍스트 | 상대 연산량 |
|---|---|
| 512 | 1× |
| 4,096 | 64× |
| 32,768 | 4,096× |

이 벽을 넘으려는 연구가 여러 갈래로 나왔다.

| 접근 | 대표 | 아이디어 |
|---|---|---|
| 희소 attention | Longformer, BigBird | 전체가 아닌 국소 + 전역 일부만 attend |
| 저랭크 근사 | Linformer, Performer | $n\times n$ 행렬을 근사해 선형 복잡도 |
| **IO 최적화** | **FlashAttention** | 복잡도는 그대로, **GPU 메모리 계층**을 활용해 실측 속도 개선 |
| KV 압축 | MQA, GQA | 추론 시 캐시 축소 |

이 중 실제로 가장 널리 채택된 것은 FlashAttention이다. 시사점이 있다 — 근사를 도입한 방법들은 품질 손실 때문에 널리 쓰이지 못했고, **정확한 attention을 유지하면서 메모리 접근 패턴만 바꾼** 접근이 이겼다. $O(n^2)$이라는 점근 복잡도는 그대로인데도 실측 속도와 메모리가 크게 개선됐다. 병목이 연산이 아니라 HBM과 SRAM 사이의 데이터 이동이었다는 관찰이 핵심이었다.

## Encoder-Decoder에서 Decoder-only로

원 논문은 번역이 목표라 encoder-decoder 구조였다. 이후 계보가 셋으로 갈렸다.

| 구조 | 대표 | 사전학습 | 강점 |
|---|---|---|---|
| Encoder-only | BERT | MLM (양방향) | 분류, 개체명 인식, 문장 이해 |
| **Decoder-only** | **GPT, LLaMA** | **다음 토큰 예측** | **생성, 그리고 사실상 모든 것** |
| Encoder-Decoder | T5, BART | Span corruption | 요약, 번역 |

현재 LLM은 대부분 decoder-only다. 이유는 **다음 토큰 예측이라는 단일 목적함수가 확장성이 가장 좋기 때문**이다. 레이블이 필요 없어 웹 전체를 학습 데이터로 쓸 수 있고, 태스크별 헤드 설계가 없으며, in-context learning으로 거의 모든 태스크를 흡수한다.

앞서 정리한 언어모델의 정의 $P(w_1,\ldots,w_n)=\prod_t P(w_t\mid w_{<t})$ 가 결국 승자가 된 셈이다. 아키텍처는 n-gram → RNN → Transformer로 바뀌었지만 **목적함수는 처음부터 같았다.**

## 정리

1일차는 **Transformer가 등장하기까지 무엇이 막혀 있었고, 그것을 어떻게 풀었는가**의 기록이다.

**표현학습의 계보**

- **One-hot은 서로 다른 단어를 항상 직교시킨다.** 유사도라는 개념 자체가 표현 공간에 없다
- **빈도 기반 표현은 순서·차원·의미 세 곳에서 막힌다.** 토픽 분류에서는 여전히 유효한 베이스라인이지만 그 이상은 어렵다
- **의미는 사람이 정의하는 대신 분포에서 얻는다.** Harris(1954)의 정식화, Firth(1957)의 문장
- **Word2Vec은 분포가설을 예측 문제로 바꿨고, Negative Sampling이 이를 계산 가능하게 만들었다.** SGNS는 shifted PMI 행렬 분해와 동치다
- **`king − man + woman = queen`은 평가 방식(입력 단어 제외)에 크게 의존한다.** 유추 태스크는 임베딩 품질의 신뢰할 만한 지표가 아니다
- **RNN의 기울기 소실은 야코비안의 반복 곱에서 나오고, clipping으로 해결되지 않는다.** LSTM의 덧셈 갱신이 구조적 해법이었다
- **Seq2Seq의 병목은 고정 길이 context vector**이고, Attention은 매 시점 다른 context를 만들어 이를 푼다
- **문맥 임베딩과 Transformer는 독립적인 기여다.** ELMo는 LSTM 기반이었다

**Transformer의 설계**

- **Transformer의 기여는 attention이 아니라 recurrence 제거**다. 최대 경로 길이 $O(1)$과 순차 연산 $O(1)$이 그 결과이고, 시간축 장거리 기울기 전달을 크게 완화하지만 깊이 방향의 소실·폭주까지 제거하지는 않는다
- **$Q \ne K$는 질의와 참조 대상의 역할을 분리한다.** $W^Q=W^K$면 softmax 전 score는 대칭이지만 row-wise softmax 뒤 가중치는 비대칭일 수 있다. 별도 사영은 비대칭 score까지 허용한다
- **$\sqrt{d_k}$는 내적의 표준편차**다. $\text{Var}(q\cdot k)=d_k$ 이므로 나누면 분산이 1이 되고, softmax가 포화되어 기울기가 죽는 것을 막는다
- **Multi-head는 공짜가 아니다.** $d_k = d_{\text{model}}/h$로 나누면 attention 행렬곱의 선도 연산량은 같지만 실제 비용은 구현 오버헤드에 따라 달라진다. 관점의 수와 각 관점의 차원이 트레이드오프다
- **원 논문 encoder block의 self-attention과 FFN만 비교하면 파라미터의 2/3가 FFN에 있다.** 전체 모델과 다른 LLM에 그대로 적용되는 고정 비율은 아니다
- **논문의 가정 아래 FFN과 residual이 없는 순수 attention 스택은 rank-1로 붕괴한다.** 이 설정에서 두 장치는 붕괴를 막는 핵심 요소다
- **원 논문은 Post-LN, 현대 LLM은 주로 Pre-LN**이다. 항등 경로 보존 여부가 warmup 의존도와 깊이 확장성에 영향을 준다
- **마스킹은 softmax 이전에 $-\infty$를 더한다.** 사후에 0을 넣으면 행 합이 1이 아니게 된다
- **Decoder에는 attention이 둘**이다. Masked self-attention과 cross-attention이며, 후자가 Bahdanau attention의 자리다
- **Loss는 최종 로짓과 정답 토큰 사이**에서 계산된다. Attention score는 감독 대상이 아니며, 이 사실이 attention을 해석 도구로 쓸 때의 한계와 직결된다
- **병렬화는 학습에 대한 이야기**다. 자기회귀 추론은 순차적이고, KV cache와 GQA가 그 비용을 다룬다

원 논문을 다시 읽으면서 새삼 인상적이었던 것은 **Table 1의 간결함**이다. 복잡도·순차성·경로 길이 세 열로 아키텍처 선택의 근거를 전부 설명한다. 성능 표가 아니라 이 표가 논문의 논증이고, 이후 8년간의 발전이 대부분 이 표의 첫 열($O(n^2d)$)을 공격하는 방향이었다는 점도 그렇다.

강의는 원 논문 기준으로 잘 구성되어 있었고, 위에 정리한 Pre-LN·RoPE·SwiGLU·GQA 같은 항목은 강의 범위를 넘어선 보충이다. 다만 **논문의 그림과 현재 코드가 다르다**는 사실 자체는 알고 있어야 실무에서 혼란이 없다.

아키텍처는 여기서 사실상 완성됐다. 그런데 2017년의 Transformer와 지금의 LLM 사이에는 아직 큰 간극이 있다. **다음 토큰 예측만 배운 모델이 어떻게 지시를 따르게 되는가**(RLHF), **얼마나 키워야 하는가**(Scaling Law), **어떻게 작게 만드는가**(Distillation), **모든 파라미터를 항상 써야 하는가**(MoE). 2일차는 아키텍처 위에 쌓인 이 네 층을 다룬다.

---

시리즈 안내: [LLM과 Transformer 아키텍처 — 2일 학습 로드맵](/posts/skala-transformer-roadmap/)

다음 글: [2일차 — Modern LLM: RLHF, Scaling Law, Distillation, MoE](/posts/skala-transformer-day2/)
