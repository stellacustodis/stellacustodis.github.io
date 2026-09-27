---
title: "[SKALA] Agile 방법론과 MSA 개발 1일차 — Scrum과 Sprint Backlog 설계"
date: 2026-08-26 12:00:00 +0900
permalink: /posts/skala-agile-msa-day1/
categories:
  - SKALA
  - Software Engineering
tags: [skala, agile, scrum, msa, spring-boot]
description: "Product Backlog와 Sprint Backlog를 구분하고, 사용자 스토리의 인수 기준을 API와 화면 테스트로 이어간다."
related: [skala-agile-msa-roadmap, skala-agile-msa-day2]
---

## 요구사항을 Sprint의 작업으로 내리는 순서

애자일(Agile)은 짧은 주기로 동작하는 결과물을 만들고 피드백을 반영한다. 이때 Product Backlog는 제품에 필요한 요구의 목록이고, Sprint Backlog는 이번 반복에서 완료할 항목과 작업 계획이다. 두 목록을 같은 것으로 취급하면 우선순위가 정해지지 않은 요구가 곧바로 개발 작업으로 들어간다.

사용자 스토리는 사용자의 목적을 기술하고, 인수 기준은 완료를 판단할 관찰 가능한 조건으로 쓴다. 예를 들어 수강 신청 화면이라면 단순히 “신청 기능 구현”이라고 적는 대신 신청 가능한 강좌, 중복 신청, 인증 실패에 대한 응답을 정해야 한다. 이렇게 적은 인수 기준은 API와 화면을 검증할 때 테스트 조건으로 사용할 수 있다.

## Scrum 이벤트와 산출물

Sprint Planning에서는 목표와 범위를 합의한다. Daily Scrum은 진행 상황과 장애물을 짧게 공유한다. Review에서는 실제로 동작하는 Increment를 보여주고, Retrospective에서는 일하는 방식을 조정한다. Review의 기능 피드백과 회고의 프로세스 개선은 목적이 다르다.

```text
제품 목표 → Product Backlog → Sprint 목표·Backlog → 구현·검증
                                         ↓
                              Review와 Retrospective
```

## MSA와 연결되는 지점

MSA 예제는 인증, 사용자, 강좌, 수강 신청, 결제 등으로 서비스를 나눈다. 첫날의 스토리와 인수 기준을 서비스별 API 계약으로 옮겨야 다음 날 통합할 때 프런트엔드와 백엔드가 같은 기능을 가리킨다. 서비스 수를 늘리는 것 자체가 목표가 아니라, 변경 단위와 책임 경계를 드러내는 것이 중요하다.

Sprint의 완료 조건은 회의가 끝났다는 사실이 아니라, 합의한 사용자 흐름을 확인할 수 있는 상태다.

## 인수 기준을 쓰는 예

실습의 수강 신청 기능을 예로 들면, 스토리는 “학습자는 원하는 강좌를 신청한다”로 시작할 수 있다. 작업으로 넘기려면 성공 응답뿐 아니라 로그인하지 않은 요청, 정원이 찬 강좌, 같은 강좌에 대한 중복 신청을 어떻게 처리할지도 합의해야 한다. 예시는 설계 방식의 설명이며 실습 코드가 이 모든 경우를 구현했다는 뜻은 아니다.

작업을 서비스별로 나누더라도 인수 기준은 하나의 사용자 흐름을 가리켜야 한다. 프런트엔드는 버튼 클릭 뒤의 상태를, Gateway는 경로와 인증을, 신청 서비스는 상태 전이를 담당한다. 누가 어떤 응답을 내는지 미리 적어 두면 Sprint Review에서 “화면은 열리지만 신청은 안 되는” 결과를 완료로 오인하지 않는다.

---

시리즈 안내: [Agile 방법론과 MSA 개발 — 2일 학습 로드맵](/posts/skala-agile-msa-roadmap/)

다음 글: [2일차 — 서비스 경계와 통합 흐름](/posts/skala-agile-msa-day2/)
