/**
 * postinstall script for nexus-console
 *
 * node-pty ships prebuilt binaries including a `spawn-helper` executable.
 * npm strips execute permissions from files during pack/publish, so
 * `spawn-helper` arrives as 0644. Without +x, pty.spawn() fails with
 * "posix_spawnp failed" on macOS/Linux.
 *
 * This script restores the execute permission.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodeModules = path.resolve(__dirname, '..', 'node_modules', 'node-pty')

// Fix prebuilds/{platform}-{arch}/spawn-helper
const prebuildsDir = path.join(nodeModules, 'prebuilds')
if (fs.existsSync(prebuildsDir)) {
  for (const entry of fs.readdirSync(prebuildsDir)) {
    const helper = path.join(prebuildsDir, entry, 'spawn-helper')
    if (fs.existsSync(helper)) {
      try {
        fs.chmodSync(helper, 0o755)
      } catch {
        // may fail on Windows, that's fine
      }
    }
  }
}

// Also fix build/Release/spawn-helper if it exists (node-gyp rebuild case)
const buildHelper = path.join(nodeModules, 'build', 'Release', 'spawn-helper')
if (fs.existsSync(buildHelper)) {
  try {
    fs.chmodSync(buildHelper, 0o755)
  } catch {
    // ignore
  }
}
