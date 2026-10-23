const fs = require("fs");

const question ="What are the best services for getting more Google reviews for a small business?";

async function main() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      messages: [{ role: "user", content: question }],
      tools: [{ type: "web_search_20260318", name: "web_search", allowed_callers: ["direct"] }],
    }),
  });

  if (!res.ok) return console.log(`Request failed: ${res.status}\n${await res.text()}`);

  const data = await res.json();
  fs.writeFileSync("last-response.json", JSON.stringify(data, null, 2));
  const textBlocks = data.content.filter((b) => b.type === "text");
  console.log(textBlocks.map((b) => b.text).join(""));

  // Walk the whole response rather than assuming where citations and search results live.
  const citations = [], citationPaths = new Set(), resultUrls = new Set();
  (function walk(v, path) {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (!v || typeof v !== "object") return;
    if (v.type === "web_search_result" && v.url) resultUrls.add(v.url);
    if (Array.isArray(v.citations) && v.citations.length) {
      citations.push(...v.citations);
      citationPaths.add(`${path.replace(/\[\d+\]/g, "[]")}.citations on ${v.type} blocks`);
    }
    for (const k in v) walk(v[k], `${path}.${k}`);
  })(data, "data");
  console.log(`\n--- stop_reason: ${data.stop_reason}, searches: ${data.usage.server_tool_use?.web_search_requests ?? 0}`);
  console.log(`--- ${citations.length} citations, ${new Set(citations.map((c) => c.url)).size} unique cited URLs`);
  for (const p of citationPaths) console.log(`--- citations found at: ${p}`);
  console.log(`--- ${resultUrls.size} URLs in search results (retrieved, not necessarily cited)`);
  if (citations[0]) console.log("--- first citation as returned:\n" + JSON.stringify(citations[0], null, 2));
  if (citations[0]) console.log("--- unique cited URLs:");
  for (const url of new Set(citations.map((c) => c.url))) console.log(url);
}

main();
