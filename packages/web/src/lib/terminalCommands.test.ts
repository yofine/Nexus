import { describe, expect, it } from 'vitest'
import { getProjectCommands } from './terminalCommands'

describe('getProjectCommands', () => {
  it('keeps common project scripts in the preferred order', () => {
    expect(getProjectCommands({
      build: 'vite build',
      dev: 'vite',
      lint: 'eslint .',
      test: 'vitest',
    })).toEqual(['pnpm dev', 'pnpm build', 'pnpm test', 'pnpm lint'])
  })

  it('dynamically includes release scripts from package.json', () => {
    expect(getProjectCommands({
      dev: 'vite',
      'release:minor': 'node scripts/release.mjs minor',
      'release:patch': 'node scripts/release.mjs patch',
      'release:major': 'node scripts/release.mjs major',
    })).toEqual([
      'pnpm dev',
      'pnpm release:major',
      'pnpm release:minor',
      'pnpm release:patch',
    ])
  })

  it('does not include unrelated custom scripts automatically', () => {
    expect(getProjectCommands({
      dev: 'vite',
      preview: 'vite preview',
      doctor: 'node doctor.mjs',
    })).toEqual(['pnpm dev'])
  })
})
