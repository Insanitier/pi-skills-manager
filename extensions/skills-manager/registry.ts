import { readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
	DefaultPackageManager,
	getAgentDir,
	parseFrontmatter,
	SettingsManager,
	stripFrontmatter,
	type ExtensionContext,
	type ResolvedResource,
} from "@earendil-works/pi-coding-agent";
import { findProjectPiDir, projectSettingsTrusted } from "./paths.js";
import { globalDefaultEnabled, isWithinPath, projectClaimsPath, userGlobalBaseDir } from "./overrides.js";
import type { SkillEntry, SkillOrigin, SkillRegistry, SkillScope } from "./types.js";

interface RegistryContext {
	projectBaseDir: string;
	projectRoots: string[];
	projectSkillEntries: string[];
	globalSkillEntries: string[];
	agentDir: string;
	userAgentsDir: string;
}

function compareSkills(a: SkillEntry, b: SkillEntry): number {
	const scopeRank = (scope: SkillScope) => scope === "project" ? 0 : scope === "user" ? 1 : 2;
	const rank = scopeRank(a.realScope) - scopeRank(b.realScope);
	if (rank !== 0) return rank;
	if (a.origin !== b.origin) return a.origin === "top-level" ? -1 : 1;
	return a.name.localeCompare(b.name);
}

function parseSkillFile(path: string): Pick<SkillEntry, "name" | "description" | "content" | "frontmatter"> | null {
	try {
		const raw = readFileSync(path, "utf8");
		const { frontmatter } = parseFrontmatter<Record<string, unknown>>(raw);
		const name = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
		const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
		if (!name || !description) return null;
		return {
			name,
			description,
			content: stripFrontmatter(raw).trim(),
			frontmatter: Object.fromEntries(Object.entries(frontmatter).filter(([, value]) => value !== undefined)),
		};
	} catch {
		return null;
	}
}

function projectResourceRoots(cwd: string): string[] {
	const userAgents = resolve(homedir(), ".agents");
	const roots = [resolve(findProjectPiDir(cwd))];
	let dir = resolve(cwd);
	while (true) {
		const agents = resolve(dir, ".agents");
		if (agents !== userAgents) roots.push(agents);
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return roots;
}

function toSkillEntry(resource: ResolvedResource, ctx: RegistryContext): SkillEntry | null {
	const parsed = parseSkillFile(resource.path);
	if (!parsed) return null;
	const declaredScope = resource.metadata.scope as SkillScope;
	const origin = resource.metadata.origin as SkillOrigin;
	const target = resolve(resource.path);
	const ownedByProject = ctx.projectRoots.some((root) => isWithinPath(target, root));
	// A project settings entry that resolves to a file outside the project's own
	// resource dirs is an override claiming a globally-defined skill.
	const claimed = origin === "top-level" && !ownedByProject && projectClaimsPath(ctx.projectSkillEntries, target, ctx.projectBaseDir);
	const realScope: SkillScope = declaredScope === "temporary" ? "temporary" : claimed ? "user" : declaredScope;
	const projectOverride = claimed
		&& resource.enabled !== globalDefaultEnabled(ctx.globalSkillEntries, relative(userGlobalBaseDir(target, ctx.agentDir, ctx.userAgentsDir), target));
	return {
		name: parsed.name,
		description: parsed.description,
		content: parsed.content,
		frontmatter: parsed.frontmatter,
		path: resource.path,
		scope: declaredScope,
		realScope,
		origin,
		source: resource.metadata.source,
		baseDir: resource.metadata.baseDir,
		enabled: resource.enabled,
		projectOverride,
	};
}

function dedupeByPath(skills: SkillEntry[]): SkillEntry[] {
	const seen = new Set<string>();
	const out: SkillEntry[] = [];
	for (const skill of skills) {
		if (seen.has(skill.path)) continue;
		seen.add(skill.path);
		out.push(skill);
	}
	return out;
}

export async function loadSkillRegistry(cwd: string): Promise<SkillRegistry> {
	const settingsManager = SettingsManager.create(cwd, getAgentDir(), { projectTrusted: projectSettingsTrusted(cwd) });
	const packageManager = new DefaultPackageManager({ cwd, agentDir: getAgentDir(), settingsManager });
	const resolved = await packageManager.resolve();
	const ctx: RegistryContext = {
		projectBaseDir: findProjectPiDir(cwd),
		projectRoots: projectResourceRoots(cwd),
		projectSkillEntries: settingsManager.getProjectSettings().skills ?? [],
		globalSkillEntries: settingsManager.getGlobalSettings().skills ?? [],
		agentDir: getAgentDir(),
		userAgentsDir: join(homedir(), ".agents"),
	};
	const allSkills = dedupeByPath(resolved.skills.map((resource) => toSkillEntry(resource, ctx)).filter((entry): entry is SkillEntry => entry !== null)).sort(compareSkills);
	const byName = new Map<string, SkillEntry>();
	for (const skill of allSkills) {
		if (!skill.enabled) continue;
		if (!byName.has(skill.name)) byName.set(skill.name, skill);
	}
	const skills = Array.from(byName.values()).sort(compareSkills);
	return { skills, allSkills, byName: new Map(skills.map((skill) => [skill.name, skill])) };
}

export function isDeletableSkill(skill: SkillEntry): boolean {
	return skill.origin === "top-level" && (skill.realScope === "project" || skill.realScope === "user");
}

export function skillStorageTarget(skill: SkillEntry): string {
	return basename(skill.path).toLowerCase() === "skill.md" ? dirname(skill.path) : skill.path;
}

export async function deleteSkill(ctx: ExtensionContext, skill: SkillEntry): Promise<boolean> {
	if (!isDeletableSkill(skill)) {
		ctx.ui.notify("Only your own project and global skills can be deleted", "warning");
		return false;
	}
	rmSync(skillStorageTarget(skill), { recursive: true, force: true });
	ctx.ui.notify(`Deleted skill: ${skill.name}`, "info");
	return true;
}
