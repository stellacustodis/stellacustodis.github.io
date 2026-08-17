---
title: "[SKALA] Java, SpringBoot, Rest API 구현 2일차 — 호출부를 지키는 추상화와 데이터 파이프라인"
date: 2026-08-11 21:00:00 +0900
permalink: /posts/skala-java-springboot-day2/
categories:
  - SKALA
  - Backend
tags: [skala, java, collection, generic, stream, lambda]
description: "상속과 인터페이스로 구현을 교체하는 방법부터 컬렉션·제네릭·람다·스트림을 이용한 데이터 처리, 리플렉션과 애노테이션의 런타임 동작까지 연결해서 정리한다."
---

## 구현을 바꾸면서 호출부를 지키는 법

1일차에는 JVM 위에서 Java 코드가 실행되는 과정과 기본 문법을 살펴보고, 클래스가 데이터와 행위를 묶는 방법을 캡슐화 관점에서 정리했다. 하나의 클래스를 올바르게 만드는 데서 출발했다면, 2일차에는 여러 클래스가 협력하면서도 구체적인 구현에 덜 얽히도록 설계하는 단계로 넘어간다.

핵심 질문은 “호출하는 코드를 고치지 않고 객체의 동작을 교체할 수 있는가?”이다. 상속과 오버라이딩은 상위 타입으로 서로 다른 구현을 다루게 하고, 인터페이스와 추상 클래스는 그 관계에 명시적인 규약을 부여한다. 컬렉션과 제네릭은 이렇게 만든 객체를 타입 안전하게 묶으며, 람다와 Stream API는 데이터 처리 과정을 선언적인 파이프라인으로 표현한다.

마지막의 리플렉션(reflection)과 애노테이션(annotation)은 관점을 한 단계 더 확장한다. 앞부분이 컴파일 시점의 타입과 규약을 이용했다면, 이 기능들은 런타임에 클래스의 구조와 메타데이터를 읽는 방법을 제공한다.

```text
클래스와 캡슐화
    ↓
상위 타입과 여러 구현체
    ↓
인터페이스·추상 클래스로 규약 정의
    ↓
Collection<T>로 객체 집합 관리
    ↓
람다와 Stream으로 처리 과정 조합
    ↓
리플렉션으로 구조 조회 + 애노테이션으로 의도 표시
```

## 상속보다 중요한 것은 다형성이다

상속(inheritance)은 부모 클래스의 속성과 메서드를 자식 클래스가 물려받는 문법이다. 중복되는 코드를 공유할 수 있지만, 상속의 더 중요한 효과는 자식 객체를 부모 타입으로 다룰 수 있다는 점이다.

```java
Animal animal = new Dog(); // 자식 인스턴스를 부모 타입으로 업캐스팅
animal.sound();            // Dog가 재정의한 sound() 실행
```

변수의 선언 타입은 `Animal`이지만 실제 객체는 `Dog`다. `sound()`를 호출했을 때 실행할 메서드는 실제 객체의 타입에 따라 결정된다. 이를 동적 바인딩에 의한 런타임 다형성이라고 한다.

호출부는 `Dog`라는 구체 클래스에 직접 의존하지 않는다. 같은 상위 타입을 따르는 다른 구현체가 추가되어도 호출 방식은 유지할 수 있다.

```java
Animal[] animals = {
    new Dog(),
    new Cat()
};

for (Animal animal : animals) {
    animal.sound(); // 각 객체가 재정의한 메서드 호출
}
```

이 구조에서 반복문은 동물의 종류를 확인하는 조건문을 필요로 하지 않는다. 객체마다 달라지는 행동을 각 구현체의 오버라이딩 메서드로 이동했기 때문이다. 다형성은 분기 자체를 없애는 문법이 아니라, 분기의 책임을 적절한 객체에 배치하는 설계 수단에 가깝다.

오버로딩(overloading)과 오버라이딩(overriding)은 이름이 비슷하지만 동작 시점이 다르다.

| 구분 | 오버로딩 | 오버라이딩 |
|---|---|---|
| 정의 방식 | 같은 이름, 다른 매개변수 시그니처 | 부모의 메서드를 자식이 재정의 |
| 결정 시점 | 컴파일 시점 | 런타임 |
| 주된 목적 | 하나의 연산에 여러 입력 형태 제공 | 상위 타입의 동작을 구현체별로 교체 |

오버라이딩할 때는 `@Override`를 명시하는 편이 안전하다. 부모 메서드와 시그니처가 어긋났는데 이 애노테이션이 없다면, 재정의하려던 메서드가 새로운 오버로딩 메서드로 취급될 수 있다. `@Override`를 붙이면 컴파일러가 실제 재정의 관계인지 확인하므로 의도와 구현의 불일치를 더 일찍 발견할 수 있다.

상속은 부모와 자식의 결합을 강하게 만든다는 점도 함께 봐야 한다. 단순히 코드를 재사용하려고 상속 관계를 만들기보다 명확한 `is-a` 관계인지 먼저 판단하고, 그렇지 않다면 인터페이스나 객체 구성을 고려하는 것이 적절하다.

## 인터페이스와 추상 클래스: 규약과 공통 구현의 경계

다형성을 사용하려면 여러 구현체가 공유할 상위 타입이 필요하다. Java에서는 인터페이스(interface)와 추상 클래스(abstract class)가 이 역할을 맡지만, 두 문법이 해결하는 문제는 조금 다르다.

인터페이스는 구현체가 지켜야 할 명세에 초점을 둔다. 호출하는 코드는 구체 클래스 대신 인터페이스에 의존하고, 실제 구현체는 그 규약을 `implements`한다.

```java
public interface Stock {
    int calculatePrice();
}

public class CommonStock implements Stock {
    @Override
    public int calculatePrice() {
        return 10_000;
    }
}
```

호출부가 `Stock`만 알고 있다면 구현체가 바뀌어도 `calculatePrice()`라는 계약은 유지된다. 하나의 클래스가 여러 인터페이스를 구현할 수 있다는 점도 서로 다른 역할을 조합할 때 유용하다. 인터페이스의 필드는 `public static final`이며, 메서드는 기본적으로 `public abstract`다. 필요하다면 `default` 또는 `static` 메서드도 정의할 수 있다.

추상 클래스는 규약뿐 아니라 여러 자식 클래스가 공유할 필드와 공통 구현이 필요할 때 사용한다.

```java
public abstract class Calculator {
    protected int result;

    public int getResult() {
        return result;
    }

    public abstract void calculate(int left, int right);
}
```

`getResult()`처럼 공통으로 사용할 동작은 구현해 두고, `calculate()`처럼 구현체마다 달라져야 하는 부분만 추상 메서드로 남길 수 있다. 다만 클래스 상속은 하나만 가능하므로 공통 상태와 구현을 정말 공유해야 하는지 판단해야 한다.

| 판단 기준 | 인터페이스 | 추상 클래스 |
|---|---|---|
| 중심 역할 | 구현체가 지킬 규약 정의 | 규약과 공통 구현 제공 |
| 연결 방식 | `implements` | `extends` |
| 다중 적용 | 여러 인터페이스 구현 가능 | 단일 클래스 상속 |
| 공유 요소 | 상수, 추상 메서드, `default`·`static` 메서드 | 인스턴스 필드, 구현 메서드, 추상 메서드 |
| 적합한 상황 | 구현을 자유롭게 교체해야 할 때 | 밀접한 하위 타입이 상태와 로직을 공유할 때 |

결국 중요한 것은 문법 선택보다 의존 방향이다. 호출부가 구체 구현을 직접 알고 있으면 구현체를 추가하거나 교체할 때 함께 수정될 가능성이 커진다. 반대로 상위 타입의 작은 규약에 의존하면 변경 범위를 구현체 내부로 제한할 수 있다.

## 컬렉션은 데이터의 사용 방식에 따라 고른다

배열은 크기가 고정되어 있다. 실행 중 객체가 추가되거나 삭제되는 데이터를 다루려면 크기를 직접 관리해야 하며, 검색이나 중복 제거 같은 기능도 별도로 작성해야 한다. Collection Framework는 이런 문제를 공통 인터페이스와 표준 구현체로 해결한다.

컬렉션 선택은 “무엇을 저장하는가?”보다 “데이터를 어떻게 사용할 것인가?”에서 시작하는 편이 명확하다.

| 필요한 동작 | 적합한 구조 | 주요 구현체 |
|---|---|---|
| 순서를 유지하고 중복도 허용 | `List` | `ArrayList`, `LinkedList` |
| 중복을 허용하지 않음 | `Set` | `HashSet`, `TreeSet`, `LinkedHashSet` |
| 고유 키로 값을 검색 | `Map` | `HashMap`, `TreeMap`, `LinkedHashMap` |
| 먼저 들어온 값을 먼저 처리 | `Queue` | FIFO 큐 구현 |
| 양쪽 끝에서 추가·삭제 | `Deque` | 양방향 큐 구현 |
| 나중에 들어온 값을 먼저 처리 | `Stack` | LIFO 구조 |

`ArrayList`는 인덱스를 이용한 조회에 적합하고, `LinkedList`는 중간 삽입과 삭제가 필요한 구조에 사용할 수 있다. `HashSet`과 `HashMap`은 해시테이블 기반 탐색을 제공한다. 정렬된 상태가 필요하면 `TreeSet`이나 `TreeMap`, 삽입 순서를 유지해야 한다면 `LinkedHashSet`이나 `LinkedHashMap`을 선택할 수 있다.

```java
List<String> names = new ArrayList<>();
names.add("Alice");
names.add("Bob");
names.add("Alice");

System.out.println(names.size()); // 3: List는 중복 허용

Map<Long, String> users = new HashMap<>();
users.put(1L, "Alice");
users.put(2L, "Bob");

System.out.println(users.get(2L)); // Bob
```

특히 `Set`의 원소나 `Map`의 키로 사용자 정의 객체를 사용할 때는 `equals()`와 `hashCode()`를 함께 재정의해야 한다. 논리적으로 같은 객체인지 판단하는 기준과 해시 위치를 계산하는 기준이 일치하지 않으면, 중복 제거와 키 조회가 예상과 다르게 동작할 수 있다.

> 컬렉션은 구현체부터 고르는 것이 아니라 순서, 중복, 검색 키, 처리 방향이라는 요구사항부터 고른다.
{: .prompt-tip }

구현부에서는 `ArrayList`나 `HashMap`을 생성하더라도 변수 타입은 가능한 한 `List`나 `Map` 같은 인터페이스로 선언할 수 있다. 이 방식은 앞에서 살펴본 다형성을 자료구조 선택에도 적용한 것이다.

## 제네릭으로 컬렉션의 타입을 컴파일 시점에 고정한다

컬렉션이 여러 객체를 담을 수 있다는 사실만으로는 충분하지 않다. 어떤 타입이 들어갈 수 있는지 제한하지 않으면 값을 꺼낼 때마다 형변환이 필요하고, 잘못된 타입이 섞인 문제를 런타임에서야 발견할 수 있다.

제네릭(generic)은 클래스나 메서드가 사용할 타입을 파라미터로 받는다.

```java
List<String> names = new ArrayList<>();

names.add("Alice");
// names.add(100); // 컴파일 시점에 거부

String first = names.get(0); // 별도 형변환 불필요
```

`<T>`, `<E>`, `<K, V>` 같은 타입 파라미터를 사용하면 하나의 자료구조나 알고리즘을 여러 타입에 재사용하면서도 타입 검사를 유지할 수 있다. 특정 범주의 타입만 허용해야 한다면 상한 제한도 지정할 수 있다.

```java
public class NumberBox<T extends Number> {
    private final T value;

    public NumberBox(T value) {
        this.value = value;
    }

    public T getValue() {
        return value;
    }
}
```

여기서 `T`는 `Number` 또는 그 하위 타입으로 제한된다. 모든 객체를 받는 범용 상자가 아니라 수치 타입을 다루는 상자라는 의도를 타입 선언에 포함한 셈이다.

와일드카드는 메서드가 제네릭 컬렉션을 어떤 방향으로 사용할지 표현한다.

```java
public double sum(List<? extends Number> source) {
    double total = 0;

    for (Number number : source) {
        total += number.doubleValue();
    }

    return total;
}

public void addDefault(List<? super Integer> target) {
    target.add(0);
}
```

- `<?>`는 구체 타입을 알 수 없는 컬렉션을 받는다.
- `<? extends Number>`는 `Number`와 그 하위 타입을 받아 주로 읽는 데 사용한다.
- `<? super Integer>`는 `Integer`와 그 상위 타입을 받아 `Integer` 값을 저장하는 데 사용한다.

`<? extends T>`로 받은 컬렉션에는 `null` 이외의 새로운 원소를 추가할 수 없다는 점이 자주 놓치는 부분이다. 실제 컬렉션이 `List<Integer>`인지 `List<Double>`인지 메서드 내부에서는 확정할 수 없기 때문이다. 상한 와일드카드는 조회 쪽, 하한 와일드카드는 저장 쪽이라는 기준으로 구분하면 타입 제약의 이유가 선명해진다.

Python을 기준점으로 Java를 학습하면서 자료형 선언이 없는 언어에서는 기계가 값을 어떻게 구분하며, 정적 타입 언어와 비교해 런타임에 무엇이 더 일어나야 하는지 질문했다. 제네릭은 Java가 타입 정보를 활용하는 시점을 보여주는 한 사례다. 컬렉션에 들어갈 타입과 허용할 연산의 범위를 선언하고, 잘못된 조합을 실행 전에 차단한다. 이 지점에서 타입은 단순한 문법 장식이 아니라 프로그램이 허용하는 상태를 제한하는 설계 도구가 된다.

## 람다: 동작을 전달하기 위한 간결한 표현

다형성은 객체의 구현을 교체할 수 있게 하지만, 하나의 작은 동작을 전달하려고 매번 익명 클래스를 작성하면 코드가 장황해진다. 람다(lambda)는 추상 메서드가 하나뿐인 함수형 인터페이스를 간결한 식으로 구현한다.

```java
@FunctionalInterface
interface Calculator {
    int calc(int left, int right);
}

Calculator add = (left, right) -> left + right;
Calculator multiply = (left, right) -> left * right;

System.out.println(add.calc(2, 3));      // 5
System.out.println(multiply.calc(2, 3)); // 6
```

호출부는 `Calculator`라는 같은 타입을 사용하지만, 변수에 전달된 람다에 따라 실제 동작이 달라진다. 앞에서 클래스 단위로 살펴본 다형성을 작은 동작 단위에도 적용한 형태로 볼 수 있다.

이미 존재하는 메서드를 그대로 전달할 때는 메서드 참조(method reference)를 사용할 수 있다.

```java
users.forEach(System.out::println);
```

람다가 외부 지역 변수를 참조하는 캡처링(capturing)에는 제약이 있다. 참조되는 지역 변수는 `final`이거나 값을 다시 대입하지 않은 실질적 불변 상태여야 한다.

```java
int offset = 10;

Calculator addWithOffset =
    (left, right) -> left + right + offset;

// offset = 20; // 다시 대입하면 람다에서 참조할 수 없음
```

람다 바깥의 지역 변수를 자유롭게 변경할 수 있다고 생각하면 컴파일 오류를 만나기 쉽다. 람다는 외부의 변경 가능한 지역 상태를 직접 조작하는 수단이라기보다, 입력을 받아 결과를 만드는 동작을 전달하는 데 적합하다.

## Stream API: 반복 절차를 데이터 흐름으로 바꾼다

컬렉션을 처리할 때 `for`와 `if`를 중첩하면 반복 방법, 조건, 변환, 결과 저장 로직이 한 블록에 섞인다. Stream API는 데이터 처리 단계를 중간 연산과 최종 연산으로 나누어 파이프라인으로 표현한다.

```java
List<String> names = users.stream()
    .filter(user -> user.getAge() >= 20)
    .map(User::getName)
    .collect(Collectors.toList());

// 결과 타입: List<String>
```

이 코드는 다음 순서로 읽을 수 있다.

```text
사용자 컬렉션
    → 성인 사용자만 선택(filter)
    → User를 이름으로 변환(map)
    → List<String>으로 수집(collect)
```

`filter`, `map`, `sorted`, `distinct`, `limit`는 스트림을 다른 스트림으로 연결하는 중간 연산이다. 이 연산들은 최종 연산이 호출될 때까지 실제 처리를 미루는 지연 평가(lazy evaluation) 방식으로 동작한다.

반면 `collect`, `forEach`, `reduce`, `count`, `anyMatch`는 파이프라인을 실행하고 결과를 만드는 최종 연산이다. 중간 연산만 연결해 놓으면 데이터 처리가 수행되지 않는다는 점이 첫 번째 함정이다.

```java
users.stream()
    .filter(user -> user.getAge() >= 20); // 최종 연산이 없어 실행 결과를 만들지 않음
```

두 번째 함정은 스트림이 재사용되지 않는다는 점이다. 하나의 스트림에 최종 연산을 수행한 뒤 같은 스트림으로 다른 최종 연산을 호출하려 해서는 안 된다. 다시 처리해야 한다면 원본 컬렉션에서 새로운 스트림을 생성해야 한다.

판매 가능한 상품의 가격 합계를 계산하는 실습도 같은 구조로 분해할 수 있다.

```text
상품 목록
    → usable이 true인 상품만 선택
    → 상품을 가격으로 변환
    → 가격을 하나의 합계로 축약
```

Stream API의 장점은 반복문을 무조건 짧게 만드는 데 있지 않다. 선택, 변환, 정렬, 집계라는 의도를 연산 단계로 드러내는 것이 핵심이다. 단순 반복문이 더 명확한 경우까지 억지로 스트림으로 바꾸기보다, 여러 데이터 변환이 연속될 때 파이프라인의 가독성을 활용해야 한다.

## 리플렉션: 런타임에 클래스의 구조를 읽는다

일반적인 Java 코드는 컴파일 시점에 사용할 타입과 메서드를 알고 있다. 반면 프레임워크는 사용자가 작성할 클래스의 구체적인 구조를 미리 알 수 없다. 리플렉션은 JVM에 로드된 클래스의 필드, 메서드, 생성자, 애노테이션 같은 메타데이터를 런타임에 조회하고 조작하는 방법을 제공한다.

```java
Class<?> clazz = Class.forName("com.example.User");

Constructor<?> constructor = clazz.getDeclaredConstructor();
Object user = constructor.newInstance();

Method method = clazz.getDeclaredMethod("setName", String.class);
method.invoke(user, "Alice");
```

문자열로 클래스 이름을 찾아 `Class<?>` 객체를 얻고, 생성자와 메서드를 조회한 뒤 동적으로 호출할 수 있다. 컴파일 시점에 `new User()`나 `user.setName()`을 직접 작성하지 않아도 객체를 생성하고 동작을 실행할 수 있는 셈이다.

이 유연성에는 비용이 따른다. 컴파일러의 타입 검사를 충분히 받을 수 없고, 이름이나 매개변수 시그니처가 맞지 않는 문제를 런타임에서 발견할 수 있다. `setAccessible(true)`를 사용하면 `private` 필드에도 접근할 수 있지만, 클래스가 의도한 캡슐화 경계를 우회하게 된다. 동적 탐색과 호출에는 성능 오버헤드도 있으므로 일반적인 비즈니스 로직보다 프레임워크처럼 구조를 해석해야 하는 영역에 제한적으로 사용하는 것이 적절하다.

## 애노테이션은 왜 함수가 아닌가

Python의 데코레이터와 Java의 애노테이션이 기능적으로 비슷해 보인다는 점에서 질문이 시작됐다. 둘 다 클래스나 메서드 위에 붙어 대상의 동작에 영향을 주는 것처럼 보인다. 하지만 Python 데코레이터는 호출 가능한 객체인 반면, Java 애노테이션은 함수가 아니다. 그렇다면 애노테이션이 붙은 코드는 언제, 어떤 기준으로 실행되는지, 애노테이션을 키로 조회하는 메타데이터로 봐야 하는지 질문했다.

이 질문에 답하려면 애노테이션과 그것을 처리하는 주체를 분리해야 한다.

> 애노테이션 자체가 동작을 실행하는 것이 아니다. 애노테이션은 코드에 의도를 표시하는 메타데이터이고, 컴파일러·빌드 도구·런타임 프레임워크가 이를 읽었을 때 비로소 동작이 발생한다.
{: .prompt-info }

애노테이션은 `@interface`로 정의하는 특수한 형태의 인터페이스다.

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface CustomLog {
    String value() default "INFO";
}
```

`@Target`은 이 애노테이션을 클래스, 필드, 메서드, 파라미터 중 어디에 붙일 수 있는지 제한한다. `@Retention`은 메타데이터가 유지되는 범위를 `SOURCE`, `CLASS`, `RUNTIME` 중에서 지정한다. 런타임 프레임워크가 애노테이션을 읽어야 한다면 `RetentionPolicy.RUNTIME`이 필요하다.

런타임에서는 리플렉션으로 애노테이션의 존재와 값을 확인한 뒤 로직을 분기할 수 있다.

```java
Class<?> clazz = Class.forName("com.example.UserService");
Method method = clazz.getDeclaredMethod("save");

if (method.isAnnotationPresent(CustomLog.class)) {
    CustomLog customLog = method.getAnnotation(CustomLog.class);
    System.out.println(customLog.value()); // 기본값이면 INFO
}
```

`@CustomLog`가 `save()`를 직접 호출하거나 로그를 출력하는 것은 아니다. 위 예시에서는 `isAnnotationPresent()`와 `getAnnotation()`을 호출한 코드가 메타데이터를 읽고 출력을 결정한다.

애노테이션을 dictionary와 비교하면 “이름으로 조회할 수 있는 부가 정보”라는 직관은 일부 맞는다. 다만 임의의 키와 값을 담는 일반적인 Map과 달리, 애노테이션은 `@interface`에 선언된 요소와 적용 대상, 유지 범위로 구조가 정해진 메타데이터다. 실행 시점 역시 애노테이션이 결정하지 않고 이를 읽는 처리기가 결정한다.

강의에서는 이 질문을 이후 애노테이션과 프록시를 설명하는 과정에서 다시 연장해 다뤘다. 2일차의 결론은 우선 명확하다. 애노테이션은 실행 코드가 아니라 선언이며, 리플렉션은 그 선언을 런타임에 발견하는 수단이다. 이후에는 발견한 메타데이터를 바탕으로 실제 메서드 호출 전후에 동작을 끼워 넣는 구조가 이어질 수 있다.

## 실습

제출 코드가 제공되지 않았으므로 수행 결과를 가정하지 않고, 2일차에 배정된 실습의 요구사항과 구현 방향 및 평가 기준까지만 정리한다.

### 상속·인터페이스·추상 클래스

기본 속성을 가진 부모 클래스를 정의하고 자식 클래스가 이를 확장한 뒤, 자식 인스턴스를 상위 타입 변수나 배열에 담는다. 공통 메서드는 자식 클래스에서 `@Override`로 재정의하고, 반복문에서는 구체 타입을 검사하지 않은 채 상위 타입의 메서드를 호출하도록 구성한다.

`Stock` 인터페이스에는 구현체가 지켜야 할 동작을 선언하고, 공통 상태와 로직이 필요한 부분은 추상 클래스에 둔다. 평가는 업캐스팅 이후 실제 객체의 오버라이딩 메서드가 호출되는지, 인터페이스의 규약과 메서드 시그니처를 구현체가 정확히 지키는지를 중심으로 이뤄진다.

### Collection의 CRUD와 자료구조 선택

`List`에는 객체를 추가한 뒤 조회와 정렬을 적용하고, `Map`에는 고유 키와 객체를 연결하여 검색·수정·삭제 기능을 구성한다. 같은 데이터를 무조건 한 자료구조에 담기보다 순서와 중복을 허용하는 목록에는 `List`, 고유 키 검색에는 `Map`을 사용하도록 역할을 나눈다.

커스텀 객체를 `Set`의 원소나 `Map`의 키로 확장한다면 `equals()`와 `hashCode()`를 함께 재정의해야 한다. 평가의 중심은 CRUD 메서드의 개수보다 요구사항에 맞는 인터페이스와 구현체를 선택했는지에 있다.

### Bounded Wildcard

제네릭 클래스를 정의하고 숫자 타입만 허용해야 하는 부분에는 `<T extends Number>`를 적용한다. 메서드 파라미터는 데이터를 읽는 쪽과 추가하는 쪽으로 나누어 `<? extends Number>`와 `<? super Integer>`를 각각 사용한다.

상한 와일드카드 컬렉션에 원소를 추가하려 할 때의 제약과 하한 와일드카드에 `Integer`를 추가할 수 있는지를 구분해서 확인하는 것이 핵심이다. 평가에서는 타입 파라미터와 와일드카드를 단순히 선언했는지가 아니라, 조회와 저장 방향에 맞게 경계를 설정했는지를 본다.

### Lambda와 Stream

추상 메서드가 하나인 `IAddable<T>`를 함수형 인터페이스로 정의하고, 문자열 결합·정수 덧셈·실수 곱셈을 각각 람다로 표현한다. 외부 지역 변수를 참조하는 람다도 작성하되, 해당 변수를 다시 대입했을 때 `effectively final` 제약에 걸리는 이유를 확인할 수 있도록 구성한다.

Stream 실습에서는 판매 가능한 상품의 가격 합계를 계산하던 `for` 루프를 `filter` → `map` → `reduce` 흐름으로 분리한다. 정수 목록 예제는 `map(n -> n * 2)` → `filter(n -> n > 5)` → `forEach()` 순서로 연결한다. 중간 연산만으로는 실행되지 않는다는 점과 최종 연산 후 스트림을 재사용할 수 없다는 점도 평가 대상이 된다.

### Reflection과 커스텀 Annotation

`Class<?>`를 이용해 클래스 정보를 조회하고, 생성자를 얻어 인스턴스를 동적으로 만든다. 이어서 클래스·필드·메서드·파라미터에 각각 적용할 수 있는 커스텀 애노테이션을 정의한다.

런타임에 읽어야 하는 애노테이션에는 `@Retention(RetentionPolicy.RUNTIME)`을 지정하고, `@Target`에는 실제 적용할 요소를 명시한다. 리플렉션으로 애노테이션의 존재와 값을 판독한 뒤 조건에 따라 로직을 분기하도록 구성한다. 평가는 애노테이션을 붙이는 문법보다 유지 범위와 적용 대상을 정확히 지정했는지, 그리고 메타데이터를 읽는 처리 코드가 별도로 존재하는지를 중심으로 한다.

## 정리

2일차의 흐름은 구체 클래스 하나를 만드는 단계에서 여러 구현을 교체하고 객체 집합을 처리하는 단계로 확장됐다. 상속과 인터페이스는 호출부와 구현부를 분리하고, 제네릭은 그 관계를 컴파일 시점의 타입으로 제한한다. 람다와 Stream API는 데이터 처리 동작을 조합 가능한 파이프라인으로 바꾸며, 리플렉션과 애노테이션은 런타임에 코드의 구조와 의도를 해석할 수 있게 한다.

이 기능들은 각각 떨어진 고급 문법이 아니다. “구현이 달라져도 계약은 유지한다”는 다형성에서 시작해 “구현을 직접 호출하지 않고도 구조와 메타데이터를 해석한다”는 메타프로그래밍까지 이어지는 하나의 추상화 과정이다. 다음 일차에는 이 언어 기능을 바탕으로 객체 생성과 설계 원칙을 다루고, 저수준 통신에서 REST API와 Spring Boot의 계층형 서버 구조로 범위를 넓힌다.

---

이전 글: [1일차 — JVM에서 캡슐화까지](/posts/skala-java-springboot-day1/)

시리즈 안내: [Java, SpringBoot, Rest API 구현 — 5일 학습 로드맵](/posts/skala-java-springboot-roadmap/)

다음 글: [3일차 — 설계 원칙에서 REST API 서버 골격까지](/posts/skala-java-springboot-day3/)
