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
	location: ReturnType<typeof useModelLocation>,
	selected: ReadonlySet<string>,
) {
	const host = useContext(ModelExplanationContext);
	const { scope, focus, filters, grammar, flow, subject, state, checkpoint, against } = location;
	const selection = useMemo(
		() => ({
			state: state ?? undefined,
			checkpoint: checkpoint ?? undefined,
			against: against ?? undefined,
		}),
		[state, checkpoint, against],
	);
	const capture = useMemo(() => {
		const mode = DiagramGrammarSchema.safeParse(grammar);
		if (!mode.success) return null;
		return {
			vault,
			model: model.manifest.id,
			expectedRevision: model.revision.digest,
			subjects: [...selected],
			selection,
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
				referenceSubject: subject ?? undefined,
			},
		};
	}, [vault, model, selected, scope, focus, filters, grammar, flow, subject, selection]);
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

export { useModelExplanation };
