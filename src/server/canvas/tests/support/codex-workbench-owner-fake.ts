import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessSnapshot,
} from "../../../../runtime/codex-process/index.js";
import { CODEX_SESSION_CONTROL } from "../../../../runtime/codex-session/index.js";
import type { CodexWorkbenchGateway } from "../../../codex-workbench/index.js";
import type { CodexWorkbenchGenerationHooks } from "../../codex-workbench-generation.js";
import type {
	CodexWorkbenchGeneration,
	CodexWorkbenchGenerationSlots,
} from "../../codex-workbench-owner.js";

export function fakeProcess(events: string[]): CodexProcess {
	const child = { pid: 14314 } as CodexProcessChild;
	const listeners = new Set<(child: CodexProcessChild) => void>();
	let running = false;
	const snapshot = (): CodexProcessSnapshot =>
		({
			state: running ? "running" : "stopped",
			pid: running ? child.pid : null,
			executablePath: "/repo/node_modules/@openai/codex/bin/codex.js",
			argv: [],
			cwd: "/repo",
			ready: running,
			accountReady: false,
			restartAttempt: 0,
			nextRestartAtMs: null,
			restartDelayMs: null,
			stderr: { text: "", totalBytes: 0, retainedBytes: 0, truncated: false },
			lastExit: null,
			failure: null,
		}) as unknown as CodexProcessSnapshot;
	return {
		start: async () => {
			events.push("process:start");
			running = true;
			for (const listener of listeners) listener(child);
			return snapshot();
		},
		stop: async () => {
			events.push("process:stop");
			running = false;
			return snapshot();
		},
		snapshot,
		currentChild: () => (running ? child : null),
		onChild: (listener) => {
			listeners.add(listener);
			if (running) listener(child);
			return () => listeners.delete(listener);
		},
		subscribe: () => () => undefined,
	};
}

export function fakeGeneration(events: string[], number: number): CodexWorkbenchGeneration {
	const hooks = {
		threadContext: { contextForEvent: () => ({}) },
		installIdentityDecoders: () => undefined,
		installLifecycleSignals: () => () => void events.push(`generation:${number}:finish-stop`),
		installApprovalProjection: () => () => undefined,
		installBrowserGateway: () => () => undefined,
		initializeSession: async () => undefined,
		stopBrowser: async () => void events.push(`generation:${number}:stop:shutdown`),
		stopRealtime: async () => undefined,
		stopQueue: () => undefined,
		cancelDynamicApprovalsAndWaits: async () => undefined,
		settleOrdinaryRequests: async () => undefined,
	} as unknown as CodexWorkbenchGenerationHooks;
	const disposable = { dispose: () => undefined };
	const transport = {
		onServerRequest: () => () => undefined,
		onServerNotification: () => () => undefined,
		onExit: () => () => undefined,
		shutdown: async () => undefined,
	};
	const session = {
		respondCurrentTime: async () => undefined,
		respondUnsupportedTokenRefresh: async () => undefined,
		respondUnsupportedAttestation: async () => undefined,
		[CODEX_SESSION_CONTROL]: { onNotification: () => undefined, dispose: () => undefined },
	};
	const approvals = { ...disposable, receive: () => undefined };
	const dynamicTools = { ...disposable, dispatch: async () => undefined };
	const coordinatorTools = {
		...disposable,
		onServerRequest: () => undefined,
		onChildExit: () => undefined,
	};
	const gateway = { marker: number, dispose: async () => undefined };
	const components = {
		identity: {},
		epoch: { close: () => undefined },
		transport,
		session,
		threadLink: {},
		workhorse: {},
		semanticPublisher: disposable,
		realtime: { ...disposable, onNotification: () => undefined },
		approvals,
		dynamicTools,
		semanticDelivery: {
			...disposable,
			replaceHooks: () => void events.push(`generation:${number}:replace-hooks`),
		},
		coordinator: { onNotification: () => undefined },
		queue: {},
		operations: { onNotification: () => undefined },
		spokenApproval: { ...disposable, onNotification: () => undefined },
		coordinatorTools,
		callbacks: disposable,
		gateway,
	} as unknown as CodexWorkbenchGeneration["state"]["components"];
	let state!: CodexWorkbenchGeneration["state"];
	const slots: CodexWorkbenchGenerationSlots = {
		hooks,
		onChildExitStart: null,
		onChildExitFinished: null,
		route: () => undefined,
		onNotification: () => undefined,
		onExit: () => undefined,
		replaceHooks: async () => void events.push(`generation:${number}:replace-hooks`),
		stop: async (reason) => void events.push(`generation:${number}:stop:${reason}`),
		finishStop: () => void events.push(`generation:${number}:finish-stop`),
	};
	state = {
		components,
		owners: { approvals, dynamicTools, coordinatorTools, session } as never,
		current: slots,
		registrations: {
			transportRequest: null,
			transportNotification: null,
			transportExit: null,
			lifecycleSignals: null,
			browserGateway: null,
			approvalProjection: null,
		},
		pendingChildSettlements: new Set(),
		stopped: false,
		stopPromise: null,
		stopComplete: false,
		stopFinished: false,
	};
	return {
		state,
		transport: transport as never,
		gateway: gateway as unknown as CodexWorkbenchGateway,
		router: { route: slots.route },
		onNotification: slots.onNotification,
		onExit: slots.onExit,
		replaceHooks: slots.replaceHooks,
		stop: slots.stop,
		finishStop: slots.finishStop,
	};
}
