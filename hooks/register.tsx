import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Polished } from '../types'

// Start a prompt with this to send it exactly as typed.
const RAW_PREFIX = '::'
const ENABLED_KEY = 'enabled'
const MIN_WORDS = 4

const last = atom({ plugin: 'prompt-polish', key: 'last' } as const, null)
const isHidden = atom({ plugin: 'prompt-polish', key: 'isHidden' } as const, false)

const SYSTEM = `You rewrite prompts that a developer is about to send to an AI coding assistant.
Fix grammar, spelling and punctuation, and restructure rambling or run-on text into clear, logically ordered instructions.

Rules:
- Keep the prompt's kind: a question stays a question, a request stays a request. Never turn a question into a statement or claim, and never answer it.
- Where the wording is ambiguous, keep the reading closest to the author's words rather than guessing.
- Keep the author's intent, scope, tone and every concrete detail (names, paths, code, numbers, URLs, error text) exactly.
- Never add requirements, assumptions or questions the author did not express. Never answer the prompt.
- Leave code blocks, inline code, commands and quoted text byte-for-byte unchanged.
- Keep short prompts short. Use a brief bulleted or numbered list only when the prompt holds several distinct steps or requirements.
- Write in the same language the author used, first person, as the author.
- Output only the rewritten prompt: no preamble, no quotes, no commentary.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'polish',
      description: 'Turn automatic prompt rewriting by Haiku on or off',
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

    return { text: `Prompt polish is ${isEnabled ? 'on' : 'off'}.` }
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

    $.ui.status('Polishing prompt…')
    let text = ''
    let failure = 'empty reply'
    try {
      const r = await $.model.complete({
        model: 'haiku',
        system: SYSTEM,
        prompt: `<prompt>\n${e.text}\n</prompt>`,
        maxTokens: 4096,
        effort: 'low',
        timeoutMs: 15000,
      })
      if (r.isAnswered) text = r.text.trim()
      else failure = r.reason
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err)
    } finally {
      $.ui.status(undefined)
    }

    if (!text) {
      $.ui.toast(`Prompt sent as typed (rewrite failed: ${failure})`)
      return next(e)
    }
    if (text === e.text.trim()) return next(e)

    const polished: Polished = { original: e.text, text }
    await update($, last, () => polished)
    await update($, isHidden, () => false)

    // Keep the original beside it so Claude can recover anything the rewrite lost.
    const original = `The user's prompt was automatically rewritten for clarity by the prompt-polish mod. Their original wording was:\n\n${e.text}\n\nIf the two disagree, the original wins.`
    return next({ ...e, text, context: [...(e.context ?? []), original] })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const polished = await read($, last)
    if (e.props.hasSurvey || polished === null || (await read($, isHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>✨ Haiku polished your prompt to:{' '}</Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
        <Text>{polished.text}</Text>
      </Box>
    )
  })
}
