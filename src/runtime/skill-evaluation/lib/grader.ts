// The one grading session: what it is told, what it must return, and how its
// answer is read. The grader sees anonymous runs, the pinned Flask sources and
// the rubric, and returns one structured verdict per run. It is told, in these
// words, not to delegate: "Do not use subagents. Inspect the source and grade
// every run yourself in this session."

import { z } from "zod";
import type { ImageDelivery } from "@/runtime/skill-evaluation/lib/grader-runner";
import type { RunImages } from "@/runtime/skill-evaluation/lib/grading-images";
import type { CaptureSummary } from "@/runtime/skill-evaluation/lib/captures";

/** Whether a grader answered the scenario it was given, or a checklist of its own. */
type ChecklistStanding = "answered" | "off-checklist";

const NO_DELEGATION =
	"Do not use subagents. Inspect the source and grade every run yourself in this session.";

const FeatureVerdictSchema = z.enum(["pass", "missing", "incorrect", "not-applicable"]);
/** What the grader says of the pictures: only after opening them, and only as far as it opened them. */
const VisualStandingSchema = z.enum(["pass", "fail", "incomplete"]);
type VisualStanding = z.infer<typeof VisualStandingSchema>;
const ObservationsSchema = z.array(
	z.object({ capture: z.string().min(1), observation: z.string().trim().min(1) }).strict(),
);
const VisualVerdictSchema = z
	.object({
		/** The labels of the captures the grader opened as images, tiles counted under their capture. */
		inspectedCaptures: z.array(z.string()),
		verdict: VisualStandingSchema,
		/** What the grader saw: readability, clipping, overlap, endpoints, sequence legibility, per capture. */
		observations: ObservationsSchema,
	})
	.strict();
/** A catalogue row the source justified on the board, whether the request named it or not. */
const UnpromptedSchema = z.array(
	z
		.object({
			feature: z.string().min(1),
			verdict: z.enum(["used", "missed"]),
			evidence: z.string().min(1),
			reason: z.string().min(1),
		})
		.strict(),
);
/** What the grader must add beyond the checklist: the rows it judged and the completeness score, null for a run that wrote nothing. */
const UnpromptedFields = {
	unprompted: UnpromptedSchema,
	behaviouralCompleteness: z.int().min(0).max(10).nullable(),
};
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
const RunVerdictSchema = z
	.object({ ...VerdictFields, ...UnpromptedFields, visual: VisualVerdictSchema })
	.strict();
/**
 * A filed verdict as the report reads it; one filed before captures existed
 * has no visual answer, and one filed before the unprompted judgment existed
 * has neither its rows nor its score.
 */
const FiledVerdictSchema = z
	.object({
		...VerdictFields,
		unprompted: UnpromptedSchema.optional(),
		behaviouralCompleteness: UnpromptedFields.behaviouralCompleteness.optional(),
		visual: VisualVerdictSchema.extend({
			observations: z.union([ObservationsSchema, z.string().min(1)]),
		}).optional(),
	})
	.strict();
const GraderOutputSchema = z.object({ runs: z.array(RunVerdictSchema).min(1) }).strict();
type RunVerdict = z.infer<typeof FiledVerdictSchema>;
type GraderOutput = z.infer<typeof GraderOutputSchema>;

/**
 * The visual verdict as it stands once the harness's own record of the
 * captures is counted. The grader's word passes only for a run whose every
 * declared capture was taken and whose every taken capture the grader opened;
 * a failed or unopened capture makes the verdict incomplete, and a verdict
 * filed without any visual answer is incomplete too. The original verdict
 * and observations remain available even when incomplete evidence prevents
 * either a pass or a fail from becoming an assessed comparison.
 * @param captures What the run's manifest says was declared, taken and not; null when it recorded none.
 * @param verdict The filed verdict, or null when the run is not graded.
 * @param supplied Labels backed by harness-owned image-delivery receipts.
 * @returns The standing, or null for an ungraded run.
 */
function visualStandingOf(
	captures: CaptureSummary | null,
	verdict: RunVerdict | null,
	supplied: readonly string[] = [],
): VisualStanding | null {
	if (verdict === null) return null;
	const visual = verdict.visual;
	if (visual === undefined || !everyCaptureSeen(captures, visual, supplied)) return "incomplete";
	return visual.verdict;
}

/**
 * The capture label a grader's name refers to. The prompt asks for labels,
 * but a grader that opened the files itself answers with what it opened:
 * `captures/capture-0-application.png`, or a tile of it, and the harness
 * names those files from the label (`capture-<n>-<label>[-tile-<n>].png`),
 * so the label is read back from the file name. A name that is not a
 * declared label and not such a file is returned as it is and matches nothing.
 * @param name What the grader wrote.
 * @param declared The labels the run's manifest declares.
 * @returns The declared label, or the name unchanged.
 */
function captureLabelOf(name: string, declared: readonly string[]): string {
	if (declared.includes(name)) return name;
	const file = name.slice(name.lastIndexOf("/") + 1);
	const match = /^capture-\d+-(?<stem>.+?)(?:-tile-\d+)?\.png$/u.exec(file);
	const stem = match?.groups?.["stem"];
	return stem !== undefined && declared.includes(stem) ? stem : name;
}

/**
 * Captures both supplied by the harness and discussed by the grader.
 * @param captures The manifest's capture requirements.
 * @param visual The grader's answer.
 * @param supplied Verified attachment labels.
 * @returns The capture labels with both kinds of evidence.
 */
function observedCaptures(
	captures: CaptureSummary | null,
	visual: NonNullable<RunVerdict["visual"]>,
	supplied: readonly string[],
): Set<string> {
	if (captures === null || !Array.isArray(visual.observations)) return new Set();
	const seen = new Set(
		visual.inspectedCaptures.map((name) => captureLabelOf(name, captures.declared)),
	);
	const observed = new Set(
		visual.observations.map((entry) => captureLabelOf(entry.capture, captures.declared)),
	);
	return new Set(
		supplied.filter(
			(label) =>
				captures.declared.includes(label) &&
				captures.captured.includes(label) &&
				seen.has(label) &&
				observed.has(label),
		),
	);
}

/**
 * Whether every required capture was delivered and has an image-grounded answer.
 * @param captures The harness's declared and captured labels.
 * @param visual The grader's visual answer.
 * @param supplied Labels backed by successful attachment delivery.
 * @returns Whether all capture obligations have evidence.
 */
function everyCaptureSeen(
	captures: CaptureSummary | null,
	visual: NonNullable<RunVerdict["visual"]>,
	supplied: readonly string[],
): boolean {
	if (captures === null || captures.declared.length === 0 || captures.failed.length > 0)
		return false;
	const observed = observedCaptures(captures, visual, supplied);
	return captures.declared.every((label) => observed.has(label));
}

/** The JSON Schema handed to `codex exec --output-schema` and `claude --json-schema`, rendered from the parsing authority. */
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
	/** The harness-supplied attachments in their prompt order, repeated on every call. */
	readonly images?: readonly RunImages[];
	/** How the pictures reach the grader; only the one sentence about that differs between runners. */
	readonly delivery?: ImageDelivery;
}

/** The one sentence that differs between runners: how the listed pictures reach the grader. */
const DELIVERY_LINES: Readonly<Record<ImageDelivery, string>> = {
	attached:
		"The following images are attached directly to this prompt in the listed order. Inspect every attached main image and native-resolution tile visually; no image-tool call is needed to receive them.",
	workspace:
		"The following images are in the workspace at the listed paths, relative to the directory you run in. Open every listed main image and native-resolution tile with your file reading tool and look at it; the harness records which files you opened, and a capture you did not open in full is incomplete.",
};

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
				"Look at every harness-attached capture and native-resolution tile. Use the image viewing tool for further inspection if useful. A capture whose `ok` is false has no picture, and the entry says why; do not describe it. Reading the SVG text, the board JSON, the file's existence or the author's claim to have looked is not looking at a diagram.",
				"",
				"# Rubric",
				"",
				brief.rubric.trim(),
				"",
			];
	return [
		...opening,
		DELIVERY_LINES[brief.delivery ?? "attached"],
		...attachmentLines(brief.images ?? []),
		`Grade these runs now: ${brief.runs.join(", ")}.`,
		"For every run return one entry with: a verdict for EVERY expected feature (pass, missing, incorrect, or not-applicable), each with the evidence you read (file, board, node or edge id, render) and a one-line reason; integer scores 0-10 for semanticCorrectness, architecturalTruth and readability; a summary; and concerns.",
		"An expected feature is required by the scenario. Mark it not-applicable only when the request itself made it impossible, and say why in the reason; a plausible diagram with a missing or incorrect feature does not pass that feature.",
		"Judge persisted traffic from the saved board; a static render or capture cannot show motion, so never claim you observed animation.",
		"For every run also return `unprompted`: one entry per catalogue row the source justifies on the board whether or not the request named it (rows the request named are expected features and are left out), each {feature, verdict used|missed, evidence, reason} in the rubric's vocabulary, and `behaviouralCompleteness`, an integer 0-10 for how completely the board uses the semantics the source justifies beyond what the request named; a run that wrote nothing returns an empty list and null.",
		"For every run also return `visual`: `inspectedCaptures` (the labels of the attached captures you visually inspected), a `verdict` of pass, fail or incomplete, and `observations` (an array of {capture, observation}, one entry per capture you inspected) naming what you saw of readability, clipping at the page edge, overlapping cards or labels, whether each relationship's endpoints sit on the parts it names, and whether a sequence's columns and messages read in order. Pass only a run whose every listed capture you visually inspected and found legible; a capture you did not inspect, or one the harness could not take or attach, makes the verdict incomplete, and the harness downgrades a pass lacking successful image delivery or a per-capture observation.",
		`Write nothing but the structured answer; it is captured into ${brief.layout.verdictFile}.`,
	].join("\n");
}

/**
 * Identify each attached picture and each unavailable capture on every call.
 * @param runs The attachment plans.
 * @returns The ordered image legend and unavailable labels.
 */
function attachmentLines(runs: readonly RunImages[]): string[] {
	const images = runs.flatMap((run) => run.images.map((image) => ({ run: run.run, ...image })));
	return [
		...images.map(
			(image, index) =>
				`Image ${index + 1}: ${image.run}, capture ${image.capture}, ${image.file} (${image.width}×${image.height}).`,
		),
		...runs.flatMap((run) =>
			run.failures.map(
				(failure) =>
					`Unavailable: ${run.run}, capture ${failure.capture}: ${failure.detail}. Its visual evaluation is incomplete.`,
			),
		),
	];
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
 * @returns The waived features, the declared features the grader did not mention, and the names it answered that the checklist does not hold.
 */
function checklistGaps(
	expected: readonly { readonly feature: string }[],
	verdict: RunVerdict,
): { readonly waived: string[]; readonly unmentioned: string[]; readonly invented: string[] } {
	const answered = new Map(verdict.features.map((entry) => [entry.feature, entry.verdict]));
	const declared = new Set(expected.map((entry) => entry.feature));
	return {
		waived: expected
			.filter((entry) => answered.get(entry.feature) === "not-applicable")
			.map((entry) => entry.feature),
		unmentioned: expected
			.filter((entry) => !answered.has(entry.feature))
			.map((entry) => entry.feature),
		invented: [...new Set(verdict.features.map((entry) => entry.feature))].filter(
			(feature) => !declared.has(feature),
		),
	};
}

/**
 * What a grader's answer did with the scenario's checklist. An answer that
 * left a declared feature unmentioned and graded names the checklist does not
 * hold is not an answer about this scenario at all: it measures the grader,
 * not the author, so nothing may be concluded from it either way. An answer
 * that only skipped features is still about them, and one that only added
 * names of its own answered everything asked as well.
 * @param expected The scenario's checklist.
 * @param verdict The grader's answer.
 * @returns Whether the checklist was answered, or answered off.
 */
function checklistStanding(
	expected: readonly { readonly feature: string }[],
	verdict: RunVerdict,
): ChecklistStanding {
	const gaps = checklistGaps(expected, verdict);
	return gaps.unmentioned.length > 0 && gaps.invented.length > 0 ? "off-checklist" : "answered";
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
	checklistStanding,
	graderPrompt,
	parseGraderOutput,
	semanticallyCompliant,
	visualStandingOf,
	type ChecklistStanding,
	type GraderBrief,
	type GraderOutput,
	type RunVerdict,
	type VisualStanding,
};
