import { useCallback, useContext, useEffect, useMemo } from "react";
import { DiagramGrammarSchema } from "@archboard/model/views";
import { ModelExplanationContext } from "#ui/state/architecture-model/explanations.ts";
import { NOTHING_READ, type PaneReading } from "#ui/panes/pane-session/state/pane-reading.ts";
import type { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import type { Model } from "@archboard/model/content";
import type { ExplanationInvocation } from "#ui/clients/architecture-model/explanations.ts";
import { useComparisonSavedAt } from "#ui/hooks/architecture-model/use-comparison-saved-at.ts";
import { comparedWith } from "#ui/rules/architecture-model/comparison-choices.ts";
import { comparisonIntent } from "#ui/rules/architecture-model/comparison-intent.ts";

type Action = ExplanationInvocation["request"]["action"];

/**
 * Capture one visible reading for pane reports and every explanation entry point.
 * @param vault The actual reading vault.
 * @param model The coherent query result.
 * @param location The router-owned reading intent.
 * @param selected The temporary selected identities.
 * @param reporting The optional presentation and picture readiness.
 * @returns One invocation callback and its availability.
 */
function useModelExplanation(
	vault: string,
	model: Model,
	location: Pick<
		ReturnType<typeof useModelLocation>,
		| "scope"
		| "focus"
		| "expand"
		| "filters"
		| "grammar"
		| "flow"
		| "subject"
		| "state"
		| "checkpoint"
		| "against"
	>,
	selected: ReadonlySet<string>,
	reporting?: Parameters<typeof useModelReadingReport>[1],
) {
	const host = useContext(ModelExplanationContext);
	const { scope, focus, expand, filters, grammar, flow, subject, state, checkpoint, against } =
		location;
	const source = useMemo(
		() =>
			captureSource(model, {
				state: state ?? undefined,
				checkpoint: checkpoint ?? undefined,
				...comparisonIntent(against),
			}),
		[state, checkpoint, against, model],
	);
	const referenceSubject = subject ?? undefined;
	const comparisonRevision = model.comparison?.revision.digest;
	const display = useReadingDisplay(vault, model);
	const capture = useMemo(() => {
		const mode = DiagramGrammarSchema.safeParse(grammar);
		if (!mode.success || model.migrationPreview !== undefined) return null;
		return {
			vault,
			model: model.manifest.id,
			display,
			expectedRevision: model.revision.digest,
			expectedComparisonRevision: comparisonRevision,
			subjects: [...selected],
			...source,
			reading: {
				scope: scope ?? undefined,
				focus: focus ?? [],
				expand,
				relationshipKinds: Object.keys(model.policy.relationshipKinds).filter(
					(kind) => !filters.hideKinds.includes(kind),
				),
				grammar: mode.data,
				flow: flow ?? undefined,
				referenceSubject,
			},
		};
	}, [
		vault,
		model,
		selected,
		scope,
		focus,
		expand,
		filters,
		grammar,
		flow,
		referenceSubject,
		source,
		comparisonRevision,
		display,
	]);
	useModelReadingReport(capture, reporting);
	const invoke = host?.invoke;
	const act = useCallback(
		(action: Action): void => {
			if (capture === null) return;
			const {
				vault: actualVault,
				selection: selectedReading,
				display: _display,
				...request
			} = capture;
			invoke?.(actualVault, {
				selection: selectedReading,
				request: { ...request, action, actionId: crypto.randomUUID() },
			});
		},
		[capture, invoke],
	);
	return { act, unavailable: host === null || host.pending || capture === null };
}

/**
 * Describe the accepted picture with the same names and comparison text as its header.
 * @param vault The addressed vault.
 * @param model The accepted architecture.
 * @returns Labels for pane reports, outside the explanation request.
 */
function useReadingDisplay(vault: string, model: Model) {
	const savedAt = useComparisonSavedAt(
		vault,
		model.migrationPreview === undefined ? model.comparison : undefined,
	);
	return useMemo(
		() => ({
			model: model.manifest.name,
			state: model.selectedState?.name,
			comparison: comparedWith({ reading: model, against: null, catalogue: undefined, savedAt }),
		}),
		[model, savedAt],
	);
}

/**
 * Keep a narrative source distinct from the architecture that it explains.
 * @param model The captured target and optional narrative source.
 * @param selection The ordinary reader address.
 * @returns Source selection and its revision guard when playback supplies one.
 */
function captureSource(model: Model, selection: NonNullable<ExplanationInvocation["selection"]>) {
	const playback = model.playback;
	if (playback === undefined) return { selection };
	return {
		selection: playback.source ?? { ...selection, walkthrough: playback.walkthrough.id },
		expectedSourceRevision: playback.sourceRevision.digest,
	};
}

/**
 * Publish a drawn reading through the existing pane owner or offline replay callback.
 * @param capture The architecture and its source guards.
 * @param reporting The picture readiness and presentation position.
 * @param reporting.ready Whether the captured picture is drawn.
 * @param reporting.presentation The current narrative position.
 * @param reporting.onReading An optional offline report recipient.
 */
function useModelReadingReport(
	capture: NonNullable<PaneReading["architecture"]> | null,
	reporting?: {
		ready: boolean;
		presentation: PaneReading["presentation"];
		onReading?: ((reading: PaneReading | null) => void) | undefined;
	},
): void {
	const host = useContext(ModelExplanationContext);
	const { ready = true, presentation = null, onReading } = reporting ?? {};
	const report = onReading ?? host?.report;
	useEffect(() => {
		report?.(
			capture === null
				? null
				: { ...NOTHING_READ, architecture: ready ? capture : null, presentation },
		);
		return () => report?.(null);
	}, [report, capture, ready, presentation]);
}

export { useModelExplanation };
