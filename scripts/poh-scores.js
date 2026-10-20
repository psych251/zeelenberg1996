#!/usr/bin/env node
/*
 * Fetch Proof of Human bot-risk scores for an exported experiment (docs.poh.org).
 *
 *   npm run export -- --experiment zeelenberg1996-pilot-b --key ~/keys/<firebase-key>.json
 *   npm run poh-scores -- --experiment zeelenberg1996-pilot-b --key-file ~/keys/poh-secret-key.txt
 *
 * Run it after the export: it reads the Proof of Human session ids from the export's
 * identifiers.csv and asks the Proof of Human API for each session's report.
 *
 * Authentication: the API needs your SECRET key (it starts with "sk-"), from the Proof of Human
 * dashboard's "Secret keys" page. Save it in a text file OUTSIDE the repo, the key as the only
 * line, and pass --key-file, or set POH_SECRET_KEY. Never put it in the page or commit it: it
 * can read every session in your account. The public site key in experiment.js is a different
 * key and cannot read anything.
 *
 * Output: data/raw/<experiment>/poh.csv, one row per participant document that has a session id:
 *   participant_id, risk_score (0-100, higher = more likely a bot), recommended_action,
 *   risk_explanation, every biometric_* and device_* check ("Detected", "Not detected",
 *   "Unknown"), and poh_error when a report could not be fetched.
 * It contains no session ids, user ids or device fingerprints (visitor_id), so it can be
 * committed with the other CSVs.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const experimentId = arg("experiment", null);
if (!experimentId) {
  console.error("Usage: npm run poh-scores -- --experiment <id> --key-file <path> [--dir <export dir>]");
  process.exit(1);
}
const dir = arg("dir", path.join("data", "raw", experimentId));
const keyFile = arg("key-file", null);

let secret = process.env.POH_SECRET_KEY || "";
if (keyFile) {
  const file = keyFile.replace(/^~(?=$|\/)/, os.homedir());
  if (!fs.existsSync(file)) {
    console.error("No file at the --key-file path.");
    process.exit(1);
  }
  secret = fs.readFileSync(file, "utf8").trim();
}
if (!secret) {
  console.error("No secret key. Pass --key-file <path> or set POH_SECRET_KEY.");
  process.exit(1);
}
if (secret.startsWith("pub-")) {
  console.error("That is the public site key. The API needs the secret key (it starts with \"sk-\").");
  process.exit(1);
}

// Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, newlines inside quotes).
function readCsv(file) {
  const text = fs.readFileSync(file, "utf8");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return body.map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])));
}

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function fetchReport(sessionId) {
  const url = "https://api.poh.org/v1/sessions/" + encodeURIComponent(sessionId) + "/report";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: "Bearer " + secret },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return { report: await res.json() };
      // Retry only on rate limits and server errors.
      if (res.status !== 429 && res.status < 500) return { error: "HTTP " + res.status };
      if (attempt === 3) return { error: "HTTP " + res.status };
    } catch (e) {
      if (attempt === 3) return { error: e.name === "TimeoutError" ? "timeout" : "network error" };
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

(async () => {
  const idFile = path.join(dir, "identifiers.csv");
  if (!fs.existsSync(idFile)) {
    console.error(`No ${idFile}. Run the export first: npm run export -- --experiment ${experimentId} --key <firebase key>`);
    process.exit(1);
  }
  const ids = readCsv(idFile).filter((r) => r.poh_session_id);
  if (ids.length === 0) {
    console.error("No Proof of Human session ids in this export (none were recorded, or the data predate the tracker).");
    process.exit(1);
  }

  // A reload in the same tab keeps the tracker's session, so several participant documents
  // can share one session id; fetch each session once.
  const reports = new Map();
  for (const sid of new Set(ids.map((r) => r.poh_session_id))) {
    reports.set(sid, await fetchReport(sid));
    await new Promise((r) => setTimeout(r, 150));
  }

  const rows = ids.map((r) => {
    const { report, error } = reports.get(r.poh_session_id);
    const out = { participant_id: r.participant_id };
    if (!report) return { ...out, poh_error: error };
    out.risk_score = report.risk_score;
    out.recommended_action = report.recommended_action;
    out.risk_explanation = report.risk_explanation;
    for (const [k, v] of Object.entries(report.biometric_checks || {})) out["biometric_" + k] = v;
    for (const [k, v] of Object.entries(report.device_checks || {})) out["device_" + k] = v;
    out.poh_error = "";
    return out;
  });

  const cols = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const outFile = path.join(dir, "poh.csv");
  fs.writeFileSync(outFile, [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n");

  const failed = rows.filter((r) => r.poh_error).length;
  console.log(`${outFile}: ${rows.length} rows (${rows.length - failed} scored, ${failed} without a report).`);
  if (failed) {
    const why = {};
    for (const r of rows) if (r.poh_error) why[r.poh_error] = (why[r.poh_error] || 0) + 1;
    console.log("Without a report:", Object.entries(why).map(([k, n]) => `${k} x${n}`).join(", "),
      "(HTTP 401/403: check the secret key; HTTP 404: the session was never scored).");
  }
})().catch((e) => {
  console.error("Fetching scores failed:", e.message || e);
  process.exit(1);
});
