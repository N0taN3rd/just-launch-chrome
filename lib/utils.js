'use strict'
const path = require('path')
const os = require('os')
const fs = require('fs-extra')
const isWsl = require('is-wsl')

function platform() {
  if (isWsl) return 'wsl'
  return process.platform
}
/**
 * @param {string} [prefix]
 * @return {Promise<string>}
 */
function makeTempUDataDir(prefix) {
  if (platform() === 'wsl') {
    // graciously stolen from https://github.com/GoogleChrome/chrome-launcher/blob/master/src/utils.ts
    process.env.TEMP = getLocalAppDataPath(`${process.env.PATH}`)
  }
  const tempprefix = path.join(
    os.tmpdir(),
    prefix ? prefix : 'launch-chrome-temp-udata-dir-'
  )
  return fs.mkdtemp(tempprefix)
}

function getLocalAppDataPath(path) {
  const userRegExp = /\/mnt\/([a-z])\/Users\/([^\/:]+)\/AppData\//
  const results = userRegExp.exec(path) || []
  return `/mnt/${results[1]}/Users/${results[2]}/AppData/Local`
}

module.exports = {
  makeTempUDataDir,
  platform,
  getLocalAppDataPath
}
