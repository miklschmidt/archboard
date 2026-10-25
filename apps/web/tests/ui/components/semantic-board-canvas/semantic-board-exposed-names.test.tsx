// What the code of a picked container exposes, in the Selection tab
// (TASK-539.02): the exact counts, the names most used first with the unused
// ones folded into one row, and a chosen name's users and the files that pass
// it on. It reads the server's memory of the last pass and never starts one.
//
// What these catch: names out of order, an unused name listed among the used
// ones before the fold opens, a user the board does not draw named as a part,
// a region on a card, and a region that shows counts before any pass ran.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	mountStage,
	openSidebarTab,
	pickablePicture,
	server,
	settle,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import { pick } from "#tests/ui/support/semantic-board-canvas/wiring-fixture.tsx";

const REPO = "github.com/acme/shop";

// Orders is bound to its module; the storefront and the admin use it.
const NODES = [
	{
		id: "sf",
		name: "Storefront",
		kind: "route",
		binding: { repo: REPO, path: "src/storefront.ts" },
	},
	{ id: "adm", name: "Admin", kind: "route", binding: { repo: REPO, path: "src/admin.ts" } },
	{ id: "orders", name: "Orders", kind: "service", binding: { repo: REPO, path: "src/orders" } },
	{ id: "po", name: "Place order", kind: "route", parent: "orders" },
];
const EDGES = [
	{ id: "e1", from: "sf", to: "po", kind: "call" },
	{ id: "e2", from: "adm", to: "po", kind: "call" },
];

const CHECKED_AT = "2026-10-25T10:00:00.000Z";
const AT = { board: "pipeline", variant: "v1" };

/** What the last pass left for the board on screen: Orders judged, with its counts. */
const FINDINGS = {
	success: true,
	readings: [
		{
			...AT,
			version: 1,
			checkedAt: CHECKED_AT,
			findings: [],
			skipped: [],
			containers: [{ container: "orders", module: "src/orders", exposed: 4, usedOutside: 2 }],
		},
	],
};

/**
 * One exposed name.
 * @param name The name.
 * @param usedBy The files that use it, with the parts that hold each.
 * @param via The files that pass it on.
 * @returns The name as the route answers it.
 */
function exposed(
	name: string,
	usedBy: { path: string; line: number; parts: string[] }[],
	via: string[] = [],
): Record<string, unknown> {
	return { name, path: "src/orders/place.ts", line: 3, via, users: usedBy.length, usedBy };
}

/** What the exposure route answers about Orders, the most used name first. */
const EXPOSURE = {
	success: true,
	version: 1,
	checkedAt: CHECKED_AT,
	exposure: {
		...AT,
		container: "orders",
		module: "src/orders",
		rootFiles: ["src/orders/index.ts"],
		exposed: 4,
		usedOutside: 2,
		names: [
			exposed(
				"placeOrder",
				[
					{ path: "scripts/report.ts", line: 9, parts: [] },
					{ path: "src/storefront.ts", line: 5, parts: ["sf"] },
				],
				["src/orders/index.ts"],
			),
			exposed("cancelOrder", [{ path: "src/admin.ts", line: 2, parts: ["adm"] }]),
			exposed("OrderId", []),
			exposed("orderTotal", []),
		],
	},
};

/**
 * Show the board, pick a part out, and read it in the Selection tab.
 * @param id The part.
 */
async function picked(id: string): Promise<void> {
	server.documents["pipeline"] = {
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-10-25T00:00:00.000Z",
		updatedAt: "2026-10-25T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{ id: "v1", name: "as built", lifecycle: "current", content: { nodes: NODES, edges: EDGES } },
		],
	};
	server.reply = {
		status: 200,
		body: pickablePicture(
			{ regions: ["orders"], nodes: ["sf", "adm", "po"], edges: ["e1", "e2"] },
			{ variant: { id: "v1", name: "as built", lifecycle: "current" }, changes: null },
		),
	};
	mountStage(null, { live: true });
	await settle();
	await settle();
	await pick(id);
	openSidebarTab("selection");
	await settle();
	await settle();
}

/**
 * The rows of one kind in the region, by an attribute.
 * @param slot The rows' slot.
 * @param attribute What each row is read by.
 * @returns The values, in order.
 */
function rows(slot: string, attribute: string): (string | null)[] {
	return [...document.querySelectorAll(`[data-slot='${slot}']`)].map((row) =>
		row.getAttribute(attribute),
	);
}

/**
 * Press one control of the region.
 * @param selector The control.
 */
async function press(selector: string): Promise<void> {
	await act(async () => {
		fireEvent.click(document.querySelector(selector)!);
	});
	await settle();
}

test("a picked container lists its exposed names most used first, folds the unused ones, and opens a name's users", async () => {
	server.findings = FINDINGS;
	server.exposure = EXPOSURE;
	await picked("orders");
	const counts = document.querySelector("[data-slot='semantic-exposed-counts']");
	expect([counts?.getAttribute("data-exposed"), counts?.getAttribute("data-used")]).toEqual([
		"4",
		"2",
	]);
	expect(rows("semantic-exposed-name", "data-name")).toEqual(["placeOrder", "cancelOrder"]);
	expect(
		document.querySelector("[data-slot='semantic-exposed-unused']")?.getAttribute("data-count"),
	).toBe("2");

	await press("[data-slot='semantic-exposed-unused']");
	expect(rows("semantic-exposed-name", "data-name")).toEqual([
		"placeOrder",
		"cancelOrder",
		"OrderId",
		"orderTotal",
	]);

	await press("[data-slot='semantic-exposed-name'][data-name='placeOrder']");
	// The report script is held by no part of the board; the storefront is.
	expect(rows("semantic-exposed-user", "data-part")).toEqual([null, "sf"]);
	expect(rows("semantic-exposed-via", "data-slot")).toHaveLength(1);
});

test("a card shows no exposed names", async () => {
	server.findings = FINDINGS;
	server.exposure = EXPOSURE;
	await picked("sf");
	expect(document.querySelector("[data-slot='semantic-inspector-exposed']")).toBeNull();
});

test("before any pass, a bound container says that none has run, and asks for no names", async () => {
	await picked("orders");
	expect(
		document.querySelector("[data-slot='semantic-exposed-none']")?.getAttribute("data-state"),
	).toBe("no-pass");
	expect(document.querySelector("[data-slot='semantic-exposed-counts']")).toBeNull();
});
