const PYODIDE_VERSION = "0.29.4";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodidePromise;

function notify(type, token, payload = {}) {
  self.postMessage({ type, token, ...payload });
}

async function getPyodide(id, token) {
  if (!pyodidePromise) {
    notify("progress", token, { id, phase: "runtime", message: "Python 런타임을 내려받는 중입니다…" });
    pyodidePromise = import(`${PYODIDE_BASE}pyodide.mjs`)
      .then(({ loadPyodide }) => loadPyodide({ indexURL: PYODIDE_BASE }))
      .then((pyodide) => {
        notify("runtime-ready", token, { id, runtime: `Pyodide ${PYODIDE_VERSION}` });
        return pyodide;
      });
  }

  return pyodidePromise;
}

const COMMON_SETUP = String.raw`
import contextlib as _contextlib
import io as _io
import json as _json
import sys as _sys
import traceback as _traceback

class _CodeLabWriter:
    encoding = "utf-8"
    errors = "replace"

    def __init__(self, limit=65536):
        self._buffer = _io.StringIO()
        self._limit = limit
        self._length = 0
        self._truncated = False

    def write(self, value):
        text = str(value)
        remaining = max(0, self._limit - self._length)
        if remaining:
            self._buffer.write(text[:remaining])
            self._length += min(len(text), remaining)
        if len(text) > remaining:
            self._truncated = True
        return len(text)

    def flush(self):
        return None

    def isatty(self):
        return False

    def getvalue(self):
        text = self._buffer.getvalue()
        if self._truncated:
            return text + "\n… 출력이 65,536자로 제한되었습니다."
        return text

_out = _CodeLabWriter()
_err = _CodeLabWriter()
_old_stdin = _sys.stdin
_env = {"__name__": "__main__", "__file__": "<code-lab>"}
_ok = True
`;

const RUNNER = `${COMMON_SETUP}
try:
    _sys.stdin = _io.StringIO(_code_lab_stdin)
    with _contextlib.redirect_stdout(_out), _contextlib.redirect_stderr(_err):
        exec(compile(_code_lab_source, "<code-lab>", "exec"), _env, _env)
except BaseException:
    _ok = False
    _traceback.print_exc(file=_err)
finally:
    _sys.stdin = _old_stdin

_json.dumps(
    {
        "ok": _ok,
        "stdout": _out.getvalue(),
        "stderr": _err.getvalue(),
    },
    ensure_ascii=False,
)
`;

const TRACE_RUNNER = `${COMMON_SETUP}
import itertools as _itertools
import reprlib as _reprlib
import types as _types

_steps = []
_step_limit = 300
_truncated = False

_repr = _reprlib.Repr()
_repr.maxstring = 120
_repr.maxother = 120
_repr.maxlist = 12
_repr.maxtuple = 12
_repr.maxdict = 12
_repr.maxset = 12

def _safe_repr(value):
    try:
        if isinstance(value, _types.ModuleType):
            return f"<module {value.__name__}>"
        return _repr.repr(value)
    except BaseException as exc:
        return f"<표현할 수 없음: {type(exc).__name__}>"

def _visible(mapping):
    result = {}
    for key, value in _itertools.islice(mapping.items(), 60):
        if str(key).startswith("__"):
            continue
        result[str(key)] = _safe_repr(value)
        if len(result) >= 24:
            result["…"] = "<변수가 더 있습니다>"
            break
    return result

def _stdout_snapshot():
    value = _out.getvalue()
    if len(value) <= 4096:
        return value
    return "… 앞부분 생략 …\\n" + value[-4096:]

def _stop_trace():
    global _truncated
    _truncated = True
    _sys.settrace(None)

def _snapshot(frame, event, arg):
    if _truncated or len(_steps) >= _step_limit:
        _stop_trace()
        return None

    stack = []
    cursor = frame
    while cursor is not None and len(stack) < 24:
        if cursor.f_code.co_filename == "<code-lab>":
            stack.append(
                {
                    "function": cursor.f_code.co_name,
                    "line": cursor.f_lineno,
                }
            )
        cursor = cursor.f_back
    stack.reverse()

    note = ""
    if event == "return":
        note = "return " + _safe_repr(arg)
    elif event == "exception" and isinstance(arg, tuple) and len(arg) >= 2:
        note = type(arg[1]).__name__ + ": " + _safe_repr(arg[1])

    _steps.append(
        {
            "event": event,
            "line": frame.f_lineno,
            "function": frame.f_code.co_name,
            "locals": _visible(frame.f_locals),
            "stack": stack,
            "stdout": _stdout_snapshot(),
            "note": note,
        }
    )

    if len(_steps) >= _step_limit:
        _stop_trace()
        return None
    return _trace

def _trace(frame, event, arg):
    if _truncated:
        return None
    if frame.f_code.co_filename != "<code-lab>":
        return None
    if event in ("call", "line", "return", "exception"):
        return _snapshot(frame, event, arg)
    return _trace

try:
    _sys.stdin = _io.StringIO(_code_lab_stdin)
    with _contextlib.redirect_stdout(_out), _contextlib.redirect_stderr(_err):
        _sys.settrace(_trace)
        exec(compile(_code_lab_source, "<code-lab>", "exec"), _env, _env)
except BaseException:
    _ok = False
    _traceback.print_exc(file=_err)
finally:
    _sys.settrace(None)
    _sys.stdin = _old_stdin

if len(_steps) < _step_limit:
    _last_line = _steps[-1]["line"] if _steps else 1
    _steps.append(
        {
            "event": "finished" if _ok else "error",
            "line": _last_line,
            "function": "<module>",
            "locals": _visible(_env),
            "stack": [],
            "stdout": _stdout_snapshot(),
            "note": "정상 종료" if _ok else "예외로 종료",
        }
    )

_json.dumps(
    {
        "ok": _ok,
        "stdout": _out.getvalue(),
        "stderr": _err.getvalue(),
        "steps": _steps,
        "truncated": _truncated,
    },
    ensure_ascii=False,
)
`;

self.addEventListener("message", async (event) => {
  const { type, id, token = "", source = "", stdin = "", mode = "run" } = event.data || {};
  if (type !== "run" || !token) return;

  let executionGlobals;
  try {
    const pyodide = await getPyodide(id, token);
    executionGlobals = pyodide.runPython("{}");
    executionGlobals.set("_code_lab_source", source);
    executionGlobals.set("_code_lab_stdin", stdin);

    notify("progress", token, {
      id,
      phase: mode === "trace" ? "trace" : "run",
      message: mode === "trace" ? "실행 흐름을 기록하는 중입니다…" : "Python 코드를 실행하는 중입니다…",
    });

    const raw = await pyodide.runPythonAsync(mode === "trace" ? TRACE_RUNNER : RUNNER, {
      globals: executionGlobals,
    });
    notify("result", token, { id, mode, result: JSON.parse(raw) });
  } catch (error) {
    notify("failure", token, {
      id,
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  } finally {
    executionGlobals?.destroy();
    try {
      const pyodide = await pyodidePromise;
      pyodide.runPython("import gc as _gc; _gc.collect(); del _gc");
    } catch {
      // The worker may be terminated while Pyodide is still loading.
    }
  }
});
