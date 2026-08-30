// One pane: a slot holding its own canvas.
//
// Deliberately thin. Everything a canvas knows how to do lives in
// useCanvasSession, so this component is only the mount point and the border
// around it — which is what makes a second pane a one-line change in the shell
// rather than a second copy of the sync logic.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, getLibraryItemsHash } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, LibraryItems, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCanvasSession } from "./useCanvasSession";
import type { LockHolder, PaneStatus } from "../types";
import type { CodeTargetNotice } from "../../shared/code-target";
import { createCodeTargetLinkHandler } from "../code-target";
import type { MountedBoardPreviewController } from "../board-preview";
import {
	projectSelection,
	sameSelectionProjection,
	type PaneSelectionSnapshot,
} from "../selection-inspector";
import {
	projectConnectedPath,
	samePathFocusSnapshot,
	type PanePathFocusSnapshot,
	type PathFocusController,
	type PathFocusSnapshot,
} from "../path-focus";
// The one thing the browser half shares with the server half by import rather
// than by copy: the two defaults have to be the same colour, or a box the user
// draws and a box the agent draws stop matching.
import { DEFAULT_FILL_STYLE, DEFAULT_SHAPE_BACKGROUND } from "../../shared/appearance/appearance";

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
	presentation: "current" | "hidden" | null;
	theme: "light" | "dark";
	onStatus: (status: PaneStatus) => void;
	/** Agent state is shell chrome, so the pane reports it to the workbench. */
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
	onCodeTargetNotice: (notice: CodeTargetNotice) => void;
	onSelectionSnapshot: (paneId: string, snapshot: PaneSelectionSnapshot) => void;
	onPathFocusSnapshot: (paneId: string, snapshot: PanePathFocusSnapshot) => void;
	onPathFocusController: (paneId: string, controller: PathFocusController | null) => void;
	onPreviewController: (paneId: string, controller: MountedBoardPreviewController | null) => void;
}

function selectedIds(appState: AppState): string[] {
	return Object.entries(appState.selectedElementIds ?? {})
		.filter(([, selected]) => selected)
		.map(([id]) => id);
}

function escapeIsOwned(event: KeyboardEvent, appState: AppState | null): boolean {
	const fallbackDocument = globalThis.document;
	const fallbackNode = fallbackDocument?.defaultView?.Node;
	const ownerDocument =
		fallbackNode && event.target instanceof fallbackNode
			? event.target.ownerDocument
			: fallbackDocument;
	if (!ownerDocument) return true;
	if (event.isComposing || ownerDocument.fullscreenElement) return true;
	if (appState?.editingTextElement || appState?.openDialog) return true;
	const ownerElement = ownerDocument.defaultView?.Element;
	const target =
		ownerElement && event.target instanceof ownerElement
			? event.target
			: ownerDocument.activeElement;
	if (ownerDocument.querySelector("dialog[open]")) return true;
	return Boolean(
		target?.closest(
			"[role='dialog'][aria-modal='true'], input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], .excalidraw-wysiwyg",
		),
	);
}

interface PathFocusOverlayProps {
	readonly paneId: string;
	readonly elements: readonly ExcalidrawElement[];
	readonly appState: AppState;
	readonly viewport: DOMRect;
}

type PathFocusOverlaySnapshot = Omit<PathFocusOverlayProps, "paneId"> & {
	readonly key: string;
};

function PathFocusOverlay({
	paneId,
	elements,
	appState,
	viewport,
}: PathFocusOverlayProps): React.JSX.Element {
	const zoom = appState.zoom?.value ?? 1;
	const scrollX = appState.scrollX ?? 0;
	const scrollY = appState.scrollY ?? 0;
	const offsetX = (appState.offsetLeft ?? viewport.left) - viewport.left;
	const offsetY = (appState.offsetTop ?? viewport.top) - viewport.top;
	const maskId = `${paneId}-path-focus-mask`;
	const sceneX = (value: number): number => (value + scrollX) * zoom + offsetX;
	const sceneY = (value: number): number => (value + scrollY) * zoom + offsetY;

	return (
		<svg
			className="path-focus-overlay"
			viewBox={`0 0 ${viewport.width} ${viewport.height}`}
			preserveAspectRatio="none"
			aria-hidden="true"
			data-focused-ids={elements
				.map((element) => element.id)
				.toSorted()
				.join(" ")}
		>
			<defs>
				<mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
					<rect width="100%" height="100%" fill="white" />
					{elements.map((element) => {
						const centerX = sceneX(element.x + element.width / 2);
						const centerY = sceneY(element.y + element.height / 2);
						const rotation = `rotate(${(element.angle * 180) / Math.PI} ${centerX} ${centerY})`;
						if (
							element.type === "arrow" ||
							element.type === "line" ||
							element.type === "freedraw"
						) {
							const points = element.points
								.map((point) => `${sceneX(element.x + point[0])},${sceneY(element.y + point[1])}`)
								.join(" ");
							return (
								<polyline
									key={element.id}
									points={points}
									transform={rotation}
									fill="none"
									stroke="black"
									strokeWidth={Math.max(18, element.strokeWidth * zoom + 12)}
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							);
						}
						const padding = 6;
						return (
							<rect
								key={element.id}
								x={sceneX(element.x) - padding}
								y={sceneY(element.y) - padding}
								width={Math.max(1, element.width * zoom) + padding * 2}
								height={Math.max(1, element.height * zoom) + padding * 2}
								rx="4"
								transform={rotation}
								fill="black"
							/>
						);
					})}
				</mask>
			</defs>
			<rect className="path-focus-dimmer" width="100%" height="100%" mask={`url(#${maskId})`} />
		</svg>
	);
}

export function CanvasPane({
	paneId,
	primary,
	focused,
	presentation,
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
	onCodeTargetNotice,
	onSelectionSnapshot,
	onPathFocusSnapshot,
	onPathFocusController,
	onPreviewController,
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
	const attachPaneElement = session.attachPaneElement;
	const readOnly = session.readOnly;
	const paneElementRef = useRef<HTMLDivElement | null>(null);
	const setPaneElement = useCallback(
		(element: HTMLDivElement | null): void => {
			paneElementRef.current = element;
			attachPaneElement(element);
		},
		[attachPaneElement],
	);

	useEffect(() => {
		onAgentState(paneId, session.heldBy, session.takeBack);
	}, [onAgentState, paneId, session.heldBy, session.takeBack]);

	// Excalidraw keeps its own copy of the library per instance, so the shell's
	// copy has to be pushed in. Guarded by content hash: pushing fires
	// onLibraryChange, and an ungated push would return what the shell just sent
	// and write it to the server again, forever.
	const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
	const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
	const appliedHashRef = useRef(0);
	const themeRef = useRef(theme);
	const pendingThemeRef = useRef<"light" | "dark" | null>(null);
	const selectionSnapshotRef = useRef<PaneSelectionSnapshot | null>(null);
	const pathFocusRef = useRef<PathFocusSnapshot>({ state: "inactive" });
	const focusBoardKeyRef = useRef(session.boardKey);
	const [pathFocus, setPathFocusState] = useState<PathFocusSnapshot>({ state: "inactive" });
	const [overlay, setOverlay] = useState<PathFocusOverlaySnapshot | null>(null);
	const refreshOverlay = useCallback((): void => {
		const instance = apiRef.current;
		const pane = paneElementRef.current;
		const projection = pathFocusRef.current;
		if (!instance || !pane || projection.state !== "connected") {
			setOverlay((previous) => (previous === null ? previous : null));
			return;
		}
		const focusedIds = new Set(projection.elementIds);
		const elements = instance.getSceneElements().filter((element) => focusedIds.has(element.id));
		const appState = instance.getAppState();
		const viewport = pane.getBoundingClientRect();
		const key = JSON.stringify([
			elements.map((element) => [element.id, element.version]),
			appState.scrollX,
			appState.scrollY,
			appState.zoom?.value,
			appState.offsetLeft,
			appState.offsetTop,
			viewport.left,
			viewport.top,
			viewport.width,
			viewport.height,
		]);
		setOverlay((previous) =>
			previous?.key === key ? previous : { key, elements, appState, viewport },
		);
	}, []);
	const applyPathFocus = useCallback(
		(next: PathFocusSnapshot): void => {
			if (!samePathFocusSnapshot(pathFocusRef.current, next)) {
				pathFocusRef.current = next;
				setPathFocusState(next);
			}
			refreshOverlay();
		},
		[refreshOverlay],
	);
	const exitPathFocus = useCallback((): void => {
		applyPathFocus({ state: "inactive" });
	}, [applyPathFocus]);
	const enterPathFocus = useCallback((): void => {
		const instance = apiRef.current;
		if (!instance) return;
		applyPathFocus(
			projectConnectedPath(instance.getSceneElements(), selectedIds(instance.getAppState())),
		);
	}, [applyPathFocus]);
	const pathFocusController = useMemo<PathFocusController>(
		() => ({ focus: enterPathFocus, exit: exitPathFocus }),
		[enterPathFocus, exitPathFocus],
	);
	const previewController = useMemo<MountedBoardPreviewController>(
		() => ({
			read: () => {
				const instance = apiRef.current;
				if (!instance || !session.boardKey) return null;
				return {
					board: session.boardKey,
					elements: instance.getSceneElements(),
					files: instance.getFiles(),
				};
			},
		}),
		[session.boardKey],
	);
	const publishSelection = useCallback(
		(projection: PaneSelectionSnapshot["projection"]): void => {
			const next = { boardKey: session.boardKey, projection };
			const previous = selectionSnapshotRef.current;
			if (
				previous?.boardKey === next.boardKey &&
				sameSelectionProjection(previous.projection, next.projection)
			)
				return;
			selectionSnapshotRef.current = next;
			onSelectionSnapshot(paneId, next);
		},
		[onSelectionSnapshot, paneId, session.boardKey],
	);

	useEffect(() => {
		publishSelection({ state: "empty" });
	}, [publishSelection]);

	useEffect(() => {
		onPathFocusSnapshot(paneId, { boardKey: session.boardKey, projection: pathFocus });
	}, [onPathFocusSnapshot, paneId, pathFocus, session.boardKey]);

	useEffect(() => {
		onPathFocusController(paneId, pathFocusController);
		return () => onPathFocusController(paneId, null);
	}, [onPathFocusController, paneId, pathFocusController]);

	useEffect(() => {
		onPreviewController(paneId, previewController);
		return () => onPreviewController(paneId, null);
	}, [onPreviewController, paneId, previewController]);

	useEffect(() => {
		if (focusBoardKeyRef.current === session.boardKey) return;
		focusBoardKeyRef.current = session.boardKey;
		exitPathFocus();
	}, [exitPathFocus, session.boardKey]);

	useEffect(() => {
		if (!focused || pathFocus.state === "inactive") return;
		const onEscape = (event: KeyboardEvent): void => {
			if (event.key !== "Escape" || escapeIsOwned(event, apiRef.current?.getAppState() ?? null))
				return;
			event.preventDefault();
			exitPathFocus();
		};
		window.addEventListener("keydown", onEscape, true);
		return () => window.removeEventListener("keydown", onEscape, true);
	}, [exitPathFocus, focused, pathFocus.state]);

	useEffect(() => {
		const pane = paneElementRef.current;
		if (!api || !pane || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(refreshOverlay);
		observer.observe(pane);
		return () => observer.disconnect();
	}, [api, refreshOverlay]);

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
	useLayoutEffect(() => {
		if (themeRef.current !== theme) pendingThemeRef.current = theme;
		themeRef.current = theme;
		if (!api) return;
		if (api.getAppState().theme === theme) {
			pendingThemeRef.current = null;
			return;
		}
		pendingThemeRef.current = theme;
		api.updateScene({ appState: { theme } });
	}, [api, theme]);

	useEffect(() => {
		if (!api || api.getAppState().viewModeEnabled === readOnly) return;
		api.updateScene({ appState: { viewModeEnabled: readOnly } });
	}, [api, readOnly]);

	const interacted = useCallback((): void => {
		session.markInteracted();
		onFocus(paneId);
	}, [onFocus, paneId, session]);
	const setApiFromExcalidraw = useCallback(
		(instance: ExcalidrawImperativeAPI): void => {
			apiRef.current = instance;
			setApi(instance);
			session.attachExcalidraw(instance);
		},
		[session],
	);
	const handleLibraryChange = useCallback(
		(next: LibraryItems): void => {
			appliedHashRef.current = getLibraryItemsHash(next);
			onLibraryChange(next);
		},
		[onLibraryChange],
	);
	const handleChange = useCallback(
		(elements: readonly Partial<ExcalidrawElement>[], appState: AppState): void => {
			// Applying a header theme can make Excalidraw report its previous theme
			// before it reports the requested one. Ignore those intermediate callbacks,
			// or the old value bounces back into Shell until React unmounts the root.
			const pendingTheme = pendingThemeRef.current;
			if (pendingTheme) {
				if (appState.theme === pendingTheme) pendingThemeRef.current = null;
			} else if (appState.theme && appState.theme !== themeRef.current) {
				onThemeChange(appState.theme);
			}
			const currentSelectedIds = selectedIds(appState);
			const scene = apiRef.current?.getSceneElements() ?? [];
			publishSelection(projectSelection(scene, currentSelectedIds));
			if (pathFocusRef.current.state !== "inactive") {
				if (currentSelectedIds.length === 0) exitPathFocus();
				else applyPathFocus(projectConnectedPath(scene, currentSelectedIds));
			}
			session.handleChange(elements, appState);
		},
		[applyPathFocus, exitPathFocus, onThemeChange, publishSelection, session],
	);
	const initialData = useMemo(
		() => ({
			elements: [],
			appState: {
				theme,
				currentItemBackgroundColor: DEFAULT_SHAPE_BACKGROUND,
				currentItemFillStyle: DEFAULT_FILL_STYLE as "solid",
			},
		}),
		[theme],
	);
	const handleLinkOpen = useMemo(
		() =>
			createCodeTargetLinkHandler({
				boardKey: session.boardKey,
				onSuccess: () => undefined,
				onFailure: onCodeTargetNotice,
			}),
		[onCodeTargetNotice, session.boardKey],
	);

	return (
		<section
			className={`pane${label && focused ? " pane-focused" : ""}${presentation ? ` presentation-${presentation}` : ""}`}
			onPointerDownCapture={interacted}
			onKeyDownCapture={interacted}
			aria-label={label ?? "canvas"}
			aria-hidden={presentation === "hidden" ? true : undefined}
			inert={presentation === "hidden"}
		>
			<div className="pane-canvas" ref={setPaneElement}>
				<Excalidraw
					// A disconnected pane fails closed because it cannot hear lock or
					// board news. A connected pane stays locally editable while the
					// vault mutex orders persistence, even when an agent holds the board.
					viewModeEnabled={readOnly}
					onLinkOpen={handleLinkOpen}
					excalidrawAPI={setApiFromExcalidraw}
					onLibraryChange={handleLibraryChange}
					onChange={handleChange}
					// Excalidraw defaults new shapes to a transparent background, and a
					// transparent shape is only hit-testable on its stroke — so a box
					// drawn by the user could not be selected in the middle, which is the
					// first step of every promotion. Seeding the item defaults
					// fixes it at the moment of drawing; the picker still overrides.
					initialData={initialData}
				/>
				{overlay && (
					<PathFocusOverlay
						paneId={paneId}
						elements={overlay.elements}
						appState={overlay.appState}
						viewport={overlay.viewport}
					/>
				)}
			</div>
		</section>
	);
}
