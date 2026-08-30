// The archboard shell.
//
// Excalidraw used to be the application; this inverts that. The shell owns the
// chrome, the board identity, the destructive actions and the pane layout, and
// *hosts* canvases. A canvas is a component with a hook, so the number of them
// on screen is a piece of shell state (`panes`) rather than an architectural
// question — which is the seam TASK-006 (panes reporting what the human is
// looking at) lands on.

import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { CanvasPane } from "../canvas/CanvasPane";
import { activateCodeTarget } from "../code-target";
import { SelectionInspector } from "../selection-inspector/SelectionInspector";
import type { PaneSelectionSnapshot, SelectionProjection } from "../selection-inspector";
import type { PanePathFocusSnapshot, PathFocusController, PathFocusSnapshot } from "../path-focus";
import { BoardBar } from "./BoardBar";
import { BoardNavigator } from "./BoardNavigator";
import { AgentWorkbench } from "./AgentWorkbench";
import { BoardDialog, type BoardDialogMode } from "./BoardDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { ConflictDialog } from "./ConflictDialog";
import { InstallLibraryDialog } from "./InstallLibraryDialog";
import { OpenerSettingsDialog } from "../opener-settings";
import { Icon } from "./Icons";
import {
	createFullscreenPresentation,
	type FullscreenPresentation,
	type FullscreenPresentationSnapshot,
} from "./fullscreen-presentation";
import { useLibrary } from "./useLibrary";
import {
	BoardConflictError,
	clearBoard,
	fetchBoardInfo,
	fetchBoards,
	newBoard,
	openBoard,
	saveBoard,
} from "../canvas/api";
import type { SaveRequest } from "../canvas/api";
import {
	GitHubHttpsUrlSchema,
	type CodeTargetNotice,
	type CodeTargetNoticeAction,
} from "../../shared/code-target";
import type {
	BoardHold,
	BoardInfo,
	BoardListing,
	BoardSaveResult,
	BoardWriteConflict,
	LockHolder,
	PaneRef,
	PaneStatus,
} from "../types";

const THEME_KEY = "archboard-theme";

// How many panes the shell lays out. The grid has a column rule for two
// (shell.css) and the canvas server refuses to ask for a third, so this is the
// same number said in the one place that renders it. It mirrors MAX_PANES in
// src/runtime/engine/panes.ts, which is where the server's copy lives.
const MAX_PANES = 2;
const EMPTY_PRESENTATION: FullscreenPresentationSnapshot = Object.freeze({
	paneId: null,
	error: null,
});
const EMPTY_SELECTION: SelectionProjection = Object.freeze({ state: "empty" });
const EMPTY_PATH_FOCUS: PathFocusSnapshot = Object.freeze({ state: "inactive" });
const readEmptyPresentation = (): FullscreenPresentationSnapshot => EMPTY_PRESENTATION;
const subscribeToNothing = (): (() => void) => () => undefined;

function initialTheme(): "light" | "dark" {
	if (typeof window === "undefined") return "light";
	try {
		const saved = window.localStorage?.getItem(THEME_KEY);
		if (saved === "light" || saved === "dark") return saved;
	} catch {
		/* private mode */
	}
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// `hold` keeps a notice up until it is clicked away. A message that tells you
// what to type is no use if it leaves before you have typed it.
interface Notice {
	kind: "info" | "error";
	text: string;
	hold?: boolean;
	actions?: readonly CodeTargetNoticeAction[];
}
interface AgentState {
	heldBy: LockHolder | null;
	takeBack: () => void;
}

interface ConflictState {
	conflict: BoardWriteConflict;
	request: SaveRequest;
	hold?: BoardHold | null;
}

/** "the only pane", "the left pane", "the left and right panes". */
function listPanes(refs: PaneRef[]): string {
	const places = refs.map((ref) => (ref.place === "the only pane" ? "only" : ref.place));
	if (places.length === 1) return `the ${places[0]} pane`;
	return `the ${places.slice(0, -1).join(", ")} and ${places[places.length - 1]} panes`;
}

/**
 * What to say about a save. Three acts wear one button (ADR 0012), and the one
 * that needs saying out loud is the branch: it writes a second board and puts
 * it nowhere, so the message names the panes still holding the source and the
 * command that puts the branch on screen.
 */
function saveNotice(saved: BoardSaveResult, paneCount: number): Notice {
	const wrote = saved.forced
		? `Overwrote ${saved.file}. Whatever that note held is gone.`
		: `Saved "${saved.board}" to ${saved.file}.`;
	const moved = saved.panes?.moved ?? [];
	const kept = saved.panes?.kept ?? [];

	// The board had stopped saving and this is one of the two outcomes that end
	// that, so the news is not the file it wrote but that the drawing is written
	// down again — and, for a save elsewhere, which board is now which.
	const ended = saved.resolvedHold;
	if (ended) {
		const held = `${ended.writes} change${ended.writes === 1 ? "" : "s"}`;
		return {
			kind: "info",
			hold: true,
			text:
				ended.outcome === "overwrite"
					? `${wrote} "${ended.board}" is saving again, with the ${held} that were held on the canvas.`
					: `${wrote} The ${held} that were held are in it, and the panes are showing it. ` +
						`"${ended.board}" is saving again and holds the version the other editor wrote.`,
		};
	}

	if (saved.saveKind === "branch") {
		const source = `"${saved.savedFrom}"`;
		const stayed = kept.length
			? `${listPanes(kept)} still ${kept.length > 1 ? "hold" : "holds"} ${source}`
			: `no pane was holding ${source}`;
		// `pane open` makes a pane rather than taking one, so it is the move that
		// cannot overwrite the board being read. It has nowhere to go once the
		// shell is full, and then the only way up is over a board on screen.
		const show =
			paneCount < MAX_PANES
				? `Put it up beside this one with \`pane open --board ${saved.board}\`.`
				: `Both panes are full, so put it up with \`board open ${saved.board} --pane left\`` +
					" or `--pane right`, which replaces the board in that pane.";
		return {
			kind: "info",
			hold: true,
			text:
				`${wrote} That branches ${source}, and a branch moves nothing: ` +
				`${stayed}, and the branch is not on screen anywhere. ${show}`,
		};
	}

	if (moved.length) {
		return {
			kind: "info",
			text: `${wrote} It is showing in ${listPanes(moved)}, which held "${saved.savedFrom}".`,
		};
	}

	return { kind: "info", text: wrote };
}

function canvasPresentation(
	paneId: string,
	presentedPaneId: string | null,
): "current" | "hidden" | null {
	if (!presentedPaneId) return null;
	return paneId === presentedPaneId ? "current" : "hidden";
}

function presentationNotice(
	presentation: FullscreenPresentationSnapshot,
	notice: Notice | null,
): Notice | null {
	if (presentation.error && !presentation.paneId) {
		return { kind: "error", text: presentation.error, hold: true };
	}
	return notice;
}

function shellClassName(presentedPaneId: string | null): string {
	return presentedPaneId ? "shell shell-presenting" : "shell";
}

interface PresentationDockProps {
	panes: string[];
	presentation: FullscreenPresentationSnapshot;
	dockRef: React.RefObject<HTMLDivElement | null>;
	onTransfer: React.MouseEventHandler<HTMLButtonElement>;
	onExit: () => void;
}

function PresentationDock({
	panes,
	presentation,
	dockRef,
	onTransfer,
	onExit,
}: PresentationDockProps): React.JSX.Element | null {
	if (!presentation.paneId) return null;
	return (
		<div
			className="presentation-dock"
			role="toolbar"
			aria-label="Presentation controls"
			tabIndex={-1}
			ref={dockRef}
		>
			<fieldset className="presentation-panes">
				<legend>Canvas to present</legend>
				{panes.map((paneId, index) => (
					<button
						type="button"
						className="presentation-pane"
						key={paneId}
						data-pane-id={paneId}
						aria-pressed={presentation.paneId === paneId}
						aria-label={`Present Pane ${String.fromCharCode(65 + index)}`}
						onClick={onTransfer}
					>
						Pane {String.fromCharCode(65 + index)}
					</button>
				))}
			</fieldset>
			{presentation.error && <span role="alert">{presentation.error}</span>}
			<button type="button" className="presentation-exit" onClick={onExit}>
				<Icon name="close" size={17} />
				Exit
			</button>
		</div>
	);
}

function samePaneStatus(existing: PaneStatus, status: PaneStatus): boolean {
	// These nested values are replaced at their publication sites, never mutated
	// in place. Reference equality therefore includes every field they carry.
	const same = {
		paneId: existing.paneId === status.paneId,
		clientId: existing.clientId === status.clientId,
		connected: existing.connected === status.connected,
		board: existing.board === status.board,
		boardKey: existing.boardKey === status.boardKey,
		elementCount: existing.elementCount === status.elementCount,
		lastChangeAt: existing.lastChangeAt === status.lastChangeAt,
		hold: existing.hold === status.hold,
		writtenElsewhere: existing.writtenElsewhere === status.writtenElsewhere,
		doing: existing.doing === status.doing,
	} satisfies Record<keyof PaneStatus, boolean>;
	return Object.values(same).every(Boolean);
}

function focusedSelection(
	snapshots: Readonly<Record<string, PaneSelectionSnapshot>>,
	paneId: string,
	boardKey: string | null,
): SelectionProjection {
	const snapshot = snapshots[paneId];
	return snapshot?.boardKey === boardKey ? snapshot.projection : EMPTY_SELECTION;
}

function focusedPathFocus(
	snapshots: Readonly<Record<string, PanePathFocusSnapshot>>,
	paneId: string,
	boardKey: string | null,
): PathFocusSnapshot {
	const snapshot = snapshots[paneId];
	return snapshot?.boardKey === boardKey ? snapshot.projection : EMPTY_PATH_FOCUS;
}

function createAttemptSave(args: {
	run: (work: () => Promise<void>) => Promise<void>;
	status: PaneStatus | null;
	boardKey: string | null;
	refreshBoardInfo: (key: string | null) => Promise<void>;
	refreshBoardListing: () => Promise<void>;
	panes: number;
	hold: BoardHold | null;
	setBoardInfo: React.Dispatch<React.SetStateAction<BoardInfo | null>>;
	setDialog: React.Dispatch<React.SetStateAction<BoardDialogMode | null>>;
	setDialogError: React.Dispatch<React.SetStateAction<string | null>>;
	setConflict: React.Dispatch<React.SetStateAction<ConflictState | null>>;
	setNotice: React.Dispatch<React.SetStateAction<Notice | null>>;
}): (request: SaveRequest) => void {
	return (request) => {
		void args.run(async () => {
			try {
				const saved = await saveBoard({
					clientId: args.status?.clientId,
					...request,
				});
				const kind = saved.saveKind ?? "same-board";
				const holdingIt =
					kind === "branch"
						? false
						: kind === "named"
							? (saved.panes?.moved ?? []).some((pane) => pane.clientId === args.status?.clientId)
							: saved.board === args.boardKey;
				if (holdingIt) args.setBoardInfo(saved);
				else void args.refreshBoardInfo(args.boardKey);
				args.setDialog(null);
				args.setConflict(null);
				args.setNotice(saveNotice(saved, args.panes));
				void args.refreshBoardListing();
			} catch (error) {
				if (!(error instanceof BoardConflictError)) throw error;
				args.setDialog(null);
				args.setDialogError(null);
				args.setConflict({
					conflict: error.conflict,
					request,
					hold: error.held ?? args.hold,
				});
			}
		});
	};
}

export function Shell(): React.JSX.Element {
	// A pane is a slot holding its own canvas. One is the normal case; the list
	// is what makes a second one a mount rather than a rewrite.
	const [panes, setPanes] = useState<string[]>(["pane-1"]);
	const [focused, setFocused] = useState("pane-1");
	const [statuses, setStatuses] = useState<Record<string, PaneStatus>>({});
	const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
	const [selectionSnapshots, setSelectionSnapshots] = useState<
		Record<string, PaneSelectionSnapshot>
	>({});
	const [pathFocusSnapshots, setPathFocusSnapshots] = useState<
		Record<string, PanePathFocusSnapshot>
	>({});
	const pathFocusControllersRef = useRef<Record<string, PathFocusController>>({});
	// Pane ids are never reused. Numbering by list length would assign a reopened
	// pane the id of the one just closed, and the server keys a pane's selection
	// and its board by that id.
	const nextPaneNumber = useRef(2);
	const shellElementRef = useRef<HTMLDivElement | null>(null);
	const presentationOwnerRef = useRef<FullscreenPresentation | null>(null);
	const [presentationOwner, setPresentationOwner] = useState<FullscreenPresentation | null>(null);
	const attachShellRoot = useCallback((root: HTMLDivElement | null): void => {
		if (shellElementRef.current === root) return;
		const previous = presentationOwnerRef.current;
		if (previous) {
			if (!root) previous.rootRemoved();
			previous.dispose();
		}
		shellElementRef.current = root;
		const next = root ? createFullscreenPresentation(root) : null;
		presentationOwnerRef.current = next;
		setPresentationOwner(next);
	}, []);
	const presentation = useSyncExternalStore(
		presentationOwner?.subscribe ?? subscribeToNothing,
		presentationOwner?.getSnapshot ?? readEmptyPresentation,
		readEmptyPresentation,
	);
	const panesRef = useRef(panes);
	useLayoutEffect(() => {
		panesRef.current = panes;
	}, [panes]);

	// Layout can now be changed from outside the browser (`archboard pane open`),
	// so these are the shell's two moves, reachable from the buttons and from a
	// request arriving on a pane's socket.
	const addPane = useCallback(() => {
		setPanes((previous) => {
			const next =
				previous.length >= MAX_PANES ? previous : [...previous, `pane-${nextPaneNumber.current++}`];
			panesRef.current = next;
			return next;
		});
	}, []);

	const closePane = useCallback((paneId: string) => {
		const currentPanes = panesRef.current;
		// Never the last one: an empty shell shows nothing and offers no way back.
		if (currentPanes.length < 2 || !currentPanes.includes(paneId)) return;
		const survivor = currentPanes.find((id) => id !== paneId) ?? null;
		const owner = presentationOwnerRef.current;
		const closingPresentation = owner?.getTargetPaneId() === paneId && survivor;
		if (closingPresentation) {
			// Transfer before removal and exit. If the browser refuses exit, the
			// mounted survivor remains visible instead of leaving a blank display.
			owner?.present(survivor);
			setFocused(survivor);
		}
		const next = currentPanes.filter((id) => id !== paneId);
		panesRef.current = next;
		setPanes(next);
		setSelectionSnapshots((previous) => {
			const { [paneId]: removed, ...remaining } = previous;
			void removed;
			return remaining;
		});
		setPathFocusSnapshots((previous) => {
			const { [paneId]: removed, ...remaining } = previous;
			void removed;
			return remaining;
		});
		const { [paneId]: removedController, ...remainingControllers } =
			pathFocusControllersRef.current;
		void removedController;
		pathFocusControllersRef.current = remainingControllers;
		if (closingPresentation) owner?.exit();
	}, []);

	// The canvas server owns the layout request; the shell owns the layout. A
	// pane hands one up when the request arrives on its socket.
	const handleLayoutRequest = useCallback(
		(paneId: string, request: "open" | "close") => {
			if (request === "open") addPane();
			else closePane(paneId);
		},
		[addPane, closePane],
	);

	const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
	const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);
	const [dialog, setDialog] = useState<BoardDialogMode | null>(null);
	const [dialogError, setDialogError] = useState<string | null>(null);
	const [confirmingClear, setConfirmingClear] = useState(false);
	const [openerSettingsOpen, setOpenerSettingsOpen] = useState(false);
	// The human has clicked the mark saying somebody else wrote this board's note
	// (TASK-062). Not the mark going up: that is a state of the board and it puts
	// nothing in front of anybody.
	const [askingAboutNote, setAskingAboutNote] = useState(false);
	// A refused save, plus the request that was refused — so "overwrite" repeats
	// exactly the save the human already asked for, rather than a rebuilt guess —
	// plus the hold, when this board has stopped saving altogether. The hold is
	// what turns the dialog from a report of one refused save into a choice about
	// a board, and it is set both when the human clicks the mark in the bar and
	// when a save runs into the same wall.
	const [conflict, setConflict] = useState<ConflictState | null>(null);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<Notice | null>(null);
	const presentButtonRef = useRef<HTMLButtonElement | null>(null);
	const presentationDockRef = useRef<HTMLDivElement | null>(null);
	const wasPresenting = useRef(false);

	useEffect(() => {
		if (presentation.paneId) presentationDockRef.current?.focus();
		else if (wasPresenting.current) presentButtonRef.current?.focus();
		wasPresenting.current = presentation.paneId !== null;
	}, [presentation.paneId]);

	// One palette behind however many panes are on screen, held on the server so
	// that a second tab, a second machine and the agent all see the same one.
	const library = useLibrary();
	const [boardListing, setBoardListing] = useState<BoardListing | null>(null);
	const [boardListingError, setBoardListingError] = useState<string | null>(null);

	const refreshBoardListing = useCallback(async () => {
		try {
			setBoardListing(await fetchBoards());
			setBoardListingError(null);
		} catch (error) {
			setBoardListingError((error as Error).message);
		}
	}, []);

	const onStatus = useCallback((status: PaneStatus) => {
		setStatuses((previous) => {
			const existing = previous[status.paneId];
			if (existing && samePaneStatus(existing, status)) return previous;
			return { ...previous, [status.paneId]: status };
		});
	}, []);

	const onAgentState = useCallback(
		(paneId: string, heldBy: LockHolder | null, takeBack: () => void) => {
			setAgentStates((previous) => {
				const existing = previous[paneId];
				if (existing?.heldBy === heldBy && existing.takeBack === takeBack) return previous;
				return { ...previous, [paneId]: { heldBy, takeBack } };
			});
		},
		[],
	);
	const onSelectionSnapshot = useCallback(
		(paneId: string, snapshot: PaneSelectionSnapshot): void => {
			setSelectionSnapshots((previous) => ({
				...previous,
				[paneId]: snapshot,
			}));
		},
		[],
	);
	const onPathFocusSnapshot = useCallback(
		(paneId: string, snapshot: PanePathFocusSnapshot): void => {
			setPathFocusSnapshots((previous) => ({ ...previous, [paneId]: snapshot }));
		},
		[],
	);
	const onPathFocusController = useCallback(
		(paneId: string, controller: PathFocusController | null): void => {
			if (controller) {
				pathFocusControllersRef.current = {
					...pathFocusControllersRef.current,
					[paneId]: controller,
				};
				return;
			}
			const { [paneId]: removed, ...remaining } = pathFocusControllersRef.current;
			void removed;
			pathFocusControllersRef.current = remaining;
		},
		[],
	);

	const status = statuses[focused] ?? statuses[panes[0] ?? ""] ?? null;
	const agentState = agentStates[focused] ?? agentStates[panes[0] ?? ""] ?? null;
	const focusedPaneLabel = `Pane ${String.fromCharCode(65 + Math.max(0, panes.indexOf(focused)))}`;
	const visibleNotice = presentationNotice(presentation, notice);
	const boardKey = status?.boardKey ?? null;
	const inspectedSelection = focusedSelection(selectionSnapshots, focused, boardKey);
	const inspectedPathFocus = focusedPathFocus(pathFocusSnapshots, focused, boardKey);
	const identity = status?.board ?? boardInfo?.identity ?? null;
	// Whether the board in front of the human is being written down. It comes
	// from the pane rather than being asked for, because the pane is what finds
	// out — the write it made was the one that was refused (TASK-079).
	const hold = status?.hold ?? null;
	// Whether the note behind that board is still the one this pane came from.
	// From the pane for the same reason, and it says a different thing: a hold is
	// a write that was refused, this is a write that has not happened yet
	// (TASK-062).
	const writtenElsewhere = status?.writtenElsewhere ?? null;
	useEffect(() => {
		const timer = window.setTimeout(() => void refreshBoardListing(), 0);
		return () => window.clearTimeout(timer);
	}, [refreshBoardListing]);

	useEffect(() => {
		try {
			window.localStorage?.setItem(THEME_KEY, theme);
		} catch {
			/* private mode */
		}
	}, [theme]);

	// Whoever closed a pane — the button, or a command from outside the browser
	// — the focus has to land somewhere that still exists.
	useEffect(() => {
		if (!panes.includes(focused)) {
			const timer = window.setTimeout(() => setFocused(panes[0] ?? "pane-1"), 0);
			return () => window.clearTimeout(timer);
		}
	}, [panes, focused]);

	// The page title is the board, because a tab in a taskbar is one of the
	// places somebody looks to answer "which board am I on".
	useEffect(() => {
		const name = identity
			? identity.board + (identity.variant === "current" ? "" : `@${identity.variant}`)
			: "no board";
		const level = identity?.level ? ` · ${identity.level}` : "";
		document.title = `${name}${level} · archboard`;
	}, [identity]);

	// About the board in the pane being worked in, named explicitly. The server
	// has no "current board" to ask for, and asking for one would be asking it
	// to guess which of two panes the chrome is describing (ADR 0009).
	const refreshBoardInfo = useCallback(async (key: string | null) => {
		if (!key) {
			setBoardInfo(null);
			return;
		}
		try {
			setBoardInfo(await fetchBoardInfo(key));
		} catch (error) {
			void error;
		}
	}, []);

	useEffect(() => {
		const timer = window.setTimeout(() => void refreshBoardInfo(boardKey), 0);
		return () => window.clearTimeout(timer);
	}, [refreshBoardInfo, boardKey]);

	const run = useCallback(
		async (work: () => Promise<void>) => {
			setBusy(true);
			setDialogError(null);
			try {
				await work();
			} catch (error) {
				const text = (error as Error).message;
				if (dialog) setDialogError(text);
				else setNotice({ kind: "error", text });
			} finally {
				setBusy(false);
			}
		},
		[dialog],
	);

	// Every path that writes the vault goes through this one save action, so there
	// is exactly one place that knows a save can come back refused.
	const attemptSave = useMemo(
		() =>
			createAttemptSave({
				run,
				status,
				boardKey,
				refreshBoardInfo,
				refreshBoardListing,
				panes: panes.length,
				hold,
				setBoardInfo,
				setDialog,
				setDialogError,
				setConflict,
				setNotice,
			}),
		[run, status, boardKey, refreshBoardInfo, refreshBoardListing, panes.length, hold],
	);

	// A board is opened INTO a pane. Always name the focused pane when the shell
	// knows it: another browser tab may have registered a pane even when this
	// particular shell is not split, and the server must never guess between
	// them. An explicit picker choice still wins.
	const paneTarget = useCallback(
		(address: { pane?: string }): { pane?: string } =>
			address.pane ? { pane: address.pane } : status ? { pane: status.clientId } : {},
		[status],
	);

	const handleOpen = useCallback(
		(address: { board: string; variant?: string; level?: string; pane?: string }): void =>
			void run(async () => {
				const opened = await openBoard({ ...address, ...paneTarget(address) });
				setBoardInfo(opened);
				setDialog(null);
				setNotice({ kind: "info", text: `Opened ${opened.board}.` });
				void refreshBoardListing();
			}),
		[paneTarget, refreshBoardListing, run],
	);

	const handleNew = useCallback(
		(address: { board: string; variant?: string; level?: string; pane?: string }): void =>
			void run(async () => {
				const created = await newBoard({ ...address, ...paneTarget(address) });
				setBoardInfo(created);
				setDialog(null);
				setNotice({
					kind: "info",
					text: `${created.board} started. It is not in the vault until you save it.`,
				});
				void refreshBoardListing();
			}),
		[paneTarget, refreshBoardListing, run],
	);

	const handleNavigate = useCallback(
		(key: string): void => {
			const showing = panes.find((paneId) => statuses[paneId]?.boardKey === key);
			if (showing) {
				setFocused(showing);
				return;
			}
			handleOpen({ board: key });
		},
		[handleOpen, panes, statuses],
	);

	const handleSaveAs = useCallback(
		(address: { board: string; variant?: string; level?: string }): void => {
			if (!boardKey) return;
			attemptSave({
				board: boardKey,
				name: address.board,
				variant: address.variant,
				level: address.level,
			});
		},
		[attemptSave, boardKey],
	);

	// Every gesture on a named board is already written through to its note.
	// Scratch is the one exception that needs an explicit action: not to save
	// the drawing, but to give it a durable address in the vault.
	const handleNameBoard = useCallback((): void => {
		if (!boardKey || !boardInfo?.placeholder) return;
		setDialog("save-as");
	}, [boardInfo?.placeholder, boardKey]);

	// The three ways out of a conflict. Each is the human picking which copy
	// survives; the shell never picks one on its own.
	const handleReload = useCallback((): void => {
		const key = conflict?.conflict.board;
		if (!key) return;
		// What it cost, said afterwards as well as before. This is the one outcome
		// that ends work rather than writing it somewhere, so the notice holds
		// until it is clicked away.
		const discarded = conflict?.hold?.writes ?? 0;
		void run(async () => {
			const opened = await openBoard({
				board: key,
				reload: true,
				...(panes.length > 1 && status ? { pane: status.clientId } : {}),
			});
			setBoardInfo(opened);
			setConflict(null);
			setNotice(
				discarded > 0
					? {
							kind: "info",
							hold: true,
							text:
								`Reloaded ${opened.board} from the vault. It is saving again, and the ` +
								`${discarded} change${discarded === 1 ? "" : "s"} held on the canvas ${discarded === 1 ? "is" : "are"} gone.`,
						}
					: { kind: "info", text: `Reloaded ${opened.board} from the vault.` },
			);
		});
	}, [conflict, panes.length, run, status]);

	// Asked for from the mark, before anything has been refused. One of ADR
	// 0006's three and not all three: nothing is held, so there is no held copy
	// to overwrite the note with and none to save elsewhere. Carrying on drawing
	// is the other answer and it is the Cancel.
	const handleTakeTheNote = useCallback((): void => {
		const key = writtenElsewhere?.board ?? boardKey;
		if (!key) return;
		void run(async () => {
			const opened = await openBoard({
				board: key,
				reload: true,
				...(panes.length > 1 && status ? { pane: status.clientId } : {}),
			});
			setBoardInfo(opened);
			setAskingAboutNote(false);
			setNotice({
				kind: "info",
				hold: true,
				text: `${opened.board} is now the note in the vault. What was on this canvas is gone.`,
			});
		});
	}, [boardKey, panes.length, run, status, writtenElsewhere?.board]);

	const handleOverwrite = useCallback((): void => {
		if (!conflict) return;
		attemptSave({ ...conflict.request, force: true });
	}, [attemptSave, conflict]);

	const handleClear = useCallback(
		(): void =>
			void run(async () => {
				// One call, not one DELETE per element: the server empties the board and
				// tells every pane, so nothing depends on this tab finishing the job.
				const result = await clearBoard(boardKey, status?.clientId ?? "");
				setConfirmingClear(false);
				setNotice({
					kind: "info",
					text: `Cleared ${result.count} element${result.count === 1 ? "" : "s"}.`,
				});
			}),
		[boardKey, run, status?.clientId],
	);

	const handleHoldClick = useCallback(() => {
		if (!hold) return;
		setDialogError(null);
		setConflict({
			conflict: hold.conflict,
			request: { board: hold.board },
			hold,
		});
	}, [hold]);
	const handleNoteClick = useCallback(() => setAskingAboutNote(true), []);
	const handleOpenDialog = useCallback(() => {
		setDialogError(null);
		setDialog("open");
	}, []);
	const handleNewDialog = useCallback(() => {
		setDialogError(null);
		setDialog("new");
	}, []);
	const handleClearDialog = useCallback(() => setConfirmingClear(true), []);
	const handleCloseLastPane = useCallback(() => {
		closePane(panes[panes.length - 1] ?? "");
	}, [closePane, panes]);
	const handleRefreshListing = useCallback(() => {
		void refreshBoardListing();
	}, [refreshBoardListing]);
	const handlePaneSelect = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
		const paneId = event.currentTarget.dataset.paneId;
		if (paneId) setFocused(paneId);
	}, []);
	const handlePresent = useCallback(() => {
		presentationOwner?.present(focused);
	}, [focused, presentationOwner]);
	const handlePresentationTransfer = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			const paneId = event.currentTarget.dataset.paneId;
			if (!paneId) return;
			setFocused(paneId);
			presentationOwner?.present(paneId);
		},
		[presentationOwner],
	);
	const handlePresentationExit = useCallback(() => presentationOwner?.exit(), [presentationOwner]);
	const handleBoardError = useCallback((error: string) => {
		setNotice({ kind: "error", text: error, hold: true });
	}, []);
	const handleCodeTargetNotice = useCallback((next: CodeTargetNotice) => {
		setNotice({
			kind: "error",
			text: next.message,
			hold: true,
			actions: next.actions,
		});
	}, []);
	const handleOpenSelectedCode = useCallback(
		(selectedBoard: string, elementId: string): void => {
			activateCodeTarget({
				boardKey: selectedBoard,
				elementId,
				onSuccess: () => undefined,
				onFailure: handleCodeTargetNotice,
			});
		},
		[handleCodeTargetNotice],
	);
	const handleFocusSelectedPath = useCallback((): void => {
		pathFocusControllersRef.current[focused]?.focus();
	}, [focused]);
	const handleExitPathFocus = useCallback((): void => {
		pathFocusControllersRef.current[focused]?.exit();
	}, [focused]);
	const handleOpenerSuccess = useCallback((message: string) => {
		setNotice({ kind: "info", text: message });
	}, []);
	const openOpenerSettings = useCallback(() => setOpenerSettingsOpen(true), []);
	const closeOpenerSettings = useCallback(() => setOpenerSettingsOpen(false), []);
	const handleDismissNotice = useCallback(() => {
		if (presentation.error && !presentation.paneId) presentationOwner?.clearError();
		else setNotice(null);
	}, [presentation.error, presentation.paneId, presentationOwner]);
	const handleCancelDialog = useCallback(() => {
		setDialog(null);
		setDialogError(null);
	}, []);
	const handleConflictSaveAs = useCallback(() => {
		setConflict(null);
		setDialogError(null);
		setDialog("save-as");
	}, []);
	const handleCancelConflict = useCallback(() => setConflict(null), []);
	const handleCancelNote = useCallback(() => setAskingAboutNote(false), []);
	const handleCancelClear = useCallback(() => setConfirmingClear(false), []);
	const visibleDoing = useMemo(() => status?.doing ?? [], [status?.doing]);
	const dialogPanes = useMemo(
		() =>
			panes.map((paneId, index) => ({
				clientId: statuses[paneId]?.clientId ?? paneId,
				label: `pane ${index + 1}`,
				board: statuses[paneId]?.boardKey ?? null,
			})),
		[panes, statuses],
	);

	useEffect(() => {
		if (!notice || notice.hold) return;
		const timer = setTimeout(() => setNotice(null), 9000);
		return () => clearTimeout(timer);
	}, [notice]);

	// A refused or failed library install says so in the same place everything
	// else does. It is taken off the library rather than left there, so the
	// notice bar stays the one thing that shows a message.
	const { error: libraryError, dismissError } = library;
	useEffect(() => {
		if (!libraryError) return;
		const timer = window.setTimeout(() => {
			setNotice({ kind: "error", text: libraryError });
			dismissError();
		}, 0);
		return () => window.clearTimeout(timer);
	}, [dismissError, libraryError]);

	const dialogContent = useMemo(
		() => (
			<>
				{dialog && (
					<BoardDialog
						mode={dialog}
						current={identity}
						panes={dialogPanes}
						defaultPane={status?.clientId ?? null}
						busy={busy}
						error={dialogError}
						onSubmit={dialog === "open" ? handleOpen : dialog === "new" ? handleNew : handleSaveAs}
						onCancel={handleCancelDialog}
					/>
				)}

				{conflict && (
					<ConflictDialog
						conflict={conflict.conflict}
						hold={conflict.hold ?? null}
						busy={busy}
						onReload={handleReload}
						onOverwrite={handleOverwrite}
						onSaveAs={handleConflictSaveAs}
						onCancel={handleCancelConflict}
					/>
				)}

				{library.pending && (
					<InstallLibraryDialog
						install={library.pending}
						busy={library.busy}
						onConfirm={library.acceptInstall}
						onCancel={library.declineInstall}
					/>
				)}

				{askingAboutNote && writtenElsewhere && (
					<ConfirmDialog
						title="Somebody else wrote this note"
						confirmLabel="Show me the note"
						busy={busy}
						onCancel={handleCancelNote}
						onConfirm={handleTakeTheNote}
						detail={
							<>
								<p>
									<strong>{writtenElsewhere.file}</strong>{" "}
									{writtenElsewhere.reason === "changed" ? (
										<>
											was written at {new Date(writtenElsewhere.writtenAt).toLocaleTimeString()} by
											something that is not archboard — Obsidian, a sync client, an editor, a{" "}
											<code>git pull</code>. This pane is showing the board as archboard last wrote
											it.
										</>
									) : (
										<>
											is a note archboard has never read, so it cannot say what this board would
											replace.
										</>
									)}
								</p>
								<p>
									Nothing has been lost. Nothing has been written either: the next change to this
									board will be refused rather than saved over theirs, and you will be offered the
									full choice then.
								</p>
								<p className="hint">
									Showing you the note replaces what is on this canvas with what is in the vault.
									Keep a board open in one editor at a time.
								</p>
							</>
						}
					/>
				)}

				{confirmingClear && (
					<ConfirmDialog
						title="Clear this board?"
						confirmLabel="Clear the board"
						busy={busy}
						onCancel={handleCancelClear}
						onConfirm={handleClear}
						detail={
							<>
								<p>
									Every one of the <strong>{status?.elementCount ?? 0}</strong> element
									{(status?.elementCount ?? 0) === 1 ? "" : "s"} on{" "}
									<strong>{identity?.board ?? boardKey ?? "this board"}</strong>
									{identity && identity.variant !== "current" ? (
										<>
											{" "}
											<strong>@{identity.variant}</strong>
										</>
									) : null}{" "}
									will be removed from the canvas.
								</p>
								<p className="hint">
									{boardInfo?.savedAt || boardInfo?.loadedAt
										? "The note in the vault keeps whatever was last saved to it, until you save the empty board over it."
										: "This board has never been written to the vault, so there is nothing to recover it from."}
								</p>
							</>
						}
					/>
				)}
			</>
		),
		[
			dialog,
			identity,
			dialogPanes,
			status?.clientId,
			status?.elementCount,
			busy,
			dialogError,
			handleOpen,
			handleNew,
			handleSaveAs,
			handleCancelDialog,
			conflict,
			handleReload,
			handleOverwrite,
			handleConflictSaveAs,
			handleCancelConflict,
			library.pending,
			library.busy,
			library.acceptInstall,
			library.declineInstall,
			askingAboutNote,
			writtenElsewhere,
			handleCancelNote,
			handleTakeTheNote,
			confirmingClear,
			handleCancelClear,
			handleClear,
			boardKey,
			boardInfo?.savedAt,
			boardInfo?.loadedAt,
		],
	);

	return (
		<div className={shellClassName(presentation.paneId)} data-theme={theme} ref={attachShellRoot}>
			<BoardBar
				identity={identity}
				boardKey={boardKey}
				vault={boardListing?.vault ?? null}
				elementCount={status?.elementCount ?? 0}
				connected={status?.connected ?? false}
				hold={hold}
				// The one thing that opens the conflict dialog while somebody is
				// drawing: them asking for it (TASK-079).
				onHoldClick={handleHoldClick}
				writtenElsewhere={writtenElsewhere}
				// The mark is a button and the button is not the action. Taking the
				// note replaces this canvas with theirs, and nothing has been refused
				// yet, so this pane's scene is the only copy left of the board archboard
				// last wrote. One stray touch on a 75-inch panel must not be what ends
				// it.
				onNoteClick={handleNoteClick}
				paneCount={panes.length}
				theme={theme}
				onThemeChange={setTheme}
				busy={busy}
				onOpen={handleOpenDialog}
				onNew={handleNewDialog}
				onClear={handleClearDialog}
				onOpenOpenerSettings={openOpenerSettings}
				onAddPane={addPane}
				// The button names no pane, so it drops the last one and keeps the
				// one the human started in. `pane close <spec>` is how a caller says
				// which half goes.
				onClosePane={handleCloseLastPane}
			/>

			<PresentationDock
				panes={panes}
				presentation={presentation}
				dockRef={presentationDockRef}
				onTransfer={handlePresentationTransfer}
				onExit={handlePresentationExit}
			/>

			<div className="workspace">
				<BoardNavigator
					listing={boardListing}
					error={boardListingError}
					currentKey={boardKey}
					busy={busy}
					onSelect={handleNavigate}
					onRefresh={handleRefreshListing}
					onNew={handleNewDialog}
					needsName={boardInfo?.placeholder ?? false}
					onName={handleNameBoard}
				/>

				<main className="canvas-zone">
					<div className="pane-bar">
						<div className="pane-tabs">
							{panes.map((paneId, index) => {
								const paneStatus = statuses[paneId];
								const paneIdentity = paneStatus?.board;
								const paneTitle = paneIdentity
									? `${paneIdentity.board}${paneIdentity.variant === "current" ? "" : ` / ${paneIdentity.variant}`}`
									: "…";
								return (
									<button
										type="button"
										key={paneId}
										className={`pane-tab${paneId === focused ? " focused" : ""}`}
										onClick={handlePaneSelect}
										data-pane-id={paneId}
									>
										<span className="focus-dot" />
										<span>
											Pane {String.fromCharCode(65 + index)} · {paneTitle}
										</span>
									</button>
								);
							})}
						</div>
						<button
							type="button"
							className="present-button"
							onClick={handlePresent}
							disabled={!presentationOwner}
							aria-label={`Present Pane ${String.fromCharCode(65 + Math.max(0, panes.indexOf(focused)))} fullscreen`}
							ref={presentButtonRef}
						>
							<Icon name="fullscreen" size={16} />
							Present
						</button>
					</div>

					<div className="canvas-stage">
						<div className={`panes panes-${panes.length}`}>
							{panes.map((paneId, index) => (
								<CanvasPane
									key={paneId}
									paneId={paneId}
									primary={index === 0}
									focused={paneId === focused}
									presentation={canvasPresentation(paneId, presentation.paneId)}
									theme={theme}
									onStatus={onStatus}
									onAgentState={onAgentState}
									onThemeChange={setTheme}
									onFocus={setFocused}
									label={`Pane ${String.fromCharCode(65 + index)}`}
									libraryItems={library.items}
									onLibraryChange={library.reportFromPane}
									onLibraryChangedElsewhere={library.applyFromServer}
									onLayoutRequest={handleLayoutRequest}
									onBoardError={handleBoardError}
									onCodeTargetNotice={handleCodeTargetNotice}
									onSelectionSnapshot={onSelectionSnapshot}
									onPathFocusSnapshot={onPathFocusSnapshot}
									onPathFocusController={onPathFocusController}
								/>
							))}
						</div>

						<SelectionInspector
							paneLabel={focusedPaneLabel}
							boardKey={boardKey}
							selection={inspectedSelection}
							pathFocus={inspectedPathFocus}
							onOpenCode={handleOpenSelectedCode}
							onFocusPath={handleFocusSelectedPath}
							onExitPathFocus={handleExitPathFocus}
						/>
					</div>

					<AgentWorkbench
						paneLabel={focusedPaneLabel}
						connected={status?.connected ?? false}
						heldBy={agentState?.heldBy ?? null}
						doing={visibleDoing}
						takeBack={agentState?.takeBack}
					/>

					{visibleNotice && (
						<div
							className={`notice notice-shell notice-${visibleNotice.kind}${visibleNotice.hold ? " notice-hold" : ""}`}
							role={visibleNotice.kind === "error" ? "alert" : "status"}
						>
							<span className="notice-icon">
								<Icon name={visibleNotice.kind === "error" ? "close" : "check"} size={16} />
							</span>
							<span className="notice-text">
								{visibleNotice.text}
								{visibleNotice.actions && (
									<span className="notice-actions">
										{visibleNotice.actions.map((action) => {
											if (action.kind === "settings") {
												return (
													<button
														key="settings"
														className="btn btn-quiet"
														onClick={openOpenerSettings}
													>
														{action.label}
													</button>
												);
											}
											const href = GitHubHttpsUrlSchema.safeParse(action.href);
											return href.success ? (
												<a
													key={action.href}
													className="btn btn-quiet"
													href={href.data}
													target="_blank"
													rel="noopener noreferrer"
												>
													{action.label}
												</a>
											) : null;
										})}
									</span>
								)}
							</span>
							<button
								className="notice-dismiss"
								type="button"
								onClick={handleDismissNotice}
								aria-label="Dismiss notice"
							>
								<Icon name="close" size={17} />
							</button>
						</div>
					)}
				</main>
			</div>

			<footer className="statusbar">
				<div className="status-cluster">
					<span className={`status-item ${status?.connected ? "status-good" : "status-bad"}`}>
						<span className="live-dot" />
						{status?.connected ? "Connected" : "Offline"}
					</span>
					<span className="status-item">
						<Icon name="check" size={14} />
						{hold ? "Changes held" : writtenElsewhere ? "Note changed" : "In the vault"}
					</span>
					<span className="status-item">{status?.elementCount ?? 0} elements</span>
				</div>
				<div className="status-cluster status-muted">
					<span>{boardKey ?? boardListing?.vault ?? "Waiting for board"}</span>
				</div>
			</footer>

			{dialogContent}
			{openerSettingsOpen && (
				<OpenerSettingsDialog
					onCancel={closeOpenerSettings}
					onSuccess={handleOpenerSuccess}
					onFailure={handleCodeTargetNotice}
				/>
			)}
		</div>
	);
}
