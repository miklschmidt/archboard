// One agent has one name in every record, whichever variable named it.

import { expect, test } from "bun:test";
import { callerOf } from "#runtime/records/rules/caller.ts";

test("an agent's versioned AI_AGENT value and its own variable give one short name", () => {
	expect(callerOf("claude-code_2-1-322_agent", {}).agent).toBe("claude");
	expect(callerOf("claude", {}).agent).toBe("claude");
	expect(callerOf("codex", {}).agent).toBe("codex");
	expect(callerOf(undefined, {}).agent).toBeNull();
	expect(callerOf("<script>", {}).agent).toBe("other");
});

test("a command of Archboard's workbench says so", () => {
	expect(callerOf("codex", { ARCHBOARD_TELEMETRY_RUNNER: "workbench" })).toEqual({
		agent: "codex",
		runner: "workbench",
	});
	expect(callerOf("codex", {}).runner).toBeNull();
});
