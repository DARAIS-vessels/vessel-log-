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
  "force|stbd":  456
};

var LOG_HEAD = ["Timestamp","EntryID","Date","Boat","Vessel","Engine","EngineLabel",
                "Hours","Operator","Activity","Location","Fuel","Notes"];
var TIC_HEAD = ["TicketID","Created","Boat","Component","Issue","Priority",
                "ReportedBy","Details","Auto","Status","Closed"];

function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.getRange(1, 1, 1, head.length).setFontWeight("bold").setBackground("#0c1e38").setFontColor("#ffffff");
    sh.setFrozenRows(1);
  }
  return sh;
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

    if (p.action === "load")      return out_(load_());
    if (p.action === "log")       return out_(addLogs_(p.rows));
    if (p.action === "deleteLog") return out_(deleteLogs_(p.entry));
    if (p.action === "ticket")    return out_(addTicket_(p.ticket));
    if (p.action === "close")     return out_(setStatus_(p.id, p.status));
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
  var L = sheet_("Logs", LOG_HEAD).getDataRange().getValues().slice(1);
  var T = sheet_("Tickets", TIC_HEAD).getDataRange().getValues().slice(1);

  var logs = L.filter(function (r) { return r[1]; }).map(function (r) {
    return { entry: r[1], date: ymd_(r[2]), boat: r[3], boatName: r[4], engine: r[5],
             engineLabel: r[6], hours: Number(r[7]) || 0, operator: r[8],
             activity: r[9], location: r[10], fuel: r[11], notes: r[12] };
  }).reverse();

  var tickets = T.filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), created: ymd_(r[1]), boat: r[2], part: r[3], title: r[4],
             priority: r[5], by: r[6], desc: r[7], auto: r[8] === true || r[8] === "TRUE" || r[8] === "Yes",
             status: r[9] || "open", closed: ymd_(r[10]) };
  }).reverse();

  return { ok: true, logs: logs, tickets: tickets };
}

/** Hours already banked on one engine, baseline included. */
function totalFor_(boat, engine) {
  var rows = sheet_("Logs", LOG_HEAD).getDataRange().getValues().slice(1);
  var sum = BASELINE[boat + "|" + engine] || 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][3] === boat && rows[i][5] === engine) sum += Number(rows[i][7]) || 0;
  }
  return sum;
}

function addLogs_(rows) {
  var sh = sheet_("Logs", LOG_HEAD);
  var made = [];

  rows.forEach(function (r) {
    var before = totalFor_(r.boat, r.engine);

    sh.appendRow([new Date(), r.entry, r.date, r.boat, r.boatName, r.engine, r.engineLabel,
                  Number(r.hours) || 0, r.operator, r.activity, r.location, r.fuel, r.notes]);

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

/** Removes every row (one per engine) sharing this entry ID. */
function deleteLogs_(entry) {
  var sh = sheet_("Logs", LOG_HEAD);
  var vals = sh.getDataRange().getValues();
  var removed = 0;
  for (var i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][1]) === String(entry)) { sh.deleteRow(i + 1); removed++; }
  }
  return { ok: true, removed: removed };
}

function addTicket_(t) {
  var sh = sheet_("Tickets", TIC_HEAD);
  var ids = sh.getDataRange().getValues().slice(1).map(function (r) { return String(r[0]); });
  if (ids.indexOf(String(t.id)) !== -1) return { ok: true, duplicate: true };  // service ticket already exists

  sh.appendRow([t.id, t.created, t.boat, t.part, t.title, t.priority,
                t.by, t.desc, t.auto === true, t.status || "open", t.closed || ""]);
  return { ok: true };
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
