# Install and update Design

Install Design from a **published GitHub Release**. Choose manual installation or ask your own agent to install it; both paths support later updates.

| How you want to proceed | Install | Update |
| --- | --- | --- |
| Manually, on macOS, Linux, or Windows | [Download and verify the release ZIP](#install-from-a-github-release) | [Replace it with a verified release](#update-manually) |
| Through your agent, on macOS or Linux | [Copy the installation prompt](#ask-your-agent-to-install) | [Use the update skill or prompt](#update-through-your-agent) |

Design requires **Node.js 22+**. Installation makes the plugin available to your editor; automatic UI checks remain off until you explicitly enable them in a project.

## Ask your agent to install

Copy this prompt into your Cursor or Codex agent:

```text
Install the latest stable GitHub Release of geldmacher/design for this editor.
Read https://github.com/geldmacher/design/blob/main/docs/installation.md and check
the release installer prerequisites. Use an existing Design source checkout or
clone https://github.com/geldmacher/design.git into a normal source directory,
outside the plugin installation directories. Open that checkout and invoke
/install-new-release-from-repo for Cursor or $install-new-release-from-repo for
Codex, targeting only this editor. If the skill cannot be discovered, run the
matching release installer command from the guide. Report the release, installed
version, verification result, and remaining activation steps.
```

The [release installer workflow](#release-installer-for-agent-assisted-installation) below contains the prerequisites and exact commands. Its skill is available only in the source checkout, not in the installed plugin. If the destination is not clear from your agent's editor, name Cursor or Codex in the prompt. To inspect without installing, request a **preview**.

## Update an existing installation

### Update manually

1. Download the ZIP for your editor, `SHA256SUMS`, and `provenance.json` from the [latest stable release](https://github.com/geldmacher/design/releases/latest).
2. Follow the [verification steps](#2-verify-the-downloads), just as for the first installation.
3. Retain the previous complete plugin directory and its matching verification files. Replace it with the complete verified package; never merge files from different releases.
4. Follow the [Cursor](#3a-install-the-cursor-archive) or [Codex](#3b-install-the-codex-archive) activation steps again, including Codex Marketplace/cache refresh when applicable.

For rollback, use the retained verified package or download and verify an older release, then repeat the same replacement and activation steps.

### Update through your agent

The existing **install-new-release-from-repo** skill handles updates as well as first installation. Open the Design source checkout and invoke:

| Editor | Update to the latest stable release | Preview only |
| --- | --- | --- |
| Cursor | `/install-new-release-from-repo` | `/install-new-release-from-repo preview` |
| Codex | `$install-new-release-from-repo` | `$install-new-release-from-repo preview` |

Or copy this prompt into your agent:

```text
Update Design to the latest stable GitHub Release for this editor.
Read https://github.com/geldmacher/design/blob/main/docs/installation.md. Use the
existing Design source checkout or prepare one as described there, then invoke
/install-new-release-from-repo for Cursor or $install-new-release-from-repo for
Codex. If the skill cannot be discovered, use the matching release installer
command. Report whether anything changed, the installed version, verification
result, and any remaining activation steps.
```

Each invocation resolves the latest stable release. If installed content already matches, the installer verifies it and makes no changes. Otherwise, reload Cursor or start a new Codex task after the update and review changed hook permissions. The installer handles Codex cache verification. You can also rerun the [terminal install command](#3-install-for-one-editor) yourself.

## Install from a GitHub Release

Use this manual path on macOS, Linux, or Windows. You need Node.js 22+ and Cursor or Codex with plugin support. A source checkout, Git, and npm are not needed for the ZIP path. Download the matching package, verify its files, then install it for your editor.

### 1. Download the package and verification files

Each Design GitHub Release contains separate packages for Cursor and Codex. From the [latest GitHub Release](https://github.com/geldmacher/design/releases/latest), download the ZIP for your editor, `SHA256SUMS`, and `provenance.json` into the same directory. For an older version, use that version's release page and matching verification files.

`SHA256SUMS` lists the expected file hashes, which let you check that your downloads match the release. `provenance.json` records which source commit and build produced them. Verify both the ZIP and `provenance.json` before installation.

Release assets use these names:

- `geldmacher-design-cursor-v<version>.zip`
- `geldmacher-design-codex-v<version>.zip`
- `RELEASE_NOTES.md`
- `SHA256SUMS`
- `provenance.json`

### 2. Verify the downloads

Run the following from the download directory. On macOS or Linux, replace the example version and editor in the archive name as needed:

```sh
archive="geldmacher-design-cursor-v0.13.1.zip"

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
$archive = "geldmacher-design-cursor-v0.13.1.zip"
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

### 3a. Install the Cursor archive

Install the complete extracted directory at:

- macOS/Linux: `~/.cursor/plugins/local/geldmacher-design`
- Windows: `%USERPROFILE%\.cursor\plugins\local\geldmacher-design`

For an update, retain the old complete directory and its matching verification files, then replace the directory atomically instead of merging versions. Reload Cursor, verify the installed manifest version, and review Hook Trust. To roll back, restore the retained old directory, reload Cursor, and repeat the same version and trust checks.

### 3b. Install the Codex archive

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

## Release installer for agent-assisted installation

On macOS or Linux, the agent uses this workflow to install or update from the latest stable release. You can also run these terminal commands yourself. The checkout supplies the installer and skill; it is not the plugin version being installed.

### 1. Check the prerequisites

| Requirement | What you need |
| --- | --- |
| Operating system | macOS or Linux. Use a release ZIP or supported Marketplace flow on Windows. |
| Tools | Git, Node.js 22 or newer, and npm. |
| Cursor installation | The `cursor` CLI, or `Cursor.app` in `/Applications` or your user's `Applications` folder on macOS. |
| Codex installation | The Codex CLI with `plugin add --json` and `plugin list --json` support. |
| Network access | GitHub and the npm registry. No GitHub CLI or GitHub token is needed for this public repository. |

You only need the editor you are installing into. Check the common tools in a terminal:

```sh
git --version
node --version
npm --version
```

### 2. Get the installer

Clone the repository into a normal source directory:

```sh
git clone https://github.com/geldmacher/design.git ~/src/geldmacher-design
cd ~/src/geldmacher-design
```

Keep this checkout outside `~/.cursor/plugins/local` and `~/.codex/plugins`: the installer replaces managed plugin copies in those locations. If you already have a checkout, use it and protect any local work before updating its source.

### 3. Install for one editor

Run the matching command from the repository root. You do not need to run `npm install` first.

**Cursor:**

```sh
npm run install:release -- --cursor-only
```

**Codex:**

```sh
npm run install:release -- --codex-only
```

To inspect the planned installation first, add `--dry-run`. For example:

```sh
npm run install:release -- --codex-only --dry-run
```

A preview still downloads and builds the release in temporary storage. It reads installed state but changes no installed plugin files, Marketplace entries, or Codex cache.

**Use the installation and update skill:** open this source checkout as a project in Cursor or Codex and use the matching command below. These are assistant requests, not terminal commands.

| Editor | Install or update | Preview only |
| --- | --- | --- |
| Cursor | `/install-new-release-from-repo` | `/install-new-release-from-repo preview` |
| Codex | `$install-new-release-from-repo` | `$install-new-release-from-repo preview` |

This skill exists only in the source checkout, not in installed packages. It uses the current editor as the destination unless you explicitly name the other one. If a new Codex task cannot discover it, use the terminal command above.

### 4. Open a fresh task and try Design

After installation:

1. Reload Cursor or start a new Codex task in your website or web-app project.
2. Review any changed hook permissions before granting trust.
3. Ask for `/design status` in Cursor or `$design status` in Codex to inspect the version and project configuration.
4. Try a request such as `$design critique the checkout page` (use `/design` in Cursor).

The installer reports the release, installed paths, versions, and verification result. Successful installation and cache verification do not establish that the editor has loaded the new plugin; that is why the fresh-task step matters. Status describes configuration, not proof that automatic checks have run.

## Troubleshooting

| Problem | Next step |
| --- | --- |
| Node.js is too old or a tool is missing | Install the required version or make it available on your terminal's `PATH`, then rerun the command. |
| The repository install skill is missing | Open the source checkout, not your application project. Start a new Codex task or use the terminal command. |
| Download or build fails | Check GitHub/npm access and read the retained error report before retrying. See [failure recovery](#recover-from-a-failed-installation). |
| Installation succeeded, but Design is missing or appears outdated | Reload Cursor or start a new Codex task. For a manual Codex install, also refresh or reinstall its Marketplace entry and check the cached manifest version. |
| Automatic checks do not run | They are off by default. In your application project, request `design setup` with your editor's prefix, review its preview, and confirm if you want to enable them. |

## What the release installer does

This section explains the installer's verification and recovery details. It is useful when inspecting an installation report or investigating a failure.

The helper selects GitHub's latest published stable release, checks its `vMAJOR.MINOR.PATCH` tag and manifest versions, and prepares that exact commit in a temporary checkout. It runs `npm ci` and the release's `deploy:prepare` checks there. Preparation must leave that checkout clean. Your open repository's branches, staged changes, and other local work are preserved.

A normal invocation authorizes installation into the selected editor without a second confirmation, subject to the editor's sandbox permissions. Within one invocation, preview and apply use the same verified commit and built files. A later invocation resolves the latest release again.

| Editor | Installed source location |
| --- | --- |
| Cursor | `~/.cursor/plugins/local/geldmacher-design` |
| Codex | `~/.codex/plugins/geldmacher-design`, registered through this plugin's entry in the `personal` Marketplace |

The local installer handles replacement, rollback, and Codex cache verification. Local versions have a `+local.<host>.<digest>` suffix identifying the editor and a hash of the packaged content. They are built from released source and need not be byte-identical to the published ZIP.

The final report includes the release URL, tag, commit, destinations, local versions, content hashes, and verification result. Successful temporary workspaces are removed: the source path in a deployment receipt records where preparation happened, while the commit and hashes identify its content. The helper does not restart the editor, grant trust, enable project checks, or publish anything.

### Recover from a failed installation

Missing prerequisites, release lookup failures, version mismatches, build failures, and deployment errors stop the run. Once preparation has started, the error points to retained temporary evidence, including `installation.json` and the source checkout.

Before retrying:

1. Read the recorded phase and original error.
2. Check whether installation had started and whether rollback completed.
3. Resolve the reported cause; recover an incomplete rollback before another attempt.
4. Rerun explicitly when recovery is complete.

A verification failure after installation can leave the new version installed. The helper preserves failure evidence and does not retry automatically.

## Install from the Git or Marketplace source

This is an alternative for teams that already manage GitHub Marketplace sources. For release-based installation, select a published version tag or its exact commit. A branch follows repository changes and can include unreleased work.

The repository contains a Cursor Marketplace manifest at `.cursor-plugin/marketplace.json` and a Codex catalog at `.agents/plugins/marketplace.json`. Both point to this repository's plugin root; generated `.build` directories are never an import source.

### Cursor

For Cursor, add `https://github.com/geldmacher/design` as a team or personal Marketplace source using Cursor's repository-import flow, then select **geldmacher-design**. Reload Cursor after installation or update, inspect the installed manifest version, and review Hook Trust before enabling the plugin's hook.

### Codex

For Codex, import `https://github.com/geldmacher/design` as a GitHub Marketplace source, leave the plugin path at the repository root (`./`), and select a branch, tag, or commit according to the update policy you want. The catalog is named **Geldmacher Design**. Repository import, synchronization, catalog policy, installation, and enablement remain distinct states; follow the [official OpenAI Plugin Management guide](https://learn.chatgpt.com/docs/enterprise/plugin-management). After an import or synchronization, verify the selected source revision and cached manifest, review trust, and start a new Codex task.

### Update or roll back a Git source

Pinning a version tag or commit makes rollback explicit: select the earlier Git ref, synchronize the Marketplace again, verify the refreshed cache, and start a new task. Selecting `main` follows future repository updates and is less suitable for controlled rollback.
