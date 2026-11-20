import { GlobalRegistrator } from "@happy-dom/global-registrator";
let dom: typeof import("@testing-library/react/pure");
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import { INITIAL_REALTIME_STATE } from "#shared/rules/realtime-state.ts";
import { useVoiceState } from "#ui/voice-client/hooks/use-voice-state.ts";
import type { VoiceClient, VoiceClientSnapshot } from "#ui/voice-client/state/contract.ts";

beforeAll(async () => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
	dom = await import("@testing-library/react/pure");
});
afterEach(() => dom.cleanup());
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

type PublishingClient = Pick<VoiceClient, "snapshot" | "subscribe">;

/**
 * A client whose state the test publishes.
 * @returns The client and the publish.
 */
function publishingClient() {
	const listeners = new Set<() => void>();
	let state: VoiceClientSnapshot = Object.freeze({
		connection: "reconnecting",
		server: null,
		voice: { phase: INITIAL_REALTIME_STATE.phase, available: false, problem: null },
		busy: false,
		failure: null,
	});
	const client: PublishingClient = {
		/**
		 * The published state.
		 * @returns The state.
		 */
		snapshot: () => state,
		/**
		 * Hear each publication.
		 * @param listener The listener.
		 * @returns The unsubscribe.
		 */
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	/**
	 * Publish a new state.
	 * @param next What changes.
	 */
	const publish = (next: Partial<VoiceClientSnapshot>) => {
		state = Object.freeze({ ...state, ...next });
		for (const listener of listeners) listener();
	};
	return { client, publish };
}

/**
 * Shows whether an action runs, read through a selector that builds a new object.
 * @param props The client.
 * @param props.client The client.
 * @returns The rendered state.
 */
function BusyLabel({ client }: { readonly client: PublishingClient }) {
	const { busy } = useVoiceState(client, (state) => ({ busy: state.busy }));
	return <output>{busy ? "busy" : "idle"}</output>;
}

test("a selector that builds a new object renders each publication once", async () => {
	const { client, publish } = publishingClient();
	const view = dom.render(<BusyLabel client={client} />);
	expect(view.getByRole("status").textContent).toBe("idle");
	await dom.act(async () => {
		publish({ busy: true });
	});
	expect(view.getByRole("status").textContent).toBe("busy");
});
