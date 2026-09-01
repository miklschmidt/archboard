import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
	BrowserSnapshot,
	BrowserTimeline,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../../workbench-transport/index.js";
import {
	WorkbenchRuntimeProvider,
	type WorkbenchRuntimeRenderContext,
	type WorkbenchSubmissionResult,
} from "../index.js";
import { installMinimalDom, type TestElement } from "./minimal-dom.js";
import {
	ProviderContextObserver,
	type ProviderContextObservation,
} from "./provider-context-observer.js";

export const threadId = "mounted-thread" as BrowserTimeline["threadId"];
export const turnId = "mounted-turn" as BrowserTimeline["turns"][number]["turnId"];
export type TimelineItem = BrowserTimeline["turns"][number]["items"][number];
type ExecutableLink = Extract<BrowserSnapshot["threadLink"], { readonly state: "executable" }>;

export function timeline(items: readonly TimelineItem[] = []): BrowserTimeline {
	return {
		kind: "timeline",
		threadId,
		turns: [
			{
				turnId,
				status: "completed",
				items: [...items],
				summary: "Mounted authoritative turn",
				outputsIncluded: true,
				outputsTruncated: false,
			},
		],
		nextCursor: null,
	};
}

export function snapshot(timelineValue: BrowserTimeline = timeline()): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: "mounted-child" as ExecutableLink["childId"],
			epoch: "mounted-epoch" as ExecutableLink["epoch"],
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
			threadId: "mounted-coordinator" as BrowserSnapshot["coordinator"]["threadId"],
			activeTurnId: null,
			model: null,
			effort: null,
			serviceTier: null,
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

export function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 1,
	};
}

export class MutableTransport {
	current: BrowserWorkbenchState;
	readonly listeners = new Set<() => void>();
	subscriptions = 0;
	teardowns = 0;

	constructor(state = connected()) {
		this.current = state;
	}

	readonly state = (): BrowserWorkbenchState => this.current;
	readonly subscribe = (listener: () => void): (() => void) => {
		this.subscriptions += 1;
		this.listeners.add(listener);
		return () => {
			this.teardowns += 1;
			this.listeners.delete(listener);
		};
	};

	publish(state: BrowserWorkbenchState): void {
		this.current = state;
		for (const listener of this.listeners) listener();
	}

	asTransport(): BrowserWorkbenchTransport {
		return this as unknown as BrowserWorkbenchTransport;
	}
}

export interface MountedProvider {
	readonly container: TestElement;
	readonly root: Root;
	readonly contexts: WorkbenchRuntimeRenderContext[];
	readonly observations: ProviderContextObservation[];
	readonly render: (
		transport: MutableTransport,
		onSubmit?: (text: string) => Promise<WorkbenchSubmissionResult>,
	) => Promise<void>;
	readonly close: () => Promise<void>;
}

export async function mountProvider(): Promise<MountedProvider> {
	const dom = installMinimalDom();
	const root = createRoot(dom.container as unknown as Element);
	const contexts: WorkbenchRuntimeRenderContext[] = [];
	const observations: ProviderContextObservation[] = [];
	function RuntimeObserver(context: WorkbenchRuntimeRenderContext) {
		contexts.push(context);
		if (context.mode === "executable") {
			return createElement(ProviderContextObserver, {
				onObserve: (observation: ProviderContextObservation) => observations.push(observation),
				status: context.status.state,
			});
		}
		return createElement("span", { "data-observer": context.mode }, context.status.state);
	}
	const render = async (
		transport: MutableTransport,
		onSubmit?: (text: string) => Promise<WorkbenchSubmissionResult>,
	): Promise<void> => {
		await act(async () => {
			root.render(
				createElement(WorkbenchRuntimeProvider, {
					transport: transport.asTransport(),
					onSubmit: onSubmit === undefined ? undefined : async ({ text }) => await onSubmit(text),
					render: RuntimeObserver,
				}),
			);
		});
	};
	return {
		container: dom.container,
		root,
		contexts,
		observations,
		render,
		close: async () => {
			await act(async () => root.unmount());
			dom.restore();
		},
	};
}

export function latestExecutable(contexts: readonly WorkbenchRuntimeRenderContext[]) {
	const context = contexts.findLast((candidate) => candidate.mode === "executable");
	if (context?.mode !== "executable") throw new Error("Expected executable runtime context");
	return context;
}
