import { expect, mock, test } from 'claude-code/testing'
import type { ModelCompleteInput, On, SessionMessage } from 'claude-code'

const ROUGH = 'so like can u fix the login bug its broken when password has spaces'
const CLEAN = 'Fix the login bug: it breaks when the password contains spaces.'
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 2400 }
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const
const polish = (args: string) =>
  ({
    command: 'polish',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  }) as const
const row = (role: 'user' | 'assistant', text: string): SessionMessage => ({ role, text, toolUses: [] })

let toasts: string[] = []
let asked: ModelCompleteInput[] = []

// What sits beneath the plugin in a session: store, UI calls, the transcript, the model.
const engine = (on: On, rows: SessionMessage[] = [], reply: string | null = CLEAN) => {
  toasts = []
  asked = []
  mock.store(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.messages', () => ({ value: rows }))
  on('model.complete', (_, e) => {
    asked.push(e)
    return reply === null
      ? { value: { isAnswered: false, reason: 'aborted', usage: USAGE } }
      : { value: { isAnswered: true, text: reply, usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
}

test('a typed prompt reaches the model rewritten, the original kept as context', async ($, on) => {
  engine(on)

  const r = await $.prompt.submit(typed(ROUGH))

  expect(asked[0]?.model).toBe('sonnet')
  expect(asked[0]?.prompt).toContain(ROUGH)
  expect('text' in r && r.text).toBe(CLEAN)
  expect('context' in r && r.context?.[0]).toContain(ROUGH)
})

test('the model chosen at install does the polishing', { options: { model: 'haiku' } }, async ($, on) => {
  engine(on)
  await $.prompt.submit(typed(ROUGH))
  expect(asked[0]?.model).toBe('haiku')
})

test('/polish haiku switches the model for the next prompts', async ($, on) => {
  engine(on)

  const r = await $.command.run(polish('haiku'))
  await $.prompt.submit(typed(ROUGH))

  expect('text' in r && r.text).toContain('Haiku')
  expect(asked[0]?.model).toBe('haiku')
})
test('the recent conversation rides along, cached so the next prompt reuses it', async ($, on) => {
  const rows = [
    row('user', 'add rate limiting to the upload route'),
    row('assistant', 'Done: /api/upload is rate limited with the Redis client.'),
    row('user', '<system-reminder>internal</system-reminder>'),
  ]
  engine(on, rows)

  await $.prompt.submit(typed('now do the same for the download one'))
  rows.push(row('user', 'now do the same for the download one'), row('assistant', 'Done for /api/download.'))
  await $.prompt.submit(typed('and add a test for both of them'))

  const [first, second] = asked.map(a => a.systemBlocks ?? [])
  expect(first?.[0]?.cache).toBe(true)
  expect(first?.[2]?.text).toContain('rate limited')
  expect(first?.[2]?.cache).toBe(true)
  expect(asked[0]?.system).not.toContain('internal')
  // The second request opens with the first one's blocks, so the cache serves them.
  expect(second?.slice(0, 3).map(b => b.text)).toEqual(first?.slice(0, 3).map(b => b.text))
  expect(second?.[4]?.text).toContain('/api/download')
  expect(second?.[4]?.cache).toBe(true)
})

test('the :: prefix and /polish off send the prompt as typed', async ($, on) => {
  engine(on)

  const raw = await $.prompt.submit(typed(`:: ${ROUGH}`))
  expect('text' in raw && raw.text).toBe(ROUGH)

  await $.command.run(polish('off'))
  const off = await $.prompt.submit(typed(ROUGH))
  expect('text' in off && off.text).toBe(ROUGH)
  expect(asked.length).toBe(0)
})

test('a failed rewrite sends the prompt as typed', async ($, on) => {
  engine(on, [], null)

  const r = await $.prompt.submit(typed(ROUGH))
  expect('text' in r && r.text).toBe(ROUGH)
  expect(toasts[0]).toContain('polish failed')
})

const BAND = {
  plugin: 'prompt-polish',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 19 }, view: {} },
} as const

test('the band shows the polished prompt and the cache read until hidden', async ($, on) => {
  engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.prompt.submit(typed(ROUGH))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /password contains spaces/ }))?.text).toBe(CLEAN)
    expect(await ui.find({ type: 'Text', text: /Sonnet polished .* 2\.4k tokens from cache/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'hide' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
