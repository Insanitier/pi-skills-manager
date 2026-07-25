import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { skillInGroup, skillMatchesGroup } from "../extensions/skills-manager/types.ts";

describe("skill group matching", () => {
    const skill = { name: "react-review" } as any;
    it("matches wildcard and exact names", () => {
        assert.equal(skillMatchesGroup(skill, "*"), true);
        assert.equal(skillMatchesGroup(skill, "react-review"), true);
        assert.equal(skillMatchesGroup(skill, "other"), false);
    });
    it("exclude overrides include", () => {
        assert.equal(skillInGroup(skill, { name: "a", include: ["react-review"], exclude: ["react-review"] }), false);
        assert.equal(skillInGroup(skill, { name: "b", include: ["*"], exclude: ["other"] }), true);
        assert.equal(skillInGroup(skill, { name: "c", include: ["other"] }), false);
    });
});
