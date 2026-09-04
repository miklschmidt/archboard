import { afterAll, afterEach, describe, expect, test } from "bun:test";

import {
	CROSS_LINKS,
	dragTo,
	element,
	elements,
	interactives,
	mountQueue,
	named,
	promptField,
	publish,
	renderedOrder,
	rowFor,
	settlementText,
	ui,
	unregisterHappyDom,
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

afterEach(() => ui.cleanup());
afterAll(unregisterHappyDom);

function mountWith(options: ConstructorParameters<typeof FakeQueueTransport>[0] = {}): {
	readonly fake: FakeQueueTransport;
	readonly view: MountedQueue;
} {
	const fake = new FakeQueueTransport({
		state: connected(snapshot({ queue: queue("queued", SEEDS) })),
		...options,
	});
	return { fake, view: mountQueue(fake) };
}

function draftAt(fake: FakeQueueTransport, index: number): Record<string, unknown> {
	const record = fake.commands[index];
	if (record === undefined) throw new Error(`No command was sent at ${index}`);
	return record.draft as unknown as Record<string, unknown>;
}

function region(view: MountedQueue): HTMLElement {
	return element(view.container, "data-workbench-queue");
}

describe("rendered workbench queue", () => {
	test("draws the authoritative order with labels, ownership and cross-links", () => {
		const { view } = mountWith();

		expect(renderedOrder(view.container)).toEqual(["s1", "s2", "s3"]);
		expect(region(view).getAttribute("data-queue-state")).toBe("queued");
		expect(
			elements(view.container, "data-queue-entry").map((row) =>
				row.getAttribute("data-queue-ownership"),
			),
		).toEqual(["coordinator", "foreign", "coordinator"]);
		expect(ui.screen.getByRole("heading", { name: "Workhorse queue" })).toBeDefined();
		expect(
			ui.screen.getByRole("listitem", { name: /Coordinator submission 1 of 3/ }),
		).toBeDefined();
		expect(ui.screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
			`#${CROSS_LINKS.workhorseTimelineId}`,
			`#${CROSS_LINKS.coordinatorDisclosureId}`,
			`#${CROSS_LINKS.approvalsId}`,
			`#${CROSS_LINKS.coordinatorDisclosureId}`,
			`#${CROSS_LINKS.coordinatorDisclosureId}`,
		]);
	});

	test("offers exactly the six named controls and no other interactive element", () => {
		const { view } = mountWith();

		const declared = new Set(
			elements(view.container, "data-queue-control").map((node) =>
				node.getAttribute("data-queue-control"),
			),
		);
		expect([...declared].toSorted()).toEqual(["add", "cancel", "edit", "list", "reorder", "start"]);

		// Every interactive element in the region is one of the six controls, a
		// prompt field, or a cross-link — nothing else can be reached or activated.
		const other = interactives(view.container).filter(
			(node) => node.getAttribute("data-queue-control") === null,
		);
		expect(
			other.map((node) =>
				node.tagName === "A" ? `link:${node.getAttribute("data-queue-cross-link")}` : node.tagName,
			),
		).toEqual([
			"link:workhorse-timeline",
			"link:coordinator",
			"link:approvals",
			"TEXTAREA",
			"TEXTAREA",
			"link:coordinator-operation",
			"TEXTAREA",
			"TEXTAREA",
			"link:coordinator-operation",
		]);
	});

	test("labels every control and states why a disabled one is disabled", () => {
		const { view } = mountWith();
		const foreign = rowFor(view.container, "s2");
		const move = named(foreign, "Move submission 2 earlier");

		expect(move.getAttribute("title")).toBe(
			"Only a submission this coordinator queued can be reordered.",
		);
		expect(move.getAttribute("aria-disabled")).toBe("true");
		expect(element(foreign, "data-queue-entry-reasons").textContent).toContain(
			"Only a submission this coordinator queued can be reordered.",
		);
		// Ownership gates reordering alone; the row says so rather than leaving the
		// other three controls looking unexplained.
		expect(named(foreign, "Edit submission 2").getAttribute("aria-disabled")).toBe("false");
		expect(element(foreign, "data-queue-correlation").textContent).toContain(
			"This pane can still edit, cancel or start it; only submissions this coordinator queued can be reordered.",
		);
	});
});

describe("workbench queue commands from the rendered region", () => {
	test("Edit sends queue update and Cancel sends queue delete for that row", async () => {
		const { fake, view } = mountWith();
		const row = rowFor(view.container, "s1");

		await view.user.click(named(row, "Edit submission 1"));
		await view.user.click(named(row, "Cancel submission 1"));

		expect(draftAt(fake, 0)).toEqual({
			command: "queueUpdate",
			submissionId: "s1",
			prompt: "Prompt for s1",
		});
		expect(draftAt(fake, 1)).toEqual({ command: "queueDelete", submissionId: "s1" });
	});

	test("Add sends queue add on its captured target and clears the composed prompt", async () => {
		const { fake, view } = mountWith();
		const field = promptField(view.container, "Add a submission to the linked workhorse queue");

		await view.user.type(field, "queue the migration");
		await view.user.click(named(view.container, "Add"));

		expect(draftAt(fake, 0)).toEqual({ command: "queueAdd", prompt: "queue the migration" });
		// queueAdd names no thread and no submission, so the captured target is the
		// only thing that keeps it on the link it was composed against.
		expect(fake.commands[0]?.target).toMatchObject({ childId: "child-a", epoch: "epoch-a" });
		expect(
			promptField(view.container, "Add a submission to the linked workhorse queue").value,
		).toBe("");
	});

	test("Add sends nothing when nothing was composed", async () => {
		const { fake, view } = mountWith();

		await view.user.click(named(view.container, "Add"));

		expect(fake.commands).toEqual([]);
	});

	test("Start sends queue start and Refresh reads the snapshot without a command", async () => {
		const { fake, view } = mountWith();

		await view.user.click(named(rowFor(view.container, "s3"), "Start submission 3"));
		await view.user.click(named(view.container, "Refresh list"));

		expect(draftAt(fake, 0)).toEqual({ command: "queueStart", submissionId: "s3" });
		expect(fake.commands).toHaveLength(1);
		expect(fake.refreshes).toBe(1);
	});

	test("every command names the target captured for the queue on screen", async () => {
		const { fake, view } = mountWith();

		await view.user.click(named(rowFor(view.container, "s1"), "Cancel submission 1"));

		expect(fake.commands[0]?.target).toMatchObject({
			commandId: "command-a",
			childId: "child-a",
			epoch: "epoch-a",
		});
	});
});

describe("workbench queue reorder from the rendered region", () => {
	test("a keyboard move submits every id and keeps focus on the moved row", async () => {
		const { fake, view } = mountWith();

		named(rowFor(view.container, "s1"), "Move submission 1 later").focus();
		await view.user.keyboard("{ArrowDown}");

		expect(draftAt(fake, 0)).toEqual({
			command: "queueReorder",
			orderedSubmissionIds: ["s3", "s2", "s1"],
		});
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Move submission 1 later");
	});

	test("clicking a move control is the same reorder as the keyboard path", async () => {
		const { fake, view } = mountWith();

		await view.user.click(named(rowFor(view.container, "s3"), "Move submission 3 earlier"));

		expect(draftAt(fake, 0)).toEqual({
			command: "queueReorder",
			orderedSubmissionIds: ["s3", "s2", "s1"],
		});
	});

	test("a pointer drag submits every id, moves only coordinator entries, and keeps focus", async () => {
		const { fake, view } = mountWith();

		await dragTo(
			element(view.container, "data-queue-drag-surface", "s3"),
			element(view.container, "data-queue-drag-surface", "s1"),
		);

		expect(draftAt(fake, 0)).toEqual({
			command: "queueReorder",
			orderedSubmissionIds: ["s3", "s2", "s1"],
		});
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Move submission 3 earlier");
	});

	test("dropping past the last row moves a submission to the end in one gesture", async () => {
		const { fake, view } = mountWith();

		await dragTo(
			element(view.container, "data-queue-drag-surface", "s1"),
			element(view.container, "data-queue-drop-end"),
		);

		expect(draftAt(fake, 0)).toEqual({
			command: "queueReorder",
			orderedSubmissionIds: ["s3", "s2", "s1"],
		});
	});

	test("dragging a foreign entry is refused with its reason and sends nothing", async () => {
		const { fake, view } = mountWith();

		await dragTo(
			element(view.container, "data-queue-drag-surface", "s2"),
			element(view.container, "data-queue-drag-surface", "s1"),
		);

		expect(fake.commands).toEqual([]);
		expect(settlementText(view.container)).toBe(
			"Only a submission this coordinator queued can be reordered.",
		);
	});
});

describe("workbench queue reconciliation", () => {
	test("shows the host's order, never the requested one, until the host republishes", async () => {
		const reordered = snapshot({
			queue: queue("queued", [{ id: "s3" }, { id: "s2", operationId: null }, { id: "s1" }]),
		});
		const { fake, view } = mountWith({
			onCommand: () =>
				commandResult(reordered, {
					outcome: "not_delivered",
					code: "command_failed",
					message: "The host refused the reorder.",
				}),
		});

		await view.user.click(named(rowFor(view.container, "s1"), "Move submission 1 later"));

		expect(draftAt(fake, 0)).toMatchObject({ command: "queueReorder" });
		expect(renderedOrder(view.container)).toEqual(["s1", "s2", "s3"]);
		expect(
			element(view.container, "data-queue-settlement").getAttribute("data-queue-settlement"),
		).toBe("refused");
		expect(settlementText(view.container)).toBe("The host refused the reorder.");
	});

	test("re-renders in the host's new order once the authoritative snapshot arrives", async () => {
		const { fake, view } = mountWith();

		await view.user.click(named(rowFor(view.container, "s1"), "Move submission 1 later"));
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
		const { fake, view } = mountWith({
			onCommand: () =>
				commandResult(snapshot({ queue: queue("queued", SEEDS) }), {
					outcome: "outcome_unknown",
					code: "outcome_unknown",
				}),
		});

		await view.user.click(named(rowFor(view.container, "s1"), "Cancel submission 1"));

		expect(renderedOrder(view.container)).toEqual(["s1", "s2", "s3"]);
		expect(region(view).getAttribute("data-queue-state")).toBe("outcome_unknown");
		expect(
			named(rowFor(view.container, "s1"), "Cancel submission 1").getAttribute("aria-disabled"),
		).toBe("true");
		expect(named(view.container, "Refresh list").getAttribute("aria-disabled")).toBe("false");
		expect(fake.commands).toHaveLength(1);
	});

	test("refreshing clears a lost outcome and puts every control back in reach", async () => {
		const authoritative = connected(snapshot({ queue: queue("queued", SEEDS) }), 9);
		const { fake, view } = mountWith({
			onCommand: () =>
				commandResult(snapshot({ queue: queue("queued", SEEDS) }), {
					outcome: "outcome_unknown",
					code: "outcome_unknown",
				}),
			refreshPublishes: () => authoritative,
		});

		await view.user.click(named(rowFor(view.container, "s1"), "Cancel submission 1"));
		expect(region(view).getAttribute("data-queue-state")).toBe("outcome_unknown");

		await view.user.click(named(view.container, "Refresh list"));

		expect(fake.refreshes).toBe(1);
		expect(region(view).getAttribute("data-queue-state")).toBe("queued");
		expect(
			named(rowFor(view.container, "s1"), "Cancel submission 1").getAttribute("aria-disabled"),
		).toBe("false");
		expect(settlementText(view.container)).toContain("re-read and republished");
	});
});

describe("workbench queue recovery from the rendered region", () => {
	test("a replaced child reads as a restart until the list is refreshed", async () => {
		const { fake, view } = mountWith();

		await publish(
			fake,
			connected(
				snapshot({
					queue: queue("queued", SEEDS),
					threadLink: executableLink({ epoch: "epoch-b" as typeof EPOCH }),
				}),
				6,
			),
		);

		expect(region(view).getAttribute("data-queue-state")).toBe("restarted");
		expect(
			named(rowFor(view.container, "s1"), "Start submission 1").getAttribute("aria-disabled"),
		).toBe("true");

		await view.user.click(named(view.container, "Refresh list"));

		expect(region(view).getAttribute("data-queue-state")).toBe("queued");
		expect(fake.refreshes).toBe(1);
		expect(fake.commands).toEqual([]);
	});

	test("a stale stream snapshot holds every command but keeps refresh reachable", async () => {
		const { fake, view } = mountWith();

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

		expect(region(view).getAttribute("data-queue-state")).toBe("stale");
		await view.user.click(named(rowFor(view.container, "s1"), "Cancel submission 1"));
		expect(fake.commands).toEqual([]);
		expect(named(view.container, "Refresh list").getAttribute("aria-disabled")).toBe("false");
	});
});
