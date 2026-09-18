// A fixture teaches an author the shapes it uses. The inherited fixtures drew
// relationships onto containers, which is the shape the rubric marks a run down
// for, and four S00 runs and the S14 runs failed `edge.actual-receiver` over
// exactly it (TASK-264). A paid batch is the expensive way to find that, so
// this refuses it at `eval:skill check` instead.

import { FIRST_VARIANT_NAME } from "@/runtime/semantic-board-store/index";
import type {
	BoardCreateInput,
	SemanticEdgeInput,
	SemanticNodeInput,
	VariantEditInput,
} from "@/shared/semantic-board/index";
import type { Fixture, RawFixtureStep } from "@/runtime/skill-evaluation/lib/suite";

/**
 * The one relationship kind that may end on a part with children.
 *
 * A container is an endpoint only when the relationship means the whole
 * module, and a `dependency` is the kind that does: it says one part needs
 * another module as a whole, as a higher-level view draws it. Every other
 * kind names a receiver — a call, a request over http or rpc, an event or a
 * queue message somebody handles, data somebody reads or writes, a render —
 * and the container drawn around the receiving part receives nothing. That is
 * what `no-edge-to-container-with-children` fails at run time (it allows no
 * kind at all) and what the grader marks down as `edge.actual-receiver`.
 */
const WHOLE_MODULE_KINDS = new Set(["dependency"]);

/**
 * The fields of a stated edit this reads, tied to the input's own type so a
 * renamed field breaks type-check instead of silently checking nothing.
 * `removeEdges` is not among them: a fixture can only spell a relationship by
 * an id the product mints, so it cannot remove or re-point one. It needs
 * handling only if a `$edge(...)` placeholder is ever added.
 */
const EDIT = {
	variant: "variant",
	nodes: "nodes",
	edges: "edges",
	removeNodes: "removeNodes",
} as const satisfies Record<string, keyof VariantEditInput>;
/** A creation states its first variant's name and content under the same fields. */
const CREATE = {
	variant: EDIT.variant,
	nodes: EDIT.nodes,
	edges: EDIT.edges,
} as const satisfies Record<string, keyof BoardCreateInput>;
const NODE = {
	id: "id",
	as: "as",
	name: "name",
	parent: "parent",
} as const satisfies Record<string, keyof SemanticNodeInput>;
const EDGE = {
	from: "from",
	to: "to",
	kind: "kind",
} as const satisfies Record<string, keyof SemanticEdgeInput>;

/** A relationship that names a receiver, by the keys of the parts it runs between. */
interface Landing {
	readonly from: string;
	readonly to: string;
}

/**
 * One variant as a fixture's steps have left it so far, in the names the
 * fixture writes rather than the ids the product would mint.
 */
interface VariantState {
	/** The key each name a node has gone by folds onto: the one it was created under. */
	readonly keys: Map<string, string>;
	/** The children a part has, by its key. */
	readonly children: Map<string, Set<string>>;
	/** Every receiving relationship written so far. */
	landings: Landing[];
	/** Parts this variant removed, which an edit carried down from above does not bring back. */
	readonly removed: Set<string>;
	/** The variant it follows while it is a draft; an adopted variant follows nothing. */
	parent: string | undefined;
}

/** Every variant of one board, and which one an edit naming none addresses. */
interface Family {
	current: string;
	readonly variants: Map<string, VariantState>;
}

/** One step's statements as they reach one variant. */
interface Statement {
	readonly input: Record<string, unknown>;
	/** Carried down from the variant a draft follows rather than stated to it. */
	readonly carried: boolean;
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
	const name = (/^\$node\((.+)\)$/u.exec(trimmed)?.[1] ?? trimmed).trim();
	return name === "" ? undefined : name;
}

/**
 * What a reference resolves to on one variant within one step: a handle that
 * step gave, the key a rename folded a name onto, or itself.
 * @param state The variant so far.
 * @param handles The handles this step gave, by handle.
 * @param reference The reference.
 * @returns The key.
 */
function keyOf(state: VariantState, handles: Map<string, string>, reference: string): string {
	return handles.get(reference) ?? state.keys.get(reference) ?? reference;
}

/**
 * The key one stated node stands under, with its name and its handle folded
 * onto it so a rename never splits a part in two.
 * @param state The variant so far.
 * @param handles The handles this step gives.
 * @param node The stated node.
 * @returns The key, or undefined when the entry names no node.
 */
function fold(
	state: VariantState,
	handles: Map<string, string>,
	node: Record<string, unknown>,
): string | undefined {
	const name = referenced(node[NODE.name]);
	const stated = referenced(node[NODE.id]) ?? name;
	if (stated === undefined) return undefined;
	const key = keyOf(state, handles, stated);
	state.keys.set(key, key);
	if (name !== undefined) state.keys.set(name, key);
	const handle = referenced(node[NODE.as]);
	if (handle !== undefined) handles.set(handle, key);
	return key;
}

/**
 * One part put under the parent it states. A node is stated in full, so one
 * that names no parent has left the part it was under.
 * @param state The variant so far.
 * @param key The part's key.
 * @param parent The parent's key, if it names one.
 */
function place(state: VariantState, key: string, parent: string | undefined): void {
	for (const children of state.children.values()) children.delete(key);
	if (parent === undefined) return;
	state.children.set(parent, (state.children.get(parent) ?? new Set<string>()).add(key));
}

/**
 * The stated nodes, in the store's two passes: every node's names are folded
 * first and only then is anything placed, because a child may be stated before
 * the parent it names, even when the same step renames that parent.
 * @param state The variant.
 * @param handles The handles this step gives.
 * @param statement What reaches it.
 */
function noteNodes(state: VariantState, handles: Map<string, string>, statement: Statement): void {
	const folded = records(statement.input[EDIT.nodes]).flatMap((node) => {
		const key = fold(state, handles, node);
		return key === undefined ? [] : [{ key, parent: referenced(node[NODE.parent]) }];
	});
	for (const { key, parent } of folded) {
		if (statement.carried && state.removed.has(key)) continue;
		if (!statement.carried) state.removed.delete(key);
		place(state, key, parent === undefined ? undefined : keyOf(state, handles, parent));
	}
}

/**
 * The relationship one stated edge is, when its kind names a receiver.
 * @param state The variant.
 * @param handles The handles this step gave.
 * @param edge The stated edge.
 * @returns It, by the keys of its ends, or undefined.
 */
function receiving(
	state: VariantState,
	handles: Map<string, string>,
	edge: Record<string, unknown>,
): Landing | undefined {
	const kind = edge[EDGE.kind];
	const from = referenced(edge[EDGE.from]);
	const to = referenced(edge[EDGE.to]);
	if (typeof kind !== "string" || WHOLE_MODULE_KINDS.has(kind)) return undefined;
	if (from === undefined || to === undefined) return undefined;
	return { from: keyOf(state, handles, from), to: keyOf(state, handles, to) };
}

/**
 * The stated relationships that name a receiver. A relationship carried down to
 * a draft that removed one of its ends does not arrive there.
 * @param state The variant.
 * @param handles The handles this step gave.
 * @param statement What reaches it.
 */
function noteEdges(state: VariantState, handles: Map<string, string>, statement: Statement): void {
	for (const edge of records(statement.input[EDIT.edges])) {
		const landing = receiving(state, handles, edge);
		if (landing === undefined) continue;
		const gone = state.removed.has(landing.from) || state.removed.has(landing.to);
		if (!(statement.carried && gone)) state.landings.push(landing);
	}
}

/**
 * The stated removals: each part taken off with its containment and the
 * relationships that ended on it, and remembered as removed on this variant.
 * @param state The variant.
 * @param handles The handles this step gave.
 * @param statement What reaches it.
 */
function noteRemovals(
	state: VariantState,
	handles: Map<string, string>,
	statement: Statement,
): void {
	const removals: unknown[] = Array.isArray(statement.input[EDIT.removeNodes])
		? statement.input[EDIT.removeNodes]
		: [];
	for (const removal of removals) {
		const reference = referenced(removal);
		if (reference === undefined) continue;
		const key = keyOf(state, handles, reference);
		state.children.delete(key);
		for (const children of state.children.values()) children.delete(key);
		state.landings = state.landings.filter((one) => one.from !== key && one.to !== key);
		state.removed.add(key);
	}
}

/**
 * One step's statements applied to one variant.
 * @param state The variant.
 * @param statement What reaches it.
 */
function apply(state: VariantState, statement: Statement): void {
	const handles = new Map<string, string>();
	noteNodes(state, handles, statement);
	noteEdges(state, handles, statement);
	noteRemovals(state, handles, statement);
}

/**
 * A variant that starts as a copy of another, following it.
 * @param source The variant it is derived from.
 * @param parent That variant's name.
 * @returns The copy.
 */
function derived(source: VariantState, parent: string): VariantState {
	return {
		keys: new Map(source.keys),
		children: new Map([...source.children].map(([key, kids]) => [key, new Set(kids)])),
		landings: [...source.landings],
		removed: new Set(),
		parent,
	};
}

/**
 * The variant a step addresses: the one it names, or the current one.
 * @param family The board's variants.
 * @param named What the step names, if anything.
 * @returns The variant's name.
 */
function addressed(family: Family, named: unknown): string {
	return typeof named === "string" && named !== "current" && family.variants.has(named)
		? named
		: family.current;
}

/**
 * Every draft that follows a variant, parent before child.
 * @param family The board's variants.
 * @param name The variant an edit changed.
 * @returns The drafts it is carried into.
 */
function followers(family: Family, name: string): VariantState[] {
	const direct = [...family.variants].filter(([, state]) => state.parent === name);
	return direct.flatMap(([child, state]) => [state, ...followers(family, child)]);
}

/**
 * One step applied to the family it writes. An edit reaches the variant it
 * names and is carried down every draft that follows it. The store merges that
 * against what each draft last agreed with; this approximates it: a draft keeps
 * what it removed, and takes everything else.
 * @param families Every board so far, by name.
 * @param step The step.
 */
function applyStep(families: Map<string, Family>, step: RawFixtureStep): void {
	const family = families.get(step.board);
	if (step.op === "new") {
		const current = referenced(step.input[CREATE.variant]) ?? FIRST_VARIANT_NAME;
		const initial: VariantState = {
			keys: new Map(),
			children: new Map(),
			landings: [],
			removed: new Set(),
			parent: undefined,
		};
		families.set(step.board, { current, variants: new Map([[current, initial]]) });
		apply(initial, { input: step.input, carried: false });
		return;
	}
	if (family === undefined) return;
	applyToFamily(family, step);
}

/**
 * A new variant, a copy of the one it branches from and following it.
 * @param family The board's variants.
 * @param step The branch.
 */
function branch(family: Family, step: Extract<RawFixtureStep, { op: "branch" }>): void {
	const source = addressed(family, step.from);
	const state = family.variants.get(source);
	if (state !== undefined) family.variants.set(step.as, derived(state, source));
}

/**
 * An adopted variant becomes current and stops following what it came from.
 * @param family The board's variants.
 * @param step The adoption.
 */
function adopt(family: Family, step: Extract<RawFixtureStep, { op: "adopt" }>): void {
	const adopted = addressed(family, step.variant);
	const state = family.variants.get(adopted);
	if (state !== undefined) state.parent = undefined;
	family.current = adopted;
}

/**
 * An edit, applied to the variant it names and carried into its drafts.
 * @param family The board's variants.
 * @param step The edit.
 */
function editFamily(family: Family, step: Extract<RawFixtureStep, { op: "edit" }>): void {
	const target = addressed(family, step.input[EDIT.variant]);
	const state = family.variants.get(target);
	if (state !== undefined) apply(state, { input: step.input, carried: false });
	for (const draft of followers(family, target)) apply(draft, { input: step.input, carried: true });
}

/**
 * A step that is not a creation applied to its board's variants. Settling a
 * disagreement is not followed: what a choice keeps is beyond a walk over names.
 * @param family The board's variants.
 * @param step The step.
 */
function applyToFamily(family: Family, step: Exclude<RawFixtureStep, { op: "new" }>): void {
	if (step.op === "branch") branch(family, step);
	else if (step.op === "adopt") adopt(family, step);
	else if (step.op === "edit") editFamily(family, step);
}

/**
 * What the family says now: every receiving relationship whose target has
 * children on the variant holding it, each named once for the whole board.
 * @param where The scenario, step and board, as a line says them.
 * @param family The board's variants.
 * @param reported The relationships already named.
 * @returns Problems, one line each.
 */
function landed(where: string, family: Family, reported: Set<string>): string[] {
	return [...family.variants].flatMap(([variant, state]) =>
		state.landings.flatMap((landing) => {
			const children = state.children.get(landing.to);
			const relationship = `${landing.from} -> ${landing.to}`;
			if (children === undefined || children.size === 0 || reported.has(relationship)) return [];
			reported.add(relationship);
			const named = [...children].toSorted().join(", ");
			return [
				`${where}@${variant}: ${relationship} lands on ${landing.to}, which ${named} names as its parent`,
			];
		}),
	);
}

/**
 * Where one fixture teaches the shape the rubric marks a run down for: a
 * relationship naming a receiver that ends on a part another part names as its
 * parent.
 *
 * The rule reads what the steps have accumulated rather than one step alone,
 * because a later `edit` can add a child under a part an earlier step already
 * drew a relationship onto. It reports a landing when it first appears, even
 * if a later step moves the child away again; an author only sees the final
 * vault, but a fixture that ever lands has taught the shape to whoever reads it.
 * @param id The scenario the fixture belongs to.
 * @param fixture The fixture.
 * @returns Problems, one line each, one per relationship and board.
 */
function fixtureLandings(id: string, fixture: Fixture): string[] {
	const families = new Map<string, Family>();
	const reported = new Map<string, Set<string>>();
	return fixture.steps.flatMap((step, index) => {
		applyStep(families, step);
		const family = families.get(step.board);
		const seen = reported.get(step.board) ?? new Set<string>();
		reported.set(step.board, seen);
		return family === undefined ? [] : landed(`${id} step ${index} ${step.board}`, family, seen);
	});
}

/**
 * Every fixture relationship that lands on a part with children.
 * @param fixtures The fixtures, by the scenario each belongs to.
 * @returns Problems, one line each.
 */
function landingProblems(fixtures: ReadonlyMap<string, Fixture>): string[] {
	return [...fixtures].flatMap(([id, fixture]) => fixtureLandings(id, fixture));
}

export { landingProblems };
