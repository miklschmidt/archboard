// One pane's canvas: the session bound to the mounted Excalidraw stage. The
// application mounts one of these per pane and hears the session back through
// `onSession`, so hosting a second pane is mounting a second component.

import { useCallback, useEffect, type JSX } from "react";

import { ExcalidrawStage } from "@/ui/canvas/components/ExcalidrawStage";
import {
	useCanvasSession,
	type CanvasSession,
	type CanvasSessionOptions,
} from "@/ui/canvas/use-canvas-session";
import type { WorkbenchTransportPort } from "@/ui/canvas/workbench-port";

/** Inputs for one pane's canvas. */
interface CanvasPaneProps<Transport extends WorkbenchTransportPort> {
	/** What the shell tells the session; memoised by the host so a render is not a report. */
	options: CanvasSessionOptions<Transport>;
	/**
	 * The session, after every render, and null once the pane unmounts. The
	 * host keeps it outside React state: nothing renders from it directly.
	 */
	onSession: (paneId: string, session: CanvasSession<Transport> | null) => void;
}

/**
 * Hear a person touching the pane: the first pointer or key, captured before
 * Excalidraw, marks the pane as interacted with.
 * @param element The pane element, or null when it is gone.
 * @param markInteracted The session's mark.
 * @returns Stops listening.
 */
function listenForInteraction(element: HTMLElement | null, markInteracted: () => void): () => void {
	if (element === null) {
		return () => {
			// Nothing was attached.
		};
	}
	const options: AddEventListenerOptions = { capture: true, passive: true };
	element.addEventListener("pointerdown", markInteracted, options);
	element.addEventListener("keydown", markInteracted, options);
	return () => {
		element.removeEventListener("pointerdown", markInteracted, options);
		element.removeEventListener("keydown", markInteracted, options);
	};
}

/**
 * One pane's canvas.
 * @param props The session options and where the session is reported.
 * @returns The mounted stage.
 */
function CanvasPane<Transport extends WorkbenchTransportPort>(
	props: CanvasPaneProps<Transport>,
): JSX.Element {
	const { onSession } = props;
	const { paneId, theme } = props.options;
	const session = useCanvasSession(props.options);
	useEffect(() => {
		onSession(paneId, session);
	}, [onSession, paneId, session]);
	useEffect(
		() => () => {
			onSession(paneId, null);
		},
		[onSession, paneId],
	);
	const { attachPaneElement, markInteracted } = session;
	const attachStage = useCallback(
		(element: HTMLDivElement | null): (() => void) => {
			attachPaneElement(element);
			const stop = listenForInteraction(element, markInteracted);
			return () => {
				stop();
				attachPaneElement(null);
			};
		},
		[attachPaneElement, markInteracted],
	);
	return (
		<ExcalidrawStage
			theme={theme}
			viewModeEnabled={session.readOnly}
			onApi={session.attachExcalidraw}
			onChange={session.handleChange}
			onLibraryChange={session.handleLibraryChange}
			onLinkOpen={session.handleLinkOpen}
			attachStage={attachStage}
		/>
	);
}

export { CanvasPane, type CanvasPaneProps };
