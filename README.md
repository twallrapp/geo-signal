# GEO Signal

A small tool that measures whether AI answer engines cite a business when its customers ask for help, and separates being cited from being merely mentioned.

I work in search optimization for small businesses. As customers start asking AI assistants instead of search engines, the question that matters is no longer only "do we rank," but "does the answer link to us, name us without a link, or leave us out." Most tools blur those together. This one keeps them apart, because only a link sends a customer anywhere.

The included data tracks one brand in the review management category. Its name is kept out of the repo: set the brand you want to track in a local config file (see Running it).

## How it works

Three Node scripts and two append-only data files.

- `ask.js` reads `questions.txt`, asks each question 3 times through the Anthropic Messages API with web search enabled, and appends one row per call to `runs.jsonl`, including how many searches the model ran and which sources it cited.
- `score.js` reads each response and asks a second model to score it against a fixed rubric, appending to `scores.jsonl`.
- `hello.js` is the first single-question experiment, kept because several findings started there.

Querying and scoring are separate on purpose: changing the rubric means rescoring old responses for pennies, never paying to ask again. Data is append-only JSONL, so runs stay comparable and every change shows up in git.

## Running it

Requires Node 20.6 or later and an Anthropic API key.

```bash
cp .env.example .env        # then add your key
node --env-file=.env ask.js
node --env-file=.env score.js
```

Edit `questions.txt` to change the questions. To set the tracked brand, copy `brand.example.json` to `brand.local.json` and edit the name and aliases. `brand.local.json` is gitignored, so your brand stays on your machine.

## The rubric

Each response gets a citation state, one of four:

- `cited`: the business is linked as a source
- `mentioned_unlinked`: named in the text, no link
- `absent`: the response cited sources, but not this business
- `no_retrieval`: the response cited no sources at all, so no business could have been cited

The scorer assigns `no_retrieval` from the citation count. In this dataset, every response with zero citations also ran zero searches, checked against the logged search count, so here it means the model never looked.

The fourth state exists because my first data forced it. Treating "searched and left us out" the same as "never searched" would have pointed at a content fix for questions where no content could help.

Also scored: prominence, competitors named, platforms named, and a short note.

## What it found

From 8 questions, 3 runs each, 24 responses:

- **Retrieval only happened when a question named a product category or a brand.** 14 of 24 responses ran no search at all. A high-intent question phrased in plain language ("can i pay someone to manage my google business profile") ran no search on any of its three runs. Every response that did search ran one search and cited sources.
- **Whether retrieval happens is not fixed per question.** One question searched on 1 of 3 runs.
- **A stable set of competitors emerged in aggregate**, even though a single run's list changed by about half between repeats.
- **On the core category question, all seven cited sources were roundup articles**, three of them published by competitors.
- **The tracked brand appeared in 0 of 24 responses.** It was absent from the 10 where retrieval happened, which is the addressable problem.

## Mistakes caught along the way

- **A configuration setting was hiding every citation.** The default setup returned zero citations, which looked like a finding that the model searches and cites nothing. Turning off one filtering setting showed 13 to 15 citations per answer.
- **The first rubric's competitor field was too loose.** It captured review platforms, marketplaces, software directories, and one cryptocurrency (the model had disambiguated two companies with the same name). I checked the raw response before blaming the scorer, then tightened the definition and rescored. The top competitors held steady; the noise dropped out. Both rubric versions are kept in `scores.jsonl` for comparison.
- **A model fallback setting was removed** so every row comes from the model requested. Each row records the model that actually answered, and all 24 match.
- **"Searched nothing" was first inferred, then checked.** The claim that plain-language questions triggered no search came from zero citation counts. I verified it against the logged search count before publishing it, since on day one a response had searched twice and still returned zero citations.

## Limitations

- One engine, one API configuration. The API is not the consumer app, and there is no way to confirm they behave the same.
- 8 questions and 3 runs per question. Directional, not statistical.
- Scoring uses plain JSON parsing. All 24 parsed and every value was valid, but a strict schema would be safer at larger volume.
- Asking the scoring model to normalize names worked unevenly (two pairs of name variants still appear). Normalization should happen in code.
- The platform definition does not yet separate local business review sites from product marketplaces.
- The scorer has not yet been checked against hand-labeled responses for what it misses.

## Next

- A report script that normalizes names in code and shows results per question
- A hand-labeled check of the scorer's recall
- Repeat runs over time, and a second engine

## How it was built

Built with Claude Code. I made the design decisions, reviewed every change before accepting it, and kept a build log in `log.md` of what broke and why.
