import { ModelStateHistory } from "#ui/components/architecture-model/ModelStateHistory.tsx";
import { useCallback, useMemo, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import { Standing } from "#ui/components/semantic-board-canvas/SemanticInspectorStanding.tsx";
import type { useModelComparison } from "#ui/hooks/architecture-model/use-model-comparison.ts";
import type { Model } from "@archboard/board/content";
import { proposalStanding } from "#ui/rules/architecture-model/standing.ts";
import { ModelReconciliation } from "#ui/components/architecture-model/ModelReconciliation.tsx";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import {
	changedCount,
	namedField,
	reviewsChanges,
} from "#ui/rules/architecture-model/change-list.ts";
import { AFTER } from "#ui/rules/architecture-model/comparison-intent.ts";

/**
 * What the selected state says of itself, inside its entry on the timeline. The selected state,
 * not its retained manifest, decides whether a reading is implemented.
 * @param props The coherent materialized reading.
 * @param props.model Its state metadata and semantic comparison.
 * @param props.paneId The pane that owns deliberate ancestor navigation.
 * @param props.states The catalogue that names retained ancestors.
 * @returns Explicit lifecycle and history on the About page.
 */
function ModelStateDetails({
	model,
	paneId,
	states,
}: {
	model: Model;
	paneId: string;
	states: Readonly<NonNullable<Model["states"]>>;
}): JSX.Element {
	const state = model.selectedState;
	if (state === null)
		return (
			<section
				data-slot="model-state-details"
				data-selected-state=""
				data-lifecycle="none"
				data-standing="unavailable"
				className="space-y-2"
			>
				<ModelStateHistory
					state={state}
					comparison={model.comparison}
					paneId={paneId}
					states={states}
				/>
			</section>
		);
	return (
		<section
			data-slot="model-state-details"
			data-selected-state={state.id}
			data-lifecycle={state.lifecycle}
			data-standing={proposalStanding(state)}
			className="space-y-2"
		>
			{state.summary && <p className="text-control max-w-[72ch] font-normal">{state.summary}</p>}
			<ModelStateHistory
				state={state}
				comparison={model.comparison}
				paneId={paneId}
				states={states}
			/>
			<ModelReconciliation model={model} paneId={paneId} />
		</section>
	);
}

/**
 * What this reading is compared with, and the one other comparison a reader asks for most.
 * A reading with its comparison turned off says so, because it looks like any plain state.
 * @param props The reading.
 * @param props.model The reading on show.
 * @param props.paneId The pane that owns the address.
 * @param props.hasCurrent Whether the model has a Current to compare with.
 * @returns The line, or nothing for a reading with no comparison.
 */
function ModelComparisonLine({
	model,
	paneId,
	hasCurrent,
}: {
	model: Model;
	paneId: string;
	hasCurrent: boolean;
}): JSX.Element | null {
	const { against, compareAgainst } = useModelLocation(paneId);
	const compareWithCurrent = useCallback((): void => compareAgainst("current"), [compareAgainst]);
	const { comparison } = model;
	if (comparison === undefined && against !== AFTER) return null;
	return (
		<div className="flex shrink-0 items-center gap-x-3">
			{comparison === undefined ? (
				<p data-slot="model-after" className="text-body text-muted-foreground">
					After, with no comparison
				</p>
			) : (
				<ComparisonSummary comparison={comparison} counted={!reviewsChanges(model)} />
			)}
			{hasCurrent && !readsCurrent(model) && (
				<Button
					variant="link"
					size="sm"
					data-slot="model-compare-current"
					className="h-auto p-0"
					onClick={compareWithCurrent}
				>
					Compare with current
				</Button>
			)}
		</div>
	);
}

/**
 * Whether a reading has Current on either side already.
 * @param model The reading.
 * @returns True for Current itself, or for a comparison with it.
 */
function readsCurrent(model: Model): boolean {
	return [model.selectedState, model.comparison?.against].some(
		(state) => state?.lifecycle === "current",
	);
}

/**
 * Name the base of a comparison.
 * @param comparison The comparison.
 * @returns Its name, marked when it is the proposal's own base.
 */
function baseName(comparison: NonNullable<Model["comparison"]>): string {
	const name = comparison.against?.name ?? "empty planning baseline";
	return comparison.reason === "predecessor" ? `its base, ${name}` : name;
}

/**
 * Comparison metadata describes the complete states before visual filtering.
 * @param props The shared runtime comparison.
 * @param props.comparison Its base and subject changes.
 * @param props.counted Whether to count them: the Changes tab counts those of a proposal.
 * @returns The explicit base, and the number of changed subjects.
 */
function ComparisonSummary({
	comparison,
	counted,
}: {
	comparison: NonNullable<Model["comparison"]>;
	counted: boolean;
}): JSX.Element {
	const changed = changedCount(comparison);
	return (
		<p
			data-slot="model-comparison"
			data-against={comparison.against?.id ?? ""}
			data-reason={comparison.reason}
			className="text-body text-muted-foreground"
		>
			Compared with {baseName(comparison)}
			{counted && ` · ${changed} changed ${changed === 1 ? "subject" : "subjects"}`}
		</p>
	);
}

const NO_ISSUES = [] as const;

/**
 * A reference that changed between reads never supplies removed definitions.
 * @param props The comparison availability and explicit retry action.
 * @param props.comparison The verified base read.
 * @returns A recovery state when the comparison failed.
 */
function ModelComparisonNotice({
	comparison,
}: {
	comparison: ReturnType<typeof useModelComparison>;
}): JSX.Element | null {
	if (comparison.status !== "unavailable" && comparison.status !== "changed") return null;
	return (
		<div
			data-slot="model-comparison-unavailable"
			className="text-body border-border bg-background flex items-center gap-3 border-b px-6 py-3"
		>
			<p>
				{comparison.status === "changed"
					? "The comparison base changed between reads. Refresh to compare one coherent revision."
					: (comparison.error ?? "The comparison base is unavailable.")}
			</p>
			<Button variant="outline" size="sm" onClick={comparison.refresh}>
				Refresh comparison
			</Button>
		</div>
	);
}

/**
 * How a subject stands against the base of a comparison, with each module named.
 * @param model The reading and its comparison.
 * @param subject The subject.
 * @param reference The base, which names a module that only it holds.
 * @returns How it stands, or null for a subject the comparison does not report.
 */
function standingAgainst(model: Model, subject: string | null, reference: Model | undefined) {
	const { comparison } = model;
	const change = comparison?.subjects.find((entry) => entry.id === subject);
	if (comparison === undefined || change === undefined) return null;
	const names = moduleNames(model, reference);
	return {
		standing: change.kind,
		against: comparison.against?.name ?? "empty planning baseline",
		moved: change.fields.map((field) => namedField(field, names)),
	};
}

/**
 * The name of each module on either side of a comparison.
 * @param model The reading.
 * @param reference The base.
 * @returns The names by module.
 */
function moduleNames(model: Model, reference: Model | undefined): ReadonlyMap<string, string> {
	const sides = [...(reference?.modules ?? []), ...model.modules];
	return new Map(sides.map(({ id, name }) => [id, name]));
}

/**
 * Reuse the existing before/after inspector for authoritative canonical subject changes.
 * @param props The selected model and inspected subject identity.
 * @param props.model The complete runtime comparison.
 * @param props.subject The inspected canonical identity, or no subject.
 * @param props.reference The base, which names a module that only it holds.
 * @returns Semantic change details without deriving changes from the drawing.
 */
function ModelSubjectStanding({
	model,
	subject,
	reference,
}: {
	model: Model;
	subject: string | null;
	reference?: Model | undefined;
}): JSX.Element {
	const against = useMemo(
		() => standingAgainst(model, subject, reference),
		[model, subject, reference],
	);
	const open =
		model.selectedState?.standing?.issues.filter((issue) => issue.subject === subject) ?? NO_ISSUES;
	return <Standing against={against} open={open} code={null} />;
}

export { ModelComparisonLine, ModelStateDetails, ModelComparisonNotice, ModelSubjectStanding };
