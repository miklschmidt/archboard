// Asking a board what a proposal changed: what it added, what it took away,
// what it left standing with something moved, and what it left alone.
//
// Nothing here is authored and nothing here is stored. A proposal states an
// architecture; that it added a queue and pointed two calls at it is read
// against the variant it came from, every time, out of the identities the two
// share (ADR 0023). `compareVariants` is the one implementation of that reading
// and already runs in the canvas and in the renderer's overlay; this command is
// the same reading in an answer, so an agent that cannot see a picture can
// still say where the proposal leaves each relationship.
//
// It needs no browser and no second route: the canvas holds the aggregate, the
// comparison is pure, and it is done here — the way `semantic inspect` runs the
// pure group inspection here.

import { z } from "zod";
import {
	compareVariants,
	findVariant,
	RenderedVariantSchema,
	SubjectStandingSchema,
	type FieldChange,
	type PlacedBeat,
	type PlacedStep,
	type SemanticBoard,
	type SemanticEdge,
	type SemanticFlow,
	type SemanticNode,
	type SemanticVariant,
	type SemanticWalkthrough,
	type SubjectChange,
	type VariantComparison,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { VaultDiagnosticSchema, type VaultDiagnostic } from "@/shared/semantic-policy/index";
import { readSemanticBoardAnswerOnCanvas } from "@/runtime/semantic-board-client/index";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { serverRefusal } from "@/cli/command-contract/common";
import { askedVariant, SelectorSchema, UNNAMED_VARIANT } from "@/cli/commands/lib/semantic-input";

/** One field that moved, and what it moved between. */
const MovedFieldSchema = z.object({
	field: z.string(),
	/** What the predecessor said; absent when it said nothing. */
	before: z.unknown(),
	/** What this variant says; absent when it says nothing. */
	after: z.unknown(),
});

/**
 * What every compared subject carries: its identity, how it stands against the
 * predecessor, and the fields that moved — empty for anything but a change.
 *
 * `standing` rather than `kind`, because a node and a relationship each already
 * have a `kind` of their own and an answer with two of them would be a riddle.
 */
const comparedSubject = {
	id: z.string(),
	standing: SubjectStandingSchema,
	fields: z.array(MovedFieldSchema),
};

const ComparedNodeSchema = z.object({
	...comparedSubject,
	name: z.string(),
	kind: z.string(),
	parent: z.string().nullable(),
	groups: z.array(z.string()),
});

/**
 * One relationship, with the endpoints it now has.
 *
 * The ends are named as well as identified, because "where it now lands" is the
 * thing a proposal is reported in and an id is not something anybody recognises.
 * A name is read off this variant first and the predecessor second, so a
 * relationship the proposal removed still says which parts it used to join.
 */
const ComparedEdgeSchema = z.object({
	...comparedSubject,
	from: z.string(),
	to: z.string(),
	fromName: z.string().nullable(),
	toName: z.string().nullable(),
	kind: z.string(),
	label: z.string().nullable(),
});

const ComparedFlowSchema = z.object({
	...comparedSubject,
	name: z.string(),
	summary: z.string().nullable(),
});

/** One step, with the flow it is told in and how far into it it comes. */
const ComparedStepSchema = z.object({
	...comparedSubject,
	flow: z.string(),
	position: z.int(),
	from: z.string(),
	to: z.string(),
	fromName: z.string().nullable(),
	toName: z.string().nullable(),
	kind: z.string(),
	label: z.string(),
});

const ComparedWalkthroughSchema = z.object({
	...comparedSubject,
	name: z.string(),
	summary: z.string().nullable(),
});

/** One beat, with the explanation it is told in and where it comes in it. */
const ComparedBeatSchema = z.object({
	...comparedSubject,
	walkthrough: z.string(),
	position: z.int(),
	heading: z.string(),
	subjects: z.array(z.string()),
});

/**
 * What one variant changed about the one it came from, as the answer carries it.
 *
 * Every subject either of them has is here, unchanged ones included: a reader
 * asking what a proposal did needs to be able to say what it left alone, and an
 * answer that only listed the movement would make "nothing else moved" a claim
 * nobody could check.
 */
const VariantComparisonResultSchema = z.object({
	success: z.literal(true),
	board: z.string(),
	version: z.int(),
	/** The variant compared. */
	variant: RenderedVariantSchema,
	/** The variant it came from, which it is compared against. */
	against: RenderedVariantSchema,
	nodes: z.array(ComparedNodeSchema),
	edges: z.array(ComparedEdgeSchema),
	flows: z.array(ComparedFlowSchema),
	steps: z.array(ComparedStepSchema),
	walkthroughs: z.array(ComparedWalkthroughSchema),
	beats: z.array(ComparedBeatSchema),
	warnings: z.array(VaultDiagnosticSchema),
});
type VariantComparisonResult = z.infer<typeof VariantComparisonResultSchema>;
type ComparedEdge = z.infer<typeof ComparedEdgeSchema>;

const noPredecessorRefusal = {
	code: "NO_PREDECESSOR",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The variant is a root architecture: it came from nothing, so there is no comparison to read.",
};

/**
 * One field that moved, as the answer carries it.
 * @param change The field change.
 * @returns The same three facts.
 */
function movedField(change: FieldChange): z.infer<typeof MovedFieldSchema> {
	return { field: change.field, before: change.before, after: change.after };
}

/**
 * Every subject of one kind, in a stable order: the answer is read by a machine
 * and diffed by a person, and a comparison that reordered itself between two
 * runs would look like a change.
 * @param changes The comparison for one kind of subject.
 * @param entry How to carry one of them.
 * @returns The entries, by subject id.
 */
function compared<Entity, Carried>(
	changes: ReadonlyMap<string, SubjectChange<Entity>>,
	entry: (change: SubjectChange<Entity>) => Carried,
): Carried[] {
	return [...changes.entries()]
		.toSorted(([one], [other]) => one.localeCompare(other))
		.map(([, change]) => entry(change));
}

/**
 * What each part is called, over both states, so an endpoint the proposal
 * removed still has a name.
 * @param variant This variant's content.
 * @param against The predecessor's content.
 * @returns The names, by node id, this variant's winning.
 */
function namesOf(variant: VariantContent, against: VariantContent): Map<string, string> {
	return new Map([...against.nodes, ...variant.nodes].map((node) => [node.id, node.name]));
}

/**
 * One part, as the answer carries it.
 * @param change How it stands.
 * @returns The entry.
 */
function comparedNode(change: SubjectChange<SemanticNode>): z.infer<typeof ComparedNodeSchema> {
	const node = change.entity;
	return {
		id: node.id,
		standing: change.kind,
		fields: change.fields.map(movedField),
		name: node.name,
		kind: node.kind,
		parent: node.parent ?? null,
		groups: node.groups ?? [],
	};
}

/**
 * One relationship, as the answer carries it.
 * @param change How it stands.
 * @param names What each part is called.
 * @returns The entry.
 */
function comparedEdge(change: SubjectChange<SemanticEdge>, names: ReadonlyMap<string, string>) {
	const edge = change.entity;
	return {
		id: edge.id,
		standing: change.kind,
		fields: change.fields.map(movedField),
		from: edge.from,
		to: edge.to,
		fromName: names.get(edge.from) ?? null,
		toName: names.get(edge.to) ?? null,
		kind: edge.kind,
		label: edge.label ?? null,
	};
}

/**
 * One flow, as the answer carries it. Its steps are compared separately and by
 * their own identities, so a reworded step is reported where it happened.
 * @param change How it stands.
 * @returns The entry.
 */
function comparedFlow(change: SubjectChange<SemanticFlow>): z.infer<typeof ComparedFlowSchema> {
	const flow = change.entity;
	return {
		id: flow.id,
		standing: change.kind,
		fields: change.fields.map(movedField),
		name: flow.name,
		summary: flow.summary ?? null,
	};
}

/**
 * One step, as the answer carries it.
 * @param change How it stands.
 * @param names What each part is called.
 * @returns The entry.
 */
function comparedStep(
	change: SubjectChange<PlacedStep>,
	names: ReadonlyMap<string, string>,
): z.infer<typeof ComparedStepSchema> {
	const step = change.entity;
	return {
		id: step.id,
		standing: change.kind,
		fields: change.fields.map(movedField),
		flow: step.flow,
		position: step.position,
		from: step.from,
		to: step.to,
		fromName: names.get(step.from) ?? null,
		toName: names.get(step.to) ?? null,
		kind: step.kind,
		label: step.label,
	};
}

/**
 * One walkthrough, as the answer carries it.
 * @param change How it stands.
 * @returns The entry.
 */
function comparedWalkthrough(
	change: SubjectChange<SemanticWalkthrough>,
): z.infer<typeof ComparedWalkthroughSchema> {
	const walkthrough = change.entity;
	return {
		id: walkthrough.id,
		standing: change.kind,
		fields: change.fields.map(movedField),
		name: walkthrough.name,
		summary: walkthrough.summary ?? null,
	};
}

/**
 * One beat, as the answer carries it. Its prose is not echoed: what a beat says
 * is on the board, and what moved about it is in its fields.
 * @param change How it stands.
 * @returns The entry.
 */
function comparedBeat(change: SubjectChange<PlacedBeat>): z.infer<typeof ComparedBeatSchema> {
	const beat = change.entity;
	return {
		id: beat.id,
		standing: change.kind,
		fields: change.fields.map(movedField),
		walkthrough: beat.walkthrough,
		position: beat.position,
		heading: beat.heading,
		subjects: beat.subjects,
	};
}

/**
 * The whole comparison, as the answer carries it.
 *
 * Pure: two states of one board in, one answer out. Nothing is read or written
 * here, which is what lets the same reading be checked without a canvas.
 * @param board What the board is called and where it stands.
 * @param board.name Its name.
 * @param board.version The version this was read at.
 * @param variant The variant compared.
 * @param against The variant it came from.
 * @param warnings What reading the vault warned about.
 * @returns The comparison.
 */
function comparisonAnswer(
	board: { readonly name: string; readonly version: number },
	variant: SemanticVariant,
	against: SemanticVariant,
	warnings: readonly VaultDiagnostic[],
): VariantComparisonResult {
	const comparison: VariantComparison = compareVariants(against.content, variant.content);
	const names = namesOf(variant.content, against.content);
	return {
		success: true,
		board: board.name,
		version: board.version,
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		against: { id: against.id, name: against.name, lifecycle: against.lifecycle },
		nodes: compared(comparison.nodes, comparedNode),
		edges: compared(comparison.edges, (change) => comparedEdge(change, names)),
		flows: compared(comparison.flows, comparedFlow),
		steps: compared(comparison.steps, (change) => comparedStep(change, names)),
		walkthroughs: compared(comparison.walkthroughs, comparedWalkthrough),
		beats: compared(comparison.beats, comparedBeat),
		warnings: [...warnings],
	};
}

/** The four standings, in the order a report reads them. */
const STANDINGS = ["added", "removed", "changed", "unchanged"] as const;

/**
 * How many of one kind stand each way, in words, leaving out the ways none of
 * them stands.
 * @param entries The compared subjects of one kind.
 * @returns The phrase, or undefined when there are none of that kind at all.
 */
function counted(entries: readonly { readonly standing: string }[]): string | undefined {
	if (entries.length === 0) {
		return undefined;
	}
	return STANDINGS.map((standing) => ({
		standing,
		many: entries.filter((entry) => entry.standing === standing).length,
	}))
		.filter((count) => count.many > 0)
		.map((count) => `${count.many} ${count.standing}`)
		.join(", ");
}

/**
 * Where one relationship now lands, for a person reading the terminal.
 *
 * The line a proposal is reported in: the two parts it joins, what it carries,
 * and — when an end moved — which part it used to land on. That last half is
 * the whole reason this command exists, so it is said rather than left to be
 * worked out from the field list.
 * @param edge The relationship as it stands.
 * @param names What each part is called.
 * @returns The line.
 */
function relationshipLine(edge: ComparedEdge, names: ReadonlyMap<string, string>): string {
	const carries = edge.label === null ? "" : ` "${edge.label}"`;
	const ends = edge.fields.filter((moved) => moved.field === "from" || moved.field === "to");
	const was =
		ends.length === 0
			? ""
			: `, was ${ends
					.map(
						(moved) => `${moved.field} ${names.get(String(moved.before)) ?? String(moved.before)}`,
					)
					.join(" and ")}`;
	return (
		`  ${edge.standing}: ${edge.fromName ?? edge.from} → ${edge.toName ?? edge.to}` +
		`${carries} (${edge.kind}${was})`
	);
}

/**
 * What to say about the comparison on standard error, for a person.
 *
 * Every relationship that moved gets its own line. A report that gave only
 * counts would be one an author could write without reading the relationships,
 * which is the failure this command was added for.
 * @param result The comparison.
 * @returns The lines.
 */
function described(result: VariantComparisonResult): string[] {
	const kinds: [string, readonly { readonly standing: string }[]][] = [
		["parts", result.nodes],
		["relationships", result.edges],
		["sequences", result.flows],
		["steps", result.steps],
		["walkthroughs", result.walkthroughs],
		["beats", result.beats],
	];
	const counts = kinds
		.map(([kind, entries]) => ({ kind, phrase: counted(entries) }))
		.filter((count) => count.phrase !== undefined)
		.map((count) => `${count.kind} ${count.phrase}`)
		.join("; ");
	const names = new Map(result.nodes.map((node) => [node.id, node.name]));
	return [
		`"${result.variant.name}" against "${result.against.name}" on "${result.board}" ` +
			`at version ${result.version}: ${counts || "nothing on either"}.`,
		...result.edges
			.filter((edge) => edge.standing !== "unchanged")
			.map((edge) => relationshipLine(edge, names)),
	];
}

/**
 * The variant this one came from.
 *
 * A root architecture came from nothing, and there is no honest comparison to
 * answer with: what it "added" would be every part it has. So it is refused,
 * naming the variants of this board that do have a predecessor, since one of
 * them is what the reader meant.
 * @param board The board as read.
 * @param variant The variant asked about.
 * @returns Its predecessor.
 * @throws {CliUsageError} When it has none.
 */
function predecessorOf(board: SemanticBoard, variant: SemanticVariant): SemanticVariant {
	const parent = variant.parent === undefined ? undefined : findVariant(board, variant.parent);
	if (parent !== undefined) {
		return parent;
	}
	const derived = board.variants
		.filter((one) => one.parent !== undefined)
		.map((one) => `"${one.name}"`)
		.join(", ");
	throw new CliUsageError(
		`"${variant.name}" is a root architecture of "${board.name}": it came from nothing, so there ` +
			"is no comparison to read. Compare a proposal derived from it with `semantic branch` " +
			`instead. Derived variants on this board: ${derived || "none yet"}.`,
	);
}

const CompareInputSchema = z.object({ name: z.string(), variant: SelectorSchema.optional() });

const semanticCompareContract = defineCommand({
	path: ["semantic", "compare"],
	shared: ["url"],
	summary: "Read what one variant changed about the one it came from",
	description:
		"Reports one variant against its direct predecessor: every part, relationship, sequence, " +
		"step, walkthrough and beat either of them has, how it stands — added, removed, changed or " +
		"unchanged — and, for anything changed, which fields moved and what they moved between. " +
		"Relationships and steps carry the endpoints they now have, named as well as identified, so " +
		"a connection whose end moved onto a replacing part reads as one relationship that moved " +
		"rather than as a deletion beside an addition. Read over the whole variant before any view " +
		"narrows it. A root architecture came from nothing and is refused.",
	examples: [
		'archboard semantic compare payments --variant "Queued ingest"',
		"archboard semantic compare payments",
	],
	parameters: [
		{
			kind: "positional",
			key: "name",
			name: "name",
			required: true,
			description: "The board's name",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "variant",
			description: `Which variant to compare, by id or name; ${UNNAMED_VARIANT}`,
		},
	],
	input: { ingress: CompareInputSchema },
	result: VariantComparisonResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "What the variant changed about its predecessor",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the comparison.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal, noPredecessorRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/board",
			cardinality: "one",
			description: "The board both variants are read off",
		},
	],
	/**
	 * Compare the variant with its predecessor.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The comparison.
	 */
	async handler(input, context) {
		await context.require("server", "semantic compare");
		const answer = await readSemanticBoardAnswerOnCanvas(input.name);
		const variant = askedVariant(answer.board, input.variant);
		const against = predecessorOf(answer.board, variant);
		const result = comparisonAnswer(answer.board, variant, against, answer.warnings);
		return {
			result,
			diagnostics: [
				...answer.warnings.map((warning) => `Warning: ${warning.file}: ${warning.message}`),
				...described(result),
			],
		};
	},
});

export {
	semanticCompareContract,
	VariantComparisonResultSchema,
	type VariantComparisonResult,
	comparisonAnswer,
};
