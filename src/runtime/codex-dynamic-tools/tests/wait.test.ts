import { expect, test } from "bun:test";

import { createCodexWaitGraph } from "../../codex-wait-graph/index.js";
import { decodeDynamicCursor, encodeDynamicCursor, waitForDynamicThreads } from "../index.js";
import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
} from "../../codex-thread-tools/index.js";
import type { ThreadLinkClassification } from "../../codex-thread-link/index.js";
import { optionsFor, requestFor, setupAuthorities } from "./support.js";

async function waitCall(
	request: ReturnType<typeof requestFor>,
	fixture: ReturnType<typeof optionsFor>,
	threadIds: readonly string[],
	cursor?: string,
): Promise<Awaited<ReturnType<typeof waitForDynamicThreads>>> {
	return waitForDynamicThreads({
		threadIds,
		timeoutMs: 250,
		...(cursor === undefined ? {} : { cursor }),
		caller: fixture.threadAuthority.caller,
		call: {
			callId: request.logicalCall.callId,
			namespace: ARCHBOARD_APP_NAMESPACE.name,
			tool: "wait_threads",
			manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
		},
		classifyTarget: (threadId) => fixture.threadAuthority.classifyExactTarget({ threadId }),
		options: fixture.options,
	});
}

test("wait sorts targets, binds the cursor, and releases the owner before returning", async () => {
	const { authorities, caller, otherTarget } = setupAuthorities();
	const secondTarget = {
		...otherTarget,
		wireThreadId: "another-thread",
		threadId: authorities.identity.decoder.adoptThreadId("another-thread"),
	};
	const graph = createCodexWaitGraph();
	const fixture = optionsFor(authorities, caller, { waitGraph: graph });
	fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
	fixture.threadAuthority.targets.set(secondTarget.wireThreadId, secondTarget);
	fixture.lifecycle.waitEvent = {
		event: "completed",
		threadId: otherTarget.wireThreadId,
		sequence: 4,
		cursor: "event-4",
	};
	const request = requestFor(authorities, caller, "wait_threads", {
		threadIds: [otherTarget.wireThreadId, secondTarget.wireThreadId],
	});

	const result = await waitCall(request, fixture, [
		otherTarget.wireThreadId,
		secondTarget.wireThreadId,
	]);
	if (result.cursor === null) throw new Error("wait did not return a bound cursor");
	const binding = decodeDynamicCursor(result.cursor);

	expect(result.event).toBe("completed");
	expect(result.threadId).toBe(otherTarget.wireThreadId);
	expect(binding.method).toBe("wait_threads");
	expect(binding.direction).toBe("event");
	expect(JSON.parse(binding.query)).toEqual({
		threadIds: [otherTarget.wireThreadId, secondTarget.wireThreadId].toSorted((left, right) =>
			left.localeCompare(right),
		),
	});
	expect(binding.sequence).toBe(4);
	expect(fixture.lifecycle.registered).toHaveLength(1);
	expect(fixture.lifecycle.registered[0]?.sortedTargetThreadIds).toEqual(
		[otherTarget.threadId, secondTarget.threadId].toSorted((left, right) =>
			String(left).localeCompare(String(right)),
		),
	);
	expect(fixture.lifecycle.releases.map(({ cause }) => cause)).toEqual(["settle"]);
	expect(graph.inspect()).toEqual([]);
});

test("system-error attention does not need a target-owned flag", async () => {
	const { authorities, caller, otherTarget } = setupAuthorities();
	const baseLink = otherTarget.linkClassification;
	if (baseLink === undefined) throw new Error("system-error fixture is missing its link");
	const systemErrorLink: ThreadLinkClassification = {
		...baseLink,
		link: {
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: otherTarget.threadId,
			source: "appServer",
			status: "systemError",
			loaded: true,
			canAcceptDirectInput: false,
			reason: "thread_status_system_error",
		},
		observation: { ...baseLink.observation, status: "systemError" },
	};
	const systemErrorTarget = {
		...otherTarget,
		status: "systemError" as const,
		linkClassification: systemErrorLink,
	};
	const graph = createCodexWaitGraph();
	const fixture = optionsFor(authorities, caller, { waitGraph: graph });
	fixture.threadAuthority.targets.set(systemErrorTarget.wireThreadId, systemErrorTarget);
	fixture.lifecycle.waitEvent = {
		event: "attention",
		threadId: systemErrorTarget.wireThreadId,
		sequence: 1,
		cursor: null,
	};
	const request = requestFor(authorities, caller, "wait_threads", {
		threadIds: [systemErrorTarget.wireThreadId],
	});

	const result = await waitCall(request, fixture, [systemErrorTarget.wireThreadId]);

	expect(result.event).toBe("attention");
	expect(fixture.lifecycle.releases.map(({ cause }) => cause)).toEqual(["settle"]);
	expect(graph.inspect()).toEqual([]);
});

test("wait rejects a transitive cycle before lifecycle registration", async () => {
	const { authorities, caller, otherTarget } = setupAuthorities();
	const graph = createCodexWaitGraph();
	const fixture = optionsFor(authorities, caller, { waitGraph: graph });
	fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
	const request = requestFor(authorities, caller, "wait_threads", {
		threadIds: [otherTarget.wireThreadId],
	});
	graph.addEdgeSet({
		owner: {
			child: caller.childId,
			caller: otherTarget.threadId,
			turn: caller.turnId,
			call: request.logicalCall.callId,
		},
		targets: [caller.threadId],
	});

	await expect(waitCall(request, fixture, [otherTarget.wireThreadId])).rejects.toMatchObject({
		code: "cycle",
	});
	expect(fixture.lifecycle.registered).toHaveLength(0);
	expect(fixture.lifecycle.releases).toHaveLength(0);
	expect(graph.inspect()).toHaveLength(1);
});

test("child exit removes every wait owner exactly once", async () => {
	const { authorities, caller, otherTarget } = setupAuthorities();
	const graph = createCodexWaitGraph();
	const fixture = optionsFor(authorities, caller, { waitGraph: graph });
	fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
	fixture.lifecycle.waitEvent = Object.assign(new Error("child exited"), { code: "child_exit" });
	const request = requestFor(authorities, caller, "wait_threads", {
		threadIds: [otherTarget.wireThreadId],
	});

	await expect(waitCall(request, fixture, [otherTarget.wireThreadId])).rejects.toMatchObject({
		code: "stale_child",
	});
	expect(fixture.lifecycle.registered).toHaveLength(1);
	expect(fixture.lifecycle.releases).toHaveLength(0);
	expect(fixture.lifecycle.childReleases).toEqual([caller.childId]);
	expect(graph.inspect()).toEqual([]);
});

test("attention requires target ownership and cursor queries cannot be changed", async () => {
	const { authorities, caller, otherTarget } = setupAuthorities();
	const graph = createCodexWaitGraph();
	const fixture = optionsFor(authorities, caller, { waitGraph: graph });
	fixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
	fixture.lifecycle.waitEvent = {
		event: "attention",
		threadId: otherTarget.wireThreadId,
		sequence: 1,
		cursor: null,
	};
	const request = requestFor(authorities, caller, "wait_threads", {
		threadIds: [otherTarget.wireThreadId],
	});
	await expect(waitCall(request, fixture, [otherTarget.wireThreadId])).rejects.toMatchObject({
		code: "invalid_call",
	});
	expect(fixture.lifecycle.releases.map(({ cause }) => cause)).toEqual(["cancellation"]);

	const mismatchedCursor = encodeDynamicCursor({
		child: caller.childId,
		epoch: caller.epoch,
		method: "wait_threads",
		direction: "event",
		query: { threadIds: ["different-thread"] },
		cursor: null,
		sequence: 0,
	});
	const mismatchFixture = optionsFor(authorities, caller, { waitGraph: createCodexWaitGraph() });
	mismatchFixture.threadAuthority.targets.set(otherTarget.wireThreadId, otherTarget);
	const mismatchRequest = requestFor(authorities, caller, "wait_threads", {
		threadIds: [otherTarget.wireThreadId],
		cursor: mismatchedCursor,
	});
	await expect(
		waitCall(mismatchRequest, mismatchFixture, [otherTarget.wireThreadId], mismatchedCursor),
	).rejects.toMatchObject({ code: "invalid_call" });
	expect(mismatchFixture.lifecycle.registered).toHaveLength(0);
});
