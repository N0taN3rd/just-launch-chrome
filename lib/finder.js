'use strict'
const cp = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const { platform, getLocalAppDataPath } = require('./utils')

/**
 * @type {RegExp}
 */
const nlre = /\r?\n/

/**
 * Returns a list of Chrome/Chromium executables that
 * were discovered
 *
 * Supported platforms
 *  - linux
 *  - darwin
 *  - windows
 *  - windows subsystems linux
 *
 * @throws {Error} If the platform is unsupported or some
 * other error occurs
 * @return {Promise<Array<string>>}
 */
async function findChrome() {
  const plat = platform()
  switch (plat) {
    case 'linux':
      return findChromeLinux()
    case 'darwin':
      return findChromeDarwin()
    case 'wsl':
      return findChromeWSL()
    case 'win32':
      return findChromeWindows()
  }
  throw new Error(`Unsupported platform ${plat}`)
}

/**
 * Finds all acceptable Chrome or Chromium executable on Linux
 * returning an sorted array of the available Chrome or Chromium executables
 * @returns {Promise<Array<string>>}
 */
async function findChromeLinux() {
  const seen = new Set()
  const found = []
  const exePriorities = [
    {
      which: 'google-chrome-stable',
      regex: /google-chrome-stable$/,
      weight: 52,
    },
    { which: 'google-chrome-beta', regex: /google-chrome-beta$/, weight: 51 },
    {
      which: 'google-chrome-unstable',
      regex: /google-chrome-unstable$/,
      weight: 50,
    },
    { which: 'google-chrome', regex: /google-chrome$/, weight: 49 },
    { which: 'chromium-wrapper', regex: /chrome-wrapper$/, weight: 48 },
    { which: 'chromium-browser', regex: /chromium-browser$/, weight: 47 },
    { which: 'chromium', regex: /chromium$/, weight: 46 },
  ]
  const desktops = [
    '/usr/share/applications/*.desktop',
    path.join(os.homedir(), '.local/share/applications/*.desktop'),
  ]

  let commandResults
  let priority
  let exe
  let i

  for (i = 0; i < exePriorities.length; ++i) {
    priority = exePriorities[i]
    exe = await which(priority.which)
    if ((await bingo(exe)) && !seen.has(exe)) {
      seen.add(exe)
      found.push({ exe, weight: priority.weight })
    }
  }

  for (i = 0; i < desktops.length; i++) {
    commandResults = await exec(
      `ls ${desktops[i]} | grep -E "\/.*\/(google|chrome|chromium)-.*"`
    )
    if (!commandResults) continue
    await grepChromeDesktopsLinux(
      commandResults.split(nlre),
      exePriorities,
      found,
      seen
    )
  }

  if (
    process.env.LIGHTHOUSE_CHROMIUM_PATH &&
    (await bingo(process.env.LIGHTHOUSE_CHROMIUM_PATH)) &&
    !seen.has(process.env.LIGHTHOUSE_CHROMIUM_PATH)
  ) {
    found.push({
      exe: process.env.LIGHTHOUSE_CHROMIUM_PATH,
      weight: 150,
    })
  }

  return sortedExes(found)
}

/**
 * Finds and returns a list of acceptable Chrome or Chromium executable on MacOS
 * @returns {Promise<Array<string>>}
 */
async function findChromeDarwin() {
  // shamelessly borrowed from chrome-launcher (https://github.com/GoogleChrome/chrome-launcher/blob/master/chrome-finder.ts)
  const priorities = [
    {
      regex: new RegExp(`^${process.env.HOME}/Applications/.*Chrome.app`),
      weight: 50,
    },
    {
      regex: new RegExp(
        `^${process.env.HOME}/Applications/.*Chrome Canary.app`
      ),
      weight: 51,
    },
    { regex: /^\/Applications\/.*Chrome.app/, weight: 100 },
    { regex: /^\/Applications\/.*Chrome Canary.app/, weight: 101 },
    { regex: /^\/Volumes\/.*Chrome.app/, weight: -2 },
    { regex: /^\/Volumes\/.*Chrome Canary.app/, weight: -1 },
  ]
  if (process.env.LIGHTHOUSE_CHROMIUM_PATH) {
    priorities.unshift({
      regex: new RegExp(`${process.env.LIGHTHOUSE_CHROMIUM_PATH}`),
      weight: 150,
    })
  }
  const found = []
  const defaultWeight = 10
  const seen = new Set()
  const suffixes = [
    '/Contents/MacOS/Google Chrome Canary',
    '/Contents/MacOS/Google Chrome',
  ]
  const LSREGISTER =
    '/System/Library/Frameworks/CoreServices.framework' +
    '/Versions/A/Frameworks/LaunchServices.framework' +
    '/Versions/A/Support/lsregister'

  const commandResult = await exec(
    `${LSREGISTER} -dump | grep -i 'google chrome\\( canary\\)\\?.app$' | awk '{$1="" print $0}'`
  )
  if (!commandResult) return []
  let nthSuffix
  const regDump = commandResult.split(nlre)
  for (let nthReg = 0; nthReg < regDump.length; nthReg++) {
    for (nthSuffix = 0; nthSuffix < suffixes.length; nthSuffix++) {
      await testExe(
        path.join(regDump[nthReg].trim(), suffixes[nthSuffix]),
        priorities,
        seen,
        found,
        defaultWeight
      )
    }
  }
  return sortedExes(found)
}

/**
 * Finds and returns a list of acceptable Chrome or Chromium executable on Windows
 * Subsystems Linux
 * @returns {Promise<Array<string>>}
 */
function findChromeWSL() {
  // Manually populate the environment variables assuming it's the default config
  process.env.LOCALAPPDATA = getLocalAppDataPath(`${process.env.PATH}`)
  process.env.PROGRAMFILES = '/mnt/c/Program Files'
  process.env['PROGRAMFILES(X86)'] = '/mnt/c/Program Files (x86)'

  return findChromeWindows()
}

/**
 * Finds and returns a list of acceptable Chrome or Chromium executable on Windows
 * @returns {Promise<Array<string>>}
 */
async function findChromeWindows() {
  // shamelessly borrowed from chrome-launcher (https://github.com/GoogleChrome/chrome-launcher/blob/master/chrome-finder.ts)
  const installations = []
  const suffixes = [
    `${path.sep}Google${path.sep}Chrome SxS${path.sep}Application${
      path.sep
    }chrome.exe`,
    `${path.sep}Google${path.sep}Chrome${path.sep}Application${
      path.sep
    }chrome.exe`,
  ]

  const prefixes = [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
  ].filter(Boolean)

  if (
    process.env.LIGHTHOUSE_CHROMIUM_PATH &&
    (await bingo(process.env.LIGHTHOUSE_CHROMIUM_PATH))
  ) {
    installations.push(process.env.LIGHTHOUSE_CHROMIUM_PATH)
  }

  let chromePath
  let nthSuffix
  for (let nthPrefix = 0; nthPrefix < prefixes.length; ++nthPrefix) {
    for (nthSuffix = 0; nthSuffix < suffixes.length; nthSuffix++) {
      chromePath = path.join(prefixes[nthPrefix], suffixes[nthSuffix])
      if (await bingo(chromePath)) {
        installations.push(chromePath)
      }
    }
  }
  return installations
}

/**
 * Executes grep to find extract the Chrome/Chromium executable
 * for the supplied list of .desktop paths
 * @param {Array<string>} desktopPaths
 * @param {Array<{which: string, regex: RegExp, weight: number}>} exePriorities
 * @param {Array<{exe: string, weight: number}>} found
 * @param {Set<string>} seen
 * @return {Promise<void>}
 */
async function grepChromeDesktopsLinux(
  desktopPaths,
  exePriorities,
  found,
  seen
) {
  const desktopArgRE = /(^[^ ]+).*/
  let patternPipe
  let maybeGrepResults
  let exePaths
  let exePath
  let nthExePath
  for (let nthDesktop = 0; nthDesktop < desktopPaths.length; nthDesktop++) {
    patternPipe = `"^Exec=\/.*\/(google|chrome|chromium)-.*" ${
      desktopPaths[nthDesktop]
    } | awk -F '=' '{print $2}'`
    try {
      maybeGrepResults = await exec(`grep -ER ${patternPipe}`, true)
    } catch (e) {
      maybeGrepResults = await exec(`grep -Er ${patternPipe}`)
    }
    if (!maybeGrepResults) continue
    exePaths = maybeGrepResults.split(nlre)
    for (nthExePath = 0; nthExePath < exePaths.length; nthExePath++) {
      try {
        exePath = exePaths[nthExePath].replace(desktopArgRE, '$1')
      } catch (e) {
        exePath = null
      }
      await testExe(exePath, exePriorities, seen, found)
    }
  }
}

/**
 *
 * @param {?string} exe
 * @param {Array<{which: string, regex: RegExp, weight: number}>} exePriorities
 * @param {Array<{exe: string, weight: number}>} found
 * @param {Set<string>} seen
 * @param {number} [defaultWeight]
 * @return {Promise<void>}
 */
async function testExe(exe, exePriorities, seen, found, defaultWeight) {
  if (!exe) return
  let priority
  let useDefault = true
  for (let nthPriority = 0; nthPriority < exePriorities.length; ++nthPriority) {
    priority = exePriorities[nthPriority]
    if (!seen.has(exe) && priority.regex.test(exe) && (await bingo(exe))) {
      seen.add(exe)
      found.push({ exe, weight: priority.weight })
      useDefault = false
      break
    }
  }
  if (useDefault && defaultWeight && !seen.has(exe)) {
    seen.add(exe)
    found.push({ exe, weight: defaultWeight })
  }
}

/**
 * @param {Array<{exe: string, weight: number}>} weightedExes
 * @return {Array<string>}
 */
function sortedExes(weightedExes) {
  weightedExes.sort((exe1, exe2) => exe2.weight - exe1.weight)
  const sortedExes = new Array(weightedExes.length)
  for (let i = 0; i < weightedExes.length; i++) {
    sortedExes[i] = weightedExes[i].exe
  }
  return sortedExes
}

/**
 * @desc Executes the supplied command
 * @param {string} someCommand
 * @param {boolean} [rejectOnError = false]
 * @returns {Promise<?string>}
 */
function exec(someCommand, rejectOnError = false) {
  return new Promise((resolve, reject) => {
    cp.exec(someCommand, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error && rejectOnError) reject(error)
      resolve(stdout.trim())
    })
  })
}

/**
 * @desc Tests (T|F) to see if the execPath is executable by this process
 * @param {string} execPath - The executable path to test
 * @returns {Promise<boolean>}
 */
async function bingo(execPath) {
  if (!execPath) return false
  try {
    await fs.access(execPath, fs.constants.X_OK)
    return true
  } catch (e) {
    return false
  }
}

/**
 * @desc Executes the which command for the supplied executable name
 * @param {string} executable
 * @return {Promise<?string>}
 */
function which(executable) {
  return exec(`which ${executable}`)
}

module.exports = {
  findChrome,
  findChromeDarwin,
  findChromeLinux,
  findChromeWindows,
  findChromeWSL,
}
