const fs = require("fs");

// Picks scored responses for hand labeling. The scorer's citation_state is used only to spread
// the sample across states; none of the scorer's output is written to the labeling files.
const SEED = 20261123;
const TARGET = 28;
const STATES = ["cited", "mentioned_unlinked", "absent", "no_retrieval"];
const TO_LABEL = "labels/to_label.jsonl";
const SHEET = "labels/labeling_sheet.csv";
const LABEL_COLUMNS = ["citation_state", "prominence", "competitors", "platforms", "note"];

const readJsonl = (file) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const keyOf = (row) => `${row.timestamp}|${row.run_index}`;

// Small seeded random generator (mulberry32), so the same seed always picks the same sample.
function seededRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Hands out places one at a time across the states that still have responses left,
// so a state with only a few responses is taken whole and the rest share what remains.
function allocate(counts, target) {
  const take = Object.fromEntries(STATES.map((s) => [s, 0]));
  let left = target;
  while (left > 0) {
    const open = STATES.filter((s) => take[s] < counts[s]);
    if (!open.length) break;
    for (const s of open) {
      if (left === 0) break;
      take[s]++;
      left--;
    }
  }
  return take;
}

const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`;

function main() {
  if (!process.argv.includes("--force") && (fs.existsSync(TO_LABEL) || fs.existsSync(SHEET))) {
    console.log(`${TO_LABEL} or ${SHEET} already exists. Not overwriting, since the sheet may hold your labels.`);
    console.log("Run with --force only if you mean to replace both.");
    process.exit(1);
  }

  const runs = readJsonl("runs.jsonl").filter((r) => !r.error);

  // Use each response's newest rubric version. Rows from rubric v1 have no rubric_version field.
  const latest = new Map();
  for (const s of readJsonl("scores.jsonl")) {
    if (s.error) continue;
    const version = s.rubric_version ?? 1;
    const prev = latest.get(keyOf(s));
    if (!prev || version > prev.version) latest.set(keyOf(s), { version, state: s.citation_state });
  }

  const unscored = runs.filter((r) => !latest.has(keyOf(r)));
  if (unscored.length) console.log(`Skipping ${unscored.length} responses with no score`);

  const byState = Object.fromEntries(STATES.map((s) => [s, []]));
  for (const run of runs) {
    const score = latest.get(keyOf(run));
    if (!score) continue;
    if (!byState[score.state]) throw new Error(`Unknown citation_state "${score.state}" for ${keyOf(run)}`);
    byState[score.state].push(run);
  }

  const counts = Object.fromEntries(STATES.map((s) => [s, byState[s].length]));
  const take = allocate(counts, TARGET);
  const random = seededRandom(SEED);

  let picked = [];
  for (const s of STATES) {
    const sorted = [...byState[s]].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    picked.push(...shuffle(sorted, random).slice(0, take[s]));
  }
  // Shuffle again so the sheet is not grouped by state or by question.
  picked = shuffle(picked, random);

  const rows = picked.map((run, i) => ({
    id: `S${String(i + 1).padStart(2, "0")}`,
    timestamp: run.timestamp,
    question: run.question,
    run_index: run.run_index,
    citation_count: run.citation_count,
    cited_urls: run.cited_urls,
    response_text: run.response_text,
  }));

  fs.mkdirSync("labels", { recursive: true });
  fs.writeFileSync(TO_LABEL, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

  // UTF-8 with a byte order mark so Excel reads the text correctly. Label columns start empty.
  const header = ["id", "question", "citation_count", "cited_urls", "response_text", ...LABEL_COLUMNS];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const cells = [r.id, r.question, r.citation_count, r.cited_urls.join("\n"), r.response_text, ...LABEL_COLUMNS.map(() => "")];
    lines.push(cells.map(csvCell).join(","));
  }
  fs.writeFileSync(SHEET, "﻿" + lines.join("\r\n") + "\r\n");

  const total = runs.length - unscored.length;
  const versions = [...new Set([...latest.values()].map((v) => v.version))].sort().join(", ");
  console.log(`Scored responses: ${total} (rubric version ${versions}): ${STATES.map((s) => `${s} ${counts[s]}`).join(", ")}`);
  console.log(`Sample (seed ${SEED}, target ${TARGET}): ${rows.length}: ${STATES.map((s) => `${s} ${take[s]}`).join(", ")}`);
  if (total <= TARGET) console.log(`Every scored response was taken, because there are ${total} and the target is ${TARGET}.`);
  for (const s of STATES) if (!counts[s]) console.log(`No responses have citation_state ${s}, so the sample cannot include any.`);
  console.log(`Wrote ${TO_LABEL} and ${SHEET}`);
}

main();
