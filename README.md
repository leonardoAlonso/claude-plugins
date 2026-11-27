# side-panes

A Claude Code mod that adds one pane at the right of the chat with two stacked sections:

- **Subagents**: model, effort and context usage for every subagent launched in the session. Rows stay after the subagent finishes (👾 running, 💾 finished, 💀 failed); `clear finished` removes them.
- **Git**: branch and changed files with status and `+added −removed` counts, refreshed every few seconds and after each tool call.

## Use

Install or load the folder as a mod (for example `claude --plugin-dir <this folder>`), then run `/side-panes`. The pane docks at the right in a fullscreen terminal of at least 110 columns.

## Develop

    claude plugin validate .
    claude plugin test .
