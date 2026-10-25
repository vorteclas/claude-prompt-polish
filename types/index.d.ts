export type Polished = { original: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-polish': { last: Polished | null; isHidden: boolean }
  }
}
