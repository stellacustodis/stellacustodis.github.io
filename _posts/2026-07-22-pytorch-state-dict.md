---
title: "PyTorch state_dict 제대로 이해하기"
date: 2026-07-22 00:20:00 +0900
layout: post
permalink: /posts/pytorch-state-dict/
categories:
  - AI
  - Engineering
tags: [pytorch, state-dict, checkpoint, model-serialization, gpu-memory]
related: [seed-fixing-1, python-mutable-immutable]
---

PyTorch 모델을 저장하고 불러올 때 가장 자주 만나는 객체가 `state_dict`다. 단순히 “모델의 weight가 들어 있는 dictionary”라고만 이해하면 optimizer 복원이나 GPU 메모리 문제에서 혼란을 겪기 쉽다. 무엇이 들어 있고, 무엇이 들어 있지 않은지부터 정리해보자.

## Model state_dict

`model.state_dict()`는 이름과 tensor를 연결하는 `dict` 형태의 객체다. 크게 두 종류가 포함된다.

1. 학습 가능한 parameter
2. persistent로 등록된 buffer

```python
for name, tensor in model.state_dict().items():
    print(name, tensor.shape, tensor.device)
```

Parameter에는 `nn.Linear`나 `nn.Conv2d`의 `weight`, `bias`처럼 optimizer가 갱신하는 값이 들어간다. 직접 만든 값이라면 `nn.Parameter`로 등록되어 있어야 한다.

```python
class ScaleLayer(nn.Module):
    def __init__(self):
        super().__init__()
        self.scale = nn.Parameter(torch.ones(1))
```

Buffer는 학습 대상은 아니지만 모델 상태의 일부인 tensor다. BatchNorm의 `running_mean`, `running_var`, `num_batches_tracked`가 대표적인 예다. 직접 추가하려면 `register_buffer`를 사용한다.

```python
class PositionalEncoding(nn.Module):
    def __init__(self, encoding):
        super().__init__()
        self.register_buffer("encoding", encoding)
```

일반 tensor를 단순히 `self.tensor = tensor`로 할당하면 기본적으로 `state_dict`에 포함되지 않는다. 저장과 device 이동이 필요한 상태라면 parameter인지 buffer인지 명시해야 한다.

## parameters()와 무엇이 다른가

`model.parameters()`는 optimizer가 갱신할 학습 가능한 parameter만 순회한다. 반면 `model.state_dict()`에는 parameter와 persistent buffer가 모두 들어간다.

```python
parameter_names = {name for name, _ in model.named_parameters()}

for name in model.state_dict():
    kind = "parameter" if name in parameter_names else "buffer"
    print(name, kind)
```

하위 module의 상태도 재귀적으로 포함된다. 따라서 `self.backbone = nn.Sequential(...)`처럼 등록된 module이 있다면 `backbone.0.weight`와 같은 계층적인 key가 만들어진다.

## Optimizer state_dict

`optimizer.state_dict()`는 모델의 `state_dict`와 구조가 다르다. 주요 항목은 `state`와 `param_groups`다.

```python
checkpoint = {
    "model": model.state_dict(),
    "optimizer": optimizer.state_dict(),
    "epoch": epoch,
}
torch.save(checkpoint, "checkpoint.pt")
```

`state`에는 parameter별 optimizer 상태가 들어간다.

- SGD with momentum: `momentum_buffer`
- Adam/AdamW: `step`, `exp_avg`, `exp_avg_sq`
- RMSprop: `square_avg`, 필요하면 `momentum_buffer`

`param_groups`에는 learning rate, weight decay 같은 hyperparameter와 각 group에 속한 parameter 식별자가 들어간다. 따라서 학습을 정확히 이어가려면 model weight만이 아니라 optimizer 상태도 함께 저장해야 한다.

## 저장할 때 권장하는 방식

모델 객체 전체보다 `state_dict`를 저장하는 방식이 일반적으로 안전하다.

```python
torch.save(model.state_dict(), "model_weights.pt")
```

불러올 때는 먼저 같은 구조의 모델을 만들고 상태를 주입한다.

```python
model = MyModel()
state = torch.load("model_weights.pt", map_location="cpu", weights_only=True)
model.load_state_dict(state)
model.eval()
```

모델 객체 전체를 `torch.save(model, path)`로 저장하면 Python pickle이 class의 import 경로와 코드 구조에 의존한다. 코드를 이동하거나 class 이름을 변경했을 때 복원이 깨지기 쉽고, 신뢰할 수 없는 pickle 파일을 읽는 보안 문제도 고려해야 한다.

## GPU 메모리를 아끼며 불러오기

Checkpoint를 저장한 device 그대로 불러오면 예상치 못하게 GPU memory를 사용할 수 있다. 우선 CPU로 읽고, 필요한 시점에 모델을 GPU로 이동하면 동작을 통제하기 쉽다.

```python
state = torch.load(
    "model_weights.pt",
    map_location="cpu",
    weights_only=True,
)

model = MyModel()
model.load_state_dict(state)
del state

model.to("cuda")
model.eval()
```

`state_dict()`가 tensor의 깊은 복사본을 새로 만드는 것도 주의해야 한다. 반환된 dictionary의 값은 기본적으로 module parameter와 storage를 공유하는 얕은 참조다. 학습 중 “최고 성능 weight”를 메모리에 보관하려면 `copy.deepcopy(model.state_dict())`를 사용하거나 즉시 파일로 저장해야 한다.

```python
from copy import deepcopy

best_state = deepcopy(model.state_dict())
```

다만 `deepcopy`는 모델 크기만큼 CPU 또는 GPU 메모리를 추가로 점유할 수 있다. 큰 모델이라면 CPU로 복사하거나 checkpoint 파일로 바로 기록하는 편이 낫다.

## strict 옵션과 key 불일치

기본값인 `strict=True`는 저장된 key와 현재 모델의 key가 정확히 일치해야 한다.

```python
missing, unexpected = model.load_state_dict(state, strict=False)
print("missing:", missing)
print("unexpected:", unexpected)
```

`strict=False`는 head를 교체한 transfer learning 등에서 유용하지만, 실수로 중요한 weight를 로드하지 못한 경우도 숨길 수 있다. 반환되는 `missing_keys`와 `unexpected_keys`를 반드시 확인하는 것이 좋다.

`nn.DataParallel`로 저장한 checkpoint에는 key 앞에 `module.`이 붙는 경우가 있다. 가능하다면 저장 시점에 wrapper 안쪽 module의 상태를 저장한다.

```python
torch.save(model.module.state_dict(), "model_weights.pt")
```

## 학습 재개용 checkpoint

재현 가능한 학습 재개가 목적이라면 다음 정보를 함께 저장하는 것이 좋다.

```python
checkpoint = {
    "epoch": epoch,
    "model": model.state_dict(),
    "optimizer": optimizer.state_dict(),
    "scheduler": scheduler.state_dict(),
    "scaler": scaler.state_dict(),  # AMP를 사용할 때
    "best_metric": best_metric,
}
torch.save(checkpoint, "last.pt")
```

불러오는 순서는 보통 모델과 optimizer를 먼저 생성하고 각각의 상태를 복원하는 방식이다. Random seed와 data sampler 상태까지 완전히 이어야 한다면 checkpoint만으로 충분하지 않을 수 있으므로, 재현성 설정을 별도로 관리해야 한다.

## 정리

- Model `state_dict`: parameter와 persistent buffer
- Optimizer `state_dict`: parameter별 통계와 parameter group 설정
- 추론용 weight는 CPU로 먼저 불러오고 `model.eval()`을 호출
- 학습 재개에는 optimizer, scheduler, AMP scaler 등도 함께 저장
- `strict=False`를 사용할 때는 누락 및 예상 밖 key를 반드시 확인
- 메모리에 보관한 최적 weight가 계속 바뀌지 않도록 깊은 복사 여부를 점검

원본 메모에서는 `state_dict`가 무엇을 담는지에만 집중했지만, 실제로는 저장 형식보다 **어떤 상태를 어느 device에서 어떤 목적으로 복원하는가**가 더 중요하다.

참고: [PyTorch Serialization semantics](https://docs.pytorch.org/docs/stable/notes/serialization.html)
