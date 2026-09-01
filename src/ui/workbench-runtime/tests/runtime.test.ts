import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
	BrowserSnapshot,
	BrowserTimeline,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import {
	ReadonlyWorkbenchThreadProvider,
	WorkbenchRuntimeProvider,
	createReadonlyWorkbenchView,
	createWorkbenchRuntimeStore,
	projectWorkbenchRuntime,
} from "../index.js";

const threadId = "thread-a" as BrowserTimeline["threadId"];
const turnId = "turn-a" as BrowserTimeline["turns"][number]["turnId"];
const itemId = "item-a" as BrowserTimeline["turns"][number]["items"][number]["itemId"];
type ExecutableLink = Extract<BrowserSnapshot["threadLink"], { readonly state: "executable" }>;
const childId = "child-a" as ExecutableLink["childId"];
const epoch = "epoch-a" as ExecutableLink["epoch"];

function timeline(overrides: Partial<BrowserTimeline["turns"][number]> = {}): BrowserTimeline {
	return {
		kind: "timeline",
		threadId,
		turns: [
			{
				turnId,
				status: "completed",
				items: [{ media: "text", itemId, text: "Authoritative response" }],
				summary: "Completed",
				outputsIncluded: true,
				outputsTruncated: false,
				...overrides,
			},
		],
		nextCursor: null,
	};
}

function snapshot(timelineValue: BrowserTimeline | null = timeline()): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId,
			epoch,
			threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		timeline: timelineValue,
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: "coordinator-a" as BrowserSnapshot["coordinator"]["threadId"],
			activeTurnId: null,
			model: "gpt-daybreak-blue-latest",
			effort: "low",
			serviceTier: "priority",
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "unavailable",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: "Voice is unavailable.",
		},
		lease: null,
		operation: null,
	};
}

function connected(snapshotValue = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: snapshotValue,
		sequence: 1,
	};
}

function fakeTransport(
	state: BrowserWorkbenchState,
	subscribe: (listener: () => void) => () => void = () => () => {},
): BrowserWorkbenchTransport {
	return { state: () => state, subscribe } as unknown as BrowserWorkbenchTransport;
}

describe("workbench runtime projection", () => {
	test("creates one non-optimistic assistant record from each authoritative turn identity", () => {
		const view = projectWorkbenchRuntime(connected());
		expect(view.mode).toBe("executable");
		expect(view.messages).toHaveLength(1);
		expect(view.messages[0]?.id).toBe("turn-a");
		expect(view.messages[0]?.metadata.custom.archboard.turnId).toBe("turn-a");
		expect("isOptimistic" in (view.messages[0]?.metadata ?? {})).toBe(false);
		expect(view.messages[0]?.content).toEqual([
			{ type: "text", itemId, text: "Authoritative response" },
		]);
	});

	test("maps an unsupported item to an explicit recoverable record", () => {
		const unsupported = {
			media: "futureCodexItem",
			itemId: "item-future",
			payload: "opaque",
		};
		const hostileTimeline = timeline({
			items: [unsupported] as unknown as BrowserTimeline["turns"][number]["items"],
		});
		const view = projectWorkbenchRuntime(connected(snapshot(hostileTimeline)));
		expect(view.messages[0]?.content).toEqual([
			{
				type: "data",
				itemId: "item-future" as typeof itemId,
				name: "archboard-unsupported-item",
				data: {
					itemId: "item-future",
					media: "futureCodexItem",
					recoverable: true,
					message: "This Codex item is not supported by the current workbench.",
				},
			},
		]);
	});

	test("turn identity conflicts become a visible read-only runtime failure", () => {
		const duplicate = timeline();
		const invalid = {
			...duplicate,
			turns: [duplicate.turns[0]!, duplicate.turns[0]!],
		};
		const view = projectWorkbenchRuntime(connected(snapshot(invalid)));
		expect(view.mode).toBe("readonly");
		expect(view.state).toBe("runtime_failure");
		expect(view.reason).toContain("Duplicate Codex turn identity");
		expect(view.messages[0]?.content[0]).toMatchObject({
			type: "data",
			name: "archboard-runtime-failure",
			data: { recoverable: true },
		});
	});

	test("stale and reconnecting snapshots retain history without executable controls", () => {
		const stale = projectWorkbenchRuntime({
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: snapshot(),
			sequence: 3,
			expectedSequence: 4,
			receivedSequence: 5,
			reason: "A timeline delta was missed.",
		});
		expect(stale).toMatchObject({ mode: "readonly", state: "stale" });
		expect(stale.messages[0]?.id).toBe("turn-a");

		const reconnecting = projectWorkbenchRuntime({
			kind: "connection",
			state: "reconnecting",
			connection: "reconnecting",
			snapshot: snapshot(),
			sequence: 3,
			reason: "The app-server connection is recovering.",
		});
		expect(reconnecting).toMatchObject({ mode: "readonly", state: "reconnecting" });
		expect(projectWorkbenchRuntime(connected()).mode).toBe("executable");
	});

	test("a linked workhorse remains read-only until Codex is thread-capable", () => {
		const view = projectWorkbenchRuntime({
			kind: "readiness",
			state: "account_ready",
			connection: "connected",
			snapshot: snapshot(),
			sequence: 1,
		});
		expect(view).toMatchObject({
			mode: "readonly",
			state: "unavailable",
			reason: "Codex is account ready; direct workhorse input is unavailable.",
		});
	});

	test("inspect-only and coordinator histories use the read-only provider contract", () => {
		const inspectSnapshot = snapshot();
		const inspectView = projectWorkbenchRuntime(
			connected({
				...inspectSnapshot,
				threadLink: {
					kind: "thread_link",
					state: "inspect_only",
					childId: null,
					epoch: null,
					threadId,
					source: "unknown",
					status: "idle",
					loaded: true,
					canAcceptDirectInput: false,
					reason: "The history belongs to a prior process.",
				},
			}),
		);
		expect(inspectView).toMatchObject({ mode: "readonly", state: "inspect_only" });

		const coordinator = createReadonlyWorkbenchView(
			timeline(),
			"coordinator",
			"Coordinator history is inspect-only.",
		);
		if (coordinator.mode !== "readonly") throw new Error("Expected a read-only coordinator");
		const markup = renderToStaticMarkup(
			createElement(
				ReadonlyWorkbenchThreadProvider,
				{ view: coordinator },
				createElement("span", null, "History"),
			),
		);
		expect(markup).toContain('data-workbench-runtime="readonly"');
		expect(markup).toContain('data-workbench-state="coordinator"');

		const priorEpoch = createReadonlyWorkbenchView(
			timeline(),
			"prior_epoch",
			"This history belongs to an earlier Codex process.",
		);
		expect(priorEpoch).toMatchObject({ mode: "readonly", state: "prior_epoch" });
	});
});

describe("workbench runtime provider ownership", () => {
	test("delegates subscription teardown to the authoritative transport", () => {
		let subscriptions = 0;
		let teardowns = 0;
		const store = createWorkbenchRuntimeStore(
			fakeTransport(connected(), () => {
				subscriptions += 1;
				return () => {
					teardowns += 1;
				};
			}),
		);
		const teardown = store.subscribe(() => {});
		expect(subscriptions).toBe(1);
		teardown();
		expect(teardowns).toBe(1);
	});

	test("renders executable and reconnecting provider states through the public component", () => {
		const executable = renderToStaticMarkup(
			createElement(
				WorkbenchRuntimeProvider,
				{ transport: fakeTransport(connected()) },
				createElement("span", null, "Timeline"),
			),
		);
		expect(executable).toContain('data-workbench-runtime="executable"');
		expect(executable).toContain('data-workbench-state="ready"');

		const reconnecting = renderToStaticMarkup(
			createElement(
				WorkbenchRuntimeProvider,
				{
					transport: fakeTransport({
						kind: "connection",
						state: "reconnecting",
						connection: "reconnecting",
						snapshot: snapshot(),
						sequence: 2,
						reason: "Reconnecting to Codex.",
					}),
				},
				createElement("span", null, "Timeline"),
			),
		);
		expect(reconnecting).toContain('data-workbench-runtime="readonly"');
		expect(reconnecting).toContain('data-workbench-state="reconnecting"');
	});
});
