// Which boards describe a repository.
//
// An agent opening a repository it has never seen knows archboard exists, from
// the skill, but not which board covers what is in front of it. The manual
// answer is a line in that repo's own CLAUDE.md, which works and has to be
// written by somebody.
//
// It does not have to be. Every node carries a binding, and since ADR 0011 a
// binding names a repository identity, so "which boards have nodes bound to
// this repo" is answerable from what archboard already stores. It also answers
// the case a naming convention cannot: one system board spanning five
// repositories belongs to none of them and is named after none of them, yet it
// is the board each of those five repos most wants found.
//
// The scan reads every note in the vault. Boards are megabytes and vaults hold
// dozens, so this is a query to run when an agent arrives somewhere, not one to
// run every turn. There is no index, because an index is a second copy of the
// truth that can be wrong, and the truth is cheap enough to read.

import fs from "fs";
import { type ServerElement } from "@/runtime/engine/types";
import {
	type BoardIdentity,
	extractSceneElements,
	listBoards,
	requireVaultRoot,
} from "@/runtime/engine/board";
import { archboardBlock } from "@/runtime/engine/promote";
import type { ArchboardBlock, LogicalAddress } from "@/runtime/engine/metadata";
import { errorMessage } from "@/runtime/engine/lib/thrown-error";

/** One node on a board, bound to the repository being asked about. */
interface BoundNode {
	node: string;
	kind?: string;
	/** What the board calls it: the declared name, else the label it shows. */
	name?: string;
	path: string;
	branch?: string;
	commit?: string;
}

interface RepoBoard {
	key: string;
	identity: BoardIdentity;
	/** Where this was read from: the note on disk, or the copy open on the canvas. */
	source: "vault" | "memory";
	file?: string;
	nodes: BoundNode[];
}

interface RepoBoardsResult {
	repo: string;
	boards: RepoBoard[];
	/** How many boards were looked at, so an empty answer is distinguishable from an empty vault. */
	scanned: number;
	/** Notes that could not be read as a board, named rather than swallowed. */
	unreadable: Array<{ file: string; reason: string }>;
}

/** A board this process holds in memory, which may hold work no note has yet. */
interface OpenBoard {
	key: string;
	identity: BoardIdentity;
	elements: ServerElement[];
	file?: string;
}

/** One note that could not be read as a board. */
type UnreadableNote = RepoBoardsResult["unreadable"][number];

/** One note the vault listing offered, before it has been read. */
type FoundNote = ReturnType<typeof listBoards>[number];

/**
 * The text bound to one shape, wherever on the board that text element sits.
 * @param containerId The shape's id.
 * @param elements Every element on the board.
 * @returns The words, or undefined when nothing is bound to it.
 */
function boundLabelOf(containerId: string, elements: readonly ServerElement[]): string | undefined {
	for (const other of elements) {
		if (other.type === "text" && other.containerId === containerId && other.text) {
			return other.text;
		}
	}
	return undefined;
}

/**
 * What one element says on the board: its own text, or the text bound to it.
 * @param el The element.
 * @param elements Every element on the board.
 * @returns The words, or undefined when it shows none.
 */
function labelOf(el: ServerElement, elements: readonly ServerElement[]): string | undefined {
	const direct = el.type === "text" ? el.text : undefined;
	return direct || boundLabelOf(el.id, elements);
}

/**
 * The node id an element belongs to, falling back to the element's own id for
 * something bound but never promoted.
 * @param el The element.
 * @param block Its archboard block.
 * @returns The id.
 */
function nodeIdFor(el: ServerElement, block: ArchboardBlock): string {
	return typeof block.node === "string" && block.node ? block.node : el.id;
}

/**
 * What the board calls a node: the declared name, else the label it shows.
 * @param el The element.
 * @param block Its archboard block.
 * @param elements Every element on the board, for the label.
 * @returns The name, or undefined when nothing names it.
 */
function boundNodeName(
	el: ServerElement,
	block: ArchboardBlock,
	elements: readonly ServerElement[],
): string | undefined {
	return typeof block.name === "string" && block.name ? block.name : labelOf(el, elements);
}

/**
 * Where in the repository a node points, with the branch and commit it was
 * last confirmed against when it has them.
 * @param binding The node's binding.
 * @returns The address fields.
 */
function bindingFields(binding: LogicalAddress): Pick<BoundNode, "path" | "branch" | "commit"> {
	return {
		path: binding.path,
		...(binding.branch ? { branch: binding.branch } : {}),
		...(binding.commit ? { commit: binding.commit } : {}),
	};
}

/**
 * One node as this answer reports it.
 * @param el One of the node's elements.
 * @param block Its archboard block.
 * @param binding Its binding into the repository.
 * @param elements Every element on the board, for the label.
 * @returns The node.
 */
function boundNodeOf(
	el: ServerElement,
	block: ArchboardBlock,
	binding: LogicalAddress,
	elements: readonly ServerElement[],
): BoundNode {
	const name = boundNodeName(el, block, elements);
	return {
		node: nodeIdFor(el, block),
		...(typeof block.kind === "string" ? { kind: block.kind } : {}),
		...(name ? { name } : {}),
		...bindingFields(binding),
	};
}

/**
 * One element's binding, when it points into the repository being asked about.
 * @param el The element.
 * @param repo The repository identity.
 * @returns Its block and binding, or undefined when it points elsewhere.
 */
function bindingTo(
	el: ServerElement,
	repo: string,
): { block: ArchboardBlock; binding: LogicalAddress } | undefined {
	const block = archboardBlock(el);
	if (!block?.binding || block.binding.repo !== repo) {
		return undefined;
	}
	return { block, binding: block.binding };
}

/**
 * Order the nodes by id, so the same board always reads the same way.
 * @param a One node.
 * @param b The other.
 * @returns Their order.
 */
const byNodeId = (a: BoundNode, b: BoundNode): number =>
	a.node < b.node ? -1 : a.node > b.node ? 1 : 0;

/**
 * The nodes on one board bound to one repository.
 *
 * Deduplicated by node id, because a node is a set of elements and every one of
 * them carries the same block: a labelled box is two elements and one node.
 * @param elements The board's elements.
 * @param repo The repository identity.
 * @returns The nodes, by id.
 */
function nodesBoundTo(elements: ServerElement[], repo: string): BoundNode[] {
	const byNode = new Map<string, BoundNode>();
	for (const el of elements) {
		const found = bindingTo(el, repo);
		if (!found) {
			continue;
		}
		const node = boundNodeOf(el, found.block, found.binding, elements);
		if (!byNode.has(node.node)) {
			byNode.set(node.node, node);
		}
	}
	return [...byNode.values()].toSorted(byNodeId);
}

/**
 * One board open on the canvas, when it has a node bound to the repository.
 * @param board The board as this process holds it.
 * @param repo The repository identity.
 * @returns The entry, or undefined when nothing on it is bound there.
 */
function openBoardEntry(board: OpenBoard, repo: string): RepoBoard | undefined {
	const nodes = nodesBoundTo(board.elements, repo);
	if (nodes.length === 0) {
		return undefined;
	}
	return {
		key: board.key,
		identity: board.identity,
		source: "memory",
		...(board.file ? { file: board.file } : {}),
		nodes,
	};
}

/**
 * One note in the vault, when it has a node bound to the repository.
 *
 * A note that cannot be read is named rather than swallowed: an unreadable
 * board is a different answer from a board with nothing in it.
 * @param found The note the vault listing offered.
 * @param repo The repository identity.
 * @param unreadable Where to record a note that could not be read.
 * @returns The entry, or undefined.
 */
function vaultBoardEntry(
	found: FoundNote,
	repo: string,
	unreadable: UnreadableNote[],
): RepoBoard | undefined {
	let elements: ServerElement[];
	try {
		elements = extractSceneElements(fs.readFileSync(found.file, "utf-8"));
	} catch (error) {
		unreadable.push({ file: found.file, reason: errorMessage(error) });
		return undefined;
	}
	const nodes = nodesBoundTo(elements, repo);
	if (nodes.length === 0) {
		return undefined;
	}
	return {
		key: found.key,
		identity: found.identity,
		source: "vault",
		file: found.file,
		nodes,
	};
}

/**
 * Order the boards by key, so the same vault always reads the same way.
 * @param a One board.
 * @param b The other.
 * @returns Their order.
 */
const byBoardKey = (a: RepoBoard, b: RepoBoard): number =>
	a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/**
 * Answer from the boards this process already holds, which may carry work no
 * note has yet.
 * @param open The boards in memory.
 * @param repo The repository identity.
 * @param result The answer so far, added to in place.
 * @returns The board keys answered from memory, so the vault scan skips them.
 */
function collectOpenBoards(
	open: readonly OpenBoard[],
	repo: string,
	result: RepoBoardsResult,
): Set<string> {
	const seen = new Set<string>();
	for (const board of open) {
		seen.add(board.key);
		result.scanned += 1;
		const entry = openBoardEntry(board, repo);
		if (entry) {
			result.boards.push(entry);
		}
	}
	return seen;
}

/**
 * Read every note in the vault this process is not already holding.
 * @param root The vault to scan.
 * @param repo The repository identity.
 * @param seen The boards already answered from memory.
 * @param result The answer so far, added to in place.
 */
function collectVaultBoards(
	root: string,
	repo: string,
	seen: ReadonlySet<string>,
	result: RepoBoardsResult,
): void {
	for (const found of listBoards(root)) {
		if (seen.has(found.key)) {
			continue;
		}
		result.scanned += 1;
		const entry = vaultBoardEntry(found, repo, result.unreadable);
		if (entry) {
			result.boards.push(entry);
		}
	}
}

/**
 * Every board with at least one node bound to `repo`.
 *
 * A board that is open on the canvas is read from memory rather than from its
 * note, so a binding made a minute ago and not yet saved still answers. That is
 * the same rule `compare` uses, for the same reason: the canvas is where the
 * work is.
 * @param repo The repository identity.
 * @param open The boards this process holds in memory.
 * @param root The vault to scan.
 * @returns The boards, how many were read, and any note that could not be.
 */
function boardsForRepo(
	repo: string,
	open: OpenBoard[] = [],
	root = requireVaultRoot(),
): RepoBoardsResult {
	const result: RepoBoardsResult = { repo, boards: [], scanned: 0, unreadable: [] };
	const seen = collectOpenBoards(open, repo, result);
	collectVaultBoards(root, repo, seen, result);
	result.boards.toSorted(byBoardKey);
	return result;
}

/**
 * One board and its bound nodes, as lines of the prose answer.
 * @param board The board.
 * @returns Its lines.
 */
function boardLines(board: RepoBoard): string[] {
	const level = board.identity.level ? `, ${board.identity.level}` : "";
	const lines = [`  ${board.key} (${board.identity.variant}${level}, ${board.source})`];
	for (const node of board.nodes) {
		const kind = node.kind ? ` [${node.kind}]` : "";
		lines.push(`    ${node.name ?? node.node}${kind} -> ${node.path}`);
	}
	return lines;
}

/**
 * The same answer as prose, for a caller narrating it rather than parsing it.
 * @param result What the scan found.
 * @returns The prose.
 */
function repoBoardsText(result: RepoBoardsResult): string {
	if (result.boards.length === 0) {
		return `No board in the vault has a node bound to ${result.repo} (${result.scanned} board(s) read).`;
	}
	const lines = [
		`Boards describing ${result.repo}:`,
		...result.boards.flatMap((board) => boardLines(board)),
	];
	if (result.unreadable.length > 0) {
		lines.push(
			`Could not read ${result.unreadable.length} note(s): ` +
				result.unreadable.map((entry) => entry.file).join(", "),
		);
	}
	return lines.join("\n");
}

export {
	type BoundNode,
	type RepoBoard,
	type RepoBoardsResult,
	type OpenBoard,
	nodesBoundTo,
	boardsForRepo,
	repoBoardsText,
};
