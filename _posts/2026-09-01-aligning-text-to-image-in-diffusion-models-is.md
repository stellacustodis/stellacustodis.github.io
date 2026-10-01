---
title: "Aligning Text to Image in Diffusion Models is Easier Than You Think"
date: 2026-09-01 21:00:00 +0900
permalink: /posts/aligning-text-to-image-in-diffusion-models-is/
categories:
  - AI
  - Paper Review
tags: [paper-review, diffusion, text-to-image, representation-alignment, parameter-efficient-finetuning]
description: "고정된 text-to-image 확산 모델의 생성 오차를 대조학습 점수로 바꾸고, layer별 soft text token만 학습하는 SoftREPA의 원리와 정렬-품질 trade-off를 정리한다."
related: [repa, sd3, ldm, ddim]
paper:
  authors: "Jaa-Yeon Lee, ByungHee Cha, Jeongsol Kim, Jong Chul Ye"
  venue: "The Thirty-ninth Annual Conference on Neural Information Processing Systems"
  url: "https://openreview.net/forum?id=ToMjBgXwhw"
  code: "https://github.com/softrepa/SoftREPA"
---

> SoftREPA가 고정된 확산 모델의 오차를 어떻게 image--text 대조 점수로 바꾸는지, 그리고 정렬 향상과 이미지 품질 사이에 어떤 대가가 남는지를 중심으로 읽었다.

## 세 줄 요약

SoftREPA는 짝이 맞는 image--text pair만으로 학습하는 기존 denoising/flow-matching 목적에, 같은 batch의 틀린 caption을 negative로 사용하는 대조학습 압력을 더한다. 사전학습된 생성 모델은 고정하고 layer와 timestep에 따라 달라지는 soft text token만 학습하므로 추가 파라미터는 100만 개 미만이다. SD1.5ㆍSDXLㆍSD3에서 text alignment와 human-preference 지표는 대체로 좋아지지만, SDXL/SD3의 FIDㆍLPIPS와 SD3의 counting은 악화되어 “더 잘 맞는 그림”과 “더 좋은 그림”이 같은 목표가 아님을 함께 보여준다.

## REPA 다음에 무엇이 달라졌나

이름 때문에 먼저 [REPA 리뷰](/posts/repa/)와의 관계를 분리해 둘 필요가 있다. REPA는 노이즈가 섞인 DiT의 **이미지 중간 표현**을 깨끗한 이미지에서 얻은 외부 자기지도 시각 표현에 맞춘다. 생성 모델을 처음 학습할 때 의미 표현까지 함께 배워야 하는 부담을 줄이는 보조 정규화이며, projection head와 외부 encoder 경로는 추론에서 떼어낼 수 있다.

SoftREPA가 고르는 축은 다르다. 이미 학습된 text-to-image backbone은 얼리고, 외부 image encoder도 사용하지 않는다. 대신 한 이미지에 맞는 문장을 넣었을 때의 생성 오차는 작게, batch 안의 틀린 문장을 넣었을 때의 오차는 크게 만들도록 **텍스트 쪽 soft token**만 학습한다. 이 token은 추론 때도 각 layer에 들어간다.

| 구분 | REPA | SoftREPA |
|---|---|---|
| 맞추는 대상 | noisy image hidden state와 clean vision feature | matched/mismatched text condition에서의 생성 오차 |
| 외부 encoder | 고정된 self-supervised image encoder 필요 | 필요 없음 |
| 학습 대상 | 생성 backbone과 projection head | layer/time별 soft text token만 |
| 적용 시점 | 주로 생성 모델의 사전학습 | 학습된 T2I 모델의 post-hoc 보정 |
| 추론 | 정렬 경로 제거 가능 | 학습한 token을 계속 삽입 |

둘의 공통점은 내부 표현을 의미적으로 더 유용한 방향으로 유도한다는 관점이고, 감독 신호와 배포 방식은 전혀 다르다. 그래서 이 글에서는 REPA의 수렴 가속 논의를 반복하지 않고, SoftREPA의 positive/negative 조건부 생성 오차에 초점을 맞춘다.

## 문제 — 양성 쌍만으로는 무엇이 빠져 있는가

일반적인 [Latent Diffusion Models](/posts/ldm/) 계열은 이미지 $x$와 그 caption $y$가 주어지면, 노이즈 $\epsilon$이나 velocity를 정확히 예측하도록 학습한다. 짝이 맞는 조건에서의 생성 오차를 줄이는 데에는 충실하지만, 같은 이미지에 **맞지 않는** 문장 $y'$가 주어졌을 때 그 오차를 얼마나 키워야 하는지는 직접 배우지 않는다.

이 차이는 분류 문제로 비유하면 선명하다. 정답 class의 logit만 높이고 나머지 class와의 상대적 간격을 보지 않는 것과 비슷하다. 저자들은 image--text alignment를 위해서는 `(x_i,y_i)`라는 positive만 잘 복원하는 것보다 `(x_i,y_j), i\ne j`라는 negative와의 간격까지 명시해야 한다고 본다. 별도의 human preference dataset을 만들지 않고, 원래의 paired dataset과 in-batch mismatch만으로 negative를 얻는 점이 실용적인 출발점이다.

flow model 배경은 다음 한 식이면 충분하다. 데이터 $x_0$와 Gaussian noise $x_1=\epsilon$ 사이에 선형 경로를 두면

$$
x_t=(1-t)x_0+t\epsilon,
\qquad
u_t=\epsilon-x_0.
\tag{1}
$$

conditional flow matching은 모델 $v_\theta(x_t,t,y)$가 target velocity $u_t$를 맞추게 한다. [Stable Diffusion 3](/posts/sd3/)처럼 rectified-flow parameterization을 쓰는 모델에서는 이 오차를, noise prediction 모델에서는 denoising 오차를 그대로 조건의 적합도를 재는 재료로 쓸 수 있다. 원문 Eq. 1--7은 이 flow ODE가 [DDIM](/posts/ddim/)의 probability-flow ODE와 연결됨을 정리하지만, SoftREPA의 새 기여는 flow 이론 자체가 아니라 **그 오차를 대조 점수로 재사용하는 방식**이다.

## 방법 1 — 생성 오차를 대조학습 점수로 바꾸기

batch에 $n$개의 matched pair $\{(x^{(i)},y^{(i)})\}_{i=1}^n$가 있다고 하자. 논문의 contrastive T2I 목적은 image $i$에 대해 올바른 caption $i$의 점수를 분자에, batch 안의 모든 caption을 분모에 둔다.

$$
\mathcal L_{
\mathrm{T2I}}
=
-\frac{1}{n}\sum_{i=1}^{n}
\log
\frac{\exp\!\left(l(x^{(i)},y^{(i)})\right)}
{\sum_j \exp\!\left(l(x^{(i)},y^{(j)})\right)}.
\tag{2}
$$

형태는 InfoNCE와 같지만, 별도의 CLIP embedding cosine similarity가 아니라 **고정된 생성 모델의 예측 오차**로 $l$을 만든다. flow model에서는

$$
l(x,y)
=
\exp\!\left(
-\frac{
\mathbb E_{t,\epsilon}
\left[
\left\|
v_\theta(x_t,t,y)-(\epsilon-x_0)
\right\|_2^2
\right]
}{\tau(t)}
\right).
\tag{3}
$$

matched caption이 주어지면 velocity error가 작아 $l$이 커지고, mismatched caption에서는 error가 커져 $l$이 작아진다. noise-prediction diffusion에서는 $v_\theta-(\epsilon-x_0)$ 대신 $\epsilon_\theta-\epsilon$을 쓴다.

여기에는 지수가 두 겹 등장해 읽을 때 주의가 필요했다. Eq. (3) 자체가 음의 오차를 exponential로 감싼 bounded similarity이고, Eq. (2)가 다시 `exp(l)`을 취해 softmax를 만든다. 저자들은 $-\|\epsilon_\theta-\epsilon\|^2$를 그대로 similarity로 사용하면 값이 아래로 unbounded여서 학습이 불안정했다고 보고한다. 바깥쪽 exponential은 작은 오차와 큰 오차의 차이를 유한 범위로 눌러 안정화하는 선택이다.

내가 보기에 이 부분이 SoftREPA의 핵심이다. “soft prompt를 학습했다”만 보면 익숙한 parameter-efficient tuning처럼 보이지만, token을 움직이는 감독 신호는 text encoder의 embedding 거리가 아니다. 이미 image--text joint distribution을 배운 generator 자체를 판별기처럼 재사용하고, 올바른 조건과 틀린 조건에서의 생성 가능성을 비교한다.

## 방법 2 — layer와 시간마다 다른 soft token

backbone 전체를 업데이트하면 계산량과 catastrophic forgetting 위험이 커진다. SoftREPA는 pretrained parameter $\theta$를 고정하고, layer $k$와 diffusion time $t$로 색인된 token만 학습한다.

$$
s^{(k,t)}=\operatorname{Embedding}(k,t)
\in\mathbb R^{m\times d}.
\tag{4}
$$

$m$은 token 수, $d$는 text hidden dimension이다. layer $k$에 들어가기 직전, 이전 text hidden state 앞에 이 token을 붙인다.

$$
\widehat H_{\text{text}}^{(k-1,t)}
=
\left[s^{(k,t)};
H_{\text{text}}^{(k-1,t)}\right]
\in\mathbb R^{(m+n)\times d}.
\tag{5}
$$

![SoftREPA의 layer별 soft-token 경로와 positive/negative 생성 오차 대조 구조](/assets/img/posts/aligning-text-to-image-in-diffusion-models-is/figure2.png){: w="800" }
_원문 Figure 2(p.4). 왼쪽은 각 layer의 text feature 앞에 서로 다른 soft token을 붙였다가 해당 layer가 끝나면 버리는 경로다. 오른쪽은 matched text의 예측을 target noise에 가깝게, mismatched text의 예측을 멀게 만드는 대조 목적을 그린다._

중요한 구현 세부는 token이 layer 사이를 계속 이동하지 않는다는 점이다. 해당 layer 출력에서 원래 text 길이 $n$에 해당하는 마지막 token만 남기고, 방금 쓴 soft token은 버린다. 다음 layer에는 그 layer 전용 token을 새로 붙인다. 부록 Algorithm 1은 이 작업을 모든 sampling timestep과 transformer layer에 대해 반복한다.

기대값 전체를 매번 계산하면 비싸므로 실제 학습에서는 같은 batch에 하나의 $t$와 $\epsilon$을 공유하는 단일 Monte Carlo sample을 쓴다.

$$
\widetilde l(x,y,s)
=
\exp\!\left(
-\frac{
\left\|
v_\theta(x_t,t,y,s)-(\epsilon-x_0)
\right\|_2^2
}{\tau(t)}
\right).
\tag{6}
$$

최종 $\mathcal L_{\text{SoftREPA}}$는 Eq. (2)의 $l$을 $\widetilde l$로 바꾸고 data, $t\sim U(0,1)$, $\epsilon\sim\mathcal N(0,I)$에 대해 평균낸 것이다. gradient가 지나가는 학습 변수는 $s$뿐이다.

이 설계는 한 개의 global prompt embedding보다 세밀하다. 초반 layer와 후반 layer, 낮은 noise와 높은 noise에서 text condition이 해야 할 일이 같지 않다는 가정을 parameterization에 넣는다. 반대로 token table이 layer와 time에 따라 커지고, inference에서 이를 조회해 sequence 앞에 붙여야 한다는 비용도 생긴다.

## 상호정보량 해석은 어디까지 성립하는가

저자들은 왜 denoising error의 상대 비교가 alignment와 연결되는지를 pointwise mutual information(PMI)으로 설명한다.

$$
i(x,y)
=
\log\frac{p_\theta(x\mid y)}{p_\theta(x)}
=
\log\frac{p_\theta(x\mid y)}
{\mathbb E_{p(c)}[p_\theta(x\mid c)]}.
\tag{7}
$$

여기서 optimal denoiser를 가정하면 conditional log-likelihood는 시간 전체에 걸친 가중 denoising error의 음수로 쓸 수 있다.

$$
\widehat l(x,y)
=
-\frac12
\int_0^T
\lambda(t)
\mathbb E_\epsilon
\left[
\|\epsilon_\theta(x_t,t,y)-\epsilon\|_2^2
\right]dt+C.
\tag{8}
$$

Eq. (7)의 분모를 여러 text condition으로 Monte Carlo 근사하고 $p_\theta(x\mid y)=\exp(\widehat l(x,y))$를 대입하면 positive condition과 negative conditions의 log-softmax가 나온다. MI가 PMI의 joint expectation이므로 dataset 평균은 Eq. (2)와 매우 가까운 꼴이 된다. 직관적으로는 맞는 문장이 해당 이미지의 확률을 주변 caption 평균보다 얼마나 더 높이는지를 학습하는 셈이다.

다만 이를 “SoftREPA가 MI를 정확히 최대화한다고 증명했다”로 옮기면 과하다. 이 유도는 optimal denoiser와 likelihood--denoising-error 관계를 가정하고, condition marginal도 Monte Carlo로 근사한다. 더구나 실제 optimizer가 보는 것은 시간 적분 $\widehat l$이 아니라 한 시점의 bounded surrogate $\widetilde l$이다. 나는 이 절을 유한 모델에 대한 보장보다는 **왜 in-batch negative와 생성 오차의 조합이 합리적인지 보여주는 해석**으로 읽었다.

## 학습 설정 — 100만 개 미만이라는 말의 내용

실험은 SD1.5, SDXL, SD3 세 backbone을 사용한다. optimizer는 모두 AdamW이고 learning rate $10^{-3}$, weight decay $10^{-4}$, scheduler는 CosineAnnealingWarmRestarts다.

| backbone | token 위치와 길이 | batch `(positive, negative)` | iterations | 초기화 |
|---|---|---:|---:|---|
| SD1.5 | Down blocks, 길이 4 | 32 `(4,28)` | 26,000 | unconditional text embedding |
| SDXL | Down+Middle, 길이 8, time 비의존 | 16 `(1,15)` | 30,000 | $\mathcal N(0,0.02)$ |
| SD3 | 앞 5 layers, 길이 4 | 16 `(4,12)` | 30,000 | $\mathcal N(0,0.02)$ |

본문은 A100 두 장으로 30k 이하 iteration을 학습했다고 보고한다. SD3는 contrastive loss만 사용하지만, SD1.5와 SDXL은 작은 가중치의 ordinary denoising score-matching loss $\mathcal L_{\mathrm{DSM}}$도 함께 쓴다. 그 정확한 가중치는 원문에 없다.

이 보조 손실은 특히 SD1.5의 이미지 품질을 안정화한다. 부록 Table 6에서 contrastive loss만 쓸 때 FID/LPIPS가 `29.25/44.09`인데 DSM을 더하면 `23.43/43.38`이다. SDXL에서는 혼합 loss의 ImageReward가 `81.09 -> 85.29`로 오르지만 CLIP/HPS는 `26.87/28.32 -> 26.80/28.30`으로 아주 조금 내려간다. 보조 생성 loss가 모든 지표를 일괄 개선한다기보다 alignment와 fidelity의 균형을 잡는 역할에 가깝다.

또 하나의 재현 세부는 초기화다. 저자들은 SD1.5 soft token을 무작위로 초기화했을 때 성능이 나빠져 unconditional text embedding을 사용했다. 작은 모듈이라고 해서 최적화가 자동으로 쉬운 것은 아니다. 논문은 전체 training wall-clock과 DSM weight를 제시하지 않으므로 “두 장이면 몇 시간에 끝난다”는 식의 비용 결론까지 내릴 수는 없다.

## 생성 결과 — 정렬은 올랐고, 품질은 섞였다

COCO-val5K 결과를 보면 논문의 강점과 한계가 같은 표 안에 있다.

![SD1.5, SDXL, SD3의 COCO-val5K 및 GenEval 결과와 추론 비용](/assets/img/posts/aligning-text-to-image-in-diffusion-models-is/table1.png){: w="860" }
_원문 Table 1(p.6). ImageRewardㆍCLIPㆍHPSㆍLPIPS는 $10^2$ 배로 표시됐다. 위쪽은 세 backbone의 정렬/품질/효율, 아래쪽은 SD3의 compositional alignment를 비교한다._

| backbone | ImageReward | CLIP | FID | LPIPS |
|---|---:|---:|---:|---:|
| SD1.5 | 17.72 -> **32.89** | 26.40 -> **27.33** | 24.59 -> **23.43** | 43.80 -> **43.38** |
| SDXL | 75.06 -> **85.29** | 26.76 -> **26.80** | **24.69** -> 26.04 | **42.05** -> 42.39 |
| SD3 | 94.27 -> **108.50** | 26.30 -> **26.91** | **31.59** -> 36.21 | **42.43** -> 42.88 |

SD1.5에서는 네 지표가 같은 방향으로 움직인다. 그러나 SDXL과 SD3에서는 ImageReward와 CLIP이 오르는 동안 낮을수록 좋은 FID와 LPIPS가 나빠진다. “generation quality가 전반적으로 향상됐다”기보다는 text adherence와 선호도 쪽으로 operating point가 이동했다고 해석하는 편이 표에 충실하다.

GenEval은 trade-off를 더 선명하게 보여준다. SD3에 SoftREPA를 붙이면 Two objects `.86 -> .95`, Colors `.85 -> .92`, Position `.27 -> .34`, Color Attribution `.55 -> .68`이 된다. 반면 Counting은 `.56 -> .29`로 거의 반 토막 나고, 평균은 `.68 -> .70`에 그쳐 RankDPO의 `.74`보다 낮다. 저자들의 설명은 text alignment를 강화할수록 언급된 object를 여러 개 생성하려는 경향이 생긴다는 것이다.

부록의 count loss는 이 실패가 조절 가능함을 보여주면서도 새 trade-off를 만든다. YOLOv8 label과 denoised image의 예측 count 사이 MSE를 더하면 Counting은 `.29 -> .59`로 회복한다. 하지만 Two `.95 -> .88`, Colors `.92 -> .86`, Position `.34 -> .25`, Color Attribution `.68 -> .55`로 후퇴하고 평균도 `.70 -> .69`가 된다. 정렬의 하위 능력들 사이에도 하나의 단조로운 축은 없다.

## 편집 결과 — 조건을 더 잘 따르되 원본 보존을 확인해야 한다

soft token은 generation뿐 아니라 기존 editing pipeline에 inference-time module로 넣을 수 있다. Figure 4는 SD3 기반 FlowEdit에서 단일 개념과 여러 개념을 함께 바꾸는 예시다.

![SD3 FlowEdit와 SoftREPA를 결합한 text-guided editing 비교](/assets/img/posts/aligning-text-to-image-in-diffusion-models-is/figure4.jpg){: w="820" }
_원문 Figure 4(p.8). 각 행은 source, SoftREPA 없는 편집, SoftREPA를 넣은 편집을 비교한다. qualitative example은 prompt 반영의 차이를 보여주지만, 원본 보존은 Table 2의 structure/background metric과 함께 봐야 한다._

PIEBench의 FlowEdit에서 ImageReward는 `87.70 -> 102.24`, edited-region CLIP은 `23.19 -> 23.60`, whole-image CLIP은 `26.72 -> 27.19`, HPS는 `28.04 -> 28.58`로 오른다. 낮을수록 좋은 structure Distance도 `25.48 -> 24.07`, PSNR은 `24.37 -> 24.99`, SSIM은 `88.58 -> 88.73`으로 좋아지지만 LPIPS는 `12.55 -> 12.60`으로 근소하게 나빠진다.

DIV2K에서는 FlowEdit의 ImageReward `38.08 -> 46.68`, whole CLIP `26.05 -> 26.39`, Distance `39.68 -> 35.66`, LPIPS `15.48 -> 14.98`로 함께 좋아진다. Cat2Dog에서는 ImageReward `93.70 -> 114.4`, CLIP `22.51 -> 23.43`은 강하게 오르지만 Distance `33.41 -> 34.05`, LPIPS `19.92 -> 20.47`은 나빠진다. 편집에서도 target text adherence와 source preservation을 따로 봐야 한다.

논문은 baseline FlowEdit 33 step과 SoftREPA 30 step을 비교하며 더 효율적인 editing이라고 표현한다. 그러나 editing wall-clock을 직접 보고하지는 않는다. step 수가 3 적다는 사실과 실제 시간 단축을 구분해 기록하는 것이 안전하다. 부록의 CFG sweep에서도 CFG를 올리면 CLIP/HPS가 오르는 대신 FID/LPIPS가 악화하는 패턴이 반복된다.

## LoRA와 diffusion RL 비교가 말하는 것

같은 contrastive loss를 LoRA에 걸면 어떨까. COCO-val1K의 SD3 비교에서 0.9M soft token은 ImageReward `106.32`, CLIP `26.92`, HPS `28.70`, FID `60.76`이다. 같은 0.9M인 LoRA rank 8/앞 5층은 각각 `95.92`, `26.28`, `28.28`, `70.30`이다. LoRA rank 4/앞 10층도 ImageReward `92.72`, CLIP `26.23`, FID `70.53`에 머문다. parameter budget을 맞춰도 text feature space를 직접 움직이는 token이 주요 alignment metric에서 더 효과적이라는 증거다.

그래도 “전 지표 우위”는 아니다. PickScore 최고값은 0.4M LoRA의 `22.57`이고 SoftREPA는 `22.49`다. vanilla SD3의 FID/LPIPS `56.87/42.47`도 SoftREPA의 `60.76/42.99`보다 좋다. 이 비교 역시 soft token이 alignment에 특화된 update라는 해석을 지지한다.

Diffusion-DPO와 DDPO에 이미 학습된 token을 추가 학습 없이 삽입한 결과는 두 정렬 방식이 상보적일 가능성을 보여준다. Diffusion-DPO의 ImageReward/CLIP은 `22.26/26.51 -> 33.10/27.41`, DDPO는 `-8.83/26.21 -> 8.07/27.13`이 된다. 다만 Diffusion-DPO의 PickScore와 HPS는 `21.68/25.60 -> 21.64/25.55`로 조금 내려간다. SoftREPA는 preference optimization을 대체한다기보다 generator 내부의 text conditioning을 별도 축에서 조절하는 module에 가깝다.

## 어디까지 넣을 것인가 — layer와 token ablation

가장 유용한 ablation은 soft token을 많이 넣을수록 좋지 않다는 결과다.

![SD3에서 soft token 수와 적용 layer 수를 바꾼 ablation](/assets/img/posts/aligning-text-to-image-in-diffusion-models-is/table10.png){: w="820" }
_원문 Table 10(p.30). 위 네 행은 token 8개로 layer 수를, 아래 다섯 행은 5개 layer로 token 수를 비교한다. metric마다 최적점이 다르며 16개 이상 token은 여러 지표를 크게 해친다._

token 8개를 고정하고 적용 layer를 2, 4, 6, 7개로 늘리면 CLIP은 `.263, .266, .267, .269`로 계속 오른다. 하지만 ImageReward는 `.993, 1.009, .984, .944`, FID는 `72.253, 72.308, 73.840, 74.546`이다. 더 깊게 text alignment를 강제하면 literal prompt adherence는 커져도 사람 선호와 분포 품질은 4층 이후 악화한다.

5개 layer를 고정하고 token을 1, 4, 8, 16, 32개로 늘리면 ImageReward는 `1.054, 1.063, 1.056, .801, .675`다. 4개가 ImageReward, 8개가 PickScore/HPS, 1개가 CLIP/FID에서 가장 좋다. 따라서 “4--8개가 보편적 optimum”이라기보다 16개 이상이 과도하며, 어느 metric을 우선할지에 따라 짧은 token 수 안에서도 선택이 달라진다.

이 결과는 REPA의 depth ablation과 흥미롭게 닮았다. 두 논문 모두 의미 정렬을 더 많은 layer에 적용하면 alignment probe는 좋아질 수 있지만 생성 품질은 나빠진다. 생성 모델의 후반부에는 prompt에 문자 그대로 맞추는 것 외에 질감, 구조, 다양성을 복원할 자유도가 필요하다는 신호로 읽힌다.

## 계산 비용과 배포 관점

Table 1에서 표시된 peak memory는 baseline과 SoftREPA가 같다. SD1.5 `2.621 GB`, SDXL `10.45 GB`, SD3 `18.77 GB`다. latency는 각각 `1.526 -> 1.547`, `4.059 -> 4.060`, `4.637 -> 4.695 sec/image`로 늘어난다. 부록에 따르면 fp16, A100 한 장에서 50회 평균했고 해상도는 SD1.5가 512x512, SDXL/SD3가 1024x1024다.

표시 precision 안에서 memory 차이가 보이지 않고 latency 증가는 작다는 결론은 타당하다. 하지만 “inference-free”는 아니다. token을 매 timestep, 여러 layer의 text sequence에 실제로 붙이므로 sequence 연산이 늘고, token parameter도 배포해야 한다. 반대로 backbone checkpoint를 바꾸지 않고 1M 미만의 작은 모듈만 별도로 관리할 수 있다는 장점은 크다. 같은 기반 모델에 목적별 token set을 교체하는 운영도 생각할 수 있다.

## 한계와 내가 남긴 질문

첫째, alignment benchmark를 개선하는 것과 사용자의 의도를 보존하는 것은 동일하지 않다. 논문도 soft token이 text guidance를 과도하게 강조해 prompt intent를 오히려 충실히 보존하지 못할 수 있다고 적는다. Counting failure와 CFG sweep은 그 우려가 실제 metric conflict로 나타난 예다.

둘째, 이론의 surrogate gap을 실험적으로 더 분해할 필요가 있다. 시간 적분 likelihood와 single-step bounded similarity, 같은 $t,\epsilon$을 공유하는 batch 설계 중 무엇이 성능과 안정성에 얼마나 기여하는지 별도 ablation이 없다. 특히 $\tau(t)$ schedule의 정의와 민감도가 본문에서 충분히 드러나지 않는다.

셋째, “어떤 pretrained T2I model에도 유연하게 적용된다”는 주장은 현재 SD1.5, SDXL, SD3 세 계열에서만 확인됐다. UNet cross-attention과 MM-DiT joint attention에 모두 적용한 것은 의미 있지만, autoregressive image model이나 훨씬 긴 text sequence, 다른 language encoder까지 일반화된 것은 아니다.

넷째, 수치의 불확실성을 알 수 없다. COCO-val5K/1K aggregate는 있지만 error bar나 statistical significance test는 없다. `22.54 -> 22.55` 같은 PickScore 차이를 확실한 개선으로 읽기 어렵다. 반면 SD3 ImageReward `94.27 -> 108.5`나 Counting `.56 -> .29`처럼 큰 변화는 방향성이 훨씬 분명하다.

다섯째, in-batch negative의 의미적 충돌 가능성이 남는다. 목적함수는 $i\ne j$인 caption을 모두 negative로 취급하지만, 다른 이미지의 caption이 현재 이미지에도 사실상 맞는 semantic false negative인지 거르는 절차는 보고하지 않는다. COCO처럼 “한 사람”, “거리의 자동차” 같은 표현이 여러 이미지에 반복되는 데이터에서는 유효한 설명까지 밀어낼 수 있다. batch 구성과 false-negative filtering에 대한 ablation이 있으면 대조 압력이 실제로 무엇을 학습하는지 더 분명해질 것이다.

여섯째, 학습 데이터 오염과 adversarial token training은 다루지 않으며 backbone의 bias와 harmful generation capability를 그대로 상속한다. 작은 token 파일 하나가 모델의 조건 해석을 체계적으로 바꿀 수 있다는 점은 배포에는 편리하지만, provenance와 검증이 필요한 새로운 attack surface이기도 하다.

## 정리

SoftREPA를 읽고 가장 인상적이었던 점은 거대한 생성 모델을 직접 고치지 않고도, 그 모델의 denoising error를 self-supervision signal처럼 되돌려 쓸 수 있다는 발상이다. matched caption과 in-batch mismatch 사이의 오차 간격을 키우고, 그 gradient를 layer/time-specific soft token에만 모으면 1M 미만 파라미터로 조건 해석을 상당히 움직일 수 있다.

동시에 이 논문은 text alignment의 성공을 조심해서 읽어야 하는 좋은 사례다. SD3에서 ImageReward `94.27 -> 108.5`, CLIP `26.30 -> 26.91`은 분명한 장점이지만 FID `31.59 -> 36.21`, Counting `.56 -> .29`도 같은 방법의 결과다. 내 결론은 SoftREPA가 “모든 면에서 더 좋은 생성기”를 만드는 기법이라기보다, frozen generator의 **text adherence를 싸게 조절하는 강한 adapter**라는 것이다. 실제 적용에서는 layer 수, token 수, CFG, counting이나 preservation 같은 보조 목적을 원하는 operating point에 맞춰 함께 검증해야 한다.
