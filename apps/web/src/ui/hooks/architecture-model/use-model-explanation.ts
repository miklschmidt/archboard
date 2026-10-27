import { useCallback, useContext, useEffect, useMemo } from "react";
import { DiagramGrammarSchema } from "@archboard/board/views";
import { ModelExplanationContext } from "#ui/state/architecture-model/explanations.ts";
import { NOTHING_READ } from "#ui/state/pane-session/pane-reading.ts";
import type { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import type { ExplanationInvocation } from "#ui/clients/architecture-model/explanations.ts";

type Action = ExplanationInvocation["request"]["action"];

/**
 * Capture one visible reading for pane reports and every explanation entry point.
 * @param vault The actual reading vault.
 * @param model The coherent query result.
 * @param location The router-owned reading intent.
 * @param selected The temporary selected identities.
 * @returns One invocation callback and its availability.
 */
function useModelExplanation(
	vault: string,
	model: Model,
	location: Pick<
		ReturnType<typeof useModelLocation>,
		| "scope"
		| "focus"
		| "filters"
		| "grammar"
		| "flow"
		| "subject"
		| "state"
		| "checkpoint"
		| "against"
	>,
	selected: ReadonlySet<string>,
) {
	const host = useContext(ModelExplanationContext);
	const { scope, focus, filters, grammar, flow, subject, state, checkpoint, against } = location;
	const source = useMemo(
		() =>
			captureSource(model, {
				state: state ?? undefined,
				checkpoint: checkpoint ?? undefined,
				against: against ?? undefined,
			}),
		[state, checkpoint, against, model],
	);
	const referenceSubject = subject ?? undefined;
	const capture = useMemo(() => {
		const mode = DiagramGrammarSchema.safeParse(grammar);
		if (!mode.success || model.migrationPreview !== undefined) return null;
		return {
			vault,
			model: model.manifest.id,
			expectedRevision: model.revision.digest,
			subjects: [...selected],
			...source,
			reading: {
				scope: scope ?? undefined,
				focus: focus ?? [],
				relationshipKinds: Object.keys(model.policy.relationshipKinds).filter(
					(kind) => !filters.hideKinds.includes(kind),
				),
				groups: Object.keys(model.policy.groups).filter(
					(group) => !filters.hideGroups.includes(group),
				),
				grammar: mode.data,
				flow: flow ?? undefined,
				referenceSubject,
			},
		};
	}, [vault, model, selected, scope, focus, filters, grammar, flow, referenceSubject, source]);
	const report = host?.report;
	useEffect(() => {
		report?.(capture === null ? null : { ...NOTHING_READ, architecture: capture });
		return () => report?.(null);
	}, [report, capture]);
	const invoke = host?.invoke;
	const act = useCallback(
		(action: Action): void => {
			if (capture === null) return;
			const { vault: actualVault, selection: selectedReading, ...request } = capture;
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

export { useModelExplanation };
