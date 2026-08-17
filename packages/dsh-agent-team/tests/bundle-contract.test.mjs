import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('package exposes one static DSH bundle with Host and Browser halves', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

  assert.equal(manifest.name, 'dsh-agent-team')
  assert.equal(manifest.version, '0.1.0-dev.3')
  assert.equal(manifest.main, './src/index.mjs')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.exports['./typert'], './lib/typert.host.js')
  assert.equal(manifest.exports['./agent-team-settings'], './src/agent-team-settings.mjs')
  assert.equal(manifest.exports['./mission-run'], './src/mission-run.mjs')
  assert.equal(manifest.dependencies['@deepseek-ai/schemastery'], '3.18.1')
  assert.equal(manifest.dependencies.zod, '4.4.3')
  assert.ok(manifest.files.includes('lib/typert.host.js'))
  assert.deepEqual(manifest.dsh, {
    bundle: { patch: './cordis.patch.yml' },
    client: {
      inject: [
        '@deepseek-ai/dsh-api-remotes',
        '@deepseek-ai/dsh-client-connection',
        '@deepseek-ai/dsh-client-runtime',
        '@deepseek-ai/dsh-client-ui-settings',
        '@deepseek-ai/dsh-client-ui-conversation',
      ],
      platform: 'web',
    },
  })
  assert.equal(patch, [
    '- insert:',
    '    - id: dsh-agent-team',
    '      name: dsh-agent-team',
    '',
  ].join('\n'))
})
