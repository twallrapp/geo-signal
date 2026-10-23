const fs = require("fs");

const BRAND = "Example Brand";
const BRAND_ALIASES = ["Example Brand"];
const SCORING_MODEL = "claude-sonnet-5-5";
const RUBRIC_VERSION = 2;
const DELAY_MS = 1000;

const runs = fs.readFileSync("runs.jsonl", "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const record = (row) => fs.appendFileSync("scores.jsonl", JSON.stringify(row) + "\n");

const SYSTEM = `You score AI assistant answers for how they treat one brand: ${BRAND} (also written ${BRAND_ALIASES.map((a) => `"${a}"`).join(" or ")}).

Return ONLY a JSON object with exactly these fields, and nothing else:
{
  "brand_mentioned": true or false. Does ${BRAND} appear in the response text at all?
  "citation_state": one of "cited", "mentioned_unlinked", "absent", "no_retrieval".
    - "no_retrieval": the response cites no sources at all (citation_count is 0). This takes priority over the other values.
    - "cited": ${BRAND} is mentioned and at least one cited URL belongs to ${BRAND}.
    - "mentioned_unlinked": ${BRAND} is mentioned but none of the cited URLs belong to it.
    - "absent": sources were cited but ${BRAND} is not mentioned.
  "prominence": one of "primary_recommendation", "listed", "passing", "absent".
    - "primary_recommendation": ${BRAND} is the top or main recommendation.
    - "listed": ${BRAND} is one of several options presented.
    - "passing": ${BRAND} is mentioned only in passing, not as a recommended option.
    - "absent": ${BRAND} is not mentioned.
  "competitors": array of companies named in the response whose product or service generates, requests, or manages reviews and online reputation, other than ${BRAND}. These are who ${BRAND} competes with. Include vertical software (for example Square or Jobber) only when it is named specifically for its review features. Empty array if none.
  "platforms": array of sites named in the response where reviews are hosted or displayed, such as Google, Yelp, Facebook, Trustpilot, or the Better Business Bureau. Empty array if none.
  "framing": short phrase describing how ${BRAND} was characterized, or null if it is absent.
  "note": one sentence on anything notable about the response.
}

Exclude from both "competitors" and "platforms":
- software directory and review sites such as G2 and Capterra
- freelance marketplaces such as Upwork and Fiverr
- any company mentioned only as an example of what not to do, or that is unrelated to reviews

In both arrays, use each company's canonical name, whatever spelling or abbreviation the response uses. For example, "BirdEye" and "Birdeye" both become "Birdeye", and "BBB" becomes "Better Business Bureau". List each company once.`;

async function score(run) {
  const prompt = [
    `Question asked: ${run.question}`,
    `citation_count: ${run.citation_count}`,
    `Cited URLs:\n${run.cited_urls.length ? run.cited_urls.join("\n") : "(none)"}`,
    `Response text:\n${run.response_text}`,
  ].join("\n\n");

  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: SCORING_MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
}

async function main() {
  const scorable = runs.filter((r) => !r.error);
  if (scorable.length < runs.length) console.log(`Skipping ${runs.length - scorable.length} failed runs (no response to score)`);

  for (let i = 0; i < scorable.length; i++) {
    const run = scorable[i];
    if (i > 0) await sleep(DELAY_MS);
    console.log(`[${i + 1}/${scorable.length}] scoring: ${run.question} (run ${run.run_index})`);

    const base = { timestamp: run.timestamp, question: run.question, run_index: run.run_index, scoring_model: SCORING_MODEL, rubric_version: RUBRIC_VERSION };

    try {
      const res = await score(run);
      if (!res.ok) {
        const body = await res.text();
        console.log(`Request failed: ${res.status}\n${body}`);
        record({ ...base, error: { status: res.status, body } });
        continue;
      }
      const data = await res.json();
      const raw = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      try {
        record({ ...base, ...JSON.parse(raw) });
      } catch (err) {
        // Kept deliberately simple for now: no fence stripping or schema, so we can see what the model actually returns.
        console.log(`Could not parse JSON: ${err.message}\n${raw}`);
        record({ ...base, error: { status: res.status, body: `JSON parse failed: ${err.message}` }, raw });
      }
    } catch (err) {
      console.log(`Request failed: no status\n${err.stack ?? err}`);
      record({ ...base, error: { status: null, body: String(err) } });
    }
  }

  console.log(`Done: ${scorable.length} rows appended to scores.jsonl`);
}

main();
