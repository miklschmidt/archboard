import { useMemo, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import { Standing } from "#ui/components/semantic-board-canvas/SemanticInspectorStanding.tsx";
import type { useModelComparison } from "#ui/hooks/architecture-model/use-model-comparison.ts";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

/**
 * The selected state, not its retained manifest, decides whether a reading is implemented.
 * @param props The coherent materialized reading.
 * @param props.model Its state metadata and semantic comparison.
 * @returns Explicit lifecycle and comparison context above the diagram.
 */
function ModelStateDetails({ model }: { model: Model }): JSX.Element {
	const state = model.selectedState;
	if (state === null)
		return (
			<section
				data-slot="model-state-details"
				data-selected-state=""
				data-lifecycle="none"
				className="border-border shrink-0 space-y-2 border-b px-6 py-3"
			>
				<p className="text-control font-semibold">No implemented state</p>
				{model.comparison && <ComparisonSummary comparison={model.comparison} />}
			</section>
		);
	return (
		<section
			data-slot="model-state-details"
			data-selected-state={state.id}
			data-lifecycle={state.lifecycle}
			className="border-border shrink-0 space-y-2 border-b px-6 py-3"
		>
			<p className="text-control font-semibold">
				{lifecycleName(state.lifecycle)} · {state.name}
			</p>
			{state.summary && <p className="text-body">{state.summary}</p>}
			{model.comparison && <ComparisonSummary comparison={model.comparison} />}
		</section>
	);
}

/**
 * Comparison metadata describes the complete states before visual filtering.
 * @param props The shared runtime comparison.
 * @param props.comparison Its base and subject changes.
 * @returns The explicit base and number of changed subjects.
 */
function ComparisonSummary({
	comparison,
}: {
	comparison: NonNullable<Model["comparison"]>;
}): JSX.Element {
	const changed = comparison.subjects.filter((subject) => subject.kind !== "unchanged");
	return (
		<p
			data-slot="model-comparison"
			data-against={comparison.against?.id ?? ""}
			data-reason={comparison.reason}
			className="text-body text-muted-foreground"
		>
			Compared with {comparison.against?.name ?? "empty planning baseline"} · {changed.length}{" "}
			changed subjects
		</p>
	);
}

/**
 * Lifecycle labels describe the returned state without inferring implementation from history.
 * @param lifecycle The runtime's explicit lifecycle.
 * @returns Its visible label.
 */
function lifecycleName(lifecycle: NonNullable<Model["selectedState"]>["lifecycle"]): string {
	return { current: "Implemented", draft: "Draft", historical: "Historical", shelved: "Shelved" }[
		lifecycle
	];
}

const NO_ISSUES = [] as const;

/**
 * A reference that changed between reads never supplies removed definitions.
 * @param props The comparison availability and explicit retry action.
 * @param props.comparison The verified base read.
 * @returns A visible progress or recovery state when comparison is incomplete.
 */
function ModelComparisonNotice({
	comparison,
}: {
	comparison: ReturnType<typeof useModelComparison>;
}): JSX.Element | null {
	if (comparison.status === "none" || comparison.status === "ready") return null;
	if (comparison.status === "loading")
		return (
			<output
				data-slot="model-comparison-loading"
				className="text-body border-border border-b px-6 py-3"
			>
				Reading comparison architecture…
			</output>
		);
	return (
		<div
			data-slot="model-comparison-unavailable"
			className="text-body border-border flex items-center gap-3 border-b px-6 py-3"
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
 * Reuse the existing before/after inspector for authoritative canonical subject changes.
 * @param props The selected model and inspected subject identity.
 * @param props.model The complete runtime comparison.
 * @param props.subject The inspected canonical identity, or no subject.
 * @returns Semantic change details without deriving changes from the drawing.
 */
function ModelSubjectStanding({
	model,
	subject,
}: {
	model: Model;
	subject: string | null;
}): JSX.Element {
	const against = useMemo(() => {
		const comparison = model.comparison;
		const change = comparison?.subjects.find((entry) => entry.id === subject);
		if (comparison === undefined || change === undefined) return null;
		return {
			standing: change.kind,
			against: comparison.against?.name ?? "empty planning baseline",
			moved: change.fields.map(({ field, before, after }) => ({ field, before, after })),
		};
	}, [model.comparison, subject]);
	return <Standing against={against} open={NO_ISSUES} code={null} />;
}

export { ModelStateDetails, ModelComparisonNotice, ModelSubjectStanding };
