import { boardLockState } from "@/runtime/engine/board-lock";
import { recentDoing } from "@/runtime/engine/board-doing";
import type { PaneRegistration } from "@/runtime/engine/panes";
import { ArchboardContextSchema, type ArchboardContext } from "@/runtime/codex-instructions";
import type {
	SemanticArchitectureInput,
	SemanticContextInput,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context";
import { readSemanticBoard } from "@/runtime/semantic-board-store";
import { canonicalSemanticCursorToken } from "@/runtime/codex-thread-context";
import type { SemanticBoard } from "@/shared/semantic-board/index";
import type { SemanticPaneContext } from "@/shared/semantic-pane-context/index";
import type { CodexWorkbenchComponents } from "@/server/canvas/codex-workbench-generation";
import { checkoutRoot } from "@/server/canvas/lib/module-paths";
import { boardForPane, panes } from "@/server/canvas/lib/pane-registry";
import {
	aggregateKey,
	NOTHING_READ,
	semanticBoardContext,
} from "@/server/canvas/lib/semantic-board-context";
import { semanticPaneContextFor } from "@/server/canvas/lib/semantic-pane-context";

type FreshBrief = ReturnType<CodexWorkbenchComponents["semanticPublisher"]["freshBrief"]>;

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
 * @param asked The board name.
 * @param pane What the pane said it was reading, or null when it has not said.
 * @returns The reading.
 */
function readBoardForContext(asked: string, pane: SemanticPaneContext | null): BoardReading {
	const read = readSemanticBoard(asked);
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

/**
 * The pane a context can report presentation from: the bound one, when it is
 * showing the board that changed.
 *
 * Null is a real answer and the important one. A session hears about every
 * board it has been told about, whatever anybody is looking at — so when the
 * bound pane is closed, or is showing a different board, there is no
 * presentation to report and the context says so rather than being refused or
 * borrowing somebody else's. What a person selected in one architecture is not
 * a fact about another.
 * @param contextBoard The board key.
 * @param exactPaneId The pane id.
 * @returns The pane, or null when none is showing this board.
 */
function contextPane(contextBoard: string, exactPaneId: string): PaneRegistration | null {
	// Aggregates, not spellings: a pane showing a proposal carries the variant in
	// its board key, and comparing the whole string would say that pane is on a
	// different board and leave an agent with no context at all.
	const wanted = aggregateKey(contextBoard);
	const pane = Array.from(panes.values()).find((candidate) => {
		// A pane may be holding no board at all: a fresh vault has none, and a pane
		// that could not register until one existed could never be shown the first
		// board somebody makes.
		//
		// The guard is not tidiness. There is no aggregate of nothing — the address
		// grammar refuses an empty board name — so without it the predicate THROWS
		// rather than failing to match, which aborts the whole scan. One pane
		// between boards would take context away from every other pane on the
		// canvas for as long as it sat there.
		const showing = boardForPane(candidate);
		return candidate.paneId === exactPaneId && showing !== null && aggregateKey(showing) === wanted;
	});
	return pane ?? null;
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
 * The thread this pane's context is about: the one its executable link names.
 *
 * The link is the source of truth for what a pane is bound to, and a relink
 * moves it. The graph's workhorse snapshot answers a different question — which
 * thread started the child this generation runs — and the two part company the
 * moment a pane is relinked to a thread that already existed: the child's owner
 * stays as it was, the link moves, and a context that reported the owner named a
 * thread this delivery is not for. Every event then failed to prove its target
 * and was refused as unattributable, for as long as the relink stood.
 *
 * The child and the epoch are reported separately, from the graph, and the
 * delivery's own capability check is what proves them. This is identity, not
 * capability.
 * @param view The graph view.
 * @returns The thread, or null when the pane has no executable link.
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
	// The pane that can speak for what is on screen, or nothing when none can.
	const pane = contextPane(contextBoard, exactPaneId);
	// One parse, here. A pane showing a proposal reports `payments@<variant>`,
	// and that address is what the context is filed under — but a board is one
	// document holding every variant, so what is READ is the aggregate, and
	// `readSemanticBoard` refuses an address carrying a variant outright.
	const aggregate = aggregateKey(contextBoard);
	const read = readBoardForContext(
		aggregate,
		pane === null ? null : semanticPaneContextFor(pane.clientId),
	);
	return {
		repository: checkoutRoot,
		...linkedIdentities(active, exactPaneId),
		board: {
			key: contextBoard,
			name: read.name,
			file: read.file,
			version: read.version,
		},
		// The bound pane either way: which pane this context belongs to is the
		// port's own identity. Whether it is focused is a fact about the screen,
		// and a pane that is not showing this board is not focused on it.
		pane: { paneId: exactPaneId, focused: pane?.focused ?? false },
		architecture: read.architecture,
		...claimOf(contextBoard),
		cursor,
		description: read.description,
		ambiguity: read.ambiguity,
		stale: read.stale,
		staleReasons: read.staleReasons,
	};
}

export { canonicalContextFromBrief, semanticInputFor };
