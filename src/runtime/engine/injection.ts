// Pushing board changes into a live Codex thread.
//
// The canvas knows something happened (change-feed.ts). This decides whether
// the coding agent should be told, which thread to tell, how loudly, and how
// often. It is deliberately the only place any of those four questions is
// answered.
//
// ── This is a privileged capability, not a feature of being up ─────
//
// ADR 0005 is explicit and this module implements it literally. The app-server
// control socket is multi-client and guarded by nothing but filesystem
// permissions, and the canvas server has no authentication at all. Wire the
// two together carelessly and anything that can reach the canvas can drive the
// coding agent — remote code execution with extra steps. So:
//
//   1. Injection is OFF unless ARCHBOARD_INJECT is set. Nothing about a canvas
//      being up, a browser being open, or a daemon existing turns it on.
//   2. Injection refuses to arm at all when the canvas is not bound to
//      loopback. The thin-client path in FLIP_WHITEBOARD.md puts the canvas on
//      a LAN address; on that deployment this stays dark, and the operator
//      cannot re-enable it with an env var. Use an SSH tunnel instead.
//   3. The control socket must be a socket this uid owns.
//
// ── Quiet by default ───────────────────────────────────────────────
//
// `thread/inject_items` appends to thread history WITHOUT starting a turn: the
// agent sees the board change next time it speaks, and nothing is interrupted.
// That is the default and the thing this module is for.
//
// `turn/steer` interrupts a running turn, and because output from an
// externally-started turn is pushed into the voice session, it makes the agent
// talk over you. It exists here because it was asked for, it ships off, and it
// is switched on per-run for testing. It is an experiment.
//
// ── Two debounces, deliberately ────────────────────────────────────
//
// The feed already collapses a drag into one settled event. This adds a second
// window on top, because several settled events can still arrive in a few
// seconds while someone rearranges a board, and each injection costs the agent
// context. Events inside the window are coalesced into one message, and a
// minimum interval keeps a busy board from becoming a stream.

import { changeFeed } from "./change-feed.js";
import type { ChangeEvent } from "./change-feed.js";
import {
	AppServerControl,
	checkSocket,
	codexHome,
	controlSocketPath,
} from "./app-server-control.js";
import type { SocketCheck } from "./app-server-control.js";
import { kept } from "./hot.js";
import { recentDoing } from "./board-doing.js";
import {
	DEFAULT_INJECT_DEBOUNCE_MS,
	DEFAULT_INJECT_MIN_INTERVAL_MS,
} from "../../shared/timing/timing.js";
import logger from "./logger.js";

const truthy = (value: string | undefined) => value === "1" || value === "true" || value === "yes";

export interface InjectionConfig {
	enabled: boolean;
	loud: boolean;
	pinnedThread: string | null;
	debounceMs: number;
	minIntervalMs: number;
	codexHome: string;
	socketPath: string;
}

export function injectionConfig(): InjectionConfig {
	return {
		enabled: truthy(process.env.ARCHBOARD_INJECT),
		loud: truthy(process.env.ARCHBOARD_INJECT_LOUD),
		pinnedThread: process.env.ARCHBOARD_INJECT_THREAD?.trim() || null,
		// The two numbers, and how they sit on top of the change feed's settle
		// window, are in ./timing.ts. Read here rather than at module scope so a
		// caller can set the environment and then import this.
		debounceMs: Number(process.env.ARCHBOARD_INJECT_DEBOUNCE_MS || DEFAULT_INJECT_DEBOUNCE_MS),
		minIntervalMs: Number(
			process.env.ARCHBOARD_INJECT_MIN_INTERVAL_MS || DEFAULT_INJECT_MIN_INTERVAL_MS,
		),
		codexHome: codexHome(),
		socketPath: controlSocketPath(),
	};
}

const LOOPBACK_NAMES = new Set(["localhost", "::1", "0:0:0:0:0:0:0:1"]);

/**
 * Is this host address loopback-only?
 *
 * `0.0.0.0` and `::` are NOT: they accept LAN connections, which is exactly
 * the deployment ADR 0005 says must never be able to drive the agent.
 */
export function isLoopbackHost(host: string): boolean {
	const value = host
		.trim()
		.toLowerCase()
		.replace(/^\[|\]$/g, "");
	if (LOOPBACK_NAMES.has(value)) return true;
	return /^127(\.\d{1,3}){3}$/.test(value);
}

interface ThreadObservation {
	threadId: string;
	/** The id of the turn currently running on it, when one is. */
	activeTurnId: string | null;
}

export type TargetReason = "pinned" | "none";

export interface InjectionTarget {
	threadId: string | null;
	reason: TargetReason;
	/** Why the target is what it is, in a sentence a human can act on. */
	explanation: string;
	activeTurnId?: string | null;
}

export interface InjectionStatusReport {
	enabled: boolean;
	armed: boolean;
	loud: boolean;
	refusal: string | null;
	host: string | null;
	socket: SocketCheck;
	connected: boolean;
	lastError: string | null;
	target: InjectionTarget;
	threadsSeen: number;
	pending: number;
	debounceMs: number;
	minIntervalMs: number;
	injected: { quiet: number; loud: number; failed: number };
	lastInjectionAt: string | null;
	lastInjection: { channel: "quiet" | "loud"; threadId: string; at: string; text: string } | null;
}

class Injector {
	private config: InjectionConfig = injectionConfig();
	private control: AppServerControl | null = null;
	private unsubscribe: (() => void) | null = null;
	private host: string | null = null;
	private refusal: string | null = null;
	private armed = false;
	private threads = new Map<string, ThreadObservation>();
	private pending: ChangeEvent[] = [];
	private timer: NodeJS.Timeout | null = null;
	private lastInjectAt = 0;
	private counts = { quiet: 0, loud: 0, failed: 0 };
	private last: InjectionStatusReport["lastInjection"] = null;

	/**
	 * Arm injection, or explain why not. Called once, from the canvas server,
	 * with the address it actually bound — not with a guess.
	 */
	start(host: string): void {
		this.config = injectionConfig();
		this.host = host;

		if (!this.config.enabled) {
			this.refusal =
				"ARCHBOARD_INJECT is not set, so the canvas cannot push anything to a Codex thread. " +
				"This is the default: making the agent act is a separate capability from drawing on a board.";
			return;
		}
		if (!isLoopbackHost(host)) {
			// Not overridable, on purpose. An env var that could switch this off
			// would make the rule advice rather than a rule.
			this.refusal =
				`The canvas is bound to ${host}, which is reachable from outside this machine, so injection stays ` +
				"off no matter what ARCHBOARD_INJECT says (ADR 0005: anything that can reach the canvas could " +
				"otherwise drive the coding agent). Serve the canvas over an SSH tunnel and bind 127.0.0.1, or " +
				"leave injection disabled on this deployment.";
			logger.warn(this.refusal);
			return;
		}
		if (!this.config.pinnedThread) {
			this.refusal =
				"ARCHBOARD_INJECT_THREAD is not set, so the canvas has no deterministic Codex task route. " +
				"Nothing will be injected. Set it to the exact task id before starting the canvas.";
			return;
		}

		const socket = checkSocket(this.config.socketPath);
		if (!socket.exists || !socket.isSocket || !socket.ownedByUs) {
			// Not fatal: the daemon may come up later, and connect() re-checks.
			logger.info(
				`Injection is enabled but the app-server control socket is not usable yet — ${socket.problem}`,
			);
		}

		this.armed = true;
		this.refusal = null;
		this.control = new AppServerControl({ socketPath: this.config.socketPath });
		this.control.on("notification", (n) => this.observe(n.method, n.params));
		this.control.on("disconnected", () =>
			logger.info("app-server control connection closed; will reconnect on the next injection"),
		);
		this.unsubscribe = changeFeed.onChange((event) => this.consider(event));

		logger.info(
			`Injection armed (quiet${this.config.loud ? " + LOUD, experimental" : ""}) — canvas on ${host}, ` +
				`socket ${this.config.socketPath}`,
		);
		// Connect eagerly so the daemon starts pushing thread notifications now
		// rather than at the first board change: the first change is exactly when
		// knowing which thread is live matters most.
		void this.control.connect().catch((error) => {
			logger.info(`Not connected to the app-server yet: ${(error as Error).message}`);
		});
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.control?.close();
		this.control = null;
		this.armed = false;
	}

	// ---- watching the daemon -------------------------------------------------

	private touch(threadId: string): ThreadObservation {
		const existing = this.threads.get(threadId);
		if (existing) return existing;
		const fresh: ThreadObservation = {
			threadId,
			activeTurnId: null,
		};
		this.threads.set(threadId, fresh);
		return fresh;
	}

	private observe(method: string, params: unknown): void {
		const record = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
		const threadId = record.threadId;
		if (typeof threadId !== "string" || !threadId) return;

		switch (method) {
			case "thread/started":
				this.touch(threadId);
				break;
			case "turn/started":
				const turn =
					record.turn && typeof record.turn === "object"
						? (record.turn as Record<string, unknown>)
						: {};
				this.touch(threadId).activeTurnId = typeof turn.id === "string" ? turn.id : null;
				break;
			case "turn/completed":
			case "turn/failed":
				this.touch(threadId).activeTurnId = null;
				break;
			default:
				break;
		}
	}

	/**
	 * Which thread gets told.
	 *
	 * A board has no task identity of its own yet. Recent activity and the number
	 * of loaded tasks do not establish ownership, so only an explicit
	 * ARCHBOARD_INJECT_THREAD route may select a target.
	 */
	target(): InjectionTarget {
		if (this.config.pinnedThread) {
			const observed = this.threads.get(this.config.pinnedThread);
			return {
				threadId: this.config.pinnedThread,
				reason: "pinned",
				explanation: `ARCHBOARD_INJECT_THREAD pins this thread.`,
				activeTurnId: observed?.activeTurnId ?? null,
			};
		}

		return {
			threadId: null,
			reason: "none",
			explanation:
				"ARCHBOARD_INJECT_THREAD does not name a task, so there is no deterministic route. Nothing was injected.",
		};
	}

	// ---- deciding what to say ------------------------------------------------

	private consider(event: ChangeEvent): void {
		if (!this.armed) return;
		// The agent's own drawing is not news to the agent. Only a change that
		// includes a user edit is worth spending its context on.
		if (event.origin === "agent") return;

		this.pending.push(event);
		this.schedule();
	}

	private schedule(): void {
		if (this.timer) return;
		const sinceLast = Date.now() - this.lastInjectAt;
		const wait = Math.max(this.config.debounceMs, this.config.minIntervalMs - sinceLast);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, wait);
		this.timer.unref?.();
	}

	/**
	 * The message a thread receives. Facts only; every line came from the feed —
	 * or, for the last of them, from an agent saying what it was doing.
	 */
	private compose(events: ChangeEvent[]): string {
		const board = events[events.length - 1]!.board;
		const cursorBefore = events[0]!.cursor - 1;
		const header =
			events.length === 1
				? `[archboard] The human changed the board "${board}": ${events[0]!.headline}.`
				: `[archboard] The human made ${events.length} changes to the board "${board}", most recently: ${events[events.length - 1]!.headline}.`;

		const body: string[] = [];
		let budget = 1600;
		for (const event of events.slice(-4)) {
			const text = event.text.slice(0, budget);
			if (!text) continue;
			body.push(text);
			budget -= text.length;
			if (budget <= 0) break;
		}

		// ── What an agent was doing while they did it ──────────────
		//
		// Descriptions reach a live model here and nowhere else, and that is the
		// whole of how "an agent's own drawing is never injected back at it"
		// (ADR 0005) survives them. A description is by definition an agent's, so
		// injecting one as an event in its own right would be narrating an agent to
		// itself in every single-agent session — and the canvas cannot tell whose
		// is whose, because the writer is an HTTP request and the target is a
		// thread on the app-server socket, with nothing joining the two.
		//
		// Carried on the HUMAN's event instead, where the payload is the person's
		// act and this is the context for it: what was going on when they reached
		// in. It cannot be self-narration, because no agent event is ever injected.
		// The reading agent may see its own last line quoted, which is the useful
		// case rather than the bad one — it is being told the person changed the
		// board mid-step, and which step.
		const said = recentDoing(board).slice(-3);
		const doing =
			said.length === 0
				? []
				: [
						said.length === 1
							? `An agent was at: ${said[0]!.doing}.`
							: `An agent was at: ${said.map((entry) => entry.doing).join("; then ")}.`,
					];

		return [
			header,
			...body,
			...doing,
			`(Nobody is waiting on you for this — it is the board, not a request. ` +
				`\`archboard changes --since ${cursorBefore}\` has the full diff, \`describe\` has the board as it stands.)`,
		].join("\n");
	}

	private async flush(): Promise<void> {
		const events = this.pending;
		this.pending = [];
		if (events.length === 0 || !this.armed || !this.control) return;

		const text = this.compose(events);
		try {
			await this.send(text);
		} catch (error) {
			this.counts.failed += 1;
			logger.warn(`Injection failed: ${(error as Error).message}`);
		}
	}

	/**
	 * Send one message, quietly unless loud is switched on and there is
	 * something to interrupt.
	 */
	async send(text: string): Promise<{ channel: "quiet" | "loud"; threadId: string }> {
		if (!this.control) throw new Error("injection is not armed");
		await this.control.connect();

		const target = this.target();
		if (!target.threadId) throw new Error(`no thread to inject into — ${target.explanation}`);

		const turnId = target.activeTurnId ?? this.threads.get(target.threadId)?.activeTurnId ?? null;
		if (this.config.loud && turnId) {
			try {
				await this.control.steerTurn(target.threadId, turnId, text);
				this.record("loud", target.threadId, text);
				return { channel: "loud", threadId: target.threadId };
			} catch (error) {
				// A steer is refused when the turn ended between the notification and
				// the call. That is normal, and the quiet channel still applies.
				logger.info(
					`Steering turn ${turnId} was refused (${(error as Error).message}); injecting quietly instead`,
				);
			}
		}

		await this.control.injectItems(target.threadId, text);
		this.record("quiet", target.threadId, text);
		return { channel: "quiet", threadId: target.threadId };
	}

	private record(channel: "quiet" | "loud", threadId: string, text: string): void {
		this.lastInjectAt = Date.now();
		this.counts[channel] += 1;
		this.last = { channel, threadId, at: new Date().toISOString(), text };
		logger.info(`Injected ${channel} into thread ${threadId} (${text.length} chars)`);
	}

	status(): InjectionStatusReport {
		const config = this.armed ? this.config : injectionConfig();
		return {
			enabled: config.enabled,
			armed: this.armed,
			loud: config.loud,
			refusal: this.refusal,
			host: this.host,
			socket: checkSocket(config.socketPath),
			connected: this.control?.connected ?? false,
			lastError: this.control?.lastError ?? null,
			target: this.armed
				? this.target()
				: { threadId: null, reason: "none", explanation: "injection is not armed" },
			threadsSeen: this.threads.size,
			pending: this.pending.length,
			debounceMs: config.debounceMs,
			minIntervalMs: config.minIntervalMs,
			injected: { ...this.counts },
			lastInjectionAt: this.last?.at ?? null,
			lastInjection: this.last,
		};
	}

	/**
	 * A probe, for checking the wiring without rearranging a board. Injects a
	 * message that says plainly what it is — a test message should never be
	 * mistakeable for a real board change.
	 */
	async test(
		note?: string,
		loud?: boolean,
	): Promise<{ channel: "quiet" | "loud"; threadId: string; text: string }> {
		if (!this.armed) {
			throw new Error(this.refusal ?? "injection is not armed");
		}
		const trimmed = (note ?? "").trim().slice(0, 200);
		const text = [
			"[archboard] Test injection — the canvas is checking that it can reach this thread.",
			"No board change happened. Nothing is being asked of you.",
			...(trimmed ? [`Note from the operator: ${trimmed}`] : []),
		].join("\n");

		// The loud switch can be forced up for one probe, which is the whole point
		// of having a probe: testing loud should not need a server restart. It
		// cannot be forced *on* for the feed — that stays with the env switch.
		const wasLoud = this.config.loud;
		if (loud !== undefined) this.config.loud = loud;
		try {
			const result = await this.send(text);
			return { ...result, text };
		} finally {
			this.config.loud = wasLoud;
		}
	}
}

// Kept across a hot reload, like the feed it subscribes to. Injection is armed
// once, from the address the server actually bound (ADR 0005), and a second
// Injector would subscribe a second time and push every event into the thread
// twice (src/runtime/engine/hot.ts).
const injector = kept("injector", () => new Injector());

export function startInjection(host: string): void {
	injector.start(host);
}

export function stopInjection(): void {
	injector.stop();
}

export function injectionStatus(): InjectionStatusReport {
	return injector.status();
}

export function injectTest(
	note?: string,
	loud?: boolean,
): Promise<{ channel: "quiet" | "loud"; threadId: string; text: string }> {
	return injector.test(note, loud);
}
