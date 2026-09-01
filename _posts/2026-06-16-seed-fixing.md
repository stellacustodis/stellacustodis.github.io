---
title: "딥러닝 시드 고정 정리"
date: 2026-06-16 21:00:00 +0900
layout: post
permalink: /posts/seed-fixing-1/
categories:
  - AI
  - Engineering
tags: [deep-learning, reproducibility, pytorch, cuda, random-seed, cudnn]
---

<!-- 이미지 경로: /assets/img/posts/seed-fixing-1/<파일명> -->

아래의 내용은 연구실 노션에 정리해놨던 글을 복사해 온 것임.

글의 순서는 다음과 같음.

1. 시드 고정에 대한 Naive한 배경
2. 시드 고정에 대한 조금은 deep 한 배경
3. 코드 딸깍(이거만 보는 거는 비추천)
4. 내가 참고한 자료

---

## 1. 시드 고정에 대한 Naive한 배경

1. 딥러닝 학습에서 사용하는 난수는 대부분 seed로 제어하는 ‘의사 랜덤’임.
    1. 일부 CUDA 연산은 병렬 실행이나 atomic reduction의 순서가 고정되지 않아 seed와 별개의 비결정성이 생길 수 있음.
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

1. 데이터들이 tensor로 변환되어 gpu의 VRAM에 쌓였다고 가정.
2. gpu 연산은 global memory, cache, shared memory, register 등을 사용하고 CUDA core나 Tensor core에서 실행됨.
3. 비결정성은 일반적인 메모리 이동 자체가 아니라 난수를 사용하는 연산, backend algorithm 선택, 병렬 실행과 atomic reduction의 순서, 부동소수점 누적 순서 등에서 생김.
4. Nvidia에서는 딥러닝 전용 가속 라이브러리로 CuDNN을 제공하는데, benchmark 결과에 따라 algorithm을 선택할 수 있고 일부 algorithm은 병렬 연산 순서 때문에 비결정적일 수 있음.
    1. 참고로 CuDNN에는 CNN 전용 가속화 라이브러리들만 있었으나 9.x.x 이후부터는 transformer SDPA가속화가 적용되기 때문에 빠른 속도를 위해서라면 최신 버전을 쓰는 것이 좋습니다.
5. PyTorch 릴리스, 플랫폼, CPU와 GPU가 달라지면 완전히 같은 결과는 보장되지 않음. 단, 같은 환경에서는 하이레벨부터 순차적으로 비결정성의 원인을 제한해볼 수 있음.
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

`PYTHONHASHSEED`는 python interpreter가 시작될 때 정해지고 `CUBLAS_WORKSPACE_CONFIG`도 CUDA/cuBLAS 초기화 전에 설정해야 한다. 예를 들어 seed를 1234로 사용할 때는 다음처럼 실행하고 `opt.manualSeed`도 1234로 맞춘다.

```bash
PYTHONHASHSEED=1234 CUBLAS_WORKSPACE_CONFIG=:4096:8 python train.py
```

```python
# main()에서 RNG를 사용하는 객체를 만들기 전에 한 번 호출할 것.
# 같은 실행 중 반복 호출하면 RNG sequence가 처음으로 되감기므로 반복해서 호출하지 않을 것.
def set_seed(opt):

    if opt.manualSeed is None:
        opt.manualSeed = random.randint(1, 10000)
    print("Random Seed: ", opt.manualSeed)
    random.seed(opt.manualSeed) # 상
    torch.manual_seed(opt.manualSeed) # 상
    np.random.seed(opt.manualSeed) # 상
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(opt.manualSeed) # 상

    # Determinism settings (may impact performance)
    if getattr(opt, "deterministic", False):
        torch.backends.cudnn.deterministic = True # 상
        torch.backends.cudnn.benchmark = False # 상
        torch.backends.cuda.matmul.allow_tf32 = False # 중. 더 엄격한 수치 일관성을 위한 선택 사항
        torch.backends.cudnn.allow_tf32 = False # 중. 더 엄격한 수치 일관성을 위한 선택 사항
        try:
            torch.set_num_threads(1) # 하
        except RuntimeError:
            pass
        try:
            torch.set_num_interop_threads(1) # 하
        except RuntimeError:
            pass
        torch.use_deterministic_algorithms(True) # 상. 비결정적 연산은 오류로 알려야 함
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

    # DataLoader 전용 Generator는 RandomSampler의 순서와 worker의 base seed를 통제함.
    # worker_init_fn은 그 base seed에서 NumPy와 random의 worker별 seed를 설정함.
    # dataset 분할을 재현하려면 분할 연산에도 별도의 고정 Generator를 전달해야 함.
    train_generator = torch.Generator()
    train_generator.manual_seed(opt.manualSeed)
    test_generator = torch.Generator()
    test_generator.manual_seed(opt.manualSeed + 1)

    train_dataloader = torch.utils.data.DataLoader(
        train_dataset,
        batch_size=opt.bs,
        sampler=train_sampler,
        shuffle=train_sampler is None,
        num_workers=int(opt.workers),
        drop_last=True,
        worker_init_fn=seed_worker,
        generator=train_generator,
    )

    if test_dataset is not None:
        test_dataloader = torch.utils.data.DataLoader(
            test_dataset,
            batch_size=opt.bs,
            sampler=test_sampler,
            shuffle=False,
            num_workers=int(opt.workers),
            drop_last=False,
            worker_init_fn=seed_worker,
            generator=test_generator,
        )
    else:
        test_dataloader = None

    return train_dataloader, test_dataloader, train_sampler, test_sampler
```

분산 학습에서 `DistributedSampler`를 사용한다면 epoch마다 다음처럼 호출해야 같은 seed에서 재현 가능하면서도 매 epoch의 shuffle 순서가 달라진다.

```python
if train_sampler is not None:
    train_sampler.set_epoch(epoch)
```

---

## 4. 참고한 자료

- [Reproducibility — PyTorch 2.10 documentation](https://docs.pytorch.org/docs/stable/notes/randomness.html)
- [Generator — PyTorch 2.10 documentation](https://docs.pytorch.org/docs/stable/generated/torch.Generator.html)
- [Odds and Ends — NVIDIA cuDNN Backend](https://docs.nvidia.com/deeplearning/cudnn/backend/latest/developer/misc.html)
- [Reproducibility of CUDAExtension](https://discuss.pytorch.org/t/reproducibility-of-cudaextension/113011/9)
- [torch.use_deterministic_algorithms — PyTorch 2.10 documentation](https://docs.pytorch.org/docs/stable/generated/torch.use_deterministic_algorithms.html)
