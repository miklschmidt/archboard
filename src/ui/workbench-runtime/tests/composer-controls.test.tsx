// While a turn runs, the composer's own controls still submit: the Send
// button and Enter in the input go through the runtime's handler, which
// decides steer, send or queue, and Stop stands beside Send. The official
// assistant-ui controls refuse a running turn without a queue adapter, and a
// queue adapter would route the message around that handler (TASK-150).

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
	WorkbenchRuntimeProvider,
	type WorkbenchRuntimeHost,
	type WorkbenchRuntimeRenderContext,
} from "@/ui/workbench-runtime";
import {
	connected,
	ids,
	mutableTransport,
	snapshot,
	timeline,
	type MutableTransport,
} from "@/ui/workbench-runtime/tests/fixtures";
import { Thread } from "@/ui/workbench-thread/thread";

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

/** The thread mounted over a running transport. */
interface Mounted {
	readonly root: Root;
	readonly container: HTMLElement;
	readonly contexts: WorkbenchRuntimeRenderContext[];
	readonly close: () => Promise<void>;
}

/**
 * Mount the official thread inside the runtime provider over one transport.
 * @param transport The transport.
 * @returns The mounted thread.
 */
async function mountThread(transport: MutableTransport): Promise<Mounted> {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const contexts: WorkbenchRuntimeRenderContext[] = [];
	/**
	 * The renderer: record the context and show the official thread.
	 * @param context What the provider rendered with.
	 * @returns The thread.
	 */
	const render = (context: WorkbenchRuntimeRenderContext): React.JSX.Element => {
		contexts.push(context);
		return createElement(Thread);
	};
	await act(async () => {
		root.render(createElement(WorkbenchRuntimeProvider, { transport, host: HOST, render }));
	});
	/** Unmount and remove the container. */
	async function close(): Promise<void> {
		await act(async () => root.unmount());
		container.remove();
	}
	return { root, container, contexts, close };
}

/**
 * The composer's input.
 * @param mounted The mounted thread.
 * @returns The textarea.
 */
function input(mounted: Mounted): HTMLTextAreaElement {
	const element = mounted.container.querySelector('textarea[aria-label="Message input"]');
	if (!(element instanceof HTMLTextAreaElement)) {
		throw new Error("The composer input is not rendered.");
	}
	return element;
}

/**
 * A composer button by its accessible name.
 * @param mounted The mounted thread.
 * @param name The aria-label.
 * @returns The button, or null when it is not rendered.
 */
function button(mounted: Mounted, name: string): HTMLButtonElement | null {
	const element = mounted.container.querySelector(`button[aria-label="${name}"]`);
	return element instanceof HTMLButtonElement ? element : null;
}

/**
 * Type into the composer as a person would, through the runtime's composer.
 * @param mounted The mounted thread.
 * @param text The text.
 */
async function type(mounted: Mounted, text: string): Promise<void> {
	const context = mounted.contexts.at(-1);
	if (context === undefined) {
		throw new Error("The renderer received nothing.");
	}
	await act(async () => {
		context.assistantRuntime.thread.composer.setText(text);
	});
}

/** Let a submission settle through the transport. */
async function settle(): Promise<void> {
	await act(async () => {
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

describe("the composer while a turn runs", () => {
	test("Send stands beside Stop and submits through the runtime's handler", async () => {
		const running = connected(snapshot({ timeline: timeline({ status: "inProgress" }) }));
		const transport = mutableTransport(running);
		const mounted = await mountThread(transport);
		try {
			expect(button(mounted, "Stop generating")).not.toBeNull();
			const send = button(mounted, "Send message");
			expect(send).not.toBeNull();
			expect(send!.disabled).toBe(true);

			await type(mounted, "steer it");
			expect(button(mounted, "Send message")!.disabled).toBe(false);
			await act(async () => {
				button(mounted, "Send message")!.click();
			});
			await settle();
			expect(transport.sent.at(-1)?.draft).toMatchObject({
				command: "steer",
				turnId: ids.turnId,
			});
		} finally {
			await mounted.close();
		}
	});

	test("Enter in the input submits through the runtime's handler", async () => {
		const running = connected(snapshot({ timeline: timeline({ status: "inProgress" }) }));
		const transport = mutableTransport(running);
		const mounted = await mountThread(transport);
		try {
			await type(mounted, "steer by keyboard");
			const before = transport.sent.length;
			await act(async () => {
				input(mounted).focus();
				input(mounted).dispatchEvent(
					new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
				);
			});
			await settle();
			expect(transport.sent).toHaveLength(before + 1);
			expect(transport.sent.at(-1)?.draft).toMatchObject({
				command: "steer",
				turnId: ids.turnId,
			});

			// Shift+Enter is still a newline, not a submission.
			await type(mounted, "two lines");
			await act(async () => {
				input(mounted).dispatchEvent(
					new KeyboardEvent("keydown", {
						key: "Enter",
						shiftKey: true,
						bubbles: true,
						cancelable: true,
					}),
				);
			});
			await settle();
			expect(transport.sent).toHaveLength(before + 1);
		} finally {
			await mounted.close();
		}
	});
});
