// A pane's reporting reducer driven on a manual clock against a scripted
// server, so the scheduling, acknowledgement and recovery contracts are
// exercised without a browser.

import {
	hasPendingEdits,
	initialState,
	mergeIncoming,
	reduce,
	reportsSettled,
	type ChangeReportingEffect,
	type ChangeReportingEvent,
	type ChangeReportingState,
	type SceneElement,
} from "@/ui/canvas/change-reporting";

/**
 * A deep copy, so the harness never shares an element with the scene it replaced.
 * @param value Anything structured-cloneable.
 * @returns The copy.
 */
function copy<T>(value: T): T {
	return structuredClone(value);
}

/**
 * A rectangle.
 * @param id Its id.
 * @param x Its left.
 * @param y Its top.
 * @returns The element.
 */
function box(id: string, x = 0, y = 0): SceneElement {
	return { id, type: "rectangle", x, y, width: 120, height: 80, version: 1 };
}

/**
 * Two boxes side by side.
 * @returns The scene.
 */
function initialScene(): SceneElement[] {
	return [box("a"), box("b", 200)];
}

type TimerKind = "progress" | "idle" | "retry" | "finish";

interface Timer {
	id: number;
	kind: TimerKind;
	at: number;
	callback: () => void;
}

/** A clock the harness advances by hand. */
class ManualClock {
	now = 0;
	#nextId = 1;
	readonly #timers = new Map<number, Timer>();

	/**
	 * Arm a timer, replacing any of the same kind except a completion.
	 * @param kind Which timer.
	 * @param delayMs How long until it fires.
	 * @param callback What fires.
	 */
	start(kind: TimerKind, delayMs: number, callback: () => void): void {
		if (kind !== "finish") {
			this.cancel(kind);
		}
		const id = this.#nextId++;
		this.#timers.set(id, { id, kind, at: this.now + delayMs, callback });
	}

	/**
	 * Cancel every timer of a kind.
	 * @param kind Which timer.
	 */
	cancel(kind: TimerKind): void {
		for (const [id, timer] of this.#timers) {
			if (timer.kind === kind) {
				this.#timers.delete(id);
			}
		}
	}

	/**
	 * The next timer due by a time, in firing order.
	 * @param target The time.
	 * @returns The timer, or undefined when none is due.
	 */
	#due(target: number): Timer | undefined {
		return [...this.#timers.values()]
			.filter((timer) => timer.at <= target)
			.toSorted((left, right) => left.at - right.at || left.id - right.id)[0];
	}

	/**
	 * Move time forward, firing every timer that comes due in order.
	 * @param ms How far.
	 */
	advance(ms: number): void {
		const target = this.now + ms;
		for (let due = this.#due(target); due !== undefined; due = this.#due(target)) {
			this.#timers.delete(due.id);
			this.now = due.at;
			due.callback();
		}
		this.now = target;
	}
}

type SendReportEffect = Extract<ChangeReportingEffect, { type: "send_report" }>;

/** What the server changed on the way in. */
interface Corrections {
	upserts: readonly SceneElement[];
	deletes: readonly string[];
}

/**
 * A reported upsert as a scene element: the wire carries the element's fields.
 * @param element The upsert on the wire.
 * @returns The element.
 */
function upsertElement(element: Record<string, unknown>): SceneElement {
	// The wire shape is the element without server bookkeeping.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return element as unknown as SceneElement;
}

/**
 * Apply deletes and upserts to a document by id.
 * @param byId The document, mutated.
 * @param deletes Ids to drop.
 * @param upserts Elements to set.
 */
function applyToDocument(
	byId: Map<string, SceneElement>,
	deletes: readonly string[],
	upserts: readonly SceneElement[],
): void {
	for (const id of deletes) {
		byId.delete(id);
	}
	for (const element of upserts) {
		byId.set(element.id, copy(element));
	}
}

/** A server that applies what it is sent and answers when told to. */
class ScriptedServer {
	document: SceneElement[];
	readonly requests: SendReportEffect[] = [];

	/**
	 * Start with a document.
	 * @param scene The board.
	 */
	constructor(scene: readonly SceneElement[]) {
		this.document = copy([...scene]);
	}

	/**
	 * A report arrived.
	 * @param effect The send effect.
	 */
	receive(effect: SendReportEffect): void {
		this.requests.push(effect);
	}

	/**
	 * Accept the oldest waiting report, applying it and any corrections.
	 * @param corrections What the server changed.
	 * @returns The accepted request.
	 */
	accept(corrections: Corrections = { upserts: [], deletes: [] }): SendReportEffect {
		const request = this.requests.shift();
		if (!request) {
			throw new Error("No change report is waiting for a server reply");
		}
		const byId = new Map(this.document.map((element) => [element.id, element]));
		applyToDocument(byId, request.report.deletes, request.report.upserts.map(upsertElement));
		applyToDocument(byId, corrections.deletes, corrections.upserts);
		this.document = [...byId.values()];
		return request;
	}

	/**
	 * Refuse the oldest waiting report.
	 * @returns The refused request.
	 */
	refuse(): SendReportEffect {
		const request = this.requests.shift();
		if (!request) {
			throw new Error("No change report is waiting for a refusal");
		}
		return request;
	}
}

type FiredType = "progress_timer_fired" | "idle_timer_fired" | "retry_timer_fired";

const TIMER_OF_START: Readonly<Record<string, { kind: TimerKind; fired: FiredType }>> = {
	start_progress_timer: { kind: "progress", fired: "progress_timer_fired" },
	start_idle_timer: { kind: "idle", fired: "idle_timer_fired" },
	start_retry_timer: { kind: "retry", fired: "retry_timer_fired" },
};

const TIMER_OF_CANCEL: Readonly<Record<string, TimerKind>> = {
	cancel_progress_timer: "progress",
	cancel_idle_timer: "idle",
	cancel_retry_timer: "retry",
};

/** The reducer, its scene, its clock and its server, driven together. */
class ReportingHarness {
	state: ChangeReportingState = initialState();
	scene: SceneElement[];
	readonly clock = new ManualClock();
	server: ScriptedServer;
	withheldIds: string[] = [];
	sceneUpdates = 0;
	holdRequests = 0;
	releaseChecks = 0;
	settledReleaseChecks = 0;

	/**
	 * Start with a scene the server holds and the pane has adopted.
	 * @param scene The board.
	 */
	constructor(scene: readonly SceneElement[] = initialScene()) {
		this.scene = copy([...scene]);
		this.server = new ScriptedServer(scene);
		this.dispatch({
			type: "server_update_requested",
			update: { elements: copy(scene), captureUpdate: "never" },
			baselineUpdate: { type: "replace", withheldIds: [] },
		});
		this.clock.advance(0);
		this.dispatch({ type: "user_interacted" });
	}

	/**
	 * Run the reducer and its effects.
	 * @param event What happened.
	 */
	dispatch(event: ChangeReportingEvent): void {
		const result = reduce(this.state, event);
		this.state = result.state;
		for (const effect of result.effects) {
			this.#execute(effect);
		}
	}

	/**
	 * The event a timer firing dispatches.
	 * @param type The event type.
	 * @param generation The generation the timer was armed in.
	 * @returns The event.
	 */
	#fired(type: FiredType, generation: number): ChangeReportingEvent {
		return { type, generation, scene: copy(this.scene), withheldIds: this.withheldIds };
	}

	/**
	 * Run a timer effect.
	 * @param effect The effect.
	 * @returns Whether it was a timer effect.
	 */
	#executeTimer(effect: ChangeReportingEffect): boolean {
		const cancel = TIMER_OF_CANCEL[effect.type];
		if (cancel !== undefined) {
			this.clock.cancel(cancel);
			return true;
		}
		const start = TIMER_OF_START[effect.type];
		if (start !== undefined && "delayMs" in effect) {
			this.clock.start(start.kind, effect.delayMs, () =>
				this.dispatch(this.#fired(start.fired, effect.generation)),
			);
			return true;
		}
		return false;
	}

	/**
	 * A server update was applied: the scene is what it said, and the reducer hears so.
	 * @param effect The effect.
	 */
	#applyServerUpdate(
		effect: Extract<ChangeReportingEffect, { type: "apply_server_update" }>,
	): void {
		this.sceneUpdates += 1;
		if (effect.update.elements) {
			this.scene = copy([...effect.update.elements]);
		}
		this.dispatch({
			type: "server_update_applied",
			generation: effect.generation,
			scene: copy(this.scene),
			baselineUpdate: effect.baselineUpdate,
			...(effect.reportAfterUpdate ? { reportAfterUpdate: effect.reportAfterUpdate } : {}),
		});
	}

	/**
	 * A local update was applied.
	 * @param effect The effect.
	 */
	#applyLocalUpdate(effect: Extract<ChangeReportingEffect, { type: "apply_local_update" }>): void {
		if (effect.update.elements) {
			this.scene = copy([...effect.update.elements]);
		}
		this.dispatch({
			type: "local_update_applied",
			generation: effect.generation,
			scene: copy(this.scene),
		});
	}

	/**
	 * Run a scene-update effect.
	 * @param effect The effect.
	 * @returns Whether it was a scene-update effect.
	 */
	#executeUpdate(effect: ChangeReportingEffect): boolean {
		switch (effect.type) {
			case "apply_server_update":
				this.#applyServerUpdate(effect);
				return true;
			case "apply_local_update":
				this.#applyLocalUpdate(effect);
				return true;
			case "finish_server_update":
				this.clock.start("finish", 0, () =>
					this.dispatch({
						type: "server_update_finished",
						generation: effect.generation,
						scene: copy(this.scene),
						withheldIds: this.withheldIds,
					}),
				);
				return true;
			default:
				return false;
		}
	}

	/**
	 * Run a reporting effect: a report, a hold or a release check.
	 * @param effect The effect.
	 */
	#executeReporting(effect: ChangeReportingEffect): void {
		if (effect.type === "send_report") {
			this.server.receive(effect);
		} else if (effect.type === "release_if_idle") {
			this.releaseChecks += 1;
			if (reportsSettled(this.state)) {
				this.settledReleaseChecks += 1;
			}
		} else if (effect.type === "take_hold") {
			this.holdRequests += 1;
		}
	}

	/**
	 * Run one effect.
	 * @param effect The effect.
	 */
	#execute(effect: ChangeReportingEffect): void {
		if (!this.#executeTimer(effect) && !this.#executeUpdate(effect)) {
			this.#executeReporting(effect);
		}
	}

	/**
	 * The person changed an element.
	 * @param id Which element.
	 * @param changes The changed fields.
	 */
	edit(id: string, changes: Record<string, unknown>): void {
		this.scene = this.scene.map((element) =>
			element.id === id ? { ...element, ...changes, version: (element.version ?? 0) + 1 } : element,
		);
		this.dispatch({ type: "scene_changed", scene: copy(this.scene) });
	}

	/**
	 * The person removed an element.
	 * @param id Which element.
	 */
	remove(id: string): void {
		this.scene = this.scene.filter((element) => element.id !== id);
		this.dispatch({ type: "scene_changed", scene: copy(this.scene) });
	}

	/** Let every deadline pass. */
	due(): void {
		this.clock.advance(10_000);
	}

	/**
	 * The server accepted the oldest waiting report.
	 * @param corrections What the server changed.
	 * @param version The note version the write left the board at.
	 */
	accept(
		corrections: Corrections = { upserts: [], deletes: [] },
		version: number | null = null,
	): void {
		const request = this.server.accept(corrections);
		this.dispatch({
			type: "report_succeeded",
			generation: request.generation,
			corrections,
			currentScene: copy(this.scene),
			version,
		});
		this.clock.advance(0);
	}

	/**
	 * The server refused the oldest waiting report because the note moved
	 * (ADR 0022): the refusal's document replaces the scene, as the runtime does.
	 * @param document The board as the note holds it.
	 * @param version The note version the document is at.
	 */
	refuseVersion(document: readonly SceneElement[], version: number | null): void {
		const request = this.server.refuse();
		this.dispatch({ type: "report_version_refused", generation: request.generation, version });
		// The note decides: the runtime shows the document as is, an open editor closed.
		this.dispatch({
			type: "server_update_requested",
			update: {
				elements: copy([...document]),
				appState: { editingTextElement: null },
				captureUpdate: "never",
			},
			baselineUpdate: { type: "replace", withheldIds: [] },
		});
		this.clock.advance(0);
	}

	/** The server refused the oldest waiting report. */
	refuse(): void {
		const request = this.server.refuse();
		this.dispatch({ type: "report_refused", generation: request.generation });
	}

	/**
	 * Server elements arrived over the socket.
	 * @param incoming The elements.
	 */
	applyServerElements(incoming: readonly SceneElement[]): void {
		const { elements } = mergeIncoming(this.scene, incoming, this.state.baseline);
		this.dispatch({
			type: "server_update_requested",
			update: { elements, captureUpdate: "never" },
			baselineUpdate: { type: "touch", elements: incoming },
		});
	}

	/**
	 * Whether every pending edit will still reach the server.
	 * @returns True when nothing is pending, or something is scheduled to send it.
	 */
	pendingIsReachable(): boolean {
		return (
			!hasPendingEdits(this.state, this.scene, this.withheldIds) || !reportsSettled(this.state)
		);
	}
}

/**
 * One element of a scene, which the test knows is there.
 * @param scene The scene.
 * @param id The id.
 * @returns The element.
 */
function find(scene: readonly SceneElement[], id: string): SceneElement {
	const element = scene.find((candidate) => candidate.id === id);
	if (element === undefined) {
		throw new Error(`No element ${id} in the scene`);
	}
	return element;
}

export {
	ManualClock,
	ReportingHarness,
	ScriptedServer,
	box,
	copy,
	find,
	initialScene,
	type Corrections,
	type SendReportEffect,
};
