import { describe, expect, test } from "bun:test";

import { CodexTransportUsageError } from "../errors.js";
import { CODEX_APP_SERVER_CAPACITY } from "../../../shared/codex-app-server-capacity/index.js";
import { createHarness, flushStreams } from "./fake-child.js";

describe("Codex app-server transport diagnostics and shutdown", () => {
	test("bounds diagnostics, isolates listener failures, and detaches all input after shutdown", async () => {
		const { child, transport, close } = createHarness();
		try {
			const issueUnsubscribe = transport.onIssue(() => {
				throw new Error("listener fixture");
			});
			expect(() => transport.onIssue(() => undefined)).toThrow(CodexTransportUsageError);
			child.stdout.write("\r\n");
			child.stderr.write(Buffer.alloc(32_768, 0x68));
			child.stderr.write(Buffer.alloc(32_768, 0x74));
			await flushStreams();
			issueUnsubscribe();
			expect(transport.inspectIssues()).toContainEqual(
				expect.objectContaining({ kind: "listener-error" }),
			);
			expect(transport.inspectStderr()).toMatchObject({
				retainedBytes: CODEX_APP_SERVER_CAPACITY.stderrRetainedBytes,
				text: `${"h".repeat(32_768)}${"t".repeat(32_768)}`,
			});

			const requestCount = { value: 0 };
			transport.onServerNotification(() => (requestCount.value += 1));
			const shutdown = transport.shutdown();
			expect(transport.inspect().state).toBe("closing");
			await shutdown;
			child.stdout.emit(
				"data",
				Buffer.from(
					'{"method":"thread/realtime/closed","params":{"threadId":"x","reason":null}}\n',
				),
			);
			await flushStreams();
			expect(requestCount.value).toBe(0);
			expect(transport.inspect().state).toBe("closed");
			await transport.shutdown();
		} finally {
			await close();
		}
	});
});
