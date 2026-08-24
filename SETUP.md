# Vessel Log — setup

Right now `index.html` runs in **demo mode**: fully usable, but nothing saves. Four steps take it live.

## 1. Make the sheet

New Google Sheet in your shared Drive — name it something like *Vessel Log Data*. Don't add tabs or headers; the script builds `Logs` and `Tickets` on first write.

## 2. Add the script

In that sheet: **Extensions ▸ Apps Script**. Delete the starter code, paste all of `apps-script.gs`, save.

Before deploying, set `BASELINE` near the top to each engine's **current hour meter reading**. Keys are `boatId|engineId`:

```js
var BASELINE = {
  "whaler|main": 412.5,
  "force|port":  1203.0,
  "force|stbd":  1198.4
};
```

## 3. Deploy it

**Deploy ▸ New deployment ▸ Web app**

- Execute as: **Me**
- Who has access: **Anyone**

Authorize when prompted. Google shows an "unverified app" warning — that's normal for your own script; click **Advanced ▸ Go to (project)**.

Copy the **Web app URL** (ends in `/exec`).

> If your institution blocks "Anyone" access, set it to **Anyone within [institution]** instead. Operators then need to be signed into their institutional Google account on their phone, which usually they already are. If Apps Script is blocked entirely, tell me and I'll swap the backend — the app talks to it through one function, so it's a contained change.

## 4. Wire up the app

In `index.html`, top of the file:

```js
SHEET_URL: "https://script.google.com/macros/s/AKfy…/exec",
```

Set the matching `baselineHours` for each engine in the same block. The status light in the header turns green when it's connected.

## 5. Host it

Any static host works — it's one file, no build step.

- **GitHub Pages** — free, five minutes. New repo, upload `index.html`, Settings ▸ Pages ▸ deploy from `main`. You get `https://you.github.io/vessel-log/`.
- **Netlify Drop** — free, drag the folder onto netlify.com/drop.
- **Your lab web server** — drop it in a public directory.

Google Drive can't host this; it won't serve HTML as a live page.

Once it's on a real URL, the **Fleet** tab shows a QR code pointing at it. Print it and tape it in the truck or the dock box.

## Installing on phones

- **iPhone:** open in Safari (not Chrome) ▸ Share ▸ Add to Home Screen
- **Android:** open in Chrome ▸ ⋮ ▸ Install app

It launches full screen with no address bar.

## Changing the fleet or crew

Everything editable lives in the `CONFIG` block at the top of `index.html`: boats, engines, operators, service interval, fuel steps. Adding a third boat is four lines. If you change engine IDs after logging data, update `BASELINE` in the script to match, or those hours orphan.

## How the automatic tickets work

Hours are logged **per engine** — one sheet row each, so the Force writes two rows per trip and each Yamaha accrues separately. When an engine's running total crosses 100, 200, 300 and so on, the script opens a service ticket tagged *Scheduled*. The check runs server-side, so two operators logging at once can't double up, and the ticket ID is derived from the milestone itself — the same one can never be created twice.

## Known limits

- Anyone with the URL can log entries and read data — same for anyone with a photo's link. Fine for an internal tool with no sign-in; don't put anything sensitive in it.
- No offline queue — an entry submitted with no signal fails and says so. Operators log at the dock or back at the lab.

## If you add ticket photos

The backend files photos to a Drive folder it creates itself the first time
someone uploads one. The first time the script actually touches Drive, Google
won't prompt for that permission automatically from a redeploy — run any
function that reaches `photoFolder_()` once, manually, in the Apps Script
editor (Run ▷), and approve the Drive permission when it asks. After that,
the deployed web app has it too.
