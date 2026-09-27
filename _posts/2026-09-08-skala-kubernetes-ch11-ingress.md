---
title: "[SKALA] 쿠버네티스 11장 — Ingress와 외부 노출"
date: 2026-09-08 12:00:00 +0900
permalink: /posts/skala-kubernetes-ch11-ingress/
categories:
  - SKALA
  - Infra
tags: [skala, kubernetes, ingress, alb, https, routing]
description: "Ingress resource와 controller의 차이, host·path routing, ALB target과 HTTPS 종료, 외부 노출 장애의 진단 기준을 정리한다."
related: [skala-kubernetes-roadmap, skala-kubernetes-ch10-request-flow, skala-kubernetes-ch12-config-storage]
---

## Ingress가 해결하는 문제

Service마다 `type: LoadBalancer`를 만들면 service 수만큼 cloud load balancer와 비용·보안 설정이 늘어난다. HTTP(S) 요청은 하나의 L7 load balancer에서 host와 path로 나눌 수 있다.

```text
api.example.com/orders → order-service
api.example.com/users  → user-service
admin.example.com/     → admin-service
```

Ingress는 이 routing rule을 표현하는 Kubernetes resource다. 실제 packet을 받는 것은 Ingress Controller가 관리하는 nginx/Envoy Pod 또는 AWS ALB 같은 외부 data plane이다.

> Ingress는 규칙이고 Ingress Controller는 규칙을 읽어 실제 proxy 또는 cloud load balancer를 구성하는 실행 주체다.
{: .prompt-tip }

Controller가 설치되지 않았거나 `ingressClassName`이 맞지 않으면 Ingress YAML은 저장돼도 traffic 경로는 만들어지지 않는다.

## Controller 선택은 구현 종속성을 만든다

| Controller | Data plane | 특징 |
|---|---|---|
| AWS Load Balancer Controller | ALB/NLB | ACM·WAF·AWS IAM 연동 |
| ingress-nginx | cluster 내부 nginx Pod | 이식성과 기능이 좋지만 직접 운영 |
| Traefik | cluster 내부 Traefik | 비교적 간결한 dynamic config |
| Istio Gateway | Envoy | service mesh와 통합되지만 복잡도 증가 |

Ingress core fields는 표준이지만 annotation은 controller별 API다. controller를 바꾸면 annotation과 동작을 다시 검토해야 한다.

## host와 path routing

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
spec:
  ingressClassName: nginx
  rules:
    - host: api.shop.example.com
      http:
        paths:
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: order-api
                port: { number: 80 }
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port: { number: 80 }
```

정확한 경로와 더 긴 prefix가 더 구체적이다. `/` 같은 catch-all은 의도를 명확히 하고 마지막 fallback으로 둔다. host가 없는 rule은 의도하지 않은 domain까지 받을 수 있으므로 운영에서는 host를 명시한다.

## Controller별 설정은 분리해서 읽기

- scheme: internet-facing인지 internal인지
- target type: Pod IP인지 node instance인지
- health check path와 port
- 여러 Ingress가 ALB를 공유할 group
- listener port와 certificate ARN
- HTTP → HTTPS redirect

ALB group을 사용하면 여러 Ingress가 하나의 ALB를 공유할 수 있지만 서로의 rule priority와 host/path가 충돌하지 않도록 governance가 필요하다. 비용 절감과 blast radius 확대가 함께 생긴다. 다만 강의 실습 환경은 공용 `ingress-nginx` Load Balancer를 사용하므로 위 ALB 전용 annotation을 그대로 복사하지 않는다. 먼저 `IngressClass`가 실제로 어떤 controller를 가리키는지 확인하고, 그 controller의 annotation만 적용한다.

## HTTPS termination 이후의 header

TLS를 ALB에서 종료하면 ALB와 application 사이 traffic은 HTTP일 수 있다. application이 scheme을 직접 보면 `http`로 인식하므로 `X-Forwarded-Proto` 같은 forwarded header를 신뢰하도록 framework 설정이 필요하다. 그렇지 않으면 HTTPS login 뒤 HTTP URL로 redirect하는 loop가 생길 수 있다.

관리 endpoint를 일반 Service port로 노출하지 않고, controller의 health check만 별도 management port를 사용하도록 구성할 수도 있다. 어떤 경우든 health endpoint는 민감한 내부 정보를 반환하지 않게 제한한다.

## 증상별 진단

| 증상 | 먼저 확인할 것 |
|---|---|
| ADDRESS가 비어 있음 | controller 설치·class·IAM·subnet tag·Events |
| 502 Bad Gateway | target health, Pod response, port |
| 503 Service Unavailable | Service endpoint와 healthy target 수 |
| 504 Gateway Timeout | application latency와 LB timeout |
| 일부 path만 404 | host/pathType/rule priority |
| redirect loop | forwarded header 처리와 TLS termination |

Ingress object와 Service endpoint가 정상이어도 controller가 cloud resource를 만들 권한이 없으면 ADDRESS가 생기지 않는다. 반대로 ADDRESS가 있어도 target health check가 실패하면 사용자 요청은 정상 Pod에 도달하지 못한다.

## Ingress가 아닌 선택

HTTP(S) routing이면 Ingress가 적합하지만 모든 protocol에 같은 답은 아니다. TCP service는 LoadBalancer Service를, 개발 중 임시 확인은 port-forward를 사용할 수 있다. Gateway API는 더 명시적인 role 분리와 다양한 routing model을 제공하는 후속 표준이므로 심화 과정에서 비교할 가치가 있다.

## IngressClass·TLS·controller 상태 확인

Ingress object가 저장됐다는 사실과 실제 nginx/ALB rule이 반영됐다는 사실을 분리해 확인한다. 특히 여러 controller가 설치된 클러스터에서는 `ingressClassName`이 controller의 `spec.controller`와 연결되는지 먼저 본다.

```bash
kubectl get ingressclass
kubectl describe ingressclass nginx
kubectl get ingress shop -n demo -o yaml
kubectl describe ingress shop -n demo
kubectl get events -n demo \
  --field-selector=involvedObject.kind=Ingress --sort-by=.lastTimestamp

# TLS secret은 인증서·개인키 값을 출력하지 않고 metadata와 key 이름만 확인한다.
kubectl describe secret shop-tls -n demo
kubectl get ingress shop -n demo \
  -o jsonpath='{.status.loadBalancer.ingress[*].hostname}{"\n"}'
```

ALB를 사용할 때에는 `ADDRESS`가 생겼는지뿐 아니라 target health와 health check path가 일치하는지 확인한다. 인증서 만료일은 Secret의 base64 문자열만으로 판단하지 말고 인증서 관리 시스템이나 TLS endpoint를 기준으로 추적한다. Controller annotation은 일반 Kubernetes API가 검증해 주지 않는 경우가 많으므로, 적용 후 Events와 controller 로그에서 실제 cloud API 오류를 확인해야 한다.

## 정리

- Ingress resource와 Controller/data plane을 구분한다.
- host와 구체적인 path를 명시하고 catch-all 범위를 통제한다.
- controller-specific annotation은 이동 비용과 운영 책임을 만든다.
- TLS 종료 지점이 application 앞이라면 forwarded header를 처리한다.
- ADDRESS, target health, Service endpoint 순으로 상태를 연결해 본다.

---

이전 글: [10장 — 외부 요청의 호출 흐름 추적](/posts/skala-kubernetes-ch10-request-flow/)

시리즈 안내: [쿠버네티스 — 2일·13장 학습 로드맵](/posts/skala-kubernetes-roadmap/)

다음 글: [12장 — 설정과 스토리지](/posts/skala-kubernetes-ch12-config-storage/)
