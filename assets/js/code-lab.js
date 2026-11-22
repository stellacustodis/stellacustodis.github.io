const root = document.getElementById("code-lab");

if (root) {
  const $ = (selector) => root.querySelector(selector);
  const launcher = document.getElementById("code-lab-launcher");
  const dialog = $(".code-lab__dialog");
  const source = $("#code-lab-source");
  const stdinToggle = $(".code-lab__stdin summary");
  const stdin = $("#code-lab-stdin");
  const lineNumbers = $("#code-lab-line-numbers");
  const position = $("#code-lab-position");
  const filename = $("#code-lab-filename");
  const output = $("#code-lab-output");
  const empty = $("#code-lab-empty");
  const tracePanel = $("#code-lab-trace");
  const traceSource = $("#code-lab-trace-source");
  const traceOutput = $("#code-lab-trace-output");
  const traceLocals = $("#code-lab-locals");
  const traceStack = $("#code-lab-stack");
  const stepCount = $("#code-lab-step-count");
  const firstStep = $("#code-lab-step-first");
  const prevStep = $("#code-lab-step-prev");
  const stepSlider = $("#code-lab-step-slider");
  const nextStep = $("#code-lab-step-next");
  const lastStep = $("#code-lab-step-last");
  const runButton = $("#code-lab-run");
  const traceButton = $("#code-lab-trace-run");
  const stopButton = $("#code-lab-stop");
  const resetButton = $("#code-lab-reset");
  const clearButton = $("#code-lab-clear-output");
  const copyButton = $("#code-lab-copy");
  const copyLabel = copyButton.querySelector("span");
  const preset = $("#code-lab-preset");
  const status = $("#code-lab-status");
  const statusIcon = $("#code-lab-status-icon");
  const dependencyNote = $("#code-lab-dependency-note");
  const runtimeDot = $("#code-lab-runtime-dot");
  const runtimeLabel = $("#code-lab-runtime-label");
  const tabs = [...root.querySelectorAll("[data-language]")];
  const baseUrl = (document.querySelector('meta[name="code-lab-baseurl"]')?.content || "").replace(/\/$/, "");
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const JUDGE0_ENDPOINT = "https://ce.judge0.com";
  const MAX_SOURCE_BYTES = 64 * 1024;
  const MAX_STDIN_BYTES = 16 * 1024;
  const MAX_OUTPUT_CHARS = 64 * 1024;
  const MAX_TRACE_LINES = 1_000;
  const PYTHON_IDLE_TIMEOUT = 45_000;
  const INDENT = "    ";
  const pythonExternalPackages = new Set([
    "altair", "diffusers", "dotenv", "duckdb", "fastapi", "joblib", "langchain", "matplotlib",
    "mlflow", "numpy", "pandas", "plotly", "polars", "pydantic", "pynvml", "schedule", "scipy",
    "seaborn", "sklearn", "torch", "torchaudio", "torchvision", "transformers",
  ]);

  const languageConfig = {
    python: {
      filename: "main.py",
      runtime: "Pyodide · 브라우저 로컬 · 표준 라이브러리",
      sampleLabel: "재귀 팩토리얼",
      sample: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

numbers = [3, 5, 7]
for number in numbers:
    print(f"{number}! = {factorial(number)}")
`,
      examples: [
        {
          label: "Scaled Dot-Product Attention",
          source: `from math import exp, sqrt

def attention(query, keys, values):
    scale = sqrt(len(query))
    scores = [sum(q * k for q, k in zip(query, key)) / scale for key in keys]
    peak = max(scores)
    weights = [exp(score - peak) for score in scores]
    total = sum(weights)
    return [sum(w * v for w, v in zip(weights, column)) / total
            for column in zip(*values)]

print(attention([1, 0], [[1, 0], [0, 1]], [[2, 4], [6, 8]]))
`,
        },
        {
          label: "이진 탐색",
          source: `def binary_search(values, target):
    low, high = 0, len(values)
    while low < high:
        mid = (low + high) // 2
        if values[mid] < target:
            low = mid + 1
        else:
            high = mid
    return low if low < len(values) and values[low] == target else -1

print(binary_search([1, 3, 5, 7, 9], 7))
`,
        },
        {
          label: "동적 계획법 · 계단 오르기",
          source: `def count_paths(steps):
    previous, current = 1, 1
    for _ in range(steps):
        previous, current = current, previous + current
    return previous

print(count_paths(5))
`,
        },
      ],
    },
    c: {
      filename: "main.c",
      runtime: "Judge0 · GCC 14 · 서버 격리 실행",
      judge0LanguageId: 103,
      sampleLabel: "정수 입력과 합계",
      sample: `#include <stdio.h>

int main(void) {
    int count;
    printf("How many numbers? ");

    if (scanf("%d", &count) != 1 || count <= 0) {
        fprintf(stderr, "Please enter a positive integer.\\n");
        return 1;
    }

    long long sum = 0;
    for (int i = 1; i <= count; ++i) {
        sum += i;
    }

    printf("1부터 %d까지의 합: %lld\\n", count, sum);
    return 0;
}
`,
      stdin: "10",
      examples: [
        {
          label: "유클리드 최대공약수",
          source: `#include <stdio.h>

int gcd(int a, int b) {
    while (b != 0) {
        int remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}

int main(void) {
    printf("%d\\n", gcd(48, 18));
    return 0;
}
`,
        },
        {
          label: "누적 합 · 구간 합",
          source: `#include <stdio.h>

int main(void) {
    int values[] = {3, 1, 4, 1, 5};
    int prefix[6] = {0};
    for (int i = 0; i < 5; ++i) {
        prefix[i + 1] = prefix[i] + values[i];
    }
    // Sum of indices 1, 2, and 3.
    printf("%d\\n", prefix[4] - prefix[1]);
    return 0;
}
`,
        },
      ],
    },
    cpp: {
      filename: "main.cpp",
      runtime: "Judge0 · G++ 14 · 서버 격리 실행",
      judge0LanguageId: 105,
      sampleLabel: "벡터 정렬과 합계",
      sample: `#include <algorithm>
#include <iostream>
#include <numeric>
#include <vector>

int main() {
    int size;
    std::cin >> size;

    std::vector<int> values(size);
    for (int& value : values) {
        std::cin >> value;
    }

    std::sort(values.begin(), values.end());
    const int sum = std::accumulate(values.begin(), values.end(), 0);

    std::cout << "sorted:";
    for (int value : values) {
        std::cout << ' ' << value;
    }
    std::cout << "\\nsum: " << sum << '\\n';
}
`,
      stdin: "5\n8 3 5 1 2",
      examples: [
        {
          label: "이진 탐색 · lower_bound",
          source: `#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    const std::vector<int> sorted{1, 3, 3, 5, 7};
    const auto first = std::lower_bound(sorted.begin(), sorted.end(), 3);
    std::cout << first - sorted.begin() << '\\n';
}
`,
        },
        {
          label: "너비 우선 탐색",
          source: `#include <iostream>
#include <queue>
#include <vector>

int main() {
    const std::vector<std::vector<int>> graph{{1, 2}, {0, 3}, {0}, {1}};
    std::vector<int> distance(graph.size(), -1);
    std::queue<int> pending;
    distance[0] = 0;
    pending.push(0);
    while (!pending.empty()) {
        int node = pending.front();
        pending.pop();
        for (int neighbor : graph[node]) {
            if (distance[neighbor] != -1) continue;
            distance[neighbor] = distance[node] + 1;
            pending.push(neighbor);
        }
    }
    std::cout << distance[3] << '\\n';
}
`,
        },
      ],
    },
    java: {
      filename: "Main.java",
      runtime: "Judge0 · OpenJDK 17 · 서버 격리 실행",
      judge0LanguageId: 91,
      judge0MemoryLimit: 256_000,
      judge0ThreadLimit: 64,
      sampleLabel: "리스트 정렬과 합계",
      sample: `import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        int size = scanner.nextInt();

        List<Integer> values = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            values.add(scanner.nextInt());
        }

        values.sort(Comparator.naturalOrder());
        int sum = values.stream().mapToInt(Integer::intValue).sum();

        System.out.println("sorted: " + values);
        System.out.println("sum: " + sum);
    }
}
`,
      stdin: "5\n8 3 5 1 2",
      examples: [
        {
          label: "Map으로 빈도 세기",
          source: `import java.util.Map;
import java.util.TreeMap;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> counts = new TreeMap<>();
        for (String token : "cat dog cat bird".split(" ")) {
            counts.merge(token, 1, Integer::sum);
        }
        System.out.println(counts);
    }
}
`,
        },
        {
          label: "동적 계획법 · 최소 동전 수",
          source: `import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int amount = 6;
        int[] coins = {1, 3, 4};
        int[] best = new int[amount + 1];
        Arrays.fill(best, amount + 1);
        best[0] = 0;
        for (int value = 1; value <= amount; value++) {
            for (int coin : coins) {
                if (coin <= value) {
                    best[value] = Math.min(best[value], best[value - coin] + 1);
                }
            }
        }
        System.out.println(best[amount]);
    }
}
`,
        },
      ],
    },
  };

  const runtimeReady = { python: false, c: false, cpp: false, java: false };
  let language = "python";
  let pythonWorker = null;
  let pythonIdleTimer = null;
  let remoteController = null;
  let activeRun = null;
  let runSequence = 0;
  let traceSteps = [];
  let traceIndex = 0;
  let traceLines = [];
  let traceJumpLines = [];
  let traceNavigationLine = null;
  let traceCurrentLine = null;
  let lastFocused = null;
  let copyTimer;

  function storageGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Private browsing or storage policies can disable sessionStorage.
    }
  }

  function codeKey(lang) {
    return `stellacustodis-code-lab:${lang}:source`;
  }

  function stdinKey(lang) {
    return `stellacustodis-code-lab:${lang}:stdin`;
  }

  function currentCode() {
    return source.value;
  }

  function byteLength(value) {
    return encoder.encode(value).byteLength;
  }

  function trimOutput(value) {
    const text = String(value || "");
    if (text.length <= MAX_OUTPUT_CHARS) return text;
    return `${text.slice(0, MAX_OUTPUT_CHARS)}\n\n… 출력이 ${MAX_OUTPUT_CHARS.toLocaleString("ko-KR")}자로 제한되었습니다.`;
  }

  function validateRunInput(mode) {
    if (!currentCode().trim()) return "실행할 코드를 입력해 주세요.";

    const sourceBytes = byteLength(currentCode());
    if (sourceBytes > MAX_SOURCE_BYTES) {
      return `소스 코드는 ${Math.floor(MAX_SOURCE_BYTES / 1024)} KB까지 실행할 수 있습니다. (현재 ${Math.ceil(sourceBytes / 1024)} KB)`;
    }

    const stdinBytes = byteLength(stdin.value);
    if (stdinBytes > MAX_STDIN_BYTES) {
      return `표준 입력은 ${Math.floor(MAX_STDIN_BYTES / 1024)} KB까지 사용할 수 있습니다. (현재 ${Math.ceil(stdinBytes / 1024)} KB)`;
    }

    if (mode === "trace" && currentCode().split("\n").length > MAX_TRACE_LINES) {
      return `단계별 실행은 ${MAX_TRACE_LINES.toLocaleString("ko-KR")}줄 이하의 코드에서 사용할 수 있습니다.`;
    }

    return "";
  }

  function updateLineNumbers() {
    const count = Math.max(1, source.value.split("\n").length);
    lineNumbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
    lineNumbers.scrollTop = source.scrollTop;
  }

  function updatePosition() {
    const before = source.value.slice(0, source.selectionStart);
    const lines = before.split("\n");
    position.textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1}`;
  }

  function findExternalPackage(code, lang) {
    if (lang === "java") {
      return /^[ \t]*import[ \t]+(?:static[ \t]+)?(org\.springframework|com\.fasterxml\.jackson|org\.junit|jakarta|lombok)\./m.exec(code)?.[1];
    }
    if (lang !== "python") return;

    const statements = code.replace(/\\\r?\n[ \t]*/g, " ").matchAll(
      /^[ \t]*(?:from[ \t]+([\w.]+)[ \t]+import\b|import[ \t]+([^#;\r\n]+))/gm,
    );
    for (const [, fromModule, imports] of statements) {
      const modules = fromModule ? [fromModule] : imports.split(",");
      for (const module of modules) {
        const name = module.trim().split(/[.\s]/, 1)[0];
        if (pythonExternalPackages.has(name) || name.startsWith("langchain_")) return name;
      }
    }
  }

  function updateDependencyNote() {
    const name = findExternalPackage(currentCode(), language);
    const message = name
      ? `외부 패키지(${name} 등)를 사용하는 코드는 브라우저나 기본 격리 런타임에서 바로 실행되지 않을 수 있습니다.`
      : "";
    if (dependencyNote.textContent !== message) dependencyNote.textContent = message;
  }

  function syncSource() {
    storageSet(codeKey(language), source.value);
    updateLineNumbers();
    updatePosition();
    updateDependencyNote();
    preset.selectedIndex = 0;
  }

  function lineStartAt(text, offset) {
    return offset ? text.lastIndexOf("\n", offset - 1) + 1 : 0;
  }

  function editSource(start, end, text, nextStart, nextEnd = nextStart) {
    if (source.value.length - (end - start) + text.length > source.maxLength) return;
    const direction = source.selectionDirection;
    source.setRangeText(text, start, end);
    source.setSelectionRange(nextStart, nextEnd, direction);
    syncSource();
  }

  function indentSource(outdent) {
    const { value, selectionStart: start, selectionEnd: end } = source;
    if (!outdent && start === end) {
      editSource(start, end, INDENT, start + INDENT.length);
      return;
    }

    const firstLine = lineStartAt(value, start);
    const nextBreak = value.indexOf("\n", Math.max(start, end - 1));
    const lastLine = nextBreak < 0 ? value.length : nextBreak;
    let lineStart = firstLine;
    let nextStart = start;
    let nextEnd = end;
    const replacement = value.slice(firstLine, lastLine).split("\n").map((line) => {
      const removed = outdent ? line.match(/^(?:\t| {1,4})/)?.[0].length ?? 0 : 0;
      const added = outdent ? "" : INDENT;
      const offset = (point) => point < lineStart ? 0 : added.length - Math.min(removed, point - lineStart);
      nextStart += offset(start);
      nextEnd += offset(end);
      lineStart += line.length + 1;
      return added + line.slice(removed);
    }).join("\n");
    editSource(firstLine, lastLine, replacement, nextStart, nextEnd);
  }

  function endsWithPythonColon(line) {
    let quote = "";
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (quote) {
        if (character === "\\") {
          index += 1;
        } else if (line.startsWith(quote, index)) {
          index += quote.length - 1;
          quote = "";
        }
      } else if (character === "#") {
        return line.slice(0, index).trimEnd().endsWith(":");
      } else if (character === '"' || character === "'") {
        const triple = character.repeat(3);
        quote = line.startsWith(triple, index) ? triple : character;
        index += quote.length - 1;
      }
    }
    return !quote && line.trimEnd().endsWith(":");
  }

  function insertNewline() {
    const { value, selectionStart: start, selectionEnd: end } = source;
    const before = value.slice(lineStartAt(value, start), start);
    const indent = before.match(/^[ \t]*/)[0];
    const extra = language === "python" && endsWithPythonColon(before) ? INDENT : "";
    const text = `\n${indent}${extra}`;
    editSource(start, end, text, start + text.length);
  }

  function languageExamples() {
    const config = languageConfig[language];
    return [{ label: config.sampleLabel, source: config.sample, stdin: config.stdin }, ...config.examples];
  }

  function applyExample(example) {
    source.value = example.source;
    stdin.value = example.stdin ?? "";
    syncSource();
    storageSet(stdinKey(language), stdin.value);
    clearOutput();
  }

  async function copyCode() {
    clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(currentCode());
      copyLabel.textContent = "복사 완료";
    } catch {
      copyLabel.textContent = "복사 실패";
    }
    clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => { copyLabel.textContent = "코드 복사"; }, 2000);
  }

  function setRuntimeDisplay() {
    runtimeLabel.textContent = languageConfig[language].runtime;
    runtimeDot.classList.toggle("is-ready", runtimeReady[language]);
    runtimeDot.classList.remove("is-busy");
  }

  function setStatus(message, kind = "ready") {
    status.textContent = message;
    statusIcon.classList.toggle("is-busy", kind === "busy");
    statusIcon.classList.toggle("is-error", kind === "error");
    statusIcon.innerHTML =
      kind === "busy"
        ? '<i class="fas fa-spinner fa-spin"></i>'
        : kind === "error"
          ? '<i class="fas fa-circle-exclamation"></i>'
          : '<i class="fas fa-circle-check"></i>';
  }

  function showOutput(text, isError = false) {
    empty.hidden = true;
    output.hidden = false;
    output.textContent = trimOutput(text) || "(출력 없음)";
    output.classList.toggle("is-error", isError);
    output.scrollTop = output.scrollHeight;
  }

  function clearOutput() {
    output.textContent = "";
    output.hidden = true;
    output.classList.remove("is-error");
    empty.hidden = false;
    tracePanel.hidden = true;
    traceSteps = [];
    traceIndex = 0;
    traceLines = [];
    traceJumpLines = [];
    traceNavigationLine = null;
    traceCurrentLine = null;
    traceSource.replaceChildren();
  }

  function loadLanguage(lang) {
    if (language === "python" && lang !== "python") destroyPythonWorker();
    language = lang;
    const config = languageConfig[lang];
    const savedCode = storageGet(codeKey(lang));
    const savedStdin = storageGet(stdinKey(lang));

    source.value = savedCode ?? config.sample;
    stdin.value = savedStdin ?? config.stdin ?? "";
    filename.textContent = config.filename;
    preset.replaceChildren(new Option("예제 불러오기", ""));
    for (const [index, example] of languageExamples().entries()) {
      preset.add(new Option(example.label, String(index)));
    }
    $("#code-lab-editor-panel").setAttribute("aria-labelledby", `code-lab-tab-${lang}`);

    for (const tab of tabs) {
      const selected = tab.dataset.language === lang;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }

    traceButton.hidden = lang !== "python";
    setRuntimeDisplay();
    updateLineNumbers();
    updatePosition();
    updateDependencyNote();
    clearOutput();
    setStatus("준비됨");
  }

  function openLab(trigger = document.activeElement) {
    if (root.hidden) lastFocused = trigger;
    root.hidden = false;
    document.body.classList.add("code-lab-is-open");
    launcher?.setAttribute("aria-expanded", "true");
    launcher?.closest(".code-lab-nav-item")?.classList.add("is-active");
    requestAnimationFrame(() => source.focus());
  }

  function closeLab() {
    if (activeRun) stopExecution(false);
    destroyPythonWorker();
    root.hidden = true;
    document.body.classList.remove("code-lab-is-open");
    launcher?.setAttribute("aria-expanded", "false");
    launcher?.closest(".code-lab-nav-item")?.classList.remove("is-active");
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  function setBusy(busy) {
    runButton.disabled = busy;
    traceButton.disabled = busy;
    resetButton.disabled = busy;
    clearButton.disabled = busy;
    preset.disabled = busy;
    source.readOnly = busy;
    stdin.readOnly = busy;
    for (const tab of tabs) tab.disabled = busy;
    stopButton.hidden = !busy;
    runtimeDot.classList.toggle("is-busy", busy);

    // A focused control that becomes disabled drops focus to <body>, which
    // takes Escape, Ctrl+Enter and the Tab trap (bound on root) with it.
    const active = document.activeElement;
    const focusLost = active === document.body || (root.contains(active) && (active.disabled || active.hidden));
    if (!root.hidden && focusLost) (busy ? stopButton : runButton).focus();
  }

  function resetTimer(milliseconds) {
    if (!activeRun) return;
    clearTimeout(activeRun.timer);
    activeRun.timer = window.setTimeout(() => {
      const lang = activeRun?.language;
      stopExecution(true);
      showOutput(
        lang === "python"
          ? "Python 실행 허용 시간을 초과해 Worker를 종료했습니다."
          : "실행 요청이 30초 안에 끝나지 않아 대기를 중지했습니다.",
        true,
      );
      setStatus("시간 제한으로 실행을 중지했습니다", "error");
    }, milliseconds);
  }

  function beginRun(mode) {
    if (activeRun) return null;
    const id = ++runSequence;
    const token =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${id}`;
    activeRun = {
      id,
      token,
      language,
      mode,
      source: currentCode(),
      stdin: stdin.value,
      timer: null,
      executionStarted: false,
    };
    setBusy(true);
    clearOutput();
    showOutput(mode === "trace" ? "실행 흐름을 준비하고 있습니다…" : "실행을 준비하고 있습니다…");
    setStatus("실행 준비 중…", "busy");
    return activeRun;
  }

  function finishRun(message = "실행 완료", kind = "ready") {
    if (activeRun) clearTimeout(activeRun.timer);
    activeRun = null;
    remoteController = null;
    setBusy(false);
    setStatus(message, kind);
    setRuntimeDisplay();
  }

  function formatResult(result) {
    const stdoutText = result.stdout || "";
    const stderrText = result.stderr || "";
    if (stdoutText && stderrText) return `${stdoutText}${stdoutText.endsWith("\n") ? "" : "\n"}\n[stderr]\n${stderrText}`;
    return stdoutText || stderrText || "(출력 없음)";
  }

  function ensurePythonWorker() {
    clearTimeout(pythonIdleTimer);
    pythonIdleTimer = null;
    if (pythonWorker) return pythonWorker;

    pythonWorker = new Worker(`${baseUrl}/assets/js/code-lab-python-worker.mjs`, { type: "module" });
    pythonWorker.addEventListener("message", handlePythonMessage);
    pythonWorker.addEventListener("error", (event) => {
      if (!activeRun || activeRun.language !== "python") return;
      showOutput(`Python Worker 오류: ${event.message || "실행기 스크립트를 불러오지 못했습니다."}`, true);
      finishRun("Python 실행기를 시작하지 못했습니다", "error");
      destroyPythonWorker();
    });
    return pythonWorker;
  }

  function destroyPythonWorker() {
    clearTimeout(pythonIdleTimer);
    pythonIdleTimer = null;
    if (!pythonWorker) return;
    pythonWorker.terminate();
    pythonWorker = null;
    runtimeReady.python = false;
    if (language === "python") setRuntimeDisplay();
  }

  function schedulePythonCleanup(immediate = false) {
    clearTimeout(pythonIdleTimer);
    pythonIdleTimer = window.setTimeout(destroyPythonWorker, immediate ? 0 : PYTHON_IDLE_TIMEOUT);
  }

  function handlePythonMessage(event) {
    const data = event.data || {};

    if (!activeRun || activeRun.language !== "python" || data.id !== activeRun.id || data.token !== activeRun.token) return;

    if (data.type === "runtime-ready") {
      runtimeReady.python = true;
      if (language === "python") setRuntimeDisplay();
      return;
    }

    if (data.type === "progress") {
      setStatus(data.message || "Python 실행 중…", "busy");
      showOutput(data.message || "Python 실행 중…");
      if (!activeRun.executionStarted && (data.phase === "run" || data.phase === "trace")) {
        activeRun.executionStarted = true;
        resetTimer(data.phase === "trace" ? 10_000 : 8_000);
      }
      return;
    }

    if (data.type === "failure") {
      showOutput(data.message || "Python 실행 중 알 수 없는 오류가 발생했습니다.", true);
      finishRun("Python 실행 실패", "error");
      destroyPythonWorker();
      return;
    }

    if (data.type === "result") {
      const run = activeRun;
      const result = data.result;
      showOutput(formatResult(result), !result.ok);
      if (data.mode === "trace" && Array.isArray(result.steps)) {
        showTrace(result.steps, Boolean(result.truncated), run.source);
      }
      const completeMessage =
        data.mode === "trace" && result.truncated ? "단계가 많아 처음 300개까지만 기록했습니다" : "실행 완료";
      finishRun(result.ok ? completeMessage : "예외가 발생했습니다", result.ok ? "ready" : "error");
      schedulePythonCleanup(data.mode === "trace");
    }
  }

  function runPython(mode, run) {
    resetTimer(60_000);
    ensurePythonWorker().postMessage({
      type: "run",
      id: run.id,
      token: run.token,
      source: run.source,
      stdin: run.stdin,
      mode,
    });
  }

  function toBase64(value) {
    const bytes = encoder.encode(value || "");
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  function fromBase64(value) {
    if (!value) return "";
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return decoder.decode(bytes);
  }

  function decodeJudge0Text(value) {
    if (!value) return "";
    try {
      return fromBase64(value);
    } catch {
      return String(value);
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      ...options,
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : { error: await response.text() };

    if (!response.ok) {
      const error = new Error(body?.error || body?.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function remoteErrorMessage(error) {
    if (error?.status === 429) return "실행 요청이 많습니다. 잠시 뒤 다시 시도해 주세요.";
    if (error?.status === 503) return "현재 실행 대기열이 가득 찼습니다. 잠시 뒤 다시 시도해 주세요.";
    if (error?.status === 401 || error?.status === 403) return "격리 실행 서버가 이 요청을 허용하지 않았습니다.";
    if (error instanceof TypeError) return "격리 실행 서버에 연결하지 못했습니다. 네트워크 연결을 확인해 주세요.";
    return error instanceof Error ? error.message : String(error);
  }

  function formatRemoteResult(result) {
    const sections = [];
    const compileOutput = decodeJudge0Text(result.compile_output);
    const stdoutText = decodeJudge0Text(result.stdout);
    const stderrText = decodeJudge0Text(result.stderr);
    const message = decodeJudge0Text(result.message);

    if (compileOutput) sections.push(`[compiler]\n${compileOutput}`);
    if (stdoutText) sections.push(stdoutText);
    if (stderrText) sections.push(`[stderr]\n${stderrText}`);
    if (message) sections.push(`[message]\n${message}`);
    if (!sections.length) sections.push("(출력 없음)");

    const details = [result.status?.description];
    if (result.time) details.push(`${result.time}s`);
    if (result.memory) details.push(`${Number(result.memory).toLocaleString("ko-KR")} KB`);
    return `${sections.join("\n\n")}\n\n[${details.filter(Boolean).join(" · ")}]`;
  }

  function waitForPoll(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timer = window.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, milliseconds);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function runRemote(run) {
    const controller = new AbortController();
    remoteController = controller;
    resetTimer(30_000);
    showOutput("코드를 격리 실행 서버로 전송하고 있습니다…");
    setStatus("격리 실행 서버에 요청 중…", "busy");

    try {
      const submission = await requestJson(`${JUDGE0_ENDPOINT}/submissions?base64_encoded=true&wait=false`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language_id: languageConfig[run.language].judge0LanguageId,
          source_code: toBase64(run.source),
          stdin: toBase64(run.stdin),
          cpu_time_limit: 3,
          wall_time_limit: 5,
          memory_limit: languageConfig[run.language].judge0MemoryLimit || 128_000,
          stack_limit: 64_000,
          max_processes_and_or_threads: languageConfig[run.language].judge0ThreadLimit || 16,
          max_file_size: 64,
          number_of_runs: 1,
          enable_network: false,
        }),
      });

      if (!submission.token) throw new Error("실행 서버가 제출 토큰을 반환하지 않았습니다.");

      while (activeRun?.id === run.id) {
        await waitForPoll(650, controller.signal);
        const result = await requestJson(
          `${JUDGE0_ENDPOINT}/submissions/${encodeURIComponent(
            submission.token,
          )}?base64_encoded=true&fields=stdout,stderr,compile_output,message,status,time,memory&_=${Date.now()}`,
          { signal: controller.signal },
        );

        if (result.status?.id === 1 || result.status?.id === 2) {
          const message = result.status.id === 1 ? "실행 대기열에서 기다리는 중…" : "컴파일하고 실행하는 중…";
          showOutput(message);
          setStatus(message, "busy");
          continue;
        }

        runtimeReady[run.language] = true;
        const ok = result.status?.id === 3;
        showOutput(formatRemoteResult(result), !ok);
        finishRun(ok ? "실행 완료" : result.status?.description || "실행 실패", ok ? "ready" : "error");
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError" || activeRun?.id !== run.id) return;
      showOutput(remoteErrorMessage(error), true);
      finishRun("격리 실행 서버 오류", "error");
    } finally {
      if (remoteController === controller) remoteController = null;
    }
  }

  function execute(mode = "run") {
    const validationError = validateRunInput(mode);
    if (validationError) {
      showOutput(validationError, true);
      setStatus("입력 크기를 확인해 주세요", "error");
      return;
    }

    const run = beginRun(mode);
    if (!run) return;

    if (language === "python") {
      runPython(mode, run);
    } else {
      runRemote(run);
    }
  }

  function stopExecution(timedOut = false) {
    if (!activeRun) return;
    const lang = activeRun.language;

    if (lang === "python") {
      destroyPythonWorker();
    } else {
      remoteController?.abort();
      remoteController = null;
    }

    finishRun(timedOut ? "시간 제한으로 중지됨" : "사용자가 실행을 중지했습니다", timedOut ? "error" : "ready");
  }

  function showTrace(steps, truncated, executedSource) {
    traceSteps = steps;
    traceIndex = 0;
    const executedLines = new Set(steps.map((step) => step.line));
    traceJumpLines = [];
    traceNavigationLine = null;
    traceCurrentLine = null;
    traceLines = executedSource.split("\n").map((text, index) => {
      const number = index + 1;
      const canJump = executedLines.has(number);
      const line = document.createElement(canJump ? "button" : "span");
      line.className = "code-lab__trace-line";
      line.dataset.line = String(number);
      line.textContent = text || " ";
      if (canJump) {
        line.type = "button";
        line.tabIndex = -1;
        line.setAttribute("aria-label", `${number}줄 ${text.trim()}`);
        traceJumpLines.push(line);
      }
      return line;
    });
    traceSource.replaceChildren(...traceLines);
    tracePanel.hidden = false;
    tracePanel.dataset.truncated = String(truncated);
    renderTraceStep();
  }

  function setTraceNavigationLine(line) {
    if (traceNavigationLine) traceNavigationLine.tabIndex = -1;
    traceNavigationLine = line;
    if (line) line.tabIndex = 0;
  }

  function goToTraceStep(index) {
    if (index < 0 || index >= traceSteps.length || index === traceIndex) return;
    traceIndex = index;
    renderTraceStep();
  }

  function renderTraceStep() {
    if (!traceSteps.length) return;
    const step = traceSteps[traceIndex];
    const previousLocals = traceSteps[traceIndex - 1]?.locals ?? {};
    traceCurrentLine?.classList.remove("is-current");
    traceCurrentLine?.removeAttribute("aria-current");
    traceCurrentLine = traceLines[step.line - 1];
    traceCurrentLine?.classList.add("is-current");
    traceCurrentLine?.setAttribute("aria-current", "step");
    traceCurrentLine?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (!traceSource.contains(document.activeElement)) {
      setTraceNavigationLine(traceCurrentLine ?? traceJumpLines[0]);
    }
    stepCount.textContent = `${traceIndex + 1} / ${traceSteps.length} · ${step.event}${step.note ? ` · ${step.note}` : ""}`;
    stepSlider.max = String(traceSteps.length);
    stepSlider.value = String(traceIndex + 1);
    stepSlider.setAttribute("aria-valuetext", `${traceSteps.length}단계 중 ${traceIndex + 1}단계`);
    const focusedControl = document.activeElement;
    firstStep.disabled = prevStep.disabled = traceIndex === 0;
    lastStep.disabled = nextStep.disabled = traceIndex === traceSteps.length - 1;
    if ([firstStep, prevStep, nextStep, lastStep].includes(focusedControl) && focusedControl.disabled) {
      stepSlider.focus();
    }

    traceStack.replaceChildren();
    if (step.stack?.length) {
      for (const frame of step.stack) {
        const item = document.createElement("span");
        item.className = "code-lab__stack-frame";
        item.textContent = `${frame.function} : ${frame.line}`;
        traceStack.append(item);
      }
    } else {
      traceStack.textContent = "호출 스택이 비어 있습니다.";
    }

    traceLocals.replaceChildren();
    const variables = Object.entries(step.locals || {});
    if (!variables.length) {
      traceLocals.textContent = "아직 생성된 지역 변수가 없습니다.";
    } else {
      for (const [name, value] of variables) {
        const row = document.createElement("div");
        row.className = "code-lab__variable";
        const changed = !Object.hasOwn(previousLocals, name) || previousLocals[name] !== value;
        row.classList.toggle("is-changed", changed);
        const key = document.createElement("span");
        const val = document.createElement("span");
        key.className = "code-lab__variable-name";
        val.className = "code-lab__variable-value";
        key.textContent = name;
        val.textContent = value;
        if (changed) {
          const change = document.createElement("span");
          change.className = "code-lab__sr-only";
          change.textContent = "변경된 값: ";
          val.prepend(change);
        }
        row.append(key, val);
        traceLocals.append(row);
      }
    }

    traceOutput.textContent = step.stdout || "(아직 출력 없음)";
  }

  function addCodeBlockActions() {
    const content = document.querySelector(".post-content, #main-wrapper article .content");
    if (!content) return;

    const languages = Object.keys(languageConfig);
    const selector = languages.map((lang) => `div.language-${lang}`).join(", ");
    for (const block of content.querySelectorAll(selector)) {
      const code = block.querySelector("td.rouge-code pre, pre code");
      if (!code) continue;
      const lang = languages.find((name) => block.classList.contains(`language-${name}`));
      const actions = document.createElement("div");
      actions.className = "code-lab__snippet-actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "code-lab__snippet-button";
      button.textContent = "Code Lab에서 열기";
      button.addEventListener("click", () => {
        if (activeRun) return;
        loadLanguage(lang);
        source.value = code.textContent;
        stdin.value = "";
        updateLineNumbers();
        updatePosition();
        updateDependencyNote();
        openLab(button);
      });
      actions.append(button);

      const header = block.querySelector(":scope > .code-header");
      if (header) {
        // Chirpy delegates clipboard clicks to direct button children of the header.
        header.insertBefore(actions, header.querySelector(":scope > button"));
      } else {
        block.prepend(actions);
      }
    }
  }

  launcher?.addEventListener("click", () => openLab(launcher));
  root.querySelectorAll("[data-code-lab-close]").forEach((button) => button.addEventListener("click", closeLab));
  runButton.addEventListener("click", () => execute("run"));
  traceButton.addEventListener("click", () => execute("trace"));
  stopButton.addEventListener("click", () => stopExecution(false));
  clearButton.addEventListener("click", clearOutput);
  copyButton.addEventListener("click", copyCode);
  preset.addEventListener("change", () => {
    const example = languageExamples()[preset.selectedIndex - 1];
    if (example) applyExample(example);
  });

  resetButton.addEventListener("click", () => {
    if (!window.confirm(`${languageConfig[language].filename}을(를) 기본 예제로 되돌릴까요? 현재 편집 내용은 사라집니다.`)) return;
    applyExample(languageExamples()[0]);
    source.focus();
  });

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      if (activeRun) return;
      loadLanguage(tab.dataset.language);
      source.focus();
    });

    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(tab);
      const target =
        event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs.at(-1)
            : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      loadLanguage(target.dataset.language);
      target.focus();
    });
  }

  source.addEventListener("input", syncSource);
  source.addEventListener("scroll", () => {
    lineNumbers.scrollTop = source.scrollTop;
  });
  source.addEventListener("click", updatePosition);
  source.addEventListener("keyup", updatePosition);
  stdin.addEventListener("input", () => storageSet(stdinKey(language), stdin.value));

  firstStep.addEventListener("click", () => goToTraceStep(0));
  prevStep.addEventListener("click", () => goToTraceStep(traceIndex - 1));
  stepSlider.addEventListener("input", () => goToTraceStep(stepSlider.valueAsNumber - 1));
  nextStep.addEventListener("click", () => goToTraceStep(traceIndex + 1));
  lastStep.addEventListener("click", () => goToTraceStep(traceSteps.length - 1));

  traceSource.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-line]");
    if (!target) return;
    const line = Number(target.dataset.line);
    const next = traceSteps.findIndex((step, index) => index > traceIndex && step.line === line);
    setTraceNavigationLine(target);
    target.focus({ preventScroll: true });
    goToTraceStep(next === -1 ? traceSteps.findIndex((step) => step.line === line) : next);
  });
  traceSource.addEventListener("keydown", (event) => {
    const current = traceJumpLines.indexOf(document.activeElement);
    if (current < 0) return;
    let next;
    switch (event.key) {
      case "ArrowUp": next = Math.max(0, current - 1); break;
      case "ArrowDown": next = Math.min(traceJumpLines.length - 1, current + 1); break;
      case "Home": next = 0; break;
      case "End": next = traceJumpLines.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const line = traceJumpLines[next];
    setTraceNavigationLine(line);
    line.focus();
  });

  root.addEventListener("keydown", (event) => {
    // 한글 조합 중의 Enter/Escape는 IME가 쓰는 키다.
    if (event.isComposing) return;

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      execute(event.shiftKey && language === "python" ? "trace" : "run");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeLab();
      return;
    }

    if (document.activeElement === source && event.ctrlKey && !event.altKey && !event.metaKey &&
        !event.shiftKey && event.key.toLowerCase() === "m") {
      event.preventDefault();
      stdinToggle.focus();
      return;
    }

    if (document.activeElement === source && !source.readOnly && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        if (event.key === "Tab") indentSource(event.shiftKey);
        else insertNewline();
        return;
      }
    }

    if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll("button, input, select, textarea, summary, [tabindex]")].filter(
        (element) => element.tabIndex >= 0 && !element.disabled && element.getClientRects().length,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener("pagehide", () => {
    remoteController?.abort();
    destroyPythonWorker();
  });

  loadLanguage("python");
  addCodeBlockActions();
}
