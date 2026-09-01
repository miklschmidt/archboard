import { expect, test } from "bun:test";

import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import { createCodexTransport } from "../index.js";
import { createHarness, FakeChild, flushStreams } from "./fake-child.js";

test("replays an exact terminal exit to a listener attached after child exit", async () => {
	const { child, transport, close } = createHarness();
	try {
		child.exit(23, "SIGTERM");
		await flushStreams();
		const exits: unknown[] = [];
		transport.onExit((event) => exits.push(event));
		expect(exits).toHaveLength(1);
		expect(exits[0]).toMatchObject({ code: 23, signal: "SIGTERM" });
	} finally {
		await close();
	}
});

test("detects a child that exited before transport listener attachment", async () => {
	const child = new FakeChild();
	child.exit(29, "SIGKILL");
	const transport = createCodexTransport({
		child,
		identity: createIdentityAuthority(),
		dynamicDispatchers: [
			{ owner: "codex-dynamic-tools", namespace: "archboard", manifestHash: "terminal" },
		],
	});
	try {
		const exits: unknown[] = [];
		transport.onExit((event) => exits.push(event));
		expect(exits).toHaveLength(1);
		expect(exits[0]).toMatchObject({ code: 29, signal: "SIGKILL" });
		expect(transport.inspect().state).toBe("closed");
	} finally {
		await transport.shutdown();
		child.dispose();
	}
});
