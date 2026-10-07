export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type Reading = {
  contextPercent?: number
  rateLimits: RateLimit[]
  nowMs: number
  // As `/model` shows it, the last turn's effort, and the session's cost in US dollars.
  model?: string
  effort?: string
  cost?: number
}

declare module 'claude-code' {
  interface PluginState {
    'compact-usage-meter': { reading: Reading | null }
  }
}
