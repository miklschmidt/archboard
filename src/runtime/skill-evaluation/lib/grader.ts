// The one grading session: what it is told, what it must return, and how its
// answer is read. The grader sees anonymous runs, the pinned Flask sources,
// the skill under evaluation and the rubric, and returns one structured
// verdict per run. It is told, in these
// words, not to delegate: "Do not use subagents. Inspect the source and grade
// every run yourself in this session."

import { z } from "zod";
import type { ImageDelivery } from "@/runtime/skill-evaluation/lib/grader-runner";
import type { RunImages } from "@/runtime/skill-evaluation/lib/grading-images";
import type { CaptureSummary } from "@/runtime/skill-evaluation/lib/captures";
import {
	CATALOGUE_PASSAGE,
	CATALOGUE_ROWS,
	CITATION_PATTERN,
	RUBRIC_SECTIONS,
	citesPassage,
} from "@/runtime/skill-evaluation/lib/citations";

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
const UnpromptedEntryFields = {
	verdict: z.enum(["used", "missed"]),
	evidence: z.string().min(1),
	reason: z.string().min(1),
};
/**
 * One row of the skill's catalogue the grader judged for what the run added.
 * The row is one of the closed set, so a missed row is counted once under one
 * name and two arms' missed counts are the same quantity.
 */
const UnpromptedSchema = z.array(
	z.object({ feature: z.enum(CATALOGUE_ROWS), ...UnpromptedEntryFields }).strict(),
);
/**
 * A judged row as filed. A verdict filed before the set was closed may name a
 * row of its grader's own invention; it still loads, and the report counts
 * only the rows of the closed set.
 */
const FiledUnpromptedSchema = z.array(
	z.object({ feature: z.string().min(1), ...UnpromptedEntryFields }).strict(),
);
/**
 * What the grader must add beyond the checklist: the catalogue rows it judged
 * and the completeness score, null exactly when the rubric's unprompted walk
 * had no subject. Kept rather than removed (TASK-268): they measure what the
 * request did not name, which a checklist cannot. They answer in the skill's
 * own catalogue: `eval:skill check` holds the closed row set above equal to
 * the row keys of both the skill's catalogue table and the rubric's, and the
 * rubric says the skill's row conditions govern wherever its restatement
 * differs.
 */
const UnpromptedFields = {
	unprompted: UnpromptedSchema,
	behaviouralCompleteness: z.int().min(0).max(10).nullable(),
};
/**
 * Which authority a finding answers to, as the rubric's "Findings" section
 * defines them: a departure from the skill, a board the source contradicts,
 * or an expectation the skill never taught, which fails no run.
 */
const FINDING_AXES = ["conformance", "truth", "skill"] as const;
type FindingAxis = (typeof FINDING_AXES)[number];

/**
 * One value per finding axis.
 * @param pick The value for an axis.
 * @returns The values, by axis.
 */
function byAxis<T>(pick: (axis: FindingAxis) => T): Readonly<Record<FindingAxis, T>> {
	return { conformance: pick("conformance"), truth: pick("truth"), skill: pick("skill") };
}
/** Text that is not only whitespace, as a pattern the grader's schema carries too. */
const SOME_TEXT = /\S/u;
/** What a verdict other than a pass must state: what the run did, what the skill told it, and the gap. */
const FindingSchema = z
	.object({
		axis: z.enum(FINDING_AXES),
		/** What the run did, as the board or the commands show it. */
		did: z.string().regex(SOME_TEXT),
		/** What the skill told it to do, quoted from the passage. */
		taught: z.string().regex(SOME_TEXT),
		/** Where: a `<file>#<heading-anchor>` citation into the staged skill. */
		passage: z.string().regex(CITATION_PATTERN),
		/** The gap between the two, or for a truth finding what the source says instead. */
		gap: z.string().regex(SOME_TEXT),
	})
	.strict();
const FeatureFields = {
	feature: z.string().min(1),
	evidence: z.string().min(1),
	reason: z.string().min(1),
};
/**
 * A feature verdict as the grader must answer it: a pass states no finding,
 * and every other verdict states one. Two shapes rather than one refined
 * shape, so the JSON Schema the grader decodes against carries the rule and a
 * paid call cannot return an answer the harness would then refuse.
 */
const AnsweredFeatureSchema = z.union([
	z
		.object({
			...FeatureFields,
			verdict: FeatureVerdictSchema.extract(["pass"]),
			finding: z.null(),
		})
		.strict(),
	z
		.object({
			...FeatureFields,
			verdict: FeatureVerdictSchema.exclude(["pass"]),
			finding: FindingSchema,
		})
		.strict(),
]);
/** A feature verdict as filed; one filed before findings existed has none. */
const FiledFeatureSchema = z.object({
	...FeatureFields,
	verdict: FeatureVerdictSchema,
	finding: FindingSchema.nullable().optional(),
});
const VerdictFields = {
	run: z.string().regex(/^run-[0-9a-f]{10}$/u),
	semanticCorrectness: z.int().min(0).max(10),
	architecturalTruth: z.int().min(0).max(10),
	readability: z.int().min(0).max(10),
	summary: z.string().min(1),
	concerns: z.array(z.string()),
};
/** What the grader must answer per run: the semantic checklist and, separately, what it saw. */
const RunVerdictSchema = z
	.object({
		...VerdictFields,
		features: z.array(AnsweredFeatureSchema),
		...UnpromptedFields,
		visual: VisualVerdictSchema,
	})
	.strict();
/**
 * A filed verdict as the report reads it; one filed before captures existed
 * has no visual answer, and one filed before the unprompted judgment existed
 * has neither its rows nor its score.
 */
const FiledVerdictSchema = z
	.object({
		...VerdictFields,
		features: z.array(FiledFeatureSchema),
		unprompted: FiledUnpromptedSchema.optional(),
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
		/** The skill under evaluation, staged once for every run. */
		readonly skill: string;
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
 * How to fill the answer, by field. Each line names the rubric section that
 * governs a field instead of restating it; the rubric is the one statement of
 * every judgement, the finding axes included.
 */
const ANSWER_LINES: readonly string[] = [
	"Return one entry per run in the shape the output schema fixes. Judge each field by the rubric section named for it, not from a summary of it:",
	`- \`features\`: one verdict for every expected feature, by "${RUBRIC_SECTIONS.features}" and "${RUBRIC_SECTIONS.correctUse}"; each verdict's \`finding\`, its fields and its \`axis\`, by "${RUBRIC_SECTIONS.findings}".`,
	`- \`unprompted\` and \`behaviouralCompleteness\`: by "${RUBRIC_SECTIONS.unprompted}" and "${RUBRIC_SECTIONS.inherited}"; each entry's \`feature\` is one row key of that catalogue, exactly as written there.`,
	`- \`visual\`: by "${RUBRIC_SECTIONS.visual}". The harness downgrades a pass lacking successful image delivery or a per-capture observation.`,
	`- \`semanticCorrectness\`, \`architecturalTruth\` and \`readability\`: by "${RUBRIC_SECTIONS.scores}"; \`summary\` in a few sentences; \`concerns\` by "${RUBRIC_SECTIONS.concerns}".`,
];

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
				`Each run is a directory under ${brief.layout.runs}/<run-id>/ holding bundle.json (the request, its source paths, the expected-feature checklist with the skill passages each feature derives from, the configured vault policy, group-inspection results, the boards before and after as the vault stores them, the harness's deterministic verdicts, the commands the author ran, and a \`captures\` list), the resulting board documents under boards/, rendered diagrams under renders/ as SVG, and under captures/ the PNG bitmaps the harness took of every final saved diagram the request asked for, at native scale, one per entry of \`captures\` with its label, board, variant, view, provenance (board version, variant, view, scale, dimensions, SVG digest) and, for a large diagram, native-scale tiles.`,
				`The skill under evaluation, read-only, under ${brief.layout.skill}/: SKILL.md and references/. A citation such as \`${CATALOGUE_PASSAGE}\` names a file there and one of its headings; each expected feature's \`skill\` list cites the passages it derives from, and the catalogue the \`unprompted\` rows come from is \`${CATALOGUE_PASSAGE}\`. Read a cited passage before judging a feature against it.`,
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
		...ANSWER_LINES,
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

/** An expected feature as findings are read against it: its name and the passages it cites. */
interface CitedFeature {
	readonly feature: string;
	/** The `<file>#<heading-anchor>` passages the feature derives from; none for a checklist that cites nothing. */
	readonly skill?: readonly string[];
}

/**
 * A finding the grader put on the skill while naming a passage its feature
 * cites. The scenario declares that passage teaches the feature, so "the
 * skill never taught it" contradicts the scenario, and the finding is held
 * against the run as a departure from the skill instead.
 */
interface ExcusedDeparture {
	readonly feature: string;
	readonly passage: string;
	/** What the grader said the gap was, as it filed it. */
	readonly gap: string;
}

/**
 * The expected features a verdict answered with a finding, by their last
 * answer, waivers left out.
 * @param expected The scenario's checklist.
 * @param verdict The grader's answer.
 * @returns Each answered feature with the passages it cites.
 */
function foundFeatures(
	expected: readonly CitedFeature[],
	verdict: RunVerdict,
): { readonly entry: RunVerdict["features"][number]; readonly cites: readonly string[] }[] {
	const declared = new Map(expected.map((entry) => [entry.feature, entry.skill ?? []]));
	const answered = new Map(verdict.features.map((entry) => [entry.feature, entry]));
	// A waiver is surfaced as a waiver, whatever axis its finding names.
	return [...answered.values()].flatMap((entry) => {
		const cites = declared.get(entry.feature);
		return cites === undefined || entry.verdict === "not-applicable" ? [] : [{ entry, cites }];
	});
}

/**
 * The skill-axis findings whose passage the feature itself cites: the
 * grader called untaught what the scenario declares that passage teaches.
 * @param expected The scenario's checklist.
 * @param verdict The grader's answer.
 * @returns Each such finding, in answer order.
 */
function excusedDepartures(
	expected: readonly CitedFeature[],
	verdict: RunVerdict,
): ExcusedDeparture[] {
	return foundFeatures(expected, verdict).flatMap(({ entry, cites }) =>
		entry.finding?.axis === "skill" && citesPassage(cites, entry.finding.passage)
			? [{ feature: entry.feature, passage: entry.finding.passage, gap: entry.finding.gap }]
			: [],
	);
}

/**
 * The findings a verdict states about a scenario's features, by the authority
 * each answers to. A feature the grader answered twice counts once, by its
 * last answer, as compliance reads it. A skill-axis finding naming a passage
 * the feature cites counts as conformance: the scenario says that passage
 * teaches it, so the grader cannot excuse the run by calling it untaught.
 * @param expected The scenario's checklist, with each feature's citations.
 * @param verdict The grader's answer.
 * @returns The features carrying a finding on each axis.
 */
function findingsByAxis(
	expected: readonly CitedFeature[],
	verdict: RunVerdict,
): Readonly<Record<FindingAxis, string[]>> {
	const excused = new Set(excusedDepartures(expected, verdict).map((entry) => entry.feature));
	const found = foundFeatures(expected, verdict).map(({ entry }) => ({
		feature: entry.feature,
		axis: excused.has(entry.feature) ? "conformance" : entry.finding?.axis,
	}));
	return byAxis((axis) =>
		found.filter((entry) => entry.axis === axis).map((entry) => entry.feature),
	);
}

/**
 * Whether a run passed semantic compliance: every expected feature passed, or
 * failed only on the skill's account. A feature the skill never teaches is a
 * finding about the skill, so the run that did what the skill taught is not
 * failed for it; it is reported apart instead. A skill finding naming a
 * passage the feature cites is not on the skill's account (`findingsByAxis`).
 * @param expected The scenario's checklist, with each feature's citations.
 * @param verdict The grader's answer.
 * @returns True only when nothing is missing, incorrect, waived or unmentioned on the run's own account.
 */
function semanticallyCompliant(expected: readonly CitedFeature[], verdict: RunVerdict): boolean {
	const gaps = checklistGaps(expected, verdict);
	const onTheSkill = new Set(findingsByAxis(expected, verdict).skill);
	const answered = new Map(verdict.features.map((entry) => [entry.feature, entry.verdict]));
	return (
		gaps.waived.length === 0 &&
		gaps.unmentioned.length === 0 &&
		expected.every(
			(entry) => answered.get(entry.feature) === "pass" || onTheSkill.has(entry.feature),
		)
	);
}

export {
	FiledVerdictSchema,
	GRADER_OUTPUT_JSON_SCHEMA,
	GraderOutputSchema,
	NO_DELEGATION,
	checklistGaps,
	byAxis,
	checklistStanding,
	excusedDepartures,
	FINDING_AXES,
	findingsByAxis,
	graderPrompt,
	parseGraderOutput,
	semanticallyCompliant,
	visualStandingOf,
	type ChecklistStanding,
	type CitedFeature,
	type ExcusedDeparture,
	type FindingAxis,
	type GraderBrief,
	type GraderOutput,
	type RunVerdict,
	type VisualStanding,
};
