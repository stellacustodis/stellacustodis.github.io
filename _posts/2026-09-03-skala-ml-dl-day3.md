---
title: "[SKALA] 머신러닝 및 딥러닝 이해 3일차 — Fashion-MNIST CNN 가설 검증"
date: 2026-09-03 12:00:00 +0900
permalink: /posts/skala-ml-dl-day3/
categories:
  - SKALA
  - Machine Learning
tags: [skala, machine-learning, deep-learning, cnn, evaluation]
description: "Fashion-MNIST CNN 실험에서 개선과 실패를 모두 기록하고 클래스별 오류를 읽는다."
related: [skala-ml-dl-roadmap, skala-ml-dl-day1, skala-ml-dl-day2]
---

## 점수를 올리는 실험과 설명 가능한 실험

Fashion-MNIST 분류 실습에서 BatchNorm, Dropout, Early Stopping, 정규화, 증강, 최적화, 스케줄러와 구조 변경을 각각 가설로 세우고 비교했다. 최종 테스트 점수만 좇으면 어떤 변경이 실제로 기여했는지 알기 어렵기 때문에 run별 설정·지표를 남겼다.

기록된 결과에서 BatchNorm은 초기 수렴을 개선했지만 최종 일반화 이득은 뚜렷하지 않았고, Dropout은 기초 단계에서 유의미했다. 강한 증강, focal loss, Center Loss는 이 실험 조건에서 기대한 개선을 내지 못했다. 이 음성 결과도 다음 실험의 선택 근거다.

## 전체 정확도 뒤의 오류

Shirt 클래스는 다른 상의류와 자주 혼동됐다. 평균 정확도만 보면 이 문제를 놓친다. 클래스별 precision·recall·F1과 혼동 행렬을 보면 성능 향상이 어느 클래스에 집중되는지 드러난다.

최종 제출 모델은 VGG 계열 CNN이었다. 과제 보고서의 추가 방법 비교에서 MoCo-style 후보의 검증 평균이 더 높았지만, 반복 실험의 변동성과 학습 시간도 함께 고려했다.

| 후보 | Validation accuracy, 평균 ± 표준편차 (%) | 학습 시간 (초) | 선택 |
|---|---:|---:|---|
| F_VGG | 94.76 ± 0.07 | 37.3 | 최종 제출 |
| MoCo-style | 94.91 ± 0.16 | 58.5 | 정확도 우선 후속 후보 |

표는 CNN 종합실습 보고서의 추가 방법 비교 결과다. 같은 데이터 분할과 seed 42·123·2026, 최대 15 epoch에서 비교했다. 보고서의 환경은 Linux와 RTX 3090 Ti 24GB 두 대이며, 학습 시간은 그 환경에서의 기록이므로 다른 장비의 속도와 직접 비교하지 않는다. F_VGG는 검증 평균이 조금 낮은 대신 seed 간 표준편차와 학습 시간이 작았다. 세 seed와 하나의 데이터 분할에서 얻은 결과이므로 일반적인 모델 우위로 확대하지 않는다.

## 실험표에서 남겨야 할 열

비교표에는 설정 이름만 적지 않는다. 같은 데이터 분할과 seed를 썼는지, 선택 기준은 validation accuracy인지 loss인지, 학습 시간과 클래스별 오류는 어땠는지를 함께 둔다. 특히 Early Stopping에서 마지막 epoch 값과 복원한 최선의 checkpoint 값은 다를 수 있다.

강한 증강에서 훈련 정확도와 검증 정확도가 함께 낮아진 결과는 과소적합으로 해석했다. train–validation 간격이 줄었다는 이유만으로 좋은 정규화라고 부를 수 없다는 뜻이다. Shirt의 recall을 올린 방법도 precision을 함께 떨어뜨렸다면 전체 F1과 업무 목적을 보고 선택해야 한다.

---

이전 글: [2일차 — 손실·최적화와 신경망 구조](/posts/skala-ml-dl-day2/)

시리즈 안내: [머신러닝 및 딥러닝 이해 — 3일 학습 로드맵](/posts/skala-ml-dl-roadmap/)
