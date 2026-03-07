import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import type { PaneState } from '../types.ts'

export class AgentsYamlWriter {
  private projectDir: string
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(projectDir: string) {
    this.projectDir = projectDir
  }

  /**
   * Write agents.yaml with current pane states. Debounced to avoid excessive writes.
   */
  update(panes: PaneState[]): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.writeFile(panes)
    }, 500)
  }

  /**
   * Write immediately without debouncing.
   */
  flush(panes: PaneState[]): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.writeFile(panes)
  }

  private writeFile(panes: PaneState[]): void {
    const nexusDir = path.join(this.projectDir, '.nexus')
    fs.mkdirSync(nexusDir, { recursive: true })

    const data = {
      updated_at: new Date().toISOString(),
      panes: panes.map((p) => ({
        id: p.id,
        name: p.name,
        agent: p.agent,
        pid: p.pid,
        status: p.status,
        workdir: p.workdir
          ? path.resolve(this.projectDir, p.workdir)
          : this.projectDir,
        task: p.task || undefined,
        model: p.meta.model || undefined,
        context_used_pct: p.meta.contextUsedPct ?? undefined,
        cost_usd: p.meta.costUsd ?? undefined,
        session_id: p.meta.sessionId || undefined,
        started_at: p.startedAt || undefined,
      })),
    }

    const filePath = path.join(nexusDir, 'agents.yaml')
    fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1 }))
  }
}
