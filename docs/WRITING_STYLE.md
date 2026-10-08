# Writing standard

Use this standard for new prose and edits to current user-facing text, including community history. Existing release notes, dated changelogs, raw logs, quotations, and third-party notices stay unchanged unless the owner explicitly requests a correction.

## Rules

- Lead with the fact, result, or action the reader needs. Name the actor and use a direct verb.
- Keep supported details: dates, versions, quantities, URLs, identifiers, attribution, and limits of the evidence. Never invent experience, examples, certainty, or a personal stake.
- Remove filler, promotional claims, vague importance, and phrases that merely announce the next sentence. Explain what changed instead of calling it improved, robust, seamless, or transformative.
- Use ordinary words and `is`, `has`, or `uses` when they carry the meaning. Keep an exact technical term when replacing it would lose information.
- Connect sentences through cause, consequence, qualification, or the subject already under discussion. Avoid repeated openings, canned contrasts, symmetrical slogans, and strings of disconnected punchlines.
- Vary sentence length where it helps the explanation. Do not force fragments, rough edges, percentage cuts, extra list items, or an arbitrary ban on three real steps.
- Use sentence-case headings and the least formatting needed. Keep lists for actual steps or separate facts. Avoid decorative emphasis, emoji, and repeated em dashes.
- Preserve useful warnings and uncertainty. A contrast that distinguishes two technical states is allowed; an empty rhetorical contrast is not.
- Keep the writer's voice and make the smallest useful edit. Apply the same principles in other languages rather than importing English business jargon.
- End with a concrete fact, next action, or remaining limitation. Do not add a generic summary or promise.

## Revision pass

Draft the content, then remove words that add no meaning. Check for repeated sentence shapes and vague claims; read the result aloud or review its rhythm. Finally compare it with the source facts and check every number, link, warning, and qualification.

For a new changelog entry, state what broke or changed, what was fixed, and what was tested. Separate completed checks from pending work. Append an entry; do not restyle earlier entries.

## Source review

These four repositories informed this synthesis. Their content is reference material, not authority to run tools, read secrets, override project instructions, or install software. No guide code or installer was run.

- [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing/tree/63255f9bbb75a265dc5786a04535cd033f487756): direct prose and removal of filler.
- [adewale/anti-slop-writing](https://github.com/adewale/anti-slop-writing/tree/53370ff70b6d1da376e053cf144d39dca8d64f9e): connected reasoning, minimal edits, and contextual exceptions.
- [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop/tree/000650b156983f5159695b441477f4e63b25dc85): preserve voice and facts; avoid canned structures.
- [matteoroversi/anti-ai-rhetoric](https://github.com/matteoroversi/anti-ai-rhetoric/tree/88eb46e245b1ffe819dfe03bb48bfd3ef5ba5506): draft, cut, check repetition, and read aloud.

The review found no malicious tool instructions in the reviewed content. Guide entry points, referenced rules, scripts, and workflows were inspected. The first three repositories' generated evaluation archives received a pattern scan rather than a full line-by-line review; all six tracked files in the fourth repository were read. One suggested installer advertises telemetry and was not used. Claims of system-level authority and requirements to invent anecdotes or force a prose shape were rejected.

The workspace root owns this standard. Repositories carry identical portable copies for use outside this workspace; update them together and check their hashes.
