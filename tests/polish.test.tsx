import { expect, mock, test } from 'claude-code/testing'

const ROUGH = 'so like can u fix the login bug its broken when password has spaces'
const CLEAN = 'Fix the login bug: it breaks when the password contains spaces.'
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
let toasts: string[] = []
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

test('a typed prompt reaches the model rewritten, the original kept as context', async ($, on) => {
  mock.store(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  let asked = ''
  on('model.complete', (_, e) => {
    asked = e.prompt
    return { value: { isAnswered: true, text: CLEAN, usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  const r = await $.prompt.submit(typed(ROUGH))

  expect(asked).toContain(ROUGH)
  expect('text' in r && r.text).toBe(CLEAN)
  expect('context' in r && r.context?.[0]).toContain(ROUGH)
})

test('the :: prefix and /polish off send the prompt as typed', async ($, on) => {
  mock.store(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  let calls = 0
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: true, text: CLEAN, usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))

  const raw = await $.prompt.submit(typed(`:: ${ROUGH}`))
  expect('text' in raw && raw.text).toBe(ROUGH)

  await $.command.run({ command: 'polish', args: 'off' })
  const off = await $.prompt.submit(typed(ROUGH))
  expect('text' in off && off.text).toBe(ROUGH)
  expect(calls).toBe(0)
})

test('a failed rewrite sends the prompt as typed', async ($, on) => {
  mock.store(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: USAGE } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  toasts = []
  const r = await $.prompt.submit(typed(ROUGH))
  expect('text' in r && r.text).toBe(ROUGH)
  expect(toasts[0]).toContain('rewrite failed')
})

const BAND = {
  plugin: 'prompt-polish',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 19 } },
} as const

test('the band above the prompt shows the polished prompt until hidden', async ($, on) => {
  mock.store(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: CLEAN, usage: USAGE } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.prompt.submit(typed(ROUGH))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /password contains spaces/ }))?.text).toBe(CLEAN)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /password contains spaces/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
