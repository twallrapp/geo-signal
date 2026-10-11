BUILD LOG
400 on first API call. Script only printed the status, so I had no information.
Changed the error path to print the response body before guessing at causes.
Body said: credit balance too low. Not a malformed request at all.
Claude had predicted a bad beta header; that would have been the wrong fix and I'd have burned time on it.
Lesson: read what the API tells you before acting on anyone's theory, including a confident one.
Ran hello.js twice by accident on the same question. Half the competitor brands changed between runs.
Means a single call is noise and "mentioned" has to be a rate across N runs, not a boolean.
JSONL append-only structure already supports this without a rewrite.
Verified the citation counter rather than trusting it. Five citation slots existed in the response, all empty arrays. Counter was correct, not buggy.
Claude Code's theory was that citations were nested inside code-execution blocks. Checked the raw response: not nested. Theory was wrong and it said so.
Tested with dynamic filtering off to see whether that was stripping citations. Result: [fill in after step 2]