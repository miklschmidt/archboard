import {
	AssistantRuntimeProvider,
	MessageNotSentError,
	ReadonlyThreadProvider,
	useExternalStoreRuntime,
} from "@assistant-ui/react";
import {
	createElement,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type ComponentType,
	type ReactNode,
} from "react";

import type { BrowserSnapshot, BrowserTimeline } from "../../shared/codex-browser-model/index.js";
import type {
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "../workbench-transport/index.js";

export type WorkbenchItemId = BrowserTimeline["turns"][number]["items"][number]["itemId"];

export interface WorkbenchCodexItemMetadata {
	/** Authoritative Codex identity retained outside assistant-ui part reconciliation. */
	readonly itemId: WorkbenchItemId;
	readonly kind: string;
	readonly supported: boolean;
	readonly value: Readonly<Record<string, unknown>>;
}

type WorkbenchMessageStatus =
	| { readonly type: "running" }
	| { readonly type: "complete"; readonly reason: "stop" }
	| {
			readonly type: "incomplete";
			readonly reason: "cancelled" | "error";
			readonly error?: { readonly message: string };
	  };

export interface WorkbenchAssistantMessage {
	/** Stable public ThreadMessageLike identity for one authoritative Codex turn. */
	readonly id: string;
	readonly role: "assistant";
	readonly createdAt: Date;
	/** One fixed summary part; variable timeline items remain in Archboard-owned metadata. */
	readonly content: readonly [{ readonly type: "text"; readonly text: string }];
	readonly status: WorkbenchMessageStatus;
	readonly metadata: {
		readonly unstable_state: null;
		readonly unstable_annotations: readonly [];
		readonly unstable_data: readonly [];
		readonly steps: readonly [];
		readonly custom: {
			readonly archboard: {
				readonly threadId: string;
				readonly turnId: string;
				readonly summary: string;
				readonly outputsIncluded: boolean;
				readonly outputsTruncated: boolean;
				readonly items: readonly WorkbenchCodexItemMetadata[];
			};
		};
	};
}

export type ReadonlyWorkbenchSource =
	| "coordinator"
	| "inspect_only"
	| "prior_epoch"
	| "reconnecting"
	| "stale"
	| "runtime_failure";

type ReadonlyWorkbenchState =
	| ReadonlyWorkbenchSource
	| Exclude<BrowserWorkbenchState["state"], "stale_snapshot" | "thread_capable">
	| "unavailable";

export type WorkbenchRuntimeView =
	| {
			readonly mode: "executable";
			readonly state: "ready";
			readonly reason: null;
			readonly messages: readonly WorkbenchAssistantMessage[];
	  }
	| {
			readonly mode: "readonly";
			readonly state: ReadonlyWorkbenchState;
			readonly reason: string;
			readonly messages: readonly WorkbenchAssistantMessage[];
	  };

function itemRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export function workbenchRuntimeMessageId(threadId: string, turnId: string): string {
	return JSON.stringify(["message", threadId, turnId]);
}

function mapItem(value: unknown): WorkbenchCodexItemMetadata {
	const item = itemRecord(value);
	const media = item?.media;
	if (typeof item?.itemId !== "string")
		throw new Error("A Codex item has no authoritative identity.");
	const itemId = item.itemId as WorkbenchItemId;
	return {
		itemId,
		kind: typeof media === "string" ? media : "unknown",
		supported:
			media === "text" ||
			media === "reasoning" ||
			media === "plan" ||
			media === "tool" ||
			media === "command" ||
			media === "fileChange" ||
			media === "approval",
		value: { ...item, itemId },
	};
}

function codexItemIdentity(
	threadId: string,
	turnId: string,
	item: WorkbenchCodexItemMetadata,
): string {
	return JSON.stringify([threadId, turnId, item.itemId, item.kind]);
}

function mapStatus(status: BrowserTimeline["turns"][number]["status"]): WorkbenchMessageStatus {
	switch (status) {
		case "inProgress":
			return { type: "running" };
		case "completed":
			return { type: "complete", reason: "stop" };
		case "interrupted":
			return { type: "incomplete", reason: "cancelled" };
		case "failed":
			return {
				type: "incomplete",
				reason: "error",
				error: { message: "The Codex turn failed. Inspect the workbench details and retry." },
			};
	}
}

function mapTimeline(timeline: BrowserTimeline): readonly WorkbenchAssistantMessage[] {
	const seenTurns = new Set<string>();
	const seenItems = new Set<string>();
	return timeline.turns.map((turn) => {
		if (seenTurns.has(turn.turnId)) {
			throw new Error(`Duplicate Codex turn identity: ${turn.turnId}`);
		}
		seenTurns.add(turn.turnId);
		const messageId = workbenchRuntimeMessageId(timeline.threadId, turn.turnId);
		const items = turn.items.map((item) => {
			const metadata = mapItem(item);
			const identity = codexItemIdentity(timeline.threadId, turn.turnId, metadata);
			if (seenItems.has(identity)) {
				throw new Error(`Duplicate Codex item identity: ${identity}`);
			}
			seenItems.add(identity);
			return metadata;
		});
		return {
			id: messageId,
			role: "assistant",
			createdAt: new Date(0),
			content: [{ type: "text", text: turn.summary || "Codex turn" }],
			status: mapStatus(turn.status),
			metadata: {
				unstable_state: null,
				unstable_annotations: [],
				unstable_data: [],
				steps: [],
				custom: {
					archboard: {
						threadId: timeline.threadId,
						turnId: turn.turnId,
						summary: turn.summary,
						outputsIncluded: turn.outputsIncluded,
						outputsTruncated: turn.outputsTruncated,
						items,
					},
				},
			},
		};
	});
}

function failureMessage(threadId: string, reason: string): WorkbenchAssistantMessage {
	const turnId = `runtime-failure:${threadId}`;
	return {
		id: workbenchRuntimeMessageId(threadId, turnId),
		role: "assistant",
		createdAt: new Date(0),
		content: [{ type: "text", text: reason }],
		status: { type: "incomplete", reason: "error", error: { message: reason } },
		metadata: {
			unstable_state: null,
			unstable_annotations: [],
			unstable_data: [],
			steps: [],
			custom: {
				archboard: {
					threadId,
					turnId,
					summary: reason,
					outputsIncluded: false,
					outputsTruncated: false,
					items: [],
				},
			},
		},
	};
}

export function createReadonlyWorkbenchView(
	timeline: BrowserTimeline | null,
	source: ReadonlyWorkbenchSource,
	reason: string,
): WorkbenchRuntimeView {
	try {
		return {
			mode: "readonly",
			state: source,
			reason,
			messages: timeline === null ? [] : mapTimeline(timeline),
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "The Codex history could not be mapped.";
		return {
			mode: "readonly",
			state: "runtime_failure",
			reason: message,
			messages: [failureMessage(timeline?.threadId ?? "unavailable", message)],
		};
	}
}

function snapshotView(
	snapshot: BrowserSnapshot,
	mode: "executable" | "readonly",
	state: ReadonlyWorkbenchState = "unavailable",
	reason = "This Codex history is inspect-only.",
): WorkbenchRuntimeView {
	const timeline = snapshot.timeline;
	if (timeline === null) {
		return { mode: "readonly", state, reason, messages: [] };
	}
	try {
		const messages = mapTimeline(timeline);
		if (mode === "executable") return { mode, state: "ready", reason: null, messages };
		return { mode, state, reason, messages };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "The Codex history could not be mapped.";
		return {
			mode: "readonly",
			state: "runtime_failure",
			reason: message,
			messages: [failureMessage(timeline.threadId, message)],
		};
	}
}

export function projectWorkbenchRuntime(state: BrowserWorkbenchState): WorkbenchRuntimeView {
	const snapshot = state.snapshot;
	if (state.state === "stale_snapshot") {
		return snapshot === null
			? { mode: "readonly", state: "stale", reason: state.reason, messages: [] }
			: snapshotView(snapshot, "readonly", "stale", state.reason);
	}
	if (
		state.kind === "connection" &&
		(state.state === "stopped" || state.state === "incompatible_contract")
	) {
		return { mode: "readonly", state: state.state, reason: state.reason, messages: [] };
	}
	if (state.kind === "connection" && state.state === "backoff") {
		return snapshot === null
			? { mode: "readonly", state: "backoff", reason: state.reason, messages: [] }
			: snapshotView(snapshot, "readonly", "backoff", state.reason);
	}
	if (state.connection === "reconnecting") {
		return snapshot === null
			? { mode: "readonly", state: "reconnecting", reason: state.reason, messages: [] }
			: snapshotView(snapshot, "readonly", "reconnecting", state.reason);
	}
	if (snapshot === null) {
		return {
			mode: "readonly",
			state: "unavailable",
			reason: "The Codex workbench is unavailable.",
			messages: [],
		};
	}
	if (snapshot.threadLink.state !== "executable") {
		return snapshotView(
			snapshot,
			"readonly",
			"inspect_only",
			snapshot.threadLink.reason ?? "This Codex history is inspect-only.",
		);
	}
	if (state.state !== "thread_capable") {
		const reason =
			"reason" in snapshot.readiness
				? snapshot.readiness.reason
				: `Codex is ${state.state.replaceAll("_", " ")}; direct workhorse input is unavailable.`;
		return snapshotView(snapshot, "readonly", state.state, reason);
	}
	return snapshotView(snapshot, "executable");
}

export interface ReadonlyWorkbenchThreadProviderProps {
	readonly view: Extract<WorkbenchRuntimeView, { readonly mode: "readonly" }>;
	readonly render?: WorkbenchRuntimeRenderer;
	readonly children?: ReactNode;
}

export interface WorkbenchVisibleStatus {
	readonly role: "status";
	readonly label: "Codex workbench status";
	readonly state: WorkbenchRuntimeView["state"] | "delivered" | "not_delivered" | "outcome_unknown";
	readonly message: string;
	readonly recovery: string | null;
}

type AssistantRuntime = ReturnType<typeof useExternalStoreRuntime>;

export type WorkbenchRuntimeRenderContext =
	| {
			readonly mode: "executable";
			readonly view: Extract<WorkbenchRuntimeView, { readonly mode: "executable" }>;
			readonly assistantRuntime: AssistantRuntime;
			readonly status: WorkbenchVisibleStatus;
	  }
	| {
			readonly mode: "readonly";
			readonly view: Extract<WorkbenchRuntimeView, { readonly mode: "readonly" }>;
			readonly assistantRuntime: null;
			readonly status: WorkbenchVisibleStatus;
	  };

export type WorkbenchRuntimeRenderer = ComponentType<WorkbenchRuntimeRenderContext>;

function readonlyStatus(
	view: Extract<WorkbenchRuntimeView, { readonly mode: "readonly" }>,
): WorkbenchVisibleStatus {
	const recovery = readonlyRecovery(view.state);
	return {
		role: "status",
		label: "Codex workbench status",
		state: view.state,
		message: view.reason,
		recovery,
	};
}

function readonlyRecovery(state: ReadonlyWorkbenchState): string {
	switch (state) {
		case "reconnecting":
			return "Wait for Codex to reconnect. This history remains available for inspection.";
		case "backoff":
			return "Wait until Codex retries, or restart the Codex workbench.";
		case "stopped":
			return "Restart the Codex workbench, then retry.";
		case "incompatible_contract":
			return "Update Archboard or Codex so their workbench protocol versions match.";
		case "stale":
			return "Wait for a fresh Codex snapshot before sending another command.";
		case "runtime_failure":
			return "Inspect the reported item, then reconnect or reload the workbench.";
		case "storage_mismatch":
			return "Correct the Codex storage configuration, then restart the workbench.";
		case "login_capable":
		case "signed_out":
			return "Sign in to Codex before selecting an executable workhorse.";
		case "login_pending":
			return "Complete or cancel the pending Codex sign-in before continuing.";
		case "initialized":
		case "account_ready":
			return "Wait for Codex to finish preparing a thread-capable workhorse.";
		case "coordinator":
		case "inspect_only":
		case "prior_epoch":
			return "Inspect this history or select a current executable workhorse.";
		case "unavailable":
			return "Reconnect the Codex workbench, then select an executable workhorse.";
	}
}

function renderStatus(status: WorkbenchVisibleStatus): ReactNode {
	return createElement(
		"p",
		{ role: status.role, "aria-label": status.label },
		status.message,
		status.recovery === null ? null : createElement("span", null, ` ${status.recovery}`),
	);
}

function renderChildren(
	render: WorkbenchRuntimeRenderer | undefined,
	children: ReactNode,
	context: WorkbenchRuntimeRenderContext,
): ReactNode {
	return render === undefined ? children : createElement(render, context);
}

export function ReadonlyWorkbenchThreadProvider({
	view,
	render,
	children,
}: ReadonlyWorkbenchThreadProviderProps): ReactNode {
	const status = readonlyStatus(view);
	const context: WorkbenchRuntimeRenderContext = {
		mode: "readonly",
		view,
		assistantRuntime: null,
		status,
	};
	return createElement(
		"div",
		{
			"data-workbench-runtime": "readonly",
			"data-workbench-state": view.state,
			"data-workbench-reason": view.reason,
		},
		renderStatus(status),
		createElement(
			ReadonlyThreadProvider,
			{ messages: view.messages },
			renderChildren(render, children, context),
		),
	);
}

interface ExecutableProviderProps {
	readonly view: Extract<WorkbenchRuntimeView, { readonly mode: "executable" }>;
	readonly transport: BrowserWorkbenchTransport;
	readonly onSubmit?: (
		submission: WorkbenchRuntimeSubmission,
	) => Promise<WorkbenchSubmissionResult>;
	readonly render?: WorkbenchRuntimeRenderer;
	readonly children?: ReactNode;
}

function submissionText(message: unknown): string | null {
	const record = itemRecord(message);
	if (record?.role !== "user" || !Array.isArray(record.content)) return null;
	const parts = record.content.map(itemRecord);
	if (parts.some((part) => part?.type !== "text" || typeof part.text !== "string")) {
		return null;
	}
	const text = parts.map((part) => part?.text).join("");
	return text.length === 0 ? null : text;
}

function readyStatus(): WorkbenchVisibleStatus {
	return {
		role: "status",
		label: "Codex workbench status",
		state: "ready",
		message: "The current Codex workhorse is ready.",
		recovery: null,
	};
}

function turnIsAuthoritative(transport: BrowserWorkbenchTransport, turnId: string): boolean {
	return (
		transport.state().snapshot?.timeline?.turns.some((turn) => turn.turnId === turnId) ?? false
	);
}

function ExecutableProvider({
	view,
	transport,
	onSubmit,
	render,
	children,
}: ExecutableProviderProps): ReactNode {
	const boundary = useMemo(() => ({ transport }), [transport]);
	const [publication, setPublication] = useState<{
		readonly boundary: typeof boundary;
		readonly status: WorkbenchVisibleStatus;
	} | null>(null);
	const status = publication?.boundary === boundary ? publication.status : readyStatus();
	const mounted = useRef(true);
	const currentBoundary = useRef(boundary);
	useLayoutEffect(() => {
		currentBoundary.current = boundary;
	}, [boundary]);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const publishStatus = (next: WorkbenchVisibleStatus): void => {
		if (mounted.current) setPublication({ boundary, status: next });
	};
	const runtime = useExternalStoreRuntime({
		messages: view.messages,
		onNew: async (message) => {
			const text = submissionText(message);
			let result: WorkbenchSubmissionResult;
			if (onSubmit === undefined) {
				result = {
					outcome: "not_delivered",
					reason: "The workbench composer has no command owner.",
				};
			} else if (text === null) {
				result = {
					outcome: "not_delivered",
					reason: "The workbench accepts non-empty text submissions only.",
				};
			} else {
				try {
					result = await onSubmit({ text });
				} catch (error) {
					result = {
						outcome: "outcome_unknown",
						reason: error instanceof Error ? error.message : "The command outcome is unknown.",
					};
				}
			}
			if (!mounted.current || currentBoundary.current !== boundary) return;
			if (result.outcome === "not_delivered") {
				publishStatus({
					role: "status",
					label: "Codex workbench status",
					state: "not_delivered",
					message: result.reason,
					recovery: "The draft was restored. Correct the problem and send it again.",
				});
				throw new MessageNotSentError(result.reason);
			}
			if (
				result.outcome === "outcome_unknown" ||
				!turnIsAuthoritative(boundary.transport, result.turnId)
			) {
				publishStatus({
					role: "status",
					label: "Codex workbench status",
					state: "outcome_unknown",
					message:
						result.outcome === "outcome_unknown"
							? result.reason
							: "Codex reported delivery, but the authoritative turn has not appeared.",
					recovery: "Inspect the current workhorse before deciding whether to send again.",
				});
				return;
			}
			publishStatus({
				role: "status",
				label: "Codex workbench status",
				state: "delivered",
				message: "Codex accepted the submission and published its authoritative turn.",
				recovery: null,
			});
		},
	});
	const context: WorkbenchRuntimeRenderContext = {
		mode: "executable",
		view,
		assistantRuntime: runtime,
		status,
	};
	return createElement(
		"div",
		{ "data-workbench-runtime": "executable", "data-workbench-state": view.state },
		renderStatus(status),
		createElement(AssistantRuntimeProvider, { runtime }, renderChildren(render, children, context)),
	);
}

export interface WorkbenchRuntimeProviderProps {
	readonly transport: BrowserWorkbenchTransport;
	readonly onSubmit?: (
		submission: WorkbenchRuntimeSubmission,
	) => Promise<WorkbenchSubmissionResult>;
	readonly render?: WorkbenchRuntimeRenderer;
	readonly children?: ReactNode;
}

export interface WorkbenchRuntimeSubmission {
	readonly text: string;
}

export type WorkbenchSubmissionResult =
	| {
			readonly outcome: "delivered";
			readonly turnId: BrowserTimeline["turns"][number]["turnId"];
	  }
	| { readonly outcome: "not_delivered"; readonly reason: string }
	| { readonly outcome: "outcome_unknown"; readonly reason: string };

export interface WorkbenchRuntimeStore {
	readonly getSnapshot: () => BrowserWorkbenchState;
	readonly subscribe: (listener: () => void) => () => void;
}

export function createWorkbenchRuntimeStore(
	transport: BrowserWorkbenchTransport,
): WorkbenchRuntimeStore {
	return {
		getSnapshot: transport.state,
		subscribe: transport.subscribe,
	};
}

export function WorkbenchRuntimeProvider({
	transport,
	onSubmit,
	render,
	children,
}: WorkbenchRuntimeProviderProps): ReactNode {
	const store = useMemo(() => createWorkbenchRuntimeStore(transport), [transport]);
	const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	const view = projectWorkbenchRuntime(state);
	if (view.mode === "readonly") {
		return createElement(ReadonlyWorkbenchThreadProvider, { view, render }, children);
	}
	return createElement(ExecutableProvider, { view, transport, onSubmit, render }, children);
}
