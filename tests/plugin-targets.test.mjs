import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildPluginTargets,
  createTargetBuildWorkspace,
  removeTargetBuildWorkspace,
} from "../scripts/build-plugin-targets.mjs";
import { readPin } from "../scripts/lib/impeccable-maintenance.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const impeccablePin = readPin(repositoryRoot);

function resourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? resourceFiles(path) : [path];
  });
}

test("deterministic target allowlists isolate the portable package and native adapters", () => {
  const firstWorkspace = createTargetBuildWorkspace();
  const secondWorkspace = createTargetBuildWorkspace();
  try {
    const first = buildPluginTargets(firstWorkspace.targets);
    const second = buildPluginTargets(secondWorkspace.targets);
    assert.equal(first["agent-plugin"].hash, second["agent-plugin"].hash);
    assert.equal(first.cursor.hash, second.cursor.hash);
    assert.equal(first.codex.hash, second.codex.hash);
    assert.equal(JSON.parse(readFileSync(join(first.cursor.path, ".cursor-plugin", "plugin.json"))).name, "geldmacher-design");
    const codexManifest = JSON.parse(readFileSync(join(first.codex.path, ".codex-plugin", "plugin.json")));
    assert.equal(codexManifest.name, "geldmacher-design");
    const agentPluginManifest = JSON.parse(readFileSync(join(first["agent-plugin"].path, "plugin.json")));
    assert.equal(agentPluginManifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    assert.equal(agentPluginManifest.version, "0.6.0");
    assert.equal(Object.hasOwn(agentPluginManifest, "extensions"), false);
    assert.equal(existsSync(join(first.cursor.path, "hooks", "cursor-hooks.json")), true);
    assert.equal(existsSync(join(first.cursor.path, "hooks", "hooks.json")), false);
    assert.equal(existsSync(join(first.codex.path, "hooks", "hooks.json")), true);
    assert.equal(existsSync(join(first.codex.path, "hooks", "cursor-hooks.json")), false);
    assert.deepEqual(JSON.parse(readFileSync(join(first.cursor.path, "modules", "design-core.json"))).contributes.hooks, ["hooks/cursor-hooks.json"]);
    assert.deepEqual(JSON.parse(readFileSync(join(first.codex.path, "modules", "design-core.json"))).contributes.hooks, ["hooks/hooks.json"]);
    const agentPluginImpeccableSkill = readFileSync(join(first["agent-plugin"].path, "skills", "impeccable", "SKILL.md"), "utf8");
    const agentPluginDesignSkill = readFileSync(join(first["agent-plugin"].path, "skills", "design", "SKILL.md"), "utf8");
    const cursorImpeccableSkill = readFileSync(join(first.cursor.path, "skills", "impeccable", "SKILL.md"), "utf8");
    const codexImpeccableSkill = readFileSync(join(first.codex.path, "skills", "impeccable", "SKILL.md"), "utf8");
    for (const skill of [agentPluginImpeccableSkill, cursorImpeccableSkill, codexImpeccableSkill]) {
      assert.doesNotMatch(skill, /^version\s*:/m);
      assert.match(skill, /^license: Apache-2\.0$/m);
      assert.match(skill, new RegExp(`^  version: "${impeccablePin.version.replaceAll(".", "\\.")}"$`, "m"));
    }
    assert.doesNotMatch(agentPluginImpeccableSkill, /\.\.\/\.\.\/agents\//);
    assert.match(agentPluginImpeccableSkill, /reference\/degraded\//);
    assert.match(agentPluginImpeccableSkill, /`operation: <name>`/);
    assert.match(agentPluginDesignSkill, /`setup`, `status`, or `doctor` intent addressed to the loaded Design skill/);
    assert.match(agentPluginDesignSkill, /### Detect request/);
    assert.match(agentPluginDesignSkill, /change-interface-review/);
    assert.match(agentPluginDesignSkill, /stakeholder-questionnaire/);
    for (const host of ["agent-plugin", "cursor", "codex"]) {
      assert.equal(existsSync(join(first[host].path, "skills", "design", "references", "change-review.md")), true);
      assert.equal(existsSync(join(first[host].path, "skills", "design", "references", "questionnaire.md")), true);
      assert.equal(existsSync(join(first[host].path, "skills", "design", "scripts", "review-scope.mjs")), true);
      assert.equal(existsSync(join(first[host].path, "src", "detector-scan.mjs")), true);
      assert.equal(existsSync(join(first[host].path, "src", "impeccable-runtime.mjs")), true);
      const designModule = JSON.parse(readFileSync(join(first[host].path, "modules", "design-core.json"), "utf8"));
      assert.equal(designModule.capabilities.some((capability) => capability.id === "change-interface-review"), true);
      assert.equal(designModule.capabilities.some((capability) => capability.id === "detector-scan"), true);
      assert.equal(designModule.capabilities.some((capability) => capability.id === "stakeholder-questionnaire"), true);
      assert.equal(designModule.contributes.scripts.includes("skills/design/scripts/review-scope.mjs"), true);
      assert.equal(designModule.contributes.agents.length, 0);
      assert.equal(designModule.contributes.mcpServers.length, 0);
      assert.deepEqual(
        readFileSync(join(first[host].path, "skills", "design", "references", "questionnaire.md")),
        readFileSync(join(repositoryRoot, "skills", "design", "references", "questionnaire.md")),
        `${host} drifted the host-neutral stakeholder questionnaire`,
      );
    }
    assert.doesNotMatch(agentPluginDesignSkill, /\bdesign\s+(?:setup|status|doctor|detect|questionnaire)\b/);
    const portableResourcePaths = resourceFiles(join(first["agent-plugin"].path, "skills"))
      .filter((path) => /\.(?:md|mjs|js)$/.test(path));
    const portableResources = portableResourcePaths
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const portableMarkdown = portableResourcePaths
      .filter((path) => path.endsWith(".md"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    assert.doesNotMatch(portableResources, /impeccable[-_](?:finish[-_]reviewer|documenter|asset[-_]producer|manual[-_]edit[-_]applier)|SUBAGENT_AUTHORIZATION|agent continuation/i);
    assert.doesNotMatch(portableMarkdown, /`impeccable\s+(?:adapt|animate|audit|bolder|clarify|colorize|critique|delight|distill|doctor|document|extract|harden|hooks|init|layout|live|onboard|optimize|overdrive|polish|quieter|shape|typeset)(?:\s+[^`]*)?`|\b(?:run|offer|invoke|recommend|use)\s+impeccable\s+(?:adapt|animate|audit|bolder|clarify|colorize|critique|delight|distill|doctor|document|extract|harden|hooks|init|layout|live|onboard|optimize|overdrive|polish|quieter|shape|typeset)(?=\s|[),.:]|$)/i);
    assert.match(portableResources, /operation: polish/);
    assert.doesNotMatch(portableResources, /Impeccable-operation:|operation:impeccable|https:\/the loaded Impeccable skill|the loaded Impeccable skill\.style/);
    for (const degradedRole of ["asset-producer.md", "documenter.md", "finish-reviewer.md", "manual-edit-applier.md"]) {
      assert.match(portableResources, new RegExp(`degraded/${degradedRole.replace(".", "\\.")}`));
    }
    const portableRouting = readFileSync(join(first["agent-plugin"].path, "skills", "impeccable", "reference", "routing.md"), "utf8");
    assert.doesNotMatch(portableRouting, /\/impeccable|\$impeccable/);
    const sourceImpeccableRoot = join(repositoryRoot, "skills", "impeccable");
    const portableImpeccableRoot = join(first["agent-plugin"].path, "skills", "impeccable");
    const transformedPortableScripts = new Set([
      "scripts/context.mjs",
      "scripts/lib/provider.mjs",
      "scripts/live-browser.js",
      "scripts/live/instructions.mjs",
    ]);
    for (const sourcePath of resourceFiles(sourceImpeccableRoot).filter((path) => /\.(?:mjs|js)$/.test(path))) {
      const relativePath = relative(sourceImpeccableRoot, sourcePath).split(sep).join("/");
      if (transformedPortableScripts.has(relativePath)) continue;
      assert.deepEqual(
        readFileSync(join(portableImpeccableRoot, relativePath)),
        readFileSync(sourcePath),
        `portable projection unexpectedly changed runtime resource ${relativePath}`,
      );
    }
    const portableConceptSeed = readFileSync(join(portableImpeccableRoot, "scripts", "concept-seed.mjs"), "utf8");
    assert.match(portableConceptSeed, /https:\/\/impeccable\.style\/api/);
    assert.match(portableConceptSeed, /https:\/\/impeccable\.style\/worlds\/cards/);
    const portableContext = readFileSync(join(portableImpeccableRoot, "scripts", "context.mjs"), "utf8");
    assert.match(portableContext, /https:\/\/impeccable\.style/);
    assert.match(portableContext, /\.github\/hooks\/impeccable\.json/);
    assert.match(portableContext, /skills\/impeccable\/scripts\/hook\.mjs/);
    const portableLiveBrowser = readFileSync(join(portableImpeccableRoot, "scripts", "live-browser.js"), "utf8");
    assert.match(portableLiveBrowser, /operation:'\s*\? 'operation:'/);
    assert.match(portableLiveBrowser, /\/src\/lib\/impeccable\/__runtime\.js/);
    const portableNotices = readFileSync(join(first["agent-plugin"].path, "THIRD_PARTY_NOTICES.md"), "utf8");
    assert.doesNotMatch(portableNotices, /`upstream\//);
    assert.match(portableNotices, /`licenses\/impeccable-apache-2\.0\.txt`/);
    assert.equal(existsSync(join(first["agent-plugin"].path, "licenses", "impeccable-apache-2.0.txt")), true);
    assert.equal(existsSync(join(first["agent-plugin"].path, "mcp.json")), false);
    for (const hostOnly of [".agents", ".cursor-plugin", ".codex-plugin", "agents", "assets", "hooks", "scripts"]) {
      assert.equal(existsSync(join(first["agent-plugin"].path, hostOnly)), false, `${hostOnly} leaked into Agent Plugins target`);
    }
    for (const target of [first["agent-plugin"].path, first.cursor.path, first.codex.path]) {
      for (const developmentRoot of [".agents", ".build", ".cursor", ".git", "node_modules", "tests", "upstream", "overlays"]) {
        assert.equal(existsSync(join(target, developmentRoot)), false, `${developmentRoot} leaked into ${target}`);
      }
    }
    for (const host of ["cursor", "codex"]) {
      const target = first[host].path;
      assert.equal(existsSync(join(target, "README.md")), true, `${host} release package is missing its compact README`);
      assert.equal(existsSync(join(target, "docs", "installation.md")), true, `${host} release package is missing installation guidance`);
      assert.match(readFileSync(join(target, "README.md"), "utf8"), /docs\/installation\.md/);
      for (const sourceOnly of [
        ".agents/skills/release-plugin",
        ".cursor/commands/release-plugin.md",
        ".cursor-plugin/marketplace.json",
        "scripts/plugin-github-release.mjs",
      ]) {
        assert.equal(existsSync(join(target, sourceOnly)), false, `${sourceOnly} leaked into ${host}`);
      }
    }
    for (const host of ["cursor", "codex"]) {
      for (const relativePath of [
        "skills/design/SKILL.md",
        "skills/design/references/change-review.md",
        "skills/design/references/questionnaire.md",
        "skills/design/scripts/review-scope.mjs",
        "skills/impeccable/SKILL.md",
        "agents/impeccable-asset-producer.md",
        "agents/impeccable-documenter.md",
        "agents/impeccable-finish-reviewer.md",
        "agents/impeccable-manual-edit-applier.md",
      ]) {
        assert.deepEqual(readFileSync(join(first[host].path, relativePath)), readFileSync(join(repositoryRoot, relativePath)), `${host} drifted ${relativePath}`);
      }
    }
    assert.deepEqual(readFileSync(join(first.cursor.path, "hooks", "cursor-hooks.json")), readFileSync(join(repositoryRoot, "hooks", "cursor-hooks.json")));
    assert.deepEqual(readFileSync(join(first.cursor.path, "hooks", "impeccable-plugin-hook.mjs")), readFileSync(join(repositoryRoot, "hooks", "impeccable-plugin-hook.mjs")));
    assert.deepEqual(readFileSync(join(first.codex.path, "hooks", "hooks.json")), readFileSync(join(repositoryRoot, "hooks", "hooks.json")));
    assert.deepEqual(readFileSync(join(first.codex.path, "hooks", "impeccable-codex-hook.mjs")), readFileSync(join(repositoryRoot, "hooks", "impeccable-codex-hook.mjs")));
  } finally {
    removeTargetBuildWorkspace(firstWorkspace);
    removeTargetBuildWorkspace(secondWorkspace);
  }
});

test("target builder rejects roots, foreign temporary paths, and symlink escapes before cleanup", () => {
  const foreign = mkdtempSync(join(tmpdir(), "foreign-design-target-"));
  const sentinel = join(foreign, "sentinel.txt");
  writeFileSync(sentinel, "unchanged\n");
  try {
    for (const rejected of [
      repositoryRoot,
      join(repositoryRoot, ".build"),
      join(repositoryRoot, ".git"),
      join(repositoryRoot, "node_modules"),
      join(repositoryRoot, ".tests"),
      tmpdir(),
      foreign,
    ]) {
      assert.throws(() => buildPluginTargets(rejected), /target output must be the repository \.build\/plugins path or an owned build workspace targets path/);
      assert.equal(readFileSync(sentinel, "utf8"), "unchanged\n");
    }

    const workspace = createTargetBuildWorkspace();
    try {
      symlinkSync(foreign, workspace.targets);
      assert.throws(() => buildPluginTargets(workspace.targets), /target output crosses a symlink/);
      assert.equal(readFileSync(sentinel, "utf8"), "unchanged\n");
    } finally {
      removeTargetBuildWorkspace(workspace);
    }
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});
