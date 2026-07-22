---
title: "Python Mutable / Immutable"
date: 2026-05-02 21:00:00 +0900
layout: post
permalink: /posts/python-mutable-immutable/
categories:
  - Programming
  - Python
tags: [python, mutability, object-model, shallow-copy, deep-copy, 코딩테스트]
---

<!-- 이미지 경로: /assets/img/posts/python-mutable-immutable/<파일명> -->
<!-- 예시: ![fig1](/assets/img/posts/python-mutable-immutable/fig1.png) -->


알고리즘 공부를 하다보니 다음과 같은 코드를 만나게 되었다.

```python
import sys
sys.setrecursionlimit(10000)
input = sys.stdin.readline
n, m = map(int, input().split())
A = [[] for _ in range(n+1)]
visited = [False] * (n+1)

def DFS(v):
    visited[v] = True
    for i in A[v]:
        if not visited[i]:
            DFS(i)

for _ in range(m):
    s, e = map(int, input().split())
    A[s].append(e)
    A[e].append(s)

count = 0

for i in range(1, n+1):
    if not visited[i]:
        count +=1
        DFS(i)

print(count)
```
DFS를 처음 공부할 때 원리를 이해할 수 있는 예제 코드이다. 알고리즘을 처음 공부하는 입장에서 지나치게 AI agent의 자동완성 기능에 종속되는 것을 방지하고자 직접 손코딩을 하고 있다.

그러던 중 문득 왜 같은 역할을 하는 것 같은 이 두 줄이
```python
A = [[] for _ in range(n+1)]
visited = [False] * (n+1)
``` 
다르게 짜여져 있나 궁금해서 깊게 공부를 하게 되었다.


공식 문서를 토대로 정리를 하였다.[Python Official Docs](https://docs.python.org/3/reference/datamodel.html#objects-values-and-types)

python은 모든 'data'들은 '객체' 혹은 '객체들의 관계'로써 표현된다. python에서 모든 객체들은 `type`과 `value`, 즉 `identity`를 가지며 이는 객체가 갖는 메모리상의 주소와 같은 개념으로 생각해도 된다. 즉 두 객체의 값이 같을 때 `equality`, 완전히 동일한 메모리 주소를 가리킬때는 `identity`의 개념으로 생각하면 된다. `is` 명령어로 두 객체의 `identity`를 비교하거나 `id()` 명령어를 통해 주소값을 출력할 수 있다. 

객체의 `type`은 변할 수 없다. python에서는 type casting이 용이하다고 말하지만 엄밀히 말하면 `int()`, `float()`, `str()` 등은 새로운 객체를 생성하는 `constructor`함수들이다. 

일부 객체들에 한해서 `value`는 바뀔 수 있다. 
1. 가변객체(mutable)  
  생성된 후에도 그 __상태나 내용을 변경할 수 있는 객체__
  ex) `list`, `set`, `dict` 
2. 불변객체(immutable)
  한번 만들어지면 그 값을 __절대 바꿀 수 없는 객체__
  `int`, `floor`, `str`, `tuple`, `bool`

`value`가 바뀔 수 있다는 점은 수정이 가능하다는 것이고 바뀔수 없다는 것은 수정을 하려면 가리키는 객체가 다른 `value`를 가리켜야 한다는 것이다. 

예를 들어보자.
```python
a = False
b = a
```
이 경우 `False`의 `value`는 "False"이다.
그리고 `bool`이기 때문에 이 객체는 immutable, 즉 `value`를 변경할 수 없다. 즉, __`False`가 `True`가 될 수는 없다는 말이다.__
그렇기 때문에
```python
b = True
```
를 하여도, `False`의 `value`를 `True`로 바꾸는 것이 아니라, 
_True라는 새로운 객체를 하나 만들고, `b`가 가리키는 객체를 변경한다_


다시 처음의 코드로 돌아가보자.

```python
visited = [False] * (n+1)
```

이 경우 `(n+1)`개의 리스트 원소가 모두 `False` 객체를 가리키고 있다.
여기서 리스트 값을 변경하려고 한다면, 예를들어 다음과 같은 코드를 실행시킬 때

```python
visited[0] = True
```
이때 visited의 0번째 원소가 가리키던 `False`는 immutable이기 때문에 `value`는 변경되지 않는다. 대신 `True`라는 새로운 객체를 참조하도록 변경된다.


반면에 `list`는 mutable하기 때문에 
```python
A = [[]] * (n+1) # [[], [], []]
A[0].append(1)
```
와 같은 코드를 실행시키면 
`[]` 라는 객체 자체가 `[1]`로 변경된다.


조금 더 자세히 살펴보자.


python에서는 대부분의 추상자료형을 `list`로 구현하기 때문에 `list`에 대해서 잘 알고 있어야 한다.
`list`의 핵심은 __데이터(list 내용)를 수정해도 메모리 주소(Identity)가 유지된다__는 것이다. 

예를 들어보자.
```python
a = [1, 2, 3]
print(id(a)) # 2491712814336

a.append(4)
print(id(a)) # 2491712814336
```

`list`로 선언된 `a`의 주소가 `a`를 수정하여도 똑같이 출력되고 있다. 그렇다면 각각의 element들의 주소도 출력해보자.

```python
print(id(a[0])) # 140725374944168

print(id(a[1])) # 140725374944200

print(id[a[2]]) # 140725374944232

print(id[a[3]]) # 140725374944264
```

각 element들끼리의 주소차이는 32byte로써 `int`로 의 크기를 생각하면 합리적이다. 하지만 이상한 점은 `id(a)`와 `id(a[0])`의 출력 값이 지나치게 큰 차이를 보인다는 점이다.

우선 이 점은 모든 것을 `객체`로 취급하는 python의 특징 때문이다.
```python
a = [1,2,3]
```
 이 코드에는 두 층의 객체가 존재한다. 
  1. `a`는 mutable한 list 객체를 가리킨다. 이때 list 객체의 크기는 3이다.
  2. 각각의 index에 따라 `1`, `2`, `3`이라는 immutable 객체를 가리킨다.
따라서 `id(a)`는 `a`가 참조하는 list 객체의 주소를 의미하고, `id(a[0])`은 `1`이라는 객체의 주소를 의미한다.

즉,
```python
a = [1, 2, 3]
b = [1, 2, 3]

print(id(a[0])==id(b[0]))
```
이 출력 결과는 `True`이다.


조금만 더 깊게들어가 보자.
가령 이런 코드가 있다고 해보자.
```python
a = [1, 2]
before = id(a)
a.append(3)
after = id(a)
print(before == after) # True
```
앞선 설명에 따르면 `a` 에는 두개의 층의 객체가 존재한다. 마지막 `print`문의 출력이 `True`인 것으로 미루어보아 `append`연산은 `a`가 참조하고 있는 list 객체 자체가 변경된 것을 알 수 있다. 
이와 같은 변경을 `in-place mutation`, 우리말로 제자리 변경이라고 한다. 
예시로는 `append(1)`, `extend([1,2])`, `insert(0,1)`, `pop()`, `remove(1)`, `a[0] = 1`, `a.sort()`, `a.reverse()`이 있다.

__단, `list` 자체를 새로 할당하면 주소가 바뀐다.__
```python
a = [1, 2, 3]
before = id(a)
a = [1, 2, 3]
after = id(a)
print(before == after) # False
```

또 유사하게 결과가 같더라도 주소가 바뀌는 아래의 경우도 있다.
```python
a = [1, 2]
before = id(a)
a.append(3)
after = id(a)
print(before == after) # True


b = [1, 2]
before = id(b)
b = b + 3
after = id(b)
print(before == after) # False
```

엄밀히 말하면, python의 list는 동적 배열이기 때문에 python 내부에서 사용하는 원소 참조 배열은 다른 메모리 공간으로 이동할 수 있다. 하지만 이 경우에도 `id()`, 즉 객체의 identity는 유지된다. 따라서 '메모리 주소가 유지된다'는 로우레벨에서는 조금 애매한 표현이긴 한 것 같다. 


torch에서도 마찬가지로 'in-place' 연산이 존재한다. GPU에서는 메모리 접근이 병목이기 때문에 반복적으로 새로 할당되는 메모리 주소는 전체 모델의 학습 및 추론의 속도 저하를 일으키기도 한다. 다만, `Autograd`를 사용하기 때문에 안전을 위해서 명시적으로 재할당하는 것이 일반적이다.
