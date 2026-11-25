import { useCallback, useContext, useEffect, useMemo } from "react";
import { diagramGrammarSchema } from "@archboard/model/views";
import { ModelExplanationContext } from "#ui/architecture-drawing/model-reader/state/explanations.ts";
import { NOTHING_READ, type PaneReading } from "#ui/panes/pane-session/state/pane-reading.ts";
import type { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { readingLens, type Model } from "@archboard/model/content";
import type { ExplanationInvocation } from "#ui/architecture-drawing/model-reader/access/clients/explanations.ts";
import { useComparisonSavedAt } from "#ui/architecture-drawing/model-reader/hooks/use-comparison-saved-at.ts";
import { comparedWith } from "#ui/architecture-drawing/model-reader/reading/rules/comparison-choices.ts";
import { comparisonIntent } from "#ui/architecture-drawing/model-reader/rules/comparison-intent.ts";
import { readsVaultOnDisk } from "#ui/architecture-drawing/model-reader/rules/vault-on-disk.ts";
import { modelSubjects } from "#ui/architecture-drawing/model-reader/rules/flow-reading.ts";
import { useLayoutEngine } from "#ui/architecture-drawing/canvas/picture/hooks/use-layout-engine.ts";
import { useHoverLight } from "#ui/architecture-drawing/canvas/picture/hooks/use-hover-light.ts";
import { useThemePreference } from "#ui/application/hooks/use-theme.ts";
import { useNavigatorMode } from "#ui/application/hooks/use-navigator-mode.ts";

type Action = ExplanationInvocation["request"]["action"];

/** Browser-level presentation state included in pane reports outside explanation guards. */
interface ReadingPresentation {
	readonly page?: "diagram" | "about" | undefined;
	readonly file?: string | undefined;
	readonly fileRepo?: string | undefined;
	readonly ref?: string | undefined;
	readonly ephemeralFlow?:
		| { readonly name: string; readonly grammar: "flowchart" | "sequence" }
		| undefined;
}

/**
 * Capture one visible reading for pane reports and every explanation entry point.
 * @param vault The actual reading vault.
 * @param model The coherent query result.
 * @param location The router-owned reading intent.
 * @param selected The temporary selected identities.
 * @param reporting The optional presentation and picture readiness.
 * @param presentation Optional browser presentation details (page, file, ref, temporary flow).
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
	presentation?: ReadingPresentation,
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
	const display = useReadingDisplay(vault, model, filters, presentation);
	// A temporary flow is not in the vault: report the canonical reading under it, explain nothing.
	const temporary = presentation?.ephemeralFlow !== undefined;
	const capture = useMemo(() => {
		const mode = diagramGrammarSchema().safeParse(temporary ? "architecture" : grammar);
		if (!mode.success || !readsVaultOnDisk(model)) return null;
		// A temporary flow's own actors and steps are in no model, so no report names them as selected.
		const canonical = temporary ? new Set(modelSubjects(model).map(({ id }) => id)) : null;
		return {
			vault,
			model: model.manifest.id,
			display,
			expectedRevision: model.revision.digest,
			expectedComparisonRevision: comparisonRevision,
			subjects: [...selected].filter((id) => canonical?.has(id) ?? true),
			...source,
			reading: {
				scope: scope ?? undefined,
				focus: focus ?? [],
				expand,
				lens: readingLens(model.policy, filters.lens).id,
				relationshipKinds: Object.keys(model.policy.relationshipKinds).filter(
					(kind) => !filters.hideKinds.includes(kind),
				),
				grammar: mode.data,
				flow: temporary ? undefined : (flow ?? undefined),
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
		temporary,
		referenceSubject,
		source,
		comparisonRevision,
		display,
	]);
	useModelReadingReport(capture, reporting);
	const invoke = host?.invoke;
	const act = useCallback(
		(action: Action): void => {
			if (capture === null || temporary) return;
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
		[capture, temporary, invoke],
	);
	return { act, unavailable: host === null || host.pending || capture === null || temporary };
}

/**
 * Describe the accepted picture with the same names, comparison text, and active browser settings.
 * @param vault The addressed vault.
 * @param model The accepted architecture.
 * @param filters The active kind and effect hide lists.
 * @param presentation Optional page, code file, ref, and temporary flow state.
 * @returns Labels and presentation state for pane reports, outside the explanation request.
 */
function useReadingDisplay(
	vault: string,
	model: Model,
	filters: ReturnType<typeof useModelLocation>["filters"],
	presentation?: ReadingPresentation,
) {
	const layout = useLayoutEngine();
	const theme = useThemePreference();
	const hoverLight = useHoverLight();
	const { mode: navigatorMode } = useNavigatorMode();
	const savedAt = useComparisonSavedAt(
		vault,
		model.migrationPreview === undefined ? model.comparison : undefined,
	);
	return useMemo(
		() => ({
			model: model.manifest.name,
			state: model.selectedState?.name,
			comparison: comparedWith({ reading: model, against: null, catalogue: undefined, savedAt }),
			layout,
			theme,
			hoverLight,
			navigatorMode,
			...(presentation?.page === undefined ? {} : { page: presentation.page }),
			...(presentation?.file === undefined ? {} : { file: presentation.file }),
			...(presentation?.fileRepo === undefined ? {} : { fileRepo: presentation.fileRepo }),
			...(presentation?.ref === undefined ? {} : { ref: presentation.ref }),
			...(filters.hideKinds.length === 0 ? {} : { hideKinds: [...filters.hideKinds] }),
			...(filters.hideEffects.length === 0 ? {} : { hideEffects: [...filters.hideEffects] }),
			...(presentation?.ephemeralFlow === undefined
				? {}
				: { ephemeralFlow: presentation.ephemeralFlow }),
		}),
		[model, savedAt, layout, theme, hoverLight, navigatorMode, filters, presentation],
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
