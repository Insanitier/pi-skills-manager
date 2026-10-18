/**
 * Project-override helpers for top-level skills.
 *
 * Pi applies a project setting to a user-level skill only when the same path is
 * listed in the project's `skills` array: the project entry wins the path dedupe
 * and is then enabled or disabled by a matching `-` pattern. These helpers build,
 * clear, and detect those entries. Keep this module free of Pi runtime imports so
 * the pure logic stays unit-testable.
 */

import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { EditScope } from "./types.js";

function expandHome(input: string): string {
	if (input === "~") return homedir();
	if (input.startsWith("~/")) return join(homedir(), input.slice(2));
	return input;
}

export function stripPatternPrefix(entry: string): string {
	return entry.startsWith("!") || entry.startsWith("+") || entry.startsWith("-") ? entry.slice(1) : entry;
}

export function isWithinPath(path: string, parent: string): boolean {
	const target = resolve(path);
	const base = resolve(parent);
	return target === base || target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

/** Resolve a settings entry (`~`, absolute, or relative to baseDir) to an absolute path. */
export function resolveEntryPath(entry: string, baseDir: string): string {
	const expanded = expandHome(entry);
	return isAbsolute(expanded) ? resolve(expanded) : resolve(baseDir, expanded);
}

/** Portable value to write into project settings to claim a globally-defined skill. */
export function claimPathFor(skillPath: string): string {
	const home = resolve(homedir());
	const target = resolve(skillPath);
	if (target === home) return "~";
	if (target.startsWith(home.endsWith(sep) ? home : `${home}${sep}`)) return `~${target.slice(home.length)}`;
	return target;
}

/** Base directory a user-level skill's global pattern is relative to. */
export function userGlobalBaseDir(skillPath: string, agentDir: string, userAgentsDir: string): string {
	const target = resolve(skillPath);
	if (isWithinPath(target, agentDir)) return resolve(agentDir);
	if (isWithinPath(target, userAgentsDir)) return resolve(userAgentsDir);
	return dirname(target);
}

/** Whether the global settings currently enable a user-level skill pattern. */
export function globalDefaultEnabled(globalSkillEntries: string[], relPattern: string): boolean {
	let enabled = true;
	for (const entry of globalSkillEntries) {
		if (stripPatternPrefix(entry) === relPattern) enabled = !(entry.startsWith("-") || entry.startsWith("!"));
	}
	return enabled;
}

/** Whether any project `skills` entry resolves to the given skill path. */
export function projectClaimsPath(projectSkillEntries: string[], targetPath: string, projectBaseDir: string): boolean {
	const target = resolve(targetPath);
	return projectSkillEntries.some((entry) => resolveEntryPath(stripPatternPrefix(entry), projectBaseDir) === target);
}

/** Claim a global skill into project scope (`[path]` enables, `[path, -path]` disables). */
export function applyProjectClaim(current: string[], claim: string, enabled: boolean): string[] {
	const kept = current.filter((entry) => stripPatternPrefix(entry) !== claim);
	return enabled ? [...kept, claim] : [...kept, claim, `-${claim}`];
}

export function clearProjectClaim(current: string[], claim: string): string[] {
	return current.filter((entry) => stripPatternPrefix(entry) !== claim);
}

export function toggleScope(current: EditScope): EditScope {
	return current === "project" ? "global" : "project";
}
