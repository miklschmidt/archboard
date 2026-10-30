// A scenario's fixture, as the harness reads it: the starting vault an author meets. Its steps
// are the CLI's own writes, so every id on its boards is one the product minted, and a talk a
// recording kept may follow them. Parsed strictly, like every canonical input.

import { z } from "zod";
import { DiagramThemeSchema } from "@archboard/board/render-reply";
import { SemanticPolicySchema } from "@archboard/board/policy";

/** A path in the run's home, spelled as a prompt spells it: `~/` is the author's own HOME. */
const HomePathSchema = z.string().regex(/^~\/[^/]/u, "a path in the run's home, starting ~/");

const RawFixtureStepSchema = z.looseObject({ op: z.string(), board: z.string() });
const FixtureStepSchema = RawFixtureStepSchema;
type FixtureStep = z.infer<typeof FixtureStepSchema>;
type RawFixtureStep = FixtureStep;

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
		steps: z.array(RawFixtureStepSchema).default([]),
		inputs: z.record(z.string(), z.string()).default({}),
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
