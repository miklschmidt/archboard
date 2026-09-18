// A fixture teaches an author the shapes it uses. The inherited fixtures drew
// calls onto containers, which is the one shape the rubric marks a run down
// for, and four S00 runs and the S14 runs failed `edge.actual-receiver` over
// exactly it (TASK-264). A paid batch is the expensive way to find that, so
// this refuses it at `eval:skill check` instead.

/**
 * The relationship kinds that land on one part, rather than address a whole
 * module.
 *
 * A call names the part that runs the code, and the container drawn around
 * that part runs nothing: a call ending on a part with children names a
 * receiver that is not the receiver. That is what
 * `no-edge-to-container-with-children` fails and what the grader marks down as
 * `edge.actual-receiver`. A `dependency` or an `extends` says something about
 * the module itself rather than about a line inside it, so it may address a
 * part with children and is left alone — the only whole-module relationships
 * in the suite today are of those two kinds.
 */
const LANDING_KINDS = new Set(["call"]);

/** The ops whose input states parts and relationships; the rest settle or adopt. */
const CONTENT_OPS = new Set(["new", "edit"]);

/** A call relationship a fixture wrote, by the keys of the parts it runs between. */
interface Landing {
	readonly from: string;
	readonly to: string;
}

/**
 * One board as a fixture's steps have left it so far, in the names the fixture
 * writes rather than the ids the product would mint.
 */
interface FixtureBoard {
	/** The key each name a node has gone by folds onto: the one it was created under. */
	readonly keys: Map<string, string>;
	/** The children a part has, by its key. */
	readonly children: Map<string, Set<string>>;
	/** Every call relationship written so far. */
	landings: Landing[];
}

/**
 * Whether a value is an object with fields, as fixture JSON holds one.
 * @param value The value.
 * @returns True when fields can be read off it.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * The entries of a fixture list, ignoring anything that is not an object.
 * @param value The list, as the loose input holds it.
 * @returns The entries.
 */
function records(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

/**
 * The node a fixture reference names: a plain name, or the `$node(name)` a
 * fixture spells a node an earlier step created with. A fixture never holds a
 * minted id, so the name a node was created under is its identity here.
 * @param value The reference, if it is one.
 * @returns The name, or undefined when the value is not a reference.
 */
function referenced(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return (/^\$node\((.+)\)$/u.exec(trimmed)?.[1] ?? trimmed).trim();
}

/**
 * What a reference resolves to on one board: the key a rename folded it onto,
 * or itself when the board has not met it.
 * @param board The board so far.
 * @param reference The reference.
 * @returns The key.
 */
function keyOf(board: FixtureBoard, reference: string): string {
	return board.keys.get(reference) ?? reference;
}

/**
 * The key one stated node stands under, with the name it states folded onto it
 * so a rename never splits a part in two.
 * @param board The board so far.
 * @param node The stated node.
 * @returns The key, or undefined when the entry names no node at all.
 */
function keyFor(board: FixtureBoard, node: Record<string, unknown>): string | undefined {
	const name = referenced(node["name"]);
	const stated = referenced(node["id"]) ?? name;
	if (stated === undefined || stated === "") return undefined;
	const key = keyOf(board, stated);
	board.keys.set(key, key);
	if (name !== undefined) board.keys.set(name, key);
	return key;
}

/**
 * One part put under the parent it states, if it states one.
 * @param board The board so far.
 * @param key The part's key.
 * @param parent What it names as its parent.
 */
function place(board: FixtureBoard, key: string, parent: string | undefined): void {
	if (parent === undefined) return;
	const under = keyOf(board, parent);
	board.children.set(under, (board.children.get(under) ?? new Set<string>()).add(key));
}

/**
 * One stated node, folded into the board. A node is stated in full, so one
 * that no longer names a parent has left the part it was under.
 * @param board The board so far.
 * @param node The stated node.
 */
function noteNode(board: FixtureBoard, node: Record<string, unknown>): void {
	const key = keyFor(board, node);
	if (key === undefined) return;
	for (const children of board.children.values()) children.delete(key);
	place(board, key, referenced(node["parent"]));
}

/**
 * One stated relationship, kept when it is a kind that lands on a part.
 * @param board The board so far.
 * @param edge The stated relationship.
 */
function noteEdge(board: FixtureBoard, edge: Record<string, unknown>): void {
	const kind = edge["kind"];
	const from = referenced(edge["from"]);
	const to = referenced(edge["to"]);
	if (typeof kind !== "string" || !LANDING_KINDS.has(kind)) return;
	if (from === undefined || to === undefined) return;
	board.landings.push({ from: keyOf(board, from), to: keyOf(board, to) });
}

/**
 * A removed node, taken off the board with the containment and the
 * relationships that went with it.
 * @param board The board so far.
 * @param reference What the removal names.
 */
function forgetNode(board: FixtureBoard, reference: string): void {
	const key = keyOf(board, reference);
	board.children.delete(key);
	for (const children of board.children.values()) children.delete(key);
	board.landings = board.landings.filter((landing) => landing.from !== key && landing.to !== key);
}

/**
 * One step's content applied to the board the steps before it left.
 * @param board The board so far.
 * @param input What the step states.
 */
function applyStep(board: FixtureBoard, input: Record<string, unknown>): void {
	for (const node of records(input["nodes"])) noteNode(board, node);
	for (const edge of records(input["edges"])) noteEdge(board, edge);
	const removals = Array.isArray(input["removeNodes"]) ? input["removeNodes"] : [];
	for (const removal of removals) {
		const reference = referenced(removal);
		if (reference !== undefined) forgetNode(board, reference);
	}
}

/**
 * The board and content one step states, when it is a step that states content.
 * @param value The step, as the fixture file holds it.
 * @returns The board it writes and what it states, or undefined.
 */
function contentOf(
	value: unknown,
): { readonly board: string; readonly input: Record<string, unknown> } | undefined {
	if (!isRecord(value) || !CONTENT_OPS.has(String(value["op"]))) return undefined;
	const board = value["board"];
	const input = value["input"];
	if (typeof board !== "string" || !isRecord(input)) return undefined;
	return { board, input };
}

/**
 * What the board says now: every call whose target has children, named once.
 * @param where Where the problem is, as a line already says it.
 * @param board The board so far.
 * @param reported The relationships already named.
 * @returns Problems, one line each.
 */
function landed(where: string, board: FixtureBoard, reported: Set<string>): string[] {
	const problems: string[] = [];
	for (const landing of board.landings) {
		const children = board.children.get(landing.to);
		const relationship = `${where} ${landing.from} -> ${landing.to}`;
		if (children === undefined || children.size === 0 || reported.has(relationship)) continue;
		reported.add(relationship);
		problems.push(
			`${relationship}: a call lands on ${landing.to}, which ${[...children].toSorted().join(", ")} names as its parent`,
		);
	}
	return problems;
}

/**
 * Where one fixture teaches the shape the rubric marks a run down for: a call
 * that ends on a part another part names as its parent.
 *
 * The rule reads what the steps have accumulated rather than one step alone,
 * because a later `edit` can add a child under a part an earlier step already
 * drew a call onto, and the vault the fixture lays then teaches the offending
 * shape just as plainly as if one step had written both.
 * @param id The scenario the fixture belongs to.
 * @param fixture The fixture, as its file holds it.
 * @returns Problems, one line each, one per relationship.
 */
function fixtureLandings(id: string, fixture: unknown): string[] {
	const boards = new Map<string, FixtureBoard>();
	const reported = new Set<string>();
	const problems: string[] = [];
	const steps = isRecord(fixture) ? fixture["steps"] : [];
	for (const [index, step] of records(steps).entries()) {
		const content = contentOf(step);
		if (content === undefined) continue;
		const board = boards.get(content.board) ?? {
			keys: new Map<string, string>(),
			children: new Map<string, Set<string>>(),
			landings: [],
		};
		boards.set(content.board, board);
		applyStep(board, content.input);
		problems.push(...landed(`${id} step ${index} ${content.board}:`, board, reported));
	}
	return problems;
}

/**
 * Every fixture relationship that lands on a part with children.
 * @param fixtures The fixtures, by the scenario each belongs to.
 * @returns Problems, one line each.
 */
function landingProblems(fixtures: Iterable<readonly [string, unknown]>): string[] {
	return [...fixtures].flatMap(([id, fixture]) => fixtureLandings(id, fixture));
}

export { landingProblems };
