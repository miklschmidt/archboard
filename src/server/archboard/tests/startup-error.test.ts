import { expect, test } from "bun:test";

import { CodexProcessError } from "@archboard/codex-app-server/process";
import { CODEX_PROTOCOL_VERSION } from "@archboard/codex-app-server/protocol";
import { serverStartupFailureMessage } from "../index.js";

test("classifies process-group ownership refusal without install recovery", () => {
	const failure = new CodexProcessError({
		code: "process_group_unavailable",
		terminal: true,
		message:
			"Could not prove ownership of the Codex process group after spawn. Recovery: refuse restart until the child-group boundary is available.",
	});

	const message = serverStartupFailureMessage(failure);
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

	const message = serverStartupFailureMessage(failure);
	expect(message).toContain(`@openai/codex ${CODEX_PROTOCOL_VERSION}`);
	expect(message).toContain("Could not spawn the exact Codex app-server child");
});
