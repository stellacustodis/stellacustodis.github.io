---
layout: page
title: 학습 로드맵
description: "인공지능 논문 리뷰와 SKALA 기반의 Python, Transformer, Spring AI, Docker 학습 경로를 한곳에 모았다."
icon: fas fa-route
order: 3
permalink: /learn/
---

<link rel="stylesheet" href="{{ '/assets/css/learn.css' | relative_url }}">

아래 순서에 따라 주제별로 읽을 수 있습니다.

<div id="learn-roadmap" data-post-path="{{ '/posts/' | relative_url }}" markdown="1">

<div id="learn-progress"></div>

<section class="learn-track" markdown="1">

## 생성형 AI·딥러닝 기초

- [연구실 뉴비를 위한 딥러닝 필수 모델·기법 로드맵]({{ '/posts/dl-foundational-roadmap/' | relative_url }})
- [LLM과 Transformer 아키텍처 — 2일 학습 로드맵]({{ '/posts/skala-transformer-roadmap/' | relative_url }})
- [NLP 표현학습의 계보 — Word2Vec에서 Attention까지]({{ '/posts/paper-review-nlp-foundations/' | relative_url }})
- [Transformer 태그의 논문 리뷰와 학습 노트]({{ '/tags/transformer/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## Transformer·linear attention 논문 읽기

Transformer의 기본 구조에서 출발해 효율적인 상태 공간과 linear attention으로 이어지는 경로입니다.

- [Attention과 Transformer 기본기]({{ '/posts/paper-review-transformer/' | relative_url }})
- [Transformer 변형 논문 모음]({{ '/posts/paper-review-transformer-variants/' | relative_url }})
- [Linear Transformer는 Fast Weight Programmer다]({{ '/posts/fast-weight-programmers/' | relative_url }})
- [DeltaNet의 길이 방향 병렬화]({{ '/posts/deltanet/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## 생성 모델·확률 모델

- [DDPM과 확산 모델]({{ '/posts/ddpm/' | relative_url }})
- [DDIM의 비확률적 샘플링]({{ '/posts/ddim/' | relative_url }})
- [Score-Based Generative Modeling과 SDE]({{ '/posts/score-sde/' | relative_url }})
- [Flow Matching과 Rectified Flow]({{ '/posts/flow-matching/' | relative_url }})
- [Classifier-Free Diffusion Guidance]({{ '/posts/cfg/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## Image Editing

확산 모델의 역변환과 편집 제어에서 출발해, 텍스트·마스크·포인트 조건으로 실제 이미지를 수정하는 방법을 따라가는 경로입니다.

- [DiffusionCLIP: Text-Guided Diffusion Models for Robust Image Manipulation]({{ '/posts/diffusionclip/' | relative_url }})
- [Null-text Inversion for Editing Real Images using Guided Diffusion Models]({{ '/posts/null-text-inversion/' | relative_url }})
- [EDICT: Exact Diffusion Inversion via Coupled Transformations]({{ '/posts/edict/' | relative_url }})
- [DIFFEDIT: DIFFUSION-BASED SEMANTIC IMAGE EDITING WITH MASK GUIDANCE]({{ '/posts/diffedit/' | relative_url }})
- [InstructPix2Pix: Learning to Follow Image Editing Instructions]({{ '/posts/instructpix2pix/' | relative_url }})
- [Plug-and-Play Diffusion Features for Text-Driven Image-to-Image Translation]({{ '/posts/plug-and-play-diffusion-features/' | relative_url }})
- [MasaCtrl: Tuning-Free Mutual Self-Attention Control for Consistent Image Synthesis and Editing]({{ '/posts/masactrl/' | relative_url }})
- [LEDITS++: Limitless Image Editing using Text-to-Image Models]({{ '/posts/ledits-plus-plus/' | relative_url }})
- [Inversion-Free Image Editing with Language-Guided Diffusion Models]({{ '/posts/inversion-free-image-editing/' | relative_url }})
- [Drag Your Noise: Interactive Point-based Editing via Diffusion Semantic Propagation]({{ '/posts/drag-your-noise/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## SKALA 백엔드·AI 애플리케이션

- [Java·Spring Boot·REST API 5일 로드맵]({{ '/posts/skala-java-springboot-roadmap/' | relative_url }})
- [Spring AI 3일 로드맵]({{ '/posts/skala-springai-roadmap/' | relative_url }})
- [Spring AI 실습 모음 (프롬프트, RAG, 구조화 출력, Tool Calling)]({{ '/tags/spring-ai/' | relative_url }})
- [컨테이너 이해 및 애플리케이션 컨테이너화]({{ '/posts/skala-container-roadmap/' | relative_url }})

</section>

<section class="learn-track" markdown="1">

## 데이터·프론트엔드·개발 환경

- [데이터 분석을 위한 Python 2일 로드맵]({{ '/posts/skala-python-roadmap/' | relative_url }})
- [스마트 데이터 이해 및 활용 4일 로드맵]({{ '/posts/skala-smart-data-roadmap/' | relative_url }})
- [Vue.js 프론트엔드 4일 로드맵]({{ '/posts/skala-vue-roadmap/' | relative_url }})
- [Full-Stack Engineering 프론트엔드 로드맵]({{ '/posts/skala-frontend-roadmap/' | relative_url }})
- [Docker 태그의 컨테이너 실습 모음]({{ '/tags/docker/' | relative_url }})

</section>

</div>

## 이 블로그를 읽는 방법

개념을 처음 만났다면 로드맵부터 읽고, 구현이 궁금할 때는 해당 시리즈의 일별 글로 내려가세요. 논문 리뷰에서는 요약만 읽기보다 수식과 실험 한계를 함께 확인하는 것을 권합니다. 각 글의 하단 관련 글에서 다음 주제로 이동할 수 있습니다.

<script src="{{ '/assets/js/learn.js' | relative_url }}" defer></script>
