// Known-answer check for sheet-to-labels.js, run on a made-up 4-row sheet in a temporary folder.
//
// The good sheet is written the way spreadsheets export it (byte order mark, CRLF line ends,
// columns in a different order, quoted cells with commas, quotes and line breaks). Its correct
// labels.jsonl is written out by hand below. The bad sheet has one of each mistake the script
// must catch, and the script must report every one of them and write nothing.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "sheet-to-labels.js");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "labels-check-"));
const file = (name) => path.join(dir, name);
const run = (...args) => spawnSync("node", [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });

const toLabel = [
  { id: "S01", timestamp: "2026-01-01T00:00:01.000Z", question: "best review tool", run_index: 1, citation_count: 4, cited_urls: ["https://a.example"], response_text: "one" },
  { id: "S02", timestamp: "2026-01-01T00:00:02.000Z", question: "how to ask for reviews", run_index: 2, citation_count: 0, cited_urls: [], response_text: "two" },
  { id: "S03", timestamp: "2026-01-01T00:00:03.000Z", question: 'can i, "really", do this', run_index: 3, citation_count: 2, cited_urls: ["https://b.example"], response_text: "three" },
  { id: "S04", timestamp: "2026-01-01T00:00:04.000Z", question: "white label tools", run_index: 1, citation_count: 5, cited_urls: [], response_text: "four" },
];

const COLUMNS = ["note", "id", "competitors", "question", "citation_count", "platforms", "prominence", "citation_state", "response_text", "cited_urls"];
const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
const sheet = (rows) => "﻿" + [COLUMNS, ...rows.map((r) => COLUMNS.map((c) => r[c] ?? ""))].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const source = (id) => { const r = toLabel.find((x) => x.id === id); return { id, question: r.question, citation_count: r.citation_count, response_text: "text, with a comma\nand a line break", cited_urls: r.cited_urls.join("\n") }; };

const good = [
  { ...source("S01"), citation_state: "Absent ", prominence: "absent", competitors: "Podium; Birdeye\nNiceJob; podium", platforms: "Google; Yelp", note: 'Says "best" twice, then hedges' },
  { ...source("S02"), citation_state: "no_retrieval", prominence: "absent", competitors: "none", platforms: "NONE", note: "" },
  { ...source("S03"), citation_state: "absent", prominence: "absent", competitors: "Grade.us, Inc.", platforms: "Google\r\nTrustpilot", note: "line one\nline two" },
  { ...source("S04"), citation_state: "cited", prominence: "listed", competitors: "Weave", platforms: "Better Business Bureau", note: "ok" },
];

const expected = [
  { id: "S01", timestamp: "2026-01-01T00:00:01.000Z", question: "best review tool", run_index: 1, citation_state: "absent", prominence: "absent", competitors: ["Podium", "Birdeye", "NiceJob"], platforms: ["Google", "Yelp"], note: 'Says "best" twice, then hedges' },
  { id: "S02", timestamp: "2026-01-01T00:00:02.000Z", question: "how to ask for reviews", run_index: 2, citation_state: "no_retrieval", prominence: "absent", competitors: [], platforms: [], note: "" },
  { id: "S03", timestamp: "2026-01-01T00:00:03.000Z", question: 'can i, "really", do this', run_index: 3, citation_state: "absent", prominence: "absent", competitors: ["Grade.us, Inc."], platforms: ["Google", "Trustpilot"], note: "line one\nline two" },
  { id: "S04", timestamp: "2026-01-01T00:00:04.000Z", question: "white label tools", run_index: 1, citation_state: "cited", prominence: "listed", competitors: ["Weave"], platforms: ["Better Business Bureau"], note: "ok" },
];

const bad = [
  { ...good[0], citation_state: "absnt", note: "Acme is not mentioned" },
  { ...good[1], competitors: "" },
  { ...good[2], question: "can i do this" },
  { id: "S99", citation_state: "absent", prominence: "absent", competitors: "none", platforms: "none" },
];

try {
  fs.mkdirSync(file("labels"));
  fs.writeFileSync(file("labels/to_label.jsonl"), toLabel.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(file("brand.local.json"), JSON.stringify({ brand: "Acme Reviews", aliases: ["Acme Reviews", "Acme"] }));

  // 1. The bad sheet: every mistake reported, nothing written.
  fs.writeFileSync(file("bad.csv"), sheet(bad));
  const badRun = run("bad.csv");
  assert.strictEqual(badRun.status, 1);
  assert.ok(!fs.existsSync(file("labels/labels.jsonl")), "wrote labels despite problems");
  for (const msg of ['S01: citation_state "absnt"', "S01: a label contains the tracked brand's name", "S02: competitors is empty", "S03: question or citation_count does not match", 'id "S99" is not in', "S04: row is missing", "6 problems"]) {
    assert.ok(badRun.stdout.includes(msg), `missing problem report: ${msg}\n${badRun.stdout}`);
  }

  // 2. The good sheet: output equals the hand-written answer exactly.
  fs.writeFileSync(file("labels/labeling_sheet.csv"), sheet(good));
  const goodRun = run();
  assert.strictEqual(goodRun.status, 0, goodRun.stdout);
  const out = fs.readFileSync(file("labels/labels.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepStrictEqual(out, expected);

  // 3. It refuses to replace labels.jsonl without --force.
  assert.strictEqual(run().status, 1);
  assert.strictEqual(run("--force").status, 0);

  console.log("sheet-to-labels.js check passed: hand-written answer matched exactly, all 6 planted mistakes reported with nothing written, overwrite refused without --force");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
