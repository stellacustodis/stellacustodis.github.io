---
title: "[논문 리뷰] RAG의 입력 배치·요약 밀도·응답 평가 — 세 편의 실험"
date: 2026-09-27 12:00:00 +0900
permalink: /posts/skala-paper-rag-context-evaluation/
categories:
  - AI
  - Paper Review
tags: [paper-review, skala, rag, long-context, evaluation]
---

RAG 교안은 검색 결과를 LLM에 넣기 전후에 할 수 있는 작업으로 문서 재배치, 요약, 평가를 소개한다. 그 근거로 붙은 세 논문은 **서로 다른 단계**를 측정한다. 검색기 성능, LLM이 입력 문맥을 쓰는 능력, 생성 답변의 품질을 하나의 점수로 섞지 않기 위해 각 실험의 대상을 확인했다.

## Lost in the Middle: 찾아온 문서가 입력 어디에 있는가

Nelson Liu와 공저자의 [*Lost in the Middle: How Language Models Use Long Contexts*](https://arxiv.org/abs/2307.03172)는 정답이 들어 있는 정보의 **입력 내 위치**를 바꾸며 모델의 응답을 비교한다. 다중 문서 질문응답과 키-값 검색 두 과제를 사용했고, 관련 정보가 앞이나 끝에 있을 때보다 가운데에 있을 때 성능이 떨어지는 경향을 관찰했다. 특히 이 결과는 문서가 이미 입력에 들어온 뒤, **모델이 그 문서를 실제로 활용하는가**를 묻는다.

RAG 교안 PDF 72쪽은 이 논문을 reranker 옆에 인용한다. 관련 문서를 위쪽에 배치하는 설계의 동기로는 쓸 수 있지만, 논문 자체가 특정 reranker를 학습하거나 ‘rerank하면 정확도가 몇 % 오른다’고 실험한 것은 아니다. 검색기에서 정답 문서를 못 찾은 오류와, 찾았는데 입력 중간에 묻혀 사용하지 못한 오류를 따로 세야 한다. 재배치는 후자에 대응한다.

## Chain of Density: 길이를 늘리지 않고 내용을 더 담기

Griffin Adams와 공저자의 [*From Sparse to Dense: GPT-4 Summarization with Chain of Density Prompting*](https://arxiv.org/abs/2309.04269)은 처음에는 적은 개체만 담은 요약을 만들고, 다음 단계마다 빠진 중요한 **개체(entity)**를 1~3개씩 추가하도록 요청한다. 핵심 제약은 **요약 길이를 늘리지 않는 것**이다. 새 정보를 넣으려면 기존 문장을 합치거나 다시 써야 한다. 단순히 키워드를 뒤에 누적하는 절차와 다르다.

논문은 CNN/DailyMail 기사 100개에 대해 사람의 선호를 조사했다. 기본 GPT-4 프롬프트보다 정보 밀도가 높은 요약이 선호됐지만, 읽기 어려울 정도로 빽빽해지면 무조건 좋은 요약이 되는 것은 아니었다. 이 연구는 **요약문의 정보 밀도와 가독성**을 다룬다. 요약을 벡터 DB에 넣었을 때 검색 속도나 RAG 정답률이 올라간다는 실험은 하지 않았다.

교안 PDF 96쪽은 이 방법을 ‘핵심 키워드를 계속 추가하면서 요약을 확장’한다고 설명한다. 원문의 중요한 조건인 **고정된 길이에서 개체를 압축·통합**한다는 점을 함께 적어야 방법이 달라지지 않는다. 검색용 요약 생성에 적용한다면, 검색 지표는 별도 실험으로 확인해야 한다.

## SemScore: 평가 모델의 판단이 아니라 임베딩 유사도

Ansar Aynetdinov와 Alan Akbik의 [*SemScore: Automated Evaluation of Instruction-Tuned LLMs based on Semantic Textual Similarity*](https://arxiv.org/abs/2401.17072)은 모델 응답과 참조 답변을 문장 임베딩으로 바꾼 뒤 의미 유사도를 계산한다. 저자들은 instruction-tuned 모델 12개와 자동 지표 8개를 비교하고, 이 실험에서 SemScore의 사람 평가와의 상관이 다른 비교 지표보다 높았다고 보고한다. 단어가 달라도 의미가 비슷한 답을 BLEU·ROUGE보다 잘 포착할 수 있다는 것이 연구의 동기다.

교안 PDF 154쪽은 SemScore를 ‘LLM-as-a-Judge’ 아래에 넣고 기계 번역·요약 평가에도 쓰인다고 설명한다. 그러나 **이 논문의 SemScore 계산에는 판정하는 LLM이 없다.** 임베딩 모델과 cosine similarity를 쓰는 자동 지표다. 또한 논문 실험 대상은 instruction-tuned LLM의 응답 평가다. 번역과 요약에도 응용할 가능성은 있지만, 그 과제에서 동일한 상관관계를 검증했다는 결과로 읽을 수는 없다.

참조 답변이 하나뿐인데 정답 표현이 여러 가지인 질문이라면, 의미 유사도도 완전한 사실성 검사기는 아니다. RAG의 출처 충실도는 **답변이 근거 문서의 어느 구절에 의해 뒷받침되는지** 별도로 확인해야 한다.

## 세 논문을 파이프라인에 배치하면

검색기가 정답 문서를 찾았는지부터 Hit Rate·MRR로 확인한다. 다음으로 *Lost in the Middle*이 다룬 **입력 내 위치**를 점검한다. 요약을 만들 때는 *Chain of Density*의 길이와 정보 밀도 사이의 선택을 검토한다. 마지막으로 *SemScore*를 응답의 의미 유사도 지표 중 하나로 쓸 수 있지만, 출처 충실도와 사실 검증을 대신하지는 않는다. 논문 세 편은 각각 다른 병목에 대한 근거다.
