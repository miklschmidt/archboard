import { afterEach, describe, expect, test } from "bun:test";

import {
	click,
	CROSS_LINKS,
	control,
	dragTo,
	element,
	elements,
	mountQueue,
	press,
	publish,
	renderedOrder,
	rowFor,
	type MountedQueue,
} from "./mounted-support.ts";
import {
	commandResult,
	connected,
	executableLink,
	FakeQueueTransport,
	queue,
	snapshot,
	type EPOCH,
} from "./support.ts";

const SEEDS = [{ id: "s1" }, { id: "s2", operationId: null }, { id: "s3" }] as const;

let mounted: MountedQueue | null = null;

afterEach(async () => {
	await mounted?.close();
	mounted = null;
});

async function mountWith(
	options: ConstructorParameters<typeof FakeQueueTransport>[0] = {},
): Promise<{ readonly fake: FakeQueueTransport; readonly view: MountedQueue }> {
	const fake = new FakeQueueTransport({
		state: connected(snapshot({ queue: queue("queued", SEEDS) })),
		...options,
	});
	const view = await mountQueue(fake);
	mounted = view;
	return { fake, view };
}

function draftAt(fake: FakeQueueTransport, index: number): Record<string, unknown> {
	const record = fake.commands[index];
	if (record === undefined) throw new Error(`No command was sent at ${index}`);
	return record.draft as unknown as Record<string, unknown>;
}

describe("rendered workbench queue", () => {
	test("draws the authoritative order with labels, ownership and cross-links", async () => {
		const { view } = await mountWith();

		expect(renderedOrder(view.container)).toEqual(["s1", "s2", "s3"]);
		expect(element(view.container, "data-workbench-queue").getAttribute("data-queue-state")).toBe(
			"queued",
		);
		expect(
			elements(view.container, "data-queue-entry").map((row) =>
				row.getAttribute("data-queue-ownership"),
			),
		).toEqual(["coordinator", "foreign", "coordinator"]);
		expect(rowFor(view.container, "s1").textContent).toContain("Coordinator submission 1 of 3");
		expect(
			elements(view.container, "data-queue-cross-link").map((link) => link.getAttribute("href")),
		).toEqual([
			`#${CROSS_LINKS.workhorseTimelineId}`,
			`#${CROSS_LINKS.coordinatorDisclosureId}`,
			`#${CROSS_LINKS.approvalsId}`,
			`#${CROSS_LINKS.coordinatorDisclosureId}`,
			`#${CROSS_LINKS.coordinatorDisclosureId}`,
		]);
	});

	test("offers exactly the six named controls and no other queue control", async () => {
		const { view } = await mountWith();

		const named = new Set(
			elements(view.container, "data-queue-control").map((node) =>
				node.getAttribute("data-queue-control"),
			),
		);
		expect([...named].toSorted()).toEqual(["add", "cancel", "edit", "list", "reorder", "start"]);
	});

	test("labels every control and states why a disabled one is disabled", async () => {
		const { view } = await mountWith();
		const foreign = rowFor(view.container, "s2");

		expect(control(foreign, "reorder", "earlier").getAttribute("aria-label")).toBe(
			"Move submission 2 earlier",
		);
		expect(control(foreign, "reorder", "earlier").getAttribute("title")).toBe(
			"Only a submission this coordinator queued can be reordered.",
		);
		expect(control(foreign, "reorder", "earlier").getAttribute("aria-disabled")).toBe("true");
		expect(element(foreign, "data-queue-entry-reasons").textContent).toContain(
			"Only a submission this coordinator queued can be reordered.",
		);
	});
});

describe("workbench queue commands from the rendered region", () => {
	test("Edit sends queue update and Cancel sends queue delete for that row", async () => {
		const { fake, view } = await mountWith();
		const row = rowFor(view.container, "s1");

		await click(control(row, "edit"));
		await click(control(row, "cancel"));

		expect(draftAt(fake, 0)).toEqual({
			command: "queueUpdate",
			submissionId: "s1",
			prompt: "Prompt for s1",
		});
		expect(draftAt(fake, 1)).toEqual({ command: "queueDelete", submissionId: "s1" });
	});

	test("Add sends queue add on its captured target and clears the composed prompt", async () => {
		const { fake, view } = await mountWith();
		const field = element(view.container, "data-queue-add-prompt");
		field.value = "queue the migration";

		await click(element(view.container, "data-queue-control", "add"));

		expect(draftAt(fake, 0)).toEqual({ command: "queueAdd", prompt: "queue the migration" });
		// queueAdd names no thread and no submission, so the captured target is the
		// only thing that keeps it on the link it was composed against.
		expect(fake.commands[0]?.target).toMatchObject({ childId: "child-a", epoch: "epoch-a" });
		expect(element(view.container, "data-queue-add-prompt").value).toBe("");
	});

	test("Add sends nothing when nothing was composed", async () => {
		const { fake, view } = await mountWith();

		await click(element(view.container, "data-queue-control", "add"));

		expect(fake.commands).toEqual([]);
	});

	test("Start sends queue start and Refresh reads the snapshot without a command", async () => {
		const { fake, view } = await mountWith();

		await click(control(rowFor(view.container, "s3"), "start"));
		await click(element(view.container, "data-queue-control", "list"));

		expect(draftAt(fake, 0)).toEqual({ command: "queueStart", submissionId: "s3" });
		expect(fake.commands).toHaveLength(1);
		expect(fake.refreshes).toBe(1);
	});

	test("every command names the target captured for the queue on screen", async () => {
		const { fake, view } = await mountWith();

		await click(control(rowFor(view.container, "s1"), "cancel"));

		expect(fake.commands[0]?.target).toMatchObject({
			commandId: "command-a",
			childId: "child-a",
			epoch: "epoch-a",
		});
	});
});

describe("workbench queue reorder from the rendered region", () => {
	test("a keyboard move submits every id and keeps focus on the moved row", async () => {
		const { fake, view } = await mountWith();
		const button = control(rowFor(view.container, "s1"), "reorder", "later");

		await press(button, "ArrowDown");

		expect(draftAt(fake, 0)).toEqual({
			command: "queueReorder",
			orderedSubmissionIds: ["s3", "s2", "s1"],
		});
		expect(view.container.ownerDocument.activeElement?.getAttribute("aria-label")).toBe(
			"Move submission 1 later",
		);
	});

	test("clicking a move control is the same reorder as the keyboard path", async () => {
		const { fake, view } = await mountWith();

		await click(control(rowFor(view.container, "s3"), "reorder", "earlier"));

		expect(draftAt(fake, 0)).toEqual({
			command: "queueReorder",
			orderedSubmissionIds: ["s3", "s2", "s1"],
		});
	});

	test("a pointer drag submits every id and moves only the coordinator entries", async () => {
		const { fake, view } = await mountWith();

		await dragTo(
			element(view.container, "data-queue-drag-surface", "s3"),
			element(view.container, "data-queue-drag-surface", "s1"),
		);

		expect(draftAt(fake, 0)).toEqual({
			command: "queueReorder",
			orderedSubmissionIds: ["s3", "s2", "s1"],
		});
	});

	test("dragging a foreign entry is refused with its reason and sends nothing", async () => {
		const { fake, view } = await mountWith();

		await dragTo(
			element(view.container, "data-queue-drag-surface", "s2"),
			element(view.container, "data-queue-drag-surface", "s1"),
		);

		expect(fake.commands).toEqual([]);
		expect(element(view.container, "data-queue-settlement").textContent).toBe(
			"Only a submission this coordinator queued can be reordered.",
		);
	});
});

describe("workbench queue reconciliation", () => {
	test("shows the host's order, never the requested one, until the host republishes", async () => {
		const reordered = snapshot({
			queue: queue("queued", [{ id: "s3" }, { id: "s2", operationId: null }, { id: "s1" }]),
		});
		const { fake, view } = await mountWith({
			onCommand: () =>
				commandResult(reordered, {
					outcome: "not_delivered",
					code: "command_failed",
					message: "The host refused the reorder.",
				}),
		});

		await click(control(rowFor(view.container, "s1"), "reorder", "later"));

		expect(draftAt(fake, 0)).toMatchObject({ command: "queueReorder" });
		expect(renderedOrder(view.container)).toEqual(["s1", "s2", "s3"]);
		expect(
			element(view.container, "data-queue-settlement").getAttribute("data-queue-settlement"),
		).toBe("refused");
		expect(element(view.container, "data-queue-settlement").textContent).toBe(
			"The host refused the reorder.",
		);
	});

	test("re-renders in the host's new order once the authoritative snapshot arrives", async () => {
		const { fake, view } = await mountWith();

		await click(control(rowFor(view.container, "s1"), "reorder", "later"));
		await publish(
			fake,
			connected(
				snapshot({
					queue: queue("queued", [{ id: "s3" }, { id: "s2", operationId: null }, { id: "s1" }]),
				}),
				5,
			),
		);

		expect(renderedOrder(view.container)).toEqual(["s3", "s2", "s1"]);
		expect(
			element(view.container, "data-queue-settlement").getAttribute("data-queue-settlement"),
		).toBe("reconciled");
	});

	test("a lost outcome puts the whole region in uncertainty until it is refreshed", async () => {
		const { fake, view } = await mountWith({
			onCommand: () =>
				commandResult(snapshot({ queue: queue("queued", SEEDS) }), {
					outcome: "outcome_unknown",
					code: "outcome_unknown",
				}),
		});

		await click(control(rowFor(view.container, "s1"), "cancel"));

		expect(renderedOrder(view.container)).toEqual(["s1", "s2", "s3"]);
		expect(element(view.container, "data-workbench-queue").getAttribute("data-queue-state")).toBe(
			"outcome_unknown",
		);
		expect(control(rowFor(view.container, "s1"), "cancel").getAttribute("aria-disabled")).toBe(
			"true",
		);
		expect(
			element(view.container, "data-queue-control", "list").getAttribute("aria-disabled"),
		).toBe("false");
		expect(fake.commands).toHaveLength(1);
	});
});

describe("workbench queue recovery from the rendered region", () => {
	test("a replaced child reads as a restart until the list is refreshed", async () => {
		const { fake, view } = await mountWith();

		await publish(
			fake,
			connected(
				snapshot({
					queue: queue("queued", SEEDS),
					threadLink: executableLink({
						epoch: "epoch-b" as typeof EPOCH,
					}),
				}),
				6,
			),
		);

		expect(element(view.container, "data-workbench-queue").getAttribute("data-queue-state")).toBe(
			"restarted",
		);
		expect(control(rowFor(view.container, "s1"), "start").getAttribute("aria-disabled")).toBe(
			"true",
		);

		await click(element(view.container, "data-queue-control", "list"));

		expect(element(view.container, "data-workbench-queue").getAttribute("data-queue-state")).toBe(
			"queued",
		);
		expect(fake.refreshes).toBe(1);
		expect(fake.commands).toEqual([]);
	});

	test("a stale stream snapshot holds every command but keeps refresh reachable", async () => {
		const { fake, view } = await mountWith();

		await publish(fake, {
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: snapshot({ queue: queue("queued", SEEDS) }),
			sequence: 4,
			expectedSequence: 5,
			receivedSequence: 9,
			reason: "The workbench delta skipped a sequence.",
		});

		expect(element(view.container, "data-workbench-queue").getAttribute("data-queue-state")).toBe(
			"stale",
		);
		await click(control(rowFor(view.container, "s1"), "cancel"));
		expect(fake.commands).toEqual([]);
		expect(
			element(view.container, "data-queue-control", "list").getAttribute("aria-disabled"),
		).toBe("false");
	});
});
