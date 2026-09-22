// The two reviewed developer documents, one per Codex role, verified byte for byte at load.
//
// The workhorse thread is started with the workhorse document and the coordinator thread with
// the coordinator document; neither contains the other, and the voice model is given neither
// (TASK-297). Each document's digest is a reviewed constant, so a drifted document fails the
// process before any thread is started with it.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256 =
	"5f9b6a2544f4bbd3f6d347384288494e3293d44acb0354f910de1b57a5ad3f21" as const;
const COORDINATOR_DEVELOPER_INSTRUCTIONS_SHA256 =
	"542fc4ab4a885d057a152546277f4acf3e1b7b78687dca13d1bd4012ac935ac9" as const;

interface AuthoredInstructionIntegrity {
	readonly workhorseSha256: string;
	readonly coordinatorSha256: string;
}

type AuthoredInstructionName = "workhorse" | "coordinator";

interface AuthoredDocument {
	readonly fileName: string;
	readonly label: string;
	readonly expected: string;
}

/** Each reviewed document: where it lives, how an error names it, and its reviewed digest. */
const AUTHORED_DOCUMENTS: Readonly<Record<AuthoredInstructionName, AuthoredDocument>> =
	Object.freeze({
		workhorse: {
			fileName: "workhorse-developer-instructions.txt",
			label: "Workhorse developer instructions",
			expected: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
		},
		coordinator: {
			fileName: "coordinator-developer-instructions.txt",
			label: "Coordinator developer instructions",
			expected: COORDINATOR_DEVELOPER_INSTRUCTIONS_SHA256,
		},
	});

/**
 * Hex SHA-256 of a byte sequence, the digest form every reviewed instruction constant records.
 * @param bytes - The exact bytes to digest.
 * @returns The lowercase hex digest.
 */
function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Refuse text whose line conventions could change bytes on a round trip: carriage returns or
 * anything other than exactly one terminal LF.
 * @param text - The decoded document text.
 * @param label - Names the document in the thrown error.
 */
function requireLfConventions(text: string, label: string): void {
	if (text.includes("\r")) {
		throw new TypeError(`${label} must use LF line endings.`);
	}
	if (!text.endsWith("\n") || text.endsWith("\n\n")) {
		throw new TypeError(`${label} must end in exactly one terminal LF.`);
	}
}

/**
 * Decode reviewed instruction bytes as canonical UTF-8, refusing every encoding that would let
 * two byte sequences carry the same reviewed text (BOM, invalid UTF-8, CRLF, non-round-tripping
 * bytes), so a digest is a digest of the text and nothing else.
 * @param bytes - The raw document bytes.
 * @param label - Names the document in the thrown error.
 * @returns The decoded text.
 */
function decodeCanonicalBytes(bytes: Buffer, label: string): string {
	if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
		throw new TypeError(`${label} must be UTF-8 without a BOM.`);
	}
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		throw new TypeError(`${label} is not valid UTF-8.`, { cause: error });
	}
	requireLfConventions(text, label);
	if (!Buffer.from(text, "utf8").equals(bytes)) {
		throw new TypeError(`${label} contains bytes that do not round-trip as UTF-8.`);
	}
	return text;
}

/**
 * Read one tracked instruction document beside this module and decode it canonically.
 * @param document - Which document.
 * @returns The raw bytes and their decoded text.
 */
function readCanonicalDocument(document: AuthoredDocument): { bytes: Buffer; text: string } {
	const bytes = readFileSync(new URL(`../${document.fileName}`, import.meta.url));
	return { bytes, text: decodeCanonicalBytes(bytes, document.label) };
}

/**
 * Compare bytes against a reviewed digest; drift means a human must re-review the text before
 * the constant is updated.
 * @param label - Names the document in the thrown error.
 * @param bytes - The candidate bytes.
 * @param expected - The reviewed hex digest.
 * @returns The actual digest, which equals the expected one.
 */
function assertDigest(label: string, bytes: Uint8Array, expected: string): string {
	const actual = sha256(bytes);
	if (actual !== expected) {
		throw new TypeError(
			`${label} hash drifted. Expected SHA-256 ${expected}, received ${actual}. Human re-review is required before updating this digest.`,
		);
	}
	return actual;
}

/**
 * Normalise a candidate to a Buffer, whichever form the caller holds.
 * @param candidate - Text or bytes.
 * @returns The candidate as UTF-8 bytes.
 */
function candidateBytes(candidate: string | Uint8Array): Buffer {
	return typeof candidate === "string" ? Buffer.from(candidate, "utf8") : Buffer.from(candidate);
}

/**
 * Validate a candidate against a fixed reviewed instruction digest.
 * @param name - Which reviewed document the candidate claims to be.
 * @param candidate - The text or bytes to check.
 */
function assertCanonicalInstructionBytes(
	name: AuthoredInstructionName,
	candidate: string | Uint8Array,
): void {
	const document = AUTHORED_DOCUMENTS[name];
	const bytes = candidateBytes(candidate);
	decodeCanonicalBytes(bytes, document.label);
	assertDigest(document.label, bytes, document.expected);
}

/**
 * Read one document and verify its reviewed digest.
 * @param name - Which document.
 * @returns The verified text.
 */
function loadVerified(name: AuthoredInstructionName): string {
	const read = readCanonicalDocument(AUTHORED_DOCUMENTS[name]);
	assertCanonicalInstructionBytes(name, read.bytes);
	return read.text;
}

const WORKHORSE_DEVELOPER_INSTRUCTIONS = loadVerified("workhorse");
const COORDINATOR_DEVELOPER_INSTRUCTIONS = loadVerified("coordinator");

const AUTHORED_INSTRUCTION_DIGESTS = Object.freeze({
	workhorse: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	coordinator: COORDINATOR_DEVELOPER_INSTRUCTIONS_SHA256,
});

/**
 * Re-read both tracked documents and verify every reviewed byte digest.
 * @returns The digests actually observed on disk.
 */
function verifyAuthoredInstructionIntegrity(): AuthoredInstructionIntegrity {
	const workhorse = readCanonicalDocument(AUTHORED_DOCUMENTS.workhorse);
	const coordinator = readCanonicalDocument(AUTHORED_DOCUMENTS.coordinator);
	assertCanonicalInstructionBytes("workhorse", workhorse.bytes);
	assertCanonicalInstructionBytes("coordinator", coordinator.bytes);
	return Object.freeze({
		workhorseSha256: sha256(workhorse.bytes),
		coordinatorSha256: sha256(coordinator.bytes),
	});
}

export {
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	COORDINATOR_DEVELOPER_INSTRUCTIONS_SHA256,
	type AuthoredInstructionIntegrity,
	type AuthoredInstructionName,
	assertCanonicalInstructionBytes,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	COORDINATOR_DEVELOPER_INSTRUCTIONS,
	AUTHORED_INSTRUCTION_DIGESTS,
	verifyAuthoredInstructionIntegrity,
};
