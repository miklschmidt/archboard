// The shape the navigator draws the vault in, derived from what the vault
// already says and never authored for the purpose: the folders in the boards'
// names, then the drill links between boards (ADR 0029), then the names. Each
// board appears once. Pure: the same listing always gives the same outline,
// and nothing about focus, activity or selection moves a board in it.

/** One drill link as the outline reads it. */
interface OutlineLink {
	/** The board the link opens. */
	readonly board: string;
	/** The repository whose vault holds that board, when it is not this vault's. */
	readonly repo?: string | undefined;
	/** The linking node contains other nodes: the link climbs to the board it describes. */
	readonly container: boolean;
}

/** One board as the outline reads it. */
interface OutlineBoard {
	/** The board's name, which may carry `/` folders. */
	readonly name: string;
	/** The board's architecture level, when it has one. */
	readonly level?: string | null | undefined;
	/** The drill links of the variant its bare name opens. */
	readonly links: readonly OutlineLink[];
}

/** A folder in the boards' names, and what is in it. */
interface OutlineFolder<Board extends OutlineBoard> {
	readonly kind: "folder";
	/** Stable across renders: `folder:` and the folder's path. */
	readonly id: string;
	/** The folder's own segment. */
	readonly name: string;
	/** The folder's path, without a trailing slash. */
	readonly path: string;
	readonly children: readonly OutlineNode<Board>[];
	/** How many boards the folder holds at any depth. */
	readonly count: number;
}

/** A board in the outline, and the boards drawn under it. */
interface OutlineBoardNode<Board extends OutlineBoard> {
	readonly kind: "board";
	/** Stable across renders: `board:` and the board's name folded to its key. */
	readonly id: string;
	readonly board: Board;
	/** The board's own name, without its folders. */
	readonly label: string;
	readonly children: readonly OutlineNode<Board>[];
	/** Every other board that links down to this one, by name, for saying where else it sits. */
	readonly otherParents: readonly string[];
}

/** One place in the outline. */
type OutlineNode<Board extends OutlineBoard> = OutlineFolder<Board> | OutlineBoardNode<Board>;

/** A mutable node while the outline is being assembled. */
interface DraftNode<Board extends OutlineBoard> {
	readonly kind: "folder" | "board";
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly board: Board | null;
	readonly children: DraftNode<Board>[];
	otherParents: readonly string[];
}

const COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * A board name folded the way the server folds keys, so two spellings of one
 * board meet (ADR 0010).
 * @param name The name.
 * @returns The folded name.
 */
function foldName(name: string): string {
	return name.toLowerCase();
}

/**
 * The folder a board sits in: everything before its last `/`.
 * @param name The board's name.
 * @returns The folder path, or "" at the top.
 */
function folderOf(name: string): string {
	const cut = name.lastIndexOf("/");
	return cut < 0 ? "" : name.slice(0, cut);
}

/**
 * A board's own name, without its folders.
 * @param name The board's name.
 * @returns The last segment.
 */
function labelOf(name: string): string {
	return name.slice(name.lastIndexOf("/") + 1);
}

/**
 * Where a level sits in the configured order, coarsest first.
 * @param levels The configured levels.
 * @param level A board's level.
 * @returns Its rank, or null for a level the vault does not configure.
 */
function rankOf(levels: readonly string[], level: string | null | undefined): number | null {
	const rank = level === null || level === undefined ? -1 : levels.indexOf(level);
	return rank < 0 ? null : rank;
}

/** A board that could stand above another, and why. */
interface ParentCandidate {
	readonly name: string;
	/** The board says it describes the candidate's container: the strongest claim. */
	readonly container: boolean;
	/** The candidate's level rank; the closest coarser level wins among down links. */
	readonly rank: number;
}

/**
 * Whether a link from `from` to `to` places `from` above `to`: `to` names
 * `from` as the container it describes, or `from` is at a coarser level.
 * @param from The linking board.
 * @param to The linked board.
 * @param levels The configured levels.
 * @returns The candidate `from` would be for `to`, or null.
 */
function downLink(
	from: OutlineBoard,
	to: OutlineBoard,
	levels: readonly string[],
): ParentCandidate | null {
	const fromRank = rankOf(levels, from.level);
	const toRank = rankOf(levels, to.level);
	if (fromRank === null || toRank === null || fromRank >= toRank) {
		return null;
	}
	return { name: from.name, container: false, rank: fromRank };
}

/**
 * Whether a container link points up: a board describing a container of
 * another board sits under it, unless the levels say the link runs down —
 * a system board drawing a service as a container of its modules is still
 * the service's parent (ADR 0029 is guidance, and nothing enforces it).
 * @param from The linking board.
 * @param to The linked board.
 * @param levels The configured levels.
 * @returns True unless the target is at a finer level than the linking board.
 */
function pointsUp(from: OutlineBoard, to: OutlineBoard, levels: readonly string[]): boolean {
	const fromRank = rankOf(levels, from.level);
	const toRank = rankOf(levels, to.level);
	return fromRank === null || toRank === null || toRank <= fromRank;
}

/**
 * Which board one link places under which: the linker under the container it
 * describes, or the linked board under a coarser linker.
 * @param board The linking board.
 * @param target The linked board.
 * @param container Whether the link names the container the board describes.
 * @param levels The configured levels.
 * @returns The child and its candidate parent, or null for a sideways link.
 */
function linkPlacement(
	board: OutlineBoard,
	target: OutlineBoard,
	container: boolean,
	levels: readonly string[],
): { readonly child: OutlineBoard; readonly candidate: ParentCandidate } | null {
	if (container && pointsUp(board, target, levels)) {
		return { child: board, candidate: { name: target.name, container: true, rank: -1 } };
	}
	const candidate = downLink(board, target, levels);
	return candidate === null ? null : { child: target, candidate };
}

/**
 * Every board that stands above each board, within its folder: the container
 * a board says it describes, and every coarser board that links down to it.
 * @param boards The boards.
 * @param levels The configured levels.
 * @returns Parent candidates by folded board name.
 */
function parentCandidates(
	boards: readonly OutlineBoard[],
	levels: readonly string[],
): Map<string, ParentCandidate[]> {
	const byName = new Map(boards.map((board) => [foldName(board.name), board]));
	const candidates = new Map<string, ParentCandidate[]>();
	/**
	 * Record one candidate for a child, when both sit in the same folder.
	 * @param child The board that would be drawn under the candidate.
	 * @param candidate The board above it, and why.
	 */
	const add = (child: OutlineBoard, candidate: ParentCandidate): void => {
		const parent = byName.get(foldName(candidate.name));
		if (
			parent === undefined ||
			parent === child ||
			foldName(folderOf(parent.name)) !== foldName(folderOf(child.name))
		) {
			return;
		}
		const key = foldName(child.name);
		candidates.set(key, [...(candidates.get(key) ?? []), { ...candidate, name: parent.name }]);
	};
	for (const board of boards) {
		for (const link of board.links) {
			// A board of another repository is not one of these, whatever it is called here.
			if (link.repo !== undefined) continue;
			const target = byName.get(foldName(link.board));
			const placed =
				target === undefined ? null : linkPlacement(board, target, link.container, levels);
			if (placed !== null) add(placed.child, placed.candidate);
		}
	}
	return candidates;
}

/**
 * The one parent a board is drawn under: the container it describes, else
 * the closest coarser board that links down to it, ties by name.
 * @param candidates The board's parent candidates.
 * @returns The parent's name, or null for a board drawn at its folder's top.
 */
function primaryParent(candidates: readonly ParentCandidate[]): string | null {
	const ordered = candidates.toSorted(
		(a, b) =>
			Number(b.container) - Number(a.container) ||
			b.rank - a.rank ||
			COLLATOR.compare(a.name, b.name),
	);
	return ordered[0]?.name ?? null;
}

/**
 * The cycle a walk up the primary parents from one board runs into, if any.
 * @param start The board to start from, folded.
 * @param parents Primary parent by folded board name.
 * @returns The folded names on the cycle, or null when the walk reaches the top.
 */
function cycleFrom(start: string, parents: ReadonlyMap<string, string | null>): string[] | null {
	const seen: string[] = [];
	let at: string | null = start;
	while (at !== null && !seen.includes(at)) {
		seen.push(at);
		const next: string | null = parents.get(at) ?? null;
		at = next === null ? null : foldName(next);
	}
	return at === null ? null : seen.slice(seen.indexOf(at));
}

/**
 * Break every cycle among primary parents: the first board of a cycle by name
 * is drawn at its folder's top instead of under the cycle.
 * @param parents Primary parent by folded board name.
 * @param names Every board's name by folded name.
 */
function breakCycles(
	parents: Map<string, string | null>,
	names: ReadonlyMap<string, string>,
): void {
	for (const start of parents.keys()) {
		const cycle = cycleFrom(start, parents);
		const first = cycle?.toSorted((a, b) =>
			COLLATOR.compare(names.get(a) ?? a, names.get(b) ?? b),
		)[0];
		if (first !== undefined) parents.set(first, null);
	}
}

/**
 * The folder node for a path, made with its ancestors on first use.
 * @param folders Folder nodes by path.
 * @param roots The outline's top.
 * @param path The folder path.
 * @returns The children list boards in that folder go into.
 */
function folderChildren<Board extends OutlineBoard>(
	folders: Map<string, DraftNode<Board>>,
	roots: DraftNode<Board>[],
	path: string,
): DraftNode<Board>[] {
	if (path === "") return roots;
	// Folders meet case-insensitively, as board names do; the first spelling names it.
	const existing = folders.get(foldName(path));
	if (existing !== undefined) return existing.children;
	const node: DraftNode<Board> = {
		kind: "folder",
		id: `folder:${foldName(path)}`,
		name: labelOf(path),
		path,
		board: null,
		children: [],
		otherParents: [],
	};
	folders.set(foldName(path), node);
	folderChildren(folders, roots, folderOf(path)).push(node);
	return node.children;
}

/**
 * Siblings in the order a person finds them: folders first, then boards, each by name.
 * @param nodes The siblings.
 * @returns The sorted siblings.
 */
function sortSiblings<Board extends OutlineBoard>(nodes: DraftNode<Board>[]): DraftNode<Board>[] {
	return nodes.toSorted(
		(a, b) =>
			Number(a.kind === "board") - Number(b.kind === "board") || COLLATOR.compare(a.name, b.name),
	);
}

/**
 * Freeze a drafted node and its descendants into outline nodes.
 * @param node The drafted node.
 * @returns The outline node.
 */
function finish<Board extends OutlineBoard>(node: DraftNode<Board>): OutlineNode<Board> {
	const children = sortSiblings(node.children).map(finish);
	if (node.board === null) {
		return {
			kind: "folder",
			id: node.id,
			name: node.name,
			path: node.path,
			children,
			count: countBoards(children),
		};
	}
	return {
		kind: "board",
		id: node.id,
		board: node.board,
		label: node.name,
		children,
		otherParents: node.otherParents,
	};
}

/**
 * How many boards a list of nodes holds at any depth.
 * @param nodes The nodes.
 * @returns The count.
 */
function countBoards<Board extends OutlineBoard>(nodes: readonly OutlineNode<Board>[]): number {
	return nodes.reduce(
		(sum, node) => sum + (node.kind === "folder" ? node.count : 1 + countBoards(node.children)),
		0,
	);
}

/**
 * One board's drafted node, naming every parent it is not drawn under.
 * @param board The board.
 * @param primary The parent it is drawn under, or null.
 * @param candidates Every board that stands above it.
 * @returns The drafted node.
 */
function boardDraft<Board extends OutlineBoard>(
	board: Board,
	primary: string | null,
	candidates: readonly ParentCandidate[],
): DraftNode<Board> {
	const others = candidates
		.map((candidate) => candidate.name)
		.filter((name, index, all) => name !== primary && all.indexOf(name) === index);
	return {
		kind: "board",
		id: `board:${foldName(board.name)}`,
		name: labelOf(board.name),
		path: board.name,
		board,
		children: [],
		otherParents: others,
	};
}

/**
 * The primary parent of every board, with cycles broken.
 * @param boards The boards.
 * @param candidates Parent candidates by folded board name.
 * @returns Primary parent by folded board name.
 */
function primaryParents(
	boards: readonly OutlineBoard[],
	candidates: ReadonlyMap<string, ParentCandidate[]>,
): Map<string, string | null> {
	const names = new Map(boards.map((board) => [foldName(board.name), board.name]));
	const parents = new Map<string, string | null>(
		boards.map((board) => [
			foldName(board.name),
			primaryParent(candidates.get(foldName(board.name)) ?? []),
		]),
	);
	breakCycles(parents, names);
	return parents;
}

/**
 * The outline of a vault: folders from the names, boards under the board they
 * drill down from, siblings by name. A board with several parents is drawn
 * once, under its primary parent, and names the others.
 * @param boards The listed boards.
 * @param levels The vault's configured levels, coarsest first.
 * @returns The outline's top nodes.
 */
function buildOutline<Board extends OutlineBoard>(
	boards: readonly Board[],
	levels: readonly string[],
): OutlineNode<Board>[] {
	const candidates = parentCandidates(boards, levels);
	const parents = primaryParents(boards, candidates);
	const nodes = new Map(
		boards.map((board) => {
			const own = foldName(board.name);
			return [own, boardDraft(board, parents.get(own) ?? null, candidates.get(own) ?? [])];
		}),
	);
	const roots: DraftNode<Board>[] = [];
	const folders = new Map<string, DraftNode<Board>>();
	for (const [own, node] of nodes) {
		const parent = parents.get(own) ?? null;
		const under = parent === null ? undefined : nodes.get(foldName(parent));
		(under?.children ?? folderChildren(folders, roots, folderOf(node.path))).push(node);
	}
	return sortSiblings(roots).map(finish);
}

/**
 * The boards above one board in the outline, outermost first: its folders are
 * not included, only the boards it is drawn under.
 * @param outline The outline.
 * @param name The board's name.
 * @returns The ancestor boards, or an empty list for a board at the top or not listed.
 */
function boardAncestors<Board extends OutlineBoard>(
	outline: readonly OutlineNode<Board>[],
	name: string,
): Board[] {
	const wanted = foldName(name);
	/**
	 * Search one level for the board, carrying the boards passed on the way.
	 * @param nodes The level.
	 * @param trail The boards above it.
	 * @returns The boards above the board, or null when it is not under this level.
	 */
	const walk = (nodes: readonly OutlineNode<Board>[], trail: Board[]): Board[] | null => {
		for (const node of nodes) {
			if (node.kind === "board" && foldName(node.board.name) === wanted) return trail;
			const next = node.kind === "board" ? [...trail, node.board] : trail;
			const found = walk(node.children, next);
			if (found !== null) return found;
		}
		return null;
	};
	return walk(outline, []) ?? [];
}

/**
 * The outline ids that lead to one board: every folder and board it sits
 * under, so revealing the board opens exactly those.
 * @param outline The outline.
 * @param name The board's name.
 * @returns The ids, outermost first; empty when the board is at the top or not listed.
 */
function pathIds(outline: readonly OutlineNode<OutlineBoard>[], name: string): string[] {
	const wanted = foldName(name);
	/**
	 * Search one level for the board, carrying the ids passed on the way.
	 * @param nodes The level.
	 * @param trail The ids above it.
	 * @returns The ids above the board, or null when it is not under this level.
	 */
	const walk = (nodes: readonly OutlineNode<OutlineBoard>[], trail: string[]): string[] | null => {
		for (const node of nodes) {
			if (node.kind === "board" && foldName(node.board.name) === wanted) return trail;
			const found = walk(node.children, [...trail, node.id]);
			if (found !== null) return found;
		}
		return null;
	};
	return walk(outline, []) ?? [];
}

export {
	boardAncestors,
	buildOutline,
	countBoards,
	pathIds,
	type OutlineBoard,
	type OutlineBoardNode,
	type OutlineFolder,
	type OutlineLink,
	type OutlineNode,
};
