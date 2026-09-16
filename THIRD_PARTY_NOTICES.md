# Third-party notices

## Impeccable

- Project: Impeccable
- Source: https://github.com/pbakaus/impeccable
- Pinned release: `skill-v4.3.1`
- License: Apache License 2.0
- Vendored scope: official Cursor skill and its four Cursor agents

The unmodified upstream license is stored at `upstream/LICENSE`. Provenance, every imported file hash, and the closed transformation list are stored in `upstream/impeccable.lock.json`; the generated patch is stored under `upstream/patches/`.

The MIT license at the repository root applies to the Geldmacher wrapper only. It does not replace Impeccable's Apache-2.0 terms.

## Cursor plugin schema

- Source: https://github.com/cursor/plugins/blob/424829e3e0f7e5a8b9181412ca04e84e026a0c02/schemas/plugin.schema.json
- Vendored file: `schemas/plugin.schema.json`
- Integrity lock: `schemas/plugin.schema.lock.json`
- License note: the pinned repository commit has no repository-root license file; no license is inferred here.

The schema is included solely as the official validation contract for `.cursor-plugin/plugin.json`.

## Motion AI Kit

The free Motion subset is imported from https://github.com/motiondivision/ai-kit. The exact commit and archive hash are in `upstream/motion.pin.json`; original MIT license declarations and author metadata are retained in `upstream/motion-license.json`. Upstream supplied no standalone license text. The generated adaptation patch and file inventory are retained with the source. Packaged distributions include these declarations and the pin under `licenses/`. The hosted documentation service is independent of the source pin.
