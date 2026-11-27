export type AgentSnap = {
  id: string
  type: string
  description: string
  model?: string
  effort?: string
  tokens: number
  window?: number
  status: string
  startTime: number
  endTime?: number
}
export type GitFile = { code: string; path: string; add: number; del: number }
export type GitInfo = { isRepo: boolean; branch: string; files: GitFile[] }

declare module 'claude-code' {
  interface PluginState {
    'side-panes': { agents: Shaped<AgentSnap[]>; git: Shaped<GitInfo> }
  }
}
