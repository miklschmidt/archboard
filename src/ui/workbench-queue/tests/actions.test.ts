import { describe, expect, test } from "bun:test";

import { captureWorkbenchQueueTarget, createWorkbenchQueueCommands } from "@/ui/workbench-queue";
import type { WorkbenchQueueCommands } from "@/ui/workbench-queue/contracts";
import {
	answering,
	commandIntent,
	FakeQueueTransport,
	FakeTransportError,
	queue,
	snapshot,
	submission,
	throwing,
	type FakeQueueTransportOptions,
} from "@/ui/workbench-queue/tests/support";

const TARGET = commandIntent();
const SEEDS = [{ id: "s1" }, { id: "s2" }] as const;

/**
 * A double and the commands over it.
 * @param options How the double behaves.
 * @returns Both.
 */
function transportWith(options: FakeQueueTransportOptions = {}): {
	fake: FakeQueueTransport;
	commands: WorkbenchQueueCommands;
} {
	const fake = new FakeQueueTransport(options);
	return { fake, commands: createWorkbenchQueueCommands(fake.asTransport()) };
}

/**
 * The exact wire drafts the module sent.
 * @param fake The double.
 * @returns The drafts.
 */
function drafts(
	fake: FakeQueueTransport,
): readonly FakeQueueTransport["commands"][number]["draft"][] {
	return fake.commands.map((record) => record.draft);
}

describe("workbench queue commands", () => {
	test("emits exactly the five gateway queue commands, each on its captured target", async () => {
		const { fake, commands } = transportWith();

		await commands.add("do the thing", TARGET);
		await commands.edit(submission("s1"), "do it better", TARGET);
		await commands.cancel(submission("s1"), TARGET);
		await commands.reorder([submission("s2"), submission("s1")], TARGET, submission("s2"));
		await commands.start(submission("s2"), TARGET);

		expect(drafts(fake)).toEqual([
			{ command: "queueAdd", prompt: "do the thing" },
			{ command: "queueUpdate", submissionId: submission("s1"), prompt: "do it better" },
			{ command: "queueDelete", submissionId: submission("s1") },
			{ command: "queueReorder", orderedSubmissionIds: [submission("s2"), submission("s1")] },
			{ command: "queueStart", submissionId: submission("s2") },
		]);
		for (const record of fake.commands) {
			expect(record.target).toBe(TARGET);
		}
		expect(fake.refreshes).toBe(0);
	});

	test("List refreshes the authoritative snapshot and sends no queue command", async () => {
		const { fake, commands } = transportWith();

		const settlement = await commands.list();

		expect(fake.refreshes).toBe(1);
		expect(fake.commands).toEqual([]);
		expect(settlement).toEqual({
			control: "list",
			state: "reconciled",
			code: null,
			message: "The host re-read and republished the authoritative queue for this thread link.",
			submissionId: null,
		});
	});

	test("submits every ordered id the caller planned, unchanged", async () => {
		const { fake, commands } = transportWith();
		const ordered = [submission("s2"), submission("s1"), submission("s3")];

		await commands.reorder(ordered, TARGET, submission("s2"));

		expect(drafts(fake)).toEqual([{ command: "queueReorder", orderedSubmissionIds: ordered }]);
	});
});

describe("workbench queue settlement", () => {
	const value = snapshot({ queue: queue("queued", SEEDS) });

	test("reads success only from an authoritative delivered result", async () => {
		const { commands } = transportWith({ onCommand: answering(value) });

		expect(await commands.start(submission("s1"), TARGET)).toEqual({
			control: "start",
			state: "reconciled",
			code: null,
			message: "The host started the queued submission and republished the queue.",
			submissionId: submission("s1"),
		});
	});

	test("keeps a refusal a refusal, with the gateway's own code and message", async () => {
		const { commands } = transportWith({
			onCommand: answering(value, {
				outcome: "not_delivered",
				code: "link_changed",
				message: "The workbench queue no longer belongs to the captured thread link.",
			}),
		});

		expect(await commands.cancel(submission("s1"), TARGET)).toEqual({
			control: "cancel",
			state: "refused",
			code: "link_changed",
			message: "The workbench queue no longer belongs to the captured thread link.",
			submissionId: submission("s1"),
		});
	});

	test("keeps a lost outcome uncertain rather than reporting success or refusal", async () => {
		const { commands } = transportWith({
			onCommand: answering(value, { outcome: "outcome_unknown", code: "outcome_unknown" }),
		});

		expect(await commands.edit(submission("s1"), "next", TARGET)).toMatchObject({
			control: "edit",
			state: "outcome_unknown",
			code: "outcome_unknown",
			message:
				"The edit command's outcome was lost; the queued prompt may or may not have changed.",
		});
	});

	test("maps a thrown transport refusal and a thrown lost response apart", async () => {
		const refused = transportWith({
			onCommand: throwing(
				new FakeTransportError(
					"invalid_command",
					"The queued submission is no longer in the captured workbench queue.",
				),
			),
		});
		const unknown = transportWith({
			onCommand: throwing(
				new FakeTransportError("response_lost", "The response was lost.", "outcome_unknown"),
			),
		});

		expect(await refused.commands.start(submission("gone"), TARGET)).toMatchObject({
			state: "refused",
			code: "invalid_command",
			message: "The queued submission is no longer in the captured workbench queue.",
		});
		expect(await unknown.commands.start(submission("s1"), TARGET)).toMatchObject({
			state: "outcome_unknown",
			code: "response_lost",
		});
	});

	test("a thrown error that is not the transport's is a refusal with no code", async () => {
		const { commands } = transportWith({ onCommand: throwing(new Error("socket exploded")) });

		expect(await commands.start(submission("s1"), TARGET)).toMatchObject({
			state: "refused",
			code: null,
			message: "socket exploded",
		});
	});

	test("settles a failed refresh without claiming the queue on screen is current", async () => {
		const { commands } = transportWith({
			refreshFailure: new FakeTransportError(
				"socket_unavailable",
				"The Codex workbench has no active socket.",
			),
		});

		expect(await commands.list()).toMatchObject({
			control: "list",
			state: "refused",
			code: "socket_unavailable",
		});
	});
});

describe("workbench queue target capture", () => {
	test("captures the target the queue was rendered for", () => {
		const fake = new FakeQueueTransport();

		expect(captureWorkbenchQueueTarget(fake.asTransport())).toEqual({
			captured: true,
			target: TARGET,
		});
	});

	test("turns a missing lease into a disabled-control reason, not a thrown error", () => {
		const fake = new FakeQueueTransport({
			captureFailure: new FakeTransportError(
				"lease_required",
				"A browser command lease is required.",
			),
		});

		expect(captureWorkbenchQueueTarget(fake.asTransport())).toEqual({
			captured: false,
			reason: "A browser command lease is required.",
		});
	});
});
