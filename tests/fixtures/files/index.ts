// Test fixtures: real-world style circuit files (as Qiskit exports them), loaded as raw text
// through Vite so the tests need no Node file APIs. Keyed by file name, e.g. 'bell.py'.
const modules = import.meta.glob<string>('./*.{qasm,py,txt}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const FIXTURE_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, text]) => [path.replace('./', ''), text]),
)
