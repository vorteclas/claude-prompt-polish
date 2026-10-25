# prompt-polish

A Claude Code mod that has Haiku rewrite every prompt you send, fixing grammar and turning rambling text into clear, ordered instructions, before Claude reads it. Like Wispr Flow, minus the voice.

- The rewritten prompt is shown in a band above the prompt box, with a **Hide** button.
- Your original wording is passed to Claude alongside the rewrite, and wins if the two disagree.
- Start a prompt with `::` to send it exactly as typed.
- `/polish off` and `/polish on` turn it off and on (remembered across sessions).
- Slash commands, prompts under 4 words, and messages from background tasks or other sessions are left alone.
- If Haiku fails or takes longer than 15 seconds, the prompt is sent as typed.

Each prompt waits for one Haiku call (usually a second or two), billed like any other model call.

## Install

At the prompt of a terminal session:

```
/plugin install prompt-polish --marketplace vorteclas/claude-prompt-polish
```

From a shell:

```bash
claude plugin install prompt-polish --marketplace vorteclas/claude-prompt-polish
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `vorteclas/claude-prompt-polish`, then Add plugin.
