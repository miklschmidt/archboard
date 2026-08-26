// One pane: a slot holding its own canvas.
//
// Deliberately thin. Everything a canvas knows how to do lives in
// useCanvasSession, so this component is only the mount point and the border
// around it — which is what makes a second pane a one-line change in the shell
// rather than a second copy of the sync logic.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, getLibraryItemsHash } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import { useCanvasSession } from "./useCanvasSession";
import type { LockHolder, PaneStatus } from "../types";
// The one thing the browser half shares with the server half by import rather
// than by copy: the two defaults have to be the same colour, or a box the user
// draws and a box the agent draws stop matching.
import { DEFAULT_FILL_STYLE, DEFAULT_SHAPE_BACKGROUND } from "../../../src/core/appearance";

interface CanvasPaneProps {
	paneId: string;
	/** The pane that answers export / viewport / mermaid requests. */
	primary: boolean;
	/**
	 * Is this the pane the user last interacted with? Reported to the server as part of
	 * "what am I looking at", and only drawn as a highlight when there is more
	 * than one pane to distinguish — a lone pane is trivially the focused one.
	 */
	focused: boolean;
	theme: "light" | "dark";
	onStatus: (status: PaneStatus) => void;
	/** Agent state is shell chrome, so the pane reports it to the dedicated rail. */
	onAgentState: (paneId: string, heldBy: LockHolder | null, takeBack: () => void) => void;
	onThemeChange: (theme: "light" | "dark") => void;
	onFocus: (paneId: string) => void;
	/** Shown only when more than one pane is mounted. */
	label?: string;
	/**
	 * The stencil palette, owned by the shell. A pane renders it and reports
	 * what the human did to it; it is not board content and never reaches the
	 * element store or a change report.
	 */
	libraryItems: LibraryItems;
	onLibraryChange: (items: LibraryItems) => void;
	onLibraryChangedElsewhere: (items: LibraryItems) => void;
	/**
	 * The server asked for another pane, or for this one to go. Passed up
	 * because how many panes there are is the shell's business; a canvas only
	 * happens to own the socket the request arrived on.
	 */
	onLayoutRequest: (paneId: string, request: "open" | "close") => void;
	onBoardError: (error: string) => void;
}

export function CanvasPane({
	paneId,
	primary,
	focused,
	theme,
	onStatus,
	onAgentState,
	onThemeChange,
	onFocus,
	label,
	libraryItems,
	onLibraryChange,
	onLibraryChangedElsewhere,
	onLayoutRequest,
	onBoardError,
}: CanvasPaneProps): React.JSX.Element {
	const layout = useCallback(
		(request: "open" | "close") => onLayoutRequest(paneId, request),
		[onLayoutRequest, paneId],
	);
	const session = useCanvasSession({
		paneId,
		primary,
		focused,
		onStatus,
		onLibraryChanged: onLibraryChangedElsewhere,
		onLayoutRequest: layout,
		onBoardError,
	});

	useEffect(() => {
		onAgentState(paneId, session.heldBy, session.takeBack);
	}, [onAgentState, paneId, session.heldBy, session.takeBack]);

	// Excalidraw keeps its own copy of the library per instance, so the shell's
	// copy has to be pushed in. Guarded by content hash: pushing fires
	// onLibraryChange, and an ungated push would return what the shell just sent
	// and write it to the server again, forever.
	const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
	const appliedHashRef = useRef(0);

	useEffect(() => {
		if (!api) return;
		const hash = getLibraryItemsHash(libraryItems);
		if (hash === appliedHashRef.current) return;
		appliedHashRef.current = hash;
		void api.updateLibrary({ libraryItems, merge: false });
	}, [api, libraryItems]);

	// The shell owns the shared theme control. Excalidraw only reads
	// `initialData` while it mounts, so a theme picked in the header must also
	// be applied to every mounted canvas. Its onChange then reports the same
	// value back to the shell, keeping the built-in menu and our control in sync.
	useEffect(() => {
		if (!api || api.getAppState().theme === theme) return;
		api.updateScene({ appState: { theme } });
	}, [api, theme]);

	const interacted = (): void => {
		session.markInteracted();
		onFocus(paneId);
	};

	return (
		<section
			className={`pane${label && focused ? " pane-focused" : ""}`}
			onPointerDownCapture={interacted}
			onKeyDownCapture={interacted}
			aria-label={label ?? "canvas"}
		>
			<div className="pane-canvas" ref={session.attachPaneElement}>
				<Excalidraw
					// A disconnected pane fails closed because it cannot hear lock or
					// board news. A connected pane stays locally editable while the
					// vault mutex orders persistence, even when an agent holds the board.
					viewModeEnabled={session.readOnly}
					excalidrawAPI={(instance: ExcalidrawImperativeAPI) => {
						setApi(instance);
						session.attachExcalidraw(instance);
					}}
					onLibraryChange={(next) => {
						appliedHashRef.current = getLibraryItemsHash(next);
						onLibraryChange(next);
					}}
					onChange={(elements, appState) => {
						if (appState?.theme && appState.theme !== theme) onThemeChange(appState.theme);
						session.handleChange(elements, appState);
					}}
					// Excalidraw defaults new shapes to a transparent background, and a
					// transparent shape is only hit-testable on its stroke — so a box
					// drawn by the user could not be selected in the middle, which is the
					// first step of every promotion. Seeding the item defaults
					// fixes it at the moment of drawing; the picker still overrides.
					initialData={{
						elements: [],
						appState: {
							theme,
							currentItemBackgroundColor: DEFAULT_SHAPE_BACKGROUND,
							currentItemFillStyle: DEFAULT_FILL_STYLE,
						},
					}}
				/>
			</div>
		</section>
	);
}
