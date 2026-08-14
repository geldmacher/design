# Stakeholder questionnaire

Create one asynchronous Markdown questionnaire that closes a specific product or interface knowledge gap with one recipient or one audience whose members share the same knowledge and role. Keep the operation explicit, preview-first, and limited to one output file.

## Establish the brief

1. Treat everything after the leading `questionnaire` intent as the topic. If the topic is absent, collect it with the other missing required facts.
2. Read only facts already supplied in the request and existing canonical project context: `PRODUCT.md`, `DESIGN.md`, and topic-relevant files under `.impeccable/`. Missing context does not block the questionnaire. Do not create, repair, or update context files.
3. Treat every fact established by the request or canonical context as complete. Do not ask for it again.
4. Resolve these required facts:
   - one recipient or one audience with a shared role and knowledge level;
   - the decision or factual gap the questionnaire must resolve;
   - how the answers will be used.
5. Ask for all missing required facts in one compact round. Ask one short follow-up only when an answer is contradictory or still omits a required fact.
6. When the request names materially different recipients, explain that they need separate questionnaires and ask the user to select one for this run.

Match both language and tone to the recipient so they can answer comfortably. When no language is specified, use the language of the invocation. Adapt terminology, level of formality, and context depth to the recipient. Omit optional facts such as sender or deadline when the user did not provide them; never invent them.

## Write the questionnaire

Create 5–10 questions by default and never exceed 12, including the closing open question. Cover every required decision or factual gap with at least one question. Keep each question atomic, order questions by decision value, and group them under short theme headings.

Use this structure:

```markdown
# <Specific questionnaire title>

**Purpose:** <why the questionnaire exists>
**For:** <recipient or audience>
**How answers will be used:** <the decision or next action>

## Context

<Only the context the recipient needs to answer well.>

## How to answer

<Invite partial answers and explicit uncertainty. Include a deadline only when supplied.>

## <Theme>

### <One focused question>

_Why this matters: <include only when the question could otherwise be misread>_

>

## Anything else?

### What have we not asked that would materially change this decision?

>
```

Do not expose secrets, private filesystem paths, or internal context that the recipient does not need. Do not pad the questionnaire to the default range when fewer questions cover the stated need.

## Preview and write

1. Show the complete candidate Markdown in one fenced `markdown` block. State that no file has been written.
2. Ask the user to name the exact `.md` destination after seeing the preview. A destination supplied before the preview is not write approval; ask the user to confirm it again after the preview.
3. Treat a post-preview message that names the exact destination as approval for that preview only. Resolve a relative destination from the current project. Treat an exact absolute destination as explicit scope, subject to host permissions.
4. When the destination lacks a `.md` suffix, propose the normalized destination and wait for confirmation.
5. When the destination already exists, read it and report the conflict. Show a diff when practical. Require a new, explicit overwrite confirmation naming the same destination, or accept a different destination. Never infer overwrite approval.
6. When the user changes the questionnaire, show the complete revised preview and reset write approval.
7. After approval, create only the parent directories required by the confirmed destination and write exactly the previewed Markdown, with one final newline, to exactly one file. Report the resolved path.

Do not send the questionnaire, create tracker items, import or analyze answers, modify `PRODUCT.md`, `DESIGN.md`, `.impeccable/`, hooks, or configuration, or write any second file. Treat any follow-up operation as a separate user request after this capability completes.

## Completion criteria

Complete only when:

- one recipient or homogeneous audience is named;
- every stated knowledge gap maps to a question;
- the questionnaire contains no more than 12 atomic questions;
- the full Markdown was previewed before any write;
- the user approved an exact post-preview destination; and
- exactly one file matches the approved preview while canonical context remains unchanged.
