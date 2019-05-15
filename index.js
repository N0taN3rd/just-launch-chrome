'use strict'
const {
  findChrome,
  findChromeDarwin,
  findChromeLinux,
  findChromeWindows,
  findChromeWSL,
} = require('./lib/finder')

const launch = require('./lib/launcher')

module.exports = {
  launch,
  findChrome,
  findChromeDarwin,
  findChromeLinux,
  findChromeWindows,
  findChromeWSL,
}
