const {
  findChrome,
  findChromeDarwin,
  findChromeLinux,
  findChromeWindows,
  findChromeWSL,
} = require('./finder')

const launch = require('./launcher')

module.exports = {
  launch,
  findChrome,
  findChromeDarwin,
  findChromeLinux,
  findChromeWindows,
  findChromeWSL,
}
