// A scenario's fixture, as the harness reads it: the starting vault an author meets. Its steps
// are the CLI's own writes, so every id on its boards is one the product minted, and a talk a
// recording kept may follow them. Parsed strictly, like every canonical input.

import { z } from "zod";
import {
	BoardCreateInputSchema,
	VariantEditInputSchema,
	ResolutionInputSchema,
} from "@archboard/board/commands";
import { DiagramThemeSchema } from "@archboard/board/render-reply";
import { SemanticPolicySchema } from "@archboard/board/policy";

/** A path in the run's home, spelled as a prompt spells it: `~/` is the author's own HOME. */
const HomePathSchema = z.string().regex(/^~\/[^/]/u, "a path in the run's home, starting ~/");

/** A fixture input before its placeholders are resolved: the shapes are the CLI's own. */
const CreateStepSchema = z
	.object({
		op: z.literal("new"),
		board: z.string().min(1),
		input: BoardCreateInputSchema.omit({ name: true }),
	})
	.strict();
const EditStepSchema = z
	.object({ op: z.literal("edit"), board: z.string().min(1), input: VariantEditInputSchema })
	.strict();
const BranchStepSchema = z
	.object({
		op: z.literal("branch"),
		board: z.string().min(1),
		as: z.string().min(1),
		from: z.string().optional(),
		summary: z.string().optional(),
	})
	.strict();
const ResolveStepSchema = z
	.object({
		op: z.literal("resolve"),
		board: z.string().min(1),
		variant: z.string().min(1),
		input: ResolutionInputSchema.omit({ variant: true }),
	})
	.strict();
const AdoptStepSchema = z
	.object({
		op: z.literal("adopt"),
		board: z.string().min(1),
		variant: z.string().min(1),
		reason: z.string().optional(),
	})
	.strict();
const FixtureStepSchema = z.discriminatedUnion("op", [
	CreateStepSchema,
	EditStepSchema,
	BranchStepSchema,
	ResolveStepSchema,
	AdoptStepSchema,
]);
type FixtureStep = z.infer<typeof FixtureStepSchema>;

/**
 * A step as the fixture file holds it: the same shape, with the JSON the CLI
 * reads left loose because it may still hold placeholders ($FLASK, $node(...))
 * that only resolve against the board once the earlier steps have run.
 */
const LooseInputSchema = z.record(z.string(), z.unknown());
const RawFixtureStepSchema = z.discriminatedUnion("op", [
	CreateStepSchema.extend({ input: LooseInputSchema }),
	EditStepSchema.extend({ input: LooseInputSchema }),
	BranchStepSchema,
	ResolveStepSchema.extend({ input: LooseInputSchema }),
	AdoptStepSchema,
]);
type RawFixtureStep = z.infer<typeof RawFixtureStepSchema>;

/**
 * A talk a recording kept of one walkthrough of a board the steps laid, where `semantic record
 * --talk` would have kept it. It is laid after the steps, from the board and vault check the CLI
 * serves, through the recorder's own writer, with silence for its voice: a talk needs no voice
 * session to be rendered again, and an author run has none.
 */
const TalkFixtureSchema = z
	.object({
		board: z.string().min(1),
		/** The variant it presents, as `--variant` names it; the current one when absent. */
		variant: z.string().min(1).optional(),
		walkthrough: z.string().min(1),
		directory: HomePathSchema,
		/** The palette it was recorded in. */
		theme: DiagramThemeSchema,
	})
	.strict();
type TalkFixture = z.infer<typeof TalkFixtureSchema>;

const FixtureSchema = z
	.object({
		$comment: z.string().optional(),
		registerRepo: z.boolean(),
		policy: SemanticPolicySchema.partial().optional(),
		steps: z.array(RawFixtureStepSchema),
		talk: TalkFixtureSchema.optional(),
	})
	.strict();
type Fixture = z.infer<typeof FixtureSchema>;

export {
	FixtureSchema,
	FixtureStepSchema,
	HomePathSchema,
	RawFixtureStepSchema,
	type Fixture,
	type FixtureStep,
	type RawFixtureStep,
	type TalkFixture,
};
