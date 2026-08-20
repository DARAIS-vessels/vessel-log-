# Vessel Log

Engine hour and repair logging for a small research vessel fleet. A single-file
PWA that saves to a Google Sheet. No sign-in, no build step, free to run.

Operators log a trip in under a minute from their phone. Engine hours accrue per
engine, and a service ticket opens automatically every 100 hours.

## Fleet

- **Boston Whaler** — 18′, single Tohatsu
- **Force** — 22′, twin Yamaha, logged as separate engines

## Files

| File | What it is |
|---|---|
| `index.html` | The entire app |
| `apps-script.gs` | Google Sheets backend — paste into the sheet's script editor |
| `SETUP.md` | Deployment steps |
| `CLAUDE.md` | Project context for Claude Code |

## Running it

Open `index.html` in a browser. With no sheet connected it runs in demo mode:
fully clickable, nothing saves.

To go live, follow `SETUP.md` — about fifteen minutes.

## Editing

Fleet, operators, service interval, and the sheet URL are all in the `CONFIG`
block at the top of `index.html`. Adding a boat is four lines.

## Status

Demo mode. Not yet deployed.
