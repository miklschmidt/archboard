import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Read exact authored UTF-8 bytes and refuse a changed document.
 * @param candidate The candidate document text or bytes.
 * @param label The document name for diagnostics.
 * @param expected The reviewed SHA-256 digest.
 */
function assertWorkbenchInstructionBytes(
	candidate: string | Uint8Array,
	label: string,
	expected: string,
): void {
	const bytes =
		typeof candidate === "string" ? Buffer.from(candidate, "utf8") : Buffer.from(candidate);
	if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])))
		throw new TypeError(`${label} must be UTF-8 without a BOM.`);
	const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	if (!canonicalText(text, bytes))
		throw new TypeError(`${label} must use canonical UTF-8 and exactly one terminal LF.`);
	const actual = createHash("sha256").update(bytes).digest("hex");
	if (actual !== expected)
		throw new TypeError(`${label} hash drifted. Expected SHA-256 ${expected}, received ${actual}.`);
}
/**
 * Read one tracked instruction document under its reviewed digest.
 * @param url The authored document URL.
 * @param label The document name for diagnostics.
 * @param expected The reviewed SHA-256 digest.
 * @returns The verified document bytes as text.
 */
function readWorkbenchInstructionDocument(url: URL, label: string, expected: string): string {
	const bytes = readFileSync(url);
	assertWorkbenchInstructionBytes(bytes, label, expected);
	return bytes.toString("utf8");
}
const COORDINATOR_ROLE_INSTRUCTIONS = readWorkbenchInstructionDocument(
	new URL(import.meta.resolve("#runtime/rules/host/coordinator-developer-instructions.txt")),
	"coordinator-developer-instructions.txt",
	"d2b8bffc13daa3b7bd74df037268edd3c0b53b8bacf59553ca3f5c66b6e299ce",
);
const WORKHORSE_ROLE_INSTRUCTIONS = readWorkbenchInstructionDocument(
	new URL(import.meta.resolve("#runtime/rules/host/workhorse-developer-instructions.txt")),
	"workhorse-developer-instructions.txt",
	"8d80d44c56ee8236bd9336bad0a490bda1e11dba915adf2fa25568a018f848e1",
);
const VOICE_CHANNEL_INSTRUCTIONS = readWorkbenchInstructionDocument(
	new URL(import.meta.resolve("#runtime/rules/host/voice-channel-instructions.txt")),
	"voice-channel-instructions.txt",
	"5b7af737fb315afb70191809bbf7e8c0a30d28276fc45b43811c396880348477",
);
const VOICE_HANDOFF_INSTRUCTIONS = readWorkbenchInstructionDocument(
	new URL(import.meta.resolve("#runtime/rules/host/voice-handoff-instructions.txt")),
	"voice-handoff-instructions.txt",
	"944c88046d162c08914d342931faa98f524f15cf9edd987c7c626f4d6d8aecf0",
);
/**
 * How the coordinator says which of its messages the voice model speaks.
 *
 * The session runs in Codex's `bemTags` handoff mode, where a message's first characters choose
 * its channel: `[FINAL]` is appended to the voice session as speakable, which the voice model
 * reacts to, and `[COMMENTARY]` as quiet context, which it never reacts to (Codex 0.160.0,
 * `realtime_conversation/bem.rs`, `v3_output_writer`). A message with no header is buffered until
 * it is complete and then treated as final, so an untagged preamble is read out as if it were the
 * answer, and the answer itself cannot stream. Telling the coordinator the rule is what makes the
 * mode work.
 */
const CHANNEL_RULE = VOICE_CHANNEL_INSTRUCTIONS.slice(0, -1);
const COORDINATOR_CHANNEL_INSTRUCTIONS = `${CHANNEL_RULE}\n${VOICE_HANDOFF_INSTRUCTIONS.slice(0, -1)}`;
const CORE_ROLE_INSTRUCTIONS = Object.freeze({
	coordinator: `${COORDINATOR_ROLE_INSTRUCTIONS}\n${COORDINATOR_CHANNEL_INSTRUCTIONS}\n`,
	workhorse: WORKHORSE_ROLE_INSTRUCTIONS,
});
export {
	CORE_ROLE_INSTRUCTIONS,
	CHANNEL_RULE,
	COORDINATOR_CHANNEL_INSTRUCTIONS,
	assertWorkbenchInstructionBytes,
	readWorkbenchInstructionDocument,
};

/**
 * Refuse alternate line endings and non-round-tripping instruction bytes.
 * @param text The decoded instruction document.
 * @param bytes Its original bytes.
 * @returns Whether the encoding and line endings are canonical.
 */
function canonicalText(text: string, bytes: Buffer): boolean {
	return (
		!text.includes("\r") &&
		text.endsWith("\n") &&
		!text.endsWith("\n\n") &&
		Buffer.from(text, "utf8").equals(bytes)
	);
}
