const COMMON_SCRIPT_KEYS = ['dev', 'build', 'test', 'lint']

export function getProjectCommands(scripts: Record<string, string>): string[] {
  const commonCommands = COMMON_SCRIPT_KEYS
    .filter((key) => key in scripts)
    .map((key) => `pnpm ${key}`)

  const releaseCommands = Object.keys(scripts)
    .filter((key) => key.startsWith('release:'))
    .sort()
    .map((key) => `pnpm ${key}`)

  return [...commonCommands, ...releaseCommands]
}
