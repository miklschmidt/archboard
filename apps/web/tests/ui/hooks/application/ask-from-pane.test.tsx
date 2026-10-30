// Asking the agent from a pane (TASK-537.01): the question goes to the
// workhorse of the pane's checkout, so that checkout is activated, and the
// workbench read again, before the question is sent. A switch that fails still
// sends it, to the conversation shown.
//
// What these catch: a question sent before the switch, which reaches the
// workhorse of another checkout, and a question lost when the switch fails.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, test } from "bun:test";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

// React's renderer is loaded once the page's globals are there.
const { cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { useAskFromPane } = await import("#ui/hooks/application/use-ask-from-pane.ts");

afterAll(async () => {
	cleanup();
	await GlobalRegistrator.unregister();
});

/**
 * Ask one question from a pane, and record each step in the order it ran.
 * @param switched Whether the server makes the pane's checkout the shown one.
 * @returns The steps, once the question is sent.
 */
async function askFrom(switched: boolean): Promise<string[]> {
	const steps: string[] = [];
	/**
	 * Show the conversation of a pane's checkout.
	 * @param paneId The pane.
	 * @returns Whether the server switched.
	 */
	async function activate(paneId: string): Promise<boolean> {
		steps.push(`activate ${paneId}`);
		if (!switched) throw new Error("the server refused the switch");
		return true;
	}
	const transport = {
		/** Read the workbench again, after the switch. */
		refresh: async (): Promise<void> => {
			steps.push("refresh");
		},
	};
	/**
	 * Send the question to the conversation shown.
	 * @param text The question.
	 */
	function ask(text: string): void {
		steps.push(`ask ${text}`);
	}
	const { result } = renderHook(() => useAskFromPane(activate, transport, ask));
	result.current("pane-b", "What would deleting Place order cost?");
	await waitFor(() => {
		expect(steps.at(-1)?.startsWith("ask")).toBe(true);
	});
	return steps;
}

test("a question from a pane is sent after its checkout is shown and the workbench read again", async () => {
	expect(await askFrom(true)).toEqual([
		"activate pane-b",
		"refresh",
		"ask What would deleting Place order cost?",
	]);
});

test("a question is still sent when the switch to the pane's checkout fails", async () => {
	expect(await askFrom(false)).toEqual([
		"activate pane-b",
		"ask What would deleting Place order cost?",
	]);
});
