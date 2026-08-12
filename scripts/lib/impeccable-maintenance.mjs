import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const pinRelativePath = "upstream/impeccable.pin.json";
export const issueMarker = "<!-- impeccable-upstream-monitor:v1 -->";
export const releasesApi = "https://api.github.com/repos/pbakaus/impeccable/releases?per_page=100";

const objectIdPattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const tagPattern = /^skill-v([0-9]+)\.([0-9]+)\.([0-9]+)$/;

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys differ: expected ${wanted.join(", ")}; received ${actual.join(", ")}.`);
  }
}

export function validatePin(pin) {
  assertExactKeys(pin, ["$schema", "schemaVersion", "name", "version", "repository", "tag", "tagObject", "commit", "archive"], "Impeccable pin");
  if (pin.$schema !== "./impeccable.pin.schema.json") throw new Error("Impeccable pin schema reference is invalid.");
  if (pin.schemaVersion !== 1) throw new Error("Impeccable pin schemaVersion must be 1.");
  if (pin.name !== "Impeccable") throw new Error("Impeccable pin name is invalid.");
  if (!versionPattern.test(pin.version)) throw new Error("Impeccable pin version must be a stable numeric semantic version.");
  if (pin.repository !== "https://github.com/pbakaus/impeccable") throw new Error("Impeccable pin repository is invalid.");
  if (pin.tag !== `skill-v${pin.version}` || !tagPattern.test(pin.tag)) throw new Error("Impeccable pin tag must equal skill-v<version>.");
  if (!objectIdPattern.test(pin.tagObject)) throw new Error("Impeccable pin tagObject must be 40 lowercase hex characters.");
  if (!objectIdPattern.test(pin.commit)) throw new Error("Impeccable pin commit must be 40 lowercase hex characters.");
  assertExactKeys(pin.archive, ["name", "url", "sha256"], "Impeccable pin archive");
  if (pin.archive.name !== "universal.zip") throw new Error("Impeccable pin archive name must be universal.zip.");
  const expectedUrl = `${pin.repository}/releases/download/${pin.tag}/${pin.archive.name}`;
  if (pin.archive.url !== expectedUrl) throw new Error("Impeccable pin archive URL does not match repository, tag, and asset name.");
  if (!sha256Pattern.test(pin.archive.sha256)) throw new Error("Impeccable pin archive SHA-256 must be 64 lowercase hex characters.");
  return Object.freeze({ ...pin, archive: Object.freeze({ ...pin.archive }) });
}

export function readPin(root = pluginRoot) {
  return validatePin(JSON.parse(readFileSync(join(root, pinRelativePath), "utf8")));
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseSkillTag(tag) {
  const match = String(tag || "").match(tagPattern);
  if (!match) return null;
  const parts = match.slice(1).map(BigInt);
  return { tag: match[0], version: parts.map(String).join("."), parts };
}

export function compareVersions(left, right) {
  const a = typeof left === "string" ? parseSkillTag(`skill-v${left}`)?.parts : left;
  const b = typeof right === "string" ? parseSkillTag(`skill-v${right}`)?.parts : right;
  if (!a || !b) throw new Error("Cannot compare invalid stable semantic versions.");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function successfulRelease(release) {
  const parsed = parseSkillTag(release?.tag_name);
  if (!parsed || release?.draft === true || release?.prerelease === true) return null;
  const expectedReleaseUrl = `https://github.com/pbakaus/impeccable/releases/tag/${parsed.tag}`;
  const expectedArchiveUrl = `https://github.com/pbakaus/impeccable/releases/download/${parsed.tag}/universal.zip`;
  if (release?.html_url !== expectedReleaseUrl) return null;
  const asset = Array.isArray(release.assets) ? release.assets.find((item) => item?.name === "universal.zip") : null;
  if (asset?.browser_download_url !== expectedArchiveUrl) return null;
  return {
    version: parsed.version,
    tag: parsed.tag,
    url: release.html_url,
    publishedAt: release.published_at || null,
    archiveUrl: asset.browser_download_url,
  };
}

function baseResult(pin, checkedAt) {
  return {
    schema: 1,
    tool: "impeccable-upstream-check",
    checkedAt,
    current: {
      version: pin.version,
      tag: pin.tag,
      tagObject: pin.tagObject,
      commit: pin.commit,
      archiveSha256: pin.archive.sha256,
    },
  };
}

export function evaluateReleases(pinInput, releases, checkedAt = new Date().toISOString()) {
  const pin = validatePin(pinInput);
  if (!Array.isArray(releases)) throw new Error("GitHub releases response must be an array.");
  const stable = releases.map(successfulRelease).filter(Boolean).sort((a, b) => compareVersions(b.version, a.version));
  const latest = stable[0] || null;
  const currentRelease = stable.find((release) => release.tag === pin.tag);
  if (!latest) {
    return { ...baseResult(pin, checkedAt), state: "unverifiable", latest: null, error: { code: "no-stable-release", message: "No stable Impeccable skill release with the canonical archive was returned." } };
  }
  if (!currentRelease) {
    return { ...baseResult(pin, checkedAt), state: "unverifiable", latest, error: { code: "pinned-release-missing", message: `The pinned release ${pin.tag} was not present in the returned release set.` } };
  }
  const comparison = compareVersions(pin.version, latest.version);
  if (comparison > 0) {
    return { ...baseResult(pin, checkedAt), state: "unverifiable", latest, error: { code: "pin-ahead-of-upstream", message: `The pin ${pin.tag} is newer than the latest returned release ${latest.tag}.` } };
  }
  return { ...baseResult(pin, checkedAt), state: comparison === 0 ? "current" : "update-available", latest, error: null };
}

function errorResult(pin, checkedAt, code, error) {
  return {
    ...baseResult(pin, checkedAt),
    state: "unverifiable",
    latest: null,
    error: { code, message: String(error?.message || error) },
  };
}

export async function checkUpstream({ pin: pinInput = readPin(), fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "", now = () => new Date(), timeoutMs = 10_000 } = {}) {
  const pin = validatePin(pinInput);
  const checkedAt = now().toISOString();
  if (typeof fetchImpl !== "function") return errorResult(pin, checkedAt, "fetch-unavailable", "Global fetch is unavailable.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "geldmacher-design-impeccable-monitor/1",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(releasesApi, { headers, signal: controller.signal });
    if (!response?.ok) {
      const remaining = response?.headers?.get?.("x-ratelimit-remaining");
      const code = response?.status === 403 && remaining === "0" ? "rate-limited" : `http-${response?.status || "error"}`;
      return errorResult(pin, checkedAt, code, `GitHub releases request failed with status ${response?.status || "unknown"}.`);
    }
    return evaluateReleases(pin, await response.json(), checkedAt);
  } catch (error) {
    return errorResult(pin, checkedAt, error?.name === "AbortError" ? "timeout" : "request-failed", error);
  } finally {
    clearTimeout(timeout);
  }
}

function githubHeaders(token) {
  if (!token) throw new Error("GITHUB_TOKEN is required for issue reconciliation.");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "geldmacher-design-impeccable-monitor/1",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubJson(fetchImpl, url, { token, method = "GET", body } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: githubHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response?.ok) throw new Error(`GitHub API ${method} ${url} failed with status ${response?.status || "unknown"}.`);
  if (response.status === 204) return null;
  return response.json();
}

export function renderUpdateIssue(result) {
  if (result?.state !== "update-available" || !result.latest) throw new Error("An update-available result is required to render the maintenance issue.");
  const title = `chore: update Impeccable to ${result.latest.tag}`;
  const body = [
    issueMarker,
    "## Impeccable update available",
    "",
    `- Bundled pin: \`${result.current.tag}\``,
    `- Latest stable skill: [\`${result.latest.tag}\`](${result.latest.url})`,
    "",
    "Prepare a reviewable candidate from the canonical source checkout:",
    "",
    "```bash",
    `npm run prepare:impeccable-update -- --to ${result.latest.tag}`,
    "```",
    "",
    "Review the candidate before invoking the separate apply command. This monitor never applies, commits, pushes, opens a pull request, deploys, or publishes an update.",
    "",
  ].join("\n");
  return { title, body };
}

export async function reconcileUpdateIssue({ result, fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN || "", repository = process.env.GITHUB_REPOSITORY || "" } = {}) {
  if (!["current", "update-available", "unverifiable"].includes(result?.state)) throw new Error("A valid upstream check result is required.");
  if (result.state !== "update-available") return { action: "none", reason: result.state };
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("GITHUB_REPOSITORY must be owner/name.");
  if (typeof fetchImpl !== "function") throw new Error("Global fetch is unavailable.");
  const base = `https://api.github.com/repos/${repository}`;
  const marked = [];
  for (let page = 1; page <= 10; page += 1) {
    const issues = await githubJson(fetchImpl, `${base}/issues?state=open&per_page=100&page=${page}`, { token });
    if (!Array.isArray(issues)) throw new Error("GitHub issues response must be an array.");
    marked.push(...issues.filter((issue) => !issue.pull_request && typeof issue.body === "string" && issue.body.includes(issueMarker)));
    if (issues.length < 100) break;
    if (page === 10) throw new Error("Open issue pagination exceeded the bounded reconciliation window.");
  }
  if (marked.length > 1) throw new Error("Multiple open Impeccable monitor issues exist; reconcile them manually.");
  const desired = renderUpdateIssue(result);
  if (marked.length === 0) {
    const created = await githubJson(fetchImpl, `${base}/issues`, { token, method: "POST", body: desired });
    return { action: "created", number: created.number, url: created.html_url };
  }
  const current = marked[0];
  if (current.title === desired.title && current.body === desired.body) return { action: "unchanged", number: current.number, url: current.html_url };
  const updated = await githubJson(fetchImpl, `${base}/issues/${current.number}`, { token, method: "PATCH", body: desired });
  return { action: "updated", number: updated.number, url: updated.html_url };
}
