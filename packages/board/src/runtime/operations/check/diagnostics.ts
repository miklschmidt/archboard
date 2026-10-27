import fs from "node:fs";
import path from "node:path";
import { normalizeBoardKey } from "#runtime/store/address.ts";
import { errorMessage } from "@archboard/diagnostics/errno";
import { currentVariant, type SemanticBoard } from "#shared/schemas/board-document.ts";
import { overviewContent } from "#shared/rules/scope.ts";
import { type SemanticNode } from "#shared/schemas/content.ts";
import type { VaultCheck, VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { readSemanticBoardConfiguration } from "#runtime/store/configuration.ts";
import {
	semanticBoardAddress,
	type SemanticBoardLocation,
	SEMANTIC_BOARD_FILE_SUFFIX,
} from "#runtime/store/location.ts";
import { readSemanticBoardAt } from "#runtime/operations/read/read.ts";
import { edgeSubjects } from "#runtime/operations/check/subject.ts";
import {
	createDrillLookup,
	type DrillDownTarget,
	semanticDrillDownDiagnostics,
} from "#runtime/operations/check/drill-down.ts";
import { sharedSymbolDiagnostics } from "#runtime/operations/check/shared-symbols.ts";
import { semanticUnconnectedNodeDiagnostics } from "#runtime/operations/check/unconnected-nodes.ts";
import {
	createCheckoutLookup,
	semanticBindingDiagnostics,
} from "#runtime/operations/check/bindings.ts";

// How much a board's overview may draw before it reads as a wall of lines
// (ADR 0052).
//
// The numbers come from the dogfood vault on 2026-10-15. Its four smallest
// overviews drew 12 to 17 parts and 17 to 20 lines. Live panes, which its
// owner found unreadable, drew 25 parts and 69 lines. A board over either
// number needs structure: containers that gather its parts, and views that
// open each one.

/** The most parts an overview draws before the check asks for structure. */
const OVERVIEW_MOST_PARTS = 15;

/** The most lines an overview draws before the check asks for structure. */
const OVERVIEW_MOST_LINES = 25;

/**
 * A warning when the overview of a board's current variant draws more than
 * the budget allows.
 * @param board The board, as read.
 * @param file The file it was read from.
 * @returns The warning, or nothing.
 */
function semanticOverviewDiagnostics(board: SemanticBoard, file: string): VaultDiagnostic[] {
	const variant = currentVariant(board);
	if (variant === undefined) {
		return [];
	}
	const overview = overviewContent(variant.content);
	const [parts, lines] = [overview.nodes.length, overview.edges.length];
	if (parts <= OVERVIEW_MOST_PARTS && lines <= OVERVIEW_MOST_LINES) {
		return [];
	}
	return [
		{
			severity: "warning",
			code: "OVERVIEW_CROWDED",
			file,
			board: board.name,
			variant: variant.name,
			message:
				`The overview of ${JSON.stringify(board.name)} draws ${parts} parts and ${lines} lines, ` +
				`over the budget of ${OVERVIEW_MOST_PARTS} parts and ${OVERVIEW_MOST_LINES} lines. ` +
				"Gather the parts of the board's subject into a few containers, each with a " +
				"responsibility the code supports, and add a view that opens each one. Draw one " +
				"relationship between two parts, and put the calls between them in a flow.",
		},
	];
}

/**
 * A warning for each relationship of a board's current variant that joins a
 * container and a part inside it, in either direction (ADR 0052).
 *
 * The nesting already says that a container holds its parts, so a view that
 * opens the container draws such a line from the box into itself, and a reader
 * cannot tell what it means. A call that runs inside a container starts at the
 * part that makes it.
 * @param board The board, as read.
 * @param file The file it was read from.
 * @returns One warning per such relationship.
 */
function semanticContainerLineDiagnostics(board: SemanticBoard, file: string): VaultDiagnostic[] {
	const variant = currentVariant(board);
	if (variant === undefined) {
		return [];
	}
	const byId = new Map(variant.content.nodes.map((node) => [node.id, node]));
	const subjectOf = edgeSubjects(variant.content);
	return variant.content.edges.flatMap((edge) => {
		const container = holds(byId, edge.from, edge.to)
			? edge.from
			: holds(byId, edge.to, edge.from)
				? edge.to
				: undefined;
		if (container === undefined) {
			return [];
		}
		const holder = JSON.stringify(byId.get(container)?.name ?? container);
		return [
			{
				severity: "warning" as const,
				code: "CONTAINER_LINE_TO_OWN_PART",
				file,
				board: board.name,
				variant: variant.name,
				subject: subjectOf(edge),
				message:
					`It joins ${holder} and a part inside it, which the nesting already draws. ` +
					`Start or end it at the part inside ${holder} that makes or answers the call.`,
			},
		];
	});
}

/**
 * Whether a container holds a part, at any depth.
 * @param byId The variant's nodes, by id.
 * @param container The container.
 * @param part The part.
 * @returns True when the part sits inside the container.
 */
function holds(byId: ReadonlyMap<string, SemanticNode>, container: string, part: string): boolean {
	for (let at = byId.get(part)?.parent; at !== undefined; at = byId.get(at)?.parent) {
		if (at === container) return true;
	}
	return false;
}

/**
 * Check every board family and report traversal/read failures rather than hiding them.
 *
 * Boards are read first and linked afterwards: whether a drill-down opens a
 * board the vault holds, and at which level, is a fact about the vault rather
 * than about the board that states it (ADR 0029), so it can only be answered
 * once every board has been seen. A node's binding is checked in the same pass
 * and for the same reason, against a filesystem the board does not own.
 * @param root The vault root.
 * @returns Current policy and all diagnostics.
 */
function checkSemanticVault(root: string): VaultCheck {
	const configured = readSemanticBoardConfiguration(root);
	const diagnostics = [...configured.diagnostics];
	const addresses = new Map<string, string>();
	const read = boardFiles(root, diagnostics).flatMap((file) => {
		const board = readBoardFile(file, root, configured, addresses, diagnostics);
		return board === null ? [] : [{ board, file }];
	});
	const lookup = createDrillLookup(root, drillTargets(read.map(({ board }) => board)));
	const checkoutOf = createCheckoutLookup(root);
	for (const { board, file } of read) {
		diagnostics.push(...semanticDrillDownDiagnostics(board, file, lookup));
		diagnostics.push(...semanticBindingDiagnostics(board, file, checkoutOf));
		diagnostics.push(...semanticOverviewDiagnostics(board, file));
		diagnostics.push(...semanticContainerLineDiagnostics(board, file));
		diagnostics.push(...semanticUnconnectedNodeDiagnostics(board, file));
	}
	diagnostics.push(...sharedSymbolDiagnostics(read, lookup));
	return {
		policy: configured.configuration,
		configurationValid: configured.ok,
		configurationFile: configured.file,
		fingerprint: configured.fingerprint,
		diagnostics,
	};
}
/**
 * Every board a drill-down can open, by the key of every name it answers to:
 * its own, and each it had before a rename (ADR 0036). A board's own name wins
 * over another board's former one, as it does wherever a name is resolved.
 * @param boards Every board the vault holds.
 * @returns The targets, by address key.
 */
function drillTargets(boards: readonly SemanticBoard[]): Map<string, DrillDownTarget> {
	const targets = new Map<string, DrillDownTarget>();
	for (const board of boards) {
		for (const former of board.formerNames ?? []) {
			targets.set(normalizeBoardKey(former), { name: board.name, level: board.level });
		}
	}
	for (const board of boards) {
		targets.set(semanticBoardAddress(board.name).key, { name: board.name, level: board.level });
	}
	return targets;
}

/**
 * Read one board file, recording whatever stopped it from being read.
 * @param file The board file.
 * @param root The vault root.
 * @param configured Current interpreted vault configuration.
 * @param addresses The first file seen at every identity.
 * @param diagnostics Collected vault problems.
 * @returns The board, or null when it could not be read.
 */
function readBoardFile(
	file: string,
	root: string,
	configured: ReturnType<typeof readSemanticBoardConfiguration>,
	addresses: Map<string, string>,
	diagnostics: VaultDiagnostic[],
): SemanticBoard | null {
	try {
		const name = path
			.relative(root, file)
			.split(path.sep)
			.join("/")
			.slice(0, -SEMANTIC_BOARD_FILE_SUFFIX.length);
		const location = { ...semanticBoardAddress(name), file };
		recordAddress(location, addresses, diagnostics);
		const result = readSemanticBoardAt(root, location, configured, { migrate: false });
		if (!result.ok) {
			diagnostics.push({
				severity: "error",
				code: result.code,
				file,
				board: name,
				message: result.problem,
			});
			return null;
		}
		diagnostics.push(...result.warnings.filter((warning) => warning.code !== "INVALID_CONFIG"));
		return result.board;
	} catch (error) {
		diagnostics.push({
			severity: "error",
			code: "BOARD_UNREADABLE",
			file,
			message: errorMessage(error),
		});
		return null;
	}
}

/**
 * Enumerate authored board files without silently dropping invalid names or inaccessible folders.
 * @param directory The directory to inspect.
 * @param diagnostics Collected traversal failures.
 * @returns Every authored board path.
 */
function boardFiles(directory: string, diagnostics: VaultDiagnostic[]): string[] {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch (error) {
		diagnostics.push({
			severity: "error",
			code: "VAULT_UNREADABLE",
			file: directory,
			message: `Cannot check this directory: ${errorMessage(error)}`,
		});
		return [];
	}
	const files: string[] = [];
	for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith(".")) continue;
		const file = path.join(directory, entry.name);
		files.push(...filesIn(entry, file, diagnostics));
	}
	return files;
}
export { checkSemanticVault };

/**
 * Inspect an entry without following links outside the vault.
 * @param entry Directory entry.
 * @param file Its full path.
 * @param diagnostics Traversal failures.
 * @returns Board paths inside this entry.
 */
function filesIn(entry: fs.Dirent, file: string, diagnostics: VaultDiagnostic[]): string[] {
	if (entry.isDirectory()) return boardFiles(file, diagnostics);
	if (!entry.name.endsWith(SEMANTIC_BOARD_FILE_SUFFIX)) return [];
	if (entry.isSymbolicLink()) {
		diagnostics.push({
			severity: "error",
			code: "BOARD_UNREADABLE",
			file,
			message: "Board file is a symbolic link. Store the authored board inside the vault.",
		});
		return [];
	}
	return entry.isFile() ? [file] : [];
}

/**
 * Report distinct files that share the case-insensitive board identity.
 * @param location The actual scanned file and its normalized identity.
 * @param addresses The first file seen at every identity.
 * @param diagnostics Collected vault problems.
 */
function recordAddress(
	location: SemanticBoardLocation,
	addresses: Map<string, string>,
	diagnostics: VaultDiagnostic[],
): void {
	const prior = addresses.get(location.key);
	if (prior === undefined) {
		addresses.set(location.key, location.file);
		return;
	}
	diagnostics.push({
		severity: "error",
		code: "DUPLICATE_BOARD",
		file: location.file,
		board: location.key,
		message: `${prior} and ${location.file} both identify board ${JSON.stringify(location.key)}. Rename or remove one file so every board has one unambiguous identity.`,
	});
}
