export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type Reading = {
  contextPercent?: number
  rateLimits: RateLimit[]
  nowMs: number
}

declare module 'claude-code' {
  interface PluginState {
    'compact-usage-meter': { reading: Reading | null }
  }
}
