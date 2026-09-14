// The one grading session: what it is told, what it must return, and how its
// answer is read. The grader sees anonymous runs, the pinned Flask sources and
// the rubric, and returns one structured verdict per run. It is told, in these
// words, not to delegate: "Do not use subagents. Inspect the source and grade
// every run yourself in this session."

import { z } from "zod";

const NO_DELEGATION =
	"Do not use subagents. Inspect the source and grade every run yourself in this session.";

const FeatureVerdictSchema = z.enum(["pass", "missing", "incorrect", "not-applicable"]);
/** What the grader says of the pictures: only after opening them, and only as far as it opened them. */
const VisualStandingSchema = z.enum(["pass", "fail", "incomplete"]);
type VisualStanding = z.infer<typeof VisualStandingSchema>;
const VisualVerdictSchema = z
	.object({
		/** The labels of the captures the grader opened as images, tiles counted under their capture. */
		inspectedCaptures: z.array(z.string()),
		verdict: VisualStandingSchema,
		/** What the grader saw: readability, clipping, overlap, endpoints, sequence legibility, per capture. */
		observations: z.string().min(1),
	})
	.strict();
const VerdictFields = {
	run: z.string().regex(/^run-[0-9a-f]{10}$/u),
	features: z.array(
		z.object({
			feature: z.string().min(1),
			verdict: FeatureVerdictSchema,
			evidence: z.string().min(1),
			reason: z.string().min(1),
		}),
	),
	semanticCorrectness: z.int().min(0).max(10),
	architecturalTruth: z.int().min(0).max(10),
	readability: z.int().min(0).max(10),
	summary: z.string().min(1),
	concerns: z.array(z.string()),
};
/** What the grader must answer per run: the semantic checklist and, separately, what it saw. */
const RunVerdictSchema = z.object({ ...VerdictFields, visual: VisualVerdictSchema }).strict();
/** A filed verdict as the report reads it; one filed before captures existed has no visual answer. */
const FiledVerdictSchema = z
	.object({ ...VerdictFields, visual: VisualVerdictSchema.optional() })
	.strict();
const GraderOutputSchema = z.object({ runs: z.array(RunVerdictSchema).min(1) }).strict();
type RunVerdict = z.infer<typeof FiledVerdictSchema>;
type GraderOutput = z.infer<typeof GraderOutputSchema>;

/**
 * The visual verdict as it stands once the harness's own record of the
 * captures is counted. The grader's word passes only for a run whose every
 * declared capture was taken and whose every taken capture the grader opened;
 * a failed or unopened capture makes the verdict incomplete, and a verdict
 * filed without any visual answer is incomplete too. A fail the grader saw
 * stands whatever else is missing.
 * @param captures What the run's manifest says was declared, taken and not; null when it recorded none.
 * @param verdict The filed verdict, or null when the run is not graded.
 * @returns The standing, or null for an ungraded run.
 */
function visualStandingOf(
	captures: CapturesTaken | null,
	verdict: RunVerdict | null,
): VisualStanding | null {
	if (verdict === null) return null;
	const visual = verdict.visual;
	if (visual?.verdict === "fail") return "fail";
	if (visual === undefined || !everyCaptureSeen(captures, visual.inspectedCaptures)) {
		return "incomplete";
	}
	return visual.verdict;
}

/** What a run's manifest says about its captures, as far as the standing needs. */
interface CapturesTaken {
	readonly declared: readonly string[];
	readonly captured: readonly string[];
	readonly failed: readonly string[];
}

/**
 * Whether every declared capture was taken and every taken one was opened.
 * @param captures What was declared, taken and not; null when nothing was recorded.
 * @param inspected The labels the grader opened.
 * @returns Whether the pictures were all there and all seen.
 */
function everyCaptureSeen(captures: CapturesTaken | null, inspected: readonly string[]): boolean {
	if (captures === null || captures.captured.length === 0 || captures.failed.length > 0) {
		return false;
	}
	const opened = new Set(inspected);
	return captures.captured.every((label) => opened.has(label));
}

/** The JSON Schema handed to `codex exec --output-schema`, rendered from the parsing authority. */
const GRADER_OUTPUT_JSON_SCHEMA = z.toJSONSchema(GraderOutputSchema, {
	io: "output",
});

/** What the grader prompt is built from. */
interface GraderBrief {
	readonly rubric: string;
	/** The grading workspace's layout, relative to the directory the grader runs in. */
	readonly layout: {
		readonly flask: string;
		readonly runs: string;
		readonly verdictFile: string;
	};
	readonly revisions: Readonly<Record<string, string>>;
	/** The anonymous ids to grade in this call. */
	readonly runs: readonly string[];
	/** Whether this call continues a session that already read the rubric and the sources. */
	readonly continuing: boolean;
}

/**
 * The prompt for one grading call. The first call carries the rubric and the
 * layout; a continuation names only the next runs, since the session keeps
 * what it read.
 * @param brief What to say.
 * @returns The prompt text.
 */
function graderPrompt(brief: GraderBrief): string {
	const opening = brief.continuing
		? ["Continue grading in this same session, under the same rubric and the same rules.", ""]
		: [
				"You are grading agent runs that authored architecture boards about the Flask source tree.",
				"Each run is anonymous. You are not told which configuration produced it, and you must not guess or mention it.",
				NO_DELEGATION,
				"",
				`Pinned Flask checkouts, read-only, under ${brief.layout.flask}/<version>/: ${Object.entries(
					brief.revisions,
				)
					.map(([version, commit]) => `${version} = ${commit}`)
					.join(", ")}.`,
				`Each run is a directory under ${brief.layout.runs}/<run-id>/ holding bundle.json (the request, its source paths, the expected-feature checklist, the configured vault policy, group-inspection results, the boards before and after as the vault stores them, the harness's deterministic verdicts, the commands the author ran, and a \`captures\` list), the resulting board documents under boards/, rendered diagrams under renders/ as SVG, and under captures/ the PNG bitmaps the harness took of every final saved diagram the request asked for, at native scale, one per entry of \`captures\` with its label, board, variant, view, provenance (board version, variant, view, scale, dimensions, SVG digest) and, for a large diagram, native-scale tiles.`,
				"Inspect the source the request names before judging a run's truth; reuse what you learned across runs of the same revision.",
				"Open every capture image listed for a run with your image viewing tool and look at it; where a capture lists tiles and the whole image is too small to read, open the tiles too. A capture whose `ok` is false has no picture, and the entry says why; do not describe it. Reading the SVG text, the board JSON, the file's existence or the author's claim to have looked is not looking at a diagram.",
				"",
				"# Rubric",
				"",
				brief.rubric.trim(),
				"",
			];
	return [
		...opening,
		`Grade these runs now: ${brief.runs.join(", ")}.`,
		"For every run return one entry with: a verdict for EVERY expected feature (pass, missing, incorrect, or not-applicable), each with the evidence you read (file, board, node or edge id, render) and a one-line reason; integer scores 0-10 for semanticCorrectness, architecturalTruth and readability; a summary; and concerns.",
		"An expected feature is required by the scenario. Mark it not-applicable only when the request itself made it impossible, and say why in the reason; a plausible diagram with a missing or incorrect feature does not pass that feature.",
		"Judge persisted traffic from the saved board; a static render or capture cannot show motion, so never claim you observed animation.",
		"For every run also return `visual`: `inspectedCaptures` (the labels of the captures you opened as images), a `verdict` of pass, fail or incomplete, and `observations` naming, per capture you opened, what you saw of readability, clipping at the page edge, overlapping cards or labels, whether each relationship's endpoints sit on the parts it names, and whether a sequence's columns and messages read in order. Pass only a run whose every listed capture you opened and found legible; a capture you did not open, or one the harness could not take, makes the verdict incomplete, and the harness downgrades a pass it cannot corroborate.",
		`Write nothing but the structured answer; it is captured into ${brief.layout.verdictFile}.`,
	].join("\n");
}

/**
 * Reads a grading call's final message as the structured verdict.
 * @param text The final message.
 * @returns The verdict.
 */
function parseGraderOutput(text: string): GraderOutput {
	const parsed = GraderOutputSchema.safeParse(JSON.parse(text));
	if (!parsed.success)
		throw new Error(`grader output does not match the contract: ${z.prettifyError(parsed.error)}`);
	return parsed.data;
}

/**
 * Expected features the grader waived that the scenario required. Every
 * declared feature is required, so any not-applicable verdict is one to
 * surface rather than accept.
 * @param expected The scenario's checklist.
 * @param verdict The grader's answer for the run.
 * @returns The waived features, and the declared features the grader did not mention.
 */
function checklistGaps(
	expected: readonly { readonly feature: string }[],
	verdict: RunVerdict,
): { readonly waived: string[]; readonly unmentioned: string[] } {
	const answered = new Map(verdict.features.map((entry) => [entry.feature, entry.verdict]));
	return {
		waived: expected
			.filter((entry) => answered.get(entry.feature) === "not-applicable")
			.map((entry) => entry.feature),
		unmentioned: expected
			.filter((entry) => !answered.has(entry.feature))
			.map((entry) => entry.feature),
	};
}

/**
 * Whether a run passed semantic compliance: every expected feature passed.
 * @param expected The scenario's checklist.
 * @param verdict The grader's answer.
 * @returns True only when nothing is missing, incorrect, waived or unmentioned.
 */
function semanticallyCompliant(
	expected: readonly { readonly feature: string }[],
	verdict: RunVerdict,
): boolean {
	const gaps = checklistGaps(expected, verdict);
	const answered = new Map(verdict.features.map((entry) => [entry.feature, entry.verdict]));
	return (
		gaps.waived.length === 0 &&
		gaps.unmentioned.length === 0 &&
		expected.every((entry) => answered.get(entry.feature) === "pass")
	);
}

export {
	FiledVerdictSchema,
	GRADER_OUTPUT_JSON_SCHEMA,
	GraderOutputSchema,
	NO_DELEGATION,
	checklistGaps,
	graderPrompt,
	parseGraderOutput,
	semanticallyCompliant,
	visualStandingOf,
	type GraderBrief,
	type GraderOutput,
	type RunVerdict,
	type VisualStanding,
};
