import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessSnapshot,
} from "../../../../runtime/codex-process/index.js";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "../../../../shared/codex-workbench-identity/index.js";
import type { CodexWorkbenchGateway } from "../../../codex-workbench/index.js";
import type {
	CodexWorkbenchGeneration,
	CodexWorkbenchStopReason,
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

export interface FakeGenerationControl {
	readonly activate?: () => Promise<void>;
	readonly deactivate?: () => void;
	readonly stop?: (reason: CodexWorkbenchStopReason) => Promise<void>;
	readonly finishStop?: () => void;
}

export function fakeGeneration(
	events: string[],
	number: number,
	control: FakeGenerationControl = {},
): CodexWorkbenchGeneration {
	const identityLedger = createIdentityLedger();
	const identity = createIdentityAuthorities(identityLedger);
	const transport = {
		replaceIdentity: () => undefined,
		request: async () => ({}) as never,
		sendNotification: async () => undefined,
		registerDynamicDispatcher: () => undefined,
		ownsPendingReverseRequest: () => false,
		respond: async () => undefined,
		onServerRequest: () => () => undefined,
		onServerNotification: () => () => undefined,
		onIssue: () => () => undefined,
		onStderr: () => () => undefined,
		onExit: () => () => undefined,
		inspect: () => ({}) as never,
		inspectLateResponses: () => [],
		inspectIssues: () => [],
		inspectStderr: () => ({}) as never,
		shutdown: async () => undefined,
	};
	const gateway = { marker: number, dispose: async () => undefined };
	const components = {
		identity,
		transport,
		gateway,
	} as unknown as CodexWorkbenchGeneration["components"];
	let stopped = false;
	return {
		components,
		identityLedger,
		transport,
		gateway: gateway as unknown as CodexWorkbenchGateway,
		activate: async () => {
			await control.activate?.();
			events.push(`generation:${number}:activate`);
		},
		deactivate: () => {
			control.deactivate?.();
			events.push(`generation:${number}:deactivate`);
		},
		stop: async (reason) => {
			if (stopped) return;
			stopped = true;
			await control.stop?.(reason);
			events.push(`generation:${number}:stop:${reason}`);
		},
		finishStop: () => {
			control.finishStop?.();
			events.push(`generation:${number}:finish-stop`);
		},
	};
}
