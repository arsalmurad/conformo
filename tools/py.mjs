// Runs a Python script with whichever interpreter this machine really has.
//
// npm scripts cannot say "python3" portably: on Windows that name is usually the
// Microsoft Store stub (it exits 9009 with "Python was not found"), and the real
// interpreter is the `py` launcher. On Linux and macOS there is no `py`.
// So we probe: a candidate only counts if `--version` exits 0 and prints
// "Python 3.x", which rejects the Store stub. Set PYTHON to force a choice.
//
// Usage: node tools/py.mjs <script.py> [args...]
import { spawnSync } from 'node:child_process';

const candidates = [process.env.PYTHON, 'py', 'python3', 'python'].filter(Boolean);

function works(cmd) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  return r.status === 0 && /Python 3\./.test(`${r.stdout}${r.stderr}`);
}

const py = candidates.find(works);
if (!py) {
  console.error(
    `No usable Python 3 found (tried: ${candidates.join(', ')}).\n` +
    `Install Python 3, or set PYTHON to the interpreter path.`);
  process.exit(127);
}

const r = spawnSync(py, process.argv.slice(2), { stdio: 'inherit' });
process.exit(r.status ?? 1);
