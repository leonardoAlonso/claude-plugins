import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentSnap, GitFile, GitInfo, SessionFile } from '../types'

const PANE = 'side-panes'
const MAX_AGENTS = 6
const MAX_FILES = 10
const DONE = ['completed', 'failed', 'killed']

const agents = atom({ plugin: 'side-panes', key: 'agents' } as const, [], {
  shape: 'agents-1',
})
const gitAtom = atom(
  { plugin: 'side-panes', key: 'git' } as const,
  { isRepo: true, branch: '', root: '', files: [] },
  { shape: 'git-2' },
)
const filesAtom = atom({ plugin: 'side-panes', key: 'files' } as const, [], {
  shape: 'files-1',
})
const FILE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

const fmtTok = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n))
const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}
const bar = (pct: number, width = 10) => {
  const n = Math.min(width, Math.round((pct / 100) * width))
  return '█'.repeat(n) + '░'.repeat(width - n)
}
const clip = (s: string, w: number) => (s.length > w ? '…' + s.slice(s.length - w + 1) : s)

export const parseNumstat = (out: string) => {
  const m = new Map<string, { add: number; del: number }>()
  for (const l of out.split('\n').filter(Boolean)) {
    const [x, y, ...p] = l.split('\t')
    m.set(p.join('\t'), { add: Number(x) || 0, del: Number(y) || 0 })
  }
  return m
}

const open = async ($: any, asked: boolean) => {
  await $.ui.open({ id: PANE, title: 'Agents & Git', backgroundColor: 'transparent' })
  return asked
}

const refreshAgents = async ($: any) => {
  const live = await $.agent.list()
  const now = Date.now()
  await update($, agents, (list: AgentSnap[]) => {
    const byId = new Map(list.map(a => [a.id, a]))
    const seen = new Set<string>()
    for (const a of live) {
      seen.add(a.id)
      const prev = byId.get(a.id)
      const done = DONE.includes(a.status)
      byId.set(a.id, {
        id: a.id,
        type: a.type,
        description: a.description,
        model: a.model,
        effort: a.effort === undefined ? undefined : String(a.effort),
        tokens: a.tokenCount,
        window: a.contextWindowSize,
        status: a.status,
        startTime: a.startTime,
        endTime: done ? (prev?.endTime ?? now) : undefined,
      })
    }
    // Gone from the engine's list: keep the last snapshot, mark finished.
    for (const [id, a] of byId) {
      if (!seen.has(id) && !DONE.includes(a.status)) {
        byId.set(id, { ...a, status: 'completed', endTime: a.endTime ?? now })
      }
    }
    const next = [...byId.values()].sort((x, y) => y.startTime - x.startTime).slice(0, 100)
    return JSON.stringify(next) === JSON.stringify(list) ? list : next
  })
}

const refreshGit = async ($: any) => {
  const repo = await $.session.repo()
  const mine: SessionFile[] = await read($, filesAtom)
  const set = (info: GitInfo) =>
    update($, gitAtom, (old: GitInfo) => (JSON.stringify(old) === JSON.stringify(info) ? old : info))
  if (!repo) {
    await set({ isRepo: false, branch: '', root: '', files: [] })
    return
  }
  const root: string = repo.root
  const run = (argv: string[]) => $.process.run(argv, { cwd: root })
  const br = await run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = br.exitCode === 0 ? br.stdout.trim() : 'no commits'
  const rel = (f: string) => (f.startsWith(root + '/') ? f.slice(root.length + 1) : f)
  const inRepo = mine.filter(f => f.path.startsWith(root + '/'))
  if (inRepo.length === 0) {
    await set({ isRepo: true, branch, root, files: [] })
    return
  }
  const rels = inRepo.map(f => rel(f.path))
  const [st, ns] = await Promise.all([
    run(['git', 'status', '--porcelain=v1', '--', ...rels]),
    run(['git', 'diff', '--numstat', 'HEAD', '--', ...rels]),
  ])
  const stats = parseNumstat(ns.exitCode === 0 ? ns.stdout : '')
  const codes = new Map<string, string>()
  for (const l of st.stdout.split('\n').filter(Boolean)) {
    const c = l.slice(0, 2).trim()
    codes.set(l.slice(3).split(' -> ').pop() ?? '', c === '??' ? '?' : (c[0] ?? '·'))
  }
  const files: GitFile[] = []
  for (const f of inRepo) {
    const r = rel(f.path)
    const code = codes.get(r) ?? '·'
    let s = stats.get(r)
    if (!s && code === '?') {
      const u = await run(['git', 'diff', '--no-index', '--numstat', '--', '/dev/null', r])
      s = parseNumstat(u.stdout).values().next().value
    }
    files.push({ code, path: f.path, add: s?.add ?? 0, del: s?.del ?? 0 })
  }
  await set({ isRepo: true, branch, root, files })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'side-panes',
      description: 'Open the subagents and session files pane',
    })
    void open($, false)
    $.clock.every(2000, () => void refreshAgents($).catch(() => {}))
    $.clock.every(3000, () => void refreshGit($).catch(() => {}))
    void refreshAgents($).catch(() => {})
    void refreshGit($).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'side-panes' }, async $ => {
    await open($, true)
    return { text: 'Side panes opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const out = await next(e)
    void refreshAgents($).catch(() => {})
    return out
  })

  on('tool.call', async ($, e, next) => {
    const out = await next(e)
    const path = (e as any).file_path ?? (e as any).notebook_path
    if (FILE_TOOLS.includes((e as any).tool) && typeof path === 'string') {
      const now = Date.now()
      await update($, filesAtom, (list: SessionFile[]) => {
        const prev = list.find(f => f.path === path)
        const rest = list.filter(f => f.path !== path)
        return [{ path, edits: (prev?.edits ?? 0) + 1, last: now }, ...rest].slice(0, 200)
      })
    }
    void refreshGit($).catch(() => {})
    return out
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, agents)
    const g = await read($, gitAtom)
    const mine = await read($, filesAtom)
    const running = list.filter(a => !DONE.includes(a.status)).length
    const now = Date.now()
    const cols = e.props?.bodyColumns ?? 40
    const w = Math.max(10, cols - 12)
    const shown = list.slice(0, MAX_AGENTS)
    const stat = new Map(g.files.map(f => [f.path, f]))
    const rows = mine.map(f => ({ ...f, ...(stat.get(f.path) ?? { code: '·', add: 0, del: 0 }) }))
    const relOf = (f: string) => (g.root && f.startsWith(g.root + '/') ? f.slice(g.root.length + 1) : f)
    const add = rows.reduce((n, f) => n + f.add, 0)
    const del = rows.reduce((n, f) => n + f.del, 0)
    const colorOf = (c: string) =>
      c === 'M' ? 'yellow' : c === 'A' || c === '?' ? 'green' : c === 'D' ? 'red' : 'cyan'
    return (
      <Box flexDirection="column">
        <Text bold>
          {clip(cols < 34 ? `SUBAGENTS · ${running}/${list.length}` : `SUBAGENTS · ${running} running · ${list.length} total`, cols)}
        </Text>
        {list.length === 0 && <Text dimColor>No subagents yet.</Text>}
        {shown.map(a => {
          const done = DONE.includes(a.status)
          const pct = a.window ? Math.round((a.tokens / a.window) * 100) : 0
          const color = pct >= 90 ? 'red' : pct >= 70 ? 'yellow' : 'green'
          return (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor={done} bold={!done}>
                {clip(`${a.status === 'failed' || a.status === 'killed' ? '💀' : done ? '💾' : '👾'} ${a.type} · ${fmtTime((a.endTime ?? now) - a.startTime)}`, cols)}
              </Text>
              <Text dimColor>{clip(a.description, w + 4)}</Text>
              <Text dimColor={done}>
                {clip(`${a.model ?? '?'} · effort ${a.effort ?? '—'}`, cols)}
              </Text>
              <Text color={done ? undefined : color} dimColor={done}>
                {clip(`${bar(pct, Math.max(4, Math.min(10, cols - 17)))} ${pct}% ${fmtTok(a.tokens)}/${a.window ? fmtTok(a.window) : '?'}`, cols)}
              </Text>
            </Box>
          )
        })}
        {list.length > shown.length && <Text dimColor>+{list.length - shown.length} more</Text>}
        {list.some(a => DONE.includes(a.status)) && (
          <Box marginTop={1}>
            <Button
              onPress={() =>
                update($, agents, (l: AgentSnap[]) => l.filter(a => !DONE.includes(a.status)))
              }
            >
              clear finished
            </Button>
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{clip(`FILES · ${g.isRepo ? g.branch || 'detached' : 'no repository'}`, cols)}</Text>
          {rows.length === 0 && <Text dimColor>No files changed this session.</Text>}
          {rows.slice(0, MAX_FILES).map(f => (
            <Text>
              <Text color={colorOf(f.code)}>{f.code}</Text> {clip(relOf(f.path), w)}
              {(f.add || f.del) > 0 && (
                <Text dimColor>
                  {' '}+{f.add} −{f.del}
                </Text>
              )}
            </Text>
          ))}
          {rows.length > MAX_FILES && <Text dimColor>+{rows.length - MAX_FILES} more</Text>}
          {rows.length > 0 && (
            <Text dimColor>
              {rows.length} files · +{add} −{del}
            </Text>
          )}
          {rows.length > 0 && (
            <Box marginTop={1}>
              <Button onPress={() => update($, filesAtom, () => [])}>clear files</Button>
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
