---
layout: page
title: 학습 로드맵
description: "논문 리뷰, SKALA 실습, 개발 기록을 주제별로 읽고 진행률을 확인하는 학습 로드맵."
icon: fas fa-route
order: 3
permalink: /learn/
---

<link rel="stylesheet" href="{{ '/assets/css/learn.css' | relative_url }}">

<div id="learn-roadmap" data-post-path="{{ '/posts/' | relative_url }}" markdown="1">

<div id="learn-progress"></div>

관심 있는 트랙을 골라 순서대로 읽고, 읽은 글에 체크해 진행률을 기록할 수 있습니다.

**논문 읽기** · [비전 표현학습](#learn-vision) · [Transformer와 SSM](#learn-sequence) · [생성 모델](#learn-generation) · [이미지 편집과 3D](#learn-editing) · [RAG와 벡터 DB](#learn-retrieval)

**실습과 회고** · [데이터·머신러닝](#learn-data) · [프런트엔드·백엔드](#learn-web) · [LLM·Spring AI](#learn-ai-apps) · [컨테이너·Kubernetes](#learn-infra) · [개발·학습 기록](#learn-notes)

<section class="learn-track" markdown="1">

## 생성형 AI·딥러닝 기초와 비전 표현학습
{: #learn-vision}

### CNN에서 Vision Transformer까지

- [딥러닝 모델·기법 로드맵: 정규화, CNN, ViT, Swin Transformer, MAE]({{ '/posts/dl-foundational-roadmap/' | relative_url }})
- [AlexNet: ImageNet 분류와 심층 CNN]({{ '/posts/alexnet/' | relative_url }})
- [ResNet: 잔차 학습으로 깊은 CNN 훈련하기]({{ '/posts/deep-residual-learning/' | relative_url }})
- [DINO: 자기지도학습에서 나타나는 ViT의 특성]({{ '/posts/Emerging%20Properties%20in%20Self-Supervised%20Vision%20Transformers/' | relative_url }})

### 잠재 표현과 재구성

- [Autoencoders: 입력을 잠재 표현으로 압축하고 복원하기]({{ '/posts/autoencoders/' | relative_url }})
- [Auto-Encoding Variational Bayes (VAE)]({{ '/posts/auto-encoding-variational-bayes/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## Transformer·Linear Attention·SSM
{: #learn-sequence}

### 언어 모델 표현학습과 사전학습

- [NLP 표현학습: Word2Vec에서 Attention까지]({{ '/posts/paper-review-nlp-foundations/' | relative_url }})
- [Transformer와 사전학습: Attention에서 GPT-3까지]({{ '/posts/paper-review-transformer/' | relative_url }})
- [Transformer 아키텍처 변형 9편]({{ '/posts/paper-review-transformer-variants/' | relative_url }})
- [정렬과 스케일링: RLHF, DPO, Scaling Law]({{ '/posts/paper-review-alignment-scaling/' | relative_url }})
- [모델 효율화와 평가: Distillation, MoE, 벤치마크]({{ '/posts/paper-review-efficiency-eval/' | relative_url }})

### 선형 시퀀스 모델링

- [Linear Transformer와 Fast Weight Programmer]({{ '/posts/fast-weight-programmers/' | relative_url }})
- [DeltaNet: Delta Rule을 시퀀스 길이 방향으로 병렬화]({{ '/posts/deltanet/' | relative_url }})
- [Kimi Linear: 효율적인 Attention 아키텍처]({{ '/posts/kimi-linear/' | relative_url }})
- [Mamba: Selective State Space로 시퀀스 모델링]({{ '/posts/mamba/' | relative_url }})
- [DiM: Mamba를 적용한 고해상도 이미지 생성]({{ '/posts/dim-mamba/' | relative_url }})

### 추론 메모리와 KV Cache

- [RDKV: KV Cache 제거와 양자화의 공동 비트 할당]({{ '/posts/rdkv/' | relative_url }})
- [Photonic-CXL: LLM 추론용 KV Cache 메모리 장치]({{ '/posts/photonic-cxl-memory-appliance/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## Diffusion·Flow Matching과 생성 모델 효율화
{: #learn-generation}

### Diffusion 학습과 샘플링

- [DDPM: 잡음 제거를 학습하는 확률 모델]({{ '/posts/ddpm/' | relative_url }})
- [Improved DDPM: 역과정 분산 학습과 샘플링]({{ '/posts/improved-ddpm/' | relative_url }})
- [DDIM: 결정론적 샘플링 경로]({{ '/posts/ddim/' | relative_url }})
- [Diffusion Models Beat GANs: Classifier Guidance와 이미지 생성]({{ '/posts/diffusion-models-beat-gans/' | relative_url }})
- [Classifier-Free Guidance: 분류기 없이 조건 강도 조절]({{ '/posts/cfg/' | relative_url }})
- [Diffusion의 노이즈 스케줄과 샘플 스텝]({{ '/posts/common-diffusion-noise-schedules/' | relative_url }})
- [DPM-Solver: ODE 기반 소수 스텝 샘플링]({{ '/posts/dpm-solver/' | relative_url }})
- [DeepCache: 특징 재사용으로 샘플링 가속]({{ '/posts/deepcache/' | relative_url }})

### Score Matching과 연속 시간 모델

- [Sliced Score Matching: 방향 투영으로 점수 함수 추정]({{ '/posts/sliced-score-matching/' | relative_url }})
- [NCSN: 데이터 분포의 Score 추정]({{ '/posts/ncsn/' | relative_url }})
- [NCSNv2: 고해상도 생성을 위한 Score 모델 학습]({{ '/posts/ncsnv2/' | relative_url }})
- [Score-SDE: 확률미분방정식으로 Score 기반 생성 모델 읽기]({{ '/posts/score-sde/' | relative_url }})
- [Variational Diffusion Models: 연속 시간 손실과 학습 가능한 스케줄]({{ '/posts/variational-diffusion-models/' | relative_url }})
- [EDM: Diffusion 모델의 설계 선택 분해]({{ '/posts/edm/' | relative_url }})

### Neural ODE에서 Flow Matching까지

- [Neural Ordinary Differential Equations]({{ '/posts/neural-ordinary-differential-equations/' | relative_url }})
- [Flow Matching: 확률 경로의 벡터장 학습]({{ '/posts/flow-matching/' | relative_url }})
- [Rectified Flow: 데이터 사이의 수송 경로 펴기]({{ '/posts/rectified-flow/' | relative_url }})
- [Self-Flow: 멀티모달 생성용 자기지도 Flow Matching]({{ '/posts/Self-Flow/' | relative_url }})

### 고해상도 이미지와 표현 정렬

- [LDM: 잠재 공간의 고해상도 이미지 생성]({{ '/posts/ldm/' | relative_url }})
- [DiT: Diffusion 모델의 Transformer 백본]({{ '/posts/dit/' | relative_url }})
- [U-ViT: 이미지·시간·조건 입력의 토큰화]({{ '/posts/u-vit/' | relative_url }})
- [PixArt-α: 텍스트-이미지 Diffusion Transformer 학습]({{ '/posts/pixart-alpha/' | relative_url }})
- [Stable Diffusion 3: Rectified Flow와 멀티모달 Transformer]({{ '/posts/sd3/' | relative_url }})
- [PixelDiT: 픽셀 공간의 Diffusion Transformer]({{ '/posts/PixelDiT/' | relative_url }})
- [REPA: 표현 정렬로 Diffusion Transformer 학습 보조]({{ '/posts/repa/' | relative_url }})
- [Simple Diffusion: 고해상도 종단 간 Diffusion]({{ '/posts/simple-diffusion/' | relative_url }})
- [Diffusion 모델에서 텍스트와 이미지의 표현 정렬]({{ '/posts/aligning-text-to-image-in-diffusion-models-is/' | relative_url }})

### 토큰화·양자화와 자기회귀 생성

- [Variational Lossy Autoencoder]({{ '/posts/variational-lossy-autoencoder/' | relative_url }})
- [SurVAE Flows: Surjection으로 VAE와 Flow 연결]({{ '/posts/survae-flows/' | relative_url }})
- [VQGAN: 양자화 잠재 표현과 Transformer]({{ '/posts/vqgan/' | relative_url }})
- [RQ-VAE: Residual Quantization을 활용한 자기회귀 이미지 생성]({{ '/posts/rq-vae/' | relative_url }})
- [BSQ: 이미지·비디오의 Binary Spherical Quantization]({{ '/posts/binary-spherical-quantization/' | relative_url }})
- [VAR: 다음 해상도를 예측하는 자기회귀 이미지 생성]({{ '/posts/visual-autoregressive-modeling/' | relative_url }})
- [HMAR: 계층적 마스크 자기회귀 이미지 생성]({{ '/posts/hmar/' | relative_url }})

### 비디오 압축과 움직임

- [Improved Video VAE for Latent Video Diffusion Model]({{ '/posts/improved-video-vae-for-latent-video-diffusion/' | relative_url }})
- [VideoVAE+: 큰 움직임을 다루는 Cross-modal Video VAE]({{ '/posts/videovae-plus/' | relative_url }})
- [Generative Image Dynamics: 정지 이미지에서 움직임 모델링]({{ '/posts/generative-image-dynamics/' | relative_url }})

### Diffusion 언어 모델

- [LLaDA: 마스크 복원으로 학습하는 언어 모델]({{ '/posts/llada/' | relative_url }})
- [The Flexibility Trap: 임의 순서 생성과 JustGRPO]({{ '/posts/flexibility-trap/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## Image Editing·3D Generation
{: #learn-editing}

### 이미지 역산과 복원

- [DiffusionCLIP: Text-Guided Diffusion Models for Robust Image Manipulation]({{ '/posts/diffusionclip/' | relative_url }})
- [Null-text Inversion for Editing Real Images using Guided Diffusion Models]({{ '/posts/null-text-inversion/' | relative_url }})
- [EDICT: Exact Diffusion Inversion via Coupled Transformations]({{ '/posts/edict/' | relative_url }})
- [DiffEdit: Diffusion-based Semantic Image Editing with Mask Guidance]({{ '/posts/diffedit/' | relative_url }})
- [Diffusion Posterior Sampling: 잡음이 있는 역문제]({{ '/posts/diffusion-posterior-sampling/' | relative_url }})

### 프롬프트·영역·위치로 이미지 제어

- [InstructPix2Pix: Learning to Follow Image Editing Instructions]({{ '/posts/instructpix2pix/' | relative_url }})
- [Plug-and-Play Diffusion Features for Text-Driven Image-to-Image Translation]({{ '/posts/plug-and-play-diffusion-features/' | relative_url }})
- [MasaCtrl: Tuning-Free Mutual Self-Attention Control for Consistent Image Synthesis and Editing]({{ '/posts/masactrl/' | relative_url }})
- [LEDITS++: Limitless Image Editing using Text-to-Image Models]({{ '/posts/ledits-plus-plus/' | relative_url }})
- [Inversion-Free Image Editing with Language-Guided Diffusion Models]({{ '/posts/inversion-free-image-editing/' | relative_url }})
- [Drag Your Noise: Interactive Point-based Editing via Diffusion Semantic Propagation]({{ '/posts/drag-your-noise/' | relative_url }})
- [DreamBooth: 특정 피사체를 학습해 이미지 생성]({{ '/posts/dreambooth/' | relative_url }})
- [MultiDiffusion: 영역별 Diffusion 경로 결합]({{ '/posts/multidiffusion/' | relative_url }})

### 3D 점군의 표현과 생성

- [SetVAE: 집합 구조 데이터의 계층적 생성]({{ '/posts/setvae/' | relative_url }})
- [DiT-3D: Diffusion Transformer로 3D 형상 생성]({{ '/posts/DiT-3D/' | relative_url }})
- [FoldDiff: PointNet++로 특징을 추출해 점군 구조화]({{ '/posts/folddiff/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## RAG·Prompting·Vector Database
{: #learn-retrieval}

### 검색과 생성의 결합

- [RAG Survey: 검색 증강 생성의 구성과 평가]({{ '/posts/rag-survey/' | relative_url }})
- [Modular RAG: 조립 가능한 검색 증강 파이프라인]({{ '/posts/modular-rag/' | relative_url }})
- [Self-RAG: 검색 여부와 응답 품질을 모델이 판단]({{ '/posts/self-rag/' | relative_url }})
- [Agentic RAG Survey: 에이전트가 검색과 생성을 조율하는 구조]({{ '/posts/agentic-rag-survey/' | relative_url }})

### 프롬프트·긴 문맥·응답 평가

- [Lost in the Middle: 긴 입력에서 근거가 놓인 위치의 영향]({{ '/posts/lost-in-the-middle/' | relative_url }})
- [Larger Language Models Do In-Context Learning Differently]({{ '/posts/larger-language-models-icl/' | relative_url }})
- [Chain of Density: 개체를 추가해 요약의 밀도 높이기]({{ '/posts/chain-of-density/' | relative_url }})
- [Self-Consistency: 여러 추론 경로에서 답 선택하기]({{ '/posts/self-consistency/' | relative_url }})
- [Step-Back Prompting: 추상화로 추론에 필요한 원리 찾기]({{ '/posts/step-back-prompting/' | relative_url }})
- [SemScore: 의미 유사도로 지시 수행 응답 평가]({{ '/posts/semscore/' | relative_url }})

### 벡터 저장·검색·운영

- [Vector Database Survey: 저장·검색 기법과 과제]({{ '/posts/comprehensive-survey-vector-database/' | relative_url }})
- [LLMs Meet Vector Databases: LLM과 벡터 DB의 결합]({{ '/posts/llms-meet-vector-databases/' | relative_url }})
- [TigerVector: 그래프 데이터베이스에서 벡터 검색]({{ '/posts/tigervector/' | relative_url }})
- [Vector Database Scaling Paradox: 멀티코어 확장의 병목]({{ '/posts/vector-database-scaling-paradox/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## SKALA 데이터·머신러닝
{: #learn-data}

### 기초통계와 가설검정

- [데이터 분석과 기초통계 2일 로드맵]({{ '/posts/skala-statistics-roadmap/' | relative_url }})
- [기술통계, 추론통계, 가설검정]({{ '/posts/skala-statistics-day1/' | relative_url }})
- [상관분석과 회귀분석]({{ '/posts/skala-statistics-day2/' | relative_url }})

### 데이터 분석 Python

- [데이터 분석 Python 2일 로드맵]({{ '/posts/skala-python-roadmap/' | relative_url }})
- [실행 구조와 비동기 수집 파이프라인]({{ '/posts/skala-python-day1/' | relative_url }})
- [Pandas·Polars·DuckDB 분석 파이프라인]({{ '/posts/skala-python-day2/' | relative_url }})

### 관계형 데이터베이스와 SQL

- [스마트 데이터 이해 및 활용 4일 로드맵]({{ '/posts/skala-smart-data-roadmap/' | relative_url }})
- [관계형 데이터베이스와 모델링]({{ '/posts/skala-smart-data-day1/' | relative_url }})
- [JOIN과 Window Function]({{ '/posts/skala-smart-data-day2/' | relative_url }})
- [인덱스, 실행 계획과 락]({{ '/posts/skala-smart-data-day3/' | relative_url }})
- [Stored Procedure와 Cloud DB 운영]({{ '/posts/skala-smart-data-day4/' | relative_url }})

### 머신러닝과 딥러닝 실험

- [머신러닝·딥러닝 3일 로드맵]({{ '/posts/skala-ml-dl-roadmap/' | relative_url }})
- [문제 정의와 머신러닝 평가]({{ '/posts/skala-ml-dl-day1/' | relative_url }})
- [손실·최적화와 신경망 구조]({{ '/posts/skala-ml-dl-day2/' | relative_url }})
- [Fashion-MNIST CNN 가설 검증]({{ '/posts/skala-ml-dl-day3/' | relative_url }})
- [Ames Housing으로 살펴보는 Feature Engineering]({{ '/posts/skala-feature-engineering/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## SKALA 프런트엔드·백엔드 설계
{: #learn-web}

### HTML·CSS·JavaScript

- [HTML·CSS·JavaScript 2일 로드맵]({{ '/posts/skala-frontend-roadmap/' | relative_url }})
- [웹 동작 원리와 HTML]({{ '/posts/skala-frontend-day1/' | relative_url }})
- [CSS 레이아웃과 JavaScript]({{ '/posts/skala-frontend-day2/' | relative_url }})

### Vue.js와 웹 프로젝트

- [Vue.js 4일 로드맵]({{ '/posts/skala-vue-roadmap/' | relative_url }})
- [SPA와 선언적 렌더링]({{ '/posts/skala-vue-day1/' | relative_url }})
- [이벤트, 폼 바인딩과 Composition API]({{ '/posts/skala-vue-day2/' | relative_url }})
- [Component와 Vue Router]({{ '/posts/skala-vue-day3/' | relative_url }})
- [Pinia, Axios와 Element Plus]({{ '/posts/skala-vue-day4/' | relative_url }})
- [Modern JavaScript, ESLint와 Vite로 빌드·배포]({{ '/posts/skala-vue-day5/' | relative_url }})
- [Vue.js 실시간 날씨 대시보드]({{ '/posts/skala-vue-project/' | relative_url }})
- [줄쟁이 톤레시피: 기타 톤 웹 서비스 설계와 데모]({{ '/posts/skala-web-mini-project-day3/' | relative_url }})

### Java·Spring Boot·REST API

- [Java·Spring Boot·REST API 5일 로드맵]({{ '/posts/skala-java-springboot-roadmap/' | relative_url }})
- [JVM에서 객체의 캡슐화까지]({{ '/posts/skala-java-springboot-day1/' | relative_url }})
- [호출부를 지키는 추상화와 데이터 파이프라인]({{ '/posts/skala-java-springboot-day2/' | relative_url }})
- [객체 설계에서 REST API 서버까지]({{ '/posts/skala-java-springboot-day3/' | relative_url }})
- [IoC·AOP·검증·비동기]({{ '/posts/skala-java-springboot-day4/' | relative_url }})
- [데이터 저장과 서비스 운영]({{ '/posts/skala-java-springboot-day5/' | relative_url }})

### 애자일·소프트웨어 공학

- [애자일 방법론과 MSA 개발 2일 로드맵]({{ '/posts/skala-agile-msa-roadmap/' | relative_url }})
- [Scrum과 Sprint Backlog 설계]({{ '/posts/skala-agile-msa-day1/' | relative_url }})
- [서비스 경계와 통합 흐름]({{ '/posts/skala-agile-msa-day2/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## SKALA LLM·Spring AI·RAG 실습
{: #learn-ai-apps}

### 프롬프트·Transformer·Fine-Tuning

- [프롬프트 설계와 Context Engineering]({{ '/posts/skala-prompt-engineering/' | relative_url }})
- [LLM과 Transformer 아키텍처 2일 로드맵]({{ '/posts/skala-transformer-roadmap/' | relative_url }})
- [NLP 표현학습의 계보와 Transformer 정독]({{ '/posts/skala-transformer-day1/' | relative_url }})
- [Modern LLM: RLHF, Scaling Law, Distillation, MoE]({{ '/posts/skala-transformer-day2/' | relative_url }})
- [sLLM 구현과 Fine-Tuning 2일 로드맵]({{ '/posts/skala-sllm-finetuning-roadmap/' | relative_url }})
- [SFT 데이터와 LoRA 학습 구조]({{ '/posts/skala-sllm-finetuning-day1/' | relative_url }})
- [Base·SFT 비교와 실패 사례]({{ '/posts/skala-sllm-finetuning-day2/' | relative_url }})

### Spring AI 애플리케이션

- [Spring AI 3일 로드맵]({{ '/posts/skala-springai-roadmap/' | relative_url }})
- [AI 애플리케이션의 계층]({{ '/posts/skala-springai-day1-layers/' | relative_url }})
- [Spring AI 추상화와 공급자 독립성]({{ '/posts/skala-springai-day1-architecture/' | relative_url }})
- [ChatClient로 모델 호출]({{ '/posts/skala-springai-day1-chatclient/' | relative_url }})
- [모델에 전달할 프롬프트 설계]({{ '/posts/skala-springai-day2-prompt/' | relative_url }})
- [구조화 출력과 응답 검증]({{ '/posts/skala-springai-day2-structured/' | relative_url }})
- [모델 호출을 나누는 워크플로]({{ '/posts/skala-springai-day2-workflow/' | relative_url }})
- [문서를 근거로 답하는 기본 RAG]({{ '/posts/skala-springai-day2-rag/' | relative_url }})
- [질의 확장과 검색 결과 재선별]({{ '/posts/skala-springai-day2-rag-advanced/' | relative_url }})
- [모델의 Tool Calling과 애플리케이션 실행]({{ '/posts/skala-springai-day3-tools/' | relative_url }})
- [되돌릴 수 있는 범위에 따른 도구 권한]({{ '/posts/skala-springai-day3-tool-safety/' | relative_url }})
- [Advisor의 적용 순서]({{ '/posts/skala-springai-day3-advisors/' | relative_url }})
- [HelpDesk AI 실습]({{ '/posts/skala-springai-day3-helpdesk/' | relative_url }})

### 문서 RAG와 에이전트 프로젝트

- [RAG 파이프라인 설계 및 구축 3일 로드맵]({{ '/posts/skala-rag-pipeline-roadmap/' | relative_url }})
- [RAG 구조와 문서 전처리]({{ '/posts/skala-rag-pipeline-day1/' | relative_url }})
- [검색·생성·평가 파이프라인]({{ '/posts/skala-rag-pipeline-day2/' | relative_url }})
- [Agentic RAG 실습: KV Cache 다중 관점 평가 프로젝트]({{ '/posts/skala-rag-pipeline-day3/' | relative_url }})
- [명탐정 피카츄: LangChain Agent로 만든 텍스트 추리 게임]({{ '/posts/skala-langchain-day3/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## SKALA 컨테이너·Kubernetes
{: #learn-infra}

### Docker: 이미지부터 여러 컨테이너 배포까지

- [컨테이너와 애플리케이션 컨테이너화 2일 로드맵]({{ '/posts/skala-container-roadmap/' | relative_url }})
- [가상화와 컨테이너]({{ '/posts/skala-container-day1-virtualization/' | relative_url }})
- [이미지 레이어와 레지스트리]({{ '/posts/skala-container-day1-image-registry/' | relative_url }})
- [Dockerfile의 레이어와 설정]({{ '/posts/skala-container-day1-dockerfile/' | relative_url }})
- [볼륨과 PID 1의 종료 신호]({{ '/posts/skala-container-day1-volume-signal/' | relative_url }})
- [세 컨테이너로 웹 서비스 구성]({{ '/posts/skala-container-day1-webservice/' | relative_url }})
- [tar에서 컨테이너 이미지 내부 읽기]({{ '/posts/skala-container-day2-image-anatomy/' | relative_url }})
- [컨테이너 격리를 만드는 커널 기능]({{ '/posts/skala-container-day2-kernel/' | relative_url }})
- [dockerd에서 runc까지]({{ '/posts/skala-container-day2-runtime-runc/' | relative_url }})
- [Docker 네트워크와 이름 해석]({{ '/posts/skala-container-day2-network/' | relative_url }})
- [Docker Compose의 서비스 의존성과 경계]({{ '/posts/skala-container-day2-compose/' | relative_url }})

### Kubernetes: 선언형 구성과 클러스터 내부

- [Kubernetes 애플리케이션 배포 2일·13장 로드맵]({{ '/posts/skala-kubernetes-roadmap/' | relative_url }})
- [1장 · 선언형 운영과 핵심 리소스]({{ '/posts/skala-kubernetes-ch01-why-kubernetes/' | relative_url }})
- [2장 · 컨테이너 이미지와 재현 가능한 빌드]({{ '/posts/skala-kubernetes-ch02-container-image/' | relative_url }})
- [3장 · 컨트롤 플레인, 워커 노드와 네트워크]({{ '/posts/skala-kubernetes-ch03-architecture/' | relative_url }})
- [4장 · API 요청부터 컨테이너 실행까지]({{ '/posts/skala-kubernetes-ch04-cluster-internals/' | relative_url }})
- [5장 · EKS 접속과 kubectl 기본 진단]({{ '/posts/skala-kubernetes-ch05-environment-kubectl/' | relative_url }})
- [6장 · kubectl 운영·디버깅 도구]({{ '/posts/skala-kubernetes-ch06-kubectl-operations/' | relative_url }})
- [7장 · Pod 생명주기와 프로브]({{ '/posts/skala-kubernetes-ch07-pod/' | relative_url }})

### Kubernetes: 배포·네트워크·스토리지

- [8장 · Deployment와 무중단 롤아웃]({{ '/posts/skala-kubernetes-ch08-deployment-rollout/' | relative_url }})
- [9장 · Service와 클러스터 네트워킹]({{ '/posts/skala-kubernetes-ch09-service-networking/' | relative_url }})
- [10장 · 외부 요청의 호출 흐름]({{ '/posts/skala-kubernetes-ch10-request-flow/' | relative_url }})
- [11장 · Ingress와 외부 노출]({{ '/posts/skala-kubernetes-ch11-ingress/' | relative_url }})
- [12장 · ConfigMap, Secret과 스토리지]({{ '/posts/skala-kubernetes-ch12-config-storage/' | relative_url }})
- [13장 · 리소스 설계와 운영 배포 점검]({{ '/posts/skala-kubernetes-ch13-resource-deployment/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## 개발 환경·코딩테스트·학습 기록
{: #learn-notes}

### GPU 개발 환경과 실험 재현성

- [NVIDIA GPU 상태 확인과 관리 도구]({{ '/posts/nvidia-graphic-card-useful-tools/' | relative_url }})
- [CUDA Toolkit 여러 버전 설치와 선택]({{ '/posts/cuda-version-%EC%97%AC%EB%9F%AC-%EA%B0%9C-%EC%82%AC%EC%9A%A9%ED%95%98%EA%B8%B0/' | relative_url }})
- [딥러닝 실험의 시드 고정]({{ '/posts/seed-fixing-1/' | relative_url }})
- [PyTorch state_dict 이해하기]({{ '/posts/pytorch-state-dict/' | relative_url }})

### Python과 코딩테스트 연습

- [Python 객체의 가변성과 참조 공유]({{ '/posts/python-mutable-immutable/' | relative_url }})
- [코드트리 갭체크로 코딩테스트 준비 시작하기]({{ '/posts/%EC%BD%94%EB%93%9C%ED%8A%B8%EB%A6%AC-%ED%9B%84%EA%B8%B0-%EC%BD%94%EB%94%A9%ED%85%8C%EC%8A%A4%ED%8A%B8-%EC%A4%80%EB%B9%84-%EA%B0%AD%EC%B2%B4%ED%81%AC%EB%B6%80%ED%84%B0-%EC%8B%9C%EC%9E%91%ED%95%98%EA%B8%B0/' | relative_url }})
- [코드트리 시뮬레이션 유형 공부]({{ '/posts/%EC%BD%94%EB%93%9C%ED%8A%B8%EB%A6%AC-%ED%9B%84%EA%B8%B0-%EC%8B%9C%EB%AE%AC%EB%A0%88%EC%9D%B4%EC%85%98%EC%9C%A0%ED%98%95-%EA%B3%B5%EB%B6%80/' | relative_url }})
- [코드트리와 GitHub 연동]({{ '/posts/%EC%BD%94%EB%93%9C%ED%8A%B8%EB%A6%AC-%EA%B9%83%ED%97%88%EB%B8%8C%EC%97%B0%EB%8F%99/' | relative_url }})
- [코드트리 북카트로 백트래킹 복습하기]({{ '/posts/%EC%BD%94%EB%93%9C%ED%8A%B8%EB%A6%AC-%ED%9B%84%EA%B8%B0-%EB%B6%81%EC%B9%B4%ED%8A%B8%EB%A1%9C-%EB%82%98%EB%A7%8C%EC%9D%98-%EB%B3%B5%EC%8A%B5-%EB%A3%A8%ED%8B%B4-%EB%A7%8C%EB%93%A4/' | relative_url }})
- [코드트리 갭체크 한 달 후기]({{ '/posts/%EC%BD%94%ED%85%8C-%EC%A4%91%EA%B0%84-%EC%A0%90%EA%B2%80-%EC%BD%94%EB%93%9C%ED%8A%B8%EB%A6%AC-%EA%B0%AD%EC%B2%B4%ED%81%AC-%ED%95%9C%EB%8B%AC-%ED%9B%84%EA%B8%B0/' | relative_url }})

### 블로그·취업 준비·부트캠프 회고

- [블로그를 시작하며]({{ '/posts/start/' | relative_url }})
- [대학원 이후 취업 준비와 부트캠프에 이르기까지]({{ '/posts/job-hunt-log-1/' | relative_url }})
- [SKALA 판교캠퍼스 4기 입과 한 달 후기]({{ '/posts/skala-1month-review/' | relative_url }})

</section>

</div>

<script src="{{ '/assets/js/learn.js' | relative_url }}" defer></script>
