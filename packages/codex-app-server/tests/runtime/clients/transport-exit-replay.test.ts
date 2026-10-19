import { expect, test } from "bun:test";

import { createIdentityAuthority } from "#shared/rules/workbench-identity.ts";
import { createCodexTransport } from "#runtime/clients/transport.ts";
import type { CodexTransport } from "#runtime/clients/transport-types.ts";
import {
	createHarness,
	FakeChild,
	flushStreams,
} from "#tests/runtime/support/transport-fake-child.ts";

type TransportExitEvent = Parameters<Parameters<CodexTransport["onExit"]>[0]>[0];
interface CapturedExit {
	readonly code: TransportExitEvent["code"];
	readonly signal: TransportExitEvent["signal"];
}

test("replays an exact terminal exit to a listener attached after child exit", async () => {
	const { child, transport, close } = createHarness();
	try {
		child.exit(23, "SIGTERM");
		await flushStreams();
		const exits: CapturedExit[] = [];
		transport.onExit((event: CapturedExit) => {
			exits.push(event);
		});
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
		const exits: CapturedExit[] = [];
		transport.onExit((event: CapturedExit) => {
			exits.push(event);
		});
		expect(exits).toHaveLength(1);
		expect(exits[0]).toMatchObject({ code: 29, signal: "SIGKILL" });
		expect(transport.inspect().state).toBe("closed");
	} finally {
		await transport.shutdown();
		child.dispose();
	}
});
