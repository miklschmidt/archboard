import { describe, expect, test } from "bun:test";

import { projectThreadLinkSelection, threadLinkReasonLabel } from "../index.js";
import type { ThreadLinkInventory } from "../index.js";
import {
	capabilities,
	executableLink,
	listed,
	record,
	threadA,
	threadB,
	unboundLink,
	unknownCandidates,
} from "./fixtures.js";

function select(
	records: ReturnType<typeof record>[],
	overrides: {
		readonly currentLink?: Parameters<typeof projectThreadLinkSelection>[0]["currentLink"];
		readonly capabilities?: ReturnType<typeof capabilities>;
		readonly truncated?: boolean;
	} = {},
) {
	return projectThreadLinkSelection({
		inventory: listed(records, overrides.truncated ?? false),
		currentLink: overrides.currentLink ?? unboundLink,
		capabilities: overrides.capabilities ?? capabilities(),
	});
}

describe("pane thread-link selection", () => {
	test("lists the host's joined record with its state, source, status, loaded, and controllability facts", () => {
		const selection = select([record()]);
		expect(selection.state).toBe("listed");
		const row = selection.rows[0];
		expect(row?.threadId).toBe(threadA);
		expect(row?.selectionId).toBe("selection-a");
		expect(row?.outcome).toBe("executable");
		expect(row?.stateLabel).toBe("Executable");
		expect(row?.sourceLabel).toBe("Standard app-server thread");
		expect(row?.statusLabel).toBe("Idle");
		expect(row?.loadedLabel).toBe("Loaded in the current child");
		expect(row?.controllabilityLabel).toBe("Accepts direct input");
		expect(row?.intent).toBe("attach");
		expect(row?.command).toBe("threadLinkAttach");
		expect(row?.enabled).toBeTrue();
		expect(selection.summary).toContain("1 conversation");
	});

	test("discloses the stale and prior-epoch reasons before anything is bound", () => {
		const selection = select([
			record({ selectionId: "stale", state: "inspect_only", reason: "stale_child" }),
			record({
				selectionId: "prior",
				threadId: threadB,
				state: "inspect_only",
				reason: "prior_epoch",
			}),
		]);
		expect(selection.rows.map((row) => row.reasonLabel)).toEqual([
			"Stale: this thread belongs to a child that is no longer the current one.",
			"This conversation belongs to an earlier agent session.",
		]);
		expect(selection.rows.every((row) => row.stateLabel === "Inspect-only")).toBeTrue();
		expect(selection.summary).toContain("2 conversations");
	});

	test("shows a reason code the classifier does not publish verbatim", () => {
		expect(threadLinkReasonLabel("a_future_reason", "fallback")).toBe("a_future_reason");
		expect(threadLinkReasonLabel(null, "fallback")).toBe("fallback");
		expect(threadLinkReasonLabel(undefined, "fallback")).toBe("fallback");
	});

	test("names every source presentation and controllability arm the wire can carry", () => {
		const selection = select([
			record({ selectionId: "sub", state: "inspect_only", sourcePresentation: "subagent" }),
			record({
				selectionId: "custom",
				threadId: threadB,
				state: "inspect_only",
				sourcePresentation: "custom",
				canAcceptDirectInput: false,
			}),
			record({
				selectionId: "unknown",
				threadId: "thread-c" as typeof threadA,
				state: "inspect_only",
				sourcePresentation: "unknown",
				status: "systemError",
				canAcceptDirectInput: null,
			}),
		]);
		expect(selection.rows.map((row) => row.sourceLabel)).toEqual([
			"Sub-agent thread",
			"Custom-source thread",
			"Unknown source",
		]);
		expect(selection.rows.map((row) => row.controllabilityLabel)).toEqual([
			"Accepts direct input",
			"Does not accept direct input",
			"Direct-input capability unknown",
		]);
		expect(selection.rows[2]?.statusLabel).toBe("System error");
	});

	test("takes the host's classification verbatim rather than re-deriving one", () => {
		// Facts that a browser-side classifier would have argued with: the host
		// says executable, and this module renders exactly that.
		const selection = select([record({ status: "active", reason: "prior_epoch" })]);
		expect(selection.rows[0]?.outcome).toBe("executable");
		expect(selection.rows[0]?.reasonLabel).toContain("earlier agent session");
	});

	test("never loads a not-loaded record and says so on the row", () => {
		const selection = select([
			record({ state: "inspect_only", loaded: false, status: "notLoaded" }),
		]);
		expect(selection.rows[0]?.loadedLabel).toBe("Not loaded; binding it never loads it");
		expect(selection.rows[0]?.outcome).toBe("inspect_only");
	});

	test("offers relink rather than attach when the pane already holds a link", () => {
		const selection = select([record({ threadId: threadB, selectionId: "other" }), record()], {
			currentLink: executableLink(threadA),
		});
		expect(selection.rows[0]?.intent).toBe("relink");
		expect(selection.rows[0]?.command).toBe("threadLinkRelink");
		expect(selection.rows[1]?.intent).toBe("current");
		expect(selection.rows[1]?.command).toBeNull();
		expect(selection.rows[1]?.enabled).toBeFalse();
		expect(selection.rows[1]?.blockedReason).toBe("This conversation is already connected.");
	});

	test("disables a row whose command the workbench does not support yet", () => {
		const selection = select([record()], { capabilities: capabilities({ supported: [] }) });
		expect(selection.rows[0]?.enabled).toBeFalse();
		expect(selection.rows[0]?.blockedReason).toContain("Reconnect and sign in");
	});

	test("renders unknown, empty, and unavailable inventories as their own disclosed states", () => {
		const unknown = projectThreadLinkSelection({
			inventory: unknownCandidates,
			currentLink: unboundLink,
			capabilities: capabilities(),
		});
		expect(unknown.state).toBe("unknown");
		expect(unknown.summary).toContain("Refresh to load your conversations.");
		expect(unknown.recovery.intent).toBe("refresh_inventory");
		expect(unknown.recovery.owner).toBe("transport");
		const empty = select([]);
		expect(empty.state).toBe("empty");
		expect(empty.summary).toContain("No conversations are available.");
		const unavailable = projectThreadLinkSelection({
			inventory: {
				kind: "thread_candidates",
				state: "unavailable",
				records: [],
				truncated: false,
				reason: "The Codex thread list could not be discovered.",
			} satisfies ThreadLinkInventory,
			currentLink: unboundLink,
			capabilities: capabilities({ supported: [] }),
		});
		expect(unavailable.state).toBe("unavailable");
		expect(unavailable.summary).toBe("The Codex thread list could not be discovered.");
		expect(unavailable.recovery.available).toBeFalse();
		expect(unavailable.recovery.owner).toBe("none");
	});

	test("says when the workbench published Showing the first page.", () => {
		expect(select([record()], { truncated: true }).summary).toContain("Showing the first page.");
	});
});
