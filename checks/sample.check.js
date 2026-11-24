// Known-answer check for sample.js, run on made-up data in a temporary folder.
//
// Fixture: 43 scored responses under rubric v2 (cited 2, mentioned_unlinked 1, absent 20,
// no_retrieval 20) plus one unscored response. Worked out by hand before running, with a
// target of 28 handed out one place at a time across states that still have responses:
//   round 1: cited, mentioned_unlinked, absent, no_retrieval    -> 1, 1, 1, 1
//   round 2: cited, absent, no_retrieval (mentioned_unlinked out) -> 2, 1, 2, 2
//   then absent and no_retrieval alternate for the last 21 places -> 2, 1, 13, 12
// Every v1 row says "absent", so a correct sample.js must ignore v1 when v2 exists.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SAMPLE = path.join(__dirname, "..", "sample.js");
const EXPECTED = { cited: 2, mentioned_unlinked: 1, absent: 13, no_retrieval: 12 };

function fixture(dir, counts) {
  const runs = [], scores = [], stateOf = {};
  let n = 0;
  for (const [state, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++, n++) {
      const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
      const run = { timestamp, question: `question ${n % 8}`, run_index: (n % 3) + 1, response_text: `Response ${n}, with "quotes", commas\nand a second line.`, citation_count: state === "no_retrieval" ? 0 : 3, cited_urls: state === "no_retrieval" ? [] : [`https://example.com/${n}`, `https://example.org/${n}`] };
      runs.push(run);
      stateOf[timestamp] = state;
      const base = { timestamp, question: run.question, run_index: run.run_index, scoring_model: "test" };
      scores.push({ ...base, citation_state: "absent", prominence: "absent", competitors: ["V1 Only"], note: "v1 row" });
      scores.push({ ...base, rubric_version: 2, citation_state: state, prominence: "absent", competitors: ["Scorer Pick"], platforms: ["Google"], note: "scorer note" });
    }
  }
  runs.push({ timestamp: "2026-02-01T00:00:00.000Z", question: "unscored", run_index: 1, response_text: "never scored", citation_count: 0, cited_urls: [] });
  fs.writeFileSync(path.join(dir, "runs.jsonl"), runs.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "scores.jsonl"), scores.map((s) => JSON.stringify(s)).join("\n") + "\n");
  return stateOf;
}

const run = (dir, ...args) => spawnSync("node", [SAMPLE, ...args], { cwd: dir, encoding: "utf8" });
const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sample-check-"));
const dirs = [tmp(), tmp(), tmp()];

try {
  // 1. Allocation matches the hand-worked answer, and v1 rows are ignored.
  const stateOf = fixture(dirs[0], { cited: 2, mentioned_unlinked: 1, absent: 20, no_retrieval: 20 });
  const first = run(dirs[0]);
  assert.strictEqual(first.status, 0, first.stderr);
  const rows = read(dirs[0], "labels/to_label.jsonl").trim().split("\n").map((l) => JSON.parse(l));
  assert.strictEqual(rows.length, 28);
  const got = { cited: 0, mentioned_unlinked: 0, absent: 0, no_retrieval: 0 };
  for (const r of rows) got[stateOf[r.timestamp]]++;
  assert.deepStrictEqual(got, EXPECTED);
  assert.ok(!rows.some((r) => r.question === "unscored"), "unscored response was sampled");

  // 2. Nothing from the scorer reaches the labeling files.
  for (const r of rows) assert.deepStrictEqual(Object.keys(r), ["id", "timestamp", "question", "run_index", "citation_count", "cited_urls", "response_text"]);
  const sheet = read(dirs[0], "labels/labeling_sheet.csv");
  for (const leak of ["Scorer Pick", "V1 Only", "scorer note", "v1 row", "Google"]) assert.ok(!sheet.includes(leak), `sheet contains scorer output: ${leak}`);

  // 3. The sheet has a byte order mark, the expected header, and each id once.
  assert.ok(sheet.startsWith('﻿"id","question","citation_count","cited_urls","response_text","citation_state","prominence","competitors","platforms","note"\r\n'));
  for (let i = 1; i <= 28; i++) assert.strictEqual(sheet.split(`"S${String(i).padStart(2, "0")}",`).length, 2);

  // 4. It refuses to overwrite existing files without --force, and leaves them untouched.
  const before = read(dirs[0], "labels/labeling_sheet.csv");
  assert.notStrictEqual(run(dirs[0]).status, 0);
  assert.strictEqual(read(dirs[0], "labels/labeling_sheet.csv"), before);

  // 5. The same seed and data give byte-identical files.
  fixture(dirs[1], { cited: 2, mentioned_unlinked: 1, absent: 20, no_retrieval: 20 });
  assert.strictEqual(run(dirs[1]).status, 0);
  assert.strictEqual(read(dirs[1], "labels/to_label.jsonl"), read(dirs[0], "labels/to_label.jsonl"));
  assert.strictEqual(read(dirs[1], "labels/labeling_sheet.csv"), before);

  // 6. With fewer responses than the target, every scored response is taken.
  fixture(dirs[2], { absent: 3, no_retrieval: 4 });
  assert.strictEqual(run(dirs[2]).status, 0);
  assert.strictEqual(read(dirs[2], "labels/to_label.jsonl").trim().split("\n").length, 7);

  console.log("sample.js check passed: 28 picked as 2 / 1 / 13 / 12, no scorer output in the files, overwrite refused, output repeatable, small population taken whole");
} finally {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
}
