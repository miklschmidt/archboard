// Which proposal a pull request carries, and whether changes outside its plan fail the step. Pure: the entry reads the CLI and the event, and these functions only decide.

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
 * - `unjudged`: the proposals, the plan or the footprint could not be read, or the pull request
 *   names a proposal that the model does not have. In fail mode the step fails, because a gate
 *   that cannot judge must not pass.
 * - `unjudged-overridden`: the same, and the override label lets the pull request through.
 * - `in-plan`: every changed module is in the plan.
 * - `warn`, `fail`: modules changed outside the plan, and the mode says how loudly.
 * - `overridden`: modules changed outside the plan, and the override label lets the pull request through.
 */
type OutOfPlanStatus =
	| "off"
	| "no-proposal"
	| "unjudged"
	| "unjudged-overridden"
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
	/** Whether the pull request carries a proposal or names one. */
	readonly hasProposal: boolean;
	/** Whether the proposal, its plan and the footprint could all be read. */
	readonly judgeable: boolean;
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
	if (!facts.judgeable) return "unjudged";
	return facts.outside.length === 0 ? "in-plan" : undefined;
}

/** The status that the override label turns each blocking status into. */
const OVERRIDDEN = { fail: "overridden", unjudged: "unjudged-overridden" } as const;

/**
 * The status that blocks the pull request in fail mode: modules changed outside the plan, or a
 * plan that cannot be checked.
 * @param facts What the pull request carries.
 * @returns The status, or undefined when nothing blocks.
 */
function blockingStatus(facts: PlanFacts): keyof typeof OVERRIDDEN | undefined {
	if (facts.mode !== "fail") return undefined;
	const status = statusWithoutJudgement(facts);
	if (status === undefined) return "fail";
	return status === "unjudged" ? "unjudged" : undefined;
}

/**
 * Decide what modules changed outside the plan mean for the step.
 * @param facts What the pull request carries.
 * @returns The status and whether the step fails.
 */
function decideOutOfPlan(facts: PlanFacts): OutOfPlanDecision {
	const blocking = blockingStatus(facts);
	if (blocking === undefined) {
		return { status: statusWithoutJudgement(facts) ?? "warn", failed: false };
	}
	return facts.labels.includes(facts.overrideLabel)
		? { status: OVERRIDDEN[blocking], failed: false }
		: { status: blocking, failed: true };
}

export {
	chooseState,
	decideOutOfPlan,
	parseOutOfPlanMode,
	type ModelState,
	type OutOfPlanDecision,
	type OutOfPlanMode,
	type OutOfPlanStatus,
	type StateChoice,
	type StateSource,
};
