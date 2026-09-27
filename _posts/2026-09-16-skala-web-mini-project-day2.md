---
title: "[SKALA] AI 웹 서비스 설계 Mini-project 2일차 — 데이터 모델과 API 계약"
date: 2026-09-16 12:00:00 +0900
permalink: /posts/skala-web-mini-project-day2/
categories:
  - SKALA
  - Fullstack
tags: [skala, web-service, requirements, api-design, database]
description: "TraceFab 요구사항을 ERD와 OpenAPI에 연결하고 문서 버전·권한·상태 전이를 살핀다."
related: [skala-web-mini-project-roadmap, skala-web-mini-project-day1, skala-web-mini-project-day3]
---

## 화면 뒤의 데이터를 명시하기

둘째 날 교안은 ERD와 REST API 명세를 요구한다. TraceFab 설계에서 이상 건, 설비, 알람 이벤트, 사용자, 원인 후보, 점검 기록, 해결 기록, 지식 문서 같은 개체가 필요한 이유는 각각의 변경 시점과 책임이 다르기 때문이다. 센서 요약과 원본 자료의 위치도 구분한다.

개인 OpenAPI 파일은 로그인, 이상 목록·상세, 담당자 지정, 상태 변경, 관련 컨텍스트, AI 분석, 점검과 해결 경로를 정의했다. 요청·응답뿐 아니라 401/403/404/409 같은 실패 응답을 기술해 화면이 오류를 처리할 수 있게 했다. 예를 들어 다른 사용자가 먼저 담당자를 바꾼 경우 충돌 응답을 반환하는 설계다.

## 설계 문서의 일관성 검사

```text
요구사항 ID ↔ 화면 ID ↔ API operationId ↔ 데이터 엔티티
```

한 요구사항이 화면에는 있는데 API나 저장 구조에 없다면 구현 단계에서 빈틈이 드러난다. 반대로 API가 있는데 어떤 사용자 흐름에도 연결되지 않으면 범위를 다시 확인한다. OpenAPI와 DBML은 설계 계약이며, 문서가 존재한다는 사실만으로 서버가 동작한다고 주장하지 않는다.

## 문서 버전을 데이터로 남기기

이상 건을 조사할 때 현재 승인된 작업 절차서를 보여주는 것과, 과거 조치 당시 참고한 문서 버전을 보관하는 것은 다른 요구다. 문서를 최신 버전 하나로 덮어쓰면 이전 판단의 근거를 다시 확인하기 어렵다. 따라서 사건 기록에는 참고한 문서의 식별자와 버전이 함께 남아야 한다.

상태 변경 API도 단순한 문자열 수정으로 끝나지 않는다. 필수 점검과 조치 기록, 승인 조건을 확인하지 않은 채 `완료`를 허용하면 업무 규칙이 화면마다 달라진다. 전이 조건을 서버 한곳에서 검사하도록 명세를 읽는 것이 중요하다.

---

이전 글: [1일차 — 문제와 요구사항을 정의하기](/posts/skala-web-mini-project-day1/)

시리즈 안내: [AI 웹 서비스 설계 Mini-project — 3일 학습 로드맵](/posts/skala-web-mini-project-roadmap/)

다음 글: [3일차 — 설계 보완과 발표에서 확인할 것](/posts/skala-web-mini-project-day3/)
