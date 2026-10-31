import { ModelStateHistory } from "#ui/components/architecture-model/ModelStateHistory.tsx";
import { useMemo, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import { Standing } from "#ui/components/semantic-board-canvas/SemanticInspectorStanding.tsx";
import type { useModelComparison } from "#ui/hooks/architecture-model/use-model-comparison.ts";
import type { Model } from "@archboard/board/content";
import { proposalStanding } from "#ui/rules/architecture-model/standing.ts";
import { ModelReconciliation } from "#ui/components/architecture-model/ModelReconciliation.tsx";
import { namedField } from "#ui/rules/architecture-model/change-list.ts";

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

export { ModelStateDetails, ModelComparisonNotice, ModelSubjectStanding };
