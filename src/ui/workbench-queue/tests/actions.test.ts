import { describe, expect, test } from "bun:test";

import { BrowserWorkbenchTransportError } from "../../workbench-transport/index.js";
import { captureWorkbenchQueueTarget, createWorkbenchQueueActions } from "../adapter.ts";
import type { WorkbenchQueueTransport } from "../contract.ts";
import {
	commandResult,
	commandTarget,
	FakeQueueTransport,
	queue,
	snapshot,
	submission,
} from "./support.ts";

const TARGET = commandTarget();
const SEEDS = [{ id: "s1" }, { id: "s2" }] as const;

function transportWith(options: ConstructorParameters<typeof FakeQueueTransport>[0] = {}) {
	const fake = new FakeQueueTransport(options);
	return { fake, actions: createWorkbenchQueueActions(fake.asTransport()) };
}

/** The exact wire drafts the module sent, with no envelope noise. */
function drafts(fake: FakeQueueTransport): readonly Record<string, unknown>[] {
	return fake.commands.map((record) => record.draft as unknown as Record<string, unknown>);
}

describe("workbench queue commands", () => {
	test("emits exactly the five gateway queue commands, each on its captured target", async () => {
		const { fake, actions } = transportWith();

		await actions.add("do the thing", TARGET);
		await actions.edit(submission("s1"), "do it better", TARGET);
		await actions.cancel(submission("s1"), TARGET);
		await actions.reorder([submission("s2"), submission("s1")], TARGET, submission("s2"));
		await actions.start(submission("s2"), TARGET);

		expect(drafts(fake)).toEqual([
			{ command: "queueAdd", prompt: "do the thing" },
			{ command: "queueUpdate", submissionId: submission("s1"), prompt: "do it better" },
			{ command: "queueDelete", submissionId: submission("s1") },
			{ command: "queueReorder", orderedSubmissionIds: [submission("s2"), submission("s1")] },
			{ command: "queueStart", submissionId: submission("s2") },
		]);
		for (const record of fake.commands) expect(record.target).toBe(TARGET);
		expect(fake.refreshes).toBe(0);
	});

	test("Edit is queue update and Cancel is queue delete", async () => {
		const { fake, actions } = transportWith();

		await actions.edit(submission("s1"), "next", TARGET);
		await actions.cancel(submission("s1"), TARGET);

		expect(drafts(fake).map((draft) => draft.command)).toEqual(["queueUpdate", "queueDelete"]);
	});

	test("List refreshes the authoritative snapshot and sends no queue command", async () => {
		const { fake, actions } = transportWith();

		const settlement = await actions.list();

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
		const { fake, actions } = transportWith();
		const ordered = [submission("s2"), submission("s1"), submission("s3")];

		await actions.reorder(ordered, TARGET, submission("s2"));

		expect(drafts(fake)).toEqual([{ command: "queueReorder", orderedSubmissionIds: ordered }]);
	});
});

describe("workbench queue settlement", () => {
	test("reads success only from an authoritative delivered result", async () => {
		const value = snapshot({ queue: queue("queued", SEEDS) });
		const { actions } = transportWith({ onCommand: () => commandResult(value) });

		const settlement = await actions.start(submission("s1"), TARGET);

		expect(settlement).toEqual({
			control: "start",
			state: "reconciled",
			code: null,
			message: "The host started the queued submission and republished the queue.",
			submissionId: submission("s1"),
		});
	});

	test("keeps a refusal a refusal, with the gateway's own code and message", async () => {
		const value = snapshot({ queue: queue("queued", SEEDS) });
		const { actions } = transportWith({
			onCommand: () =>
				commandResult(value, {
					outcome: "not_delivered",
					code: "link_changed",
					message: "The workbench queue no longer belongs to the captured thread link.",
				}),
		});

		expect(await actions.cancel(submission("s1"), TARGET)).toEqual({
			control: "cancel",
			state: "refused",
			code: "link_changed",
			message: "The workbench queue no longer belongs to the captured thread link.",
			submissionId: submission("s1"),
		});
	});

	test("keeps a lost outcome uncertain rather than reporting success or refusal", async () => {
		const value = snapshot({ queue: queue("queued", SEEDS) });
		const { actions } = transportWith({
			onCommand: () =>
				commandResult(value, { outcome: "outcome_unknown", code: "outcome_unknown" }),
		});

		expect(await actions.edit(submission("s1"), "next", TARGET)).toMatchObject({
			control: "edit",
			state: "outcome_unknown",
			code: "outcome_unknown",
			message:
				"The edit command's outcome was lost; the queued prompt may or may not have changed.",
		});
	});

	test("maps a thrown transport refusal and a thrown lost response apart", async () => {
		const refused = transportWith({
			onCommand: () => {
				throw new BrowserWorkbenchTransportError(
					"invalid_command",
					"The queued submission is no longer in the captured workbench queue.",
				);
			},
		});
		const unknown = transportWith({
			onCommand: () => {
				throw new BrowserWorkbenchTransportError("response_lost", "The response was lost.", {
					outcome: "outcome_unknown",
				});
			},
		});

		expect(await refused.actions.start(submission("gone"), TARGET)).toMatchObject({
			state: "refused",
			code: "invalid_command",
			message: "The queued submission is no longer in the captured workbench queue.",
		});
		expect(await unknown.actions.start(submission("s1"), TARGET)).toMatchObject({
			state: "outcome_unknown",
			code: "response_lost",
		});
	});

	test("settles a failed refresh without claiming the queue on screen is current", async () => {
		const { actions } = transportWith({
			onRefresh: () =>
				Promise.reject(
					new BrowserWorkbenchTransportError(
						"socket_unavailable",
						"The Codex workbench has no active socket.",
					),
				),
		});

		expect(await actions.list()).toMatchObject({
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
		const transport: WorkbenchQueueTransport = {
			...new FakeQueueTransport().asTransport(),
			captureCommandTarget: () => {
				throw new BrowserWorkbenchTransportError(
					"lease_required",
					"A browser command lease is required.",
				);
			},
		};

		expect(captureWorkbenchQueueTarget(transport)).toEqual({
			captured: false,
			reason: "A browser command lease is required.",
		});
	});
});
