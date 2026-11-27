# claude-plugins

Personal Claude Code plugins and mods.

| Folder | What it is |
| --- | --- |
| [`agent-git-side-panes`](./agent-git-side-panes) | A pane at the right of the chat: subagents (context, model, effort, kept after they finish) above git changes |

## Install

From Claude Code (needs access to this repo; it is private, so your GitHub SSH auth must work):

    /plugin marketplace add leonardoAlonso/claude-plugins
    /plugin install side-panes@leonardo-plugins

Then run `/side-panes`. See the plugin's own README for details.
