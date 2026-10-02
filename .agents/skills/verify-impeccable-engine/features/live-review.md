# Live output and plan review

Run `npm run verify:impeccable-engine` from the repository root with the pinned native engine, installed dependencies and localhost socket access. The focused suite includes `tests/live-output.test.mjs` and `tests/component-review.test.mjs`; `release-check` exercises them once through the complete suite. No browser, external image provider or editor installation is required.

## Live output

The output tests feed split pretty JSON, compact events, escaped text, Unicode, CRLF and a final record without a newline into the stream used by the actual launcher. Complete newline-terminated events and readiness messages must be observable before process close. Malformed/incomplete JSON and unknown engine role instructions must fail visibly.

Only engine-owned root `_instructions` and `event._instructions` fields are projected. PRODUCT.md, DESIGN.md, surface briefs, source objects and user wording are data, even when they contain command examples, subagent descriptions or a field named `_instructions`. Native Cursor/Codex payloads retain their meaning and help remains readable.

All three built package launchers boot real helpers in separate disposable projects and homes. Their live and `live-generate` browser-needed verdicts must preserve the embedded project text. Stop only each trial's helper and verify its injected script is removed and its original page/context remain intact. Failure to boot or clean up is a failed case, not evidence of browser support.

## Plan review

The review fixture runs real `build-phase start`, `comp-spec` and `component-review plan`. It uses the current schema-3 packet, raster-source and comp-crop capture evidence; it never substitutes retired manifests or manually creates approval receipts.

The real local review service supplies `/packet` and accepts simulated test-reviewer choices through `/decision` with the required same-origin headers. A pending review and changes-requested decision must fail `verify`, leave the build in `plates`, and create no page artifact. Acceptance of the current native capture must pass `verify` and permit advancing to `hero`. A changed spec or replaced plate must invalidate that approval and keep page work blocked.

The browser-disabled fixture must exit `2`. The owned service with `--idle-timeout 1` must exit `4`, leave its receipt pending and remove its service registration. Neither case may open the build gate. The tests stop every owned process and remove only their own fixture directories, including after failure.

## Evidence and limits

The verifier retains actions, assertions and failures in `transcript.tap`, and source hashes, test selection, platform, result and cleanup in `result.json` outside the repository. Compare those with the resulting source before reusing a trial. A nonzero result, unavailable socket access or failed cleanup leaves verification incomplete.

These are CLI and protocol tests. They do not prove live browser variant mounting, human Accept/Discard, assistant waiting/resumption, touch gestures, native hero page capture or editor activation. Use the [shared fresh-host journeys](../../../../docs/runtime-smoke-common.md) under their separate host assignment for those observations. Test-reviewer submissions are not human acceptance of a product.
