// The canonical evaluation inputs, as the harness reads them: the scenario
// index, the pins, each scenario's fixture and the coverage inventory. Every
// file is parsed strictly, so an entry the harness would not act on is refused
// at load time rather than silently graded as nothing.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
	BoardCreateInputSchema,
	ResolutionInputSchema,
	VariantEditInputSchema,
} from "@/shared/semantic-board/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";

const FLASK_REVISIONS = ["2.1.3", "2.2.0", "3.0.0"] as const;
const WORKFLOWS = [
	"architecture-create",
	"edit",
	"propose-compare",
	"sequence-create",
	"read",
] as const;
const GUARDRAILS = [
	"ids-stable",
	"config-untouched",
	"adopt-only-when-asked",
	"doing-on-writes",
	"no-writes",
] as const;
const ARMS = ["baseline", "candidate"] as const;

/** Every deterministic check the harness can run; outcomes.ts owns each. */
const CHECK_KINDS = [
	"render-ok",
	"check-clean",
	"inspect-group",
	"config-has",
	"nodes-named",
	"nodes-absent",
	"node-count-at-least",
	"node-count-between",
	"container-has-children",
	"binding-count-at-least",
	"no-edge-to-container-with-children",
	"edge-between",
	"no-edge-between",
	"node-binding",
	"node-groups",
	"node-parent",
	"node-kind",
	"node-field-equals",
	"node-drilldown",
	"edge-traffic",
	"node-id-retained",
	"node-field-retained",
	"edge-ids-retained",
	"version-advanced-by",
	"board-level",
	"board-count",
	"variant-exists",
	"current-variant",
	"current-untouched",
	"comparison-standing",
	"reconciliation-settled",
	"adoptions-count",
	"flow-with-steps",
	"flow-step-repeat",
	"view-exists",
	"walkthrough-beat-references",
	"walkthrough-beats-retained",
] as const;

const ScenarioIdSchema = z.string().regex(/^S\d{2}$/u);
const ExpectedFeatureSchema = z
	.object({ feature: z.string().min(1), requirement: z.string().min(1) })
	.strict();
const Names = z.array(z.string().min(1));
const PolicyRecord = z.record(z.string(), z.record(z.string(), z.unknown()));

/** A check as evals.json states it: its kind and the fields that kind reads. */
const OutcomeCheckSchema = z
	.object({
		check: z.enum(CHECK_KINDS),
		board: z.string().min(1).optional(),
		variant: z.string().min(1).optional(),
		level: z.string().optional(),
		names: Names.optional(),
		min: z.number().optional(),
		max: z.number().optional(),
		container: z.string().optional(),
		pathPrefix: z.string().optional(),
		pathIncludes: z.string().optional(),
		node: z.string().optional(),
		fields: Names.optional(),
		field: z.string().optional(),
		expected: z.unknown().optional(),
		from: z.string().optional(),
		to: z.string().optional(),
		kind: z.string().optional(),
		/** edge-between: the ends match the named node or any node contained in it. */
		includeContained: z.boolean().optional(),
		lifecycle: z.enum(["current", "draft", "historical"]).optional(),
		/** Subjects of every kind: nodes, relationships, flows and walkthroughs together. */
		removed: z.number().optional(),
		addedAtLeast: z.number().optional(),
		/** Nodes alone, so a replaced relationship does not count as a removed part. */
		removedNodes: z.number().optional(),
		addedNodesAtLeast: z.number().optional(),
		withReason: z.boolean().optional(),
		view: z.string().optional(),
		grammar: z.enum(["architecture", "data-flow"]).optional(),
		edgesSelected: z.number().optional(),
		nodesSelectedAtLeast: z.number().optional(),
		groups: Names.optional(),
		parent: z.string().optional(),
		group: z.string().optional(),
		membersInclude: Names.optional(),
		membersExclude: Names.optional(),
		target: z.string().optional(),
		variantKind: z.enum(["named", "current"]).optional(),
		variantName: z.string().optional(),
		traffic: z
			.union([
				z.literal("off"),
				z.literal("default"),
				z.object({ speed: z.number().optional(), volume: z.number().optional() }).strict(),
			])
			.optional(),
		flow: z.string().optional(),
		minSteps: z.number().optional(),
		kinds: Names.optional(),
		minRepeat: z.number().optional(),
		withNote: z.boolean().optional(),
		walkthrough: z.string().optional(),
		minBeats: z.number().optional(),
		subjectKinds: Names.optional(),
		subjectNames: Names.optional(),
		relationshipKinds: PolicyRecord.optional(),
		nodeKinds: PolicyRecord.optional(),
		configuredGroups: PolicyRecord.optional(),
	})
	.strict();
type OutcomeCheck = z.infer<typeof OutcomeCheckSchema>;

/**
 * One bitmap the harness takes of a final diagram after the author ran,
 * whatever the checks ask for: the boards, views and variants the request
 * names, so the grader looks at what was asked for and never at a default
 * picture in its place. `grammar` states which picture the view must draw;
 * a capture that answers another grammar is a failed capture.
 */
const CaptureDeclarationSchema = z
	.object({
		label: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
		board: z.string().min(1),
		variant: z.string().min(1).optional(),
		view: z.string().min(1).optional(),
		grammar: z.enum(["architecture", "data-flow"]).optional(),
	})
	.strict();
type CaptureDeclaration = z.infer<typeof CaptureDeclarationSchema>;

const ScenarioSchema = z
	.object({
		id: ScenarioIdSchema,
		name: z.string().min(1),
		report: z.enum(["primary", "broad"]),
		workflow: z.enum(WORKFLOWS),
		flask: z.enum(FLASK_REVISIONS),
		fixture: z.string().min(1),
		sources: Names.min(1),
		prompt: z.string().min(1),
		expectedFeatures: z.array(ExpectedFeatureSchema).min(1),
		outcomes: z.array(OutcomeCheckSchema).min(1),
		guardrails: z.array(z.enum(GUARDRAILS)),
		/** Files of the skill, relative to its root, an author of this scenario is expected to read. */
		guidance: z.array(z.string().min(1)),
		captures: z.array(CaptureDeclarationSchema).min(1),
	})
	.strict();
type Scenario = z.infer<typeof ScenarioSchema>;

const SuiteSchema = z
	.object({
		skill_name: z.literal("archboard"),
		schemaVersion: z.literal(3),
		grading: z.string(),
		pins: z.string(),
		coverage: z.string(),
		rubric: z.string(),
		evals: z.array(ScenarioSchema).min(1),
	})
	.strict()
	.refine((suite) => new Set(suite.evals.map((e) => e.id)).size === suite.evals.length, {
		message: "scenario ids must be unique",
	});
type Suite = z.infer<typeof SuiteSchema>;

const ModelPinSchema = z
	.object({
		model: z.string().min(1),
		reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
		sandbox: z.enum(["read-only", "workspace-write", "danger-full-access"]),
		approvalPolicy: z.literal("never"),
	})
	.passthrough();
const PinsSchema = z
	.object({
		flask: z
			.object({
				repository: z.string().url(),
				revisions: z.record(z.enum(FLASK_REVISIONS), z.string().regex(/^[0-9a-f]{40}$/u)),
			})
			.passthrough(),
		codex: z
			.object({
				executable: z.string().min(1),
				version: z.string().min(1),
				author: ModelPinSchema,
			})
			.passthrough(),
		repetitions: z.int().min(1),
		defaultConcurrency: z.int().min(1),
		baselineSkill: z.object({ location: z.string().min(1) }).passthrough(),
	})
	.passthrough();
type Pins = z.infer<typeof PinsSchema>;

/** The names a grader runner can have; `--grader` chooses one when grading runs. */
const GRADER_NAMES = ["codex", "claude"] as const;
type GraderName = (typeof GRADER_NAMES)[number];
const CodexGraderSchema = z
	.object({
		executable: z.string().min(1),
		version: z.string().min(1),
		model: z.string().min(1),
		reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]),
		sandbox: z.literal("read-only"),
		approvalPolicy: z.literal("never"),
	})
	.passthrough();
const ClaudeGraderSchema = z
	.object({
		executable: z.string().min(1),
		version: z.string().min(1),
		model: z.string().min(1),
		effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
		tools: z.array(z.string().min(1)).min(1),
		settingSources: z.array(z.enum(["user", "project", "local"])),
		strictMcpConfig: z.literal(true),
	})
	.passthrough();
/** What each grader runner holds constant; outside the batch input digest by design. */
const GradersSchema = z
	.object({ codex: CodexGraderSchema, claude: ClaudeGraderSchema })
	.passthrough();
type Graders = z.infer<typeof GradersSchema>;

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

const FixtureSchema = z
	.object({
		$comment: z.string().optional(),
		registerRepo: z.boolean(),
		policy: SemanticPolicySchema.partial().optional(),
		steps: z.array(RawFixtureStepSchema),
	})
	.strict();
type Fixture = z.infer<typeof FixtureSchema>;

const CoverageEntrySchema = z
	.object({
		path: z.string().min(1),
		expectedUse: z.string().min(1),
		scenarios: z.array(ScenarioIdSchema),
		evidence: z.enum(["author-run", "harness-check", "grader", "runtime-owner"]),
		owner: z.string().min(1),
	})
	.strict();
const CoverageSchema = z
	.object({
		$comment: z.string().optional(),
		parts: z
			.array(
				z
					.object({
						part: z.int().min(1).max(14),
						title: z.string().min(1),
						entries: z.array(CoverageEntrySchema).min(1),
					})
					.strict(),
			)
			.min(14),
	})
	.strict();
type Coverage = z.infer<typeof CoverageSchema>;

/** Everything the canonical directory holds, loaded and validated together. */
interface LoadedSuite {
	readonly directory: string;
	readonly suite: Suite;
	readonly pins: Pins;
	/** The grader runners; never part of a batch's identity. */
	readonly graders: Graders;
	readonly coverage: Coverage;
	readonly rubric: string;
	readonly fixtures: ReadonlyMap<string, Fixture>;
}

/**
 * One JSON file, parsed by a schema, with the file named in any refusal.
 * @param file The file's path.
 * @param schema What it must be.
 * @returns The parsed value.
 */
function readJson<T>(file: string, schema: z.ZodType<T>): T {
	const parsed = schema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
	if (!parsed.success) throw new Error(`${file}: ${z.prettifyError(parsed.error)}`);
	return parsed.data;
}

/**
 * Scenarios whose fixture file is missing.
 * @param loaded The loaded suite.
 * @returns Problems, one line each.
 */
function fixtureProblems(loaded: LoadedSuite): string[] {
	return loaded.suite.evals
		.filter((scenario) => !loaded.fixtures.has(scenario.id))
		.map((scenario) => `${scenario.id}: fixture ${scenario.fixture} is missing`);
}

/**
 * Inventory parts that are absent and coverage entries naming unknown scenarios.
 * @param loaded The loaded suite.
 * @returns Problems, one line each.
 */
function coverageProblems(loaded: LoadedSuite): string[] {
	const ids = new Set(loaded.suite.evals.map((scenario) => scenario.id));
	const parts = new Set(loaded.coverage.parts.map((part) => part.part));
	const missingParts = Array.from({ length: 14 }, (_, index) => index + 1)
		.filter((part) => !parts.has(part))
		.map((part) => `coverage: part ${part} is missing`);
	const unknown = loaded.coverage.parts.flatMap((part) =>
		part.entries.flatMap((entry) =>
			entry.scenarios
				.filter((id) => !ids.has(id))
				.map((id) => `coverage ${part.part} ${entry.path}: unknown scenario ${id}`),
		),
	);
	return [...missingParts, ...unknown];
}

/**
 * Scenarios naming guidance the canonical skill does not carry.
 * @param loaded The loaded suite.
 * @returns Problems, one line each.
 */
function guidanceProblems(loaded: LoadedSuite): string[] {
	const skill = path.join(loaded.directory, "..", "skills", "archboard");
	return loaded.suite.evals.flatMap((scenario) =>
		scenario.guidance
			.filter((file) => !fs.existsSync(path.join(skill, file)))
			.map((file) => `${scenario.id}: guidance ${file} is not in the skill`),
	);
}

/**
 * The problems a suite has beyond each file's own shape. Empty when whole.
 * @param loaded The loaded suite.
 * @returns Problems, each one line.
 */
function suiteProblems(loaded: LoadedSuite): string[] {
	return [...fixtureProblems(loaded), ...coverageProblems(loaded), ...guidanceProblems(loaded)];
}

/**
 * Loads the canonical evaluation directory and refuses it when it is not whole.
 * @param directory Where evals.json lives.
 * @returns Every input, validated.
 */
function loadSuite(directory: string): LoadedSuite {
	const suite = readJson(path.join(directory, "evals.json"), SuiteSchema);
	const pins = readJson(path.join(directory, suite.pins), PinsSchema);
	const graders = readJson(path.join(directory, "graders.json"), GradersSchema);
	const coverage = readJson(path.join(directory, suite.coverage), CoverageSchema);
	const rubric = fs.readFileSync(path.join(directory, suite.rubric), "utf8");
	const fixtures = new Map<string, Fixture>();
	for (const scenario of suite.evals) {
		const file = path.join(directory, scenario.fixture);
		if (fs.existsSync(file)) fixtures.set(scenario.id, readJson(file, FixtureSchema));
	}
	const loaded: LoadedSuite = { directory, suite, pins, graders, coverage, rubric, fixtures };
	const problems = suiteProblems(loaded);
	if (problems.length > 0)
		throw new Error(`${directory} is not a whole suite:\n${problems.join("\n")}`);
	return loaded;
}

export {
	ARMS,
	CHECK_KINDS,
	FLASK_REVISIONS,
	GUARDRAILS,
	WORKFLOWS,
	CaptureDeclarationSchema,
	type CaptureDeclaration,
	CoverageSchema,
	FixtureSchema,
	FixtureStepSchema,
	OutcomeCheckSchema,
	RawFixtureStepSchema,
	GRADER_NAMES,
	GradersSchema,
	PinsSchema,
	ScenarioSchema,
	SuiteSchema,
	loadSuite,
	suiteProblems,
	type Coverage,
	type Fixture,
	type FixtureStep,
	type GraderName,
	type Graders,
	type LoadedSuite,
	type OutcomeCheck,
	type Pins,
	type RawFixtureStep,
	type Scenario,
	type Suite,
};
