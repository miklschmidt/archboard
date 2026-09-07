import { selectionState } from "@/runtime/engine/types";
import { boards } from "@/runtime/engine/board-store";
import type { BoardState } from "@/runtime/engine/board-store";
import { readBoardContent } from "@/runtime/engine/board-io";
import { boardLockState } from "@/runtime/engine/board-lock";
import { recentDoing } from "@/runtime/engine/board-doing";
import { vaultPathFor } from "@/runtime/engine/board";
import { describeScene } from "@/runtime/engine/describe";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { ArchboardContextSchema, type ArchboardContext } from "@/runtime/codex-instructions";
import type {
	SemanticContextInput,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context";
import { canonicalSemanticCursorToken } from "@/runtime/codex-thread-context";
import type { CodexWorkbenchComponents } from "@/server/canvas/codex-workbench-generation";
import { checkoutRoot } from "@/server/canvas/lib/module-paths";
import { boardForPane, panes } from "@/server/canvas/lib/pane-registry";
import { messageOf } from "@/server/canvas/lib/request-board";

type FreshBrief = ReturnType<CodexWorkbenchComponents["semanticPublisher"]["freshBrief"]>;

/**
 * The canonical Codex context a semantic brief becomes, for one pane and one
 * operation.
 * @param brief The settled or fresh brief.
 * @param paneId The pane the context is for.
 * @param operation The operation the context describes.
 * @returns The validated context.
 */
function canonicalContextFromBrief(
	brief: SettledSemanticChangeEvent | FreshBrief,
	paneId: string,
	operation: ArchboardContext["operation"],
): ArchboardContext {
	if (brief.child.id === null || brief.child.epoch === null) {
		throw new Error("Canonical Codex context requires the active child epoch.");
	}
	return ArchboardContextSchema.parse({
		schema: 1,
		paneId,
		board: {
			note: brief.board.note,
			version: brief.version ?? 0,
			cursor: brief.cursor === null ? null : canonicalSemanticCursorToken(brief.cursor),
		},
		threadLink: brief.threadLink,
		child: { id: brief.child.id, epoch: brief.child.epoch },
		workhorse: brief.workhorse,
		coordinator: brief.coordinator,
		semantic: {
			brief: brief.brief,
			capturedAtMs: brief.freshness.capturedAtMs,
			freshUntilMs: brief.freshness.freshUntilMs,
			truncated: brief.truncated,
		},
		focus: {
			paneId: brief.pane.focused ? brief.pane.paneId : null,
			capturedAtMs: brief.freshness.capturedAtMs,
		},
		selection: { elementIds: brief.selection, capturedAtMs: brief.freshness.capturedAtMs },
		claim: brief.claim,
		ambiguity: brief.ambiguity,
		operation,
	});
}

/** What a board's note says, for the semantic brief, or why it could not be read. */
interface BoardDescription {
	description: string;
	version: number | null;
	stale: boolean;
	staleReasons: readonly string[];
}

/**
 * Describe a board from its note, marking the description stale when the
 * note cannot be read.
 * @param board The open board.
 * @returns The description.
 */
function describeBoard(board: BoardState): BoardDescription {
	try {
		const content = readBoardContent(board);
		return {
			description: describeScene(Array.from(content.elements.values())),
			version: content.version ?? null,
			stale: false,
			staleReasons: [],
		};
	} catch (error) {
		return {
			description: `The board note could not be read: ${messageOf(error)}`,
			version: null,
			stale: true,
			staleReasons: ["board_note_unreadable"],
		};
	}
}

/**
 * The exact pane a context is captured for: the one with that id showing that board.
 * @param contextBoard The board key.
 * @param exactPaneId The pane id.
 * @returns The pane.
 */
function contextPane(contextBoard: string, exactPaneId: string): PaneRegistration {
	const pane = Array.from(panes.values()).find(
		(candidate) => candidate.paneId === exactPaneId && boardForPane(candidate) === contextBoard,
	);
	if (pane === undefined) {
		throw new Error(`The Codex context board has no authoritative browser pane: ${contextBoard}.`);
	}
	return pane;
}

type ThreadLinkOf = ReturnType<CodexWorkbenchComponents["threadLink"]["read"]>["link"];
type ExecutableLink = Extract<ThreadLinkOf, { state: "executable" }>;
type WorkhorseSnapshot = ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>;
type CoordinatorSnapshot = ReturnType<CodexWorkbenchComponents["coordinator"]["snapshot"]>;
type LinkedIdentities = Required<
	Pick<SemanticContextInput, "child" | "threadLink" | "workhorse" | "coordinator">
>;

/** The pieces of the active graph a pane's identities are read from. */
interface GraphView {
	active: CodexWorkbenchComponents | null;
	link: ThreadLinkOf | null;
	executable: ExecutableLink | null;
	workhorse: WorkhorseSnapshot | null;
	coordinator: CoordinatorSnapshot | null;
}

/**
 * Read the pane's link and the graph's snapshots once.
 * @param active The active components, or null while none are installed.
 * @param paneId The pane.
 * @returns The view.
 */
function graphView(active: CodexWorkbenchComponents | null, paneId: string): GraphView {
	if (active === null) {
		return { active, link: null, executable: null, workhorse: null, coordinator: null };
	}
	const link = active.threadLink.read(paneId).link;
	return {
		active,
		link,
		executable: link.state === "executable" ? link : null,
		workhorse: active.workhorse.snapshot(),
		coordinator: active.coordinator.snapshot(),
	};
}

/**
 * The first value that is neither null nor undefined.
 * @param values The candidates, in order of preference.
 * @returns The first present value, or null.
 */
function firstPresent<T>(values: readonly (T | null | undefined)[]): T | null {
	for (const value of values) {
		if (value !== null && value !== undefined) {
			return value;
		}
	}
	return null;
}

/**
 * The child a pane's context runs under: the executable link's, else the
 * workhorse's, else the coordinator's.
 * @param view The graph view.
 * @returns The child identity.
 */
function childIdentity(view: GraphView): LinkedIdentities["child"] {
	if (view.executable !== null) {
		return { id: view.executable.childId, epoch: view.executable.epoch };
	}
	return {
		id: firstPresent([view.workhorse?.childId, view.coordinator?.childId]),
		epoch: firstPresent([view.workhorse?.epoch, view.coordinator?.epoch]),
	};
}

/**
 * The workhorse the pane's executable link created, when the graph's
 * workhorse is that thread.
 * @param view The graph view.
 * @returns The linked workhorse, or null.
 */
function linkedWorkhorse(view: GraphView): WorkhorseSnapshot | null {
	if (view.executable === null || view.workhorse === null) {
		return null;
	}
	return view.workhorse.threadId === view.executable.threadId ? view.workhorse : null;
}

/**
 * The coordinator identity, named only when the pane's link created the
 * graph's workhorse.
 * @param view The graph view.
 * @returns The coordinator identity.
 */
function coordinatorIdentity(view: GraphView): LinkedIdentities["coordinator"] {
	if (linkedWorkhorse(view) === null || view.active === null) {
		return { threadId: null, realtimeSessionId: null };
	}
	const realtime = view.active.realtime.generation();
	return {
		threadId: view.coordinator === null ? null : view.coordinator.threadId,
		realtimeSessionId: realtime === null ? null : realtime.wireSessionId,
	};
}

/**
 * The child, thread link, workhorse and coordinator identities a pane's
 * semantic context names, taken from the active workbench graph.
 * @param active The active components, or null while none are installed.
 * @param paneId The pane.
 * @returns The identities.
 */
function linkedIdentities(
	active: CodexWorkbenchComponents | null,
	paneId: string,
): LinkedIdentities {
	const view = graphView(active, paneId);
	const linked = linkedWorkhorse(view);
	return {
		child: childIdentity(view),
		threadLink: {
			state: view.link === null ? "unbound" : view.link.state,
			reason: view.link === null ? null : view.link.reason,
		},
		workhorse: { threadId: linked === null ? null : linked.threadId, turnId: null },
		coordinator: coordinatorIdentity(view),
	};
}

/**
 * What the lock and the last announced step say about a board, for the brief.
 * @param contextBoard The board key.
 * @returns The claim and the current step.
 */
function claimOf(contextBoard: string): Required<Pick<SemanticContextInput, "claim" | "doing">> {
	const holder = boardLockState(contextBoard);
	const doing = recentDoing(contextBoard).at(-1)?.doing ?? null;
	return {
		claim: {
			holder: holder === null ? "none" : holder.kind,
			doing: holder === null ? doing : (holder.reason ?? doing),
		},
		doing,
	};
}

/**
 * The semantic context input for one board as seen from one pane.
 * @param active The active components, or null while none are installed.
 * @param contextBoard The board key.
 * @param cursor The change-feed cursor the context is at, or null for a fresh read.
 * @param exactPaneId The pane.
 * @returns The input the semantic publisher builds a brief from.
 */
function semanticInputFor(
	active: CodexWorkbenchComponents | null,
	contextBoard: string,
	cursor: SemanticContextInput["cursor"],
	exactPaneId: string,
): SemanticContextInput {
	const pane = contextPane(contextBoard, exactPaneId);
	const board = boards.get(contextBoard);
	if (board === undefined) {
		throw new Error(`The Codex context board is not open: ${contextBoard}.`);
	}
	const described = describeBoard(board);
	const selection = selectionState.byClient.get(pane.clientId);
	return {
		repository: checkoutRoot,
		...linkedIdentities(active, pane.paneId),
		board: {
			key: contextBoard,
			note: board.file ?? vaultPathFor(board.identity),
			version: described.version,
		},
		pane: { paneId: pane.paneId, focused: pane.focused },
		selection: selection === undefined ? [] : selection.elementIds,
		...claimOf(contextBoard),
		cursor,
		description: described.description,
		ambiguity: [],
		stale: described.stale,
		staleReasons: described.staleReasons,
	};
}

export { canonicalContextFromBrief, semanticInputFor };
