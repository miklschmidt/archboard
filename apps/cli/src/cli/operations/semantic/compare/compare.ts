// Asking a board how a variant differs: what it adds, what it lacks, what it
// holds with something moved, and what it leaves alone.
//
// Nothing here is authored and nothing here is stored. A proposal states an
// architecture; that it added a queue and pointed two calls at it is read
// against another variant, every time, out of the identities the two share
// (ADR 0023): by default the one its picture is drawn against, so the answer
// and the picture agree; `--against` names another, which is how a superseded
// proposal is read against its parent (ADR 0037). `compareVariants` is the one
// implementation of that reading; this command is the same reading in an
// answer, so an agent that cannot see a picture can still say where the
// proposal leaves each relationship.
//
// What changed about each container's interface (ADR 0044) is read first, and
// has a place of its own in the answer: one interface change costs every
// caller, one implementation change costs one module. It sets no standing, so
// a part a new caller reaches is not badged. Beside it, the interface measures
// of each container on each variant read, `--beside` adding competing
// proposals: counts side by side, never a change mark, a score or a rank.
//
// It needs no browser and no second route: the server holds the aggregate, the
// comparison is pure, and it is done here — the way `semantic inspect` runs the
// pure group inspection here.

import { z } from "zod";
import {
	compareVariants,
	type PlacedBeat,
	type SubjectChange,
} from "@archboard/board/comparison";
import { RenderedVariantSchema } from "@archboard/board/render-reply";
import type {
	SemanticEdge,
	SemanticNode,
	VariantContent,
} from "@archboard/board/content";
import type { SemanticFlow } from "@archboard/board/flow";
import type { SemanticVariant } from "@archboard/board/document";
import {
	diagnosticLine,
	VaultDiagnosticSchema,
} from "@archboard/board/policy";
import { readSemanticBoardAnswerOnServer } from "@archboard/server-lifecycle/semantic-board-client";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import {
	comparedInterfaces,
	describedInterfaces,
	InterfaceChangesSchema,
} from "#cli/rules/semantic/compare/compared-interfaces.ts";
import {
	besideVariants,
	describedMeasures,
	InterfaceMeasuresSectionSchema,
	measuredInterfaces,
} from "#cli/rules/semantic/compare/measured-interfaces.ts";
import { nothingToCompareRefusal, readAgainst } from "#cli/rules/semantic/compare/read-against.ts";
import {
	askedVariant,
	SelectorSchema,
	UNNAMED_VARIANT,
} from "#cli/operations/semantic/input/semantic-input.ts";
import {
	ComparedStepSchema,
	comparedStep,
	comparedSubject,
	movedField,
} from "#cli/rules/semantic/compare/compared-subject.ts";

type SemanticWalkthrough = VariantContent["walkthroughs"][number];

type VariantComparison = ReturnType<typeof compareVariants>;
type VaultDiagnostic = z.infer<typeof VaultDiagnosticSchema>;

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
 * A name is read off this variant first and the other side second, so a
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
 * How one variant differs from the one it is read against, as the answer carries it.
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
	/** The variant it is read against. */
	against: RenderedVariantSchema,
	/** The interface changes of each container. They come before every other change. */
	interfaceChanges: InterfaceChangesSchema,
	/** Each container's interface measures on this variant, the one it is read against, and each `--beside`. */
	interfaceMeasures: InterfaceMeasuresSectionSchema,
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
 * @param against The content of the variant it is read against.
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
 * here, which is what lets the same reading be checked without a server.
 * @param board What the board is called and where it stands.
 * @param board.name Its name.
 * @param board.version The version this was read at.
 * @param variant The variant compared.
 * @param against The variant it is read against.
 * @param warnings What reading the vault warned about.
 * @param beside The variants whose interface measures go beside these two.
 * @returns The comparison.
 */
function comparisonAnswer(
	board: { readonly name: string; readonly version: number },
	variant: SemanticVariant,
	against: SemanticVariant,
	warnings: readonly VaultDiagnostic[],
	beside: readonly SemanticVariant[] = [],
): VariantComparisonResult {
	const comparison: VariantComparison = compareVariants(against.content, variant.content);
	const names = namesOf(variant.content, against.content);
	return {
		success: true,
		board: board.name,
		version: board.version,
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		against: { id: against.id, name: against.name, lifecycle: against.lifecycle },
		interfaceChanges: comparedInterfaces(against.content, variant.content),
		interfaceMeasures: measuredInterfaces([variant, against, ...beside]),
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
 * and — when an end moved — which part it lands on in the variant it is read
 * against. That last half is the whole reason this command exists, so it is
 * said rather than left to be worked out from the field list.
 * @param edge The relationship as it stands.
 * @param names What each part is called.
 * @param against What the variant it is read against is called.
 * @returns The line.
 */
function relationshipLine(
	edge: ComparedEdge,
	names: ReadonlyMap<string, string>,
	against: string,
): string {
	const carries = edge.label === null ? "" : ` "${edge.label}"`;
	const ends = edge.fields.filter((moved) => moved.field === "from" || moved.field === "to");
	// Said as what the other side has rather than as what it "was": on history read against now,
	// the other side is the later one.
	const was =
		ends.length === 0
			? ""
			: `, ${ends
					.map(
						(moved) => `${moved.field} ${names.get(String(moved.before)) ?? String(moved.before)}`,
					)
					.join(" and ")} on "${against}"`;
	return (
		`  ${edge.standing}: ${edge.fromName ?? edge.from} → ${edge.toName ?? edge.to}` +
		`${carries} (${edge.kind}${was})`
	);
}

/**
 * What to say about the comparison on standard error, for a person.
 *
 * Interface changes come first, because one costs every caller and an
 * implementation change costs one module. Every relationship that moved gets
 * its own line. A report that gave only counts would be one an author could
 * write without reading the relationships, which is the failure this command
 * was added for.
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
			`at version ${result.version}.`,
		...describedInterfaces(result.interfaceChanges, {
			variant: result.variant.name,
			against: result.against.name,
		}),
		...describedMeasures(result.interfaceMeasures),
		`Other changes: ${counts || "nothing on either"}.`,
		...result.edges
			.filter((edge) => edge.standing !== "unchanged")
			.map((edge) => relationshipLine(edge, names, result.against.name)),
	];
}

const CompareInputSchema = z.object({
	name: z.string(),
	variant: SelectorSchema.optional(),
	against: SelectorSchema.optional(),
	beside: z.array(SelectorSchema).optional(),
});

const semanticCompareContract = defineCommand({
	path: ["semantic", "compare"],
	shared: ["url", "directory"],
	summary: "Read how one variant differs from the current one",
	description:
		"Reports one variant against the variant its picture is drawn against — the board's current " +
		"variant, or on a board with none the one it came from — or against the variant --against " +
		"names: every part, relationship, sequence, " +
		"step, walkthrough and beat either of them has, how it stands — added, removed, changed or " +
		"unchanged — and, for anything changed, which fields moved and what they moved between. " +
		"Relationships and steps carry the endpoints they now have, named as well as identified, so " +
		"a connection whose end moved onto a replacing part reads as one relationship that moved " +
		"rather than as a deletion beside an addition. Before them, for each container, the interface " +
		"changes: the entry points added and removed, the parts that moved between the interface and " +
		"the hidden parts, and the callers gained and lost; they set no standing on any part. Beside " +
		"them, each container's interface measures on the variant, the one it is read against and " +
		"each variant --beside names, side by side and unranked. Read over " +
		"the whole variant before any view narrows it. With no --against, the current variant and a first draft on a board with no " +
		"current one have nothing to be read against and are refused.",
	examples: [
		'archboard semantic compare payments --variant "Queued ingest"',
		'archboard semantic compare payments --variant "Queued ingest" --against "As built in May"',
		'archboard semantic compare payments --variant "Queued ingest" --beside "Batched ingest"',
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
		{
			kind: "option",
			key: "against",
			spellings: ["--against"],
			value: "required",
			placeholder: "variant",
			description:
				"What to read it against, by id or name; when absent, the current variant, or on a " +
				"board with none the variant it came from",
		},
		{
			kind: "option",
			key: "beside",
			spellings: ["--beside"],
			value: "required",
			occurrences: "append",
			placeholder: "variant",
			description:
				"Another variant whose interface measures to put beside these two, by id or name",
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
				description: "How the variant differs from the one it is read against",
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
	refusals: [serverRefusal, nothingToCompareRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/semantic-boards/board",
			cardinality: "one",
			description: "The board both variants are read off",
		},
	],
	/**
	 * Compare the variant with the one it is read against.
	 * @param input What the command was given.
	 * @param context The command context.
	 * @returns The comparison.
	 */
	async handler(input, context) {
		await context.require("server", "semantic compare");
		const answer = await readSemanticBoardAnswerOnServer(input.name);
		const variant = askedVariant(answer.board, input.variant);
		const against = readAgainst(answer.board, variant, input.against);
		const beside = besideVariants(answer.board, input.beside ?? [], [variant, against]);
		const result = comparisonAnswer(answer.board, variant, against, answer.warnings, beside);
		return {
			result,
			diagnostics: [...answer.warnings.map(diagnosticLine), ...described(result)],
		};
	},
});

export {
	besideVariants,
	semanticCompareContract,
	VariantComparisonResultSchema,
	type VariantComparisonResult,
	comparisonAnswer,
	described,
	readAgainst,
};
