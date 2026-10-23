## 2026-10-10 — Day 1

**Setup.** Claude Code through the desktop app Code tab, Manual permission mode so every
change arrives as a diff I have to accept. Node 22. API key in .env, gitignored before the
first commit. Private GitHub repo.

**First API call failed with a 400.** My script only printed the status code, so I had no
information to work with. Changed the error path to print the full response body before
guessing at causes. Body said: credit balance too low. Not a malformed request at all.
Claude had predicted a bad beta header, and that fix would have been wrong — I'd have
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
morning already handles this without a rewrite — one row per call, aggregate at report time.

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
- Plain Node, three scripts, no framework — nothing between me and the code
- Append-only JSONL, no database — data is append-only, a few hundred rows a year, and
  diffable in git so I can see what changed between runs
- ask.js separate from score.js — rescoring with a new rubric shouldn't require re-querying
  and re-paying
- raw fetch rather than the SDK — I wanted the request shape visible and to write my own
  backoff when I hit rate limits
- keep allowed_callers: ["direct"] — without it the citation dimension is unmeasurable, and
  citation is the point
- last-response.json gitignored as debug output; runs.jsonl is the real data store

**Open and unresolved**
- Which API configuration matches what a person actually sees in the Claude app: unknown,
  and not answerable from the API. Goes in README limitations.
- N runs per question: 3 is the floor, brand-list variance may demand more
- Which model to query as "the Claude engine," and the reason
- No other engines attempted yet