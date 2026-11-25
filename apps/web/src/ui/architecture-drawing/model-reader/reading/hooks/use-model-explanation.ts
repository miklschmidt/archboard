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
type ExplanationLocation = Pick<
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
>;

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

/** Inputs required to assemble a pane architecture capture. */
interface CaptureInputs {
	readonly vault: string;
	readonly model: Model;
	readonly location: ExplanationLocation;
	readonly selected: ReadonlySet<string>;
	readonly source: ReturnType<typeof captureSource>;
	readonly display: ReturnType<typeof useReadingDisplay>;
	readonly temporary: boolean;
}

/**
 * Filter selected subject ids so a temporary flow's synthetic actors and steps never leak into pane reports.
 * @param model The coherent canonical model.
 * @param selected Currently selected subject ids.
 * @param temporary Whether a temporary flow is currently displayed.
 * @returns Subject ids valid for the canonical reading.
 */
function reportedSubjects(
	model: Model,
	selected: ReadonlySet<string>,
	temporary: boolean,
): string[] {
	if (!temporary) return [...selected];
	const canonical = new Set(modelSubjects(model).map(({ id }) => id));
	return [...selected].filter((id) => canonical.has(id));
}

/**
 * Assemble the canonical reading intent nested inside a pane capture.
 * @param model The coherent canonical model.
 * @param location The router-owned reading intent.
 * @param grammar The validated canonical grammar.
 * @param temporary Whether a temporary flow is currently displayed.
 * @returns The canonical reading snapshot.
 */
function buildCapturedReading(
	model: Model,
	location: ExplanationLocation,
	grammar: NonNullable<PaneReading["architecture"]>["reading"]["grammar"],
	temporary: boolean,
): NonNullable<PaneReading["architecture"]>["reading"] {
	const flow = temporary ? undefined : (location.flow ?? undefined);
	return {
		scope: location.scope ?? undefined,
		focus: location.focus ?? [],
		expand: location.expand,
		lens: readingLens(model.policy, location.filters.lens).id,
		relationshipKinds: Object.keys(model.policy.relationshipKinds).filter(
			(kind) => !location.filters.hideKinds.includes(kind),
		),
		grammar,
		flow,
		referenceSubject: location.subject ?? undefined,
	};
}

/**
 * Build the captured pane reading and explanation guards for the current visible architecture.
 * @param params The vault, model, location, selection, source, display, and temporary-flow flag.
 * @returns The captured pane architecture, or null when the reading cannot be captured.
 */
function buildReadingCapture(
	params: CaptureInputs,
): NonNullable<PaneReading["architecture"]> | null {
	const { vault, model, location, selected, source, display, temporary } = params;
	const mode = diagramGrammarSchema().safeParse(temporary ? "architecture" : location.grammar);
	if (!mode.success || !readsVaultOnDisk(model)) return null;
	return {
		vault,
		model: model.manifest.id,
		display,
		expectedRevision: model.revision.digest,
		expectedComparisonRevision: model.comparison?.revision.digest,
		subjects: reportedSubjects(model, selected, temporary),
		...source,
		reading: buildCapturedReading(model, location, mode.data, temporary),
	};
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
	location: ExplanationLocation,
	selected: ReadonlySet<string>,
	reporting?: Parameters<typeof useModelReadingReport>[1],
	presentation?: ReadingPresentation,
) {
	const host = useContext(ModelExplanationContext);
	const { state, checkpoint, against, filters } = location;
	const source = useMemo(
		() =>
			captureSource(model, {
				state: state ?? undefined,
				checkpoint: checkpoint ?? undefined,
				...comparisonIntent(against),
			}),
		[state, checkpoint, against, model],
	);
	const display = useReadingDisplay(vault, model, filters, presentation);
	// A temporary flow is not in the vault: report the canonical reading under it, explain nothing.
	const temporary = presentation?.ephemeralFlow !== undefined;
	const capture = useMemo(
		() => buildReadingCapture({ vault, model, location, selected, source, display, temporary }),
		[vault, model, location, selected, source, display, temporary],
	);
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
	const unavailable = host === null || host.pending || capture === null || temporary;
	return { act, unavailable };
}

/**
 * Extract optional presentation fields (page, file, fileRepo, ref, ephemeralFlow) for pane reports.
 * @param presentation Optional browser presentation state.
 * @returns Present optional presentation fields.
 */
function presentationDisplayFields(
	presentation: ReadingPresentation | undefined,
): Partial<ReadingPresentation> {
	if (presentation === undefined) return {};
	return Object.fromEntries(
		Object.entries(presentation).filter(([, value]) => value !== undefined),
	);
}

/**
 * Extract active filter hide lists for pane reports when non-empty.
 * @param filters The active kind and effect hide lists.
 * @returns Present hide lists.
 */
function filterDisplayFields(filters: ReturnType<typeof useModelLocation>["filters"]) {
	return {
		...(filters.hideKinds.length === 0 ? {} : { hideKinds: [...filters.hideKinds] }),
		...(filters.hideEffects.length === 0 ? {} : { hideEffects: [...filters.hideEffects] }),
	};
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
			...presentationDisplayFields(presentation),
			...filterDisplayFields(filters),
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
