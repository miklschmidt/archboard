// The on-demand evaluation of the archboard skill: real Codex authors on real
// Flask checkouts, one blinded grader run by Codex or by Claude Code, chosen
// when grading runs, deterministic checks and a comparison report. Never part
// of the fast gate; `bun run eval:skill` is the entry.

export { executeRun, statusOf, type RunJob } from "@/runtime/skill-evaluation/lib/author";
export { digestOf, installSkill, type InstallRecord } from "@/runtime/skill-evaluation/lib/install";
export { checkoutFlask } from "@/runtime/skill-evaluation/lib/flask";
export { startCanvas } from "@/runtime/skill-evaluation/lib/canvas";
export { landingProblems } from "@/runtime/skill-evaluation/lib/landings";
export { leakageProblems } from "@/runtime/skill-evaluation/lib/leakage";
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
	guidanceFilesRead,
	guidanceStanding,
	parseTrace,
	unwrapped,
	usageFrom,
	type AuthorTrace,
	type ClassificationContext,
	type ClassifiedCommand,
	type CommandClass,
	type CommandRecord,
	type GuidanceStanding,
	type Usage,
} from "@/runtime/skill-evaluation/lib/events";
export {
	BATCH_SKILL_DIRECTORY,
	keepBatchSkill,
	CATALOGUE_PASSAGE,
	CATALOGUE_ROWS,
	CITATION_PATTERN,
	RUBRIC_SECTIONS,
	anchorsOf,
	catalogueProblems,
	catalogueRowsOf,
	citationProblem,
	headingAnchor,
	rubricSectionProblems,
	type CatalogueRow,
} from "@/runtime/skill-evaluation/lib/citations";
export {
	FINDING_AXES,
	GRADER_OUTPUT_JSON_SCHEMA,
	FiledVerdictSchema,
	GraderOutputSchema,
	NO_DELEGATION,
	checklistGaps,
	checklistStanding,
	findingsByAxis,
	graderPrompt,
	parseGraderOutput,
	semanticallyCompliant,
	visualStandingOf,
	type ChecklistStanding,
	type FindingAxis,
	type GraderBrief,
	type GraderOutput,
	type RunVerdict,
	type VisualStanding,
} from "@/runtime/skill-evaluation/lib/grader";
export {
	bundledRuns,
	filedVerdict,
	gradeBatch,
	graderIdentity,
	graderUsage,
	type GradingOptions,
} from "@/runtime/skill-evaluation/lib/grading-run";
export type { GraderIdentity } from "@/runtime/skill-evaluation/lib/grader-runner";
export { availableGraders, graderLayout } from "@/runtime/skill-evaluation/lib/grader-layout";
export {
	pinVersions,
	type PinChange,
	type PinTools,
} from "@/runtime/skill-evaluation/lib/pin-versions";
export { executableVersion } from "@/runtime/skill-evaluation/lib/version";
export {
	agreementLines,
	agreementOf,
	type Agreement,
	type RunAgreement,
} from "@/runtime/skill-evaluation/lib/report-agreement";
export {
	evaluateGuardrails,
	type GuardrailContext,
} from "@/runtime/skill-evaluation/lib/guardrails";
export {
	authorConfigToml,
	graderConfigToml,
	prepareRunDirectory,
	runEnvironment,
	type RunPaths,
} from "@/runtime/skill-evaluation/lib/isolation";
export {
	matchName,
	namedSubject,
	namesMatch,
	plausibleSubjects,
	type NameMatch,
} from "@/runtime/skill-evaluation/lib/naming";
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
	buildBatchReport,
	readManifests,
	recordOf,
	writeReport,
	type RunManifest,
} from "@/runtime/skill-evaluation/lib/records";
export {
	RunManifestSchema,
	writeRunManifest,
	type RunManifestFields,
} from "@/runtime/skill-evaluation/lib/run-manifest";
export {
	answeredOffChecklist,
	buildReport,
	median,
	mean,
	succeeded,
	sumUsage,
	summarize,
	type ArmSummary,
	type BatchReport,
	type ChecklistAnswer,
	type ComparisonRow,
	type ConcernKind,
	type GraderReport,
	type RaisedConcern,
	type SkillDisagreement,
	type Report,
	type RunRecord,
} from "@/runtime/skill-evaluation/lib/report";
export {
	pairedNoise,
	axisChanges,
	changeOf,
	countChanges,
	directionOf,
	standingOf,
	type AxisChange,
	type CountChange,
	type Direction,
	type QualityAxis,
	type QualityChange,
	type QualityCount,
	type Standing,
	type UnassessedReason,
} from "@/runtime/skill-evaluation/lib/report-change";
export {
	CAPTURE_TILE_SIDE_PX,
	captureDeclared,
	captureFromReceipt,
	captureSummary,
	expandCaptures,
	tileRegions,
	type CaptureAttempt,
	type CaptureProvenance,
	type CaptureSummary,
	type CaptureTile,
} from "@/runtime/skill-evaluation/lib/captures";
export {
	ARMS,
	FLASK_REVISIONS,
	GRADER_NAMES,
	GradersSchema,
	type GraderName,
	type Graders,
	GUARDRAILS,
	WORKFLOWS,
	CaptureDeclarationSchema,
	CaptureRequestSchema,
	EveryViewCaptureSchema,
	type CaptureDeclaration,
	type CaptureRequest,
	type EveryViewCapture,
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
export {
	renderBatchReportMarkdown,
	renderReportMarkdown,
} from "@/runtime/skill-evaluation/lib/report-markdown";
