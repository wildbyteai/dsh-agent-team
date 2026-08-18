import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

let mode
let keepAlive

function exitWithStdout(text, code = 0) {
  process.stdout.write(text, () => process.exit(code))
}

function holdOpen() {
  keepAlive ??= setInterval(() => {}, 1_000)
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.type === 'run') {
    mode = message.request.mode
    if (mode === 'success') {
      exitWithStdout('{"schemaVersion":1,"summary":"fake completed","artifacts":[]}\n')
    } else if (mode === 'invalid-json') {
      exitWithStdout('not-json secret-provider-output\n')
    } else if (mode === 'large-output') {
      exitWithStdout(`${'x'.repeat(8_192)}{"schemaVersion":1,"summary":"tail","artifacts":[]}\n`)
    } else if (mode === 'process-error') {
      process.stderr.write('secret-provider-diagnostic\n', () => process.exit(17))
    } else if (mode === 'wait-cancel') {
      holdOpen()
    } else if (mode === 'ignore-cancel') {
      process.on('SIGTERM', () => {})
      spawn(process.execPath, [
        '-e',
        'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)',
      ], { stdio: 'ignore' })
      holdOpen()
    } else {
      process.exit(18)
    }
    return
  }

  if (message.type === 'cancel' && mode === 'wait-cancel') {
    clearInterval(keepAlive)
    process.exit(0)
  }
})
