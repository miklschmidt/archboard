import type { FlowStep, SemanticFlow } from "#shared/schemas/views.ts";
import type { ThreeStates } from "#shared/rules/reconcile/variant.ts";
import { flatSteps, type FlatStep } from "#shared/rules/flow-steps.ts";
import { toldFlow } from "#shared/rules/reconcile/flow.ts";
import {
	settledEntries,
	orderOf,
	afterAnchor,
	TOLD_FIELDS,
	type OrderedIssue,
} from "#shared/rules/reconcile/told-order.ts";
type PlacedStep = FlatStep & {
	readonly within: NonNullable<FlatStep["within"]> & { readonly flow: string };
};
/**
 * Give every continuing step its explicit flow ownership before field reconciliation.
 * @param flows One side's complete independent flows.
 * @returns The global identity list, with nested holders unchanged.
 */
function allFlowSteps(flows: readonly SemanticFlow[]): PlacedStep[] {
	return flows.flatMap((flow) =>
		flatSteps(flow.steps).map((step) => ({
			...step,
			within: { step: flow.id, ...step.within, flow: flow.id },
		})),
	);
}
/**
 * Put inherited arrivals where the predecessor told them in their destination flow.
 * @param entries The field-merged steps of one flow.
 * @param mine The original proposal steps in that flow.
 * @param theirs The predecessor steps in that flow.
 * @returns The steps with arrivals placed by existing relative-anchor rules.
 */
function flowArrivals(
	entries: FlatStep[],
	mine: readonly FlatStep[],
	theirs: readonly FlatStep[],
): FlatStep[] {
	const own = new Set(mine.map((step) => step.id));
	const arrivals = entries.filter((step) => !own.has(step.id));
	const result = entries.filter((step) => own.has(step.id));
	for (const incoming of theirs) {
		const entry = arrivals.find((step) => step.id === incoming.id);
		if (entry !== undefined)
			result.splice(afterAnchor(theirs, theirs.indexOf(incoming), result), 0, entry);
	}
	return result;
}
/**
 * Order globally reconciled identities inside one explicit flow.
 * @param states The complete three-way semantic states.
 * @param flow The merged flow metadata.
 * @param merged The globally field-merged steps and issues.
 * @param merged.entries The continuing global step identities.
 * @param merged.issues The field disagreements carried by those steps.
 * @returns The coherent flow contents and issues.
 */
function reconcileFlow(
	states: ThreeStates,
	flow: SemanticFlow,
	merged: { entries: PlacedStep[]; issues: OrderedIssue[] },
) {
	const base = flatSteps(stepsIn(states.base.flows, flow.id));
	const mine = stepsIn(states.mine.flows, flow.id),
		theirs = stepsIn(states.theirs.flows, flow.id);
	const entries = merged.entries
		.filter((step) => step.within.flow === flow.id)
		.map(({ within: { flow: _flow, ...within }, ...step }) =>
			within.step === flow.id ? step : { ...step, within },
		);
	const arrivals = flowArrivals(entries, flatSteps(mine), flatSteps(theirs));
	const ordered = orderOf(
		{
			base: base.map((step) => step.id),
			mine: arrivals.map((step) => step.id),
			theirs: flatSteps(theirs).map((step) => step.id),
		},
		"step",
	);
	const byId = new Map(arrivals.map((step) => [step.id, step]));
	const relevant = new Set(
		[...base, ...flatSteps(mine), ...flatSteps(theirs)].map((step) => step.id),
	);
	const issues = merged.issues.filter((issue) => relevant.has(issue.subject));
	const told = toldFlow({
		flow,
		entries: ordered.ids.map((id) => byId.get(id)!),
		issues: [...issues, ...ordered.issues],
		base,
		mine,
		theirs,
	});
	return { flow: { ...flow, steps: told.steps }, issues: told.issues };
}
/**
 * Merge step identity and fields across flows before ordering each held sequence.
 * @param states The complete three-way semantic states.
 * @param flows The merged flow metadata.
 * @returns The complete flows and all continuing step disagreements.
 */
function reconcileFlows(states: ThreeStates, flows: readonly SemanticFlow[]) {
	const merged = settledEntries<PlacedStep>(
		{
			base: allFlowSteps(states.base.flows),
			mine: allFlowSteps(states.mine.flows),
			theirs: allFlowSteps(states.theirs.flows),
		},
		TOLD_FIELDS.step,
		"step",
	);
	const reconciled = flows.map((flow) => reconcileFlow(states, flow, merged));
	const issues = reconciled.flatMap((result) => result.issues);
	return {
		flows: reconciled.map((result) => result.flow),
		issues: [...new Map(issues.map((issue) => [JSON.stringify(issue), issue])).values()],
	};
}
/**
 * One flow's steps in one state.
 * @param flows That state's flows.
 * @param id The flow.
 * @returns Its steps, or none when that state has no such flow.
 */
function stepsIn(flows: readonly SemanticFlow[], id: string): readonly FlowStep[] {
	return flows.find((flow) => flow.id === id)?.steps ?? [];
}

export { reconcileFlows };
