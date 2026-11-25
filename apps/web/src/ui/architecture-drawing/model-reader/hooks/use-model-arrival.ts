import { ModelArrivalContext } from "#ui/panes/reading-routing/state/model-arrival.ts";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type {
	panePresentRequestSchema,
	resolvedEphemeralFlowSchema,
} from "@archboard/model/pane-context";
import type {
	PaneModelRequest,
	PaneSettingsRequest,
} from "#ui/panes/pane-session/rules/socket-messages.ts";
import { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";
import { chooseLayoutEngine } from "#ui/architecture-drawing/canvas/picture/clients/layout-engine.ts";
import { chooseHoverLight } from "#ui/architecture-drawing/canvas/picture/clients/hover-light.ts";
import { chooseTheme } from "#ui/application/clients/theme.ts";
import type { Page } from "#ui/architecture-drawing/model-reader/reading/components/ModelHeading.tsx";

type ResolvedEphemeralFlow = z.infer<ReturnType<typeof resolvedEphemeralFlowSchema>>;

/** An unsaved temporary flow currently displayed in one pane session. */
interface ActiveEphemeralFlow extends ResolvedEphemeralFlow {
	readonly grammar: "flowchart" | "sequence";
}

/**
 * Apply browser display settings (layout engine, theme, hover-dimming) in place.
 * @param settings The display settings to apply.
 */
function applyDisplaySettings(settings: PaneSettingsRequest): void {
	if (settings.layout !== undefined) chooseLayoutEngine(settings.layout);
	if (settings.theme !== undefined) chooseTheme(settings.theme);
	if (settings.hoverLight !== undefined) chooseHoverLight(settings.hoverLight);
}

/**
 * Apply an external reading, display-settings update, or temporary flow before starting any walkthrough.
 * @param paneId The explicitly addressed pane.
 * @param onError The existing pane refusal surface.
 * @returns Ordered navigation, display-settings, and presentation listeners without conversation activation.
 */
function useModelArrival(paneId: string, onError: (message: string) => void) {
	const modelArriving = useContext(ModelArrivalContext);
	const { openRequested } = useModelLocation(paneId);
	const generation = useRef(0);
	const [arrival, setArrival] = useState(0);
	const [selected, setSelected] = useState<readonly string[] | undefined>(undefined);
	const [requestedPage, setRequestedPage] = useState<Page | undefined>(undefined);
	const [ephemeralFlow, setEphemeralFlow] = useState<ActiveEphemeralFlow | null>(null);
	const [driven, onPresentRequest] = useState<z.infer<
		ReturnType<typeof panePresentRequestSchema>
	> | null>(null);
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);
	const onSettingsRequest = useCallback((settings: PaneSettingsRequest): void => {
		applyDisplaySettings(settings);
	}, []);
	const onModelRequest = useCallback(
		(request: PaneModelRequest): void => {
			applyDisplaySettings({
				...(request.reading.layout === undefined ? {} : { layout: request.reading.layout }),
				...(request.reading.theme === undefined ? {} : { theme: request.reading.theme }),
				...(request.reading.hoverLight === undefined
					? {}
					: { hoverLight: request.reading.hoverLight }),
			});
			const effect = modelArriving?.(paneId, request.reading, request.repository) ?? "replace";
			const nextEphemeral: ActiveEphemeralFlow | null =
				request.reading.resolvedEphemeralFlow === undefined
					? null
					: {
							...request.reading.resolvedEphemeralFlow,
							grammar: request.reading.grammar === "sequence" ? "sequence" : "flowchart",
						};
			const hasLocalPresentation =
				nextEphemeral !== null ||
				request.reading.select !== undefined ||
				request.reading.page !== undefined;
			if (effect === "keep" && !hasLocalPresentation) return;
			const current = ++generation.current;
			void openRequested(request, effect === "push")
				.then(() => {
					if (current !== generation.current) return null;
					setArrival(current);
					setSelected(request.reading.select);
					setRequestedPage(request.reading.page);
					setEphemeralFlow(nextEphemeral);
					onPresentRequest(
						request.reading.walkthrough === undefined
							? null
							: {
									type: "pane_present",
									request: crypto.randomUUID(),
									walkthrough: request.reading.walkthrough,
									beat: request.reading.beat ?? 0,
								},
					);
					return null;
				})
				.catch((error: unknown) => {
					if (current === generation.current)
						onError(
							error instanceof Error
								? error.message
								: "The requested architecture could not open. Retry the navigation.",
						);
				});
		},
		[openRequested, onError, modelArriving, paneId],
	);
	const endPresentation = useCallback((): void => onPresentRequest(null), []);
	const clearEphemeralFlow = useCallback((): void => setEphemeralFlow(null), []);
	const setEphemeralGrammar = useCallback((grammar: "flowchart" | "sequence"): void => {
		setEphemeralFlow((current) => (current === null ? null : { ...current, grammar }));
	}, []);
	return {
		arrival,
		selected,
		requestedPage,
		ephemeralFlow,
		clearEphemeralFlow,
		setEphemeralGrammar,
		driven,
		onModelRequest,
		onSettingsRequest,
		onPresentRequest,
		endPresentation,
	};
}

export { useModelArrival, type ActiveEphemeralFlow };
