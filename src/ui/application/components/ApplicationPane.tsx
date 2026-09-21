// One pane as the application mounts it: its session with the server, and the
// semantic board it is showing drawn inside it.
//
// The session and the picture are deliberately one component. A pane's
// identity to the server — its client id, its registration, the socket every
// announcement arrives on — belongs to the pane, and the board it shows is
// whatever the server has pointed it at. Mounting them together is what makes
// "this pane is showing that board" one fact rather than two that can drift.

import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import type { PanePresentRequest } from "@/shared/semantic-pane-context";
import type { PaneHost } from "@/ui/application/hooks/use-panes";
import type { PickedSubject } from "@/ui/application/hooks/use-pane-reading";
import { readingOf } from "@/ui/application/pane-reading";
import type { PaneHandles } from "@/ui/application/lib/pane-handles";
import {
	NOTHING_READ,
	usePaneSession,
	type PaneSessionOptions,
	type PaneTheme,
} from "@/ui/pane-session";
import {
	createPaneWorkbenchSocketOwner,
	type PaneWorkbenchSocketOwner,
} from "@/ui/pane-session/workbench-socket";
import {
	boardAddressOf,
	SemanticBoardStage,
	type SelectedSubject,
	type SemanticPaneReading,
	type SemanticTarget,
} from "@/ui/semantic-board-canvas";
import {
	createBrowserWorkbenchTransport,
	type BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";

/** Inputs for one application pane. */
interface ApplicationPaneProps {
	paneId: string;
	primary: boolean;
	focused: boolean;
	theme: PaneTheme;
	host: PaneHost;
	handles: PaneHandles;
	/** Which of the board's views this pane reads it through, or null for all of it. */
	view: string | null;
	/**
	 * The person chose a different way of reading this board.
	 * @param view The view's id, or null for the whole variant.
	 */
	onViewChange: (view: string | null) => void;
	/** What the person has picked out in this pane, or null. */
	picked: PickedSubject | null;
	/**
	 * The person picked a subject out, or cleared the selection.
	 * @param subject The subject, or null.
	 */
	onPick: (subject: PickedSubject | null) => void;
	/**
	 * The person asked for another variant of the board this pane is showing.
	 * @param variant The variant's id or name, or null for whichever is current.
	 */
	onVariantChange: (variant: string | null) => void;
	/**
	 * Have a walkthrough of this pane's board narrated aloud, when voice can be
	 * started for this pane.
	 * @param walkthrough The walkthrough's id.
	 */
	onNarrate?: ((walkthrough: string) => void) | undefined;
	/** What the shell lays over this pane's picture, such as subtitles of the voice running for it. */
	overlay?: ReactNode;
	/** Whether the person asked for reduced motion. */
	reducedMotion: boolean;
}

/** The pane-bound callbacks the shared host cannot supply. */
interface BoundCallbacks {
	onBoardError: (error: string) => void;
	onLayoutRequest: (request: "open" | "close") => void;
	createWorkbenchSockets: () => PaneWorkbenchSocketOwner<BrowserWorkbenchTransport>;
}

/**
 * The session options for one pane over the shared host.
 * @param props The pane's inputs.
 * @param bound The pane-bound callbacks.
 * @returns The options.
 */
function optionsFor(
	props: ApplicationPaneProps,
	bound: BoundCallbacks,
): PaneSessionOptions<BrowserWorkbenchTransport> {
	const { host } = props;
	return {
		paneId: props.paneId,
		primary: props.primary,
		focused: props.focused,
		theme: props.theme,
		onStatus: host.onStatus,
		onHolder: host.onHolder,
		onPaneStateAccepted: host.onPaneStateAccepted,
		onPaneReconnected: host.onPaneReconnected,
		onPaneRetired: host.onPaneRetired,
		onStaleFrontend: host.onStaleFrontend,
		onCodeTargetNotice: host.onCodeTargetNotice,
		onAgentActivity: host.onAgentActivity,
		onBoardAdopted: host.onBoardAdopted,
		onBoardError: bound.onBoardError,
		onLayoutRequest: bound.onLayoutRequest,
		createWorkbenchSockets: bound.createWorkbenchSockets,
	};
}

/**
 * The callbacks one pane binds to itself, which the shared host cannot supply.
 * @param props The pane's inputs.
 * @returns The bound callbacks, stable while the pane is.
 */
function useBoundCallbacks(props: ApplicationPaneProps): BoundCallbacks {
	const { paneId, host, handles } = props;
	const onBoardError = useCallback(
		(error: string): void => host.onBoardError(paneId, error),
		[host, paneId],
	);
	const onLayoutRequest = useCallback(
		(request: "open" | "close"): void => host.onLayoutRequest(paneId, request),
		[host, paneId],
	);
	const createWorkbenchSockets = useCallback(
		(): PaneWorkbenchSocketOwner<BrowserWorkbenchTransport> =>
			createPaneWorkbenchSocketOwner({
				media: handles.media(paneId),
				createTransport: createBrowserWorkbenchTransport,
			}),
		[handles, paneId],
	);
	return useMemo(
		() => ({ onBoardError, onLayoutRequest, createWorkbenchSockets }),
		[onBoardError, onLayoutRequest, createWorkbenchSockets],
	);
}

/**
 * One pane: its session, and the board it is showing.
 * @param props The pane's identity, facets, theme, host, handles and reading.
 * @returns The mounted pane.
 */
function ApplicationPane(props: ApplicationPaneProps): JSX.Element {
	const { paneId, host, picked } = props;
	// What the stage says is on screen, which is the only place it is known.
	const [onScreen, setOnScreen] = useState<SemanticPaneReading | null>(null);
	const bound = useBoundCallbacks(props);
	// A step somebody narrating a walkthrough asked for (TASK-251). Kept with the
	// pane because it is about this pane's picture, and handed to the stage, which
	// owns where the pane is in a walkthrough and answers through its reading.
	const [asked, onPresentRequest] = useState<PanePresentRequest | null>(null);
	const options = useMemo(
		() => ({ ...optionsFor(props, bound), onPresentRequest }),
		[props, bound],
	);
	const session = usePaneSession(options);
	const { attachPaneElement, openedKey, readingChanged } = session;
	// Registration and departure are two different events, and they are two
	// effects for that reason. `usePaneSession` hands back a fresh object every
	// render — its board, its holder and what an agent is doing all change under
	// it — so a single effect with the session in its dependencies would report
	// the pane gone and back on every ordinary piece of news. The workbench
	// answers "gone" by tearing down the pane's media and its thread binding, so
	// that is not a re-registration, it is a disconnection per render.
	useEffect(() => {
		host.onSession(paneId, session);
	}, [host, paneId, session]);
	useEffect(() => () => host.onSession(paneId, null), [host, paneId]);
	// The element the pane fills, measured for the pane report: taken through a
	// callback ref rather than read during render, which is the only moment a
	// ref's value is not a rendering input.
	const attachStage = useCallback(
		(element: HTMLDivElement | null): void => attachPaneElement(element),
		[attachPaneElement],
	);
	// Where the server pointed this pane, which is where the stage starts
	// reading. Following a link down moves what is on screen without moving
	// this: the trail out is drawn from it, and the pane says what it is
	// actually showing through its reading instead.
	const address = useMemo(() => boardAddressOf(openedKey), [openedKey]);
	// A pane on no board is reading nothing, and says so: the stage is not
	// mounted to report it.
	const reading = useMemo(
		() => (address === null ? NOTHING_READ : readingOf(onScreen, picked)),
		[address, onScreen, picked],
	);
	useEffect(() => {
		readingChanged(reading);
	}, [reading, readingChanged]);

	return (
		<div
			data-slot="pane-stage"
			data-pane={paneId}
			ref={attachStage}
			className="relative flex min-h-0 min-w-0 flex-1 flex-col"
		>
			{address === null ? null : (
				<PaneDiagram
					address={address}
					openCode={session.openCode}
					onReading={setOnScreen}
					driven={asked}
					{...props}
				/>
			)}
		</div>
	);
}

/** What one pane's diagram is drawn from. */
interface PaneDiagramProps extends ApplicationPaneProps {
	/** The board and variant the pane is on. */
	readonly address: SemanticTarget;
	/**
	 * Open the code a subject is bound to.
	 * @param subjectId The semantic id.
	 */
	readonly openCode: (subjectId: string) => void;
	/**
	 * What the stage is actually reading, whenever it changes.
	 * @param reading The board, variant, view and selection on screen.
	 */
	readonly onReading: (reading: SemanticPaneReading) => void;
	/** A walkthrough step somebody narrating it asked for, or null. */
	readonly driven: PanePresentRequest | null;
}

/**
 * The board this pane is showing.
 *
 * Split from the pane so that the session's lifecycle and the picture's props
 * are two small things rather than one long one: nothing here touches the
 * socket, and nothing above it knows what a view or a walkthrough is.
 * @param props The pane's inputs, its address and its code opener.
 * @returns The drawn board.
 */
function PaneDiagram(props: PaneDiagramProps): JSX.Element {
	const { address, openCode, onPick, picked, view } = props;
	const onSelect = useCallback(
		(id: string | null, subject?: SelectedSubject): void => {
			onPick(id === null ? null : pickedSubject(id, subject));
		},
		[onPick],
	);
	const onOpenCode = useCallback((): void => {
		if (picked !== null) {
			openCode(picked.id);
		}
	}, [openCode, picked]);
	return (
		<SemanticBoardStage
			board={address.board}
			variant={address.variant}
			onVariantChange={props.onVariantChange}
			view={view === null ? undefined : view}
			onViewChange={props.onViewChange}
			theme={props.theme}
			selection={picked === null ? null : picked.id}
			onSelect={onSelect}
			onOpenCode={onOpenCode}
			onReading={props.onReading}
			driven={props.driven}
			onNarrate={props.onNarrate}
			overlay={props.overlay}
			reducedMotion={props.reducedMotion}
		/>
	);
}

/**
 * One picked subject, as the reading reports it: the id always, and whatever
 * the viewer knew about it.
 * @param id The semantic id.
 * @param subject What the viewer said it is, when it said.
 * @returns The subject reference.
 */
function pickedSubject(id: string, subject: SelectedSubject | undefined): PickedSubject {
	if (subject === undefined) {
		return { id };
	}
	return {
		id,
		kind: subject.kind,
		...(subject.name === undefined ? {} : { name: subject.name }),
	};
}

export { ApplicationPane, type ApplicationPaneProps };
