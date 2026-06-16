---
title: "딥러닝 시드 고정 정리 (1)"
date: 2026-06-16 21:00:00 +0900
layout: post
permalink: /posts/seed-fixing-1/
categories:
  - ai/implementation
tags: [reproducibility, pytorch, cuda, seed]
---

<!-- 이미지 경로: /assets/img/posts/seed-fixing-1/<파일명> -->

글의 순서는 다음과 같음.

1. 시드 고정에 대한 Naive한 배경
2. 시드 고정에 대한 조금은 deep 한 배경
3. 코드 딸깍(이거만 보는 거는 비추천)
4. 내가 참고한 자료

---

## 1. 시드 고정에 대한 Naive한 배경

1. 컴퓨터는 기본적으로 완전한 ‘랜덤’을 구현하지 못하고 ‘의사 랜덤’을 통해 동작하는 것으로 잘 알려져 있음. 즉, 완전한 결정론적인 방식으로 동작함.
    1. CUDA는 예외적으로 완전 랜덤으로 동작하는 연산들이 있음.
        1. atomic operation에 대한 배경지식이 있어야함.
2. 문제는 이 ‘의사 랜덤’에 영향을 주는 요소들이 고정되어 있지 않음.
    1. 당연한 얘기지만 만약 모든게 고정되어 있다면 그때부터 그것은 ‘랜덤’이라고 부르기 어려울 것임.
3. 컴퓨터의 랜덤성을 제어한다는 것은 ‘의사 랜덤’에 영향을 주는 요소들을 제어한다는 소리임.
    1. ‘의사 랜덤’에 영향을 주는 요소는 ‘seed’라는 값을 입력으로 받기 때문에 ‘seed를 고정한다’는 것은 ‘랜덤성을 결정론적으로 제어하겠다’와 동일어임.
4. 딥러닝 학습시 시드고정이 적용해야 하는 분야는 크게 아래와 같음
    1. cpu
        1. numpy
        2. torch
            1. torch.dataloader
        3. random
        4. 기타 cpu에서 동작하는 모든 것들
            1. knn의 경우 cpu 연산으로 동작.
    2. gpu
        1. torch
            1. torch operations
        2. CUDA
        3. CuDNN
5. 단순 SW적으로 입력값을 ‘조정’하는 개념일 경우 모델의 학습/추론 속도에 영향을 끼치지 않으나 HW적으로 ‘잘’ 설계된 부분을 직접적으로 건드는 경우 학습/추론 속도에 영향을 끼침.
    1. 개인적인 생각으로는 모델의 성능을 평가할 때 ‘속도’ 한정 시드 고정을 하지 않은 상황에서 평가하는 것이 올바르지 않나..

---

## 2. 시드 고정에 대한 조금은 deep 한 배경

### cpu에서 일어나는 일

1. main 함수를 실행시키고 순차적으로 dataloader를 실행
    1. dataloader는 torch generator를 호출하고 순차적으로 메모리에서 data를 읽어들임
    2. 코드마다 조금씩 다르겠지만 필요시 데이터 전처리(증강 포함)가 일어남
    3. 만약 이때 torch 이외의 python package가 사용되는 것이 있다면 여기에서도 랜덤성이 좌우됨.
        1. 대표적으로 python 기본 package인 random, 행렬 처리에 특화된 numpy

### gpu에서 일어나는 일

1. 데이터들이 tensor로 변환되어 gpu의 VRAM에 모두 쌓였다고 가정.
2. gpu가 학습 연산을 한다는 것은 크게 세가지 단계인데
    1. VRAM의 ‘필요한 tensor’들이 GPU SM(Streaming Multiprocessor)의 L1 Cache로 이동
    2. L1 Cache에서 연산
    3. 연산된 결과물이 VRAM에 덮어쓰기됨.
3. 랜덤성은 이 모든 곳에 존재.
4. Nvidia에서는 딥러닝 전용 가속 라이브러리로 CuDNN을 제공하는데, 이 안에도 약간의 랜덤성을 통해 속도를 빠르게 하는 라이브러리들이 존재.
    1. 참고로 CuDNN에는 CNN 전용 가속화 라이브러리들만 있었으나 9.x.x 이후부터는 transformer SDPA가속화가 적용되기 때문에 빠른 속도를 위해서라면 최신 버전을 쓰는 것이 좋습니다.
5. 즉 ‘완전한 랜덤성 제어’를 위해서는 이 모든 것의 시드를 고정해야 하나 사실상 이것은 불가능에 가까움. 단, 경험상 모든 코드가 이런 엄밀한 제어를 필요로 하는 것은 아니기 때문에 하이레벨부터 순차적으로 적용해보는 것이 좋아 보임.
6. 다행히도 Nvidia에서 제공하는 대부분의 CUDA 파일들은 ‘잘’ 제어되는 것으로 보이나, 일부 필요한 기능들을 .cu, .cpp 코드로 직접 빌드하는 경우 해당 코드에 랜덤성 제어가 잘 이뤄지고 있는지 확인 해야 함.

### 결론

1. torch, numpy, random, 등의 모든 라이브러리에서 랜덤성 제어를 해야 한다.
2. train, test 및 기타 코드 모두에 적용해야 하고 적용 위치도 코드에서 중요하다. (다른 애들 선언/실행하기 이전에 먼저 해야 함)
3. CUDA, CuDNN에서도 랜덤성이 존재하기 때문에 이를 제어해야 한다.

---

## 3. 코드 딸깍

1. 상,중,하로 필요성을 적어놓았음.
    1. 하는 빼도 되지만 상은 꼭 넣을 것.
2. 본인의 gpu, cuda 환경에 따라서 에러가 날 수도 있고 필요 이상으로 속도 저하를 일으키며 시드 고정을 할 수도 있기 때문에 선별적으로 주석처리하며 사용하는 것을 추천.
3. 코드마다 디테일이 다를 수 있으니 해당 양식을 참고해서 코드를 수정할 것.(특히 dataset)
4. 만약 직접 빌드하는 .cu .cpp 코드가 있다면 해당코드에서 랜덤성 연산이 있는지 확인
    1. 본인의 경우 voxel관련 .cu파일의 `atomicAdd`로 인해 랜덤성 제어가 계속 안되고 있었음.

### `set_seed` 함수

```python
# main() 최상단에서 제일 먼저 호출할 것.
# seed 고정이 안되는 거 같으면 train 함수 혹은 해당 코드 상단에 한번 더 호출할 것.
def set_seed(opt):

    if opt.manualSeed is None:
        opt.manualSeed = random.randint(1, 10000)
    print("Random Seed: ", opt.manualSeed)
    os.environ.setdefault("PYTHONHASHSEED", str(opt.manualSeed))  # 중
    random.seed(opt.manualSeed) # 상
    torch.manual_seed(opt.manualSeed) # 상
    np.random.seed(opt.manualSeed) # 상
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(opt.manualSeed) # 상

    # Determinism settings (may impact performance)
    if getattr(opt, "deterministic", False):
        os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8") # 상. 안에 숫자를 바꿔도 되는데, 자세한건 gemini에게 물어보자.
        os.environ.setdefault("CUDNN_DETERMINISTIC", "1") # 중
        torch.backends.cudnn.deterministic = True # 상
        torch.backends.cudnn.benchmark = False # 상
        torch.backends.cuda.matmul.allow_tf32 = False # 중
        torch.backends.cudnn.allow_tf32 = False # 중
        try:
            torch.set_num_threads(1) # 하
        except RuntimeError:
            pass
        try:
            torch.set_num_interop_threads(1) # 하
        except RuntimeError:
            pass
        try:
            torch.use_deterministic_algorithms(True) # 상
        except Exception:
            pass
```

### `seed_worker`

```python
def seed_worker(worker_id):
    worker_seed = torch.initial_seed() % 2**32
    np.random.seed(worker_seed)
    random.seed(worker_seed)
```

### generator를 적용한 dataloader

```python
def get_dataloader(opt, train_dataset, test_dataset=None):

    if opt.distribution_type == 'multi':
        train_sampler = torch.utils.data.distributed.DistributedSampler(
            train_dataset,
            num_replicas=opt.world_size,
            rank=opt.rank
        )
        if test_dataset is not None:
            test_sampler = torch.utils.data.distributed.DistributedSampler(
                test_dataset,
                num_replicas=opt.world_size,
                rank=opt.rank
            )
        else:
            test_sampler = None
    else:
        train_sampler = None
        test_sampler = None

    # RNG를 위해서 Generator를 만들어 놓는게 안전함.
    # Generator가 없다면, 코드를 수정했을 때 dataset 분할이 다르게 이루어지고
    # num_workers를 수정하면서 더 많은 workers를 할당했을 때 worker마다 모든 데이터 증강이
    # 똑같아지는 문제(같은 시드를 넣었으니 당연)가 발생할 수 있음.
    # 따라서 전역 RNG는 seed로 먼저 통제하고 Generator로 세세한 부분까지 통제하는 것이 안전함.
    # 그래서 위의 seed_worker가 같이 필요함.
    g = torch.Generator()
    g.manual_seed(opt.manualSeed)

    train_dataloader = torch.utils.data.DataLoader(
        train_dataset,
        batch_size=opt.bs,
        sampler=train_sampler,
        shuffle=train_sampler is None,
        num_workers=int(opt.workers),
        drop_last=True,
        worker_init_fn=seed_worker,
        generator=g,
    )

    if test_dataset is not None:
        test_dataloader = torch.utils.data.DataLoader(
            train_dataset,
            batch_size=opt.bs,
            sampler=test_sampler,
            shuffle=False,
            num_workers=int(opt.workers),
            drop_last=False,
            worker_init_fn=seed_worker,
            generator=g,
        )
    else:
        test_dataloader = None

    return train_dataloader, test_dataloader, train_sampler, test_sampler
```

---

## 4. 참고한 자료

- [Reproducibility — PyTorch 2.10 documentation](https://docs.pytorch.org/docs/stable/notes/randomness.html)
- [Generator — PyTorch 2.10 documentation](https://docs.pytorch.org/docs/stable/generated/torch.Generator.html)
- [Odds and Ends — NVIDIA cuDNN Backend](https://docs.nvidia.com/deeplearning/cudnn/backend/latest/developer/misc.html)
- [Reproducibility of CUDAExtension](https://discuss.pytorch.org/t/reproducibility-of-cudaextension/113011/9)
- [torch.use_deterministic_algorithms — PyTorch 2.10 documentation](https://docs.pytorch.org/docs/stable/generated/torch.use_deterministic_algorithms.html)
