// One pane as the application mounts it: its session with the server, and the
// semantic board it is showing drawn inside it.
//
// The session and the picture are deliberately one component. A pane's
// identity to the server — its client id, its registration, the socket every
// announcement arrives on — belongs to the pane, and the board it shows is
// whatever the server has pointed it at. Mounting them together is what makes
// "this pane is showing that board" one fact rather than two that can drift.

import { memo, useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";

import { boardAncestors } from "#ui/rules/board-catalog/outline.ts";
import { useVaultBoards } from "#ui/hooks/board-catalog/use-vault-boards.ts";
import { useVaultPolicyRefresh } from "#ui/hooks/vault-diagnostics/use-vault-check.ts";

import { PartSearchHost } from "#ui/components/application/PartSearchHost.tsx";
import { useDrillRepositories } from "#ui/hooks/application/use-drill-repositories.ts";
import type { PaneCallbacks } from "#ui/hooks/application/use-panes.ts";
import type { PickedSubject } from "#ui/hooks/application/use-pane-reading.ts";
import { readingOf } from "#ui/rules/application/pane-reading.ts";
import type { PaneHandles } from "#ui/state/application/pane-handles.ts";
import { NOTHING_READ } from "#ui/state/pane-session/pane-reading.ts";
import { usePaneSession } from "#ui/hooks/pane-session/use-pane-session.ts";
import {
	type PaneSessionOptions,
	type PaneTheme,
} from "#ui/rules/pane-session/session-contracts.ts";
import {
	createPaneWorkbenchSocketOwner,
	type PaneWorkbenchSocketOwner,
} from "#ui/clients/pane-session/workbench-socket.ts";
import {
	boardAddressOf,
	type SemanticPaneReading,
	type SemanticTarget,
} from "#ui/rules/semantic-board-canvas/board/address.ts";
import { NoBoardHeader } from "#ui/components/semantic-board-canvas/PaneHeader.tsx";
import { PaneVaultContext } from "#ui/state/semantic-board-canvas/pane-vault.ts";
import { RepositoryPlacesContext } from "#ui/state/semantic-board-canvas/repository-places.ts";
import {
	SemanticBoardStage,
	type SemanticBoardStageProps,
} from "#ui/components/semantic-board-canvas/SemanticBoardStage.tsx";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import { type SelectedSubject } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import { type WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";
import {
	createBrowserWorkbenchTransport,
	type BrowserWorkbenchTransport,
} from "@archboard/codex-realtime-voice/controllers";
import type { PanePresentRequestSchema } from "@archboard/board/pane-context";
import type { z } from "zod";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";

type SemanticPanePart = NonNullable<z.infer<typeof SemanticPaneContextSchema>["byUser"]>[number];
type PanePresentRequest = z.infer<typeof PanePresentRequestSchema>;

/** Inputs for one application pane. */
interface ApplicationPaneProps {
	paneId: string;
	primary: boolean;
	focused: boolean;
	theme: PaneTheme;
	callbacks: PaneCallbacks;
	handles: PaneHandles;
	/** Which of the board's views this pane reads it through, or null for all of it. */
	view: string | null;
	/**
	 * The person chose a different way of reading this board.
	 * @param view The view's id, or null for the overview.
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
	/** Narrating this pane's walkthroughs aloud, when the shell can start voice for it. */
	narration?: WalkthroughNarration | undefined;
	/** What the shell lays over this pane's picture, such as subtitles of the voice running for it. */
	overlay?: ReactNode;
	/** Whether the person asked for reduced motion. */
	reducedMotion: boolean;
	/** The vault the pane opens in, until the server moves it (ADR 0050). */
	openingVault: string;
	/**
	 * Show a board in this pane: where a part its search found is, or where a drill-down leads.
	 * @param key The board key.
	 * @param repository The repository the board is in; the pane's own when none is named.
	 * @returns Whether the pane shows it now.
	 */
	onOpenBoard: (key: string, repository?: string) => Promise<boolean>;
	/** A walkthrough step the page moves this pane to itself (a recording, TASK-304), or null. */
	step?: SemanticBoardStageProps["driven"];
	/** The pane is a recording page's, which the server leaves out of addressing (TASK-304). */
	recording?: boolean;
	/**
	 * Hear what this pane is reading, as well as reporting it (a recording, TASK-304).
	 * @param reading The board, variant, view, selection and presentation on screen.
	 */
	onSemanticReading?: ((reading: SemanticPaneReading) => void) | undefined;
}

/** The pane-bound callbacks the shared ones cannot supply. */
interface BoundCallbacks {
	onBoardError: (error: string) => void;
	onLayoutRequest: (request: "open" | "close") => void;
	createWorkbenchSockets: () => PaneWorkbenchSocketOwner<BrowserWorkbenchTransport>;
}

/**
 * The session options for one pane over the shared callbacks.
 * @param props The pane's inputs.
 * @param bound The pane-bound callbacks.
 * @returns The options.
 */
function optionsFor(
	props: ApplicationPaneProps,
	bound: BoundCallbacks,
): PaneSessionOptions<BrowserWorkbenchTransport> {
	const { callbacks } = props;
	return {
		paneId: props.paneId,
		primary: props.primary,
		focused: props.focused,
		recording: props.recording === true,
		theme: props.theme,
		openingVault: props.openingVault,
		onStatus: callbacks.onStatus,
		onHolder: callbacks.onHolder,
		onPaneStateAccepted: callbacks.onPaneStateAccepted,
		onPaneReconnected: callbacks.onPaneReconnected,
		onPaneRetired: callbacks.onPaneRetired,
		onStaleFrontend: callbacks.onStaleFrontend,
		onCodeTargetNotice: callbacks.onCodeTargetNotice,
		onAgentActivity: callbacks.onAgentActivity,
		onRepositoriesChanged: callbacks.onRepositoriesChanged,
		onBoardAdopted: callbacks.onBoardAdopted,
		onBoardError: bound.onBoardError,
		onLayoutRequest: bound.onLayoutRequest,
		createWorkbenchSockets: bound.createWorkbenchSockets,
	};
}

/**
 * The callbacks one pane binds to itself, which the shared ones cannot supply.
 * @param props The pane's inputs.
 * @returns The bound callbacks, stable while the pane is.
 */
function useBoundCallbacks(props: ApplicationPaneProps): BoundCallbacks {
	const { paneId, callbacks, handles } = props;
	const onBoardError = useCallback(
		(error: string): void => callbacks.onBoardError(paneId, error),
		[callbacks, paneId],
	);
	const onLayoutRequest = useCallback(
		(request: "open" | "close"): void => callbacks.onLayoutRequest(paneId, request),
		[callbacks, paneId],
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
 * @param props The pane's identity, facets, theme, callbacks, handles and reading.
 * @returns The mounted pane.
 */
function ApplicationPane(props: ApplicationPaneProps): JSX.Element {
	const { paneId, callbacks, picked, onSemanticReading } = props;
	// What the stage says is on screen, which is the only place it is known.
	const [onScreen, setOnScreen] = useState<SemanticPaneReading | null>(null);
	const showReading = useCallback(
		(shown: SemanticPaneReading): void => {
			setOnScreen(shown);
			onSemanticReading?.(shown);
		},
		[onSemanticReading],
	);
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
	const { attachPaneElement, openedKey, readingChanged, vault } = session;
	// The pictures of the vault this pane is in follow that vault's policy.
	useVaultPolicyRefresh(vault);
	// Registration and departure are two different events, and they are two
	// effects for that reason. `usePaneSession` hands back a fresh object every
	// render — its board, its holder and what an agent is doing all change under
	// it — so a single effect with the session in its dependencies would report
	// the pane gone and back on every ordinary piece of news. The workbench
	// answers "gone" by tearing down the pane's media and its thread binding, so
	// that is not a re-registration, it is a disconnection per render.
	useEffect(() => {
		callbacks.onSession(paneId, session);
	}, [callbacks, paneId, session]);
	useEffect(() => () => callbacks.onSession(paneId, null), [callbacks, paneId]);
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
			{address === null ? (
				<NoBoard />
			) : (
				// Every read the picture makes names the vault this pane is in (ADR 0050).
				<PaneVaultContext value={vault}>
					<PaneDiagram
						address={address}
						arrival={session.arrivals}
						openCode={session.openCode}
						onReading={showReading}
						onUserChanged={session.userChanged}
						driven={props.step ?? asked}
						shown={onScreen?.board ?? null}
						{...props}
					/>
				</PaneVaultContext>
			)}
		</div>
	);
}

/**
 * A pane the server has pointed at no board, as in a vault with none or before
 * the server first answers: the header row every pane has, which says so and
 * keeps the pane's controls, its socket's trouble and a claim, over the ground
 * an empty board is drawn on. The navigator says why there is no board.
 * @returns The header and the empty ground.
 */
function NoBoard(): JSX.Element {
	return (
		<>
			<NoBoardHeader />
			<div className="bg-background min-h-0 flex-1" />
		</>
	);
}

/** What one pane's diagram is drawn from. */
interface PaneDiagramProps extends ApplicationPaneProps {
	/** The board and variant the pane is on. */
	readonly address: SemanticTarget;
	/** Which time the server has pointed the pane at a board, which leaves a drill-down. */
	readonly arrival: number;
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
	/**
	 * The user asked, by hand, for a part of the reading to change (ADR 0034).
	 * @param part The part their gesture was about.
	 */
	readonly onUserChanged: (part: SemanticPanePart) => void;
	/** A walkthrough step somebody narrating it asked for, or the page recording it chose, or null. */
	readonly driven: SemanticBoardStageProps["driven"];
	/** The board on screen, the drilled-into one when there is one, or null before the stage says. */
	readonly shown: string | null;
}

/**
 * The board this pane is showing.
 *
 * Split from the pane so that the session's lifecycle and the picture's props
 * are two small things rather than one long one: nothing here touches the
 * socket, and nothing above it knows what a view or a walkthrough is. It is
 * drawn again only when what it is drawn from changes: the pane's session
 * hears who holds the board, what an agent is doing and whether the socket is
 * up, and none of that is anything the picture shows (TASK-385.03).
 * @param props The pane's inputs, its address and its code opener.
 * @returns The drawn board.
 */
const PaneDiagram = memo(function PaneDiagram(props: PaneDiagramProps): JSX.Element {
	const { address, openCode, onPick, onUserChanged, onViewChange, picked, view } = props;
	const { shown, onOpenBoard: openBoard } = props;
	const { boards, outline } = useVaultBoards(usePaneVault());
	const { places, dive } = useDrillRepositories(openBoard);
	const onOpenBoard = useCallback(
		(key: string): void => {
			void openBoard(key);
		},
		[openBoard],
	);
	// Where a board sits, as the navigator places it: each board above, a way to it here.
	const placeOf = useCallback(
		(board: string) =>
			boardAncestors(outline, board).map((above) => ({
				name: above.name,
				level: above.level,
				/** Show the board above in this pane. */
				open: (): void => {
					onOpenBoard(above.key);
				},
			})),
		[outline, onOpenBoard],
	);
	// The pick a search makes is the person's hand, as a click on the picture is.
	const onFound = useCallback(
		(subject: PickedSubject): void => {
			onUserChanged("selection");
			onPick(subject);
		},
		[onPick, onUserChanged],
	);
	// The search picks on the board on screen, which after a drill-down is not the
	// one the server pointed the pane at.
	const search = useMemo(
		() => (
			<PartSearchHost boards={boards} shown={shown} onPick={onFound} onOpenBoard={onOpenBoard} />
		),
		[boards, shown, onFound, onOpenBoard],
	);
	// The stage calls these from a click or a key and from nothing else: a walkthrough step
	// highlights its subjects and reads through its own view without going through either, and
	// a pane that moves has its pick cleared above this. So this is where the user's hand is.
	const onSelect = useCallback(
		(id: string | null, subject?: SelectedSubject): void => {
			onUserChanged("selection");
			onPick(id === null ? null : pickedSubject(id, subject));
		},
		[onPick, onUserChanged],
	);
	const onView = useCallback(
		(next: string | null): void => {
			onUserChanged("view");
			onViewChange(next);
		},
		[onUserChanged, onViewChange],
	);
	const onOpenCode = useCallback((): void => {
		if (picked !== null) {
			openCode(picked.id);
		}
	}, [openCode, picked]);
	return (
		<RepositoryPlacesContext value={places}>
			<SemanticBoardStage
				board={address.board}
				variant={address.variant}
				arrival={props.arrival}
				onVariantChange={props.onVariantChange}
				view={view === null ? undefined : view}
				onViewChange={onView}
				selection={picked === null ? null : picked.id}
				onSelect={onSelect}
				onUserChanged={onUserChanged}
				onOpenCode={onOpenCode}
				onReading={props.onReading}
				driven={props.driven}
				narration={props.narration}
				overlay={props.overlay}
				reducedMotion={props.reducedMotion}
				search={search}
				placeOf={placeOf}
				onDive={dive}
			/>
		</RepositoryPlacesContext>
	);
});

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
