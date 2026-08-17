---
title: "CUDA version 여러 개 사용하기"
date: 2024-03-30 21:00:00 +0900
categories:
  - AI
  - Engineering
tags: [cuda, gpu, nvidia, linux, deep-learning-environment]
---
<!-- 이미지 경로: /assets/img/posts/cuda-version-여러-개-사용하기/<파일명> -->
<!-- 예시: ![fig1](/assets/img/posts/cuda-version-여러-개-사용하기/fig1.png) -->

_본 게시글은 과거 tistory에 올렸던 내용과 따로 정리하던 내용을 짜깁기한 게시글이다_





첫 블로그 글을 논문 리뷰로 올리기 위해 작성중인 글이 있었는데, 수식 정리를 latex로 정리하려고 하니 시간이 많이 걸린다. 그래서 첫 글은 내가 뉴비 of 뉴비일 때 제일 애를 먹었던 cuda version 관리로 하고자 한다.

**what is cuda?**

모두 알다시피 nvidia는 gpu를 만드는 회사이다. nvidia가 무서운 이유는 하드웨어만 설계하는 것이 아니라 딥러닝에 사용할 수 있는 소프트웨어도 추가로 제공을 해준다. 그게 cuda와 cudnn이라고 생각을 하면 된다.

깃허브에서 얻을 수 있는 딥러닝 오픈소스 프로젝트를 보면, 버전에 대해 언급을 할때 보통 ubuntu version, python version, torch version 이렇게 언급을 한다. 여기에 추가로 언급을 할때 cuda version을 언급한다. 특정 task에 대한 여러 모델을 돌려보다보면 python, torch, cuda version이 상이한 경우가 많다. 이때 python과 torch는 사용하는 가상환경에 그때그때 새로 설치를 해도 크게 번거롭지 않지만 cuda의 경우 좀 번거롭다. 이를 정리하고자 한다.

**install and use**
1. 기본적으로 리눅스 환경에 익숙하다는 가정으로 작성한다.
2. cuda 설치 방법은 nvidia driver와 마찬가지로 여러 방법이 있지만, nvidia 공홈에서 제공하는 방법을 따를 것을 절대적으로 권장한다.
3. 하단의 캡쳐는 cuda toolkit 11.8을 다운로드하는 nvidia 홈페이지이다. 사용하는 ubuntu 버전에 따라 설치하는 cuda의 버전이 제한된다. 일반적으로 ubuntu 20.04을 사용한다면 거의 대부분의 cuda toolkit을 무리없이 설치할 수 있다.

![fig1](/assets/img/posts/cuda-version-여러-개-사용하기/cuda_version_capture.png)

4. deb(local)과 deb(network)이 있지만 여러 버전의 cuda를 사용하고자 하기에 runfile을 통해 설치할 것이다.
5. 알려주는 명령어를 terminal창에 고대로 입력을 하면 된다. 이때, run file이기 때문에 실행 가능하게 변경을 먼저 해준다.
![fig2](/assets/img/posts/cuda-version-여러-개-사용하기/cuda_install_command.png)

```bash
sudo chmod 777 cuda_11.8.0_520.61.05_linux.run
```

6. 그리고 설치를 해주면 되는데, 이때 nvidia driver는 중복해서 설치하지 않는다.

7. cuda를 처음 설치하는 것이라면 아마도 ~/.bashrc에 다음과 같은 명령어를 추가로 입력을 해주어야 할 것이다.

```bash
export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/usr/local/cuda/lib64
export PATH=$PATH:/usr/local/cuda/bin
export CUDA_HOME=$CUDA_HOME:/usr/local/cuda
```

더 좋은 방법은 
```bash
# cuda ------
export PATH=/usr/local/cuda/bin${PATH:+:${PATH}}
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}
# cuda -------
```
을 ~/.bashrc에 입력하는 것이다.
이후 당연히 `source ~/.bashrc`를 통해 적용까지 해준다.

8. 설치가 완료되었다면, 별도로 경로설정을 따로 해두지 않는 한 /usr/local 위치에 cuda 버전이 저장되었을 것이다. cuda 11.8을 설치하였다면 /usr/local/cuda-11.8 이 존재한다. 이러한 방법으로 다양한 cuda 버전을 설치하면 된다.

9. 현재 컴퓨터에 적용된 cuda를 변경하기 위해서는 다음의 예시를 참고하면 된다. cuda는 저장된 다양한 버전을 소프트링크로 가져오기 때문에 이를 활용한다. 기존의 cuda로 걸려있는 소프트 링크는 제거해야한다.

```bash
sudo cd /usr/local
sudo rm cuda
sudo ln -s cuda-11.6 cuda
```

10. 매번 ~./bashrc를 변경해야한다고 인터넷에 나와있는 경우도 있는데, 소프트링크만 cuda로 재설정하는 경우라면 건들지 않아도 된다. 특히 서버에서 타인과 공유하는 환경을 쓰는 경우 **제발** 건들지 마라.

11. 기억을 복기하여 윈도우 환경에서 작성한 글이라 우분투 환경에서 다시 해보고 필요한 부분이 있다면 재수정하겠다.

12. 추가. 쉘 단위에서 cuda version을 따로 관리하고 싶을 때는 해당 쉘에서 직접 path를 수정해주면된다. 그리고 이 방식을 가장 권장한다.
```bash
export CUDA_HOME=/usr/local/cuda-11.3  
export PATH=$CUDA_HOME/bin:$PATH  
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH
```
