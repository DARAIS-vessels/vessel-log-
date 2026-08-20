# Vessel Log — project context

Context for Claude Code. Read before making changes.

## What this is

A PWA for boat operators at a marine science research group to log engine hours
and open repair tickets after field work. Phone-first, no sign-in, free to run.
Data goes to a Google Sheet via Apps Script.

## Requirements as stated by the owner

Locked in:

- **PWA, not an app store app.** Operators add it to their home screen or scan a QR code.
- **No offline capability needed.** Operators log at the dock or back at the lab.
- **No sign-in.** Open access, internal tool.
- **Free.** No paid hosting, no paid database.
- **Dark blue palette**, varying shades.
- **Simple and fast.** A tired operator finishing field work should log a trip in under a minute.
- **v1 scope:** engine hours, operator, activity, fuel level. Plus repair tickets.
- **Automatic service tickets** at every 100 engine hours (100, 200, 300…).

Explicitly deferred, do not build unprompted:

- Photo attachments on tickets
- Offline queue
- Authentication
- Anything the owner hasn't asked for — they want to grow this deliberately

## Fleet

| Boat | Length | Engines |
|---|---|---|
| Boston Whaler | 18′ | single Tohatsu (`main`) |
| Force | 22′ | twin Yamaha (`port`, `stbd`) |

Twin engines are the main thing shaping the data model. Hours are logged **per
engine** — one sheet row each — so the Force writes two rows per trip and each
Yamaha reaches its 100-hour milestones independently.

## Operators

Jesse B., Kate G., Andrew G., Landon K., Sydney C., Lev G., Julio L., Paige W.,
Nicole M., Lauren K.

Dropdown, in that order. Activity and location are free text by request — the
owner didn't want fixed categories.

## Files

```
index.html      The whole app. One file, no build step, no dependencies
                except a CDN QR library.
apps-script.gs  Google Apps Script backend. Lives in the Google Sheet's
                script editor. This copy is the source of truth — edit here,
                paste into Google.
SETUP.md        Deployment steps for the owner.
```

## Architecture

**index.html** — a `CONFIG` block at the top holds everything the owner edits:
sheet URL, service interval, fleet, operators, fuel steps. Below it, `S` is app
state; `api()` is the single network call; `demo()` mirrors the backend
in-memory so the app is fully usable before the sheet is wired up. Three views
(Log / Repairs / Fleet) toggle with `.on`. Rendering is `paint()` calling
`meters()`, `ticketList()`, `recent()`, `badge()`.

**apps-script.gs** — `doPost` handles four actions: `load`, `log`, `ticket`,
`close`. Two sheet tabs, `Logs` and `Tickets`, created on first write.

### Two invariants — don't break these

1. **Milestone tickets are created server-side, in `addLogs_`.** Never move this
   to the client. Server-side plus `LockService` is what stops two operators
   logging simultaneously from producing duplicates. The ticket ID is derived
   from the milestone itself (`svc-force-port-200`), and `addTicket_` rejects
   duplicate IDs — so the same milestone can never open twice, even on a retry.

2. **`BASELINE` in the script and `baselineHours` in `index.html` must agree.**
   These are the engines' meter readings on day one; totals are baseline plus
   logged hours. If they drift, the app and sheet disagree about when service is
   due. Changing an engine's ID after data exists orphans its hours.

Also: the fetch uses `Content-Type: text/plain` deliberately. It avoids a CORS
preflight that Apps Script won't answer. Don't "fix" it to `application/json`.

## Design

Dark blue only: `--abyss` `#050f1e` background through `--raise` `#16355a`, with
`--buoy` `#57a5f5` as the accent. Amber `--beacon` means service due, red
`--fault` is a high-priority ticket, green `--ok` is repaired.

The signature element is the **hour meter** on the Fleet tab — odometer-style
digits with a progress bar to the next service, going amber in the final 10
hours. It's the thing the owner looks at before scheduling maintenance. Keep it
central if the UI gets reworked.

Type: system sans for UI, monospace for anything numeric or instrument-like
(hour readings, labels, timestamps). The monospace/uppercase placard labels are
the nautical vernacular running through the interface — keep that consistent.

Targets are large for wet hands on a boat. Every input has a visible focus ring;
`prefers-reduced-motion` is respected.

## Current status

Demo mode. `CONFIG.SHEET_URL` is empty, so it runs on in-memory sample data and
nothing saves. Wiring it up means: create the sheet, paste the script, deploy as
a web app, put the `/exec` URL in `SHEET_URL`, set the real baselines both places.

**Open question:** whether the institution's Google Workspace allows Apps Script
web apps deployed to "Anyone." If it's blocked, the fallback is "Anyone within
[institution]" — operators then need to be signed into their institutional
account. If Apps Script is blocked outright, the backend gets swapped; the app
touches it only through `api()`, so that's a contained change.

## Working notes

- Test on a phone viewport. It's the only one that matters.
- Demo mode should stay working after every change — it's how the owner previews things.
- If you edit `apps-script.gs`, remind the owner to paste it into the Google
  editor. That copy doesn't update itself, and drift between the two is the
  easiest way to get confused about what's actually running.

## Likely next steps

Roughly the owner's order of interest, though they'll steer:

- Get it live and hosted, verify Apps Script works at the institution
- Photo attachments on tickets (via Drive, not the sheet)
- Maintenance history per engine — what was done at each service
- Export or summary views for reporting
- Possibly a third boat
