---
title: "Python Mutable / Immutable"
date: 2026-05-02 21:00:00 +0900
layout: post
permalink: /posts/python-mutable-immutable/
categories:
  - dev/python
tags: [python]
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
그리고 `bool`이기 때문에 이 객체는 immutable, 

`False`는 `bool`이기 때문에 불변객체에 속한다. 
이해를 돕기 위해 객체를 추가적으로 분류하겠다.
1. 


python에서는 대부분의 추상자료형을 `list`로 구현하기 때문에 `list`에 대해서 잘 알고 있어야 한다.
`list`의 핵심은 __데이터를 수정해도 메모리 주소(Identity)가 유지된다__는 것이다. 

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


