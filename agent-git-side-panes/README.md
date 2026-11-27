# agent-git-side-panes

A Claude Code mod that adds one pane at the right of the chat with two stacked sections:

- **Subagents**: model, effort and context usage (bar, %, tokens) for every subagent launched in the session. Rows stay after the subagent finishes (👾 running, 💾 finished, 💀 failed); `clear finished` removes them.
- **Git**: branch and changed files with status letter and `+added −removed` counts, refreshed every few seconds and after each tool call.

## Install

Option 1, from the marketplace in this repo:

    /plugin marketplace add leonardoAlonso/claude-plugins
    /plugin install side-panes@leonardo-plugins

Option 2, from a local clone:

    git clone git@github.com:leonardoAlonso/claude-plugins.git
    claude --plugin-dir claude-plugins/agent-git-side-panes

## Use

Run `/side-panes` to open the pane. It docks at the right in a fullscreen terminal of at least 110 columns; below that it is not drawn. The pane also opens by itself at session start from 144 columns.

## Develop

    claude plugin validate agent-git-side-panes
    claude plugin test agent-git-side-panes
