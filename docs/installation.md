# Install Design from GitHub

Design has two independent GitHub distribution paths for Cursor and Codex:

- **Repository or Marketplace source** lets a supported host import `https://github.com/geldmacher/design` and follow the selected Git ref.
- **GitHub Release archives** provide immutable, host-specific ZIP files for a particular version, with checksums and provenance suitable for download, update, and rollback.

Neither source selection nor archive extraction proves that a host has refreshed its cache, trusted hooks, reloaded the plugin, or activated it in a new task. Marketplace submission, local deployment, host restart, and GitHub publication are separate maintainer or user actions.

## Install the latest release from your harness

This source-repository workflow supports Cursor and Codex on macOS and Linux. Install Git, Node.js 22 or newer, and npm first. Cursor must be available through its CLI or, on macOS, as `Cursor.app` in `/Applications` or your user's `Applications` folder. Codex requires a CLI with `plugin add --json` and `plugin list --json` support. GitHub and npm registry access are required; no GitHub CLI or token is needed for this public repository.

Clone the source repository outside managed plugin directories, then open it as a project in your harness:

```sh
git clone https://github.com/geldmacher/design.git ~/src/geldmacher-design
```

For an existing checkout, protect local work before updating it to a revision containing the new skill. The command is available only in the open source repository; it is not shipped in installed plugin packages. If Codex does not discover a newly added repository skill in an existing task, start a fresh task in that repository.

| Harness | Install or update | Preview only |
| --- | --- | --- |
| Cursor | `/install-new-release-from-repo` | `/install-new-release-from-repo preview` |
| Codex | `$install-new-release-from-repo` | `$install-new-release-from-repo preview` |

The active harness is the default destination. You can explicitly name Cursor or Codex instead. An unknown harness requires a host choice; the helper requires exactly one host and never defaults to both.

The equivalent shell commands, from the source repository root, are:

```sh
npm run install:release -- --cursor-only
npm run install:release -- --codex-only --dry-run
```

No dependency installation is needed in the open checkout to start this helper. It selects GitHub's latest published stable release, requires a matching `vMAJOR.MINOR.PATCH` tag and manifests, and prepares that exact commit in its own temporary checkout. It runs `npm ci` and the release's `deploy:prepare` checks there. The checkout must remain clean after preparation. Local branches, staged changes, and other work in your open repository are preserved.

Preview downloads and builds source in temporary storage and reads installed state, but makes no changes to installed plugin files, Marketplace entries, or the Codex plugin cache. A normal install invocation authorizes the displayed installation for that host and proceeds without a second confirmation, subject to the harness's sandbox permissions. Preview and apply in that invocation use the same pinned commit and built files. A later invocation resolves the latest release again.

The existing local installer owns host replacement, rollback, and Codex cache verification. Destinations remain `~/.cursor/plugins/local/geldmacher-design` and `~/.codex/plugins/geldmacher-design`; Codex uses the plugin's entry in the `personal` Marketplace. The installed version has a `+local.<host>.<digest>` suffix. It is built from released source and is not asserted to be byte-identical to the published ZIP.

The final report includes the release URL, tag, commit, destinations, local versions, content hashes, and installation verification. Successful preparation workspaces are removed; the source path in deployment receipts is historical, while the commit and hashes remain reproducible evidence. An unchanged installation is a verified no-op. After changes, reload Cursor or start a new Codex task and review changed hooks. The helper never restarts a host, grants trust, enables project checks, or publishes anything. Installed/cache verification is not live activation evidence.

Missing prerequisites, release lookup failures, version mismatches, build failures, and deployment errors stop the run. Once preparation has started, the error identifies a retained temporary `installation.json` and source checkout. Inspect its phase, original error, and the local installer's rollback result before explicitly retrying. A verification failure after installation may leave the new version installed; an incomplete rollback requires recovery before another attempt. The helper does not overwrite retained failure evidence or automatically retry. Use the other installation paths below on platforms outside this helper's support boundary.

## Install from the Git or Marketplace source

The repository contains a Cursor Marketplace manifest at `.cursor-plugin/marketplace.json` and a Codex catalog at `.agents/plugins/marketplace.json`. Both point to this repository's plugin root; generated `.build` directories are never an import source.

For Cursor, add `https://github.com/geldmacher/design` as a team or personal Marketplace source using Cursor's repository-import flow, then select **geldmacher-design**. Reload Cursor after installation or update, inspect the installed manifest version, and review Hook Trust before enabling the plugin's hook.

For Codex, import `https://github.com/geldmacher/design` as a GitHub Marketplace source, leave the plugin path at the repository root (`./`), and select a branch, tag, or commit according to the update policy you want. The catalog is named **Geldmacher Design**. Repository import, synchronization, catalog policy, installation, and enablement remain distinct states; follow the [official OpenAI Plugin Management guide](https://learn.chatgpt.com/docs/enterprise/plugin-management). After an import or synchronization, verify the selected source revision and cached manifest, review trust, and start a new Codex task.

Pinning a version tag or commit makes rollback explicit: select the earlier Git ref, synchronize the Marketplace again, verify the refreshed cache, and start a new task. Selecting `main` follows future repository updates and is less suitable for controlled rollback.

## Install from a GitHub Release

Each Design GitHub Release contains separate packages for Cursor and Codex. Download only the intended host archive plus `SHA256SUMS` and `provenance.json` from the [latest GitHub Release](https://github.com/geldmacher/design/releases/latest). Do not install the archive until both the selected ZIP and `provenance.json` match their exact entries in `SHA256SUMS`.

Release assets use these names:

- `geldmacher-design-cursor-v<version>.zip`
- `geldmacher-design-codex-v<version>.zip`
- `RELEASE_NOTES.md`
- `SHA256SUMS`
- `provenance.json`

On macOS or Linux, replace the example version and host as needed:

```sh
archive="geldmacher-design-cursor-v0.9.0.zip"

verify_release_file() {
  file="$1"
  checksum_line="$(awk -v file="$file" '$2 == file { print; count++ } END { exit count == 1 ? 0 : 1 }' SHA256SUMS)" || {
    echo "SHA256SUMS must contain exactly one entry for $file" >&2
    exit 1
  }
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s\n' "$checksum_line" | sha256sum -c -
  else
    printf '%s\n' "$checksum_line" | shasum -a 256 -c -
  fi
}

verify_release_file "$archive"
verify_release_file "provenance.json"
```

On Windows PowerShell:

```powershell
$archive = "geldmacher-design-cursor-v0.9.0.zip"
$files = @($archive, "provenance.json")
$checksumLines = Get-Content -LiteralPath .\SHA256SUMS

foreach ($file in $files) {
  $pattern = '^(?<hash>[0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($file) + '$'
  $matches = @($checksumLines | Select-String -Pattern $pattern)
  if ($matches.Count -ne 1) {
    throw "SHA256SUMS must contain exactly one entry for $file"
  }
  $expected = $matches[0].Matches[0].Groups['hash'].Value.ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath ".\$file" -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "SHA-256 mismatch for $file"
  }
  Write-Host "$($file): OK"
}
```

`provenance.json` binds the version, tag, repository commit, Git tree, release gate, target content hashes, archive hashes, file counts, release-notes hash, and canonical receipt. Confirm that the identity and selected archive match the intended release. A mismatch is a hard stop.

Each ZIP expands to exactly one top-level `geldmacher-design/` directory. The matching manifest must be directly below it:

- Cursor: `geldmacher-design/.cursor-plugin/plugin.json`
- Codex: `geldmacher-design/.codex-plugin/plugin.json`

The directory also contains a compact `README.md` and this installation guide.

### Cursor archive

Install the complete extracted directory at:

- macOS/Linux: `~/.cursor/plugins/local/geldmacher-design`
- Windows: `%USERPROFILE%\.cursor\plugins\local\geldmacher-design`

For an update, retain the old complete directory and its matching verification files, then replace the directory atomically instead of merging versions. Reload Cursor, verify the installed manifest version, and review Hook Trust. To roll back, restore the retained old directory, reload Cursor, and repeat the same version and trust checks.

### Codex archive

Place the complete extracted directory at:

- macOS/Linux: `~/.codex/plugins/geldmacher-design`
- Windows: `%USERPROFILE%\.codex\plugins\geldmacher-design`

Reference that directory from an existing personal Marketplace entry without replacing unrelated catalog content. The relevant item is:

```json
{
  "name": "geldmacher-design",
  "source": {
    "source": "local",
    "path": "./.codex/plugins/geldmacher-design"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Developer Tools"
}
```

Source placement is not activation. Fully restart the desktop app when required, refresh or reinstall **geldmacher-design** from its Marketplace, verify the cached manifest version, review any trust request, and start a new Codex task. For update or rollback, replace the complete source directory with the separately verified version and repeat every cache and new-task check. Never merge files from different releases.

The ZIP checksum proves the downloaded bytes only. It does not prove Marketplace acceptance, cache currentness, Cursor reload, Hook Trust, or fresh-task activation.
