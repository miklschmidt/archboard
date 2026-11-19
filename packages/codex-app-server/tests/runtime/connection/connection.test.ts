import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openCodexConnection, openCodexSession } from "#runtime/connection/connection.ts";
import type { CodexConnection } from "#runtime/connection/connection.ts";
import { FakeChild, flushStreams } from "#tests/runtime/support/transport-fake-child.ts";

/**
 * Opens a connection over a fake child and closes both afterwards.
 * @param child The child to open it over.
 * @param run What the test does with the connection.
 */
async function withConnection(
	child: FakeChild,
	run: (connection: CodexConnection) => Promise<void> | void,
): Promise<void> {
	const connection = openCodexConnection({ child, recordPrefix: "host-a" });
	try {
		await run(connection);
	} finally {
		const shutdown = connection.transport.shutdown();
		child.releaseBlockedWrite();
		await shutdown;
		child.dispose();
	}
}

describe("openCodexConnection", () => {
	test("names one child epoch that the authorities and the transport share", async () => {
		const child = new FakeChild();
		await withConnection(child, async (connection) => {
			expect(connection.child).toStartWith("host-a:child:");
			expect(connection.identity.identity.validator).toMatchObject({
				childId: connection.child,
				epoch: connection.epoch,
			});
			expect(Object.values(connection).some((value) => typeof value === "function")).toBeFalse();

			const exits: unknown[] = [];
			connection.transport.onExit((exit) => exits.push(exit));
			child.exit(3);
			await flushStreams();
			expect(exits).toEqual([
				{ child: connection.child, epoch: connection.epoch, code: 3, signal: null },
			]);
		});
	});

	test("opens over a child that already exited, with a closed transport that refuses dispatchers", async () => {
		const child = new FakeChild();
		child.exit(1);
		await withConnection(child, (connection) => {
			expect(connection.transport.inspect().state).toBe("closed");
			expect(() =>
				connection.transport.registerDynamicDispatcher({
					owner: "codex-dynamic-tools",
					namespace: "archboard",
					manifestHash: "hash",
				}),
			).toThrow();
		});
	});

	test("gives two children different child ids", async () => {
		const first = new FakeChild();
		const second = new FakeChild();
		await withConnection(first, async (a) => {
			await withConnection(second, (b) => {
				expect(a.child).not.toBe(b.child);
				expect(a.epoch).not.toBe(b.epoch);
			});
		});
	});
});

describe("openCodexSession", () => {
	test("leaves the transport's events to the owner of the control", async () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-connection-")));
		const child = new FakeChild();
		try {
			await withConnection(child, async (connection) => {
				const received: unknown[] = [];
				const { session, control } = openCodexSession(connection, {
					storage: {
						codexHome: root,
						sqliteHome: root,
						configPath: join(root, "config.toml"),
					},
					workingDirectory: root,
					onNotification: (event) => received.push(event),
				});
				expect(typeof session.initialize).toBe("function");
				child.stdout.write(
					`${JSON.stringify({ method: "thread/realtime/closed", params: { threadId: "t", reason: null } })}\n`,
				);
				await flushStreams();
				expect(received).toEqual([]);
				control.dispose();
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
