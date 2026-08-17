import assert from 'node:assert/strict'
import test from 'node:test'
import {
  agent,
  createBrowserHarness,
  deferred,
  rosterResponse,
  standardRosterResponse,
  textOf,
} from './browser-harness.mjs'

test('Browser roster refresh ignores stale responses and recovers from invalid payloads', async () => {
  const harness = await createBrowserHarness()
  harness.initialRoster.resolve(standardRosterResponse())
  await harness.ctx.settle()

  harness.remoteResponses.push(rosterResponse('2026-08-17T12:01:00.000Z', [
    agent({ availability: 'missing', executablePath: null }),
  ]))
  await harness.ctx.emit('connection/reset')
  assert.match(textOf(harness.renderSettings()), /未安装/)

  const staleResponse = deferred()
  const currentResponse = deferred()
  harness.remoteResponses.push(staleResponse.promise, currentResponse.promise)
  const staleRefresh = harness.ctx.emit('connection/reset')
  const currentRefresh = harness.ctx.emit('connection/reset')
  currentResponse.resolve(rosterResponse('2026-08-17T12:03:00.000Z', [
    agent({ displayName: 'Codex Current', executablePath: '/tools/current-codex' }),
  ]))
  await currentRefresh
  staleResponse.resolve(rosterResponse('2026-08-17T12:02:00.000Z', [
    agent({ displayName: 'Codex Stale', executablePath: '/tools/stale-codex' }),
  ]))
  await staleRefresh
  const currentText = textOf(harness.renderSettings())
  assert.match(currentText, /Codex Current/)
  assert.match(currentText, /\/tools\/current-codex/)
  assert.doesNotMatch(currentText, /Codex Stale/)

  const staleFailure = deferred()
  const newestSuccess = deferred()
  harness.remoteResponses.push(staleFailure.promise, newestSuccess.promise)
  const failingRefresh = harness.ctx.emit('connection/reset')
  const successfulRefresh = harness.ctx.emit('connection/reset')
  newestSuccess.resolve(rosterResponse('2026-08-17T12:05:00.000Z', [
    agent({
      id: 'pi', displayName: 'Pi Current', avatar: '🧑‍🔧', command: 'pi',
      executablePath: '/tools/pi', supportLevel: 'experimental', positioning: ['research', 'execute'],
    }),
  ]))
  await successfulRefresh
  staleFailure.reject(new Error('stale connection failed'))
  await failingRefresh
  const staleFailureText = textOf(harness.renderSettings())
  assert.match(staleFailureText, /Pi Current/)
  assert.match(staleFailureText, /主机已同步/)
  assert.doesNotMatch(staleFailureText, /扫描失败/)

  harness.remoteResponses.push(rosterResponse(
    '2026-08-17T12:06:00.000Z', [], { unexpected: true },
  ))
  await harness.ctx.emit('connection/reset')
  assert.match(textOf(harness.renderSettings()), /扫描失败/)

  harness.remoteResponses.push(rosterResponse('2026-08-17T12:07:00.000Z', [
    agent({
      id: 'claude-code', displayName: 'Claude Code', avatar: '🧑‍💼', command: 'claude',
      executablePath: '/tools/claude', positioning: ['plan', 'review'],
    }),
  ]))
  await harness.ctx.emit('connection/reset')
  const recoveredText = textOf(harness.renderSettings())
  assert.match(recoveredText, /Claude Code/)
  assert.match(recoveredText, /主机已同步/)

  harness.remoteResponses.push(rosterResponse('2026-08-17T12:08:00.000Z', [
    agent({
      id: 'claude-code', displayName: 'Claude Code', avatar: '🧑‍💼', command: 'claude',
      executablePath: '/tools/claude', positioning: ['plan', 'review'], unexpected: true,
    }),
  ]))
  await harness.ctx.emit('connection/reset')
  assert.match(textOf(harness.renderSettings()), /扫描失败/)
  await harness.ctx.dispose()
})
