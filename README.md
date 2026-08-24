# AIS Vessel Ledger

Engine hour, maintenance, and repair logging for a small research vessel fleet.
A single-file PWA that saves to a Google Sheet. No sign-in, no build step, free
to run.

Live at **https://darais-vessels.github.io/vessel-log-/**

Operators log a trip in under a minute from their phone. Engine hours accrue per
engine, a service ticket opens automatically every 100 hours, and calendar-based
maintenance (batteries, zincs, safety gear) is tracked separately with due dates.
Repair tickets support before/after photos, filed to a Shared Drive folder.

## Fleet

- **Boston Whaler** — 18′, single Tohatsu
- **Force** — 22′, twin Yamaha, logged as separate engines

## Files

| File | What it is |
|---|---|
| `index.html` | The entire app |
| `apps-script.gs` | Google Sheets backend — paste into the sheet's script editor |
| `assets/` | Logo images for the header and home-screen icon |
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

Live and in use. See `CLAUDE.md` for full current state and architecture notes.
