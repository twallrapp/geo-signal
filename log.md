## 2026-10-10: Day 1

**Setup.** Claude Code through the desktop app Code tab, Manual permission mode so every
change arrives as a diff I have to accept. Node 22. API key in .env, gitignored before the
first commit. Private GitHub repo.

**First API call failed with a 400.** My script only printed the status code, so I had no
information to work with. Changed the error path to print the full response body before
guessing at causes. Body said: credit balance too low. Not a malformed request at all.
Claude had predicted a bad beta header, and that fix would have been wrong. I'd have
deleted the header, gotten the identical 400, and been stuck with two suspects and no data.
Lesson: read what the API tells you before acting on anyone's theory, including a confident one.

**Caught scope creep I hadn't asked for.** Claude Code added a server-side fallback header
and body field on its own. Removed both. The reason matters more than the tidiness:
automatic fallback to a different model would mean some rows of my data came from a model
I didn't choose and couldn't identify afterward. That's a reliability feature for a chatbot
and a correctness bug for a measurement instrument.

**Ran the same question twice by accident. Half the competitor brands changed.**
Run 1: NiceJob, Podium, Birdeye, GatherUp, Grade.us, Broadly, Swell.
Run 2: NiceJob, BrightLocal, GatherUp, Grade.us, Podium, Birdeye, Weave, Signpost.
Ten distinct brands across two runs, only five in both. A single call is noise. "Mentioned"
has to be a rate across N runs, not a boolean. The append-only JSONL structure I chose this
morning already handles this without a rewrite: one row per call, aggregate at report time.

**Added web search: 2 searches, 18 URLs retrieved, 0 citations.** But the prose attributed
claims to Zapier, Google and the FTC by name. So the model read sources, used them, named
two of them out loud, and linked to none. That's a fourth state my rubric didn't have:
used without a link. The publisher gets named and gets no traffic.

**Verified the citation counter instead of trusting it.** Opened the raw response rather
than believing a number my own code printed 40 minutes earlier. Five `citations` keys
existed, every one an empty array. Counter was correct, not buggy. Claude Code's hypothesis
was that citations were nested inside code-execution blocks; checked the structure, they
weren't, and it said so plainly instead of hunting for a way to be right.

**THE FINDING: dynamic filtering was stripping citations.**
Tested `allowed_callers: ["direct"]` to turn filtering off.
Filtering on: 0 citations.
Filtering off: 13, 14, 15 citations and 6–7 unique URLs across three runs.

So "Claude searches the web and cites nothing" was a configuration artifact, not model
behavior. It was plausible, interesting, fit the GEO-economics narrative perfectly, and was
wrong. It would have gone in the README. Caught it by testing the configuration rather than
accepting the number. Third time this pattern has shown up in my work: queries built from
article titles at efficacy checkpoint 1, checking a classifier's threshold before acting on
its output, and now this.

Secondary observation worth keeping separate: citation counts are stable (13–15) while the
brand lists are not (roughly 50% turnover). Two different kinds of variance. The scorer
should treat them differently.

**All seven cited URLs are listicles.**
- feedspace.io/blogs/google-review-management-software/
- birdeye.com/blog/google-review-management-software-2026/
- wiserreview.com/blog/google-review-management-software/
- thecmo.com/tools/best-google-review-management-software/
- synup.com/en/competitors/top-google-review-management-tools
- zapier.com/blog/review-management-software/
- reputigo.com/blog/best-google-review-management-software-small-business-2026

Not one vendor homepage, product page, or Google support doc. Seven of seven are roundups.
Three of the seven are competitors publishing their own comparison content and being cited
as authorities on the market they compete in. Synup, a review management platform, is cited
via a programmatic /competitors/ page, which is the same tactic as the programmatic page
systems I've built before, aimed at citation instead of rankings. Two URLs carry "2026",
which suggests recency matters. The tracked brand is zero for seven.

Hypothesis worth testing properly: for commercial queries in this category, AI citation goes
to dated third-party and competitor-published listicles rather than vendor pages, and both
competitors and other review platforms are capturing it while the tracked brand is not.

Caveat: one question, three runs, one engine, one configuration. Directional, not statistical.

**Decisions made today, and why**
- Plain Node, three scripts, no framework: nothing between me and the code
- Append-only JSONL, no database: data is append-only, a few hundred rows a year, and
  diffable in git so I can see what changed between runs
- ask.js separate from score.js: rescoring with a new rubric shouldn't require re-querying
  and re-paying
- raw fetch rather than the SDK: I wanted the request shape visible and to write my own
  backoff when I hit rate limits
- keep allowed_callers: ["direct"]: without it the citation dimension is unmeasurable, and
  citation is the point
- last-response.json gitignored as debug output; runs.jsonl is the real data store

**Open and unresolved**
- Which API configuration matches what a person actually sees in the Claude app: unknown,
  and not answerable from the API. Goes in README limitations.
- N runs per question: 3 is the floor, brand-list variance may demand more
- Which model to query as "the Claude engine," and the reason
- No other engines attempted yet
## 2026-10-22: First real collection

24 calls, 8 questions x 3 runs. 24/24 on claude-opus-5-5 (confirms the fallback
removal worked), 0 errors.

**Retrieval only fires when the query names a product category or a brand.**
Citations by question:
- "best google review management service" → 14, 13, 13
- "white label review management service" → 11, 13, 10
- "is birdeye a good service" → 12, 16, 14
- "can you offer a discount if someone leaves you a good review" → 10, 0, 0
- "how to get more reviews on google maps" → 0, 0, 0
- "how to ask customers for a review" → 0, 0, 0
- "can i pay someone to manage my google business profile" → 0, 0, 0
- "why does my competition show up higher on google maps" → 0, 0, 0

The predictor is not purchase intent. "Can i pay someone to manage my google
business profile" is about as high-intent as a query gets and it got zero
retrieval on all three runs. What the searched queries have in common is a
category noun ("review management service") or a brand ("birdeye").

Implication: for queries phrased in plain customer language rather than
category vocabulary, there is no citation opportunity for anyone. Nothing is
retrieved, so no content strategy can surface any brand there. Training-data presence
is the only lever and it's slow and largely outside any one brand's control. That splits
the GEO strategy in two by query vocabulary, not by funnel stage.

Third kind of variance found: the discount question searched on 1 of 3 runs.
Whether retrieval fires is probabilistic, not a property of the query.

Tracked brand: 0 mentions across all 24 responses.

Caveat: one engine, one configuration, 8 questions, 3 runs. Directional.
### Scorer and the first eval

Built score.js naively (plain JSON parsing, no schema). Claude predicted it would
fail on at least one of 24 responses. It didn't: 24/24 parsed. Revised lesson:
naive parsing worked at this sample size, which is not the same as reliable. The
stronger reason to add a schema is value constraint, not parse safety: nothing
stopped the model returning an invalid enum. Checked all 24 rows; enums were
clean, so the schema is insurance rather than a fix.

Four-state citation rubric paid off immediately. Of 24 responses: 14 no_retrieval
(nothing searched, nobody could be cited) and 10 absent (retrieval happened, the tracked brand
wasn't in it). So "the tracked brand in 0 of 24" overstates the opportunity. The addressable
problem is 10 responses across 3 questions. A two-state rubric would have pointed
me at a content strategy for queries where content cannot help.

Rubric v1 competitor field was too loose: "every vendor or product brand named"
captured platforms (Google, Yelp), marketplaces (Amazon, Upwork, Fiverr),
software directories (G2, Capterra), and one cryptocurrency. Checked the raw
response for "Solana" before concluding the scorer hallucinated. It hadn't. The
response disambiguated Birdeye the reputation software from Birdeye the Solana
tool. Scorer correct, specification wrong. Third time checking the instrument
instead of assuming, third time it mattered.

v2 split competitors from platforms with tight definitions. Tail went from ~59
names to 37 + 10. Top four unchanged: Podium 13, Birdeye 13, NiceJob 12,
BrightLocal 10. Signal was robust to the rubric change, which means the loose
definition was adding tail noise rather than creating the finding.

Added rubric_version so v1 and v2 live in the same file and stay comparable.

Still wrong in v2: normalization instruction partially failed (Weaverev vs
WeaveRev, Lead Oracle vs Lead Oracle AI). Lesson: telling a model to normalize is
probabilistic, doing it in code is deterministic. Moving it to report time.
Amazon and Etsy still classed as platforms, correctly per my definition, which
didn't scope to local business reputation.

Methodology note: at 2 runs the brand list turned over 50%. At 24 runs a stable
top four emerges. Per-run variance washes out in aggregate, so N runs plus
aggregation across questions is what makes structure visible.

Google appears in 24 of 24 responses.

## 2026-11-02: Correction to the retrieval finding

The Oct 22 entry says retrieval only fires when a query names a product category or a brand. Rechecked against questions.txt before publishing, and both halves were too strong. Three questions name Google products (Maps, Business Profile) and none searched, so “brand” was too broad. The discount question names neither and searched on 1 of 3 runs, so “only” was wrong. Accurate version: questions naming a type of service or a specific vendor searched on 9 of 9 runs; the other five searched on 1 of 15. Also verified against the logged search_count that every zero-citation response ran zero searches, so “searched nothing” is measured, not inferred.

## 2026-11-03: Tracked brand moved to local config

The brand is now read from a gitignored brand.local.json instead of being written into score.js. Its name is removed from the README, this log, and the scorer notes in scores.jsonl, replaced with “the tracked brand.” This is a redaction of one name, not a change to any measurement: every other field in scores.jsonl is unchanged, and runs.jsonl is untouched.
