import { GlobalRegistrator } from "@happy-dom/global-registrator";
let dom: typeof import("@testing-library/react/pure");
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import { createVoiceClient } from "#ui/clients/voice-client/voice-client.ts";
import { VoiceClientProvider } from "#ui/components/voice-client/VoiceClientProvider.tsx";
import { useVoiceState } from "#ui/hooks/voice-client/use-voice-client.ts";
import type { VoiceClient, VoiceClientSnapshot } from "#ui/state/voice-client/contract.ts";

beforeAll(async () => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
	dom = await import("@testing-library/react/pure");
});
afterEach(() => dom.cleanup());
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * A client whose state the test publishes.
 * @returns The client and the publish.
 */
function publishingClient() {
	const original = createVoiceClient({ socketPath: "/api/voice" });
	const listeners = new Set<() => void>();
	let state = original.snapshot();
	const client: VoiceClient = {
		...original,
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
 * @returns The rendered state.
 */
function BusyLabel() {
	const { busy } = useVoiceState((state) => ({ busy: state.busy }));
	return <output>{busy ? "busy" : "idle"}</output>;
}

test("a selector that builds a new object renders each publication once", async () => {
	const { client, publish } = publishingClient();
	const view = dom.render(
		<VoiceClientProvider client={client}>
			<BusyLabel />
		</VoiceClientProvider>,
	);
	expect(view.getByRole("status").textContent).toBe("idle");
	await dom.act(async () => {
		publish({ busy: true });
	});
	expect(view.getByRole("status").textContent).toBe("busy");
	await client.dispose();
});
