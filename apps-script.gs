/**
 * Vessel Log — Google Sheets backend
 * Paste this into Extensions ▸ Apps Script on a new Google Sheet, then deploy
 * as a web app (Execute as: Me · Who has access: Anyone).
 * Copy the resulting /exec URL into SHEET_URL in index.html.
 */

var SERVICE_INTERVAL = 100;   // must match CONFIG.SERVICE_INTERVAL in index.html

// Current meter reading of each engine on the day you start using this.
// Keys are "boatId|engineId". Must match baselineHours in index.html.
var BASELINE = {
  "whaler|main": 233,
  "force|port":  456,
  "force|stbd":  456,
  "barge|port":  20,
  "barge|stbd":  20
};

// Shared Drive folder (the one holding this Sheet) that ticket photos get
// filed into, in their own "Vessel Log Photos" subfolder.
var PHOTO_PARENT_ID = "1iqxPape_8_hUL0lb5DQNLD1W3C5fopfU";

var LOG_HEAD = ["Timestamp","EntryID","Date","Boat","Vessel","Engine","EngineLabel",
                "Hours","Operator","Activity","Location","Fuel","Notes","Crew"];
var TIC_HEAD = ["TicketID","Created","Boat","Component","Issue","Priority",
                "ReportedBy","Details","Auto","Status","Closed","BeforePhoto","AfterPhoto"];
var MAINT_HEAD = ["ItemID","Boat","Item","LastDone","IntervalMonths","Notes","PartNumber","OrderLink"];

function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.getRange(1, 1, 1, head.length).setFontWeight("bold").setBackground("#0c1e38").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < head.length) {
    // Sheet predates a column added since (e.g. BeforePhoto/AfterPhoto) — extend the header in place.
    var missing = head.slice(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing])
      .setFontWeight("bold").setBackground("#0c1e38").setFontColor("#ffffff");
  }
  return sh;
}

// Engine hours live in one tab per boat. Add a line here when you add a boat;
// anything not listed still works, it just gets a tab named after its id.
var BOAT_TABS = {
  "whaler": "Logs - Boston Whaler",
  "force":  "Logs - Force",
  "barge":  "Logs - Barge"
};

function logTabName_(boatId) { return BOAT_TABS[boatId] || ("Logs - " + boatId); }

function logSheet_(boatId) { return sheet_(logTabName_(boatId), LOG_HEAD); }

/**
 * Every per-boat log tab that exists. Matched by name prefix rather than by
 * BOAT_TABS so a tab for a retired or renamed boat is still read, never
 * silently dropped from totals.
 */
function allLogSheets_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().filter(function (sh) {
    return sh.getName().indexOf("Logs - ") === 0;
  });
}

/** Drive folder that holds ticket photos, created once on first use. */
function photoFolder_() {
  var parent = DriveApp.getFolderById(PHOTO_PARENT_ID);
  var it = parent.getFoldersByName("Vessel Log Photos");
  return it.hasNext() ? it.next() : parent.createFolder("Vessel Log Photos");
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doGet()  { return out_({ ok: true, ping: "Vessel Log backend is running." }); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var p = JSON.parse(e.postData.contents);

    if (p.action === "load")         return out_(load_());
    if (p.action === "log")          return out_(addLogs_(p.rows));
    if (p.action === "deleteLog")    return out_(deleteLogs_(p.entry));
    if (p.action === "ticket")       return out_(addTicket_(p.ticket));
    if (p.action === "deleteTicket") return out_(deleteTicket_(p.id));
    if (p.action === "close")        return out_(setStatus_(p.id, p.status));
    if (p.action === "photo")        return out_(setPhoto_(p.id, p.which, p.mime, p.data));
    if (p.action === "maint")        return out_(addMaint_(p.item));
    if (p.action === "maintDone")    return out_(setMaintDone_(p.id, p.date));
    if (p.action === "deleteMaint")  return out_(deleteMaint_(p.id));
    return out_({ ok: false, error: "Unknown action: " + p.action });

  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function ymd_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(v || "");
}

function load_() {
  var L = [];
  allLogSheets_().forEach(function (sh) {
    L = L.concat(sh.getDataRange().getValues().slice(1));
  });
  var T = sheet_("Tickets", TIC_HEAD).getDataRange().getValues().slice(1);
  var M = sheet_("Maintenance", MAINT_HEAD).getDataRange().getValues().slice(1);

  // Rows arrive grouped by tab, so sort the fleet back into one newest-first
  // stream rather than reversing per-sheet append order.
  L = L.filter(function (r) { return r[1]; });
  L.sort(function (a, b) {
    var ta = a[0] instanceof Date ? a[0].getTime() : 0;
    var tb = b[0] instanceof Date ? b[0].getTime() : 0;
    return tb - ta;
  });

  var logs = L.map(function (r) {
    return { entry: r[1], date: ymd_(r[2]), boat: r[3], boatName: r[4], engine: r[5],
             engineLabel: r[6], hours: Number(r[7]) || 0, operator: r[8],
             activity: r[9], location: r[10], fuel: r[11], notes: r[12], crew: r[13] || "" };
  });

  var tickets = T.filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), created: ymd_(r[1]), boat: r[2], part: r[3], title: r[4],
             priority: r[5], by: r[6], desc: r[7], auto: r[8] === true || r[8] === "TRUE" || r[8] === "Yes",
             status: r[9] || "open", closed: ymd_(r[10]), beforePhoto: r[11] || "", afterPhoto: r[12] || "" };
  }).reverse();

  var maintenance = M.filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), boat: r[1], item: r[2], lastDone: ymd_(r[3]),
             interval: Number(r[4]) || 0, notes: r[5] || "", part: r[6] || "", link: r[7] || "" };
  }).reverse();

  return { ok: true, logs: logs, tickets: tickets, maintenance: maintenance };
}

/** Hours already banked on one engine, baseline included. */
function totalFor_(boat, engine) {
  var rows = logSheet_(boat).getDataRange().getValues().slice(1);
  var sum = BASELINE[boat + "|" + engine] || 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][3] === boat && rows[i][5] === engine) sum += Number(rows[i][7]) || 0;
  }
  return sum;
}

function addLogs_(rows) {
  var made = [];

  // Rows already on each boat's tab, so a retried submission (e.g. after a
  // dropped connection) can't double-log hours. Read once per boat, not once
  // per row.
  var existingByBoat = {};

  rows.forEach(function (r) {
    var sh = logSheet_(r.boat);
    if (!existingByBoat[r.boat]) existingByBoat[r.boat] = sh.getDataRange().getValues().slice(1);

    var already = existingByBoat[r.boat].some(function (row) {
      return String(row[1]) === String(r.entry) && row[5] === r.engine;
    });
    if (already) return;

    var before = totalFor_(r.boat, r.engine);

    sh.appendRow([new Date(), r.entry, r.date, r.boat, r.boatName, r.engine, r.engineLabel,
                  Number(r.hours) || 0, r.operator, r.activity, r.location, r.fuel, r.notes, r.crew || ""]);

    // Every service interval crossed by this entry gets its own ticket.
    var after = before + (Number(r.hours) || 0);
    var first = (Math.floor(before / SERVICE_INTERVAL) + 1) * SERVICE_INTERVAL;
    for (var m = first; m <= after; m += SERVICE_INTERVAL) {
      var title = m + "-hour service — " + r.boatName +
                  (r.engineLabel && r.engineLabel !== "Engine" ? " " + r.engineLabel : "");
      addTicket_({
        id: "svc-" + r.boat + "-" + r.engine + "-" + m,
        created: r.date, boat: r.boat, part: r.engineLabel + " engine", title: title,
        priority: "Medium", by: "Automatic",
        desc: "Meter passed " + m + " h on " + r.date + " (" + r.operator + "). Scheduled service due.",
        auto: true, status: "open", closed: ""
      });
      made.push(title);
    }
  });

  return { ok: true, milestones: made };
}

/** Removes every row (one per engine) sharing this entry ID, across all boat tabs. */
function deleteLogs_(entry) {
  var removed = 0;
  allLogSheets_().forEach(function (sh) {
    var vals = sh.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][1]) === String(entry)) { sh.deleteRow(i + 1); removed++; }
    }
  });
  return { ok: true, removed: removed };
}

/**
 * One-time migration: splits the original single "Logs" tab into per-boat
 * tabs. Run it once from the editor (select migrateLogsToBoatTabs, press Run),
 * check the new tabs look right, then delete the old "Logs" tab by hand — this
 * deliberately doesn't delete it for you. Safe to run more than once: rows
 * already copied are skipped, not duplicated.
 */
function migrateLogsToBoatTabs() {
  var old = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
  if (!old) return "No old 'Logs' tab found — nothing to migrate.";

  var rows = old.getDataRange().getValues().slice(1).filter(function (r) { return r[1]; });
  var moved = 0, skipped = 0;

  rows.forEach(function (r) {
    var sh = logSheet_(r[3]);
    var existing = sh.getDataRange().getValues().slice(1);
    var already = existing.some(function (x) {
      return String(x[1]) === String(r[1]) && x[5] === r[5];
    });
    if (already) { skipped++; return; }
    sh.appendRow(r);
    moved++;
  });

  var msg = "Moved " + moved + " row(s); skipped " + skipped + " already present. " +
            "Check the new 'Logs - ...' tabs, then delete the old 'Logs' tab yourself.";
  Logger.log(msg);
  return msg;
}

function addTicket_(t) {
  var sh = sheet_("Tickets", TIC_HEAD);
  var ids = sh.getDataRange().getValues().slice(1).map(function (r) { return String(r[0]); });
  if (ids.indexOf(String(t.id)) !== -1) return { ok: true, duplicate: true };  // service ticket already exists

  sh.appendRow([t.id, t.created, t.boat, t.part, t.title, t.priority,
                t.by, t.desc, t.auto === true, t.status || "open", t.closed || "", "", ""]);
  return { ok: true };
}

/** Saves a before/after photo to Drive and records its URL on the ticket row. */
function setPhoto_(id, which, mime, base64) {
  var sh = sheet_("Tickets", TIC_HEAD);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      var bytes = Utilities.base64Decode(base64);
      var blob = Utilities.newBlob(bytes, mime, id + "-" + which + ".jpg");
      var file = photoFolder_().createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      // uc?export=view often redirects to an HTML viewer instead of raw image
      // bytes when hotlinked in <img> — the thumbnail endpoint serves the
      // actual image reliably.
      var url = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000";
      var col = which === "before" ? 12 : 13;
      sh.getRange(i + 1, col).setValue(url);
      return { ok: true, url: url };
    }
  }
  return { ok: false, error: "That ticket is no longer in the sheet." };
}

function deleteTicket_(id) {
  var sh = sheet_("Tickets", TIC_HEAD);
  var vals = sh.getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][0]) === String(id)) { sh.deleteRow(i + 1); return { ok: true, removed: true }; }
  }
  return { ok: true, removed: false };
}

function addMaint_(m) {
  var sh = sheet_("Maintenance", MAINT_HEAD);
  sh.appendRow([m.id, m.boat, m.item, m.lastDone, Number(m.interval) || 0,
                m.notes || "", m.part || "", m.link || ""]);
  return { ok: true };
}

/** Resets an item's last-done date — the "mark done" action for a recurring item. */
function setMaintDone_(id, date) {
  var sh = sheet_("Maintenance", MAINT_HEAD);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      sh.getRange(i + 1, 4).setValue(date);
      return { ok: true };
    }
  }
  return { ok: false, error: "That item is no longer in the sheet." };
}

function deleteMaint_(id) {
  var sh = sheet_("Maintenance", MAINT_HEAD);
  var vals = sh.getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][0]) === String(id)) { sh.deleteRow(i + 1); return { ok: true, removed: true }; }
  }
  return { ok: true, removed: false };
}

function setStatus_(id, status) {
  var sh = sheet_("Tickets", TIC_HEAD);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) {
      sh.getRange(i + 1, 10).setValue(status);
      sh.getRange(i + 1, 11).setValue(status === "done"
        ? Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd") : "");
      return { ok: true };
    }
  }
  return { ok: false, error: "That ticket is no longer in the sheet." };
}
