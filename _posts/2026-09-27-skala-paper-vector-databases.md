---
title: "[논문 리뷰] 벡터 DB 네 문헌 — 검색 구조와 확장 비용"
date: 2026-09-27 11:00:00 +0900
permalink: /posts/skala-paper-vector-databases/
categories:
  - AI
  - Paper Review
tags: [paper-review, skala, vector-database, graph-rag, scalability]
related: [skala-smart-data-roadmap]
---

SKALA 스마트 데이터 교안의 ‘Initial 및 Trend’ 자료는 벡터 DB 관련 문헌 네 편을 인용한다. 두 편은 기술 지형을 정리한 서베이, 한 편은 그래프 DB에 벡터 검색을 넣은 시스템 논문, 나머지 한 편은 HPC 환경에서 벡터 DB를 측정한 실험 논문이다. **어떤 주장을 실험으로 확인했고 어떤 주장은 분류·전망인지** 나눠 읽었다.

## 두 서베이가 설명하는 범위

[*A Comprehensive Survey on Vector Database: Storage and Retrieval Technique, Challenge*](https://arxiv.org/abs/2310.11703)은 고차원 벡터를 저장하고 근사 최근접 이웃을 찾는 DB의 설계 문제를 **저장 구조와 검색 기법**으로 나눠 정리한다. 자료구조와 인덱스, 검색 품질·지연·공간 사이의 선택을 이해할 때 참고할 만하다. 서베이 자체가 모든 벡터 DB를 동일 환경에서 재측정한 벤치마크는 아니다. ‘이 알고리즘이 항상 더 빠르다’는 결론을 이 문헌만으로 끌어낼 수 없다.

[*When Large Language Models Meet Vector Databases: A Survey*](https://arxiv.org/abs/2402.01763)은 관점을 LLM과 벡터 DB의 결합으로 옮긴다. 모델 내부의 지식이 낡거나 도메인 정보가 부족할 때, 외부 표현을 저장·검색해 입력에 넣는 경로를 살핀다. 두 서베이는 서로 대체재가 아니다. 앞의 문헌은 **DB 내부의 저장·검색 문제**, 뒤의 문헌은 **LLM 애플리케이션에서 그 DB가 맡는 역할**에 무게를 둔다. 벡터 DB가 있으면 환각이 사라진다는 뜻도 아니다. 검색 실패, 잘못된 문서, 생성 단계의 왜곡은 별도로 평가해야 한다.

## TigerVector: 벡터 검색과 그래프 탐색을 한 질의에

Shige Liu와 공저자의 [*TigerVector: Supporting Vector Search in Graph Databases for Advanced RAGs*](https://arxiv.org/abs/2501.11216)는 TigerGraph의 정점 속성에 임베딩 타입을 더하고, 병렬 벡터 인덱스와 그래프 엔진을 연동한다. GSQL 질의 안에서 벡터 검색 결과를 그래프 탐색과 조합할 수 있게 한 것이 핵심이다. 단순히 두 시스템의 결과 목록을 애플리케이션에서 합치는 방식과 달리, 한 DB의 데이터·질의 체계에서 관계와 유사도를 함께 다룬다.

저자들은 Neo4j, Amazon Neptune, Milvus 등과 비교해 벡터 검색·하이브리드 검색·확장성을 평가한다. 이 결과는 **논문의 데이터, 질의, 하드웨어, 제품 버전에서의 비교**다. 그래프 관계가 필요 없는 문서 검색까지 항상 그래프 DB로 옮겨야 한다는 근거는 아니다. 실제 선택에서는 관계 탐색이 질의의 어느 단계에 필요한지, 인덱스 갱신과 운영 비용이 얼마인지부터 정해야 한다.

교안의 ‘벡터 검색이 그래프 DB의 표준 기능이 된다’는 제목은 흐름을 설명하는 말로 읽는 편이 맞다. TigerVector 한 시스템의 실험으로 모든 그래프 DB가 같은 기능과 성능을 제공한다는 사실을 증명한 것은 아니다.

## 코어를 늘렸는데 느려지는 조건

Seth Ockerman과 공저자의 [*When More Cores Hurts: The Vector Database Scaling Paradox in HPC*](https://arxiv.org/abs/2606.08950)는 Milvus, Qdrant, Weaviate를 **두 슈퍼컴퓨터의 HPC 환경**에서 측정했다. 최대 64개 노드·256개 분산 작업자를 사용하고, 쓰기와 검색이 섞인 부하 및 적재 후 검색 부하를 비교한다. 일부 조건에서는 코어를 늘렸을 때 질의 처리량이 **최대 30.67% 감소**했고, 작업자를 16개에서 256개로 16배 늘려도 성능 개선은 **5.46배**에 그쳤다고 보고한다.

제목만 보고 ‘벡터 DB는 코어를 늘리면 느려진다’로 일반화하면 실험 범위를 벗어난다. 데이터 분할, 임베딩 분포, 검색 recall 목표, 일괄 적재 방식과 스토리지 계층이 성능을 바꾼다. 논문이 확인한 것은 **클라우드 중심으로 설계된 벡터 DB를 HPC에 가져왔을 때 생기는 확장 병목**이다. 운영 환경이 다르면 같은 제품도 다른 지점에서 막힐 수 있다.

## 설계에 가져갈 질문

벡터 DB 선택은 ‘어느 제품이 가장 빠른가’ 한 줄로 끝나지 않는다. 이 네 문헌을 연결하면 질문이 세 가지로 좁혀진다. 첫째, 목표 recall에서 인덱스와 저장 공간이 얼마나 드는가. 둘째, 검색 결과를 그래프 관계와 결합해야 하는가. 셋째, 실제 읽기·쓰기 비율과 배포 하드웨어에서 처리량이 어떻게 늘어나는가. 서베이는 선택지를 정리해 주고, TigerVector와 HPC 실험은 **자기 시스템에 필요한 측정 조건**을 설계할 근거를 준다.

강의 흐름: [스마트 데이터 학습 로드맵](/posts/skala-smart-data-roadmap/)
