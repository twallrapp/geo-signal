# Labeling guide

Hand labels for checking the scorer. Each row of `labeling_sheet.csv` is one response from `runs.jsonl`. The sheet shows exactly what the scorer was shown (the question, the citation count, the cited URLs and the response text) and none of what the scorer answered.

## Files

- `to_label.jsonl`: the sample, written by `sample.js`. Do not edit it.
- `labeling_sheet.csv`: the same rows with five empty columns for you to fill in.
- `labels.jsonl`: written by `sheet-to-labels.js` from your filled-in sheet.

## Filling in the sheet

Leave `id`, `question`, `citation_count`, `cited_urls` and `response_text` exactly as they are, and never sort a single column. The converter checks each row's question and citation count against `to_label.jsonl` and stops if a row is out of line.

| Column | What to write |
|---|---|
| `citation_state` | One of `cited`, `mentioned_unlinked`, `absent`, `no_retrieval` |
| `prominence` | One of `primary_recommendation`, `listed`, `passing`, `absent` |
| `competitors` | Names separated by semicolons or line breaks, or `none` |
| `platforms` | Names separated by semicolons or line breaks, or `none` |
| `note` | Optional, one sentence |

Capital letters and extra spaces in `citation_state` and `prominence` are fine. A blank list cell is treated as a mistake, so write `none` when there are none. Write "the tracked brand" instead of its real name anywhere in your labels, because the converter refuses to write a label that contains the name.

## The rubric, as the scorer is given it

This is the wording `score.js` sends the scorer (rubric v2), with the brand name replaced by `[tracked brand]`.

`citation_state`: one of "cited", "mentioned_unlinked", "absent", "no_retrieval".

- "no_retrieval": the response cites no sources at all (citation_count is 0). This takes priority over the other values.
- "cited": [tracked brand] is mentioned and at least one cited URL belongs to [tracked brand].
- "mentioned_unlinked": [tracked brand] is mentioned but none of the cited URLs belong to it.
- "absent": sources were cited but [tracked brand] is not mentioned.

`prominence`: one of "primary_recommendation", "listed", "passing", "absent".

- "primary_recommendation": [tracked brand] is the top or main recommendation.
- "listed": [tracked brand] is one of several options presented.
- "passing": [tracked brand] is mentioned only in passing, not as a recommended option.
- "absent": [tracked brand] is not mentioned.

`competitors`: array of companies named in the response whose product or service generates, requests, or manages reviews and online reputation, other than [tracked brand]. These are who [tracked brand] competes with. Include vertical software (for example Square or Jobber) only when it is named specifically for its review features. Empty array if none.

`platforms`: array of sites named in the response where reviews are hosted or displayed, such as Google, Yelp, Facebook, Trustpilot, or the Better Business Bureau. Empty array if none.

`note`: one sentence on anything notable about the response.

Exclude from both "competitors" and "platforms":

- software directory and review sites such as G2 and Capterra
- freelance marketplaces such as Upwork and Fiverr
- any company mentioned only as an example of what not to do, or that is unrelated to reviews

In both arrays, use each company's canonical name, whatever spelling or abbreviation the response uses. For example, "BirdEye" and "Birdeye" both become "Birdeye", and "BBB" becomes "Better Business Bureau". List each company once.

## Converting the sheet

```bash
node sheet-to-labels.js labels/labeling_sheet.csv
```

If anything is missing or invalid it lists every problem and writes nothing. Fix the sheet and run it again. Once `labels.jsonl` exists, replacing it needs `--force`.
