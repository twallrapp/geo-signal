const fs = require("fs");

const MODEL = "claude-opus-5-5";
const RUNS_PER_QUESTION = 3;
const DELAY_MS = 2000;

const questions = fs.readFileSync("questions.txt", "utf8").split(/\r?\n/).map((q) => q.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const record = (row) => fs.appendFileSync("runs.jsonl", JSON.stringify(row) + "\n");

async function ask(question) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      messages: [{ role: "user", content: question }],
      tools: [{ type: "web_search_20260318", name: "web_search", allowed_callers: ["direct"] }],
    }),
  });
}

// Same walk as hello.js: collect every citation and search result wherever it appears.
function extract(data) {
  const citations = [], resultUrls = new Set();
  (function walk(v) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    if (v.type === "web_search_result" && v.url) resultUrls.add(v.url);
    if (Array.isArray(v.citations)) citations.push(...v.citations);
    for (const k in v) walk(v[k]);
  })(data);
  return {
    response_text: data.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
    citation_count: citations.length,
    cited_urls: [...new Set(citations.map((c) => c.url).filter(Boolean))],
    search_result_urls: [...resultUrls],
    search_count: data.usage?.server_tool_use?.web_search_requests ?? 0,
  };
}

async function main() {
  const total = questions.length * RUNS_PER_QUESTION;
  let n = 0;

  for (const question of questions) {
    for (let run_index = 1; run_index <= RUNS_PER_QUESTION; run_index++) {
      if (n > 0) await sleep(DELAY_MS);
      n++;
      console.log(`[${n}/${total}] asking: ${question} (run ${run_index})`);

      const base = { timestamp: new Date().toISOString(), engine: "claude", model: MODEL, question, run_index };
      const failed = { response_text: null, citation_count: 0, cited_urls: [], search_result_urls: [], search_count: 0 };

      try {
        const res = await ask(question);
        if (!res.ok) {
          const body = await res.text();
          console.log(`Request failed: ${res.status}\n${body}`);
          record({ ...base, ...failed, error: { status: res.status, body } });
          continue;
        }
        const data = await res.json();
        record({ ...base, model: data.model ?? MODEL, ...extract(data) });
      } catch (err) {
        console.log(`Request failed: no status\n${err.stack ?? err}`);
        record({ ...base, ...failed, error: { status: null, body: String(err) } });
      }
    }
  }

  console.log(`Done: ${n} calls appended to runs.jsonl`);
}

main();
