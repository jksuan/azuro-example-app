/**
 * Monkey-patch fs.lstat / fs.lstatSync to silently skip
 * 'System Volume Information' (and other protected system dirs)
 * that Watchpack tries to scan on Windows.
 */
const fs = require('fs')
const path = require('path')

const BLOCKED_PATHS = [
  'System Volume Information',
  '$Recycle.Bin',
  '$RECYCLE.BIN',
  'Recovery',
]

function isBlockedPath(p) {
  if (typeof p !== 'string') return false
  const normalized = p.replace(/\\/g, '/')
  return BLOCKED_PATHS.some(blocked =>
    normalized.includes(`/${blocked}`) || normalized.endsWith(`/${blocked}`)
  )
}

// Patch lstat (async)
const originalLstat = fs.lstat
fs.lstat = function patchedLstat(p, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = undefined
  }
  if (isBlockedPath(p)) {
    const err = new Error(`ENOENT: no such file or directory, lstat '${p}'`)
    err.code = 'ENOENT'
    err.errno = -2
    err.syscall = 'lstat'
    err.path = p
    if (callback) return callback(err)
    return Promise.reject(err)
  }
  if (options !== undefined) {
    return originalLstat.call(this, p, options, callback)
  }
  return originalLstat.call(this, p, callback)
}

// Patch lstatSync
const originalLstatSync = fs.lstatSync
fs.lstatSync = function patchedLstatSync(p, options) {
  if (isBlockedPath(p)) {
    const err = new Error(`ENOENT: no such file or directory, lstat '${p}'`)
    err.code = 'ENOENT'
    err.errno = -2
    err.syscall = 'lstat'
    err.path = p
    throw err
  }
  return originalLstatSync.call(this, p, options)
}

// Patch promises.lstat
const originalPromisesLstat = fs.promises.lstat
fs.promises.lstat = async function patchedPromisesLstat(p, options) {
  if (isBlockedPath(p)) {
    const err = new Error(`ENOENT: no such file or directory, lstat '${p}'`)
    err.code = 'ENOENT'
    err.errno = -2
    err.syscall = 'lstat'
    err.path = p
    throw err
  }
  return originalPromisesLstat.call(this, p, options)
}
