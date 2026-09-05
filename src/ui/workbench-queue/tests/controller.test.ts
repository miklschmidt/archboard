// The behaviour the archived mounted-queue owner asserted through the old
// region, re-targeted at the controller that now feeds the committed queue
// panel: the host's order until the host republishes, refusals that never
// reach the wire, uncertainty that only a refresh clears, a replaced child
// read as a restart, and the panel's actions mapped onto exact wire drafts.

import { describe, expect, test } from "bun:test";

import { createWorkbenchQueueController } from "@/ui/workbench-queue";
import type { WorkbenchQueueController } from "@/ui/workbench-queue";
import {
	CHILD_ID,
	FakeQueueTransport,
	FakeTransportError,
	OTHER_EPOCH,
	answering,
	connected,
	executableLink,
	gated,
	nameOf,
	queue,
	snapshot,
	submission,
	type FakeQueueTransportOptions,
} from "@/ui/workbench-queue/tests/support";

const SEEDS = [{ id: "s1" }, { id: "s2", owned: false }, { id: "s3" }] as const;

/**
 * A double holding a queued snapshot, and a controller over it.
 * @param options How the double behaves.
 * @returns Both.
 */
function controllerWith(options: FakeQueueTransportOptions = {}): {
	fake: FakeQueueTransport;
	controller: WorkbenchQueueController;
} {
	const fake = new FakeQueueTransport({
		state: connected(snapshot({ queue: queue("queued", SEEDS) })),
		...options,
	});
	return { fake, controller: createWorkbenchQueueController(fake.asTransport()) };
}

/**
 * The submission names the view presents, in the order it draws them.
 * @param controller The controller.
 * @returns The names.
 */
function renderedOrder(controller: WorkbenchQueueController): string[] {
	return controller.view().entries.map((entryView) => nameOf(entryView.submissionId));
}

/**
 * Let every queued task run.
 * @returns After the task queue drains.
 */
function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

/**
 * Keep the controller observing its transport.
 * @param controller The controller.
 */
function observe(controller: WorkbenchQueueController): void {
	controller.subscribe(() => undefined);
}

describe("queue controller commands", () => {
	test("maps the panel's actions onto exact wire drafts against the captured target", async () => {
		const { fake, controller } = controllerWith();

		controller.panelActions.moveDown(String(submission("s1")));
		await settle();
		controller.panelActions.sendNow(String(submission("s3")));
		await settle();
		controller.panelActions.remove(String(submission("s2")));
		await settle();

		expect(fake.commands.map((record) => record.draft)).toEqual([
			{
				command: "queueReorder",
				orderedSubmissionIds: [submission("s3"), submission("s2"), submission("s1")],
			},
			{ command: "queueStart", submissionId: submission("s3") },
			{ command: "queueDelete", submissionId: submission("s2") },
		]);
		for (const record of fake.commands) {
			expect(record.target).toMatchObject({
				authority: { childId: CHILD_ID },
				capturedThreadLink: executableLink(),
			});
		}
	});

	test("refuses a panel action naming a submission the host is not holding", async () => {
		const { fake, controller } = controllerWith();

		controller.panelActions.sendNow("gone");
		await settle();

		expect(fake.commands).toEqual([]);
		expect(controller.commandState().settlement).toMatchObject({
			control: "start",
			state: "refused",
			message: "That submission is not in the authoritative queue.",
		});
	});

	test("Add sends queue add on its captured target; Edit sends queue update", async () => {
		const { fake, controller } = controllerWith();

		await controller.add("queue the migration");
		await controller.edit(submission("s1"), "do it better");

		expect(fake.commands.map((record) => record.draft)).toEqual([
			{ command: "queueAdd", prompt: "queue the migration" },
			{ command: "queueUpdate", submissionId: submission("s1"), prompt: "do it better" },
		]);
	});

	test("holds every control while a command is in flight and publishes the settlement", async () => {
		const gate = Promise.withResolvers<void>();
		const { controller } = controllerWith({
			onCommand: gated(gate.promise, snapshot({ queue: queue("queued", SEEDS) })),
		});
		const states: string[] = [];
		controller.subscribe(() => {
			states.push(controller.view().pending === null ? "settled" : "pending");
		});

		const started = controller.start(submission("s1"));
		expect(controller.view().pending).toEqual({ control: "start", submissionId: submission("s1") });
		expect(controller.view().add.reason).toContain("A start command is in flight");
		gate.resolve();
		await started;

		expect(controller.view().pending).toBeNull();
		expect(controller.view().settlement).toMatchObject({ control: "start", state: "reconciled" });
		expect(states).toEqual(["pending", "settled"]);
	});

	test("a missing command target refuses the command with the capture reason", async () => {
		const { fake, controller } = controllerWith({
			captureFailure: new FakeTransportError(
				"lease_required",
				"A browser command lease is required.",
			),
		});

		const settled = await controller.start(submission("s1"));

		expect(fake.commands).toEqual([]);
		expect(settled).toMatchObject({
			state: "refused",
			message: "A browser command lease is required.",
		});
		expect(controller.view().add.reason).toBe("A browser command lease is required.");
	});
});

describe("queue controller reorder", () => {
	test("a move of a foreign entry is refused with its reason and sends nothing", async () => {
		const { fake, controller } = controllerWith();

		await controller.move(submission("s2"), { kind: "step", direction: "earlier" });

		expect(fake.commands).toEqual([]);
		expect(controller.commandState().settlement).toMatchObject({
			control: "reorder",
			state: "refused",
			message: "Only a submission this coordinator queued can be reordered.",
		});
	});

	test("shows the host's order, never the requested one, until the host republishes", async () => {
		const { fake, controller } = controllerWith({
			onCommand: answering(snapshot({ queue: queue("queued", SEEDS) }), {
				outcome: "not_delivered",
				code: "command_failed",
				message: "The host refused the reorder.",
			}),
		});

		await controller.move(submission("s1"), { kind: "drop", position: 4 });

		expect(fake.commands[0]?.draft).toMatchObject({ command: "queueReorder" });
		expect(renderedOrder(controller)).toEqual(["s1", "s2", "s3"]);
		expect(controller.view().settlement?.message).toBe("The host refused the reorder.");
	});

	test("re-renders in the host's new order once the authoritative snapshot arrives", async () => {
		const { fake, controller } = controllerWith();
		observe(controller);

		await controller.move(submission("s1"), { kind: "drop", position: 4 });
		expect(renderedOrder(controller)).toEqual(["s1", "s2", "s3"]);
		fake.publish(
			connected(
				snapshot({
					queue: queue("queued", [{ id: "s3" }, { id: "s2", owned: false }, { id: "s1" }]),
				}),
				5,
			),
		);

		expect(renderedOrder(controller)).toEqual(["s3", "s2", "s1"]);
		expect(controller.view().settlement?.state).toBe("reconciled");
	});
});

describe("queue controller recovery", () => {
	test("a lost outcome puts the whole region in uncertainty until it is refreshed", async () => {
		const { fake, controller } = controllerWith({
			onCommand: answering(snapshot({ queue: queue("queued", SEEDS) }), {
				outcome: "outcome_unknown",
				code: "outcome_unknown",
			}),
		});
		observe(controller);

		await controller.cancel(submission("s1"));
		expect(controller.view().state).toBe("outcome_unknown");
		expect(renderedOrder(controller)).toEqual(["s1", "s2", "s3"]);
		expect(controller.view().entries[0]?.start.enabled).toBe(false);
		expect(controller.view().list.enabled).toBe(true);

		await controller.list();

		expect(fake.refreshes).toBe(1);
		expect(controller.view().state).toBe("queued");
		expect(controller.view().entries[0]?.start.enabled).toBe(true);
		expect(controller.view().settlement?.message).toContain("re-read and republished");
	});

	test("a replaced child reads as a restart until the list is refreshed", async () => {
		const replaced = connected(
			snapshot({
				queue: queue("queued", SEEDS),
				threadLink: executableLink({ epoch: OTHER_EPOCH }),
			}),
			5,
		);
		const { fake, controller } = controllerWith({ refreshPublishes: replaced });
		observe(controller);

		fake.publish(replaced);
		expect(controller.view().state).toBe("restarted");
		expect(controller.view().add.enabled).toBe(false);

		await controller.list();

		expect(controller.view().state).toBe("queued");
		expect(fake.refreshes).toBe(1);
		expect(fake.commands).toEqual([]);
	});

	test("a stale stream snapshot holds every command but keeps refresh reachable", async () => {
		const { fake, controller } = controllerWith();
		observe(controller);

		fake.publish({
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: snapshot({ queue: queue("queued", SEEDS) }),
			sequence: 4,
			expectedSequence: 5,
			receivedSequence: 9,
			reason: "The workbench stream skipped a sequence.",
		});

		expect(controller.view().state).toBe("stale");
		expect(controller.view().entries.every((entryView) => !entryView.start.enabled)).toBe(true);
		expect(controller.view().list.enabled).toBe(true);
		await settle();
		expect(fake.commands).toEqual([]);
	});
});
