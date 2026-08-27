#!/usr/bin/env bun

// The change-reporting reducer runs here with no browser. The scene adapter,
// server and clock are all in memory, so each ordering can be stated directly.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reporting = await import(join(repoRoot, "src", "ui", "canvas", "change-reporting.ts"));
const { ownsHoldAttempt } = await import(join(repoRoot, "src", "ui", "canvas", "hold-attempt.ts"));
const { replaceCanvasFiles } = await import(join(repoRoot, "src", "ui", "canvas", "files.ts"));
const {
	hasPendingEdits,
	initialState,
	mergeIncoming,
	mergeIncomingDeletes,
	reduce,
	reportsSettled,
	userHasInteracted,
} = reporting;

let failures = 0;
let checks = 0;
const check = (label, condition, detail = "") => {
	checks += 1;
	if (!condition) failures += 1;
	console.log(`${condition ? "ok  " : "FAIL"} - ${label}${detail ? ` (${detail})` : ""}`);
};

const expectedRuntimeExports = new Set([
	"EMPTY_WITHHELD",
	"carryWithheld",
	"hasPendingEdits",
	"initialState",
	"mergeIncoming",
	"mergeIncomingDeletes",
	"needsFullReport",
	"reduce",
	"reportsSettled",
	"userHasInteracted",
]);
const unexpectedRuntimeExports = Object.keys(reporting).filter(
	(name) => !expectedRuntimeExports.has(name),
);
check(
	"the reporting module has no unused runtime exports",
	unexpectedRuntimeExports.length === 0,
	unexpectedRuntimeExports.join(", "),
);

{
	const files = {
		"same-id": { id: "same-id", dataURL: "data:image/png;base64,b2xk" },
		stale: { id: "stale", dataURL: "data:image/png;base64,c3RhbGU=" },
	};
	let additiveCalls = 0;
	const owner = {
		getFiles: () => files,
		addFiles: (incoming) => {
			additiveCalls += 1;
			for (const file of incoming) {
				// Pinned Excalidraw addFiles deliberately skips an id it already has.
				if (!files[file.id]) files[file.id] = file;
			}
		},
	};
	replaceCanvasFiles(owner, [
		{ id: "same-id", dataURL: "data:image/png;base64,bmV3" },
		{ id: "drawn", dataURL: "data:image/png;base64,ZHJhd24=" },
	]);
	check(
		"a replacement file frame removes stale membership and replaces reused-id bytes before additive addFiles",
		additiveCalls === 1 &&
			JSON.stringify(files) ===
				JSON.stringify({
					"same-id": { id: "same-id", dataURL: "data:image/png;base64,bmV3" },
					drawn: { id: "drawn", dataURL: "data:image/png;base64,ZHJhd24=" },
				}),
		JSON.stringify(files),
	);
}

// A board name can repeat after an away-and-back cycle. Completion ownership
// therefore belongs to the exact attempt and generation, not that name.
{
	let generation = 0;
	const firstPromise = Promise.resolve();
	const first = { board: "a", generation, promise: firstPromise };
	generation += 1;
	generation += 1;
	const secondPromise = Promise.resolve();
	const second = { board: "a", generation, promise: secondPromise };
	const current = second;
	ownsHoldAttempt(current, first, firstPromise, generation);
	check(
		"a late hold from an earlier away-and-back generation cannot clear the newer attempt",
		current === second && ownsHoldAttempt(current, second, secondPromise, generation),
	);
}

const copy = (value) => structuredClone(value);
const box = (id, x = 0, y = 0) => ({
	id,
	type: "rectangle",
	x,
	y,
	width: 120,
	height: 80,
	version: 1,
});
const initialScene = () => [box("a"), box("b", 200)];

class ManualClock {
	now = 0;
	nextId = 1;
	timers = new Map();

	start(kind, delayMs, callback) {
		if (kind !== "finish") this.cancel(kind);
		const id = this.nextId++;
		this.timers.set(id, { id, kind, at: this.now + delayMs, callback });
	}

	cancel(kind) {
		for (const [id, timer] of this.timers) {
			if (timer.kind === kind) this.timers.delete(id);
		}
	}

	advance(ms) {
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

class ScriptedServer {
	document;
	requests = [];

	constructor(scene) {
		this.document = copy(scene);
	}

	receive(effect) {
		this.requests.push(effect);
	}

	accept(corrections = { upserts: [], deletes: [] }) {
		const request = this.requests.shift();
		if (!request) throw new Error("No change report is waiting for a server reply");
		const byId = new Map(this.document.map((element) => [element.id, element]));
		for (const id of request.report.deletes) byId.delete(id);
		for (const element of request.report.upserts) byId.set(element.id, copy(element));
		for (const id of corrections.deletes) byId.delete(id);
		for (const element of corrections.upserts) byId.set(element.id, copy(element));
		this.document = [...byId.values()];
		return { request, corrections };
	}

	refuse() {
		const request = this.requests.shift();
		if (!request) throw new Error("No change report is waiting for a refusal");
		return request;
	}
}

class Harness {
	state = initialState();
	scene;
	clock = new ManualClock();
	server;
	withheldIds = [];
	sceneUpdates = 0;
	holdRequests = 0;
	releaseChecks = 0;
	settledReleaseChecks = 0;

	constructor(scene = initialScene()) {
		this.scene = copy(scene);
		this.server = new ScriptedServer(scene);
		this.dispatch({
			type: "server_update_requested",
			update: { elements: copy(scene), captureUpdate: "never" },
			baselineUpdate: { type: "replace", withheldIds: [] },
		});
		this.clock.advance(0);
		this.dispatch({ type: "user_interacted" });
		this.assertSafe("initial state");
	}

	dispatch(event) {
		const result = reduce(this.state, event);
		this.state = result.state;
		for (const effect of result.effects) this.execute(effect);
	}

	execute(effect) {
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
				if (effect.update.elements) this.scene = copy(effect.update.elements);
				this.dispatch({
					type: "server_update_applied",
					generation: effect.generation,
					scene: copy(this.scene),
					baselineUpdate: effect.baselineUpdate,
					reportAfterUpdate: effect.reportAfterUpdate,
				});
				break;
			case "apply_local_update":
				if (effect.update.elements) this.scene = copy(effect.update.elements);
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
			case "send_beacon":
			case "note_change":
			case "publish_status":
				break;
			case "release_if_idle":
				this.releaseChecks += 1;
				if (reportsSettled(this.state)) this.settledReleaseChecks += 1;
				break;
			case "take_hold":
				this.holdRequests += 1;
				break;
			default:
				throw new Error(`Unhandled effect ${effect.type}`);
		}
	}

	assertSafe(step) {
		const pending = hasPendingEdits(this.state, this.scene, this.withheldIds);
		check(
			`${step}: pending edits have a report in flight or scheduled`,
			!pending || !reportsSettled(this.state),
			`pending=${pending} settled=${reportsSettled(this.state)}`,
		);
	}

	step(label, action) {
		action();
		this.assertSafe(label);
	}

	edit(id, changes) {
		this.scene = this.scene.map((element) =>
			element.id === id ? { ...element, ...changes, version: (element.version ?? 0) + 1 } : element,
		);
		this.dispatch({ type: "scene_changed", scene: copy(this.scene) });
	}

	remove(id) {
		this.scene = this.scene.filter((element) => element.id !== id);
		this.dispatch({ type: "scene_changed", scene: copy(this.scene) });
	}

	due() {
		this.clock.advance(10_000);
	}

	accept(corrections = { upserts: [], deletes: [] }) {
		const { request } = this.server.accept(corrections);
		this.dispatch({
			type: "report_succeeded",
			generation: request.generation,
			corrections,
			currentScene: copy(this.scene),
		});
		this.clock.advance(0);
	}

	refuse() {
		const request = this.server.refuse();
		this.dispatch({ type: "report_refused", generation: request.generation });
	}

	applyServerElements(incoming) {
		const { elements } = mergeIncoming(this.scene, incoming, this.state.baseline);
		this.dispatch({
			type: "server_update_requested",
			update: { elements, captureUpdate: "never" },
			baselineUpdate: { type: "touch", elements: incoming },
		});
	}
}

// A local Mermaid conversion enters through the reducer before its immediate report.
{
	const h = new Harness();
	h.state = { ...h.state, userInteracted: false };
	const converted = box("mermaid", 400);
	h.dispatch({
		type: "local_update_requested",
		update: { elements: [...h.scene, converted], captureUpdate: "immediately" },
	});
	check("a Mermaid local edit marks the pane as interacted", userHasInteracted(h.state));
	check(
		"a Mermaid local edit updates the scene through a reducer effect",
		h.scene.some((element) => element.id === converted.id),
	);
	check("a Mermaid local edit is counted once", h.state.localEditCount === 1);
	h.dispatch({
		type: "immediate_report_requested",
		scene: copy(h.scene),
		withheldIds: h.withheldIds,
	});
	check(
		"a Mermaid local edit enters the immediate change report",
		h.server.requests[0]?.report.upserts.some((element) => element.id === converted.id),
	);
}

// The reducer's settled predicate covers queued and in-flight reports.
{
	const h = new Harness();
	check("reporting starts settled", reportsSettled(h.state));
	h.edit("a", { x: 30 });
	check("a scheduled report is not settled", !reportsSettled(h.state));
	h.due();
	check("an in-flight report is not settled", !reportsSettled(h.state));
	h.accept();
	check("an accepted report with no queued retry is settled", reportsSettled(h.state));
}

// Pending-edit detection stops at a mismatch without changing withheld or deletion rules.
{
	const h = new Harness();
	check("an unchanged scene has no pending edits", !hasPendingEdits(h.state, h.scene));
	const moved = h.scene.map((element) => (element.id === "a" ? { ...element, x: 12 } : element));
	check("a changed element is pending", hasPendingEdits(h.state, moved));
	check("a withheld changed element is not pending yet", !hasPendingEdits(h.state, moved, ["a"]));
	const deleted = h.scene.filter((element) => element.id !== "a");
	check("a missing baseline element is pending as a deletion", hasPendingEdits(h.state, deleted));
}

// The reply to the first report must not replace a later user edit.
{
	const h = new Harness();
	h.step("own reply after a first user edit is pending", () => h.edit("a", { x: 10 }));
	h.step("the first report starts", () => h.due());
	h.step("a later user edit schedules another report", () => h.edit("a", { x: 20 }));
	h.step("the earlier reply does not replace the later user edit", () => h.accept());
	check(
		"the later user edit remains in the scene",
		h.scene.find((element) => element.id === "a").x === 20,
	);
	h.step("the later user edit starts its report", () => h.due());
	h.step("the later user edit is accepted", () => h.accept());
	check(
		"the server holds the later user edit",
		h.server.document.find((element) => element.id === "a").x === 20,
	);
}

// An ordinary acknowledgement advances the baseline without touching the scene.
{
	const h = new Harness();
	const updatesBefore = h.sceneUpdates;
	h.edit("a", { x: 10 });
	h.due();
	h.accept();
	check(
		"an acknowledgement with no correction does not replace the scene",
		h.sceneUpdates === updatesBefore,
		`${updatesBefore} -> ${h.sceneUpdates}`,
	);
	check(
		"  and the accepted scene and server baseline agree exactly",
		!hasPendingEdits(h.state, h.scene) && h.scene.find((element) => element.id === "a").x === 10,
	);
}

// Canonical settlement can correct any element in the request-local document.
{
	const h = new Harness();
	h.edit("a", { x: 10 });
	h.due();
	const correctedA = {
		...h.scene.find((element) => element.id === "a"),
		x: 11,
		rawText: "canonical",
	};
	const correctedB = { ...h.scene.find((element) => element.id === "b"), y: 9 };
	h.accept({ upserts: [correctedA, correctedB], deletes: [] });
	check(
		"canonical corrections include and apply an element outside the submitted delta",
		h.scene.find((element) => element.id === "b").y === 9,
	);
	check(
		"  and the pane converges exactly on the canonical server document",
		JSON.stringify(h.scene) === JSON.stringify(h.server.document),
		JSON.stringify(h.scene),
	);
	check(
		"  with no correction left pending as a new human edit",
		!hasPendingEdits(h.state, h.scene),
	);

	const normalized = new Harness();
	normalized.edit("a", { x: 10 });
	normalized.due();
	normalized.scene = normalized.scene.map((element) =>
		element.id === "b" ? { ...element, boundElements: [] } : element,
	);
	normalized.accept({
		upserts: [
			{
				...normalized.server.document.find((element) => element.id === "b"),
				boundElements: [{ id: "edge", type: "arrow" }],
			},
		],
		deletes: [],
	});
	check(
		"a stale correction caused by post-send normalization stays pending and scheduled",
		hasPendingEdits(normalized.state, normalized.scene) && !reportsSettled(normalized.state),
	);
}

// Per-id freshness, rather than one document-wide edit counter, decides what is visible.
{
	const cases = [
		["move", initialScene(), "a", { x: 10 }, { x: 20 }, { x: 11 }, (element) => element?.x === 20],
		[
			"resize",
			initialScene(),
			"a",
			{ width: 130 },
			{ width: 150 },
			{ width: 140 },
			(element) => element?.width === 150,
		],
		[
			"typing",
			[...initialScene(), { id: "txt", type: "text", text: "A", x: 0, y: 120, version: 1 }],
			"txt",
			{ text: "B" },
			{ text: "C" },
			{ text: "B", rawText: "B" },
			(element) => element?.text === "C",
		],
	];
	for (const [name, scene, id, sentEdit, newerEdit, correction, kept] of cases) {
		const h = new Harness(scene);
		h.edit(id, sentEdit);
		h.due();
		h.edit(id, newerEdit);
		h.accept({
			upserts: [
				Object.assign(
					{},
					h.server.document.find((element) => element.id === id),
					correction,
				),
			],
			deletes: [],
		});
		check(
			`a canonical correction does not disrupt a newer local ${String(name)}`,
			kept(h.scene.find((element) => element.id === id)),
		);
		h.due();
		check(
			`  and the next ${String(name)} delta converges from the canonical baseline`,
			h.server.requests[0]?.report.upserts.some((element) => element.id === id),
		);
		h.accept();
	}

	const h = new Harness();
	h.edit("a", { x: 10 });
	h.due();
	h.remove("a");
	const canonical = { ...h.server.document.find((element) => element.id === "a"), x: 11 };
	h.accept({ upserts: [canonical], deletes: [] });
	check(
		"a canonical correction does not restore an element deleted after send",
		!h.scene.some((element) => element.id === "a"),
	);
	h.due();
	check(
		"  and the newer deletion is the next converging delta",
		h.server.requests[0]?.report.deletes.includes("a"),
	);
	h.accept();
}

// One request may be in flight and only one latest delivery may queue behind it.
{
	const idle = new Harness();
	idle.edit("a", { x: 10 });
	idle.clock.advance(200);
	idle.edit("a", { x: 20 });
	idle.clock.advance(200);
	check(
		"continued editing reaches the server at the non-restarting progress deadline",
		idle.server.requests[0]?.report.upserts.find((element) => element.id === "a")?.x === 20,
	);
	idle.accept();

	idle.clock.advance(100);
	idle.edit("a", { x: 30 });
	idle.clock.advance(400);
	check(
		"a lone final edit remains dirty after the progress deadline",
		idle.server.requests.length === 0 && hasPendingEdits(idle.state, idle.scene),
	);
	idle.clock.advance(399);
	check(
		"the final dirty state waits for the longer idle deadline",
		idle.server.requests.length === 0,
	);
	idle.clock.advance(1);
	check(
		"the 800 ms idle deadline sends the accepted final dirty report",
		idle.server.requests[0]?.report.upserts.find((element) => element.id === "a")?.x === 30,
	);
	idle.accept();
	idle.clock.advance(2000);
	check("an accepted idle report manufactures no no-op tail", idle.server.requests.length === 0);

	const h = new Harness();
	h.edit("a", { x: 10 });
	h.clock.advance(200);
	h.edit("a", { x: 20 });
	h.clock.advance(200);
	check(
		"the fixed progress deadline does not restart on continuous edits",
		h.server.requests.length === 1 &&
			h.server.requests[0].report.upserts.find((element) => element.id === "a")?.x === 20,
	);
	h.clock.advance(100);
	h.edit("a", { x: 30 });
	h.clock.advance(200);
	h.edit("a", { x: 40 });
	h.clock.advance(200);
	check(
		"a due delivery queues behind the one in flight without request fan-out",
		h.server.requests.length === 1 && h.state.deliveryQueued,
	);
	h.accept();
	check(
		"the queued delivery recomputes one latest delta after acknowledgement",
		h.server.requests.length === 1 &&
			h.server.requests[0].report.upserts.find((element) => element.id === "a")?.x === 40,
	);
	h.accept();
	h.clock.advance(2000);
	check("the trailing idle deadline sends no no-op report", h.server.requests.length === 0);
}

// Edits slower than the progress deadline but faster than idle are still one
// continuous dirty gesture. Each elapsed progress deadline must carry forward
// so the next edit cannot start a fresh window and starve persistence forever.
{
	const h = new Harness();
	h.edit("a", { x: 10 });
	h.clock.advance(500);
	check(
		"a first isolated edit still sends nothing when progress elapses",
		h.server.requests.length === 0,
	);

	h.edit("a", { x: 20 });
	h.clock.advance(0);
	check(
		"a second edit after the elapsed progress deadline sends current progress",
		h.server.requests[0]?.report.upserts.find((element) => element.id === "a")?.x === 20,
	);

	h.clock.advance(500);
	h.edit("a", { x: 30 });
	h.clock.advance(500);
	h.edit("a", { x: 40 });
	h.clock.advance(0);
	check(
		"continued 500 ms edits queue one latest delivery behind the in-flight report",
		h.server.requests.length === 1 && h.state.deliveryQueued,
	);
	h.accept();
	check(
		"the queued progress delivery recomputes the latest 500 ms edit",
		h.server.requests.length === 1 &&
			h.server.requests[0].report.upserts.find((element) => element.id === "a")?.x === 40,
	);
	h.accept();

	h.clock.advance(500);
	h.edit("a", { x: 50 });
	h.clock.advance(400);
	check(
		"the final isolated edit remains unsent at its progress deadline",
		h.server.requests.length === 0,
	);
	h.clock.advance(399);
	check(
		"the final 500 ms sequence remains dirty until idle",
		h.server.requests.length === 0 && hasPendingEdits(h.state, h.scene),
	);
	h.clock.advance(1);
	check(
		"the final idle deadline sends exactly one final dirty report",
		h.server.requests.length === 1 &&
			h.server.requests[0].report.upserts.find((element) => element.id === "a")?.x === 50,
	);
	h.accept();
	h.clock.advance(2000);
	check("the accepted 500 ms cadence produces no no-op tail", h.server.requests.length === 0);
}

// A delivery that becomes due during a server scene application must remain
// reachable after the final application completion event.
{
	const h = new Harness();
	h.edit("a", { x: 10 });
	h.applyServerElements([{ ...h.server.document.find((element) => element.id === "b"), y: 30 }]);
	h.clock.cancel("progress");
	h.clock.cancel("idle");
	h.dispatch({
		type: "progress_timer_fired",
		generation: h.state.generation,
		scene: copy(h.scene),
		withheldIds: h.withheldIds,
	});
	h.dispatch({
		type: "idle_timer_fired",
		generation: h.state.generation,
		scene: copy(h.scene),
		withheldIds: h.withheldIds,
	});
	check(
		"a due delivery is queued while a server scene update is applying",
		h.state.applyingServerUpdateCount === 1 &&
			h.state.deliveryQueued &&
			!h.state.progressTimerScheduled &&
			!h.state.idleTimerScheduled &&
			h.server.requests.length === 0,
	);
	h.clock.advance(0);
	check(
		"the final server update completion drains the already-due delivery",
		h.server.requests.length === 1 &&
			h.server.requests[0].report.upserts.some((element) => element.id === "a"),
	);
}

// An empty deadline is still the event that settles reporting, so it must
// trigger the same hold-release check as a successful non-empty report.
{
	const corrected = new Harness();
	corrected.edit("a", { x: 10 });
	corrected.clock.advance(200);
	corrected.edit("a", { x: 20 });
	corrected.clock.advance(200);
	corrected.accept({
		upserts: [{ ...corrected.server.document.find((element) => element.id === "a"), x: 21 }],
		deletes: [],
	});
	const releasesBeforeIdle = corrected.settledReleaseChecks;
	corrected.clock.advance(600);
	check(
		"an empty idle deadline after a canonical correction checks hold release when settled",
		corrected.settledReleaseChecks === releasesBeforeIdle + 1,
	);

	const undone = new Harness();
	undone.edit("a", { x: 10 });
	undone.edit("a", { x: 0 });
	const releasesBeforeUndoDeadline = undone.settledReleaseChecks;
	undone.clock.advance(800);
	check(
		"an edit undone before delivery checks hold release without sending a no-op report",
		undone.server.requests.length === 0 &&
			undone.settledReleaseChecks === releasesBeforeUndoDeadline + 1,
	);
}

// Camera and selection onChange calls carry the same content stamp.
{
	const h = new Harness();
	const holds = h.holdRequests;
	h.dispatch({ type: "scene_changed", scene: copy(h.scene) });
	h.dispatch({ type: "scene_changed", scene: copy(h.scene) });
	check(
		"camera-only changes start neither a hold nor a content report",
		h.holdRequests === holds && reportsSettled(h.state),
	);
}

// Incoming agent news advances the baseline but never overwrites a dirty id.
{
	const h = new Harness();
	h.edit("a", { x: 70 });
	h.applyServerElements([{ ...h.server.document.find((element) => element.id === "a"), x: 25 }]);
	h.clock.advance(0);
	check(
		"an incoming agent update preserves the local dirty move",
		h.scene.find((element) => element.id === "a").x === 70,
	);
	const afterDelete = mergeIncomingDeletes(h.scene, ["a"], h.state.baseline);
	check(
		"an incoming agent deletion preserves the local dirty element",
		afterDelete.some((element) => element.id === "a"),
	);

	const deletedLocally = new Harness();
	deletedLocally.remove("a");
	deletedLocally.applyServerElements([
		{ ...deletedLocally.server.document.find((element) => element.id === "a"), x: 25 },
	]);
	deletedLocally.clock.advance(0);
	check(
		"an incoming agent update does not restore an id deleted locally after the baseline",
		!deletedLocally.scene.some((element) => element.id === "a"),
	);
	deletedLocally.due();
	check(
		"  and the local deletion remains pending against the advanced server baseline",
		deletedLocally.server.requests[0]?.report.deletes.includes("a"),
	);
}

// A server update can be applied while a user report is waiting for its reply.
{
	const h = new Harness();
	h.step("a report is in flight before a server update", () => {
		h.edit("a", { x: 10 });
		h.due();
	});
	h.server.document = h.server.document.map((element) =>
		element.id === "b" ? { ...element, y: 40 } : element,
	);
	h.step("a server update is applied while the report is in flight", () => {
		h.applyServerElements([{ ...h.scene.find((element) => element.id === "b"), y: 40 }]);
		h.clock.advance(0);
	});
	h.step("the reply keeps both accepted changes", () => h.accept());
	check(
		"the scene keeps the user edit and the server update",
		h.scene.find((element) => element.id === "a").x === 10 &&
			h.scene.find((element) => element.id === "b").y === 40,
	);
}

// A user edit can occur before the server update completion timer runs.
{
	const h = new Harness();
	h.step("a user edit during a server update schedules a report when application finishes", () => {
		h.applyServerElements([{ ...h.scene.find((element) => element.id === "b"), y: 30 }]);
		h.scene = h.scene.map((element) =>
			element.id === "a" ? { ...element, x: 15, version: 2 } : element,
		);
		h.dispatch({ type: "scene_changed", scene: copy(h.scene) });
		h.clock.advance(0);
	});
	check("the reducer counted the user edit during the server update", h.state.localEditCount === 1);
	h.step("the user edit during the server update starts a report", () => h.due());
}

// Excalidraw can expose a local edit before its onChange callback reaches the
// reducer, then an incoming server update records that already-edited scene.
// The identical completion stamp must not make the dirty delta unreachable.
{
	const h = new Harness();
	h.scene = h.scene.map((element) =>
		element.id === "a" ? { ...element, x: 19, version: 2 } : element,
	);
	h.applyServerElements([{ ...h.server.document.find((element) => element.id === "b"), y: 31 }]);
	h.dispatch({ type: "scene_changed", scene: copy(h.scene) });
	h.clock.advance(0);
	check(
		"a pre-callback local edit captured in the server-update stamp remains scheduled",
		hasPendingEdits(h.state, h.scene) && !reportsSettled(h.state),
	);
	h.due();
	check(
		"  and reaches the next report without another human edit",
		h.server.requests[0]?.report.upserts.some((element) => element.id === "a" && element.x === 19),
	);
}

// Completion records remain ordered when server updates overlap.
{
	const h = new Harness();
	h.step("two overlapping server updates both finish", () => {
		h.applyServerElements([{ ...h.scene.find((element) => element.id === "a"), x: 5 }]);
		h.applyServerElements([{ ...h.scene.find((element) => element.id === "b"), y: 5 }]);
		check("both server updates are being applied", h.state.applyingServerUpdateCount === 2);
		check("both server update stamps are queued", h.state.serverUpdateStamps.length === 2);
		h.clock.advance(0);
	});
	check("the applying count returns to zero", h.state.applyingServerUpdateCount === 0);
	check("the server update stamp queue is empty", h.state.serverUpdateStamps.length === 0);
}

// A refused delta is followed by a full report using the existing wire flag.
{
	const h = new Harness();
	h.step("a delta report starts before refusal", () => {
		h.edit("a", { x: 25 });
		h.due();
	});
	h.step("a refused write schedules a full report", () => h.refuse());
	h.step("the retry starts immediately", () => h.clock.advance(0));
	const retry = h.server.requests[0];
	check("the retry uses the full-report state", retry?.fullReport === true);
	check(
		"the full report includes every live element",
		retry?.report.upserts.length === h.scene.length,
	);
}

// A timer belongs to the board on which it was scheduled.
{
	const h = new Harness();
	h.step("a report is scheduled before board adoption", () => h.edit("a", { x: 9 }));
	h.step("board adoption cancels the scheduled report", () => {
		h.dispatch({ type: "board_adopted" });
		const next = [box("c", 400)];
		h.scene = copy(next);
		h.server = new ScriptedServer(next);
		h.dispatch({
			type: "server_update_requested",
			update: { elements: next, captureUpdate: "never" },
			baselineUpdate: { type: "replace", withheldIds: [] },
		});
		h.clock.advance(20_000);
	});
	check("the old board produced no report after adoption", h.server.requests.length === 0);
}

// Text ids are renamed before the reducer builds the report.
{
	const longId = "text-element-from-excalidraw";
	const h = new Harness([
		box("a"),
		{ id: longId, type: "text", text: "Name", x: 0, y: 100, version: 1 },
	]);
	h.step("a text edit schedules a report", () => h.edit(longId, { text: "Changed" }));
	h.step("the report waits for the text id rename to be applied", () => h.due());
	const request = h.server.requests[0];
	check(
		"the reducer reports the renamed text id",
		request?.report.upserts.some(
			(element) => element.type === "text" && element.id !== longId && element.id.length <= 8,
		),
	);
}

if (failures > 0) {
	console.error(`\nchange-reporting: ${failures} of ${checks} checks failed`);
	process.exit(1);
}

console.log(`\nchange-reporting: ${checks} checks passed`);
