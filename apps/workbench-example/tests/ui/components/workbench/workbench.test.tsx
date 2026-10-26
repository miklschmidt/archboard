import { GlobalRegistrator } from "@happy-dom/global-registrator";
let dom: typeof import("@testing-library/react/pure");
import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import {
	createVoiceClient,
	type VoiceClient,
	type VoiceClientSnapshot,
} from "@archboard/codex-realtime-voice/browser";
import { VoiceClientProvider } from "@archboard/codex-realtime-voice/react";
import { Workbench } from "#ui/components/workbench/Workbench.tsx";
import { ApprovalCard } from "#ui/components/workbench/ApprovalCard.tsx";
import { exampleSnapshot, commandApproval, settledApproval } from "#tests/ui/support/snapshot.ts";

beforeAll(async () => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
	dom = await import("@testing-library/react/pure");
});
afterEach(() => dom.cleanup());
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/** The page client with its actions observed at their public boundary. */
type PageClient = VoiceClient & {
	readonly send: ReturnType<typeof mock<(message: string) => Promise<boolean>>>;
	readonly stopVoice: ReturnType<typeof mock<() => Promise<boolean>>>;
	readonly stopWork: ReturnType<typeof mock<() => Promise<boolean>>>;
};

/**
 * Present a real client shape with page actions observed at their public boundary.
 * @param running Whether work is active.
 * @param busy Whether another action is pending.
 * @returns The page client.
 */
function pageClient(running = false, busy = false): PageClient {
	const original = createVoiceClient({ socketPath: "/api/workbench" });
	const state: VoiceClientSnapshot = {
		...original.snapshot(),
		connection: "connected",
		server: exampleSnapshot(running),
		voice: { phase: "listening", available: true, problem: null },
		busy,
	};
	return {
		...original,
		/**
		 * The fixed page state.
		 * @returns The state.
		 */
		snapshot: () => state,
		send: mock(async (_message: string) => false),
		stopVoice: mock(async () => true),
		stopWork: mock(async () => true),
	};
}

/**
 * Draw the page over a client.
 * @param client The client.
 * @returns The rendered page.
 */
function renderPage(client: VoiceClient) {
	return dom.render(
		<VoiceClientProvider client={client}>
			<Workbench checkout="/checkout" />
		</VoiceClientProvider>,
	);
}

test("voice and work stops remain separate while another action is pending", async () => {
	const client = pageClient(true, true);
	try {
		const view = renderPage(client);
		await dom.act(async () => {
			dom.fireEvent.click(view.getByRole("button", { name: "Stop voice" }));
		});
		expect(client.stopVoice).toHaveBeenCalledTimes(1);
		expect(client.stopWork).not.toHaveBeenCalled();
		await dom.act(async () => {
			dom.fireEvent.click(view.getByRole("button", { name: "Stop work" }));
		});
		expect(client.stopWork).toHaveBeenCalledTimes(1);
		expect(client.stopVoice).toHaveBeenCalledTimes(1);
	} finally {
		await client.dispose();
	}
});

test("a failed send retains the draft and a delivered send clears it", async () => {
	const client = pageClient();
	try {
		const view = renderPage(client);
		const input = view.getByRole("textbox");
		dom.fireEvent.change(input, { target: { value: "Investigate the checkout" } });
		await dom.act(async () => {
			dom.fireEvent.click(view.getByRole("button", { name: "Send" }));
		});
		expect(client.send).toHaveBeenCalledTimes(1);
		expect(input).toHaveProperty("value", "Investigate the checkout");
		client.send.mockResolvedValue(true);
		await dom.act(async () => {
			dom.fireEvent.click(view.getByRole("button", { name: "Send" }));
		});
		expect(input).toHaveProperty("value", "");
	} finally {
		await client.dispose();
	}
});

test("approval controls deliver an offered decision and become inert after settlement", async () => {
	const approval = commandApproval();
	const respond = mock(async () => true);
	const view = dom.render(<ApprovalCard approval={approval} disabled={false} respond={respond} />);
	await dom.act(async () => {
		dom.fireEvent.click(view.getByRole("button", { name: "Allow once" }));
	});
	expect(respond).toHaveBeenCalledWith({ approvalKind: "command_execution", decision: "accept" });
	view.rerender(
		<ApprovalCard approval={settledApproval(approval)} disabled={false} respond={respond} />,
	);
	dom.fireEvent.click(view.getByRole("button", { name: "Allow once" }));
	expect(respond).toHaveBeenCalledTimes(1);
});
