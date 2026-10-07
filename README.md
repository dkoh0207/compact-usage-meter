# compact-usage-meter

A Claude Code mod that shows, on a row under the prompt's hint line:

- **context**: how full the conversation's context window is
- **session-usage**: your 5-hour usage limit, with the time until it resets
- **weekly-usage**: your 7-day usage limit, with the time until it resets

```
⏵⏵ auto mode on (shift+tab to cycle) · ← for agents

context ▰▱▱▱▱▱▱▱ 13% │ session-usage ▰▱▱▱▱▱▱▱ 10% (4h15m) │ weekly-usage ▱▱▱▱▱▱▱▱ 6% (5d00h)
```

Each meter has its own color. A percentage turns yellow from 50% and red above 80%, and you get a toast when a limit reaches 80% and 95%. The countdowns refresh once a minute.

On narrow terminals and split panes, the row steps down to shorter forms. First the bars shrink, then they're dropped, then the reset times, and finally only context is left.

## Install

```
/plugin install compact-usage-meter --marketplace OWNER/compact-usage-meter
```

Answer `y` to add the marketplace, then pick a scope. The meter shows from the next prompt on.

## Settings

These constants are at the top of the files in `hooks/`:

| Constant | File | What it does |
| --- | --- | --- |
| `GAP` | `register.tsx` | Blank rows between the hint line and the meter (default `1`) |
| `GLYPHS` | `format.ts` | `'blocks'` draws `▰▱`; `'ascii'` draws `#-` for fonts that render the blocks badly |
| `AMBIGUOUS_WIDTH` | `format.ts` | Set to `2` if your locale draws `▰▱` double-width (some East Asian setups) |

## Development

```
claude plugin validate .
claude plugin test .
```

To run a local checkout in a session, start Claude Code with `claude --plugin-dir <path to this folder>`.
