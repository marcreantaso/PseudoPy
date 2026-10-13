/* ============================================================
   SOP 2 — CPython runtime helpers (Node only)

   The comparison harness must judge PseudoPy and the baseline
   translator through the *same* interpreter. Both syntax checks
   and program executions therefore shell out to one CPython
   executable (PYTHON, falling back to python3), mirroring
   tests/compiler.test.js.

   These helpers are deliberately narrow: they return plain data
   and never throw for an expected failure (bad syntax, non-zero
   exit, timeout). A missing interpreter is reported as
   `ok: null` — "unverified" — rather than as a program error, so
   a broken environment cannot be mistaken for a failing
   translation.
   ============================================================ */
const { spawnSync } = require('child_process');

const SYNTAX_PROBE = 'import ast, sys; ast.parse(sys.stdin.read())';

function pythonCommand() {
  return process.env.PYTHON || 'python3';
}

function isMissingInterpreter(result) {
  return !!result.error && (result.error.code === 'ENOENT' || /ENOENT|not found/i.test(result.error.message || ''));
}

/**
 * Parse `python` without executing it.
 * @returns {{ ok: boolean|null, error: string|null }}
 */
function pythonSyntaxCheck(python, opts) {
  const timeout = (opts && opts.timeoutMs) || 5000;
  const result = spawnSync(pythonCommand(), ['-I', '-X', 'utf8', '-c', SYNTAX_PROBE], {
    input: String(python == null ? '' : python),
    encoding: 'utf8',
    timeout
  });
  if (isMissingInterpreter(result)) return { ok: null, error: null, unavailable: true };
  if (result.error) return { ok: null, error: result.error.message };
  if (result.status === 0) return { ok: true, error: null };
  const stderr = (result.stderr || '').trim();
  return { ok: false, error: stderr || ('python exited with status ' + result.status) };
}

/**
 * Execute `python` on the same interpreter and capture stdout/stderr/exit.
 * @returns {{ ok: boolean|null, error: string|null, stdout: string, stderr: string, timedOut: boolean }}
 */
function pythonRun(python, opts) {
  opts = opts || {};
  const timeout = opts.timeoutMs || 5000;
  const result = spawnSync(pythonCommand(), ['-I', '-X', 'utf8', '-c', String(python == null ? '' : python)], {
    input: opts.stdin || '',
    encoding: 'utf8',
    timeout
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (isMissingInterpreter(result)) {
    return { ok: null, error: null, stdout, stderr, timedOut: false, unavailable: true };
  }
  if (result.error) {
    const timedOut = result.error.code === 'ETIMEDOUT' || /timed?\s*out|ETIMEDOUT/i.test(result.error.message || '');
    return { ok: null, error: result.error.message, stdout, stderr, timedOut };
  }
  if (result.status === 0) return { ok: true, error: null, stdout, stderr, timedOut: false };
  return {
    ok: false,
    error: stderr.trim() || ('python exited with status ' + result.status),
    stdout,
    stderr,
    timedOut: false
  };
}

module.exports = { pythonCommand, pythonSyntaxCheck, pythonRun };
