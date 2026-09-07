import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256 =
	"257b4ab944737418ee0713b4a748405446f8bc009d0dfc4557b099cd2c1038e6" as const;
const COORDINATOR_ROLE_EXTENSION_SHA256 =
	"60a49fb93fa91a3eda2f321d030898dd6f7f01bd6621669cbfba65c912ed81aa" as const;
const COORDINATOR_SEPARATOR = "\n--- ARCHBOARD COORDINATOR ROLE ---\n" as const;
const COORDINATOR_SEPARATOR_SHA256 =
	"e64743b591f47a59eea6118686fc5b9f0bcca3e2d4e6af2dd8acfe55fe97653a" as const;
const COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256 =
	"fe4a970b0f34f747019634077b9e81095d76f694761f7b0cdab9994eb80acbf6" as const;
const COMPOSED_MARKER = "\n\n--- ARCHBOARD COORDINATOR ROLE ---\n";
const COMPOSED_MARKER_PATTERN = /\n\n--- ARCHBOARD COORDINATOR ROLE ---\n/g;

interface AuthoredInstructionIntegrity {
	readonly workhorseSha256: string;
	readonly coordinatorExtensionSha256: string;
	readonly separatorSha256: string;
	readonly composedCoordinatorSha256: string;
}

type AuthoredInstructionName =
	| "workhorse"
	| "coordinatorExtension"
	| "separator"
	| "composedCoordinator";

interface ExpectedDigest {
	readonly label: string;
	readonly expected: string;
}

/** The reviewed digest and human-readable label for each authored instruction document. */
const EXPECTED_DIGESTS: Readonly<Record<AuthoredInstructionName, ExpectedDigest>> = Object.freeze({
	workhorse: {
		label: "Workhorse developer instructions",
		expected: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	},
	coordinatorExtension: {
		label: "Coordinator role extension",
		expected: COORDINATOR_ROLE_EXTENSION_SHA256,
	},
	separator: { label: "Coordinator instruction separator", expected: COORDINATOR_SEPARATOR_SHA256 },
	composedCoordinator: {
		label: "Coordinator instruction composition",
		expected: COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
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
 * @param fileName - The document file name relative to the module root.
 * @param label - Names the document in the thrown error.
 * @returns The raw bytes and their decoded text.
 */
function readCanonicalDocument(fileName: string, label: string): { bytes: Buffer; text: string } {
	const bytes = readFileSync(new URL(`../${fileName}`, import.meta.url));
	return { bytes, text: decodeCanonicalBytes(bytes, label) };
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
 * Join the workhorse instructions and the coordinator role extension with the reviewed separator
 * and verify the whole against the reviewed composition digest.
 * @param workhorse - The decoded workhorse developer instructions.
 * @param extension - The decoded coordinator role extension.
 * @returns The composed coordinator instructions.
 */
function assertComposition(workhorse: string, extension: string): string {
	if (!workhorse.endsWith("\n") || workhorse.endsWith("\n\n")) {
		throw new TypeError("Workhorse instructions must end in exactly one LF before the separator.");
	}
	if (!extension.endsWith("\n") || extension.startsWith("\n") || extension.endsWith("\n\n")) {
		throw new TypeError("Coordinator role extension must start immediately and end in one LF.");
	}
	const composed = `${workhorse}${COORDINATOR_SEPARATOR}${extension}`;
	assertDigest(
		"Coordinator instruction composition",
		Buffer.from(composed, "utf8"),
		COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
	);
	return composed;
}

/**
 * Require the composed coordinator text to carry the reviewed blank-line separator marker exactly
 * once, so a composition cannot smuggle a second role section.
 * @param text - The composed coordinator text.
 */
function assertComposedCoordinatorMarker(text: string): void {
	if (text.match(COMPOSED_MARKER_PATTERN)?.length !== 1) {
		throw new TypeError("Coordinator composition must contain exactly one blank-line marker.");
	}
	if (!text.includes(COMPOSED_MARKER)) {
		throw new TypeError("Coordinator composition is missing the reviewed separator.");
	}
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
	const expected = EXPECTED_DIGESTS[name];
	const bytes = candidateBytes(candidate);
	const text = decodeCanonicalBytes(bytes, expected.label);
	if (name === "separator" && text !== COORDINATOR_SEPARATOR) {
		throw new TypeError("Coordinator separator bytes are not the reviewed literal separator.");
	}
	if (name === "composedCoordinator") {
		assertComposedCoordinatorMarker(text);
	}
	assertDigest(expected.label, bytes, expected.expected);
}

/**
 * Read both tracked documents at module load, verify every reviewed digest and compose the
 * coordinator instructions once, so a drifted document fails the process before any thread uses it.
 * @returns The verified documents and their composition.
 */
function loadAuthoredInstructions(): {
	readonly workhorse: { readonly bytes: Buffer; readonly text: string };
	readonly coordinatorExtension: { readonly bytes: Buffer; readonly text: string };
	readonly composed: string;
} {
	const workhorse = readCanonicalDocument(
		"workhorse-developer-instructions.txt",
		"Workhorse developer instructions",
	);
	assertCanonicalInstructionBytes("workhorse", workhorse.bytes);
	const coordinatorExtension = readCanonicalDocument(
		"coordinator-role-extension.txt",
		"Coordinator role extension",
	);
	assertCanonicalInstructionBytes("coordinatorExtension", coordinatorExtension.bytes);
	assertCanonicalInstructionBytes("separator", COORDINATOR_SEPARATOR);
	const composed = assertComposition(workhorse.text, coordinatorExtension.text);
	assertCanonicalInstructionBytes("composedCoordinator", composed);
	return Object.freeze({
		workhorse: Object.freeze(workhorse),
		coordinatorExtension: Object.freeze(coordinatorExtension),
		composed,
	});
}

const AUTHORED_INSTRUCTIONS = loadAuthoredInstructions();

const WORKHORSE_DEVELOPER_INSTRUCTIONS = AUTHORED_INSTRUCTIONS.workhorse.text;
const COORDINATOR_ROLE_EXTENSION = AUTHORED_INSTRUCTIONS.coordinatorExtension.text;
const COORDINATOR_DEVELOPER_INSTRUCTIONS = AUTHORED_INSTRUCTIONS.composed;

const AUTHORED_INSTRUCTION_DIGESTS = Object.freeze({
	workhorse: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	coordinatorExtension: COORDINATOR_ROLE_EXTENSION_SHA256,
	separator: COORDINATOR_SEPARATOR_SHA256,
	composedCoordinator: COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
});

/**
 * The coordinator's developer instructions, verified once at load.
 * @returns The composed coordinator instructions.
 */
function composeCoordinatorInstructions(): string {
	return COORDINATOR_DEVELOPER_INSTRUCTIONS;
}

/**
 * Re-read the tracked documents and verify every reviewed byte digest.
 * @returns The digests actually observed on disk.
 */
function verifyAuthoredInstructionIntegrity(): AuthoredInstructionIntegrity {
	const workhorse = readCanonicalDocument(
		"workhorse-developer-instructions.txt",
		"Workhorse developer instructions",
	);
	const coordinatorExtension = readCanonicalDocument(
		"coordinator-role-extension.txt",
		"Coordinator role extension",
	);
	assertCanonicalInstructionBytes("workhorse", workhorse.bytes);
	assertCanonicalInstructionBytes("coordinatorExtension", coordinatorExtension.bytes);
	assertCanonicalInstructionBytes("separator", COORDINATOR_SEPARATOR);
	const composed = assertComposition(workhorse.text, coordinatorExtension.text);
	assertCanonicalInstructionBytes("composedCoordinator", composed);
	const workhorseSha256 = sha256(workhorse.bytes);
	const coordinatorExtensionSha256 = sha256(coordinatorExtension.bytes);
	const separatorSha256 = sha256(Buffer.from(COORDINATOR_SEPARATOR, "utf8"));
	const composedCoordinatorSha256 = sha256(Buffer.from(composed, "utf8"));
	return Object.freeze({
		workhorseSha256,
		coordinatorExtensionSha256,
		separatorSha256,
		composedCoordinatorSha256,
	});
}

export {
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	COORDINATOR_ROLE_EXTENSION_SHA256,
	COORDINATOR_SEPARATOR,
	COORDINATOR_SEPARATOR_SHA256,
	COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
	type AuthoredInstructionIntegrity,
	type AuthoredInstructionName,
	assertCanonicalInstructionBytes,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	COORDINATOR_ROLE_EXTENSION,
	COORDINATOR_DEVELOPER_INSTRUCTIONS,
	AUTHORED_INSTRUCTION_DIGESTS,
	composeCoordinatorInstructions,
	verifyAuthoredInstructionIntegrity,
};
