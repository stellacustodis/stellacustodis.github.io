---
title: "nvidia graphic card useful tools"
date: 2024-03-30 21:00:00 +0900
categories:
  - dev/tools
tags: [nvidia, gpu]
---

<!-- 이미지 경로: /assets/img/posts/nvidia-graphic-card-useful-tools/<파일명> -->
<!-- 예시: ![fig1](/assets/img/posts/nvidia-graphic-card-useful-tools/fig1.png) -->
_본 게시글은 과거 연구실 노션에 후배들을 위해 정리해놨던 내용을 가져온 게시글이다. nvidia-driver를 관리 및 제어하는 유용한 툴들을 중심으로 정리했다_


**nvidia-smi**
  1. 해당 명령어를 이용하여 gpu를 '관리'하는 것은 불편하지만 gpu 인식 및 nvidia driver설치, 호환 등을 확인하는 유일한 방법.
  2. 다음의 명령어를 통해 실시간으로 gpu status를 확인할 수 있음.
      
      ```bash
      watch -n 1 nvidia-smi # 1초마다 nvidia-smi를 실행하여 보여줌.
      
      nvidia-smi -l 1 # 1초마다 업데이트하여 보여줌
      
      watch nvidia-smi # 실시간 모니터링
      ```
      
  - 더 자세한 설명
      
      컴퓨터에 연결되어 있는 GPU를 확인하는 명령어는 `nvidia-smi`
      
      ![image.png](/assets/img/posts/nvidia-graphic-card-useful-tools/cap_nvidia_smi.png)
      
      | **NVIDIA-SMI** | 580.82.09 | 현재 시스템에 설치된 **NVIDIA SMI 툴의 버전** |
      | --- | --- | --- |
      | **Driver Version** | 580.82.09 | 현재 시스템에 설치된 **NVIDIA 그래픽 드라이버의 버전** |
      | **CUDA Version** | 13.0 | 드라이버와 호환되는 **CUDA 런타임의 최대 버전 → 현재 CUDA가 아님!** |
      
      | **항목** | **GPU 0 (NVIDIA GeForce RTX 3090 Ti)** | **GPU 1 (NVIDIA GeForce RTX 3090 Ti)** | **의미** |
      | --- | --- | --- | --- |
      | **GPU** | 0 | 1 | `nvidia-smi`에서 부여한 **GPU 인덱스 번호** |
      | **Name** | NVIDIA GeForce RTX 3090 Ti | NVIDIA GeForce RTX 3090 Ti | **GPU 모델명** |
      | **Fan** | 62% | 52% | 현재 **쿨링 팬의 작동 속도** (최대 속도 대비 퍼센트). |
      | **Temp** | 81C | 67C | GPU 코어의 **현재 온도**(**섭씨**). |
      | **Perf** | P2 | P2 | P0는 최고 성능, P12는 가장 낮은 전력 상태. **P2**는 고성능 계산 작업을 수행 중 |
      | **Persistence-M** | Off | Off | **영구 모드** (Persistence Mode) 상태. `On`: GPU가 유휴 상태일 때도 드라이버가 계속 로드되어 빠른 응답 가능 |
      | **Pwr:Usage/Cap** | **442W / 460W** | **413W / 450W** | **현재 사용 전력** (**442W**)과 **최대 전력 한계** (**460W**) |
      | **Bus-Id** | 00000000:01:00.0 | 00000000:02:00.0 | GPU의 **PCI Express 버스 ID**입니다. 시스템에서 장치를 식별하는 고유한 물리적 주소 |
      | **Disp.A** | On | Off | **디스플레이 (모니터) 출력 활성화 여부** |
      | **Memory-Usage** | 19365MiB / 24564MiB | 19278MiB / 24564MiB | 현재 사용 중인 GPU 메모리 / 전체 가용 메모리  |
      | **GPU-Util** | **100%** | **100%** | GPU 코어의 **활용률** |

**nvtop**
  1. nvidia gpu를 위한 htop
  2. 직관적으로 gui를 통해 확인할 수 있다.
  3. 추천하는 방식
  - 더 자세한 설명
      
      `snap` 혹은 `apt`로 설치가능
      
      ![image.png](/assets/img/posts/nvidia-graphic-card-useful-tools/cap_nvtop.png)
      
      1. Divice {i}
          1. 물리적으로 마더보드의 PCIe 슬롯에 연결되어있는 번호
          2. CUDA의 `cuda:0`과는 별개. cuda의 경우 성능 순으로 재배열
      2. 현재 3개의 gpu가 사용되고 있음을 알 수 있음. 첫번째 gpu의 경우 intel 내장 그래픽으로, 식별은 되지만 다른 정보는 업데이트 되지 않는 상태.
          1. 내장 그래픽이 있다면, Nvidia GPU의 성능을 모두 사용할 수 있도록 모니터는 내장그래픽에 사용하는 것이 좋음
          2. 그럼에도 불구하고 기본적으로 `xorg`에서 Nvidia GPU에 메모리를 할당하여 기본적으로 VRAM이 어느정도는 찰 수 있음.
              1. 최하단에 TYPE Graphic으로 할당되는 부분
          3. 해당 부분은 config을 수정하면 되는데 복잡하니 생략.
      3. `GPU 1995MHz` `MEM 10251MHz` 
          1. gpu에 연결되어 있는 프로세싱 유닛(CUDA/Tensor core를 구분하지 않음)의 클럭 수와 VRAM 클럭 수
              1. gpu의 세가지 core(CUDA core, Tensor core, Ray-Tracing core)에 대해서는 다른 글에서 다루도록 하겠음.
          2. 유휴상태일 땐 낮은 값을 갖고 있다가 본격 딥러닝 학습을 시작하면 확 올라감
          3. 만약 메모리도 모두 찼고 gpu 사용률도 거의 맥스인데, 해당 값이 낮을 경우 쓰로틀링이 걸린 상태
      4. Temp
          1. 현재 gpu 프로세싱 유닛의 온도
          2. 각 gpu마다 견딜 수 있는 온도의 상한선 존재
          3. 상한선에 인접할수록 쓰로틀링이 걸리면서 성능이 떨어지기 시작
          4. 상한선을 넘기지 않더라도 고온이 지속적으로 유지되면(딥러닝 작업으로 인해) gpu의 성능과 수명이 감소함.
      5. PCIe
          1. gpu에 연결되어 있는 PCIe 속도
          2. 연결되어 있는 슬롯보다 느린 속도를 띈다면, 확인해볼 필요성이 있음
          3. 일반적으로 연구실에 있는 마더보드들은 1번 슬롯의 경우 x16이 맞으나 만약 두개 이상의 gpu를 연결할 경우 사진과 같이 x8 x4 조합으로 떨어짐
      6. FAN
          1. 팬 속도 퍼센티지
          2. 온도가 올라갈수록 같이 올라가지만, 쓰로틀링을 막기 위해 강제로 최대화할 수 있음
      7. POW
          1. gpu의 최대 소비 전력과 현재 소비 전력을 확인 가능
      8. eff percentage
          1. 25년 1월 넷째주 기준으로 nvtop github에 새로 업데이트 된 `effective_load` 
          2. $\text{Effective Load} \approx \text{GPU Util (\%)} \times \frac{\text{Current Power}}{\text{Max Power (TDP)}}$
          3. 얼마나 전력을 소모하며 빡빡하게 일하고 있는지를 보여주는 지표
          4. Current Power는 FAN과도 연관이 있는 만큼 GPU Util과 함께 종합적으로 판단하여야함.
      9. 아래 그래프
          1. 각각 gpu 프로세싱 유닛과 vram 사용도의 퍼센티지

**pynvml  ← python package**
  1. NVIDIA Management Library (NVML) 인터페이스를 Python에서 사용할 수 있도록 하는 라이브러리
      1. nvidia-smi/nvtop 도 원천적으로 nvml로부터 데이터를 전달받음.
  2. gpu 상태 로그 출력에 활용 가능하나 본 페이지에서는 FAN 속도를 강제로 높이는 것에 사용

설치:

```bash
sudo apt install python3-pip
sudo pip3 install pynvml
sudo python3 gpu_fan_control_new.py
```

<details markdown="1">
<summary>gpu_fan_control_new.py 전체 코드</summary>

```python
# -*- coding: utf-8 -*-
import time
from pynvml import *

# --- Fan Curve Configuration ---
# Your desired temperature and fan speed mapping
FAN_SPEEDS = {
    40: 20,
    50: 30,
    60: 50,
    70: 70,
    80: 90,
    85: 100
}
# Sort the curve by temperature for easy look-up
SORTED_FAN_CURVE = sorted(FAN_SPEEDS.items())

def get_target_fan_speed(temp):
    """Calculates the target fan speed percentage based on the temperature."""
    # Find the fan speed corresponding to the current temperature
    for t, speed in SORTED_FAN_CURVE:
        if temp < t:
            return speed
    return 100 # Default to 100% if temp exceeds the highest threshold

def set_fan_speed_nvml(device_handle, speed_percentage):
    """Sets the fan speed for a specific GPU handle using pynvml."""
    
    try:
        num_fans = nvmlDeviceGetNumFans(device_handle)
    except NVMLError as e:
        # Some GPUs might fail to report num fans correctly via NVML
        print(f"Warning: Could not get fan count. Assuming 1 fan. Error: {e}")
        num_fans = 1
    
    for i in range(num_fans):
        # 1. Set fan control policy to manual
        # NVML might fail on some consumer cards (GeForce) or locked Workstation cards
        try:
            # 0 implies NVML_FAN_POLICY_MANUAL if constant is missing
            nvmlDeviceSetFanControlPolicy(device_handle, i, 0)
        except NVMLError as e:
            if e.value == NVML_ERROR_NOT_SUPPORTED:
                # Many cards do not support Policy setting via NVML, but allow Speed setting directly.
                # So we just print a debug message and continue to try setting speed.
                pass 
            else:
                # If it's a permission error or other issue, we might still want to try setting speed
                pass

        # 2. Set the target fan speed percentage
        try:
            nvmlDeviceSetFanSpeed_v2(device_handle, i, speed_percentage)
        except NVMLError as e:
            if e.value == NVML_ERROR_NOT_SUPPORTED:
                print(f"Warning: Setting Fan Speed is NOT supported by NVML on Fan {i}.")
            else:
                print(f"Error setting fan speed: {e}")

# --- Main Logic ---
try:
    nvmlInit() # Initialize NVML
    device_count = nvmlDeviceGetCount()
    
    # Get handles for all GPUs
    gpu_handles = [nvmlDeviceGetHandleByIndex(i) for i in range(device_count)]
    
    print(f"Found {device_count} NVIDIA GPUs. Starting fan control loop...")
    
    try:
        while True:
            # [수정됨] 모든 GPU를 순회하도록 range(device_count) 사용
            for gpu_id in range(device_count):
                handle = gpu_handles[gpu_id]
                
                try:
                    # Get Temperature
                    temp = nvmlDeviceGetTemperature(handle, NVML_TEMPERATURE_GPU)
                    
                    # Calculate Fan Speed
                    fan_speed = get_target_fan_speed(temp)
                    
                    # Set Fan Speed
                    set_fan_speed_nvml(handle, fan_speed)
                    
                    # Report (한 줄에 출력하여 로그 깔끔하게 유지)
                    print(f"[GPU {gpu_id}] {temp}°C -> Fan: {fan_speed}%", end=" | ")
                
                except NVMLError as e:
                    print(f"[GPU {gpu_id}] Error reading/writing: {e}", end=" | ")
            
            print("") # 줄바꿈
            time.sleep(5)  # Check every 5 seconds
    
    except KeyboardInterrupt:
        print("\nScript interrupted. Restoring fan control to automatic...")
        
    finally:
        # --- Cleanup: ALWAYS restore default fan control on exit ---
        print("Restoring default fan settings...")
        for gpu_id in range(device_count):
            handle = gpu_handles[gpu_id]
            try:
                num_fans = nvmlDeviceGetNumFans(handle)
                for i in range(num_fans):
                    try:
                        nvmlDeviceSetDefaultFanSpeed_v2(handle, i)
                    except NVMLError:
                        pass
            except NVMLError:
                pass
                    
        nvmlShutdown() # Shut down NVML
        print("NVML shut down successfully. Exiting.")

except NVMLError as e:
    print(f"Critical NVML Initialization Error: {e}")
```

</details>

**gpustat**

1. 좁은 칸으로 사용 가능

**nvitop**

1. 가장 화려함

**Gpu 사용 주의 사항**

1. nvidia-smi, nvtop에서 나오는 device num은 PCI Bus id 순서로 번호가 매겨짐. (위에 꽂힌 gpu 번호가 더 낮음)
2. `CUDA_VISIBLE_DEVICES` 는 별도의 세팅을 하지 않으면 성능 순으로 번호를 매김.
   - ex) dell서버의 4090은 nvidia-smi device id는 3번이지만 CUDA_VISIBLE_DEVICES는 0번임.
   1. `export CUDA_DEVICE_ORDER=PCI_BUS_ID`를 통해 번호를 일치시킬 수 있음.
   2. `export CUDA_VISIBLE_DEVICES=0`와 같은 명령어는 gpu인식을 '강제'시키는 역할을 함. → 따라서 torch는 해당 gpu만 gpu로 인식하기 때문에 멀티 gpu환경에서 `cuda:1`와 같이 gpu 번호를 직접 명시했다면 에러가 발생할 수 있음.
3. gpu의 온도가 지나치게 올라가면 쓰로틀링이 걸리면서 성능저하가 발생. 고온에 gpu가 지속적으로 노출될경우 수명이 단축되고 최고 성능이 하락할 가능성이 있음. 따라서 온도관리가 매우 중요함.

   | **모델명** | **아키텍처** | **기본/부스트 클럭 (Official)** | **실제 작동 클럭 (Real-world)** | **스로틀링 시작 (Soft Limit)** | **메모리 타입 (이슈 여부)** |
   | --- | --- | --- | --- | --- | --- |
   | **RTX 4090** | **Ada** | 2235 / **2520 MHz** | **2700~2850 MHz** | **84°C** (최대 88°C) | GDDR6X (**개선됨**) |
   | **RTX 3090 Ti** | Ampere | 1560 / 1860 MHz | 1950~2050 MHz | 84°C | GDDR6X (**매우 뜨거움**) |
   | **RTX 3090** | Ampere | 1395 / 1695 MHz | 1800~1950 MHz | 83°C | GDDR6X (**매우 뜨거움**) |
   | **RTX A5000** | Ampere | 1170 / 1695 MHz | 1700~1800 MHz | ~84°C | GDDR6 (ECC, 안정적) |
   | **RTX 6000 Ada** | Ada | 915 / **2505 MHz** | **2500~2600 MHz** | ~84°C | GDDR6 (ECC, 안정적) |

   1. gpu의 온도가 '안정적'일 때 임의로 클럭 수를 더 올리며 가속하는 경우도 있음.
   2. 같은 gpu모델일지라도 제조사마다 쿨링, 파워안정성이 다르기 때문에 부스트 클럭의 상한선이 nvidia 공시보다 더 높을 수 있음.
      1. 현재 필자의 3090ti 온도는 1900 후반 ~ 2000 초반의 클럭을 유지중.
   3. 당연한 얘기지만 클럭이 빠를 수록 학습 및 추론 속도가 더 빠르게 나옴.
   4. 멀티 gpu를 사용할 때는 gpu간 충분한 간격을 유지하거나 블로워 모델을 사용하는 것이 중요
4. torch에서 gpu 사용률을 최대한 올리는 방법은 다른 게시글에 작성예정
