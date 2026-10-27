import { ModelArrivalContext } from "#ui/state/board-routing/model-arrival.ts";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { PanePresentRequestSchema } from "@archboard/board/pane-context";
import type { PaneModelRequest } from "#ui/rules/pane-session/socket-messages.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";

/**
 * Apply an external reading before starting its requested captured presentation.
 * @param paneId The explicitly addressed pane.
 * @param onError The existing pane refusal surface.
 * @returns Ordered navigation and presentation listeners without conversation activation.
 */
function useModelArrival(paneId: string, onError: (message: string) => void) {
	const modelArriving = useContext(ModelArrivalContext);
	const { openRequested } = useModelLocation(paneId);
	const generation = useRef(0);
	const [arrival, setArrival] = useState(0);
	const [driven, onPresentRequest] = useState<z.infer<typeof PanePresentRequestSchema> | null>(
		null,
	);
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);
	const onModelRequest = useCallback(
		(request: PaneModelRequest): void => {
			const current = ++generation.current;
			void openRequested(
				request,
				modelArriving?.(paneId, request.reading.model, request.repository) ?? false,
			)
				.then(() => {
					if (current !== generation.current) return null;
					setArrival(current);
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
	return { arrival, driven, onModelRequest, onPresentRequest };
}

export { useModelArrival };
