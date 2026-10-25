import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVoiceAgent, type VoiceAgent } from "@archboard/codex-realtime-voice/server";
import { ARCHBOARD_AGENT } from "#runtime/services/host/archboard.ts";

/**
 * Compose Archboard's thread profiles exactly as its voice agent does, without starting Codex.
 * @returns The coordinator and workhorse profiles of an agent built from Archboard's inputs.
 */
export function archboardProfiles(): VoiceAgent["instructions"] {
	const directory = mkdtempSync(join(tmpdir(), "archboard-profiles-"));
	try {
		return createVoiceAgent({
			storage: { directory },
			codex: { executablePath: "/nonexistent/codex" },
			checkouts: [],
			identity: ARCHBOARD_AGENT.identity,
			instructions: ARCHBOARD_AGENT.instructions,
			extensions: { tools: ARCHBOARD_AGENT.tools },
			/** A test agent never starts, so it cannot fail. */
			onFatal: () => undefined,
		}).instructions;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
