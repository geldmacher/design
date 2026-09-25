import { enginePlatforms, resolveEngine, engineRelativePath } from '../src/impeccable-engine.mjs';
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import YAML from "yaml";
import {
  buildPluginTargets,
  projectDesignSkill,
  projectNativeSkill,
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
    assert.equal(agentPluginManifest.version, JSON.parse(readFileSync(join(repositoryRoot, "package.json"))).version);
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
    assert.match(agentPluginDesignSkill, /references\/capabilities.md/);
    assert.match(agentPluginDesignSkill, /references\/lifecycle\.md/);
    assert.match(readFileSync(join(first["agent-plugin"].path, "skills", "design", "references", "lifecycle.md"), "utf8"), /^## Detect$/m);
    assert.match(agentPluginDesignSkill, /change-interface-review/);
    assert.match(agentPluginDesignSkill, /stakeholder-questionnaire/);
    for (const host of ["agent-plugin", "cursor", "codex"]) {
      assert.deepEqual(existsSync(join(first[host].path, "docs")) ? readdirSync(join(first[host].path, "docs")) : [], host === "agent-plugin" ? [] : ["installation.md"]);
      const instructions = [join(first[host].path, "skills"), join(first[host].path, "agents")]
        .filter(existsSync).flatMap(resourceFiles).filter((path) => path.endsWith(".md"))
        .map((path) => readFileSync(path, "utf8")).join("\n");
      assert.doesNotMatch(instructions, /google-labs-code\/design\.md|https:\/\/github\.com\/pbakaus\/impeccable|## Module sources|Nielsen|Miller|Cowan|Stitch/);
      const hooksGuide = readFileSync(join(first[host].path, 'skills/impeccable/reference/hooks.md'), 'utf8');
      const doctorGuide = readFileSync(join(first[host].path, 'skills/impeccable/reference/doctor.md'), 'utf8');
      assert.doesNotMatch(hooksGuide, /npx impeccable|remove the hook's entries from every provider manifest/);
      assert.match(hooksGuide, /preserve other settings and every host manifest/);
      assert.doesNotMatch(doctorGuide, /doctor --fix|Do not ask permission first|UPDATE_AVAILABLE/);
      assert.match(doctorGuide, /explicit user authorization before editing/);
      assert.match(readFileSync(join(first[host].path, "THIRD_PARTY_NOTICES.md"), "utf8"), /https:\/\/github\.com\/pbakaus\/impeccable/);
      assert.deepEqual(readFileSync(join(first[host].path, "licenses", "impeccable-apache-2.0.txt")), readFileSync(join(repositoryRoot, "upstream", "LICENSE")));
      assert.equal(existsSync(join(first[host].path, "skills", "design", "references", "change-review.md")), true);
      assert.equal(existsSync(join(first[host].path, "skills", "design", "references", "questionnaire.md")), true);
      assert.equal(existsSync(join(first[host].path, "skills", "design", "scripts", "review-scope.mjs")), true);
      assert.equal(existsSync(join(first[host].path, "src", "detector-scan.mjs")), true);
      assert.equal(existsSync(join(first[host].path, "src", "impeccable-runtime.mjs")), true);
      assert.equal(existsSync(join(first[host].path, "modules/module.schema.json")), false);
      for (const moduleName of ["design-core", "impeccable"]) assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(first[host].path, `modules/${moduleName}.json`))), "$schema"), false);
      if (host !== "agent-plugin") assert.deepEqual(readdirSync(join(first[host].path, "assets")), ["logo.svg"]);
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
      // Follow the shipped router's selection source, not the repository docs.
      const routingPath = join(first[host].path, 'skills/design/references/capabilities.md');
      const routing = readFileSync(routingPath, 'utf8');
      assert.equal(routing, readFileSync(join(repositoryRoot, 'skills/design/references/capabilities.md'), 'utf8'));
      const selectionLink = routing.match(/\]\((\.\.\/\.\.\/impeccable\/SKILL\.md)\)/)?.[1];
      assert.ok(selectionLink, `${host} has no bundled command selection source`);
      const selectionPath = resolve(dirname(routingPath), selectionLink);
      const selection = readFileSync(selectionPath, 'utf8');
      const commandTable = selection.match(/^## (?:Commands|Operations)\n([\s\S]*?)\nRouting:/m)?.[1];
      assert.ok(commandTable, `${host} has no operation table`);
      const names = [...commandTable.matchAll(/^\| `([a-z][a-z0-9-]*)[^`]*`/gm)].map(match => match[1]);
      const metadata = JSON.parse(readFileSync(join(dirname(selectionPath), 'scripts/command-metadata.json'), 'utf8'));
      assert.deepEqual(names.sort(), Object.keys(metadata).sort(), `${host} selection inventory drifted`);
      for (const [, link] of commandTable.matchAll(/\]\((reference\/[^)]+)\)/g)) {
        assert.ok(existsSync(resolve(dirname(selectionPath), link)), `${host} missing selection playbook: ${link}`);
      }
    }
    assert.doesNotMatch(agentPluginDesignSkill, /\bdesign\s+(?:setup|status|diagnose|detect|questionnaire)\b/);
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
    assert.doesNotMatch(portableRouting, /(?<![\w./:>-])[/\$]impeccable(?= |`|$)/);
    const sourceImpeccableRoot = join(repositoryRoot, "skills", "impeccable");
    const portableImpeccableRoot = join(first["agent-plugin"].path, "skills", "impeccable");
    const documentationFinish = readFileSync(join(portableImpeccableRoot, 'reference/new-work.md'), 'utf8');
    assert.match(documentationFinish, /After the last correction, load \[degraded\/documenter\.md\]/);
    assert.match(documentationFinish, /token-bearing DESIGN\.md \*\*and\*\* `\.impeccable\/design\.json`/);
    assert.match(documentationFinish, /Ordinary extensions compare the finished build against the incumbent system, preserve its files/);
    assert.match(documentationFinish, /report pre-existing drift without repairing it unasked/);
    assert.match(documentationFinish, /Recheck after later edits/);

    for (const host of ['agent-plugin', 'cursor', 'codex']) {
      const target = first[host].path;
      assert.deepEqual(JSON.parse(readFileSync(join(target, 'licenses/impeccable-pin.json'))), impeccablePin);
      for (const platform of enginePlatforms) {
        const [os, arch] = platform.split('-');
        assert.equal(resolveEngine(target, { platform: os === 'windows' ? 'win32' : os, arch }).engineVersion, impeccablePin.engine.version);
        assert.deepEqual(readFileSync(join(target, engineRelativePath(platform))), readFileSync(join(repositoryRoot, engineRelativePath(platform))));
      }
      for (const retired of ['context.mjs', 'detect.mjs', 'hook.mjs', 'hook-admin.mjs']) assert.equal(existsSync(join(target, 'skills/impeccable/scripts', retired)), false);
      assert.equal(existsSync(join(target, '.agents/skills/verify-impeccable-engine')), false);
    }
    const panelText = readFileSync(join(portableImpeccableRoot, 'scripts/live-browser.js'), 'utf8');
    const commandDefinition = panelText.match(/const IMPECCABLE_COMMAND = [^;]+;/)[0];
    const panelCommand = new Function('window', `${commandDefinition} return IMPECCABLE_COMMAND;`);
    assert.equal(panelCommand({ __IMPECCABLE_COMMAND_PREFIX__: '/' }), 'operation:');
    assert.equal(panelCommand({ __IMPECCABLE_COMMAND_PREFIX__: '$' }), 'operation:');
    const portableNotices = readFileSync(join(first["agent-plugin"].path, "THIRD_PARTY_NOTICES.md"), "utf8");
    assert.doesNotMatch(portableNotices, /`upstream\//);
    assert.match(portableNotices, /`licenses\/impeccable-apache-2\.0\.txt`/);
    assert.equal(existsSync(join(first["agent-plugin"].path, "licenses", "impeccable-apache-2.0.txt")), true);
    assert.equal(existsSync(join(first["agent-plugin"].path, "mcp.json")), false);
    for (const hostOnly of [".agents", ".cursor-plugin", ".codex-plugin", "agents", "assets", "hooks", "scripts"]) {
      assert.equal(existsSync(join(first["agent-plugin"].path, hostOnly)), false, `${hostOnly} leaked into Agent Plugins target`);
    }
    for (const target of [first["agent-plugin"].path, first.cursor.path, first.codex.path]) {
      assert.equal(existsSync(join(target, "AGENTS.md")), false);
      assert.equal(existsSync(join(target, "rules")), false);
      for (const developmentRoot of [".agents", ".build", ".cursor", ".git", "node_modules", "tests", "upstream", "overlays"]) {
        assert.equal(existsSync(join(target, developmentRoot)), false, `${developmentRoot} leaked into ${target}`);
      }
      for (const updateSurface of [
        ".agents/skills/update-impeccable",
        ".cursor/commands/update-impeccable.md",
        "skills/update-impeccable",
        "commands/update-impeccable.md",
        "scripts/check-impeccable-upstream.mjs",
        "scripts/prepare-impeccable-update.mjs",
        "scripts/apply-impeccable-update.mjs",
        "scripts/lib/impeccable-maintenance.mjs",
        "scripts/lib/impeccable-vendor.mjs",
      ]) {
        assert.equal(existsSync(join(target, updateSurface)), false, `${updateSurface} leaked into ${target}`);
      }
    }
    for (const host of ["cursor", "codex"]) {
      const target = first[host].path;
      assert.equal(existsSync(join(target, "README.md")), true, `${host} release package is missing its compact README`);
      assert.equal(existsSync(join(target, "docs", "installation.md")), true, `${host} release package is missing installation guidance`);
      assert.match(readFileSync(join(target, "README.md"), "utf8"), /docs\/installation\.md/);
      for (const sourceOnly of [
        ".agents/skills/release-plugin",
        ".agents/skills/install-new-release-from-repo",
        ".cursor/commands/install-new-release-from-repo.md",
        "scripts/install-release-from-repo.mjs",
        ".cursor/commands/release-plugin.md",
        ".cursor-plugin/marketplace.json",
        "scripts/plugin-github-release.mjs",
      ]) {
        assert.equal(existsSync(join(target, sourceOnly)), false, `${sourceOnly} leaked into ${host}`);
      }
    }
    for (const host of ["cursor", "codex"]) {
      for (const name of ["design", "impeccable"]) {
        const relativePath = `skills/${name}/SKILL.md`;
        const source = readFileSync(join(repositoryRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
        const target = readFileSync(join(first[host].path, relativePath), "utf8");
        const frontmatter = (text) => YAML.parse(text.match(/^---\n([\s\S]*?)\n---\n/)[1]);
        const metadata = frontmatter(target);
        if (host === "cursor") {
          assert.equal(metadata["disable-model-invocation"], name !== "design");
          delete metadata["disable-model-invocation"];
        } else assert.equal(Object.hasOwn(metadata, "disable-model-invocation"), false);
        assert.deepEqual(metadata, frontmatter(source));
        const policy = YAML.parse(readFileSync(join(first[host].path, `skills/${name}/agents/openai.yaml`), "utf8"));
        assert.equal(policy.policy.allow_implicit_invocation, name === "design");
        let normalized = target.replace(/^disable-model-invocation: (true|false)\n/m, "");
        if (name === "design") {
          const hostLines = normalized.match(/^This package targets .*$/gm);
          assert.equal(hostLines?.length, 1);
          assert.ok(hostLines[0].includes(host === "cursor" ? "Cursor" : "Codex"));
          assert.ok(hostLines[0].includes(`\`<host>\` to \`${host}\``));
          assert.ok(hostLines[0].includes(`IMPECCABLE_HOST=${host}`));
          normalized = normalized.replace(`\n${hostLines[0]}`, "");
        }
        assert.equal(normalized, source, `${host} changed shared ${name} instructions outside the host projection`);
        const portable = frontmatter(readFileSync(join(first["agent-plugin"].path, relativePath), "utf8"));
        assert.equal(Object.hasOwn(portable, "disable-model-invocation"), false);
        assert.equal(portable.description, metadata.description);
      }
      for (const relativePath of [
        "skills/design/references/change-review.md",
        "skills/design/references/questionnaire.md",
        "skills/design/scripts/review-scope.mjs",
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

test('Design host projection rejects missing, duplicate and reversed markers', () => {
  const source = readFileSync(join(repositoryRoot, 'skills/design/SKILL.md'), 'utf8');
  const start = '<!-- design-host:start -->', end = '<!-- design-host:end -->';
  for (const malformed of [source.replace(start, ''), source.replace(end, ''), source + start, source + end, source.replace(start, 'SWAP').replace(end, start).replace('SWAP', end)]) {
    assert.throws(() => projectDesignSkill(malformed), /host markers/);
  }
  const projected = projectDesignSkill(source);
  assert.doesNotMatch(projected, /design-host:|CURSOR_PLUGIN_ROOT|\$\{PLUGIN_ROOT\}/);
  assert.equal(projectDesignSkill(source.replace(/\n/g, '\r\n')), projected);
  assert.ok(projected.endsWith(source.slice(source.indexOf(end) + end.length)));
});


test('native skill projection rejects unknown hosts, policies, and shared Cursor metadata', () => {
  const source = readFileSync(join(repositoryRoot, 'skills/design/SKILL.md'), 'utf8');
  assert.throws(() => projectNativeSkill(source, 'unknown', true), /Unknown native skill host/);
  assert.throws(() => projectNativeSkill(source, 'codex'), /policy must be explicit/);
  assert.throws(() => projectNativeSkill(source.replace('name: design', 'name: other'), 'codex', true), /Unknown native skill identity/);
  assert.throws(() => projectNativeSkill(source.replace('name: design', 'disable-model-invocation: true\nname: design'), 'codex', true), /Cursor-only/);
  for (const host of ['cursor', 'codex']) {
    assert.throws(() => projectNativeSkill(source.replace('<!-- design-host:end -->', ''), host, true), /markers/);
  }
});

for (const name of ['design', 'impeccable']) {
  for (const host of ['cursor', 'codex']) {
    test(`native skill projection normalizes CRLF for ${name} on ${host}`, () => {
      const lf = readFileSync(join(repositoryRoot, 'skills', name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
      const crlf = lf.replace(/\n/g, '\r\n');
      const expected = projectNativeSkill(lf, host, name === 'design');
      const actual = projectNativeSkill(crlf, host, name === 'design');
      assert.equal(actual, expected);
      assert.equal(actual.includes('\r'), false);
      assert.throws(() => projectNativeSkill(crlf.replace(/^---/, '--'), host, name === 'design'), /frontmatter is missing/);
    });
  }
}
