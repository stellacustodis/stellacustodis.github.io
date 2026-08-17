---
title: "연구실 뉴비를 위한 딥러닝 필수 모델·기법 로드맵"
date: 2026-06-16 22:00:00 +0900
layout: post
permalink: /posts/dl-foundational-roadmap/
categories:
  - AI
  - Learning
tags: [deep-learning, computer-vision, learning-roadmap, generative-model, self-supervised-learning, transformer]
---

<!-- 이미지 경로: /assets/img/posts/dl-foundational-roadmap/<파일명> -->

연구실에 새로 들어온 뉴비들에게 "이건 알고 시작하자"는 의미로 만들었던 자료를 게시글로 정리한다.
딥러닝을 처음 공부할 때 가장 막막한 건 *읽어야 할 논문이 너무 많다*는 점이다.
그래서 분야별 핵심 모델·기법을 **흐름(계보) 순으로** 묶어 두었다. 위에서부터 차례대로 따라가면
"왜 이 모델이 나왔고, 다음 모델이 무엇을 해결했는가"를 자연스럽게 이해할 수 있다.

> 연도는 대표 논문 발표 시점 기준이며, 모든 걸 다 읽을 필요는 없다.
> 각 분야에서 **굵게 표시된 전환점(turning point)** 부터 보는 것을 추천한다.
{: .prompt-tip }

---

## 🧩 1. Normalization & Regularization

학습 안정화, 일반화, 수렴 향상을 위한 핵심 기법들.

- **Batch Normalization (2015)**
  - 미니배치 단위 평균·분산 정규화
  - 학습 속도 향상, gradient 안정화
  - CNN 표준 정규화 방식
- **Layer Normalization (2016)**
  - Feature 단위 정규화
  - Transformer 구조에서 필수
- **Instance Normalization (2017)**
  - 이미지별 독립 정규화
  - Style Transfer, GAN 등 생성 모델에 자주 사용
- **Group Normalization (2018)**
  - 채널을 그룹 단위로 정규화
  - 작은 배치 크기에서도 안정적
- **Label Smoothing (2016)**
  - Hard label 대신 soft target 사용
  - 과신(confidence) 완화 및 일반화 향상
- **Dropout (2014)**
  - 뉴런을 랜덤으로 비활성화
  - Overfitting 방지

---

## 🧱 2. CNN Backbone Evolution

이미지 특징 추출 네트워크의 발전사.

- **AlexNet (2012)**
  - ReLU, Dropout, GPU 병렬 학습
  - 딥러닝 부흥의 시작점
- **VGGNet (2014)**
  - 단순한 3×3 Conv 반복
  - 깊이 증가의 효과 실증
- **Inception / GoogLeNet (2014)**
  - 다양한 커널 병렬 적용
  - 효율성과 성능의 균형
- **ResNet (2015)**
  - Residual Connection 도입
  - 깊은 네트워크 학습 가능
- **SqueezeNet (2016)**
  - 파라미터 수를 극적으로 감소시킨 경량 모델
- **MobileNet (2017)**
  - Depthwise Separable Convolution
  - 모바일 환경에 최적화

---

## 🎯 3. Object Detection & Segmentation

‘어디에 무엇이 있는가’를 학습하는 구조들.

- **R-CNN (2014)**
  - Region Proposal + CNN 분류
- **Fast R-CNN (2015)**
  - ROI Pooling → 속도 개선
- **Faster R-CNN (2015)**
  - Region Proposal Network (RPN) 통합
- **Mask R-CNN (2017)**
  - Segmentation mask branch 추가
- **FPN (2017)**
  - Feature Pyramid로 다중 해상도 feature 통합
- **YOLO (2016~)**
  - End-to-End one-stage 탐지, 실시간 성능
- **Focal Loss (RetinaNet, 2017)**
  - Class imbalance 문제 해결
- **DETR (2020)**
  - Transformer 기반 anchor-free detection
- **SAM (Segment Anything Model, 2023)**
  - Prompt 기반 범용 segmentation foundation model

---

## 🌀 4. Reconstruction & Generation

입력 복원, 초해상도, 생성 모델의 발전 계보.

- **AutoEncoder (2006)**
  - 입력 재구성 기반 표현 학습
- **U-Net (2015)**
  - Encoder–Decoder + Skip Connection
  - 복원 및 분할에 강력
- **SRCNN (2014)**
  - 최초의 딥러닝 초해상도 모델
- **SPPNet (2014)**
  - Spatial Pyramid Pooling → 다양한 입력 크기 처리
- **VAE (2013)**
  - 확률적 잠재공간 기반 생성
- **GAN (2014)**
  - 생성자–판별자 경쟁 구조
- **DCGAN (2015)**
  - CNN 기반 안정적 GAN 구조
- **CycleGAN (2017)**
  - Unpaired 도메인 변환 가능
- **DDPM (2020)**
  - 노이즈 제거 과정 학습 → 고품질 생성
- **MAE (Masked Autoencoder, 2021)**
  - Transformer 기반 마스크 복원 self-supervised 학습

---

## 🔁 5. Self-Supervised & Contrastive Learning

라벨 없이 representation을 학습하는 방법.

- **SimCLR (2020)**
  - Data augmentation + Contrastive loss (InfoNCE)
- **MoCo (2020)**
  - Momentum encoder로 negative queue 유지
- **DINO (2021)**
  - Self-distillation으로 라벨 없이 표현 학습
- **CLIP (2021)**
  - 텍스트–이미지 contrastive 학습 → 멀티모달 표현의 시작

---

## 🧠 6. Transformer Family

Self-Attention을 중심으로 한 범용 구조의 진화.

- **Transformer (2017)**
  - Attention Is All You Need
  - RNN 없이 sequence 모델링
- **BERT (2018)**
  - Masked Language Modeling → 양방향 context 학습
- **ViT (Vision Transformer, 2020)**
  - 이미지를 patch sequence로 변환
  - CNN을 대체하는 전역 Attention 구조
- **Swin Transformer (2021)**
  - 지역 윈도우 기반 hierarchical ViT
  - 효율적이고 강력한 비전 backbone
- **DETR (2020)**
  - Transformer 기반 Object Detection
- **SAM (2023)**
  - ViT + CLIP 기반 prompt-driven segmentation foundation model

---

## 마치며

위 목록은 "전부 외우자"는 리스트가 아니라 **지도(map)** 에 가깝다.
본인의 연구 분야와 가까운 줄기부터 굵게 표시된 전환점 논문을 골라 읽고,
거기서 인용·피인용을 따라 가지를 뻗어 나가면 자연스럽게 최신 연구까지 도달하게 된다.
뉴비라면 *2번(CNN) → 6번(Transformer) → 4·5번(생성/자기지도)* 순서로 큰 흐름을 잡는 것을 추천한다.
