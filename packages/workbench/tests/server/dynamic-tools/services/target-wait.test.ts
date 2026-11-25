import { expect, jest, mock, test } from "bun:test";
import { waitForTargetsWith } from "#server/dynamic-tools/services/target-wait.ts";
import { identities, waitOwnerFor } from "#tests/server/support/generation/terminal-fixture.ts";

type Workbench = Parameters<typeof waitForTargetsWith>[0];
type ThreadRead = Workbench["session"]["threadRead"];
type ThreadReadResult = Awaited<ReturnType<ThreadRead>>;

const working = { thread: { status: { type: "active" } } } as ThreadReadResult;

function waitFixture(threadRead: ThreadRead) {
	const h = identities();
	const owner = waitOwnerFor(h, "thread-one");
	const workbench: Workbench = {
		identity: h.identity,
		approvals: { inspect: () => [] },
		session: { threadRead },
	};
	return {
		workbench,
		input: {
			owner,
			cursor: null,
			previousSequence: 0,
			signal: new AbortController().signal,
		},
	};
}

test("a zero-length dynamic wait reads the target once", async () => {
	const read = mock(async () => working);
	const { workbench, input } = waitFixture(read);
	expect(await waitForTargetsWith(workbench, { ...input, timeoutMs: 0 })).toMatchObject({
		event: "timeout",
	});
	expect(read).toHaveBeenCalledTimes(1);
});

test("a dynamic wait spends its bound on the first read and starts no more reads after expiry", async () => {
	jest.useFakeTimers();
	try {
		const first = Promise.withResolvers<ThreadReadResult>();
		const read = mock(() => first.promise);
		const { workbench, input } = waitFixture(read);
		const owner = {
			...input.owner,
			sortedTargetThreadIds: [
				...input.owner.sortedTargetThreadIds,
				workbench.identity.identity.decoder.adoptThreadId("thread-two"),
			],
		};
		const received = mock();
		const waiting = waitForTargetsWith(workbench, { ...input, owner, timeoutMs: 20 });
		void waiting.then(received);
		jest.advanceTimersByTime(20);
		for (let turn = 0; turn < 10; turn++) await Promise.resolve();
		expect(received).toHaveBeenCalledWith(expect.objectContaining({ event: "timeout" }));
		first.resolve(working);
		for (let turn = 0; turn < 10; turn++) await Promise.resolve();
		expect(read).toHaveBeenCalledTimes(1);
	} finally {
		jest.useRealTimers();
	}
});
