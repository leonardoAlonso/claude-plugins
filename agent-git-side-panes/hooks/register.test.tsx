import { expect, test } from 'claude-code/testing'

const PANE = (cols: number) =>
  ({
    plugin: 'side-panes',
    component: 'Pane',
    requestId: 'side-panes',
    props: {
      title: 'Agents & Git',
      isFocused: false,
      bodyColumns: cols,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  }) as const

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const WIDTHS = [40, 24]

const agent = (i: number, over: Record<string, unknown> = {}) => ({
  id: `a${i}`,
  type: 'general-purpose',
  description: `task number ${i}`,
  model: 'sonnet',
  effort: 'high',
  tokens: 50000,
  window: 100000,
  status: 'running',
  startTime: Date.now() - 5000,
  ...over,
})
const file = (i: number, code = 'M') => ({ code, path: `src/f${i}.ts`, add: i, del: 1 })

const seed = (on: any, a: unknown[] | undefined, g: unknown | undefined) =>
  on('state.get', (_: any, e: any) => {
    const k = e?.key
    if (k === 'agents' && a) return { value: { value: { shape: 'agents-1', value: a }, version: 1 } }
    if (k === 'git' && g) return { value: { value: { shape: 'git-1', value: g }, version: 1 } }
    return { value: { value: undefined, version: 0 } }
  })

// Collect all Text strings of the drawing.
const texts = async (ui: any) => {
  const out: string[] = []
  for (const t of (await ui.findAll?.({ type: 'Text' })) ?? []) out.push(t.text)
  return out
}

const each = async (
  $: any,
  fn: (ui: any, cols: number, surface: string) => Promise<void>,
) => {
  for (const surface of SURFACES)
    for (const cols of WIDTHS) {
      const ui = await $.ui.mount({ ...PANE(cols), surface })
      try {
        await fn(ui, cols, surface)
      } finally {
        await ui.unmount()
      }
    }
}

const has = async (ui: any, re: RegExp) => expect(await ui.find({ type: 'Text', text: re })).toBeTruthy()
const hasNot = async (ui: any, re: RegExp) => expect(await ui.find({ type: 'Text', text: re })).toBeFalsy()

test('empty state', async ($, on) => {
  await each($, async ui => {
    await has(ui, /No subagents yet\./)
    await has(ui, /SUBAGENTS · 0(\/0| running · 0 total)/)
    await has(ui, /GIT/)
    await has(ui, /Working tree clean\./)
  })
})

test('running agent at 50% context', async ($, on) => {
  seed(on, [agent(1)], { isRepo: true, branch: 'main', files: [] })
  await each($, async ui => {
    await has(ui, /SUBAGENTS · 1(\/1| running · 1 total)/)
    await has(ui, /👾 general-purpose/)
    await has(ui, /50% 50\.0k\/100\.?…?0?k?/)
    await has(ui, /sonnet · effort/)
    await has(ui, /task number 1/)
    await hasNot(ui, /more/)
  })
  const ui = await $.ui.mount({ ...PANE(40), surface: 'desktop' })
  await has(ui, /GIT · main/)
  expect(await ui.find({ type: 'Button' })).toBeFalsy()
  await ui.unmount()
})

test('agent at 95% context', async ($, on) => {
  seed(on, [agent(1, { tokens: 95000 })], undefined)
  await each($, async ui => {
    await has(ui, /95% 95\.0k\/100\.?…?0?k?/)
    await has(ui, /█+ 95%/)
  })
})

test('finished agent is dimmed and can be cleared', async ($, on) => {
  seed(on, [agent(1, { status: 'completed', endTime: Date.now() - 1000 }), agent(2, { status: 'failed', endTime: Date.now() })], undefined)
  await each($, async ui => {
    await has(ui, /SUBAGENTS · 0(\/2| running · 2 total)/)
    await has(ui, /💾 general-purpose/)
    await has(ui, /💀 general-purpose/)
    expect((await ui.find({ type: 'Text', text: /💾 general-purpose/ }))?.props?.dimColor ?? true).toBeTruthy()
    expect(await ui.find({ type: 'Button' })).toBeTruthy()
  })
})

test('8 agents show +2 more', async ($, on) => {
  seed(on, Array.from({ length: 8 }, (_, i) => agent(i)), undefined)
  await each($, async ui => {
    await has(ui, /SUBAGENTS · 8(\/8| running · 8 total)/)
    await has(ui, /^\+2 more$/)
    await hasNot(ui, /task number 6/)
  })
})

test('long description and path stay clipped at narrow width', async ($, on) => {
  const long = 'x'.repeat(120)
  seed(
    on,
    [agent(1, { description: long })],
    { isRepo: true, branch: 'b', files: [{ code: 'M', path: 'a/'.repeat(40) + 'file.ts', add: 1, del: 1 }] },
  )
  await each($, async (ui, cols) => {
    const d = await ui.find({ type: 'Text', text: /^…?x+$/ })
    expect(d!.text.length).toBeLessThanOrEqual(cols)
    const p = await ui.find({ type: 'Text', text: /file\.ts/ })
    expect(p!.text.length).toBeLessThanOrEqual(cols)
  })
})

test('git repo with 12 files', async ($, on) => {
  seed(on, undefined, { isRepo: true, branch: 'feat/x', files: Array.from({ length: 12 }, (_, i) => file(i + 1)) })
  await each($, async ui => {
    await has(ui, /GIT · feat\/x/)
    await has(ui, /^\+2 more$/)
    await has(ui, /12 files · \+78 −12/)
    await hasNot(ui, /f11\.ts/)
  })
})

test('clean tree', async ($, on) => {
  seed(on, undefined, { isRepo: true, branch: 'main', files: [] })
  await each($, async ui => {
    await has(ui, /Working tree clean\./)
    await hasNot(ui, /files ·/)
  })
})

test('not a repository', async ($, on) => {
  seed(on, undefined, { isRepo: false, branch: '', files: [] })
  await each($, async ui => {
    await has(ui, /GIT · no repository/)
    await has(ui, /Not a git repository\./)
    await hasNot(ui, /Working tree clean/)
  })
})
