import { expect, test } from "bun:test";
import { testAuthorities } from "#tests/runtime/support/codex-connection.ts";
import { createCodexBrowserModel } from "@archboard/codex-realtime-voice/contract";
import { SEMANTIC_CONTEXT_LIMITS } from "#runtime/services/semantic-context-limits.ts";

/**
 * A voice context whose brief is the given text.
 * @param canonicalBrief The brief.
 * @returns The context, as the browser model parses it.
 */
function voiceContext(canonicalBrief: string) {
	return {
		kind: "voice_context",
		sessionId: "session-1",
		ledgerId: "ledger-1",
		canonicalBrief,
		ownerEntriesTruncated: 0,
		entriesTruncated: 0,
		entries: [],
	};
}

test("the browser voice-context brief fits the Archboard producer contract", () => {
	const { BrowserVoiceContextSchema } = createCodexBrowserModel(testAuthorities());
	const limit = SEMANTIC_CONTEXT_LIMITS.briefBytes;
	expect(BrowserVoiceContextSchema.safeParse(voiceContext("a".repeat(limit))).success).toBe(true);
	expect(BrowserVoiceContextSchema.safeParse(voiceContext("a".repeat(limit + 1))).success).toBe(
		false,
	);
});
