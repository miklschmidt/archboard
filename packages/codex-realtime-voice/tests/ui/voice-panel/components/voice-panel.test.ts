import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, expect, test } from "bun:test";

import { createCodexBrowserModel } from "#shared/browser/schemas/model.ts";
import { INITIAL_REALTIME_STATE } from "#shared/rules/realtime-state.ts";
import type { VoiceClient, VoiceClientSnapshot } from "#ui/voice-client/state/contract.ts";
import { renderVoicePanel } from "#ui/voice-panel/components/mount-voice.ts";
import { ENGLISH } from "#ui/voice-panel/rules/text.ts";
import { approval, snapshot } from "#tests/ui/support/transport/fixtures.ts";

beforeAll(() => {
	GlobalRegistrator.register();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

const model = createCodexBrowserModel();

/**
 * A client whose state the test publishes and whose actions it records.
 * @param server What the server published, or null.
 * @returns The client, its calls and the publish.
 */
function stubClient(server: VoiceClientSnapshot["server"]) {
	const calls: unknown[][] = [];
	const listeners = new Set<() => void>();
	let state: VoiceClientSnapshot = Object.freeze({
		connection: server === null ? "reconnecting" : "connected",
		server,
		voice: { phase: INITIAL_REALTIME_STATE.phase, available: true, problem: null },
		busy: false,
		failure: null,
	});
	/**
	 * Record one action.
	 * @param name The action.
	 * @returns An action that records its arguments and completes.
	 */
	const action =
		(name: string) =>
		async (...args: unknown[]) => {
			calls.push([name, ...args]);
			return true;
		};
	const client: VoiceClient = {
		refresh: action("refresh"),
		signIn: action("signIn"),
		cancelSignIn: action("cancelSignIn"),
		signOut: action("signOut"),
		send: action("send"),
		startVoice: action("startVoice"),
		stopVoice: action("stopVoice"),
		setMuted: action("setMuted"),
		stopWork: action("stopWork"),
		answerApproval: action("answerApproval"),
		snapshot: () => state,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose: async () => undefined,
	};
	/**
	 * Publish a new state.
	 * @param next What changes.
	 */
	const publish = (next: Partial<VoiceClientSnapshot>) => {
		state = Object.freeze({ ...state, ...next });
		for (const listener of listeners) listener();
	};
	return { client, calls, publish, listeners };
}

/**
 * A button of the panel by its label.
 * @param host The panel's host.
 * @param label The label.
 * @returns The button.
 */
function buttonNamed(host: Element, label: string): HTMLButtonElement {
	const found = [...host.querySelectorAll("button")].find((button) => button.textContent === label);
	if (found === undefined) throw new Error(`No button reads ${label}.`);
	return found;
}

test("the panel says it connects, then answers a command approval with the decision chosen", () => {
	const host = document.createElement("main");
	const { client, calls, publish, listeners } = stubClient(null);
	const remove = renderVoicePanel(host, client, ENGLISH);
	expect(host.querySelector('[role="status"]')?.textContent).toBe(ENGLISH.connecting);
	const server = model.BrowserSnapshotSchema.parse(
		snapshot({
			linkState: "executable",
			approvals: [{ ...approval(), availableDecisions: ["accept", "decline"] }],
		}),
	);
	publish({ connection: "connected", server });
	expect(host.querySelector('[role="status"]')?.textContent).toBe(ENGLISH.voice("idle"));
	expect(buttonNamed(host, ENGLISH.signIn).parentElement?.style.display).toBe("none");
	expect(host.querySelector<HTMLElement>('[role="alert"]')?.style.display).toBe("none");
	const [pending] = server.approvals;
	buttonNamed(host, "Run").click();
	expect(calls).toContainEqual([
		"answerApproval",
		pending,
		{ approvalKind: "command_execution", decision: "accept" },
	]);
	buttonNamed(host, ENGLISH.startVoice).click();
	expect(calls).toContainEqual(["startVoice"]);
	remove();
	expect(host.childElementCount).toBe(0);
	expect(listeners.size).toBe(0);
});

test("the panel offers sign-in while the account is signed out, in the words it was given", () => {
	const host = document.createElement("main");
	const signedOut = model.BrowserSnapshotSchema.parse({
		...snapshot({ linkState: "executable" }),
		account: { kind: "account", state: "signed_out" },
	});
	const { client, calls } = stubClient(signedOut);
	const remove = renderVoicePanel(host, client, { ...ENGLISH, signIn: "Anmelden" });
	expect(host.querySelector('[role="status"]')?.textContent).toBe(ENGLISH.signedOut);
	buttonNamed(host, "Anmelden").click();
	expect(calls).toEqual([["signIn"]]);
	expect(buttonNamed(host, ENGLISH.startVoice).closest("[hidden]")).not.toBeNull();
	remove();
});
