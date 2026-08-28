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
} from "../../change-reporting.ts";

export function copy<T>(value: T): T {
	return structuredClone(value);
}

export function box(id: string, x = 0, y = 0): SceneElement {
	return { id, type: "rectangle", x, y, width: 120, height: 80, version: 1 };
}

export function initialScene(): SceneElement[] {
	return [box("a"), box("b", 200)];
}

type TimerKind = "progress" | "idle" | "retry" | "finish";

interface Timer {
	id: number;
	kind: TimerKind;
	at: number;
	callback: () => void;
}

export class ManualClock {
	now = 0;
	private nextId = 1;
	private readonly timers = new Map<number, Timer>();

	start(kind: TimerKind, delayMs: number, callback: () => void): void {
		if (kind !== "finish") this.cancel(kind);
		const id = this.nextId++;
		this.timers.set(id, { id, kind, at: this.now + delayMs, callback });
	}

	cancel(kind: TimerKind): void {
		for (const [id, timer] of this.timers) {
			if (timer.kind === kind) this.timers.delete(id);
		}
	}

	advance(ms: number): void {
		const target = this.now + ms;
		for (;;) {
			const due = [...this.timers.values()]
				.filter((timer) => timer.at <= target)
				.toSorted((left, right) => left.at - right.at || left.id - right.id)[0];
			if (!due) break;
			this.timers.delete(due.id);
			this.now = due.at;
			due.callback();
		}
		this.now = target;
	}
}

export type SendReportEffect = Extract<ChangeReportingEffect, { type: "send_report" }>;
export interface Corrections {
	upserts: readonly SceneElement[];
	deletes: readonly string[];
}

export class ScriptedServer {
	document: SceneElement[];
	readonly requests: SendReportEffect[] = [];

	constructor(scene: readonly SceneElement[]) {
		this.document = copy([...scene]);
	}

	receive(effect: SendReportEffect): void {
		this.requests.push(effect);
	}

	accept(corrections: Corrections = { upserts: [], deletes: [] }): SendReportEffect {
		const request = this.requests.shift();
		if (!request) throw new Error("No change report is waiting for a server reply");
		const byId = new Map(this.document.map((element) => [element.id, element]));
		for (const id of request.report.deletes) byId.delete(id);
		for (const element of request.report.upserts as SceneElement[]) {
			byId.set(element.id, copy(element));
		}
		for (const id of corrections.deletes) byId.delete(id);
		for (const element of corrections.upserts) byId.set(element.id, copy(element));
		this.document = [...byId.values()];
		return request;
	}

	refuse(): SendReportEffect {
		const request = this.requests.shift();
		if (!request) throw new Error("No change report is waiting for a refusal");
		return request;
	}
}

export class ReportingHarness {
	state: ChangeReportingState = initialState();
	scene: SceneElement[];
	readonly clock = new ManualClock();
	server: ScriptedServer;
	withheldIds: string[] = [];
	sceneUpdates = 0;
	holdRequests = 0;
	releaseChecks = 0;
	settledReleaseChecks = 0;

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

	dispatch(event: ChangeReportingEvent): void {
		const result = reduce(this.state, event);
		this.state = result.state;
		for (const effect of result.effects) this.execute(effect);
	}

	private execute(effect: ChangeReportingEffect): void {
		switch (effect.type) {
			case "cancel_progress_timer":
				this.clock.cancel("progress");
				break;
			case "start_progress_timer":
				this.clock.start("progress", effect.delayMs, () =>
					this.dispatch({
						type: "progress_timer_fired",
						generation: effect.generation,
						scene: copy(this.scene),
						withheldIds: this.withheldIds,
					}),
				);
				break;
			case "cancel_idle_timer":
				this.clock.cancel("idle");
				break;
			case "start_idle_timer":
				this.clock.start("idle", effect.delayMs, () =>
					this.dispatch({
						type: "idle_timer_fired",
						generation: effect.generation,
						scene: copy(this.scene),
						withheldIds: this.withheldIds,
					}),
				);
				break;
			case "cancel_retry_timer":
				this.clock.cancel("retry");
				break;
			case "start_retry_timer":
				this.clock.start("retry", effect.delayMs, () =>
					this.dispatch({
						type: "retry_timer_fired",
						generation: effect.generation,
						scene: copy(this.scene),
						withheldIds: this.withheldIds,
					}),
				);
				break;
			case "apply_server_update":
				this.sceneUpdates += 1;
				if (effect.update.elements) this.scene = copy([...effect.update.elements]);
				this.dispatch({
					type: "server_update_applied",
					generation: effect.generation,
					scene: copy(this.scene),
					baselineUpdate: effect.baselineUpdate,
					...(effect.reportAfterUpdate ? { reportAfterUpdate: effect.reportAfterUpdate } : {}),
				});
				break;
			case "apply_local_update":
				if (effect.update.elements) this.scene = copy([...effect.update.elements]);
				this.dispatch({
					type: "local_update_applied",
					generation: effect.generation,
					scene: copy(this.scene),
				});
				break;
			case "finish_server_update":
				this.clock.start("finish", 0, () =>
					this.dispatch({
						type: "server_update_finished",
						generation: effect.generation,
						scene: copy(this.scene),
						withheldIds: this.withheldIds,
					}),
				);
				break;
			case "send_report":
				this.server.receive(effect);
				break;
			case "release_if_idle":
				this.releaseChecks += 1;
				if (reportsSettled(this.state)) this.settledReleaseChecks += 1;
				break;
			case "take_hold":
				this.holdRequests += 1;
				break;
			case "send_beacon":
			case "note_change":
			case "publish_status":
				break;
		}
	}

	edit(id: string, changes: Record<string, unknown>): void {
		this.scene = this.scene.map((element) =>
			element.id === id
				? { ...element, ...changes, version: Number(element.version ?? 0) + 1 }
				: element,
		);
		this.dispatch({ type: "scene_changed", scene: copy(this.scene) });
	}

	remove(id: string): void {
		this.scene = this.scene.filter((element) => element.id !== id);
		this.dispatch({ type: "scene_changed", scene: copy(this.scene) });
	}

	due(): void {
		this.clock.advance(10_000);
	}

	accept(corrections: Corrections = { upserts: [], deletes: [] }): void {
		const request = this.server.accept(corrections);
		this.dispatch({
			type: "report_succeeded",
			generation: request.generation,
			corrections,
			currentScene: copy(this.scene),
		});
		this.clock.advance(0);
	}

	refuse(): void {
		const request = this.server.refuse();
		this.dispatch({ type: "report_refused", generation: request.generation });
	}

	applyServerElements(incoming: readonly SceneElement[]): void {
		const { elements } = mergeIncoming(this.scene, incoming, this.state.baseline);
		this.dispatch({
			type: "server_update_requested",
			update: { elements, captureUpdate: "never" },
			baselineUpdate: { type: "touch", elements: incoming },
		});
	}

	pendingIsReachable(): boolean {
		return (
			!hasPendingEdits(this.state, this.scene, this.withheldIds) || !reportsSettled(this.state)
		);
	}
}
