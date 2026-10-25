import type { CodexWorkbenchSessionComponents } from "@archboard/codex-realtime-voice/server";
import { boardLockState } from "@archboard/board/lock";
import { recentDoing } from "@archboard/board/doing";
import type { PaneRegistration } from "@archboard/server-lifecycle/panes";
import {
	ArchboardContextSchema,
	type ArchboardContext,
} from "#runtime/rules/instructions/context.ts";
import type {
	SemanticArchitectureInput,
	SemanticContextInput,
	SettledSemanticChangeEvent,
} from "#runtime/schemas/semantic-context-types.ts";
import { readSemanticBoard } from "@archboard/board/store-read";
import { canonicalContextCursorToken } from "@archboard/codex-realtime-voice/runtime";
import type { SemanticBoard } from "@archboard/board/document";
import type { SemanticPaneContext } from "@archboard/board/pane-context";
import { checkoutOfVault } from "@archboard/workspace/vault";
import type { CodexWorkbenchDomainScope as CodexWorkbenchComponents } from "@archboard/codex-realtime-voice/server";
import type { CodexWorkbenchWorkhorseComponents } from "@archboard/codex-realtime-voice/server";
import { boardForPane, panes } from "#server/services/panes/registry.ts";
import {
	aggregateKey,
	NOTHING_READ,
	semanticBoardContext,
} from "#server/projections/semantic-context/board-context.ts";
import { semanticPaneContextFor } from "#server/services/panes/context.ts";

type FreshBrief = import("#runtime/schemas/semantic-context-types.ts").FreshSemanticBrief;

/**
 * The variant a context names: the brief's, without the predecessor it is
 * measured against, which is a fact about the comparison rather than about
 * which state the pane is reading.
 * @param variant The brief's variant, or null before anything is drawn.
 * @returns The context's variant.
 */
function contextVariant(
	variant: FreshBrief["architecture"]["variant"],
): ArchboardContext["variant"] {
	return variant === null
		? null
		: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle };
}

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
			name: brief.board.name,
			key: brief.board.key,
			version: brief.version ?? 0,
			cursor: brief.cursor === null ? null : canonicalContextCursorToken(brief.cursor),
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
		variant: contextVariant(brief.architecture.variant),
		view: brief.architecture.view,
		selection: {
			count: brief.architecture.selection.count,
			subjects: brief.architecture.selection.subjects,
			capturedAtMs: brief.freshness.capturedAtMs,
		},
		// The summary, not the fitted list: a brief that had to drop its issues
		// still says there are some, and an agent told `required` reads the board.
		reconciliation: {
			required: brief.architecture.reconciliation.required,
			count: brief.architecture.reconciliation.count,
			blockedBy: brief.architecture.reconciliation.blockedBy,
			issues: brief.architecture.reconciliation.issues,
		},
		claim: brief.claim,
		ambiguity: brief.ambiguity,
		operation,
	});
}

/** What a board says, for the semantic brief, or why it could not be read. */
interface BoardReading {
	architecture: SemanticArchitectureInput;
	description: string;
	file: string;
	name: string;
	version: number | null;
	ambiguity: readonly string[];
	stale: boolean;
	staleReasons: readonly string[];
}

/**
 * Read a board and work out what it means to the pane reading it, marking the
 * reading stale when the document cannot be read at all.
 *
 * The read is of the document on disk every time, never a copy: an agent told
 * what version a board is at must be told the version the next write will be
 * checked against, and a cached one would differ exactly when it matters.
 * @param vault The vault the board lives in.
 * @param asked The board name.
 * @param pane What the pane said it was reading, or null when it has not said.
 * @returns The reading.
 */
function readBoardForContext(
	vault: string,
	asked: string,
	pane: SemanticPaneContext | null,
): BoardReading {
	const read = readSemanticBoard(vault, asked);
	if (!read.ok) {
		return {
			architecture: NOTHING_READ,
			description: `The board could not be read: ${read.problem}`,
			file: read.location.file,
			name: read.location.name,
			version: null,
			ambiguity: [],
			stale: true,
			staleReasons: [read.code === "BOARD_MISSING" ? "board_missing" : "board_unreadable"],
		};
	}
	const confirmed = reportFor(read.board, pane);
	const context = semanticBoardContext(read.board, confirmed.report);
	return {
		architecture: context.architecture,
		description: context.description,
		file: read.location.file,
		name: read.board.name,
		version: read.board.version,
		ambiguity: [...context.ambiguity, ...confirmed.ambiguity],
		stale: confirmed.staleReasons.length > 0,
		staleReasons: confirmed.staleReasons,
	};
}

/** A pane report that may be used, and anything wrong with the one there was. */
interface ConfirmedReport {
	readonly report: SemanticPaneContext | null;
	readonly ambiguity: readonly string[];
	readonly staleReasons: readonly string[];
}

/**
 * Whether the pane's last report is about the board being read, and recent
 * enough to believe.
 *
 * A pane moving from one board to another registers on the new board before its
 * first report about it arrives, so for a moment the registry says B and the
 * pane's last report still says A. Resolving A's variant, view and selection
 * against B's document would hand an agent ids from one architecture as though
 * they named subjects of another — and the ids might even resolve, meaning
 * something else entirely. So a report about another board is not used at all
 * and the pane is reported as not having said yet, which is the truth.
 *
 * A report about the right board at an older version is still used: which
 * subject somebody picked out does not stop being true because the board was
 * written since. It is marked stale so the agent reads the board rather than
 * trusting the version the pane drew.
 *
 * What is NOT stale is having no report at all. Staleness here means "what you
 * are being told may be behind the board", and the board was just read at the
 * version the change landed at; the only thing missing is what is on somebody's
 * screen, which is not a fact about the architecture. It is reported as
 * ambiguity — the things that could not be resolved — because a session is told
 * about every board update whatever anybody is looking at, and a missing
 * presentation that read as stale board truth stopped the news outright.
 * @param board The board being read.
 * @param pane The pane's last report, or null when it has never reported.
 * @returns The report to use, and what was wrong with the one there was.
 */
function reportFor(board: SemanticBoard, pane: SemanticPaneContext | null): ConfirmedReport {
	if (pane === null) {
		return {
			report: null,
			ambiguity: [
				"nothing on screen is reading this board, so no view or selection has been resolved " +
					"against it; the board itself is read at the version this change landed at",
			],
			staleReasons: [],
		};
	}
	const key = pane.board?.key ?? null;
	// Aggregates, not spellings, and by the same function the rest of this file
	// uses: a pane on `payments@<variant>` is reporting about `payments`, and an
	// exact comparison would call that another board and drop the variant, the
	// view and the selection it just told us about.
	if (key === null || aggregateKey(key) !== aggregateKey(board.name)) {
		// The same again: a pane reading something else tells us nothing about this
		// board, and nothing is not stale.
		return { report: null, ambiguity: [mixedBoards(key, board.name)], staleReasons: [] };
	}
	// The version difference is presentation lag, not board staleness: this
	// reading is at the version the board is actually at.
	return { report: pane, ambiguity: versionReasons(pane.version, board.version), staleReasons: [] };
}

/**
 * What the version the pane drew says about the reading.
 *
 * Behind is not only ordinary, it is the ordinary case at the moment that
 * matters most: a write commits, announces, and is read here at its new
 * version, all before the browser has drawn again and said so. So the pane
 * lagging cannot be a reason to hold the news back — it is a fact about the
 * screen, said out loud as ambiguity, while the board's own version is what the
 * reading is at. Marking it stale meant every visible external change was
 * refused as a stale event, which is the ordinary case refusing itself.
 *
 * Ahead is stranger — the pane has seen a version this process cannot read yet
 * — and it is worth saying for the same reason: an agent should wait for the
 * board to catch up rather than write against a version that is not the newest.
 * Neither is a refusal, and neither is staleness: what somebody picked out of
 * this board is still what they picked out.
 * @param drew The version the pane reported drawing, or null when it drew none.
 * @param read The version the board is actually at.
 * @returns What to say about the difference, empty when the two agree.
 */
function versionReasons(drew: number | null, read: number): readonly string[] {
	if (drew === null || drew === read) {
		return [];
	}
	return drew > read
		? [
				`the pane has drawn version ${drew} and this process reads ${read}; wait for the board ` +
					"to catch up rather than writing against a version that is not the newest",
			]
		: [
				`the pane drew version ${drew} and the board is at ${read}, so the picture on screen is ` +
					"behind; what it says was selected is still selected",
			];
}

/**
 * What to tell an agent when the pane is still reporting the board it left.
 * @param key The board the pane last reported, or null when it reported none.
 * @param name The board being read.
 * @returns The sentence.
 */
function mixedBoards(key: string | null, name: string): string {
	const said = key === null ? "no board" : `board "${key}"`;
	return (
		`the pane last reported ${said} and is being read as "${name}", so nothing it selected ` +
		"has been resolved: those ids belong to a different architecture"
	);
}

/** Which pane a context is for: the id it is filed under, and the exact pane on screen, if any. */
interface ContextPane {
	/** The pane id the context names, as the shell and the coordinator name it. */
	readonly paneId: string;
	/**
	 * The client id of the one pane on screen that speaks for it, or null when none does. A pane
	 * id repeats in every browser tab, so presentation is only ever read from this exact pane.
	 */
	readonly clientId: string | null;
}

/**
 * The pane a context can report presentation from: the exact one named, when it is
 * showing the board that changed.
 *
 * Null is a real answer and the important one. A session hears about every
 * board it has been told about, whatever anybody is looking at — so when the
 * bound pane is closed, or is showing a different board, there is no
 * presentation to report and the context says so rather than being refused or
 * borrowing somebody else's. What a person selected in one architecture is not
 * a fact about another.
 * @param vault The vault the board lives in: a pane of another vault showing a board of the
 *   same name is showing another board.
 * @param contextBoard The board key.
 * @param clientId The exact pane's client id, or null when no pane speaks for the context.
 * @returns The pane, or null when it is not showing this board.
 */
function contextPane(
	vault: string,
	contextBoard: string,
	clientId: string | null,
): PaneRegistration | null {
	const pane = clientId === null ? undefined : panes.get(clientId);
	if (pane === undefined || pane.vault !== vault) {
		return null;
	}
	// A pane may be holding no board at all: a fresh vault has none, and there is
	// no aggregate of nothing — the address grammar refuses an empty board name.
	const showing = boardForPane(pane);
	// Aggregates, not spellings: a pane showing a proposal carries the variant in
	// its board key, and comparing the whole string would say that pane is on a
	// different board and leave an agent with no context at all.
	return showing !== null && aggregateKey(showing) === aggregateKey(contextBoard) ? pane : null;
}

type ThreadLinkOf = ReturnType<CodexWorkbenchComponents["threadLink"]["read"]>["link"];
type ExecutableLink = Extract<ThreadLinkOf, { state: "executable" }>;
type WorkhorseSnapshot = ReturnType<CodexWorkbenchWorkhorseComponents["workhorse"]["snapshot"]>;
type CoordinatorSnapshot = ReturnType<CodexWorkbenchSessionComponents["coordinator"]["snapshot"]>;
/**
 * What a context's identities are read from: the tab session's coordinator and voice, and the
 * workhorse the context is told to, with its thread link; that workhorse is null when there is
 * none, as before voice starts or in a checkout with no workhorse yet.
 */
type SemanticInputOwners = Pick<CodexWorkbenchComponents, "threadLink"> &
	Pick<CodexWorkbenchSessionComponents, "coordinator" | "realtime"> & {
		readonly workhorse: {
			readonly start: CodexWorkbenchWorkhorseComponents["workhorse"];
			/** Its thread-link key. */
			readonly key: string;
		} | null;
	};
type LinkedIdentities = Required<
	Pick<SemanticContextInput, "child" | "threadLink" | "workhorse" | "coordinator">
>;

/** The pieces of the active graph a pane's identities are read from. */
interface GraphView {
	active: SemanticInputOwners | null;
	link: ThreadLinkOf | null;
	executable: ExecutableLink | null;
	workhorse: WorkhorseSnapshot | null;
	coordinator: CoordinatorSnapshot | null;
}

/**
 * Read the workhorse's link and the snapshots of it and the tab's coordinator once.
 * @param active The session's owners, or null while none are installed.
 * @returns The view.
 */
function graphView(active: SemanticInputOwners | null): GraphView {
	if (active === null) {
		return { active, link: null, executable: null, workhorse: null, coordinator: null };
	}
	return {
		active,
		...workhorseView(active),
		coordinator: active.coordinator.snapshot(),
	};
}

/**
 * Read the link and the snapshot of the workhorse a context is told to.
 * @param active The session's owners.
 * @returns Its link, that link when it can run turns, and its snapshot; all null without one.
 */
function workhorseView(
	active: SemanticInputOwners,
): Pick<GraphView, "link" | "executable" | "workhorse"> {
	if (active.workhorse === null) {
		return { link: null, executable: null, workhorse: null };
	}
	const { link } = active.threadLink.read(active.workhorse.key);
	return {
		link,
		executable: link.state === "executable" ? link : null,
		workhorse: active.workhorse.start.snapshot(),
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
 * The thread this context is about: the one the executable link of its workhorse
 * names, which is the thread that workhorse started. Read from the link, whose
 * state the context reports anyway.
 *
 * The child and the epoch are reported separately, from the graph, and the
 * delivery's own capability check is what proves them. This is identity, not
 * capability.
 * @param view The graph view.
 * @returns The thread, or null when the session has no executable link.
 */
function boundWorkhorseThread(view: GraphView): WorkhorseSnapshot["threadId"] | null {
	return view.executable === null ? null : view.executable.threadId;
}

/**
 * The coordinator identity, named only when the pane has a thread to be about.
 * @param view The graph view.
 * @returns The coordinator identity.
 */
function coordinatorIdentity(view: GraphView): LinkedIdentities["coordinator"] {
	if (boundWorkhorseThread(view) === null || view.active === null) {
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
 * semantic context names, taken from its tab session.
 * @param active The session's owners, or null while none are installed.
 * @returns The identities.
 */
function linkedIdentities(active: SemanticInputOwners | null): LinkedIdentities {
	const view = graphView(active);
	const linked = boundWorkhorseThread(view);
	return {
		child: childIdentity(view),
		threadLink: {
			state: view.link === null ? "unbound" : view.link.state,
			reason: view.link === null ? null : view.link.reason,
		},
		workhorse: { threadId: linked, turnId: null },
		coordinator: coordinatorIdentity(view),
	};
}

/**
 * What the lock and the last announced step say about a board, for the brief.
 * @param vault The vault the board lives in.
 * @param contextBoard The board key.
 * @returns The claim and the current step.
 */
function claimOf(
	vault: string,
	contextBoard: string,
): Required<Pick<SemanticContextInput, "claim" | "doing">> {
	const holder = boardLockState(vault, contextBoard);
	const doing = recentDoing(vault, contextBoard).at(-1)?.doing ?? null;
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
 * @param vault The vault the board lives in.
 * @param contextBoard The board key.
 * @param cursor The change-feed cursor the context is at, or null for a fresh read.
 * @param forPane The pane the context is for, and the exact pane on screen that speaks for it.
 * @returns The input the semantic publisher builds a brief from.
 */
function semanticInputFor(
	active: SemanticInputOwners | null,
	vault: string,
	contextBoard: string,
	cursor: SemanticContextInput["cursor"],
	forPane: ContextPane,
): SemanticContextInput {
	const exactPaneId = forPane.paneId;
	// The pane that can speak for what is on screen, or nothing when none can.
	const pane = contextPane(vault, contextBoard, forPane.clientId);
	// One parse, here. A pane showing a proposal reports `payments@<variant>`,
	// and that address is what the context is filed under — but a board is one
	// document holding every variant, so what is READ is the aggregate, and
	// `readSemanticBoard` refuses an address carrying a variant outright.
	const aggregate = aggregateKey(contextBoard);
	const read = readBoardForContext(
		vault,
		aggregate,
		pane === null ? null : semanticPaneContextFor(pane.clientId),
	);
	return {
		// The checkout the board is in, which `-C` names (ADR 0050).
		repository: checkoutOfVault(vault),
		...linkedIdentities(active),
		board: {
			key: contextBoard,
			name: read.name,
			vault,
			file: read.file,
			version: read.version,
		},
		// The bound pane either way: which pane this context belongs to is the
		// port's own identity. Whether it is focused is a fact about the screen,
		// and a pane that is not showing this board is not focused on it.
		pane: { paneId: exactPaneId, focused: pane?.focused ?? false },
		architecture: read.architecture,
		...claimOf(vault, contextBoard),
		cursor,
		description: read.description,
		ambiguity: read.ambiguity,
		stale: read.stale,
		staleReasons: read.staleReasons,
	};
}

/**
 * The board a pane is showing, for a context that has to name one.
 *
 * A pane exists whether or not it is showing a board, but a thread is bound to
 * a pane *and its board*: a context built for a pane showing nothing would be a
 * brief about no architecture at all.
 * @param pane The pane.
 * @returns The board key.
 * @throws {Error} When the pane is showing no board.
 */
function shownBoard(pane: PaneRegistration): string {
	const board = boardForPane(pane);
	if (board === null) {
		throw new Error(`Pane ${pane.paneId} is showing no board, so there is no context to read.`);
	}
	return board;
}

/**
 * The semantic input for the board a pane shows, read fresh in the pane's vault.
 * @param owners The active components.
 * @param pane The pane.
 * @returns The input.
 */
function fullInputFor(
	owners: Parameters<typeof semanticInputFor>[0],
	pane: PaneRegistration,
): ReturnType<typeof semanticInputFor> {
	return semanticInputFor(owners, pane.vault, shownBoard(pane), null, pane);
}

export type { SemanticInputOwners };
export { canonicalContextFromBrief, fullInputFor, semanticInputFor, type ContextPane };
