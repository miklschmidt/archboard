// Reading a board off disk, and refusing to guess when it is not one.
//
// The board on disk is the board (ADR 0015's rule, applied to ADR 0023's file):
// nothing here keeps a copy, every read goes to the file, and the read is
// synchronous on purpose, because the write boundary reads and writes inside
// one lease and an `await` between them would open the window the lease exists
// to close.
//
// Every read validates. A file that parses as JSON but is not a coherent board
// is an error rather than a board with holes in it, because the only thing
// downstream can do with a board with holes in it is draw a wrong picture.

import fs from "node:fs";
import { errnoCode, errorMessage } from "@/shared/thrown-error/index";
import { mintId } from "@/shared/ids/ids";
import { parseSemanticBoard, type SemanticBoard } from "@/shared/semantic-board/index";
import { writeFileAtomic } from "@/runtime/engine/atomic-write";
import { claimWriterId, withBoardLockIfFreeSync } from "@/runtime/engine/board-lock";
import {
	semanticBoardAddress,
	type SemanticBoardLocation,
} from "@/runtime/semantic-board-store/lib/location";
import { readSemanticBoardConfiguration } from "@/runtime/semantic-board-store/lib/configuration";
import { resolveSemanticBoard } from "@/runtime/semantic-board-store/lib/former-names";
import { semanticVocabularyDiagnostics } from "@/runtime/semantic-board-store/lib/vocabulary";
import { decodeSemanticBoardDocument } from "@/runtime/semantic-board-store/lib/decode";
import type { VaultDiagnostic } from "@/shared/semantic-policy/index";

/** A board that was there and was coherent, or why it was neither. */
type SemanticBoardRead =
	| {
			readonly ok: true;
			readonly board: SemanticBoard;
			readonly warnings: VaultDiagnostic[];
			readonly location: SemanticBoardLocation;
	  }
	| {
			readonly ok: false;
			readonly code: "BOARD_MISSING" | "BOARD_UNREADABLE";
			readonly problem: string;
			readonly location: SemanticBoardLocation;
	  };

/** A validated legacy board awaiting the lease before its upgraded file lands. */
interface PendingMigration {
	readonly migration: true;
	readonly read: Extract<SemanticBoardRead, { readonly ok: true }>;
}

/**
 * The bytes at a path, or nothing when no file is there. A missing board is
 * not an error: a board that has not been created yet is exactly what the
 * create command expects to find.
 * @param file The path.
 * @returns The file's text, or undefined.
 * @throws {unknown} Whatever the read threw, other than the file being absent.
 */
function textAt(file: string): string | undefined {
	try {
		return fs.readFileSync(file, "utf-8");
	} catch (error) {
		if (errnoCode(error) === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

/**
 * Refuse a board that is there but cannot be believed.
 * @param location Where the board lives.
 * @param problem What is wrong with it.
 * @returns The refusal.
 */
function unreadable(location: SemanticBoardLocation, problem: string): SemanticBoardRead {
	return { ok: false, code: "BOARD_UNREADABLE", problem, location };
}

/**
 * Read the board at a known location.
 * @param location Where the board lives.
 * @param configured Current interpreted vault configuration.
 * @param persistMigration Whether the caller already owns the board lease.
 * @returns The board, or why it could not be read.
 */
function readAt(
	location: SemanticBoardLocation,
	configured: ReturnType<typeof readSemanticBoardConfiguration>,
	persistMigration: boolean,
): SemanticBoardRead | PendingMigration {
	let text: string | undefined;
	try {
		text = textAt(location.file);
	} catch (error) {
		return unreadable(location, `${location.file}: ${errorMessage(error)}`);
	}
	if (text === undefined) {
		return {
			ok: false,
			code: "BOARD_MISSING",
			problem: `no semantic board at ${location.file}`,
			location,
		};
	}
	return interpretBoard(text, location, configured, persistMigration);
}
/**
 * Interpret readable bytes without treating removed vocabulary as structural corruption.
 * @param text Board bytes.
 * @param location Board address.
 * @param configured Current interpreted policy.
 * @param persistMigration Whether the caller already owns the board lease.
 * @returns The readable board or actionable error.
 */
function interpretBoard(
	text: string,
	location: SemanticBoardLocation,
	configured: ReturnType<typeof readSemanticBoardConfiguration>,
	persistMigration: boolean,
): SemanticBoardRead | PendingMigration {
	const decoded = decodeSemanticBoardDocument(text);
	if (!decoded.ok) return unreadable(location, `${location.file}: ${decoded.problem}`);
	const read = verifiedRead(decoded.board, location, configured);
	if (!read.ok || !decoded.changed) return read;
	if (!persistMigration) return { migration: true, read };
	return persistBoardMigration(decoded.value, read);
}

/**
 * Validate the board identity, with configuration warnings.
 * @param board The coherent decoded board.
 * @param location The board address.
 * @param configured The vault configuration.
 * @returns The validated board or refusal.
 */
function verifiedRead(
	board: SemanticBoard,
	location: SemanticBoardLocation,
	configured: ReturnType<typeof readSemanticBoardConfiguration>,
): SemanticBoardRead {
	// A file copied or renamed inside a vault keeps the name written inside it.
	// A document that answers to two addresses is one the listing, the lease and
	// every pane would each name differently, so it is refused rather than read.
	if (semanticBoardAddress(board.name).key !== location.key) {
		return unreadable(
			location,
			`${location.file} holds a board that calls itself "${board.name}", which is a ` +
				`different board from "${location.name}"`,
		);
	}
	return {
		ok: true,
		board,
		location,
		warnings: [
			...configured.diagnostics,
			...(configured.ok
				? semanticVocabularyDiagnostics(board, location.file, configured.configuration)
				: []),
		],
	};
}

/**
 * Commit a validated migration as one board version under the caller's lease.
 * @param value The decoded document already validated with added order.
 * @param read The validated normalized board.
 * @returns The committed board or a persistence refusal.
 */
function persistBoardMigration(
	value: unknown,
	read: Extract<SemanticBoardRead, { readonly ok: true }>,
): SemanticBoardRead {
	if (!isRecord(value)) throw new Error("A migrated board must be a document");
	const version = read.board.version + 1;
	const updatedAt = new Date().toISOString();
	value["version"] = version;
	value["updatedAt"] = updatedAt;
	const parsed = parseSemanticBoard(value);
	if (!parsed.ok) return unreadable(read.location, parsed.problem);
	const committed = { ...read, board: parsed.board };
	try {
		// The caller holds this board's lease. Keep the validated raw document so
		// the conversion does not introduce unrelated parser defaults.
		writeFileAtomic(read.location.file, `${JSON.stringify(value, null, "\t")}\n`);
	} catch (error) {
		return unreadable(
			read.location,
			`${read.location.file}: could not persist schema migration: ${errorMessage(error)}`,
		);
	}
	return committed;
}

/**
 * Read and, if necessary, persist a migration inside an already-held lease.
 * @param location The board address.
 * @param configured The vault configuration.
 * @returns The current board or refusal.
 */
function readSemanticBoardAtUnderLease(
	location: SemanticBoardLocation,
	configured = readSemanticBoardConfiguration(),
): SemanticBoardRead {
	const result = readAt(location, configured, true);
	if ("migration" in result) {
		throw new Error("A migration cannot remain pending inside the board lease");
	}
	return result;
}

/**
 * Read without delaying current boards. A legacy document needs the same
 * per-board lease that protects all writes, and is read again once held so a
 * concurrent writer's committed version is never overwritten by a stale one.
 * @param location The board address.
 * @param configured The vault configuration.
 * @returns The current board or refusal.
 */
function readSemanticBoardAt(
	location: SemanticBoardLocation,
	configured = readSemanticBoardConfiguration(),
): SemanticBoardRead {
	const first = readAt(location, configured, false);
	if (!("migration" in first)) return first;
	return migrateOnRead(location, configured);
}

/**
 * Attempt one nonblocking migration and return a normalized pending read if held.
 * @param location The board address.
 * @param configured The vault configuration.
 * @returns The migrated or still-pending board.
 */
function migrateOnRead(
	location: SemanticBoardLocation,
	configured: ReturnType<typeof readSemanticBoardConfiguration>,
): SemanticBoardRead {
	const claim = claimWriterId(location.key);
	try {
		const attempted = withBoardLockIfFreeSync(
			{
				board: location.key,
				holder: {
					id: claim ?? `schema-migration-${mintId()}`,
					kind: "agent",
					...(claim === null ? {} : { claimed: true }),
				},
			},
			() => readSemanticBoardAtUnderLease(location, configured),
		);
		if (attempted.acquired) return attempted.value;
	} catch (error) {
		return unreadable(
			location,
			`${location.file}: could not migrate board: ${errorMessage(error)}`,
		);
	}
	// A claimed or contested board must remain readable. A later read or write
	// retries persistence when its lease becomes available.
	const latest = readAt(location, configured, false);
	if (!("migration" in latest)) return latest;
	return pendingRead(latest.read);
}

/**
 * Mark a coherent read whose migration could not yet take the lease.
 * @param read The normalized board awaiting persistence.
 * @returns The read with a pending warning.
 */
function pendingRead(read: Extract<SemanticBoardRead, { readonly ok: true }>): SemanticBoardRead {
	return {
		...read,
		warnings: [
			...read.warnings,
			{
				severity: "warning",
				code: "SCHEMA_MIGRATION_PENDING",
				file: read.location.file,
				board: read.board.name,
				message:
					"Schema migration is pending while another writer holds the board. Read it again after the claim or write ends.",
			},
		],
	};
}

/**
 * Whether a decoded JSON value is a plain object.
 * @param value The value.
 * @returns True for an object that is neither null nor an array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the board a caller asked for by name: the board that carries the name,
 * or the one that carried it before a rename (ADR 0036). What comes back is
 * that board under its own name, so a caller that asked by a former name learns
 * the name it goes by now from `board.name` and `location`.
 * @param asked The board name as typed.
 * @returns The board, or why it could not be read.
 * @throws {Error} When the name is not usable or would escape the vault.
 */
function readSemanticBoard(asked: string): SemanticBoardRead {
	return readSemanticBoardAt(resolveSemanticBoard(asked));
}

export {
	type SemanticBoardRead,
	readSemanticBoardAt,
	readSemanticBoardAtUnderLease,
	readSemanticBoard,
};
