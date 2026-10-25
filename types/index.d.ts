export type Polished = {
  original: string
  text: string
  model: string
  cachedTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-polish': {
      last: Polished | null
      isHidden: boolean
      windowStart: number
    }
  }
}
