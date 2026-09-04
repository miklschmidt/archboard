import type {
	CodexProcess,
	CodexProcessChild,
	CodexProcessFailureCode,
	CodexProcessSnapshot,
} from "../../../../runtime/codex-process/index.js";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "../../../../shared/codex-workbench-identity/index.js";
import type { CodexWorkbenchGateway } from "../../../codex-workbench/index.js";
import type {
	CodexWorkbenchGeneration,
	CodexWorkbenchGenerationInput,
	CodexWorkbenchKernelAcquisition,
	CodexWorkbenchOwner,
	CodexWorkbenchOwnerOptions,
	CodexWorkbenchStopReason,
} from "../../codex-workbench-owner.js";
import { installCodexWorkbenchOwner } from "../../codex-workbench-owner.js";

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

export interface FakeRestartingProcess {
	readonly process: CodexProcess;
	readonly crash: () => void;
	readonly restart: () => void;
	readonly terminal: (code: CodexProcessFailureCode, message: string) => void;
}

export function fakeRestartingProcess(events: string[]): FakeRestartingProcess {
	const listeners = new Set<(child: CodexProcessChild) => void>();
	const snapshotListeners = new Set<(snapshot: CodexProcessSnapshot) => void>();
	let nextPid = 14314;
	let child: CodexProcessChild | null = null;
	let started = false;
	let terminalFailure: CodexProcessSnapshot["failure"] = null;
	const emitChild = (): void => {
		child = { pid: nextPid++ } as CodexProcessChild;
		for (const listener of listeners) listener(child);
	};
	const snapshot = (): CodexProcessSnapshot =>
		({
			state:
				terminalFailure !== null
					? "terminal_failure"
					: child === null
						? started
							? "backoff"
							: "stopped"
						: "running",
			pid: child?.pid ?? null,
			ready: child !== null,
			failure: terminalFailure,
		}) as CodexProcessSnapshot;
	const publish = (): void => {
		const value = snapshot();
		for (const listener of snapshotListeners) listener(value);
	};
	return {
		process: {
			start: async () => {
				events.push("process:start");
				if (!started) {
					started = true;
					emitChild();
				}
				return snapshot();
			},
			stop: async () => {
				events.push("process:stop");
				child = null;
				terminalFailure = null;
				started = false;
				publish();
				return snapshot();
			},
			snapshot,
			currentChild: () => child,
			onChild: (listener) => {
				listeners.add(listener);
				if (child !== null) listener(child);
				return () => listeners.delete(listener);
			},
			subscribe: (listener) => {
				snapshotListeners.add(listener);
				return () => snapshotListeners.delete(listener);
			},
		},
		crash: () => {
			events.push("process:crash");
			child = null;
			publish();
		},
		restart: () => {
			events.push("process:restart");
			emitChild();
			publish();
		},
		terminal: (code, message) => {
			events.push(`process:terminal:${code}`);
			child = null;
			terminalFailure = { code, message, terminal: true };
			publish();
		},
	};
}

export interface FakeGenerationControl {
	readonly activate?: () => Promise<void>;
	readonly deactivate?: () => void;
	readonly retireChild?: () => Promise<void>;
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
	let transportState: "open" | "closed" = "open";
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
		inspect: () => ({ state: transportState }) as never,
		inspectLateResponses: () => [],
		inspectIssues: () => [],
		inspectStderr: () => ({}) as never,
		shutdown: async () => void (transportState = "closed"),
	};
	const gateway = { marker: number, dispose: async () => undefined };
	const components = {
		identity,
		transport,
		gateway,
	} as unknown as CodexWorkbenchGeneration["components"];
	let stopped = false;
	let finished = false;
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
		retireChild: async () => control.retireChild?.(),
		stop: async (reason) => {
			if (stopped) return;
			stopped = true;
			await control.stop?.(reason);
			events.push(`generation:${number}:stop:${reason}`);
		},
		finishStop: () => {
			if (finished) return;
			finished = true;
			control.finishStop?.();
			events.push(`generation:${number}:finish-stop`);
		},
	};
}

export interface FakeKernel {
	readonly acquisition: CodexWorkbenchKernelAcquisition;
	/** Deliver one transport exit for this acquired child, as the real bridge sees it. */
	readonly exit: () => void;
}

export function fakeKernelAcquisition(): FakeKernel {
	const source = fakeGeneration([], 0);
	const ledger = source.identityLedger;
	const transport = source.transport as unknown as {
		onExit: (listener: (event: unknown) => void) => () => void;
	};
	const listeners = new Set<(event: unknown) => void>();
	transport.onExit = (listener) => {
		listeners.add(listener);
		return () => void listeners.delete(listener);
	};
	return Object.freeze({
		acquisition: {
			kernel: { identityLedger: ledger, transport: source.transport },
			identity: source.components.identity,
		},
		exit: () => {
			const event = Object.freeze({
				child: ledger.childId,
				epoch: ledger.epoch,
				code: 1,
				signal: null,
			});
			for (const listener of listeners) listener(event);
		},
	});
}

export function adoptFakeKernel(
	input: CodexWorkbenchGenerationInput,
	candidate: CodexWorkbenchGeneration,
): CodexWorkbenchGeneration {
	if (input.kernel === null || input.initialIdentity === null)
		throw new Error("The fake initial generation has no acquired kernel.");
	Object.assign(candidate, {
		identityLedger: input.kernel.identityLedger,
		transport: input.kernel.transport,
	});
	Object.assign(candidate.components, {
		identity: input.initialIdentity,
		transport: input.kernel.transport,
	});
	return candidate;
}

export interface FakeOwnerHandle {
	readonly owner: CodexWorkbenchOwner;
	/** Emit a child exit through the transport bridge of the current kernel. */
	readonly exitChild: () => void;
}

export function installFakeCodexWorkbenchOwner(
	options: Omit<CodexWorkbenchOwnerOptions, "createKernel">,
): FakeOwnerHandle {
	let current: FakeKernel | null = null;
	const owner = installCodexWorkbenchOwner({
		...options,
		createKernel: () => {
			current = fakeKernelAcquisition();
			return current.acquisition;
		},
		createGeneration: async (input) =>
			adoptFakeKernel(input, await options.createGeneration(input)),
	});
	return Object.freeze({
		owner,
		exitChild: () => {
			if (current === null) throw new Error("The fake owner has no acquired child kernel.");
			current.exit();
		},
	});
}
