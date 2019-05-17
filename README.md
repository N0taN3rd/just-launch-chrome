Just Launch Chrome
=======================
[![node requirement](https://img.shields.io/badge/node-%3E%3D%208.6.0-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![sanic](https://img.shields.io/badge/speed-blazing%20%F0%9F%94%A5-brightgreen.svg?style=flat-square)](https://twitter.com/acdlite/status/974390255393505280)

Why cause sometimes you just want something to launch chrome with the remote debugging port set for you with or without defaults.

## Getting Started

### Installation

To use launch-chrome in your project, run:

```bash
yarn add just-launch-chrome
# or "npm i just-launch-chrome"
```

### Usage

just-launch-chrome provides two basic operations finding Chrome/Chromium executables and launching Chrome/Chromium on supported platforms.

The supported platforms are
 - Linux
 - Mac OS (Darwin)
 - Windows
 - Windows Subsystems Linux


#### Finding Chrome


 The simplest way to use just-launch-chrome as a means to find Chrome/Chromium executables is shown below

 ```js
const { findChrome } = require('just-launch-chrome')

;(async () => {
  const executables = await findChrome()
  for (const exe of executables) {
    console.log(exe)
  }
})()
 ```

 The return value of `findChrome` is an list, array, of discovered executables (path to the executable on the system).

launch-chrome also makes available each of the supported platforms finding functions available
 - `findChromeLinux`
 - `findChromeDarwin`
 - `findChromeWindows`
 - `findChromeWSL`

#### Launching Chrome

Launching chrome is done via the `launch` function as shown below

```js
const { launch } = require('just-launch-chrome')

;(async () => {
  const { chromeProcess, closeBrowser, browserWSEndpoint } = await launch()

  // do stuff with chrome

  await closeBrowser()
})()
```

The return value of the function is a Promise that resolves to an object with the following properties
 - (ChildProcess) chromeProcess - The reference to the spawned chrome process 
 - (function (): Promise<void>) closeBrowser - A function that returns a Promise that resolves once the launched browser is closed
 - (string) browserWSEndpoint -  The CDP websocket URL of the browser 

Optional configuration options 
 - (string) startingURL - The starting URL of the browser, defaults to `about:blank`
 - (string) executable - The Chrome/Chromium executable used for launching, defaults to the first executable found via `findChrome` 
 - (string) userDataDir - Path to a directory to be used as the browser's user data directory, defaults to a temporary directory 
 - (string) userDataDirPrefix - A prefix for the created temporary directory
 - (function(exes: Array<string>): string) exeSelector - Function used to select the executable to be used rather than the first one found
 - (Array<string>) args - A list of launch args 
 - (boolean) handleSIGINT - should the launched browser be killed when the process receives the `SIGINT` signal, defaults to true
 - (boolean) handleSIGTERM should the launched browser be killed when the process receives the `SIGTERM` signal, defaults to true
 - (boolean) handleSIGHUP should the launched browser be killed when the process receives the `SIGHUP` signal, defaults to true
 - (boolean) dumpio - Should the browsers std out and err be displayed, defaults to false
 - (boolean) headless - Should the browser be launched in headless mode, defaults to false
 - (boolean) devtools - Should the devtools be opened in all tabs created, defaults to false
 - (boolean) muteAudio - Should audio be muted for all tabs opened, defaults to false
 - (boolean) hideScrollBars - Should scroll bars be hidden for all tabs opened, defaults to false
 - (number) port - The port number for the [Chrome DevTools Protocol (CDP)](https://chromedevtools.github.io/devtools-protocol/), defaults to the port chosen by chrome  
 - (number) launchTimeout - Maximum length of time, in milliseconds, that should be waited before the launching of the browser is considered to not have happened, defaults to 30000 
 - (Object) env - Environment variables that superceded the processes own environment to be used when launching the browser, defaults to the process own environment variables 
  