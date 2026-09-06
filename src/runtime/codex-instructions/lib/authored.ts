import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256 =
	"257b4ab944737418ee0713b4a748405446f8bc009d0dfc4557b099cd2c1038e6" as const;
const COORDINATOR_ROLE_EXTENSION_SHA256 =
	"c187f85f75515bf07091904f96fee503080f23ce84afb606674e040c80e2d87b" as const;
const COORDINATOR_SEPARATOR = "\n--- ARCHBOARD COORDINATOR ROLE ---\n" as const;
const COORDINATOR_SEPARATOR_SHA256 =
	"e64743b591f47a59eea6118686fc5b9f0bcca3e2d4e6af2dd8acfe55fe97653a" as const;
const COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256 =
	"de6b52ca41c65ea73cdf24e2ecaf9fa0c1c2ea68178119c252f266f8ac90b61c" as const;

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

/**
 *
 */
function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 *
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
	if (text.includes("\r")) {
		throw new TypeError(`${label} must use LF line endings.`);
	}
	if (!text.endsWith("\n") || text.endsWith("\n\n")) {
		throw new TypeError(`${label} must end in exactly one terminal LF.`);
	}
	if (!Buffer.from(text, "utf8").equals(bytes)) {
		throw new TypeError(`${label} contains bytes that do not round-trip as UTF-8.`);
	}
	return text;
}

/**
 *
 */
function readCanonicalDocument(fileName: string, label: string): { bytes: Buffer; text: string } {
	const bytes = readFileSync(new URL(`../${fileName}`, import.meta.url));
	return { bytes, text: decodeCanonicalBytes(bytes, label) };
}

/**
 *
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
 *
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
 *
 */
function expectedDigestFor(name: AuthoredInstructionName): {
	readonly label: string;
	readonly expected: string;
} {
	switch (name) {
		case "workhorse":
			return {
				label: "Workhorse developer instructions",
				expected: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
			};
		case "coordinatorExtension":
			return {
				label: "Coordinator role extension",
				expected: COORDINATOR_ROLE_EXTENSION_SHA256,
			};
		case "separator":
			return { label: "Coordinator instruction separator", expected: COORDINATOR_SEPARATOR_SHA256 };
		case "composedCoordinator":
			return {
				label: "Coordinator instruction composition",
				expected: COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
			};
	}
}

/** Validate a candidate against a fixed reviewed instruction digest. */
function assertCanonicalInstructionBytes(
	name: AuthoredInstructionName,
	candidate: string | Uint8Array,
): void {
	const expected = expectedDigestFor(name);
	const bytes =
		typeof candidate === "string" ? Buffer.from(candidate, "utf8") : Buffer.from(candidate);
	const text = decodeCanonicalBytes(bytes, expected.label);
	if (name === "separator" && text !== COORDINATOR_SEPARATOR) {
		throw new TypeError("Coordinator separator bytes are not the reviewed literal separator.");
	}
	if (name === "composedCoordinator") {
		const marker = "\n\n--- ARCHBOARD COORDINATOR ROLE ---\n";
		if (text.match(/\n\n--- ARCHBOARD COORDINATOR ROLE ---\n/g)?.length !== 1) {
			throw new TypeError("Coordinator composition must contain exactly one blank-line marker.");
		}
		if (!text.includes(marker)) {
			throw new TypeError("Coordinator composition is missing the reviewed separator.");
		}
	}
	assertDigest(expected.label, bytes, expected.expected);
}

/**
 *
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
 *
 */
function composeCoordinatorInstructions(): string {
	return COORDINATOR_DEVELOPER_INSTRUCTIONS;
}

/** Re-read the tracked documents and verify every reviewed byte digest. */
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
