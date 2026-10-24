import { cloneAndFreeze } from "#runtime/rules/host/immutability.ts";
import type { SessionUserInput } from "@archboard/codex-app-server/session";

/**
 * Bound a user prompt by UTF-8 bytes and construct its Codex text item.
 * @param text The user prompt.
 * @returns The immutable Codex text item.
 */
function createTextUserInput(text: string): Extract<SessionUserInput, { type: "text" }> {
	if (typeof text !== "string" || text.length === 0 || Buffer.byteLength(text, "utf8") > 16_384)
		throw new TypeError("Prompt must contain 1 to 16,384 UTF-8 bytes.");
	return cloneAndFreeze({ type: "text", text, text_elements: [] });
}
export { createTextUserInput };
