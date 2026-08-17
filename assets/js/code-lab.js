const root = document.getElementById("code-lab");

if (root) {
  const $ = (selector) => root.querySelector(selector);
  const launcher = document.getElementById("code-lab-launcher");
  const dialog = $(".code-lab__dialog");
  const source = $("#code-lab-source");
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
  const prevStep = $("#code-lab-step-prev");
  const nextStep = $("#code-lab-step-next");
  const runButton = $("#code-lab-run");
  const traceButton = $("#code-lab-trace-run");
  const stopButton = $("#code-lab-stop");
  const resetButton = $("#code-lab-reset");
  const clearButton = $("#code-lab-clear-output");
  const status = $("#code-lab-status");
  const statusIcon = $("#code-lab-status-icon");
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

  const languageConfig = {
    python: {
      filename: "main.py",
      runtime: "Pyodide · 브라우저 로컬 · 표준 라이브러리",
      sample: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

numbers = [3, 5, 7]
for number in numbers:
    print(f"{number}! = {factorial(number)}")
`,
    },
    c: {
      filename: "main.c",
      runtime: "Judge0 · GCC 14 · 서버 격리 실행",
      judge0LanguageId: 103,
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
    },
    cpp: {
      filename: "main.cpp",
      runtime: "Judge0 · G++ 14 · 서버 격리 실행",
      judge0LanguageId: 105,
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
    },
    java: {
      filename: "Main.java",
      runtime: "Judge0 · OpenJDK 17 · 서버 격리 실행",
      judge0LanguageId: 91,
      judge0MemoryLimit: 256_000,
      judge0ThreadLimit: 64,
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
  let traceSourceText = "";
  let lastFocused = null;

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
    traceSourceText = "";
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
    clearOutput();
    setStatus("준비됨");
  }

  function openLab() {
    lastFocused = document.activeElement;
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
    source.readOnly = busy;
    stdin.readOnly = busy;
    for (const tab of tabs) tab.disabled = busy;
    stopButton.hidden = !busy;
    runtimeDot.classList.toggle("is-busy", busy);
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
    tracePanel.hidden = true;
    traceSteps = [];
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
      showOutput(`Python Worker 오류: ${event.message}`, true);
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
          )}?base64_encoded=true&fields=stdout,stderr,compile_output,message,status,time,memory`,
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
    traceSourceText = executedSource;
    tracePanel.hidden = false;
    tracePanel.dataset.truncated = String(truncated);
    renderTraceStep();
  }

  function renderTraceStep() {
    if (!traceSteps.length) return;
    const step = traceSteps[traceIndex];
    const lines = traceSourceText.split("\n");
    traceSource.replaceChildren();

    lines.forEach((text, index) => {
      const line = document.createElement("span");
      line.className = "code-lab__trace-line";
      line.dataset.line = String(index + 1);
      line.textContent = text || " ";
      if (index + 1 === step.line) line.classList.add("is-current");
      traceSource.append(line);
    });

    traceSource.querySelector(".is-current")?.scrollIntoView({ block: "center" });
    stepCount.textContent = `${traceIndex + 1} / ${traceSteps.length} · ${step.event}${step.note ? ` · ${step.note}` : ""}`;
    prevStep.disabled = traceIndex === 0;
    nextStep.disabled = traceIndex === traceSteps.length - 1;

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
        const key = document.createElement("span");
        const val = document.createElement("span");
        key.className = "code-lab__variable-name";
        val.className = "code-lab__variable-value";
        key.textContent = name;
        val.textContent = value;
        row.append(key, val);
        traceLocals.append(row);
      }
    }

    traceOutput.textContent = step.stdout || "(아직 출력 없음)";
  }

  launcher?.addEventListener("click", openLab);
  root.querySelectorAll("[data-code-lab-close]").forEach((button) => button.addEventListener("click", closeLab));
  runButton.addEventListener("click", () => execute("run"));
  traceButton.addEventListener("click", () => execute("trace"));
  stopButton.addEventListener("click", () => stopExecution(false));
  clearButton.addEventListener("click", clearOutput);

  resetButton.addEventListener("click", () => {
    if (!window.confirm(`${languageConfig[language].filename}을(를) 기본 예제로 되돌릴까요? 현재 편집 내용은 사라집니다.`)) return;
    source.value = languageConfig[language].sample;
    stdin.value = languageConfig[language].stdin || "";
    storageSet(codeKey(language), source.value);
    storageSet(stdinKey(language), stdin.value);
    updateLineNumbers();
    updatePosition();
    clearOutput();
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

  source.addEventListener("input", () => {
    storageSet(codeKey(language), source.value);
    updateLineNumbers();
    updatePosition();
  });
  source.addEventListener("scroll", () => {
    lineNumbers.scrollTop = source.scrollTop;
  });
  source.addEventListener("click", updatePosition);
  source.addEventListener("keyup", updatePosition);
  stdin.addEventListener("input", () => storageSet(stdinKey(language), stdin.value));

  prevStep.addEventListener("click", () => {
    if (traceIndex > 0) {
      traceIndex -= 1;
      renderTraceStep();
    }
  });
  nextStep.addEventListener("click", () => {
    if (traceIndex < traceSteps.length - 1) {
      traceIndex += 1;
      renderTraceStep();
    }
  });

  root.addEventListener("keydown", (event) => {
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

    if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden]), textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(
        (element) => !element.closest("[hidden]"),
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
}
