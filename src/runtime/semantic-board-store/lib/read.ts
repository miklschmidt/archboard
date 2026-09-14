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
import { parseSemanticBoard, type SemanticBoard } from "@/shared/semantic-board/index";
import {
	locateSemanticBoard,
	semanticBoardAddress,
	type SemanticBoardLocation,
} from "@/runtime/semantic-board-store/lib/location";
import { readSemanticBoardConfiguration } from "@/runtime/semantic-board-store/lib/configuration";
import { semanticVocabularyDiagnostics } from "@/runtime/semantic-board-store/lib/vocabulary";
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
 * @returns The board, or why it could not be read.
 */
function readSemanticBoardAt(
	location: SemanticBoardLocation,
	configured = readSemanticBoardConfiguration(),
): SemanticBoardRead {
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
	return interpretBoard(text, location, configured);
}
/**
 * Interpret readable bytes without treating removed vocabulary as structural corruption.
 * @param text Board bytes.
 * @param location Board address.
 * @param configured Current interpreted policy.
 * @returns The readable board or actionable error.
 */
function interpretBoard(
	text: string,
	location: SemanticBoardLocation,
	configured: ReturnType<typeof readSemanticBoardConfiguration>,
): SemanticBoardRead {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return unreadable(location, `${location.file} is not JSON: ${errorMessage(error)}`);
	}
	const legacy = legacyGroupProblem(value);
	if (legacy !== null) {
		return unreadable(location, `${location.file}: ${legacy}`);
	}
	const parsed = parseSemanticBoard(value);
	if (!parsed.ok) {
		return unreadable(location, parsed.problem);
	}
	// A file copied or renamed inside a vault keeps the name written inside it.
	// A document that answers to two addresses is one the listing, the lease and
	// every pane would each name differently, so it is refused rather than read.
	if (semanticBoardAddress(parsed.board.name).key !== location.key) {
		return unreadable(
			location,
			`${location.file} holds a board that calls itself "${parsed.board.name}", which is a ` +
				`different board from "${location.name}"`,
		);
	}
	return {
		ok: true,
		board: parsed.board,
		location,
		warnings: [
			...configured.diagnostics,
			...(configured.ok
				? semanticVocabularyDiagnostics(parsed.board, location.file, configured.configuration)
				: []),
		],
	};
}

/**
 * The one-time conversion a document from before schema 2.2.0 needs, when it
 * needs one.
 *
 * Nodes used to carry a free-text `group` label; they now carry `groups`, a
 * list of ids the vault configuration defines. The store never rewrites a
 * board it was not asked to write, and a label is not an id — "the write
 * path" has to become some configured key somebody chose — so the file is
 * refused with exactly what to do, rather than read with the membership
 * silently dropped or a key invented for it.
 * @param value The document as parsed from disk, before the contract sees it.
 * @returns The conversion to make, or null when nothing in it is legacy.
 */
function legacyGroupProblem(value: unknown): string | null {
	const labelled = legacyGroupedNodes(value);
	if (labelled.length === 0) {
		return null;
	}
	const listed = labelled.map(({ name, group }) => `${JSON.stringify(name)} (${group})`).join(", ");
	return (
		`this board is from before schema 2.2.0 and ${labelled.length} node(s) still carry the ` +
		`retired singular "group" label: ${listed}. Convert it by hand once: define each group ` +
		`under "groups" in .archboard/config.yaml with a stable id, replace every node's ` +
		`"group": "<label>" with "groups": ["<id>"], and set "schemaVersion" to "2.2.0". ` +
		"Nothing is rewritten for you, so no membership is lost and no id is invented."
	);
}

/** One node still carrying the retired label, as far as the refusal needs to name it. */
interface LegacyGroupedNode {
	readonly name: string;
	readonly group: string;
}

/**
 * Every node of every variant that still carries a singular `group`.
 * @param value The document as parsed from disk.
 * @returns The nodes, with the label each carries.
 */
function legacyGroupedNodes(value: unknown): LegacyGroupedNode[] {
	const variants = isRecord(value) ? value["variants"] : undefined;
	if (!Array.isArray(variants)) {
		return [];
	}
	return variants.flatMap(nodesOfVariant).flatMap((node) => {
		const label = legacyLabel(node);
		return label === null ? [] : [label];
	});
}

/**
 * The nodes one decoded variant holds, whatever shape it turned out to be.
 * @param variant One entry of the document's variants.
 * @returns Its nodes, or none when it holds nothing readable.
 */
function nodesOfVariant(variant: unknown): unknown[] {
	const content = isRecord(variant) ? variant["content"] : undefined;
	const nodes = isRecord(content) ? content["nodes"] : undefined;
	return Array.isArray(nodes) ? nodes : [];
}

/**
 * The retired label one decoded node carries, when it carries one.
 * @param node One decoded node.
 * @returns What to call the node and the label, or null when it has none.
 */
function legacyLabel(node: unknown): LegacyGroupedNode | null {
	if (!isRecord(node) || typeof node["group"] !== "string") {
		return null;
	}
	const name = typeof node["name"] === "string" ? node["name"] : "?";
	return { name, group: node["group"] };
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
 * Read the board a caller asked for by name.
 * @param asked The board name as typed.
 * @returns The board, or why it could not be read.
 * @throws {Error} When the name is not usable or would escape the vault.
 */
function readSemanticBoard(asked: string): SemanticBoardRead {
	return readSemanticBoardAt(locateSemanticBoard(asked));
}

export { type SemanticBoardRead, readSemanticBoardAt, readSemanticBoard };
