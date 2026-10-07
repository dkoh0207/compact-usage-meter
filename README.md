# compact-usage-meter

A Claude Code mod that shows, on a row under the prompt's hint line:

- **context**: how full the conversation's context window is
- **session-usage**: your 5-hour usage limit, with the time until it resets
- **weekly-usage**: your 7-day usage limit, with the time until it resets

![The meter under the prompt's hint line: context 12%, session-usage 42% resetting in 3h34m, weekly-usage 10% resetting in 4d23h](docs/screenshot.png)

Each meter has its own color. A percentage turns yellow from 50% and red above 80%, and you get a toast when a limit reaches 80% and 95%. The countdowns refresh once a minute.

On narrow terminals and split panes, the row steps down to shorter forms. First the bars shrink, then they're dropped, then the reset times, and finally only context is left.

## Install

In Claude Code, run:

```
/plugin install compact-usage-meter --marketplace https://github.com/dkoh0207/compact-usage-meter.git
```

The short form `--marketplace dkoh0207/compact-usage-meter` works too.

To try it for one session without installing, clone the repository and start Claude Code with it:

```
git clone https://github.com/dkoh0207/compact-usage-meter.git
claude --plugin-dir compact-usage-meter
```

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
