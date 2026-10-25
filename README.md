# prompt-polish

A Claude Code mod that rewrites every prompt you send into the prompt you meant to write, before Claude reads it. Like Wispr Flow, minus the voice.

It does more than fix grammar. It applies the prompting practices Anthropic recommends for current Claude models: it leads with what you want, keeps your reasons next to your requests, names the file or feature that "it" and "that" refer to, separates pasted logs and code from instructions, and uses a short list only when you asked for several things. It never adds requirements you didn't ask for, never answers your prompt, and keeps questions as questions.

- **Sees the conversation.** The last several turns go along with your prompt, so references like "do the same for the other one" get resolved correctly.
- **Uses the prompt cache.** The guide and the conversation turns are sent as a stable, append-only prefix with cache marks, so each prompt reuses what the previous one cached instead of paying for a fresh cache every time.
- **Shows its work.** The rewritten prompt appears in a band above the prompt box, with how many tokens came from the cache, and a **Hide** button.
- **Keeps your words.** Your original prompt is passed to Claude alongside the rewrite, and wins if the two disagree.
- Start a prompt with `::` to send it exactly as typed.
- `/polish off` and `/polish on` turn it off and on (remembered across sessions).
- Slash commands, prompts under 4 words, and messages from background tasks or other sessions are left alone.
- If the polishing call fails or takes longer than 30 seconds, the prompt is sent as typed.

## Choosing the model

When you install the mod you pick which model does the polishing:

| Option | Trade-off |
| --- | --- |
| `sonnet` (default) | Best balance of quality and speed |
| `haiku` | Fastest and cheapest |
| `opus` | Most careful, slowest |

Change it later in `/config` under the plugin's options. Each prompt waits for one call to that model, billed like any other model call.

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
