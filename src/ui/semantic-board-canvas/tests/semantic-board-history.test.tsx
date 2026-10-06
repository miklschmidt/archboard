// What picking a part tells a person about its code's history (ADR 0045,
// TASK-369.07): the commits that changed its bound files in the period and the
// parts whose code changes in the same commits, each with a count, read from
// the locality route. A part chosen from that list is picked on the picture.
// On a variant the lens does not read it asks nothing. When the pane asks is
// owned by `locality-on-selection.test.tsx`.
//
// What these catch: a region that shows another part's commits or pairs, a
// skipped part that looks like a part no commit changed, a pair row that picks
// nothing, and a request about a variant the lens refuses.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	openSidebarTab,
	renderCalls,
	server,
	settle,
	surface,
} from "@/ui/semantic-board-canvas/tests/stage-harness";
import { WIRING, pick, served } from "@/ui/semantic-board-canvas/tests/wiring-fixture";

/** The commits of the period, newest first, as the answer lists them. */
const COMMITS = ["c6", "c5", "c4", "c3", "c2", "c1"].map((commit, index) => ({
	repo: "example/pipeline",
	commit,
	committedAt: `2026-09-${String(20 - index).padStart(2, "0")}T12:00:00Z`,
	subject: `change ${commit}`,
	files: 3,
}));

/**
 * One part the answer names.
 * @param id The part.
 * @param name What it is called.
 * @returns The subject, as the answer gives it.
 */
function subject(id: string, name: string): { id: string; kind: "node"; name: string } {
	return { id, kind: "node", name };
}

/**
 * One part the lens read.
 * @param id The part.
 * @param name What it is called.
 * @param commits The commits that changed it, newest first.
 * @returns The hotspot.
 */
function hotspot(id: string, name: string, commits: readonly string[]): Record<string, unknown> {
	return {
		subject: subject(id, name),
		repo: "example/pipeline",
		path: `src/${id}.ts`,
		commits,
		count: commits.length,
	};
}

/**
 * The route's answer for the pipeline's current variant. The handler changed
 * in all six commits; it changes with the queue, which a relationship joins to
 * it, and with the ledger, which nothing joins to it. The gateway changed in
 * none, the worker is bound to nothing, and Orders opens a board of its own.
 * @returns The route's success body.
 */
function answer(): Record<string, unknown> {
	return {
		success: true,
		board: "pipeline",
		version: 1,
		variant: { id: "v1", name: "as it is", lifecycle: "current" },
		periods: [
			{
				repo: "example/pipeline",
				head: "c6",
				since: "2025-09-20T12:00:00.000Z",
				until: "2026-09-20T12:00:00.000Z",
			},
		],
		commits: COMMITS,
		hotspots: [
			hotspot("h", "Handler", ["c6", "c5", "c4", "c3", "c2", "c1"]),
			hotspot("q", "Queue", ["c6", "c5", "c4", "c3", "c2"]),
			hotspot("l", "Ledger", ["c5", "c4", "c3", "c2", "c1"]),
			hotspot("g", "Gateway", []),
		],
		coupling: [
			{
				subjects: [subject("h", "Handler"), subject("q", "Queue")],
				repo: "example/pipeline",
				commits: ["c6", "c5", "c4", "c3", "c2"],
				shared: 5,
				degree: 90,
				unjoined: false,
			},
			{
				subjects: [subject("l", "Ledger"), subject("h", "Handler")],
				repo: "example/pipeline",
				commits: ["c5", "c4", "c3", "c2", "c1"],
				shared: 5,
				degree: 90,
				unjoined: true,
			},
		],
		leftOut: { largeCommits: 2 },
		skipped: [
			{ subject: subject("w", "Worker"), reason: "unbound" },
			{ subject: subject("orders", "Orders"), reason: "drill-down" },
		],
	};
}

/**
 * Pick a part out of the picture and read it in the selection tab.
 * @param id The part.
 */
async function inspect(id: string): Promise<void> {
	await pick(id);
	openSidebarTab("selection");
	await settle();
}

/**
 * One element of the history region, or null when it is not there.
 * @param slot Its slot.
 * @returns The element.
 */
function region(slot: string): Element | null {
	return document.querySelector(`[data-slot='semantic-inspector-history'] [data-slot='${slot}']`);
}

/**
 * The rows of one list of the region, by the attribute that names each.
 * @param slot The list's slot.
 * @param attribute What names a row.
 * @returns The names, in order.
 */
function rows(slot: string, attribute: string): (string | null)[] {
	return [...(region(slot)?.querySelectorAll(`[${attribute}]`) ?? [])].map((row) =>
		row.getAttribute(attribute),
	);
}

/**
 * The count a section of the region carries.
 * @param slot The section's slot.
 * @returns The count, or null when the section is not there.
 */
function count(slot: string): string | null {
	return region(slot)?.getAttribute("data-count") ?? null;
}

/**
 * The rows of the parts the picked part changes with.
 * @returns The rows, in order.
 */
function partnerRows(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-inspector-partner']")];
}

/**
 * The picture's selection.
 * @returns The ids of the subjects drawn as selected.
 */
function selectedInPicture(): string[] {
	return [...surface().querySelectorAll(".is-selected")].map(
		(group) => group.getAttribute("data-semantic-id") ?? "",
	);
}

test("a picked part shows its commits and the parts it changes with, each with a count", async () => {
	server.locality.reply = { status: 200, body: answer() };
	await served();
	const drawn = renderCalls().length;
	await inspect("h");
	// The answer is read beside the picture, which is not asked for again.
	expect(renderCalls()).toHaveLength(drawn);

	const asked = new URLSearchParams(server.locality.calls[0]?.split("?")[1]);
	expect([asked.get("board"), asked.get("variant")]).toEqual(["pipeline", "v1"]);
	// All six commits, the newest five shown until the person asks for the rest.
	expect(count("semantic-inspector-commits")).toBe("6");
	expect(rows("semantic-inspector-commit-list", "data-commit")).toEqual([
		"c6",
		"c5",
		"c4",
		"c3",
		"c2",
	]);
	const more = region("semantic-inspector-commits")?.querySelector("button[aria-expanded]");
	await act(async () => {
		fireEvent.click(more!);
	});
	expect(rows("semantic-inspector-commit-list", "data-commit")).toHaveLength(6);
	// Both pairs the handler is in, whichever side of the pair it is on, each
	// with its shared commits; only the ledger is unjoined.
	expect(count("semantic-inspector-partners")).toBe("2");
	expect(
		partnerRows().map((row) => [
			row.getAttribute("data-part"),
			row.getAttribute("data-shared"),
			row.getAttribute("data-unjoined"),
		]),
	).toEqual([
		["q", "5", "false"],
		["l", "5", "true"],
	]);
	expect(count("semantic-inspector-large-commits")).toBe("2");
});

test("a part chosen from the parts it changes with is picked on the picture, and that pick asks once more", async () => {
	server.locality.reply = { status: 200, body: answer() };
	await served();
	await inspect("h");

	await act(async () => {
		fireEvent.click(partnerRows()[1]!);
	});
	await settle();
	expect(selectedInPicture()).toEqual(["l"]);
	expect(document.querySelector("[data-slot='semantic-inspector'] h2")?.textContent).toBe("Ledger");
	expect(rows("semantic-inspector-partner-list", "data-part")).toEqual(["h"]);
	expect(server.locality.calls).toHaveLength(2);
});

test("a part the lens did not read says why, and a part no commit changed says that instead", async () => {
	server.locality.reply = { status: 200, body: answer() };
	await served();

	await inspect("w");
	expect(region("semantic-inspector-history-skipped")).not.toBeNull();
	expect(region("semantic-inspector-commits")).toBeNull();

	await inspect("g");
	expect(region("semantic-inspector-history-skipped")).toBeNull();
	expect(count("semantic-inspector-commits")).toBe("0");
	expect(region("semantic-inspector-partners")).toBeNull();
});

test("on a historical variant the region says the lens does not read it, and asks nothing", async () => {
	server.locality.reply = { status: 200, body: answer() };
	// The variant on screen is history: another is current now.
	const board = {
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v2",
		variants: [
			{ id: "v1", name: "as it was", lifecycle: "historical", content: WIRING },
			{ id: "v2", name: "as it is", lifecycle: "current", content: WIRING },
		],
	};
	await served({ document: board });
	await inspect("h");

	expect(region("semantic-inspector-history-unread")).not.toBeNull();
	expect(region("semantic-inspector-commits")).toBeNull();
	expect(server.locality.calls).toHaveLength(0);
});

test("a history that could not be read says so, and asks again only when the person says", async () => {
	server.locality.reply = { status: 500, body: { success: false, error: "git failed" } };
	await served();
	await inspect("h");

	const failed = region("semantic-inspector-history-failed");
	expect(failed).not.toBeNull();
	expect(server.locality.calls).toHaveLength(1);
	server.locality.reply = { status: 200, body: answer() };
	await act(async () => {
		fireEvent.click(failed!.querySelector("button")!);
	});
	await settle();
	expect(server.locality.calls).toHaveLength(2);
	expect(count("semantic-inspector-commits")).toBe("6");
});
