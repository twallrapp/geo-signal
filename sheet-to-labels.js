const fs = require("fs");

// Turns the filled-in labeling sheet back into labels/labels.jsonl, one line per response.
// If any row is missing, incomplete or invalid, it lists every problem and writes nothing.
const args = process.argv.slice(2);
const SHEET = args.find((a) => !a.startsWith("--")) ?? "labels/labeling_sheet.csv";
const FORCE = args.includes("--force");
const TO_LABEL = "labels/to_label.jsonl";
const OUT = "labels/labels.jsonl";
const CITATION_STATES = ["cited", "mentioned_unlinked", "absent", "no_retrieval"];
const PROMINENCE = ["primary_recommendation", "listed", "passing", "absent"];
const REQUIRED = ["id", "question", "citation_count", "citation_state", "prominence", "competitors", "platforms", "note"];

// Reads CSV the way spreadsheets write it: quoted cells may hold commas, line breaks and "" for a quote.
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// A list cell holds names separated by semicolons or line breaks, or the word "none".
function parseList(cell) {
  if (/^none$/i.test(cell.trim())) return [];
  const seen = new Set(), names = [];
  for (const name of cell.split(/[;\r\n]+/).map((s) => s.trim()).filter(Boolean)) {
    if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); names.push(name); }
  }
  return names;
}

// labels.jsonl may be committed, so the tracked brand's real name must not end up in it.
function brandAliases() {
  if (!fs.existsSync("brand.local.json")) return [];
  const { brand, aliases = [] } = JSON.parse(fs.readFileSync("brand.local.json", "utf8"));
  return [brand, ...aliases].filter(Boolean).map((a) => a.toLowerCase());
}

function main() {
  if (fs.existsSync(OUT) && !FORCE) {
    console.log(`${OUT} already exists. Run with --force to replace it.`);
    process.exit(1);
  }

  const expected = fs.readFileSync(TO_LABEL, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const byId = new Map(expected.map((r) => [r.id, r]));
  const [header, ...body] = parseCsv(fs.readFileSync(SHEET, "utf8"));
  const col = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  const missingCols = REQUIRED.filter((c) => !(c in col));
  if (missingCols.length) {
    console.log(`${SHEET} is missing columns: ${missingCols.join(", ")}`);
    process.exit(1);
  }

  const aliases = brandAliases();
  const problems = [], labels = new Map();
  for (const cells of body) {
    const get = (name) => (cells[col[name]] ?? "").trim();
    const id = get("id");
    const source = byId.get(id);
    if (!source) { problems.push(`id "${id}" is not in ${TO_LABEL}`); continue; }
    if (labels.has(id)) { problems.push(`${id}: appears more than once`); continue; }

    // A mismatch here usually means one column was sorted on its own and rows got out of line.
    if (get("question") !== source.question || get("citation_count") !== String(source.citation_count)) {
      problems.push(`${id}: question or citation_count does not match ${TO_LABEL}, so the rows may be out of line`);
    }

    const citation_state = get("citation_state").toLowerCase();
    const prominence = get("prominence").toLowerCase();
    if (!CITATION_STATES.includes(citation_state)) problems.push(`${id}: citation_state "${get("citation_state")}" must be one of ${CITATION_STATES.join(", ")}`);
    if (!PROMINENCE.includes(prominence)) problems.push(`${id}: prominence "${get("prominence")}" must be one of ${PROMINENCE.join(", ")}`);
    for (const list of ["competitors", "platforms"]) {
      if (!get(list)) problems.push(`${id}: ${list} is empty. Write the names, or "none" if there are none`);
    }

    const label = {
      id, timestamp: source.timestamp, question: source.question, run_index: source.run_index,
      citation_state, prominence, competitors: parseList(get("competitors")), platforms: parseList(get("platforms")), note: get("note"),
    };
    const text = JSON.stringify([label.competitors, label.platforms, label.note]).toLowerCase();
    if (aliases.some((a) => text.includes(a))) problems.push(`${id}: a label contains the tracked brand's name. Write "the tracked brand" instead`);
    labels.set(id, label);
  }
  for (const id of byId.keys()) if (!labels.has(id)) problems.push(`${id}: row is missing from the sheet`);

  if (problems.length) {
    console.log(`${problems.length} problems in ${SHEET}. Nothing was written.`);
    for (const p of problems) console.log(`- ${p}`);
    process.exit(1);
  }

  const ordered = expected.map((r) => labels.get(r.id));
  fs.writeFileSync(OUT, ordered.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const counts = {};
  for (const l of ordered) counts[l.citation_state] = (counts[l.citation_state] ?? 0) + 1;
  console.log(`Wrote ${ordered.length} labels to ${OUT}: ${Object.entries(counts).map(([s, n]) => `${s} ${n}`).join(", ")}`);
}

main();
