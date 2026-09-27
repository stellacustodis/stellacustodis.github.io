---
title: "[SKALA] Agile 방법론과 MSA 개발 — 2일 학습 로드맵"
date: 2026-08-26 08:00:00 +0900
permalink: /posts/skala-agile-msa-roadmap/
categories:
  - SKALA
  - Software Engineering
tags: [skala, agile, scrum, msa, spring-boot]
description: "Scrum의 작업 단위에서 출발해 사용자 흐름을 MSA의 서비스 경계와 API 계약으로 옮긴다."
related: [skala-agile-msa-day1, skala-agile-msa-day2]
---

## 과정 흐름

요구사항을 서비스 여러 개로 나누기 전에, 팀이 이번 Sprint에서 무엇을 끝낼지부터 정해야 한다. 사용자 스토리와 인수 기준을 정한 뒤, 이를 서비스별 API 계약에 연결하는 흐름으로 이틀의 내용을 정리했다.

| 날짜 | 주제 | 글 |
|---|---|---|
| 1일차 · 2026-08-26 | Scrum과 Sprint Backlog 설계 | [본문 보기](/posts/skala-agile-msa-day1/) |
| 2일차 · 2026-08-27 | 서비스 경계와 통합 흐름 | [본문 보기](/posts/skala-agile-msa-day2/) |

```text
Scrum과 Sprint Backlog 설계 → 서비스 경계와 통합 흐름
```

## 사용자 흐름과 서비스 경계

수강 신청을 Sprint 목표로 삼는다면 로그인 실패, 중복 신청, 신청 성공을 확인할 조건이 필요하다. 서비스별로 구현을 나누더라도 이 조건은 하나의 사용자 흐름을 가리켜야 한다. 서비스 경계는 그 흐름에서 각 서비스가 책임질 상태와 응답을 기준으로 읽는다.

다음 글: [1일차 — Scrum과 Sprint Backlog 설계](/posts/skala-agile-msa-day1/)
