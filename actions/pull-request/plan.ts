// Which proposal a pull request carries, what its footprint says about the plan, and whether that
// fails the step. Pure: the entry reads the CLI and the event, and these functions only decide.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import type { BodyMarker } from "./marker.ts";

/** A state of the model, as `archboard model proposals` lists it. */
interface ModelState {
	readonly id: string;
	readonly name: string;
	readonly summary?: string | undefined;
	readonly lifecycle: string;
}

/** Where the proposal came from, or why there is none. */
type StateSource = "input" | "pr-body" | "only-draft" | "none" | "several-drafts" | "unknown";

/** The proposal a pull request carries. */
interface StateChoice {
	readonly state?: ModelState | undefined;
	readonly source: StateSource;
	/** For `unknown`, the name that matched no state. */
	readonly named?: string | undefined;
}

/**
 * Find a state by identity, else by exact name.
 * @param states The states of the model.
 * @param wanted An identity or a name.
 * @returns The state, or undefined.
 */
function findState(states: readonly ModelState[], wanted: string): ModelState | undefined {
	return (
		states.find((state) => state.id === wanted) ?? states.find((state) => state.name === wanted)
	);
}

/**
 * The state name that the input or the body's marker gives, input first.
 * @param input The `state` input, or an empty string.
 * @param marker The marker of the pull request body.
 * @returns The name and where it came from, or undefined when neither gives one.
 */
function namedState(
	input: string,
	marker: BodyMarker | undefined,
): { name: string; source: "input" | "pr-body" } | undefined {
	if (input !== "") return { name: input, source: "input" };
	return marker?.state === undefined ? undefined : { name: marker.state, source: "pr-body" };
}

/**
 * Choose the proposal: the `state` input, else the one the body's marker names, else the only
 * draft the model has, else none.
 * @param input The `state` input, or an empty string.
 * @param marker The marker of the pull request body.
 * @param states The states of the model at the pull request's head.
 * @returns The choice, with where it came from.
 */
function chooseState(
	input: string,
	marker: BodyMarker | undefined,
	states: readonly ModelState[],
): StateChoice {
	const named = namedState(input, marker);
	if (named !== undefined) {
		const state = findState(states, named.name);
		return state === undefined
			? { source: "unknown", named: named.name }
			: { state, source: named.source };
	}
	const drafts = states.filter((state) => state.lifecycle === "draft");
	if (drafts.length === 1) return { state: drafts[0], source: "only-draft" };
	return { source: drafts.length === 0 ? "none" : "several-drafts" };
}

/** What `out-of-plan` can say. */
type OutOfPlanMode = "warn" | "fail" | "off";

/**
 * Read the `out-of-plan` input.
 * @param value The input.
 * @returns The mode.
 * @throws {Error} When the value is not warn, fail or off.
 */
function parseOutOfPlanMode(value: string): OutOfPlanMode {
	if (value === "warn" || value === "fail" || value === "off") return value;
	throw new Error(`out-of-plan is "${value}". Use "warn", "fail" or "off".`);
}

/**
 * - `off`: the configuration asks for no judgement.
 * - `no-proposal`: the pull request carries no proposal, so no change is outside a plan.
 * - `unjudged`: the footprint could not be read.
 * - `in-plan`: every changed module is in the plan.
 * - `warn`, `fail`: modules changed outside the plan, and the mode says how loudly.
 * - `overridden`: modules changed outside the plan, and the override label lets the pull request through.
 */
type OutOfPlanStatus =
	| "off"
	| "no-proposal"
	| "unjudged"
	| "in-plan"
	| "warn"
	| "fail"
	| "overridden";

/** What the plan check decided. */
interface OutOfPlanDecision {
	readonly status: OutOfPlanStatus;
	/** Whether the step fails. */
	readonly failed: boolean;
}

/** What the plan check reads. */
interface PlanFacts {
	/** The `out-of-plan` input. */
	readonly mode: OutOfPlanMode;
	readonly hasProposal: boolean;
	/** Whether the footprint could be read. */
	readonly footprintRead: boolean;
	/** The names of the modules that changed outside the plan. */
	readonly outside: readonly string[];
	readonly labels: readonly string[];
	/** The label that lets a pull request through. */
	readonly overrideLabel: string;
}

/**
 * The status of a pull request that has nothing to judge.
 * @param facts What the pull request carries.
 * @returns The status, or undefined when modules changed outside a plan.
 */
function statusWithoutJudgement(facts: PlanFacts): OutOfPlanStatus | undefined {
	if (facts.mode === "off") return "off";
	if (!facts.hasProposal) return "no-proposal";
	if (!facts.footprintRead) return "unjudged";
	return facts.outside.length === 0 ? "in-plan" : undefined;
}

/**
 * Decide what modules changed outside the plan mean for the step.
 * @param facts What the pull request carries.
 * @returns The status and whether the step fails.
 */
function decideOutOfPlan(facts: PlanFacts): OutOfPlanDecision {
	const unjudged = statusWithoutJudgement(facts);
	if (unjudged !== undefined) return { status: unjudged, failed: false };
	if (facts.mode === "warn") return { status: "warn", failed: false };
	return facts.labels.includes(facts.overrideLabel)
		? { status: "overridden", failed: false }
		: { status: "fail", failed: true };
}

/** The part of a footprint answer that names modules. */
interface FootprintPart {
	readonly subject: { readonly name: string };
}

/** The part of a footprint answer the action reads. Either the three buckets or one list. */
interface FootprintReading {
	readonly proposal?: { readonly id: string; readonly name: string } | null | undefined;
	readonly namedAndChanged?: readonly FootprintPart[] | undefined;
	readonly changedNotNamed?: readonly FootprintPart[] | undefined;
	readonly namedNotChanged?: readonly FootprintPart[] | undefined;
	readonly changed?: readonly FootprintPart[] | undefined;
}

/** The module names of each bucket, in the order the answer gives them. */
interface Buckets {
	readonly plannedAndChanged: readonly string[];
	readonly outsidePlan: readonly string[];
	readonly plannedUnchanged: readonly string[];
	/** With no proposal, every changed module. */
	readonly changed: readonly string[];
}

/**
 * The names of a list of parts, each module once.
 * @param parts The parts.
 * @returns The distinct names.
 */
function names(parts: readonly FootprintPart[] | undefined): string[] {
	return [...new Set((parts ?? []).map((part) => part.subject.name))];
}

/**
 * Read the buckets of a footprint.
 * @param footprint The answer of `model footprint`.
 * @returns The module names of each bucket.
 */
function readBuckets(footprint: FootprintReading): Buckets {
	return {
		plannedAndChanged: names(footprint.namedAndChanged),
		outsidePlan: names(footprint.changedNotNamed),
		plannedUnchanged: names(footprint.namedNotChanged),
		changed: names(footprint.changed),
	};
}

/** The part of a comparison answer the action counts. */
interface ComparisonReading {
	readonly comparison?:
		| {
				readonly subjects?:
					| readonly { readonly subjectKind: string; readonly kind: string }[]
					| undefined;
		  }
		| undefined;
}

/** One subject of a comparison. */
type ComparedSubject = NonNullable<
	NonNullable<ComparisonReading["comparison"]>["subjects"]
>[number];

/**
 * Count the subjects of one kind by what became of them.
 * @param subjects The changed subjects of one kind.
 * @returns A phrase such as "2 added, 1 changed".
 */
function tally(subjects: readonly ComparedSubject[]): string {
	const outcomes = [...new Set(subjects.map((subject) => subject.kind))];
	return outcomes
		.map((outcome) => `${String(subjects.filter((one) => one.kind === outcome).length)} ${outcome}`)
		.join(", ");
}

/**
 * Count what a proposal changes: for each kind of subject, how many were added, removed or changed.
 * @param answer The answer of `model compare`.
 * @returns One phrase for each kind of subject that has a change, such as "modules: 2 added, 1 changed".
 */
function describeComparison(answer: ComparisonReading): string[] {
	const changed = (answer.comparison?.subjects ?? []).filter(
		(subject) => subject.kind !== "unchanged",
	);
	return [...new Set(changed.map((subject) => subject.subjectKind))].map(
		(kind) => `${kind}s: ${tally(changed.filter((subject) => subject.subjectKind === kind))}`,
	);
}

export {
	chooseState,
	decideOutOfPlan,
	describeComparison,
	parseOutOfPlanMode,
	readBuckets,
	type Buckets,
	type ComparisonReading,
	type FootprintReading,
	type ModelState,
	type OutOfPlanDecision,
	type OutOfPlanMode,
	type OutOfPlanStatus,
	type StateChoice,
	type StateSource,
};
