---
title: "[논문 리뷰] Kimi Linear — KDA와 MLA를 섞는 이유"
date: 2026-09-27 10:00:00 +0900
permalink: /posts/skala-paper-kimi-linear/
categories:
  - AI
  - Paper Review
tags: [paper-review, skala, linear-attention, kimi-linear, deltanet]
related: [deltanet, fast-weight-programmers]
paper:
  authors: "Kimi Team"
  venue: "arXiv technical report, 2025"
  url: "https://arxiv.org/abs/2510.26692"
---

SKALA 딥러닝 아키텍처 교안은 Kimi Linear를 ‘KDA로 속도와 메모리, MLA로 전체 맥락을 보강하는 모델’로 소개한다. [*Kimi Linear: An Expressive, Efficient Attention Architecture*](https://arxiv.org/abs/2510.26692)를 읽으면 그 요약을 조금 더 정확히 풀 수 있다. 선형 어텐션만으로는 긴 문맥의 검색 성능이 약해질 수 있어, **고정 크기 상태를 쓰는 KDA 층 세 개마다 전역 어텐션 MLA 층 하나**를 배치한 하이브리드 모델이다.

## 문제: 빠른 상태 갱신과 정확한 검색 사이의 간극

일반적인 full attention은 과거 토큰의 키·값을 보관하므로 긴 시퀀스에서 KV 캐시가 커진다. 선형 어텐션 계열은 과거를 고정 크기 상태에 누적해 이 부담을 줄이지만, 서로 다른 키-값 연결을 제한된 상태에 담아야 한다. [Fast Weight Programmer](/posts/fast-weight-programmers/)와 [DeltaNet](/posts/deltanet/) 리뷰에서 본 델타 규칙은 저장값을 수정할 길을 열었다. Kimi Linear의 질문은 이 계열을 더 크게 학습하면서 **검색 성능과 실제 GPU 처리량을 함께 확보할 수 있는가**다.

논문이 제안한 Kimi Delta Attention(KDA)은 Gated DeltaNet을 바탕으로 상태를 잊는 정도를 더 세밀하게 조절한다. 하나의 게이트 값으로 상태 전체를 똑같이 축소하는 대신 채널별 decay를 둔다. 동시에 델타 규칙의 국소적인 값 수정 성질을 유지한다. 저자들은 이를 효율적으로 병렬 학습하기 위해 상태 전이 행렬의 구조를 이용한 chunkwise 알고리즘을 설계한다. 따라서 ‘선형 어텐션이므로 무조건 빠르다’는 주장이 아니라, **표현력 있는 갱신식을 GPU에서 실제로 빠르게 계산하는 방법**까지 논문의 기여에 들어 있다.

## KDA와 MLA의 역할

KDA 층의 상태는 문맥이 길어져도 토큰 수에 따라 계속 쌓이지 않는다. 그러나 고정 크기 상태에는 정보가 서로 간섭할 수 있어, 순수 KDA만으로 모든 장거리 검색을 맡기기 어렵다. 논문은 토큰 혼합 층을 `KDA–KDA–KDA–MLA`로 반복한다. MLA는 Multi-head Latent Attention이며, 논문에서 **전역 full attention 층**으로 사용한다. 각 토큰의 키·값 표현을 압축해 저장하지만 토큰별 캐시가 존재하므로, KDA의 고정 크기 상태와 똑같은 메모리 구조는 아니다.

논문 Table 1은 여러 혼합 비율을 같은 설정에서 비교한다. 저자들이 시험한 범위에서 **3:1이 품질과 처리 비용의 균형이 가장 좋았다.** 이는 모든 모델과 데이터에 대해 최적 비율이라는 정리가 아니다. KDA만 쓰는 경우, MLA 비중을 높인 경우에도 서로 다른 성능·비용 손익이 생긴다.

논문은 3B 활성 파라미터와 48B 전체 파라미터의 MoE 기반 모델을 학습해, 같은 학습 설정의 full-MLA 기준선과 비교했다. 보고된 긴 문맥 설정에서는 KV 캐시 사용량을 **최대 75%** 줄이고, **길이 100만 토큰 조건에서 디코딩 처리량이 최대 약 6배**에 이르렀다. ‘최대’와 실험 조건을 빼면 모든 길이에서 같은 절감률과 속도가 보장되는 것처럼 읽힌다. 또한 모델의 MoE 부분은 토큰별 feed-forward 계산을 담당하며, KDA와 MLA가 맡는 **토큰 간 정보 혼합**과 역할이 다르다.

## 강의 비유를 어디까지 사용할 수 있나

교안의 ‘회의록을 요약해서 남긴다’는 비유는 상태 압축의 방향을 이해하는 데 도움이 된다. 다만 KDA가 중요도를 판단해 ‘불필요한 세부 정보’를 사람이 읽는 요약처럼 제거한다는 뜻은 아니다. 원문의 short convolution은 **가까운 토큰 사이의 의존성**을 포착하고, query·key에 적용한 L2 정규화는 **상태 전이의 안정성**을 위한 구성이다. 교안 PDF 96쪽의 ‘Conv/L2가 불필요한 세부 정보를 제거한다’는 설명은 이 기능과 다르다.

MLA도 과거의 원문을 저장했다가 ‘원본 복원’하는 장치로 이해하면 곤란하다. 압축된 잠재 KV 표현으로 어텐션을 계산하는 방식이다. 이 차이를 알아야 KDA와 MLA의 메모리 비용을 따로 추적할 수 있다. 논문을 읽고 남는 설계 질문은 **업무의 문맥 길이와 검색 요구가 달라질 때 3:1 비율과 MLA의 캐시 비용이 어떻게 바뀌는가**다. 원문의 수치는 이 모델의 실험 결과이며, 다른 업무에 그대로 옮겨 쓸 수 있는 보편값은 아니다.
