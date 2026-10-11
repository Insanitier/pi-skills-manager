import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { sortSkillsEnabledFirst } from "../extensions/skills-manager/types.ts";

describe("enabled-first ordering", () => {
    const skill = (name: string, enabled: boolean) => ({ name, enabled }) as any;

    it("lifts enabled skills above disabled ones", () => {
        const sorted = sortSkillsEnabledFirst([skill("a", false), skill("b", true), skill("c", false), skill("d", true)]);
        assert.deepEqual(sorted.map((s) => s.name), ["b", "d", "a", "c"]);
    });

    it("preserves the incoming order within each group", () => {
        const sorted = sortSkillsEnabledFirst([skill("x", true), skill("y", true), skill("p", false), skill("q", false)]);
        assert.deepEqual(sorted.map((s) => s.name), ["x", "y", "p", "q"]);
    });

    it("does not mutate the input", () => {
        const input = [skill("a", false), skill("b", true)];
        sortSkillsEnabledFirst(input);
        assert.deepEqual(input.map((s) => s.name), ["a", "b"]);
    });
});
