import {
	ExplanationRequestSchema,
	ReadingSelectionSchema,
} from "#shared/schemas/model-explanation.ts";
// What one pane is looking at, in the model's own words.
//
// ADR 0023 leaves the browser owning presentation and nothing else: the camera,
// the active view, the walkthrough position and what the person picked out are
// session state, never content. But an agent asked "what does this do?" has to
// be told which *this*, and the only place that fact exists is the pane. So a
// pane says what it is reading — model, variant, view — and which subjects of
// it are selected, and says it in semantic identities rather than in anything
// drawn: a node id, an edge id, a step of a flow. No coordinates, no element
// ids, nothing about the picture.
//
// This is a report, not a write. Nothing here reaches a model file, and a pane
// that reports is not claiming anything; two panes reading one model two ways
// is the ordinary case and both reports stand.

import { z } from "zod";
import { DiagramGrammarSchema, VariantLifecycleSchema } from "#shared/schemas/vocabulary.ts";

/** Where a pane posts what it is reading. */
const SEMANTIC_PANE_CONTEXT_ROUTE = "/api/panes/semantic-context";

/**
 * The kinds of thing a person can pick out of a drawing.
 *
 * Every one of them is a subject a variant actually holds, which is what makes
 * a selection something an agent can act on: it names the same id the edit
 * command takes. A selection of anything else — a lane, a label, a region the
 * renderer invented — is not selectable, because an agent could not be asked to
 * change it.
 */
const SemanticSubjectKindSchema = z.enum([
	"node",
	"edge",
	"flow",
	"step",
	"view",
	"walkthrough",
	"beat",
]);

/**
 * One selected subject.
 *
 * The id is the whole of what a pane has to know. What kind of thing that id
 * names, and what it is called, are facts about the model — and the model is
 * being read by the reader anyway, which is the side that cannot be out of date
 * about it. So a pane may state them and does not have to: a stated kind is a
 * second opinion about a document somebody else is holding open, and the reader
 * resolves both from the variant rather than believing the report.
 */
const SemanticSubjectRefSchema = z
	.object({
		id: z.string().min(1).max(64),
		/** What the pane believes it is, when it knows; resolved from the model regardless. */
		kind: SemanticSubjectKindSchema.optional(),
		/** What the pane drew it as, when it knows; resolved from the model regardless. */
		name: z.string().min(1).max(120).optional(),
	})
	.strict();

/** Which model a pane is reading, by the name every command spells it with. */
const SemanticPaneModelSchema = z
	.object({
		/** The model's name as typed, which is what the CLI and the routes take. */
		name: z.string().min(1).max(200),
		/** Its comparison form (ADR 0010), for matching one report against another. */
		key: z.string().min(1).max(200),
	})
	.strict();

/** Which variant of it, once the pane knows. */
const SemanticPaneVariantSchema = z
	.object({
		id: z.string().min(1).max(64),
		name: z.string().min(1).max(120),
		lifecycle: VariantLifecycleSchema,
	})
	.strict();

/** Which of the variant's views it is being read through, when it is. */
const SemanticPaneViewSchema = z
	.object({
		id: z.string().min(1).max(64),
		name: z.string().min(1).max(120),
		grammar: DiagramGrammarSchema,
	})
	.strict();

/**
 * Where a pane presenting a walkthrough has got to (TASK-251).
 *
 * The position stays the browser's (ADR 0023): this is the pane saying where it
 * is, never anybody setting it. It is said because something narrating the
 * presentation has to follow the picture — it waits for a step it asked for to
 * finish arriving before it talks about it, and it has to hear when a person
 * stepped by hand or left, or it goes on describing a picture nobody can see.
 */
const SemanticPanePresentationSchema = z
	.object({
		/** The walkthrough being presented, by id. */
		walkthrough: z.string().min(1).max(64),
		/** Which beat is on screen, counted from zero as the variant orders them. */
		beat: z.int().min(0),
		/** How many beats that walkthrough has. */
		of: z.int().min(1),
		/**
		 * Whether that beat has finished arriving: its picture is the one drawn, and
		 * neither the camera nor the picture is still moving.
		 */
		arrived: z.boolean(),
		/**
		 * The `pane_present` request this position answers, or null when a person
		 * chose it. It is how a driver tells its own step from somebody's hand on
		 * the keys, including a report sent before its request arrived.
		 */
		answering: z.string().min(1).max(128).nullable(),
	})
	.strict();

/**
 * What the server asks of a pane presenting a walkthrough, over its socket.
 *
 * Addressed to the model the pane is showing, like every model message, so a
 * pane that has moved on ignores it.
 */
const PanePresentRequestSchema = z
	.object({
		type: z.literal("pane_present"),
		/** Names this request, so the pane's report can say which one it answers. */
		request: z.string().min(1).max(128),
		walkthrough: z.string().min(1).max(64),
		beat: z.int().min(0),
	})
	// Not strict: the socket adds the board key every board message carries.
	.strip();

/**
 * A part of a pane's reading the user can change by hand.
 *
 * The walkthrough position is not one of them: `answering` already tells a step somebody asked
 * for from one the user chose.
 */
const SemanticPanePartSchema = z.enum(["model", "variant", "view", "selection"]);

/**
 * What one pane is reading, as the pane last said it.
 *
 * Every part of it but the pane itself is nullable, and deliberately: a pane is
 * mounted before its first drawing answers, and a pane whose model was closed
 * has to be able to say so. "Board X, nothing drawn yet" and "nothing at all"
 * are both true things a pane can be, and a report that could not express them
 * would leave the last true-looking answer standing after it stopped being true.
 */
const SemanticPaneContextSchema = z
	.object({
		architecture: ExplanationRequestSchema.omit({ actionId: true, action: true, question: true })
			.extend({
				vault: z.string().min(1),
				selection: ReadingSelectionSchema.optional(),
				/** Labels of the accepted reading, independent of its machine selectors. */
				display: z
					.strictObject({
						model: z.string().min(1),
						state: z.string().min(1).optional(),
						comparison: z.string().min(1),
					})
					.optional(),
			})
			.nullable()
			.optional(),
		paneId: z.string().min(1).max(128),
		/** The socket this pane speaks over, so a dropped tab retires its report. */
		clientId: z.string().min(1).max(128),
		model: SemanticPaneModelSchema.nullable(),
		variant: SemanticPaneVariantSchema.nullable(),
		view: SemanticPaneViewSchema.nullable(),
		/** The subjects the person has picked out; empty for none. */
		selection: z.array(SemanticSubjectRefSchema).max(128),
		/** The model version the pane drew, when it drew one. */
		version: z.int().min(1).nullable(),
		/** Where a presented walkthrough has got to; null or absent when none is. */
		presentation: SemanticPanePresentationSchema.nullable().optional(),
		/**
		 * Which parts of this reading changed because the user's own hand changed them since the
		 * pane's last report (ADR 0034). Only the pane can tell a click from a change that reached
		 * it over its socket, and one report is a settled snapshot that can hold both, so the
		 * cause is said per part. Absent and empty mean the same: nobody is told about this
		 * report, which is what a part nobody marked must mean, or an agent's change could be
		 * told to the voice model as the user's and answered by it.
		 */
		byUser: z.array(SemanticPanePartSchema).max(4).optional(),
		/** When the pane observed all of this. */
		at: z.iso.datetime(),
		/**
		 * Which report this is, counted by the pane that sent it.
		 *
		 * Two reports from one pane can be in flight at once — a selection and the
		 * view change that followed it — and HTTP does not promise they arrive in
		 * the order they were sent. Arrival order would then let the older one land
		 * last and stand for good, so a person would be looking at one thing while
		 * every agent was told about another. The pane counts its own reports and
		 * the reader keeps only the highest it has seen.
		 *
		 * A timestamp cannot do this job: two reports made in one millisecond tie,
		 * and a tie is exactly the case the ordering has to decide.
		 *
		 * A pane starts at 0 and counts up for the life of one socket, never going
		 * back, including across a model change. A reconnect or a remount mints a
		 * new client id, whose reports are a new count, so a counter never has to
		 * survive anything.
		 */
		sequence: z.int().min(0),
	})
	.strict();

export {
	SEMANTIC_PANE_CONTEXT_ROUTE,
	SemanticSubjectKindSchema,
	PanePresentRequestSchema,
	SemanticPaneContextSchema,
};
