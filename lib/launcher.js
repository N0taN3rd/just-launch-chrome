'use strict'

const cp = require('child_process')
const fs = require('fs-extra')
const readline = require('readline')
const { findChrome } = require('./finder')
const { makeTempUDataDir } = require('./utils')

/**
 * @typedef {Object} LaunchOptions
 * @property {?string} [startingURL]
 * @property {?string} [executable]
 * @property {?string} [userDataDir]
 * @property {?string} [userDataDirPrefix]
 * @property {?function(exe: ?string): string} [exeSelector]
 * @property {?Array<string>} [args]
 * @property {?boolean} [handleSIGINT = true]
 * @property {?boolean} [handleSIGTERM = true]
 * @property {?boolean} [handleSIGHUP = true]
 * @property {?boolean} [dumpio = false]
 * @property {?boolean} [headless = false]
 * @property {?boolean} [devtools = false]
 * @property {?boolean} [muteAudio = false]
 * @property {?boolean} [hideScrollBars = false]
 * @property {?number} [port]
 * @property {?number} [launchTimeout = 30000]
 * @property {?Object} [env]
 */

/**
 *
 * @param {?LaunchOptions} [options]
 * @return {Promise<{opts: LaunchOptions, udataDir: ?string}>}
 */
async function ensureArgs(options) {
  const opts = Object.assign(
    {
      handleSIGINT: true,
      handleSIGTERM: true,
      handleSIGHUP: true,
      headless: false,
      devtools: false,
      muteAudio: false,
      hideScrollBars: false,
      ignoreHTTPSErrors: true,
      dumpio: false,
      executable: null,
      exeSelector: null,
      userDataDir: null,
      userDataDirPrefix: null,
      port: null,
      env: process.env,
    },
    options
  )
  if (!opts.args) {
    opts.args = []
  }
  const info = {
    udataDir: null,
    opts,
  }
  let suppliedUdata = false
  if (opts.args.some(arg => arg.startsWith('--user-data-dir'))) {
    suppliedUdata = true
  }
  if (!suppliedUdata && opts.userDataDir) {
    suppliedUdata = true
    opts.args.push(`--user-data-dir=${opts.userDataDir}`)
  }

  if (!suppliedUdata) {
    info.udataDir = await makeTempUDataDir(opts.userDataDirPrefix)
  }
  if (!opts.args.some(arg => arg.startsWith('--remote-debugging-'))) {
    opts.args.push(`--remote-debugging-port=${opts.port ? opts.port : '0'}`)
  }
  if (!opts.executable) {
    const foundExes = await findChrome()
    if (!foundExes.length) {
      throw new Error(
        'Could not find any Chrome/Chromium executables on this system'
      )
    }
    if (typeof opts.exeSelector === 'function') {
      opts.executable = opts.exeSelector(foundExes)
    }
    if (!opts.executable) opts.executable = foundExes[0]
  }
  if (
    opts.devtools &&
    !opts.args.some(arg => arg.startsWith('--auto-open-devtools-for-tabs'))
  ) {
    if (!opts.headless) opts.args.push('--auto-open-devtools-for-tabs')
  }
  if (opts.headless && !opts.args.some(arg => arg.startsWith('--headless'))) {
    opts.args.push('--headless')
  }
  if (
    opts.muteAudio &&
    !opts.args.some(arg => arg.startsWith('--mute-audio'))
  ) {
    opts.args.push('--mute-audio')
  }
  if (
    opts.hideScrollBars &&
    !opts.args.some(arg => arg.startsWith('--hide-scrollbars'))
  ) {
    opts.args.push('--hide-scrollbars')
  }

  if (opts.args.every(arg => arg.startsWith('-'))) {
    opts.args.push(opts.startingURL || 'about:blank')
  }
  info.opts = opts
  return info
}

/**
 *
 * @param {?LaunchOptions} [options]
 * @return {Promise<{browserWSEndpoint: string, chromeProcess: ChildProcess, gracefullyKillChrome: (function(): Promise<void>)}>}
 */
module.exports = async function launch(options) {
  const { opts, udataDir } = await ensureArgs(options)
  const chromeProcess = cp.spawn(opts.executable, opts.args, {
    // On non-windows platforms, `detached: false` makes child process a leader of a new
    // process group, making it possible to kill child process tree with `.kill(-pid)` command.
    // @see https://nodejs.org/api/child_process.html#child_process_options_detached
    detached: process.platform !== 'win32',
    env: opts.env,
    stdio: opts.dumpio
      ? ['pipe', 'pipe', 'pipe']
      : ['ignore', 'ignore', 'pipe'],
  })
  if (opts.dumpio) {
    chromeProcess.stderr.pipe(process.stderr)
    chromeProcess.stdout.pipe(process.stdout)
  }
  let chromeAlive = true

  let listeners = []

  const removeUDataDir = () => {
    if (udataDir) {
      try {
        fs.removeSync(udataDir)
      } catch (e) {
        console.error(e)
      }
    }
  }

  const killChrome = () => {
    removeEventListeners(listeners)
    if (chromeProcess.pid && !chromeProcess.killed && !chromeAlive) {
      chromeAlive = false
      try {
        if (process.platform === 'win32') {
          cp.execSync(`taskkill /pid ${chromeProcess.pid} /T /F`)
        } else {
          process.kill(-chromeProcess.pid, 'SIGKILL')
        }
      } catch (e) {}
    }
    removeUDataDir()
  }

  listeners.push(addEventListener(process, 'exit', killChrome))
  if (opts.handleSIGINT) {
    listeners.push(
      addEventListener(process, 'SIGINT', () => {
        killChrome()
        process.exit(130)
      })
    )
  }
  if (opts.handleSIGTERM) {
    listeners.push(addEventListener(process, 'SIGTERM', killChrome))
  }
  if (opts.handleSIGHUP) {
    listeners.push(addEventListener(process, 'SIGHUP', killChrome))
  }

  const waitForChromeToClose = new Promise(resolve => {
    chromeProcess.once('exit', () => {
      chromeAlive = false
      // Cleanup as processes exit.
      removeUDataDir()
      resolve()
    })
  })

  const gracefullyKillChrome = () => {
    removeEventListeners(listeners)
    killChrome()
    return waitForChromeToClose
  }

  const browserWSEndpoint = await waitForWSEndpoint(
    chromeProcess,
    typeof opts.launchTimeout === 'number' ? opts.launchTimeout : 30 * 1000
  )
  return {
    chromeProcess,
    gracefullyKillChrome,
    browserWSEndpoint,
  }
}

/**
 *
 * @param emitter
 * @param event
 * @param listener
 * @return {{listener: function, event: string, emitter: *}}
 */
function addEventListener(emitter, event, listener) {
  emitter.on(event, listener)
  return { emitter, event, listener }
}

/**
 *
 * @param {Array<{emitter: *, event: string, listener: function}>} listeners
 */
function removeEventListeners(listeners) {
  for (let i = 0; i < listeners.length; i++) {
    const l = listeners[i]
    l.emitter.removeListener(l.event, l.listener)
  }
}

function waitForWSEndpoint(chromeProcess, timeout) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: chromeProcess.stderr })
    let stderr = ''
    let timeoutId
    let listeners
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      removeEventListeners(listeners)
    }
    const onClose = () => {
      cleanup()
      reject(new Error(['Failed to launch chrome!', stderr].join('\n')))
    }
    const onTimeout = () => {
      cleanup()
      reject(
        new Error(
          `Timed out after ${timeout} ms while trying to connect to Chrome!`
        )
      )
    }
    /**
     * @param {string} line
     */
    const onLine = line => {
      stderr += line + '\n'
      const match = line.match(/^DevTools listening on (ws:\/\/.*)$/)
      if (!match) {
        return
      }
      cleanup()
      resolve(match[1])
    }
    listeners = [
      addEventListener(rl, 'line', onLine),
      addEventListener(rl, 'close', onClose),
      addEventListener(chromeProcess, 'exit', onClose),
      addEventListener(chromeProcess, 'error', onClose),
    ]
    timeoutId = timeout ? setTimeout(onTimeout, timeout) : null
  })
}
