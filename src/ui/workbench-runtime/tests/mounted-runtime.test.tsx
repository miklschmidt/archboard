import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { BrowserWorkbenchTransportError } from "@/ui/workbench-transport";
import {
	WorkbenchRuntimeProvider,
	workbenchRuntimeMessageId,
	type WorkbenchRuntimeHost,
	type WorkbenchRuntimeRenderContext,
} from "@/ui/workbench-runtime";
import {
	connected,
	delivered,
	ids,
	mutableTransport,
	snapshot,
	timeline,
	type MutableTransport,
} from "@/ui/workbench-runtime/tests/fixtures";

/** Nothing to do: the host owns no doors in this owner. */
function noop(): void {
	// Deliberately empty.
}

const HOST: WorkbenchRuntimeHost = {
	openAgentSettings: noop,
	chooseThread: noop,
	voice: { start: noop, mute: noop, unmute: noop, stop: noop, restart: noop },
	copyText: noop,
};

/** A promise released from outside. */
interface Latch {
	readonly promise: Promise<void>;
	readonly release: () => void;
}

/** The resolver a latch holds before its promise has captured the real one. */
function releaseNothing(): void {
	// Replaced synchronously by the promise executor.
}

/**
 * A promise and the function that resolves it.
 * @returns The latch.
 */
function latch(): Latch {
	let release: () => void = releaseNothing;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

/** A mounted provider and the contexts its renderer received. */
interface Mounted {
	readonly root: Root;
	readonly contexts: WorkbenchRuntimeRenderContext[];
	readonly render: (transport: MutableTransport) => Promise<void>;
	readonly close: () => Promise<void>;
}

/**
 * The renderer that records what it received.
 * @param contexts Where to record.
 * @returns The renderer.
 */
function recorder(
	contexts: WorkbenchRuntimeRenderContext[],
): (context: WorkbenchRuntimeRenderContext) => ReactNode {
	return (context) => {
		contexts.push(context);
		return createElement("span", { "data-observer": "runtime" }, context.status.state);
	};
}

/**
 * Mount the provider over a container.
 * @returns The mounted provider.
 */
function mount(): Mounted {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const contexts: WorkbenchRuntimeRenderContext[] = [];
	const render = recorder(contexts);
	/**
	 * Render the provider over one transport.
	 * @param transport The transport.
	 */
	async function renderTransport(transport: MutableTransport): Promise<void> {
		await act(async () => {
			root.render(createElement(WorkbenchRuntimeProvider, { transport, host: HOST, render }));
		});
	}
	/** Unmount and remove the container. */
	async function close(): Promise<void> {
		await act(async () => root.unmount());
		container.remove();
	}
	return { root, contexts, render: renderTransport, close };
}

/**
 * The last context the renderer received.
 * @param mounted The mounted provider.
 * @returns The context.
 */
function latest(mounted: Mounted): WorkbenchRuntimeRenderContext {
	const context = mounted.contexts.at(-1);
	if (context === undefined) {
		throw new Error("The renderer received nothing.");
	}
	return context;
}

/**
 * Send text through the assistant-ui composer and let the settlement land.
 * @param mounted The mounted provider.
 * @param text The text.
 */
async function send(mounted: Mounted, text: string): Promise<void> {
	const composer = latest(mounted).assistantRuntime.thread.composer;
	await act(async () => {
		composer.setText(text);
		composer.send();
		await Promise.resolve();
		await Promise.resolve();
	});
}

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

describe("mounted workbench runtime provider", () => {
	test("keeps one live subscription per transport and tears it down on replacement", async () => {
		const first = mutableTransport();
		const second = mutableTransport();
		const mounted = mount();
		try {
			await mounted.render(first);
			expect(first.subscriptions()).toBe(1);
			const runtime = latest(mounted).assistantRuntime;
			await act(async () => first.publish(connected(snapshot({ timeline: timeline() }))));
			expect(latest(mounted).assistantRuntime).toBe(runtime);
			expect(runtime.thread.getState().messages[0]?.id).toBe(
				workbenchRuntimeMessageId(ids.threadId, ids.turnId),
			);
			expect(latest(mounted).view.session.kind).toBe("ready");
			await mounted.render(second);
			expect(first.teardowns()).toBe(1);
			expect(second.subscriptions()).toBe(1);
		} finally {
			await mounted.close();
		}
		expect(second.teardowns()).toBe(1);
		expect(second.listenerCount()).toBe(0);
	});

	test("read-only states carry their reason and recovery, and disable the thread", async () => {
		const transport = mutableTransport({
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The workbench socket was intentionally stopped.",
		});
		const mounted = mount();
		try {
			await mounted.render(transport);
			expect(latest(mounted).status).toMatchObject({
				state: "stopped",
				message: "The workbench socket was intentionally stopped.",
				recovery: "Restart the Codex workbench, then retry.",
			});
			expect(latest(mounted).assistantRuntime.thread.getState().isDisabled).toBe(true);
			expect(latest(mounted).view.session).toEqual({
				kind: "empty",
				message: "The workbench socket was intentionally stopped.",
			});
			await act(async () =>
				transport.publish({
					kind: "readiness",
					state: "signed_out",
					connection: "connected",
					snapshot: snapshot({ readiness: { kind: "readiness", state: "signed_out" } }),
					sequence: 1,
				}),
			);
			expect(latest(mounted).status.recovery).toContain("Sign in to Codex");
			expect(latest(mounted).view.session.kind).toBe("ready");
		} finally {
			await mounted.close();
		}
	});

	test("translates submission outcomes without replay", async () => {
		const transport = mutableTransport();
		const mounted = mount();
		try {
			await mounted.render(transport);
			expect(latest(mounted).status.state).toBe("ready");

			transport.setAnswer(() =>
				Promise.reject(new BrowserWorkbenchTransportError("not_ready", "Offline")),
			);
			await send(mounted, "retry me");
			expect(latest(mounted).status).toMatchObject({ state: "not_delivered" });
			expect(latest(mounted).assistantRuntime.thread.composer.getState().text).toBe("retry me");

			transport.setAnswer(() =>
				Promise.reject(
					new BrowserWorkbenchTransportError("response_lost", "lost", {
						outcome: "outcome_unknown",
					}),
				),
			);
			await send(mounted, "do not replay");
			expect(latest(mounted).status.recovery).toContain("Inspect the current workhorse");
			expect(latest(mounted).assistantRuntime.thread.composer.getState().text).toBe("");

			transport.setAnswer(() => Promise.resolve(delivered()));
			await send(mounted, "confirmed");
			expect(latest(mounted).status.message).toContain("published its authoritative turn");

			transport.setAnswer(() => Promise.resolve({ ...delivered(), turnId: ids.otherTurnId }));
			await send(mounted, "unconfirmed");
			expect(latest(mounted).status.message).toContain("authoritative turn has not appeared");
			expect(transport.sent.map((action) => action.draft.command)).toEqual([
				"start",
				"start",
				"start",
				"start",
			]);
		} finally {
			await mounted.close();
		}
	});

	test("the composer intent decides steer, send or queue while a turn runs", async () => {
		const running = connected(snapshot({ timeline: timeline({ status: "inProgress" }) }));
		const transport = mutableTransport(running);
		const mounted = mount();
		try {
			await mounted.render(transport);
			expect(latest(mounted).assistantRuntime.thread.getState().isRunning).toBe(true);
			await send(mounted, "steer it");
			expect(transport.sent.at(-1)?.draft).toMatchObject({ command: "steer", turnId: ids.turnId });

			await act(async () => latest(mounted).actions.setComposerIntent("send"));
			await send(mounted, "start over");
			expect(transport.sent.at(-1)?.draft).toMatchObject({ command: "start" });

			await act(async () => latest(mounted).actions.setQueueInstead(true));
			await send(mounted, "later");
			expect(transport.sent.at(-1)?.draft).toEqual({ command: "queueAdd", prompt: "later" });
			expect(transport.sent.at(-1)?.intent).not.toBeUndefined();
			expect(latest(mounted).status.state).toBe("queued");

			await act(async () => latest(mounted).actions.stopTurn());
			await act(async () => {
				await Promise.resolve();
			});
			expect(transport.sent.at(-1)?.draft).toEqual({
				command: "interrupt",
				threadId: ids.threadId,
				turnId: ids.turnId,
			});
		} finally {
			await mounted.close();
		}
	});

	test("ignores a settlement that lands after the transport was replaced", async () => {
		const first = mutableTransport();
		const second = mutableTransport();
		const mounted = mount();
		const gate = latch();
		first.setAnswer(async () => {
			await gate.promise;
			return delivered();
		});
		try {
			await mounted.render(first);
			await send(mounted, "submission for A");
			await mounted.render(second);
			await act(async () => {
				gate.release();
				await Promise.resolve();
				await Promise.resolve();
			});
			expect(latest(mounted).status.state).toBe("ready");
		} finally {
			await mounted.close();
		}
	});
});
