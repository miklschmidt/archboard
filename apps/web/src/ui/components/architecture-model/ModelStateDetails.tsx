import type { JSX } from "react";
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

export { ModelStateDetails };
