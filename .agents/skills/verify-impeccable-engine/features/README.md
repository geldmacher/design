# Engine verification features

- [Engine and package boundaries](engine.md): provenance, all five platforms, local execution, overrides and corrupted artifacts.
- [Design and hook journeys](journeys.md): detector results, Cursor pre-write denial, Codex post-write and Stop deduplication, configuration and portable behavior.

The executable entrypoint is `npm run verify:impeccable-engine` at the repository root. It runs the complete map on the available native platform; other platforms need CI evidence. Editor activation, browser sessions, image-provider calls and production projects are outside this verifier.
