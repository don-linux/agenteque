import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { extractRunScript, readWorkflowYaml, runWorkflowStep } from '../helpers/workflow'

const yaml = `
name: fixture
on: push
jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - name: write payload
        run: |
          printf '%s' "$PAYLOAD" > dist/payload.txt
          test -s dist/seed.txt
`

it('runs a step script with a hostile env and a fake dist tree', async () => {
  expect(extractRunScript(yaml, 'write payload')).toContain('dist/payload.txt')
  expect(
    extractRunScript(readWorkflowYaml('build.yml'), 'Rename and verify artifacts', 'package'),
  ).toContain('dist/')

  const result = await runWorkflowStep({
    yaml,
    step: 'write payload',
    env: { PAYLOAD: 'hello' },
    distFiles: { 'seed.txt': 'seed' },
  })

  expect(result.exitCode).toBe(0)
  expect(readFileSync(resolve(result.dir, 'dist/payload.txt'), 'utf8')).toBe('hello')
  expect(readFileSync(resolve(result.dir, 'dist/seed.txt'), 'utf8')).toBe('seed')
  await result.cleanup()
})
