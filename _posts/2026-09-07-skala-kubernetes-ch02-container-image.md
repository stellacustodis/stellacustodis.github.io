---
title: "[SKALA] 쿠버네티스 2장 — 컨테이너 이미지와 재현 가능한 빌드"
date: 2026-09-07 10:00:00 +0900
permalink: /posts/skala-kubernetes-ch02-container-image/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, container, dockerfile, image, jvm]
description: "컨테이너와 이미지의 차이, Dockerfile 레이어 캐시, 멀티스테이지 빌드, JVM 메모리와 불변 이미지 태그를 배포 관점에서 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch01-why-kubernetes, skala-kubernetes-ch03-architecture]
---

## 컨테이너의 정체

컨테이너는 작은 가상 머신이 아니라 격리된 리눅스 프로세스다. namespace가 프로세스·네트워크·마운트의 시야를 분리하고, cgroup이 CPU와 메모리 상한을 강제하며, 계층형 파일시스템이 읽기 전용 이미지 위에 쓰기 층을 얹는다.

이미지는 빌드 시점에 정해진 읽기 전용 설계도이고, 컨테이너는 그 이미지에 임시 쓰기 층을 추가한 실행 인스턴스다. 컨테이너 내부에 직접 만든 파일은 컨테이너 수명에 묶인다. 로그는 stdout/stderr로 보내 수집기가 가져가게 하고, 영속 데이터는 PVC나 외부 저장소로 분리해야 한다.

## 레이어 순서가 빌드 시간을 결정한다

Dockerfile의 파일시스템 변경은 레이어와 캐시를 만든다. 어느 단계의 입력이 바뀌면 그 단계부터 아래가 다시 실행된다. 따라서 자주 바뀌지 않는 의존성 정의를 먼저 복사하고, 자주 바뀌는 소스는 뒤에 둔다.

```dockerfile
FROM eclipse-temurin:21-jdk AS builder
WORKDIR /build

COPY gradlew settings.gradle build.gradle ./
COPY gradle/ gradle/
RUN ./gradlew dependencies --no-daemon

COPY src/ src/
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY --from=builder /build/build/libs/*.jar app.jar
USER app
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
```

멀티스테이지 빌드는 컴파일에 필요한 JDK·Gradle·소스를 최종 런타임 이미지에서 제외한다. 이미지 크기뿐 아니라 공격면과 유출 가능한 빌드 정보도 줄인다.

## ENTRYPOINT와 종료 신호

서버 애플리케이션은 다음과 같이 exec 형식의 `ENTRYPOINT`를 사용한다.

```dockerfile
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

셸 형식인 `ENTRYPOINT java -jar /app/app.jar`를 쓰면 PID 1이 셸이 될 수 있고, Kubernetes가 보내는 SIGTERM이 Java 프로세스까지 올바르게 전달되지 않을 수 있다. 8장과 13장의 graceful shutdown은 이 한 줄이 맞아야 시작된다.

## JVM 메모리는 힙만 보지 않는다

컨테이너 메모리 limit가 1Gi라고 해서 `-Xmx1g`를 주면 안 된다. JVM은 힙 외에도 metaspace, thread stack, code cache, direct buffer를 사용한다. 전체 limit의 대부분을 힙으로 잡으면 힙에는 여유가 있어도 cgroup 전체 사용량이 limit를 넘어 OOMKilled가 될 수 있다.

`-XX:MaxRAMPercentage=75`처럼 컨테이너 limit에 대한 비율을 사용하면 환경별 limit 변경에 대응하기 쉽다. 다만 75%는 출발점이지 모든 애플리케이션의 정답은 아니다. 스레드 수와 direct memory 사용량을 실제 지표로 측정해 조정해야 한다.

## 태그와 다이제스트

`latest`는 사람이 읽기 편한 별칭일 뿐 배포 이력이 아니다. 같은 태그가 다른 이미지를 가리킬 수 있어 현재 실행 코드와 롤백 대상을 확정할 수 없다.

| 식별자 | 의미 | 용도 |
|---|---|---|
| tag | 사람이 붙이는 가변 이름 | 버전 표기 |
| local image ID | 로컬 config 객체의 해시 | 로컬 이미지 구분 |
| repository digest | 레지스트리 매니페스트의 해시 | 재현·검증 |
| Pod `imageID` | 실제 실행 중인 이미지 digest | 배포 결과 확인 |

운영 태그에는 semantic version과 Git commit SHA를 함께 쓰는 방식이 추적에 유리하다. 더 강한 재현성이 필요하면 digest로 고정할 수 있지만, 베이스 이미지 보안 패치도 자동 반영되지 않으므로 정기 갱신 절차가 함께 있어야 한다.

```bash
kubectl get pod <pod> \
  -o jsonpath='{.status.containerStatuses[0].imageID}'
```

## 레지스트리 인증과 로컬 검증

개발자의 `docker login` 자격증명과 클러스터가 이미지를 pull하는 자격증명은 별개다. 클러스터에서는 kubelet이 Pod와 같은 namespace의 `imagePullSecrets`, 노드에 설정된 레지스트리 자격증명 또는 kubelet credential provider를 사용한다. 실패하면 Pod는 `ImagePullBackOff`가 된다.

클러스터에 올리기 전에는 CPU·메모리 제한을 흉내 내 로컬에서 실행하고 헬스 엔드포인트를 확인한다.

```bash
docker build --platform linux/amd64 -t shop-api:dev .
docker run --rm -p 8080:8080 --memory=1g --cpus=1 shop-api:dev
curl -s localhost:8080/actuator/health
```

Apple Silicon에서 기본 빌드한 arm64 이미지를 amd64 워커 노드에 올리면 실행 형식 오류가 날 수 있다. 대상 플랫폼과 multi-architecture manifest를 의식해야 한다.

강의 환경처럼 팀별 Harbor project를 사용하는 경우에도 흐름은 Docker Hub와 같다. 로컬 Docker 자격증명으로 push할 수 있어야 하고, 클러스터 kubelet이 pull할 자격증명은 `imagePullSecrets` 또는 노드의 credential provider 등으로 별도 제공해야 한다.

```bash
docker login <harbor-registry>
docker tag shop-api:dev <harbor-registry>/<project>/shop-api:1.2.3-a3f9c21
docker push <harbor-registry>/<project>/shop-api:1.2.3-a3f9c21
kubectl get secret -n demo
kubectl describe pod -n demo <pod> | rg 'Pulling|Pulled|Failed to pull|Image ID'
```

`docker login`이 성공해도 Pod의 pull 권한이 생기는 것은 아니다. 반대로 image pull은 성공했는데 애플리케이션이 시작하지 않으면 registry가 아니라 command, 환경변수, probe를 조사해야 한다. 실패 이벤트의 단계가 자격증명 문제와 애플리케이션 문제를 가르는 경계다.

## 이미지의 “실제 실행물”을 확인하는 명령

태그가 올바르다는 것과 Pod가 기대한 바이트를 실행한다는 것은 다르다. 빌드 직후 로컬 이미지의 레이어와 플랫폼을 확인하고, 레지스트리에 push한 뒤에는 Pod의 `imageID`와 digest를 대조한다.

```bash
docker buildx build --platform linux/amd64 \
  -t registry.example/shop-api:1.2.3-a3f9c21 --load .
docker image inspect registry.example/shop-api:1.2.3-a3f9c21
docker history --no-trunc registry.example/shop-api:1.2.3-a3f9c21
docker push registry.example/shop-api:1.2.3-a3f9c21

kubectl get pod -n demo -l app=shop-api \
  -o custom-columns='NAME:.metadata.name,IMAGE:.status.containerStatuses[0].image,IMAGE_ID:.status.containerStatuses[0].imageID'
kubectl describe pod -n demo -l app=shop-api | rg 'Image:|Image ID:|Reason:'
```

`imageID`가 digest로 표시되지 않거나 여러 Pod에서 서로 다르면 같은 tag를 재사용했거나 pull 정책이 의도와 다를 가능성이 있다. `latest`를 피하는 것만으로 충분하지 않다. 배포 기록에는 이미지 tag, commit SHA, registry digest를 함께 남겨야 롤백 시 “어떤 소스가 실행됐는가”를 재구성할 수 있다.

## 정리

- 이미지는 읽기 전용 설계도이고 컨테이너의 쓰기 층은 임시다.
- 의존성 정의를 소스보다 먼저 복사해야 레이어 캐시가 살아난다.
- 최종 이미지는 멀티스테이지·non-root·exec 형식 ENTRYPOINT를 기본으로 한다.
- JVM limit에는 힙 외 메모리 여유를 남긴다.
- 운영 이미지는 불변 태그와 digest로 코드·배포를 추적한다.

---

이전 글: [1장 — 선언형 운영과 핵심 리소스](/posts/skala-kubernetes-ch01-why-kubernetes/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [3장 — 쿠버네티스 아키텍처](/posts/skala-kubernetes-ch03-architecture/)
