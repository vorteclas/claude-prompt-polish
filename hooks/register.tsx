import { atom, read, update } from 'claude-code'
import type { ModelTextBlock, Register, SessionMessage } from 'claude-code'

import type { Polished } from '../types'
import { GUIDE, SYSTEM } from './guide'

// Start a prompt with this to send it exactly as typed.
const RAW_PREFIX = '::'
const ENABLED_KEY = 'enabled'
const MIN_WORDS = 4
// Characters kept of each turn shown to the polishing model.
const TURN_CHARS = 1500
// The conversation window only grows, so each request reuses the cached turns
// of the last one; past MAX_TURNS it restarts from the last KEEP_TURNS (one miss).
const MAX_TURNS = 16
const KEEP_TURNS = 8
const NOTE = "The user's prompt was automatically rewritten"

const last = atom({ plugin: 'prompt-polish', key: 'last' } as const, null)
const isHidden = atom({ plugin: 'prompt-polish', key: 'isHidden' } as const, false)
const windowStart = atom({ plugin: 'prompt-polish', key: 'windowStart' } as const, 0)

type Turn = { role: 'user' | 'assistant'; text: string }

// One entry per speaker change; a turn's text is the same on every read once
// the turn is over, which keeps the cached prefix byte-identical.
const toTurns = (rows: readonly SessionMessage[]): Turn[] => {
  const turns: Turn[] = []
  for (const row of rows) {
    let text = row.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    const note = text.indexOf(NOTE)
    if (note >= 0) text = text.slice(0, note)
    text = text.trim()
    if (!text) continue
    const prev = turns[turns.length - 1]
    if (prev?.role === row.role) prev.text += `\n\n${text}`
    else turns.push({ role: row.role, text })
  }

  // The person's words from the start, Claude's from the end, where it sums up.
  return turns.map(t => ({
    ...t,
    text:
      t.text.length <= TURN_CHARS
        ? t.text
        : t.role === 'user'
          ? `${t.text.slice(0, TURN_CHARS)} […]`
          : `[…] ${t.text.slice(-TURN_CHARS)}`,
  }))
}

const label = (model: string) => model.charAt(0).toUpperCase() + model.slice(1)

export const register: Register = (on, options) => {
  const model = typeof options.model === 'string' ? options.model : 'sonnet'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'polish',
      description: 'Turn automatic prompt polishing on or off',
      argumentHint: 'on | off',
    })

    return next(e)
  })

  on('command.run', { command: 'polish' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const isEnabled =
      arg === 'on' ? true : arg === 'off' ? false : (await $.store.get(ENABLED_KEY)) === false
    await $.store.set(ENABLED_KEY, isEnabled)
    if (!isEnabled) await update($, last, () => null)
    $.ui.toast(`Prompt polish ${isEnabled ? 'on' : 'off'}`)

    return { text: `Prompt polish is ${isEnabled ? 'on' : 'off'} (model: ${model}).` }
  })

  on('prompt.submit', async ($, e, next) => {
    const isUsers = ['composer', 'bridge', 'sdk'].includes(e.origin.kind)
    if (e.command || e.isMeta || !isUsers) return next(e)

    // A new prompt of the person's: the band shows this one's rewrite or nothing.
    await update($, last, () => null)

    if (e.text.startsWith(RAW_PREFIX)) {
      return next({ ...e, text: e.text.slice(RAW_PREFIX.length).trimStart() })
    }

    const isEnabled = (await $.store.get(ENABLED_KEY)) !== false
    if (!isEnabled || e.text.trim().split(/\s+/).length < MIN_WORDS) return next(e)

    $.ui.status(`Polishing prompt with ${label(model)}…`)
    let text = ''
    let cachedTokens = 0
    let failure = 'empty reply'
    try {
      let turns: Turn[] = []
      try {
        turns = toTurns(await $.session.messages())
      } catch {
        // No transcript to read: polish the prompt on its own.
      }
      let start = await read($, windowStart)
      if (start > turns.length || turns.length - start > MAX_TURNS) {
        start = Math.max(0, turns.length - KEEP_TURNS)
        await update($, windowStart, () => start)
      }
      const window = turns.slice(start)

      // Guide, then turns, each prefix marked: the guide is always a hit, and
      // the turns cached by the last request are a hit up to where it ended.
      // (Marked blocks go in `system`: older hosts refuse them in `prompt`.)
      const system: ModelTextBlock[] = [
        { text: `${SYSTEM}\n\n${GUIDE}`, cache: true },
        ...window.map((t, i): ModelTextBlock => {
          const block = { text: `<turn role="${t.role}">${t.text}</turn>\n` }
          return i === window.length - 1 ? { ...block, cache: true } : block
        }),
        { text: '</recent_conversation>' },
      ]

      const r = await $.model.complete({
        model,
        system,
        prompt: `<prompt>\n${e.text}\n</prompt>`,
        maxTokens: 4096,
        effort: 'low',
        timeoutMs: 30000,
      })
      cachedTokens = r.usage.cache_read_input_tokens
      if (r.isAnswered) text = r.text.trim()
      else failure = r.reason
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err)
    } finally {
      $.ui.status(undefined)
    }

    if (!text) {
      $.ui.toast(`Prompt sent as typed (polish failed: ${failure})`)
      return next(e)
    }
    if (text === e.text.trim()) return next(e)

    const polished: Polished = { original: e.text, text, model, cachedTokens }
    await update($, last, () => polished)
    await update($, isHidden, () => false)

    // Keep the original beside it so Claude can recover anything the rewrite lost.
    const original = `${NOTE} for clarity by the prompt-polish mod. Their original wording was:\n\n${e.text}\n\nIf the two disagree, the original wins.`
    return next({ ...e, text, context: [...(e.context ?? []), original] })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const polished = await read($, last)
    if (e.props.hasSurvey || polished === null || (await read($, isHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const cache =
      polished.cachedTokens > 0
        ? ` · ${(polished.cachedTokens / 1000).toFixed(1)}k tokens from cache`
        : ''

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>
            ✨ {label(polished.model)} polished your prompt to:{cache}{' '}
          </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
        <Text>{polished.text}</Text>
      </Box>
    )
  })
}
