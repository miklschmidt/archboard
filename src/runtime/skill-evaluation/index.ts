// The on-demand evaluation of the archboard skill: real Codex authors on real
// Flask checkouts, one blinded grader, deterministic checks and a comparison
// report. Never part of the fast gate; `bun run eval:skill` is the entry.

export { executeRun, statusOf, type RunJob } from "@/runtime/skill-evaluation/lib/author";
export { checkoutFlask } from "@/runtime/skill-evaluation/lib/flask";
export { startCanvas } from "@/runtime/skill-evaluation/lib/canvas";
export {
	ownProcess,
	runProcess,
	type ProcessRequest,
	type ProcessResult,
} from "@/runtime/skill-evaluation/lib/process";
export {
	planJobs,
	resumeSelection,
	runBatch,
	type BatchOptions,
} from "@/runtime/skill-evaluation/lib/batch";
export {
	assertBatchInputs,
	assertProvenance,
	batchProvenance,
	inputDigest,
	type Provenance,
} from "@/runtime/skill-evaluation/lib/provenance";
export {
	anonymousRunId,
	bundleForGrader,
	redacted,
	type Arm,
	type BundledCapture,
	type CompletedRun,
	type RunBundle,
	type RunStatus,
} from "@/runtime/skill-evaluation/lib/blind";
export {
	classCounts,
	classifyCommands,
	parseTrace,
	unwrapped,
	usageFrom,
	type AuthorTrace,
	type ClassificationContext,
	type ClassifiedCommand,
	type CommandClass,
	type CommandRecord,
	type Usage,
} from "@/runtime/skill-evaluation/lib/events";
export {
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
} from "@/runtime/skill-evaluation/lib/grader";
export {
	bundledRuns,
	filedVerdict,
	gradeBatch,
	graderUsage,
	type GradingOptions,
} from "@/runtime/skill-evaluation/lib/grading-run";
export {
	evaluateGuardrails,
	type GuardrailContext,
} from "@/runtime/skill-evaluation/lib/guardrails";
export {
	authorConfigToml,
	graderConfigToml,
	runEnvironment,
	type RunPaths,
} from "@/runtime/skill-evaluation/lib/isolation";
export {
	KNOWN_CHECKS,
	evaluateOutcomes,
	inspectionRequests,
	renderRequests,
	type InspectionRequest,
	type OutcomeCheck,
	type RenderRequest,
} from "@/runtime/skill-evaluation/lib/outcomes";
export type {
	CheckVerdict,
	InspectionAttempt,
	Reading,
	RenderAttempt,
} from "@/runtime/skill-evaluation/lib/reading";
export {
	readManifests,
	recordOf,
	writeReport,
	type RunManifest,
} from "@/runtime/skill-evaluation/lib/records";
export {
	buildReport,
	median,
	mean,
	renderReportMarkdown,
	succeeded,
	sumUsage,
	summarize,
	type ArmSummary,
	type ComparisonRow,
	type Report,
	type RunRecord,
} from "@/runtime/skill-evaluation/lib/report";
export {
	CAPTURE_TILE_SIDE_PX,
	captureDeclared,
	captureFromReceipt,
	captureSummary,
	tileRegions,
	type CaptureAttempt,
	type CaptureProvenance,
	type CaptureSummary,
	type CaptureTile,
} from "@/runtime/skill-evaluation/lib/captures";
export {
	ARMS,
	FLASK_REVISIONS,
	GUARDRAILS,
	WORKFLOWS,
	CaptureDeclarationSchema,
	type CaptureDeclaration,
	CoverageSchema,
	FixtureSchema,
	FixtureStepSchema,
	RawFixtureStepSchema,
	PinsSchema,
	ScenarioSchema,
	SuiteSchema,
	loadSuite,
	suiteProblems,
	type Coverage,
	type Fixture,
	type FixtureStep,
	type LoadedSuite,
	type Pins,
	type RawFixtureStep,
	type Scenario,
	type Suite,
} from "@/runtime/skill-evaluation/lib/suite";
export {
	resolvePlaceholders,
	stepCommand,
	type PlaceholderScope,
} from "@/runtime/skill-evaluation/lib/vault";
