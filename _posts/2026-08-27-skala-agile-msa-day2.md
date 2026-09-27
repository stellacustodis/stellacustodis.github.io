---
title: "[SKALA] Agile 방법론과 MSA 개발 2일차 — 서비스 경계와 통합 흐름"
date: 2026-08-27 12:00:00 +0900
permalink: /posts/skala-agile-msa-day2/
categories:
  - SKALA
  - Software Engineering
tags: [skala, agile, scrum, msa, spring-boot]
description: "제공된 MSA 예제의 인증·Gateway·업무 서비스·이벤트 경로를 따라가며 통합 실패를 점검한다."
related: [skala-agile-msa-roadmap, skala-agile-msa-day1]
---

## 서비스 구성을 먼저 읽는 이유

MSA 예제는 Eureka, API Gateway, 인증 서버, MariaDB, Kafka와 여러 업무 서비스로 구성된다. `msa-lecture/docker-compose.yml`과 `course-service`·`enrollment-service` 디렉터리를 보면 각 구성 요소를 확인할 수 있다. 여기서는 인프라를 다시 만드는 절차보다 서비스의 책임과 요청 흐름을 먼저 읽는다.

설계상의 요청 흐름에서는 클라이언트의 로그인과 수강 신청 요청을 Gateway가 각 서비스로 라우팅한다. 전체 시나리오를 실행해 검증한 결과는 아니다. 인증 정보는 인증 서버의 책임이고, 강좌 조회와 신청 상태 변경은 각 도메인 서비스의 책임이다. 서비스 발견은 Eureka가 돕지만, 발견 기능만으로 API 계약이나 데이터 일관성이 보장되지는 않는다.

## 동기 호출과 이벤트의 경계

사용자에게 즉시 성공·실패를 알려야 하는 요청은 동기 API가 자연스럽다. 수강 신청 완료 이후 다른 서비스가 후속 처리를 할 때는 Kafka 같은 이벤트 경로를 고려할 수 있다. 이벤트 발행과 소비가 분리되면 중복 전달, 순서, 재시도와 실패 시 상태 보정도 설계해야 한다. ‘비동기’가 곧 ‘항상 안전함’을 뜻하지 않는다.

## 실습 코드를 검증하는 순서

1. Compose의 서비스 이름, 포트, 의존성을 확인한다.
2. 인증 후 받은 토큰이 어떤 요청 헤더로 전달되는지 본다.
3. Gateway 경로와 실제 서비스 엔드포인트가 맞는지 비교한다.
4. 정상 응답뿐 아니라 권한 부족, 중복 신청, 후속 이벤트 실패를 구분한다.

이 과정에서 첫날의 인수 기준이 API 테스트와 화면 확인으로 이어진다. 이 예제는 교육용이므로 운영 환경의 보안·장애 대응까지 갖춘 구성으로 해석하지 않는다.

## 기동 순서가 알려 주는 의존성

예제의 기동 안내는 MariaDB·Kafka, Eureka, 인증 서버, Gateway와 업무 서비스 순서로 이어진다. 개발 환경에서 `docker compose up -d`만 실행해도 각 서비스가 곧바로 준비됐다고 가정하면 로그인이나 신청 API가 간헐적으로 실패할 수 있다. 컨테이너가 실행 중인지와 애플리케이션이 요청을 받을 준비가 됐는지는 다르다.

문제가 생기면 전체 로그를 한꺼번에 읽기보다 실패한 요청의 진입점에서 안쪽으로 좁힌다. Gateway의 라우팅, 인증 서버의 응답, 목적지 서비스의 상태, 데이터베이스와 이벤트 브로커 연결을 순서대로 확인한다. 화면의 오류 메시지 하나로 어느 서비스가 고장 났는지 단정하지 않는다.

---

이전 글: [1일차 — Scrum과 Sprint Backlog 설계](/posts/skala-agile-msa-day1/)

시리즈 안내: [Agile 방법론과 MSA 개발 — 2일 학습 로드맵](/posts/skala-agile-msa-roadmap/)
