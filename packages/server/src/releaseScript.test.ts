import { describe, expect, it } from 'vitest'
import { buildReleasePlan, parseReleaseArgs } from '../../../scripts/release.mjs'

describe('release script', () => {
  it('parses patch release arguments', () => {
    expect(parseReleaseArgs(['patch'])).toEqual({ bump: 'patch', dryRun: false })
  })

  it('parses dry-run flag', () => {
    expect(parseReleaseArgs(['minor', '--dry-run'])).toEqual({ bump: 'minor', dryRun: true })
  })

  it('rejects invalid bump values', () => {
    expect(() => parseReleaseArgs(['foo'])).toThrow('Expected one of: patch, minor, major')
  })

  it('builds the release command sequence for a real publish', () => {
    expect(buildReleasePlan({ bump: 'major', dryRun: false })).toEqual([
      ['git', 'status', '--porcelain'],
      ['pnpm', 'run', 'build'],
      ['npm', 'version', 'major'],
      ['npm', 'publish'],
    ])
  })

  it('builds the release command sequence for a dry run', () => {
    expect(buildReleasePlan({ bump: 'patch', dryRun: true })).toEqual([
      ['git', 'status', '--porcelain'],
      ['pnpm', 'run', 'build'],
      ['npm', 'version', 'patch'],
      ['npm', 'publish', '--dry-run'],
    ])
  })
})
