import { dirname, join, relative } from "node:path";
import { homedir } from "node:os";
import { getAgentDir, SettingsManager, type PackageSource } from "@earendil-works/pi-coding-agent";
import { findProjectPiDir, projectSettingsTrusted } from "./paths.js";
import { applyProjectClaim, claimPathFor, clearProjectClaim, globalDefaultEnabled, userGlobalBaseDir } from "./overrides.js";
import type { EditScope, SkillEntry } from "./types.js";

function updatePatterns(current: string[], pattern: string, enabled: boolean): string[] {
	const updated = current.filter((entry) => {
		const stripped = entry.startsWith("!") || entry.startsWith("+") || entry.startsWith("-") ? entry.slice(1) : entry;
		return stripped !== pattern;
	});
	updated.push(`${enabled ? "+" : "-"}${pattern}`);
	return updated;
}

function getTopLevelPattern(skill: SkillEntry, cwd: string): string {
	const baseDir = skill.baseDir ?? (skill.realScope === "project"
		? findProjectPiDir(cwd)
		: userGlobalBaseDir(skill.path, getAgentDir(), join(homedir(), ".agents")));
	return relative(baseDir, skill.path);
}

function getPackagePattern(skill: SkillEntry): string {
	const baseDir = skill.baseDir ?? dirname(skill.path);
	return relative(baseDir, skill.path);
}

function hasPackageFilters(pkg: Exclude<PackageSource, string>): boolean {
	return pkg.extensions !== undefined || pkg.skills !== undefined || pkg.prompts !== undefined || pkg.themes !== undefined;
}

export async function setSkillEnabled(cwd: string, skill: SkillEntry, enabled: boolean, scope: EditScope = "global"): Promise<void> {
	if (skill.scope === "temporary") throw new Error("Temporary skills cannot be toggled.");
	const trusted = projectSettingsTrusted(cwd);
	const settingsManager = SettingsManager.create(cwd, getAgentDir(), { projectTrusted: trusted });

	if (skill.origin === "top-level") {
		// Project skills only exist in the project layer; the scope switch only affects user-level skills.
		const targetScope: EditScope = skill.realScope === "project" ? "project" : scope;
		if (targetScope === "project" && !trusted) {
			throw new Error("Project skills and project overrides cannot be changed before project trust is active.");
		}

		if (targetScope === "project" && skill.realScope === "user") {
			const claim = claimPathFor(skill.path);
			const relPattern = relative(userGlobalBaseDir(skill.path, getAgentDir(), join(homedir(), ".agents")), skill.path);
			const globalDefault = globalDefaultEnabled(settingsManager.getGlobalSettings().skills ?? [], relPattern);
			const current = [...(settingsManager.getProjectSettings().skills ?? [])];
			settingsManager.setProjectSkillPaths(enabled === globalDefault ? clearProjectClaim(current, claim) : applyProjectClaim(current, claim, enabled));
			await settingsManager.flush();
			return;
		}

		const projectScope = targetScope === "project";
		const settings = projectScope ? settingsManager.getProjectSettings() : settingsManager.getGlobalSettings();
		const updated = updatePatterns([...(settings.skills ?? [])], getTopLevelPattern(skill, cwd), enabled);
		if (projectScope) settingsManager.setProjectSkillPaths(updated);
		else settingsManager.setSkillPaths(updated);
		await settingsManager.flush();
		return;
	}

	// Package skills keep their natural scope in this version.
	if (skill.realScope === "project" && !trusted) throw new Error("Project packages cannot be changed before project trust is active.");
	const settings = skill.realScope === "project" ? settingsManager.getProjectSettings() : settingsManager.getGlobalSettings();
	const packages = [...(settings.packages ?? [])];
	const packageIndex = packages.findIndex((pkg) => (typeof pkg === "string" ? pkg : pkg.source) === skill.source);
	if (packageIndex === -1) throw new Error("Could not find the package settings entry for this skill.");

	const packageEntry = packages[packageIndex];
	const packageConfig = typeof packageEntry === "string" ? { source: packageEntry } : { ...packageEntry };
	const updated = updatePatterns([...(packageConfig.skills ?? [])], getPackagePattern(skill), enabled);
	packageConfig.skills = updated.length > 0 ? updated : undefined;
	packages[packageIndex] = hasPackageFilters(packageConfig) ? packageConfig : packageConfig.source;
	if (skill.realScope === "project") settingsManager.setProjectPackages(packages);
	else settingsManager.setPackages(packages);
	await settingsManager.flush();
}
