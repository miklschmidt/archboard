import { describe, expect, test } from "bun:test";

import { projectThreadLinkSelection, threadLinkReasonLabel } from "../index.js";
import { capabilities, executableLink, record, threadA, threadB, unboundLink } from "./fixtures.js";

function select(
	records: ReturnType<typeof record>[],
	overrides: {
		readonly currentLink?: Parameters<typeof projectThreadLinkSelection>[0]["currentLink"];
		readonly capabilities?: ReturnType<typeof capabilities>;
		readonly hostCanRefresh?: boolean;
		readonly exhausted?: boolean;
	} = {},
) {
	return projectThreadLinkSelection({
		inventory: { state: "listed", records, exhausted: overrides.exhausted ?? true },
		currentLink: overrides.currentLink ?? unboundLink,
		capabilities: overrides.capabilities ?? capabilities(),
		hostCanRefresh: overrides.hostCanRefresh ?? true,
	});
}

describe("pane thread-link selection", () => {
	test("lists a joined record with its state, source, status, loaded, and controllability facts", () => {
		const selection = select([record()]);
		expect(selection.state).toBe("listed");
		const row = selection.rows[0];
		expect(row?.threadId).toBe(threadA);
		expect(row?.outcome).toBe("executable");
		expect(row?.stateLabel).toBe("Executable");
		expect(row?.sourceLabel).toBe("Standard app-server thread");
		expect(row?.statusLabel).toBe("Idle");
		expect(row?.loadedLabel).toBe("Loaded in the current child");
		expect(row?.controllabilityLabel).toBe("Accepts direct input");
		expect(row?.persistedRows).toBe(1);
		expect(row?.loadedOccurrences).toBe(1);
		expect(row?.intent).toBe("attach");
		expect(row?.command).toBe("threadLinkAttach");
		expect(row?.enabled).toBeTrue();
		expect(selection.summary).toContain("1 joined record");
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
			"Prior epoch: this thread was bound in an epoch before the current one.",
		]);
		expect(selection.rows.every((row) => row.stateLabel === "Inspect-only")).toBeTrue();
		expect(selection.summary).toContain("2 inspect-only");
	});

	test("shows a reason code the classifier does not publish verbatim", () => {
		expect(threadLinkReasonLabel("a_future_reason", "fallback")).toBe("a_future_reason");
		expect(threadLinkReasonLabel(null, "fallback")).toBe("fallback");
	});

	test("names the controllability arms, including an unknown capability", () => {
		const selection = select([
			record({ selectionId: "no", state: "inspect_only", canAcceptDirectInput: false }),
			record({
				selectionId: "unknown",
				threadId: threadB,
				state: "inspect_only",
				canAcceptDirectInput: null,
			}),
		]);
		expect(selection.rows.map((row) => row.controllabilityLabel)).toEqual([
			"Does not accept direct input",
			"Direct-input capability unknown",
		]);
	});

	test("refuses to trust an executable claim that contradicts its own facts", () => {
		const selection = select([
			record({ selectionId: "source", source: "subagent" }),
			record({ selectionId: "status", threadId: threadB, status: "systemError" }),
		]);
		expect(selection.rows.map((row) => row.outcome)).toEqual(["inspect_only", "inspect_only"]);
		expect(selection.rows[0]?.reasonLabel).toContain("non-standard source");
		expect(selection.rows[1]?.reasonLabel).toContain("system error");
	});

	test("never loads a not-loaded record and says so on the row", () => {
		const selection = select([
			record({ state: "inspect_only", loaded: false, loadedOccurrences: 0, status: "notLoaded" }),
		]);
		expect(selection.rows[0]?.loadedLabel).toBe("Not loaded; binding it never loads it");
		expect(selection.rows[0]?.outcome).toBe("inspect_only");
	});

	test("excludes a record that is not one exhausted persisted row", () => {
		const selection = select([
			record({ selectionId: "missing", persistedRows: 0 }),
			record({ selectionId: "conflicting", threadId: threadB, persistedRows: 2 }),
		]);
		expect(selection.rows).toEqual([]);
		expect(selection.excluded.map((row) => row.exclusion)).toEqual([
			"not_persisted",
			"persisted_ambiguous",
		]);
		expect(selection.excluded[0]?.explanation).toContain("not a joined record");
		expect(selection.state).toBe("empty");
	});

	test("excludes a record whose loaded membership contradicts the exhausted loaded list", () => {
		const selection = select([
			record({ selectionId: "duplicated-membership", loadedOccurrences: 2 }),
			record({ selectionId: "claimed", threadId: threadB, loaded: true, loadedOccurrences: 0 }),
		]);
		expect(selection.rows).toEqual([]);
		expect(selection.excluded.map((row) => row.exclusion)).toEqual([
			"loaded_ambiguous",
			"loaded_ambiguous",
		]);
	});

	test("refuses every row of a duplicated thread rather than guessing which one is real", () => {
		const selection = select([
			record({ selectionId: "first" }),
			record({ selectionId: "second" }),
			record({ selectionId: "other", threadId: threadB }),
		]);
		expect(selection.rows.map((row) => row.selectionId)).toEqual(["other"]);
		expect(selection.excluded.map((row) => row.selectionId)).toEqual(["first", "second"]);
		expect(selection.excluded[0]?.exclusion).toBe("duplicate_row");
		expect(selection.excluded[0]?.explanation).toContain("more than once");
		expect(selection.recovery.intent).toBe("refresh_inventory");
		expect(selection.recovery.available).toBeTrue();
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
		expect(selection.rows[1]?.blockedReason).toBe("This pane is already linked to this thread.");
	});

	test("disables a row whose command the workbench does not support yet", () => {
		const selection = select([record()], { capabilities: capabilities({ supported: [] }) });
		expect(selection.rows[0]?.enabled).toBeFalse();
		expect(selection.rows[0]?.blockedReason).toContain("active command lease");
	});

	test("renders empty, loading, and unavailable inventories as their own disclosed states", () => {
		const empty = select([]);
		expect(empty.state).toBe("empty");
		expect(empty.summary).toContain("No persisted thread joined the current loaded list");
		const loading = projectThreadLinkSelection({
			inventory: { state: "loading" },
			currentLink: unboundLink,
			capabilities: capabilities(),
			hostCanRefresh: true,
		});
		expect(loading.state).toBe("loading");
		const unavailable = projectThreadLinkSelection({
			inventory: { state: "unavailable", reason: "The thread list could not be exhausted." },
			currentLink: unboundLink,
			capabilities: capabilities(),
			hostCanRefresh: false,
		});
		expect(unavailable.state).toBe("unavailable");
		expect(unavailable.summary).toBe("The thread list could not be exhausted.");
		expect(unavailable.recovery.available).toBeFalse();
		expect(unavailable.recovery.owner).toBe("none");
	});

	test("says when the host could not exhaust both lists in one generation", () => {
		expect(select([record()], { exhausted: false }).summary).toContain(
			"did not exhaust both lists in one generation",
		);
	});
});
