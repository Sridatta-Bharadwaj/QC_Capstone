// Cross-platform launcher for verify/verify.py (used by `npm run verify`).
// Uses the project venv's Python if it exists (verify/.venv), otherwise `python`
// from PATH, so the npm script works the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const venvPython =
  process.platform === 'win32'
    ? join(here, '.venv', 'Scripts', 'python.exe')
    : join(here, '.venv', 'bin', 'python')
const python = existsSync(venvPython) ? venvPython : 'python'

const result = spawnSync(python, [join(here, 'verify.py')], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
})
if (result.error) {
  console.error(`Could not start ${python}: ${result.error.message}`)
  process.exit(2)
}
process.exit(result.status ?? 1)
