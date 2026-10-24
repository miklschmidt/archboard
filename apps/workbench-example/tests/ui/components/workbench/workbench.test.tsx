import { GlobalRegistrator } from "@happy-dom/global-registrator";
let dom: typeof import("@testing-library/react/pure");
import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { createExampleClient, type ExampleClientSnapshot } from "#ui/clients/workbench/client.ts";
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

/**
 * Present a real client shape with page actions observed at their public boundary.
 * @param running Whether work is active.
 * @returns The page client and its independent action recorders.
 */
function pageClient(running = false) {
	const original = createExampleClient();
	const snapshot = exampleSnapshot(running);
	const state: ExampleClientSnapshot = {
		...original.snapshot(),
		configuration: {
			checkout: { label: "checkout", path: "/checkout" },
			socketPath: "/api/workbench",
		},
		transport: {
			kind: "readiness",
			state: "thread_capable",
			connection: "connected",
			snapshot,
			sequence: 1,
		},
		media: { correlation: null, state: { phase: "listening", reason: "negotiation_succeeded" } },
		mediaState: { state: "ready" },
	};
	const client = {
		...original,
		snapshot: mock(() => state),
		send: mock(async (_prompt: string) => false),
		stopVoice: mock(async () => true),
		stopWork: mock(async () => true),
	};
	return { client, state };
}

test("voice and work stops remain separate while another action is pending", async () => {
	const { client, state } = pageClient(true);
	state.busy = true;
	try {
		const view = dom.render(<Workbench client={client} />);
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
	const { client } = pageClient();
	try {
		const view = dom.render(<Workbench client={client} />);
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
