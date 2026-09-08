import { expect, test } from "bun:test";

import { CodexProcessError } from "../../../runtime/codex-process/index.js";
import { canvasStartupFailureMessage } from "../index.js";

test("classifies process-group ownership refusal without install recovery", () => {
	const failure = new CodexProcessError({
		code: "process_group_unavailable",
		terminal: true,
		message:
			"Could not prove ownership of the Codex process group after spawn. Recovery: refuse restart until the child-group boundary is available.",
	});

	const message = canvasStartupFailureMessage(failure);
	expect(message).toContain("Codex startup refused.");
	expect(message).toContain("Could not prove ownership of the Codex process group");
	expect(message).not.toContain("bun install");
});

test("retains install recovery for a true child spawn failure", () => {
	const failure = new CodexProcessError({
		code: "spawn_failed",
		terminal: true,
		message: "Could not spawn the exact Codex app-server child.",
	});

	const message = canvasStartupFailureMessage(failure);
	expect(message).toContain("Run bun install to restore @openai/codex 0.151.0");
	expect(message).toContain("Could not spawn the exact Codex app-server child");
});
