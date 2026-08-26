// The canvas's change feed: settled board states in, semantic events out.
//
// This is the piece that decides *when* there is something to say. The engine
// next door (changes.ts) decides *what*. The split matters because the two
// consumers want different things from the same events:
//
//   · the injection client (TASK-019) subscribes in-process and wants each
//     event once, as it happens, already narrated;
//   · a UserPromptSubmit hook runs as a separate short-lived process once per
//     turn, holds a cursor of what it last reported, and wants everything
//     since that cursor as ONE diff — not a replay of six events it would have
//     to merge itself.
//
// Both are served from the same ring: events carry a monotonic cursor, and
// each event keeps the snapshot it was diffed against, so "what changed since
// cursor N" is answerable as a single fresh diff against the live board.
//
// THE SETTLE WINDOW. Nothing here is computed per mutation. A mutation only
// arms (or re-arms) a timer; the diff happens when the board has been quiet
// for SETTLE_MS. A drag reports dozens of element updates and produces exactly
// one comparison, of where the box came to rest. MAX_PENDING_MS caps the other
// direction: someone who keeps drawing for a minute still gets told, rather
// than having the window pushed out forever.
//
// THE BASELINE ONLY MOVES WHEN SOMETHING IS SAID. If the settled board differs
// from the baseline only cosmetically — or not at all, in the model's terms —
// no event is emitted and the baseline stays where it was. That is what makes
// a series of individually meaningless nudges eventually add up to a real
// change instead of each being separately discarded.
//
// THE BASELINE AND THE CHECKPOINTS ARE A COPY OF A BOARD, AND THEY STAY HERE.
// The note is the board and the process holds no copy of one (ADR 0015), and
// this looks like the exception. It is not, by the test the ADR sets: ask which
// question the copy answers. "What is on this board" must be the note, and
// neither of these answers it. They answer "how did it stand when anybody was
// last told", which is a question the vault has never been asked and has no
// file for, so keeping them here removes no second truth and writing them to
// disk would invent one. Losing them loses history and no work: a diff starts
// again from now.
//
// What that does require is that they are copies in full. A baseline sharing
// element objects with the board moves when the board moves, and then the diff
// finds nothing, reports nothing, and the failure arrives as silence (TASK-052).

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { kept } from "./hot.js";
import type { ServerElement } from "./types.js";
import type { BoardIdentity } from "./board.js";
import { copyElements } from "./board-store.js";
import { diffBoardStates, narrateChange } from "./changes.js";
import type { SemanticChange } from "./changes.js";
import { DEFAULT_SETTLE_MAX_MS, DEFAULT_SETTLE_MS } from "../../shared/timing/timing.js";
import logger from "./logger.js";

/** Who moved. Determined by which surface reported the mutation, not by content. */
export type ChangeOrigin = "human" | "agent" | "mixed";

export interface ChangeEvent {
	cursor: number;
	board: string;
	identity: BoardIdentity;
	/** When the board settled. */
	at: string;
	/** The baseline this was measured from. */
	since: string;
	origin: ChangeOrigin;
	significance: "layout" | "structural";
	headline: string;
	/** Compact lines; what an injected item or a hook's context carries. */
	text: string;
	change: SemanticChange;
	/** How many mutating requests landed in the window this event covers. */
	mutations: number;
	elementCount: number;
}

// The numbers, and what they pull against, are in ./timing.ts. The overrides
// stay here because this is a process with an environment to read; that module
// is imported by the browser too.
const SETTLE_MS = Number(process.env.ARCHBOARD_SETTLE_MS || DEFAULT_SETTLE_MS);
const MAX_PENDING_MS = Number(process.env.ARCHBOARD_SETTLE_MAX_MS || DEFAULT_SETTLE_MAX_MS);
const MAX_EVENTS = 200;
// Snapshots are the expensive part of the ring, so fewer are kept than events.
// Past this depth a hook asking to coalesce is told the truth — that the
// checkpoint is gone — rather than being handed a diff from the wrong place.
const MAX_CHECKPOINTS = 24;

interface BoardWatch {
	key: string;
	identity: BoardIdentity;
	/**
	 * The board as of the last emitted event (or the last reset).
	 *
	 * A deep copy, through the same `copyElements` a branch and a snapshot use.
	 * It used to be a spread, which left `customData` and `boundElements` shared
	 * with the live board — the two fields a baseline most needs held still,
	 * since one is the semantic channel (ADR 0003) and the other is how a label
	 * belongs to its container.
	 *
	 * This is the quietest of the three places that hazard turned up (TASK-042,
	 * TASK-048, TASK-052). A branch or a snapshot that shares objects hands back
	 * visibly wrong data. A baseline that shares them hands back silence: the
	 * board moves, the baseline moves with it, the diff finds nothing and nobody
	 * learns there was anything to look at. That silence reaches the agent too,
	 * because this feed is what injection pushes into a live thread.
	 */
	baseline: ServerElement[];
	baselineAt: string;
	timer: NodeJS.Timeout | null;
	firstPendingAt: number | null;
	mutations: number;
	origins: Set<ChangeOrigin>;
	read: () => ServerElement[];
}

interface Checkpoint {
	/** The cursor of the event this snapshot was the baseline for. */
	cursor: number;
	board: string;
	at: string;
	elements: ServerElement[];
}

class ChangeFeed extends EventEmitter {
	/**
	 * Identifies this feed, and therefore this canvas process.
	 *
	 * Cursors are only meaningful within one process: the canvas is in-memory,
	 * so a restart begins again at zero. A hook keeps its cursor in a state file
	 * that outlives the canvas, and without this it could not tell "nothing has
	 * happened since cursor 42" from "this is a different canvas, and 42 was
	 * somebody else's". A changed feedId means: start over.
	 */
	readonly id = randomUUID().slice(0, 8);
	private watches = new Map<string, BoardWatch>();
	private events: ChangeEvent[] = [];
	private checkpoints: Checkpoint[] = [];
	private nextCursor = 1;
	private echoUntil = new Map<string, number>();

	/** The cursor a caller starting now should use to mean "from here on". */
	get cursor(): number {
		return this.nextCursor - 1;
	}

	/**
	 * Point the feed at a board and declare its current state uninteresting.
	 *
	 * Called when a board is opened, created or switched to: the whole board
	 * arriving at once is not a change anybody made, and reporting it as several
	 * hundred additions would bury the first real edit.
	 */
	reset(key: string, identity: BoardIdentity, read: () => ServerElement[]): void {
		const existing = this.watches.get(key);
		if (existing?.timer) clearTimeout(existing.timer);
		this.watches.set(key, {
			key,
			identity,
			baseline: copyElements(read()),
			baselineAt: new Date().toISOString(),
			timer: null,
			firstPendingAt: null,
			mutations: 0,
			origins: new Set(),
			read,
		});
	}

	/**
	 * "Anything the browser reports on this board in the next `ms` is the
	 * agent's own work coming back."
	 *
	 * One path genuinely needs this: `mermaid` renders in the browser and
	 * returns through the same change report a human drag uses, so without it
	 * the agent's own diagram reads as something the human drew — and gets
	 * narrated back at the agent that drew it.
	 */
	expectAgentEcho(key: string, ms = 5000): void {
		this.echoUntil.set(key, Date.now() + ms);
	}

	/**
	 * Note that something changed on a board, without saying what.
	 *
	 * Deliberately cheap and deliberately ignorant of the mutation: the feed
	 * never looks at element deltas, only at the state they settle into.
	 */
	record(
		key: string,
		identity: BoardIdentity,
		read: () => ServerElement[],
		origin: ChangeOrigin,
	): void {
		const echo = this.echoUntil.get(key);
		if (origin === "human" && echo !== undefined && Date.now() < echo) origin = "agent";
		let watch = this.watches.get(key);
		if (!watch) {
			// First sight of this board: its current state is the baseline minus the
			// mutation that is landing right now, which we cannot see. Taking the
			// post-mutation state would silently swallow the first edit, so the
			// baseline is empty and the first event reports the board as it stands.
			this.reset(key, identity, read);
			watch = this.watches.get(key)!;
			watch.baseline = [];
		}
		watch.identity = identity;
		watch.read = read;
		watch.mutations += 1;
		watch.origins.add(origin);
		if (watch.firstPendingAt === null) watch.firstPendingAt = Date.now();

		const waited = Date.now() - watch.firstPendingAt;
		if (waited >= MAX_PENDING_MS) {
			this.settle(key);
			return;
		}
		if (watch.timer) clearTimeout(watch.timer);
		watch.timer = setTimeout(() => this.settle(key), SETTLE_MS);
		watch.timer.unref?.();
	}

	/** Force the pending window closed now. Used by tests and by `changes --coalesce`. */
	settle(key: string): ChangeEvent | null {
		const watch = this.watches.get(key);
		if (!watch) return null;
		if (watch.timer) clearTimeout(watch.timer);
		watch.timer = null;
		if (watch.mutations === 0) return null;

		const mutations = watch.mutations;
		const origins = watch.origins;
		watch.mutations = 0;
		watch.origins = new Set();
		watch.firstPendingAt = null;

		const after = watch.read();
		let change: SemanticChange;
		try {
			change = diffBoardStates(watch.baseline, after, watch.identity, watch.key);
		} catch (error) {
			// A diff that throws must not take the canvas with it: the feed is a
			// side channel, and every route that feeds it has already succeeded.
			logger.warn(`Change feed could not diff "${key}": ${(error as Error).message}`);
			return null;
		}

		if (change.significance !== "structural" && change.significance !== "layout") {
			// Nothing worth saying — and the baseline stays put, so the next nudge
			// is measured from the last thing anybody was told about.
			return null;
		}

		const at = new Date().toISOString();
		const event: ChangeEvent = {
			cursor: this.nextCursor++,
			board: key,
			identity: watch.identity,
			at,
			since: watch.baselineAt,
			origin: origins.size > 1 ? "mixed" : (origins.values().next().value ?? "agent"),
			significance: change.significance,
			headline: change.headline,
			text: narrateChange(change),
			change,
			mutations,
			elementCount: after.length,
		};

		this.checkpoints.push({
			cursor: event.cursor,
			board: key,
			at: watch.baselineAt,
			elements: watch.baseline,
		});
		if (this.checkpoints.length > MAX_CHECKPOINTS) this.checkpoints.shift();

		watch.baseline = copyElements(after);
		watch.baselineAt = at;

		this.events.push(event);
		if (this.events.length > MAX_EVENTS) this.events.shift();

		logger.info(
			`Change event ${event.cursor} on "${key}" (${event.origin}, ${event.significance}): ${event.headline}`,
		);
		this.emit("change", event);
		return event;
	}

	/** Flush every board with a pending window. */
	settleAll(): ChangeEvent[] {
		const out: ChangeEvent[] = [];
		for (const key of this.watches.keys()) {
			const event = this.settle(key);
			if (event) out.push(event);
		}
		return out;
	}

	onChange(listener: (event: ChangeEvent) => void): () => void {
		this.on("change", listener);
		return () => this.off("change", listener);
	}

	/** Events after `since`, oldest first. */
	since(since: number, board?: string): ChangeEvent[] {
		return this.events.filter((e) => e.cursor > since && (!board || e.board === board));
	}

	/**
	 * Everything since `since` as ONE diff against the board as it stands.
	 *
	 * This is the hook's shape: a hook that has been away four turns wants the
	 * net difference, not four events to reconcile. Returns null when the
	 * checkpoint that far back has been dropped from the ring, so the caller can
	 * say "I lost the thread" instead of quietly diffing from the wrong place.
	 */
	coalesce(
		since: number,
		board: string,
	): { since: string; change: SemanticChange; events: ChangeEvent[]; cursor: number } | null {
		const watch = this.watches.get(board);
		if (!watch) return null;
		const events = this.since(since, board);
		if (events.length === 0) {
			return {
				since: watch.baselineAt,
				change: diffBoardStates(watch.baseline, watch.baseline, watch.identity, board),
				events,
				cursor: this.cursor,
			};
		}
		const first = events[0]!;
		const checkpoint = this.checkpoints.find((c) => c.cursor === first.cursor && c.board === board);
		if (!checkpoint) return null;
		return {
			since: checkpoint.at,
			change: diffBoardStates(checkpoint.elements, watch.read(), watch.identity, board),
			events,
			cursor: this.cursor,
		};
	}

	/** For the status surfaces: what the feed is watching and how far along it is. */
	status(): {
		feedId: string;
		cursor: number;
		settleMs: number;
		maxPendingMs: number;
		boards: Array<{ board: string; baselineAt: string; pending: number; events: number }>;
	} {
		return {
			feedId: this.id,
			cursor: this.cursor,
			settleMs: SETTLE_MS,
			maxPendingMs: MAX_PENDING_MS,
			boards: [...this.watches.values()].map((w) => ({
				board: w.key,
				baselineAt: w.baselineAt,
				pending: w.mutations,
				events: this.events.filter((e) => e.board === w.key).length,
			})),
		};
	}
}

// One feed per canvas process, like the board store: the canvas is a single
// place, and a per-connection feed would give every reader a different history.
// One feed per canvas process, and the same one across a hot reload: cursors
// and baselines are what a hook and the injector hold between turns, and a feed
// that started over would report the whole board as new (src/core/hot.ts).
//
// Keeping the instance means keeping its methods too, so an edit to this file
// takes effect only after a real restart. That is the trade this instance is on
// the right side of: stale narration for a few seconds against a cursor a hook
// cannot trust again.
export const changeFeed = kept("change-feed", () => new ChangeFeed());
