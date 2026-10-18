import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	applyProjectClaim,
	claimPathFor,
	clearProjectClaim,
	globalDefaultEnabled,
	projectClaimsPath,
	userGlobalBaseDir,
} from "../extensions/skills-manager/overrides.ts";

describe("project-override helpers", () => {
	const claim = "/home/user/.pi/agent/skills/foo/SKILL.md";

	it("appends a plain claim to enable and a plain+minus claim to disable", () => {
		assert.deepEqual(applyProjectClaim([], claim, true), [claim]);
		assert.deepEqual(applyProjectClaim([], claim, false), [claim, `-${claim}`]);
	});

	it("replaces an existing claim instead of duplicating it", () => {
		const disabled = applyProjectClaim([claim], claim, false);
		assert.deepEqual(disabled, [claim, `-${claim}`]);
		assert.deepEqual(applyProjectClaim(disabled, claim, true), [claim]);
	});

	it("clears claims while preserving unrelated entries", () => {
		assert.deepEqual(clearProjectClaim([claim, `-${claim}`, "keep"], claim), ["keep"]);
	});

	it("reads the global default from global patterns", () => {
		assert.equal(globalDefaultEnabled([], "skills/foo/SKILL.md"), true);
		assert.equal(globalDefaultEnabled(["-skills/foo/SKILL.md"], "skills/foo/SKILL.md"), false);
		assert.equal(globalDefaultEnabled(["+skills/foo/SKILL.md"], "skills/foo/SKILL.md"), true);
		assert.equal(globalDefaultEnabled(["other"], "skills/foo/SKILL.md"), true);
	});

	it("detects claims in absolute, relative, and prefixed forms", () => {
		const base = "/proj/.pi";
		assert.equal(projectClaimsPath(["/abs/x/SKILL.md"], "/abs/x/SKILL.md", base), true);
		assert.equal(projectClaimsPath(["../../abs/x/SKILL.md"], "/abs/x/SKILL.md", base), true);
		assert.equal(projectClaimsPath(["skills/local/SKILL.md"], "/proj/.pi/skills/local/SKILL.md", base), true);
		assert.equal(projectClaimsPath(["-skills/local/SKILL.md"], "/proj/.pi/skills/local/SKILL.md", base), true);
		assert.equal(projectClaimsPath(["+skills/other/SKILL.md"], "/proj/.pi/skills/local/SKILL.md", base), false);
	});

	it("expands ~ in claims and round-trips through claimPathFor", () => {
		const p = join(homedir(), ".pi", "agent", "skills", "foo", "SKILL.md");
		assert.equal(projectClaimsPath(["~/.pi/agent/skills/foo/SKILL.md"], p, "/proj/.pi"), true);
		assert.equal(claimPathFor(p), "~/.pi/agent/skills/foo/SKILL.md");
	});

	it("resolves the global base dir for agent and .agents skills", () => {
		const agent = "/agent";
		const userAgents = "/home/u/.agents";
		assert.equal(userGlobalBaseDir("/agent/skills/foo/SKILL.md", agent, userAgents), "/agent");
		assert.equal(userGlobalBaseDir("/home/u/.agents/skills/foo/SKILL.md", agent, userAgents), userAgents);
	});
});
