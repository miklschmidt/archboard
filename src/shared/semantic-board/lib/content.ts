// What one architecture actually says: nodes, what they are responsible for,
// what contains what, and how they reach each other.
//
// Two rules shape every field here.
//
// The first is ADR 0023's line between meaning and presentation. There is no
// coordinate, size, colour, font or route in this file, and there is no field
// an author could use to stand in for one. A diagram that comes out badly is
// the renderer's fault, and it is fixed once, in the renderer, for every board.
//
// The second is that identity outlives spelling. A node keeps its id when it
// is renamed, when it moves to a different parent, and when it is carried into
// a proposal — which is what lets two variants be compared by what changed
// rather than by what happens to sit in the same array slot. Ids are minted by
// `src/shared/ids/ids.ts` and are never rewritten.

import { z } from "zod";

const MAX_EDGE_LABEL = 60;

/** What one relationship carries, stated once for both spellings of an edge. */
const EdgeLabelSchema = z.string().trim().min(1).max(MAX_EDGE_LABEL);
import { CodeBindingSchema } from "@/shared/code-target/index";
import {
	DescriptionSchema,
	DisplayNameSchema,
	ResponsibilitySchema,
	SemanticIdSchema,
} from "@/shared/semantic-board/lib/primitives";
import { SemanticFlowSchema, SemanticViewSchema } from "@/shared/semantic-board/lib/views";
import { SemanticWalkthroughSchema } from "@/shared/semantic-board/lib/walkthrough";
import {
	EdgeEmphasisSchema,
	EdgeKindSchema,
	NodeKindSchema,
} from "@/shared/semantic-board/lib/vocabulary";

/**
 * Which variant of the board one level down a drill-down opens.
 *
 * `current` is a written request for that board's movable designation, and it
 * is never what a missing named variant falls back to. Two boards are two
 * independent histories, so a link that silently landed on whatever is current
 * when the variant it named is gone would quietly show somebody a different
 * architecture from the one the link was about (ADR 0023).
 */
const DrillDownVariantSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("named"), name: DisplayNameSchema }).strict(),
	z.object({ kind: z.literal("current") }).strict(),
]);
type DrillDownVariant = z.infer<typeof DrillDownVariantSchema>;

/**
 * The board one level down from a node, and which of its variants to open.
 *
 * The target is named rather than identified, because a board is addressed by
 * name everywhere a person meets one, and because nothing validates it here: a
 * board owns its own content, so whether the target exists is a question only
 * the thing opening it can answer, and it answers by saying so.
 */
const DrillDownSchema = z
	.object({ board: DisplayNameSchema, variant: DrillDownVariantSchema })
	.strict();
type DrillDown = z.infer<typeof DrillDownSchema>;

/**
 * One architectural unit.
 *
 * `parent` is structural containment — a module inside a service — and not a
 * drawing group: it says the child is part of the parent, which is true
 * whatever the picture ends up looking like. It names at most one parent, and
 * the graph it forms is checked acyclic when the board is validated.
 *
 * `binding` is the one optional primary code location. A planned node has
 * none, and two nodes on the same board may name different repositories.
 */
const SemanticNodeSchema = z
	.object({
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		kind: NodeKindSchema,
		responsibility: ResponsibilitySchema.optional(),
		description: DescriptionSchema.optional(),
		parent: SemanticIdSchema.optional(),
		binding: CodeBindingSchema.optional(),
		drillDown: DrillDownSchema.optional(),
	})
	.strict();
type SemanticNode = z.infer<typeof SemanticNodeSchema>;

/**
 * One directed relationship. `label` is what the connection carries, not where
 * the line goes; `emphasis` is how much attention it is asking for, and what
 * that looks like is the renderer's to decide.
 */
const SemanticEdgeSchema = z
	.object({
		id: SemanticIdSchema,
		from: SemanticIdSchema,
		to: SemanticIdSchema,
		kind: EdgeKindSchema,
		label: EdgeLabelSchema.optional(),
		description: DescriptionSchema.optional(),
		emphasis: EdgeEmphasisSchema.default("normal"),
	})
	.strict();
type SemanticEdge = z.infer<typeof SemanticEdgeSchema>;

/**
 * Everything one architectural state says. An empty content is valid: a board
 * starts empty and is built up, and refusing to hold nothing would mean the
 * first write had to invent something to say.
 */
const VariantContentSchema = z
	.object({
		nodes: z.array(SemanticNodeSchema).default([]),
		edges: z.array(SemanticEdgeSchema).default([]),
		flows: z.array(SemanticFlowSchema).default([]),
		views: z.array(SemanticViewSchema).default([]),
		walkthroughs: z.array(SemanticWalkthroughSchema).default([]),
	})
	.strict();
type VariantContent = z.infer<typeof VariantContentSchema>;

/**
 * Content with nothing in it.
 * @returns A fresh empty content value.
 */
function emptyContent(): VariantContent {
	return { nodes: [], edges: [], flows: [], views: [], walkthroughs: [] };
}

/**
 * What kind of thing holds one identity. Everything a variant holds is one of
 * these, and every one of them is a subject a reader can select, an atlas can
 * draw a box for, and a comparison can label.
 */
type SubjectKind = "node" | "edge" | "flow" | "step" | "view" | "walkthrough" | "beat";

/**
 * The kinds of subject a narrative beat can be about.
 *
 * The architecture and the exchanges over it, and not the ways of reading it: a
 * beat names the view it is told through in its own field, because that is a
 * different sentence from what the beat is about, and a beat about another beat
 * is not a thing. Stated here rather than in the walkthrough's own module
 * because this is where a variant's kinds are decided, and a list of them
 * kept somewhere else is a list that will be missing one.
 */
const BEAT_SUBJECT_KINDS: ReadonlySet<SubjectKind> = new Set<SubjectKind>([
	"node",
	"edge",
	"flow",
	"step",
]);

/** One identity a variant has spoken for, and what holds it. */
interface VariantSubject {
	readonly id: string;
	readonly kind: SubjectKind;
}

/**
 * Every subject of one variant, in document order.
 *
 * This is the one place that knows what kinds of thing a variant holds. Two
 * hand-maintained lists of entity kinds is one list that will be missing a kind
 * the day a sixth is added, and the two places that matter — the identities a
 * fresh mint must avoid, and the rule that no two subjects share one — would
 * then disagree about what a board contains.
 * @param content The variant's content.
 * @yields {VariantSubject} Each subject, in document order.
 */
function* subjectsOf(content: VariantContent): Generator<VariantSubject> {
	for (const node of content.nodes) {
		yield { id: node.id, kind: "node" };
	}
	for (const edge of content.edges) {
		yield { id: edge.id, kind: "edge" };
	}
	yield* flowSubjects(content.flows);
	for (const view of content.views) {
		yield { id: view.id, kind: "view" };
	}
	yield* walkthroughSubjects(content.walkthroughs);
}

/**
 * Every flow and every step it tells, in document order.
 * @param flows The variant's flows.
 * @yields {VariantSubject} The flow, then each of its steps.
 */
function* flowSubjects(flows: VariantContent["flows"]): Generator<VariantSubject> {
	for (const flow of flows) {
		yield { id: flow.id, kind: "flow" };
		for (const step of flow.steps) {
			yield { id: step.id, kind: "step" };
		}
	}
}

/**
 * Every walkthrough and every beat it tells, in document order.
 * @param walkthroughs The variant's walkthroughs.
 * @yields {VariantSubject} The walkthrough, then each of its beats.
 */
function* walkthroughSubjects(
	walkthroughs: VariantContent["walkthroughs"],
): Generator<VariantSubject> {
	for (const walkthrough of walkthroughs) {
		yield { id: walkthrough.id, kind: "walkthrough" };
		for (const beat of walkthrough.beats) {
			yield { id: beat.id, kind: "beat" };
		}
	}
}

/**
 * Every id one variant's subjects hold, in document order.
 * @param content The variant's content.
 * @returns The ids.
 */
function subjectIds(content: VariantContent): string[] {
	return [...subjectsOf(content)].map((subject) => subject.id);
}

export {
	EdgeLabelSchema,
	DrillDownVariantSchema,
	type DrillDownVariant,
	DrillDownSchema,
	type DrillDown,
	SemanticNodeSchema,
	type SemanticNode,
	SemanticEdgeSchema,
	type SemanticEdge,
	VariantContentSchema,
	type VariantContent,
	type SubjectKind,
	BEAT_SUBJECT_KINDS,
	type VariantSubject,
	subjectsOf,
	subjectIds,
	emptyContent,
};
