# Vessel Log — project context

Context for Claude Code. Read before making changes.

## What this is

A PWA for boat operators at a marine science research group (Hawai'i DAR) to
log engine hours, track calendar-based maintenance, and open repair tickets
after field work. Phone-first, no sign-in, free to run. Branded **AIS Vessel
Ledger** in the UI — the repo/file names stay `vessel-log`, that's a separate
decision, don't rename the repo to match. Data goes to a Google Sheet via
Apps Script.

## Current status: live and in use

Deployed and working, not demo mode:

- **Live URL:** https://darais-vessels.github.io/vessel-log-/ (GitHub Pages,
  repo `DARAIS-vessels/vessel-log-`)
- **Backend:** Google Apps Script web app, `Execute as: Me`, `Anyone` access —
  worked fine at this institution, no fallback needed.
- **Baselines set:** `whaler|main` 233, `force|port` 456, `force|stbd` 456,
  `barge|port` 0, `barge|stbd` 0 (must match between `BASELINE` in the script
  and `baselineHours` in `index.html` — see invariants below). The barge's
  baselines are placeholders — ask the owner for its real meter readings.
- **Photos** file into a Shared Drive folder (`PHOTO_PARENT_ID` in
  `apps-script.gs`), not the developer's personal Drive — a Workspace admin
  policy blocked moving a My-Drive folder into the Shared Drive after the
  fact, so the script creates the `Vessel Log Photos` subfolder directly
  inside the Shared Drive from the start.

Demo mode (`CONFIG.SHEET_URL` empty) still works and is exercised before every
push — see Working notes.

## Requirements as stated by the owner

Locked in:

- **PWA, not an app store app.** Operators add it to their home screen or scan a QR code.
- **No offline capability needed.** Operators log at the dock or back at the lab.
- **No sign-in.** Open access, internal tool.
- **Free.** No paid hosting, no paid database.
- **Dark blue palette**, varying shades.
- **Simple and fast.** A tired operator finishing field work should log a trip in under a minute.
- **Automatic service tickets** at every 100 engine hours (100, 200, 300…).

Built since v1, at the owner's request (not unprompted scope creep):

- Deleting log entries, tickets, and maintenance items, each with a confirm prompt
- Before/after photo attachments on repair tickets, via Drive
- Crew field (multi-select, same name pool as Captain) alongside the single-select Captain (renamed from "Operator")
- Calendar-based Maintenance tracking (batteries, zincs, etc.) — separate from the hour-based service tickets
- Auto-mirror of Force's port hours into starboard while typing (still overridable)
- Rebrand to "AIS Vessel Ledger" with a DAR logo (header + home-screen icon)

Explicitly deferred, do not build unprompted:

- Offline queue
- Authentication
- Export/summary views, a third boat — mentioned as possible future interest, not requested yet
- Anything else the owner hasn't asked for — they want to grow this deliberately

## Fleet

| Boat | Length | Engines |
|---|---|---|
| Boston Whaler | 18′ | single Tohatsu (`main`) |
| Force | 22′ | twin Yamaha (`port`, `stbd`) |
| Barge | 30′ | twin Honda 50 (`port`, `stbd`) — used much less often |

Twin engines are the main thing shaping the data model. Hours are logged **per
engine** — one sheet row each — so the Force writes two rows per trip and each
Yamaha reaches its 100-hour milestones independently. Typing port hours
auto-fills starboard live (until starboard is edited directly — see
`engineInputs()`); the "Same as port" button still works and resumes
auto-follow.

## Crew roster

Jesse B., Kate G., Andrew G., Landon K., Sydney C., Lev G., Julio L., Paige W.,
Nicole M., Lauren K., Elizabeth M., Hendrikje J.

`CONFIG.OPERATORS` — the name is legacy, but it feeds **both** the single-select
Captain dropdown and the multi-select Crew chips on the Log tab, so don't
rename it to something Captain-specific. The Crew chips sit behind a collapsed
summary button (`#crew-toggle` / `crewSummary()`) that reads "Kate G., Jesse B.
+2" — the roster outgrew an always-open chip grid. A native multi-select was
considered and rejected: it hides the selection and is worse on a phone. Activity and location are structured
(a dropdown of known spots plus "Other…" free text) by request — the owner
didn't want fully-open categories once the common spots became clear.

## Files

```
index.html      The whole app. One file, no build step, no dependencies
                except a CDN QR library.
apps-script.gs  Google Apps Script backend. Lives in the Google Sheet's
                script editor. This copy is the source of truth — edit here,
                paste into Google, redeploy a new version.
assets/         logo-emblem.png (header, transparent) and logo-icon.png
                (home-screen icon / favicon, square on navy) — cropped from
                the DAR logo. Referenced by relative path, so they only
                resolve when served over http(s), not opened as a bare file.
SETUP.md        Deployment steps for the owner.
```

## Architecture

**index.html** — a `CONFIG` block at the top holds everything the owner edits:
sheet URL, service interval, fleet, operators, fuel steps. Below it, `S` is app
state; `api()` is the network call — it times out at 15s and retries up to 3
attempts on a genuine network failure, but never retries a response the sheet
actually rejected (`err.serverRejected`); `demo()` mirrors the backend
in-memory so the app is fully usable before the sheet is wired up. Three views
(Log / Repairs / Fleet) toggle with `.on`. Rendering is `paint()` calling
`meters()`, `ticketList()`, `maintList()`, `recent()`, `badge()`.

**apps-script.gs** — `doPost` actions: `load`, `log`, `deleteLog`, `ticket`,
`deleteTicket`, `close`, `photo`, `maint`, `maintDone`, `deleteMaint`. Three
sheet tabs — `Logs`, `Tickets`, `Maintenance` — each created on first write,
and `sheet_()` also self-extends a tab's header row if `*_HEAD` has grown
since (e.g. `Crew`, `BeforePhoto`/`AfterPhoto` were added to existing sheets
this way) — new columns always go at the **end** of a `*_HEAD` array, never
inserted in the middle, or existing rows' data shifts out of alignment with
their header.

### Invariants — don't break these

1. **Milestone tickets are created server-side, in `addLogs_`.** Never move this
   to the client. Server-side plus `LockService` is what stops two operators
   logging simultaneously from producing duplicates. The ticket ID is derived
   from the milestone itself (`svc-force-port-200`), and `addTicket_` rejects
   duplicate IDs — so the same milestone can never open twice, even on a retry.

2. **`BASELINE` in the script and `baselineHours` in `index.html` must agree.**
   These are the engines' meter readings on day one; totals are baseline plus
   logged hours. If they drift, the app and sheet disagree about when service is
   due. Changing an engine's ID after data exists orphans its hours.

3. **`addLogs_` is idempotent per entry+engine.** It checks existing rows
   before appending, so a client-side retry after a dropped connection can't
   double-log hours. Any new non-idempotent write action needs the same
   guard before it's safe for `api()` to retry automatically.

4. **Photo URLs must use `drive.google.com/thumbnail?id=...&sz=w1000`,
   not `uc?export=view`.** The latter often redirects to an HTML viewer page
   instead of raw image bytes when hotlinked in an `<img>` tag — shows as a
   broken image. Learned this the hard way; don't revert it.

Also: the fetch uses `Content-Type: text/plain` deliberately. It avoids a CORS
preflight that Apps Script won't answer. Don't "fix" it to `application/json`.

## Design

Dark blue only: `--abyss` `#050f1e` background through `--raise` `#16355a`, with
`--buoy` `#57a5f5` as the accent. Amber `--beacon` means service due, red
`--fault` is a high-priority ticket, green `--ok` is repaired/fine (also reused
for maintenance items that aren't due soon).

The signature element is the **hour meter** on the Fleet tab — a big circular
ring gauge with the boat name, odometer-style reading, and time-to-service all
centered inside it, going amber (ring + text) in the final 10 hours. It's the
thing the owner looks at before scheduling maintenance. Keep it central if the
UI gets reworked — this went through two iterations (linear bar → small ring →
large ring with info inside) before landing here, so it's a considered choice,
not a default.

Type: system sans for UI, monospace for anything numeric or instrument-like
(hour readings, labels, timestamps). The monospace/uppercase placard labels are
the nautical vernacular running through the interface — keep that consistent.

Targets are large for wet hands on a boat. Every input has a visible focus ring;
`prefers-reduced-motion` is respected.

Logo: DAR (Hawai'i Division of Aquatic Resources) emblem, white/transparent
artwork made for a dark ground — matches the app's navy theme by luck as much
as design. Don't tint or recolor it.

## Working notes

- Test on a phone viewport. It's the only one that matters.
- Demo mode should stay working after every change — it's how the owner
  previews things, and how you should verify a change before it goes live:
  temporarily blank `SHEET_URL` in a scratch copy (never the real file) to
  force demo mode, or override `S.live = false` in the console.
- **Preview before pushing, always.** Serve the folder locally (no Python/
  Node available in this environment — use a small `HttpListener`-based
  PowerShell script; see prior session transcripts for the pattern) rather
  than relying on the file:// preview pane, which loads local files as a
  `data:` URI and breaks relative asset paths (`assets/*.png`, `apps-script.gs`
  links). Verify interactions programmatically (dispatch real `input`/`change`
  events, don't just set `.value`) before taking a screenshot.
- If you edit `apps-script.gs`, the owner needs to paste it into the Google
  editor and redeploy a new version (Deploy ▸ Manage deployments ▸ pencil ▸
  New version ▸ Deploy) — that copy doesn't update itself. For long pastes,
  don't rely on copying out of the chat UI — it truncates. Instead run
  `Get-Content -Raw apps-script.gs | Set-Clipboard` and have them paste from
  the real clipboard.
- **Adding a new Apps Script service (e.g. `DriveApp`) needs a manual
  re-authorization**, and it doesn't reliably prompt from redeploying or from
  running an unrelated function (like `doGet`) in the editor — it only
  triggers reliably by running a function that's actually reachable to that
  service. If in doubt, add a temporary zero-argument function that calls
  the new service, run it once to get the consent prompt, then delete it.
- This network's DNS is flaky for `git push` specifically (fails with
  "could not resolve host" intermittently, even though `nslookup` succeeds at
  the same moment) — just retry the push a few times, it's not a real problem
  with the remote or the credentials.
- Google commit-message heredocs: avoid embedding literal double quotes in a
  `git commit -m @'...'@` PowerShell here-string — it's broken the outer
  quoting before. Paraphrase around the quote instead.

## Known limitations (deliberate, not bugs)

- Deleting a log entry that crossed a 100-hour milestone doesn't retroactively
  remove the auto-generated service ticket.
- Deleting a ticket doesn't delete its Drive photos — they become orphaned
  files in `Vessel Log Photos`, not linked from anywhere.
- Anyone with the app URL can log entries and read data; anyone with a photo's
  link can view it. Fine for an internal tool with no sign-in, consistent with
  the rest of the sheet's access model — don't put anything sensitive in it.

## Likely next steps

Roughly the owner's order of interest, though they'll steer:

- Export or summary views for reporting (hours per operator/month, etc.)
- Possibly a third boat
- Anything else — ask before building; this project grows deliberately
