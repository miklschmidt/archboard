import { expect, test } from "bun:test";

import { addPane, initialPaneList } from "#ui/rules/application/pane-list.ts";
import {
	emptyPaneStatus,
	initialPaneRecord,
	patchRecord,
	type PaneRecords,
} from "#ui/rules/application/pane-records.ts";
import { assembleShellView } from "#ui/rules/application/shell-view.ts";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import type { ModelCatalog } from "#ui/hooks/architecture-model/use-model-catalog.ts";

const CHECKOUT = { board: "Checkout", variant: "current" };

/** The vault of the one repository the catalog lists. */
const VAULT = "/work/shop/.archboard/vault";

/**
 * A catalog of one repository whose chosen checkout is VAULT.
 * @param error Why the repositories could not be read, or null.
 * @returns The catalog.
 */
function catalogOf(
	error: string | null = null,
): Pick<ModelCatalog, "repositories" | "error" | "loading"> {
	const repository: RepositoryEntry = {
		name: "github.com/acme/shop",
		untracked: false,
		vault: VAULT,
		state: "ready",
		checkouts: [{ root: "/work/shop", chosen: true, exists: true, hasVault: true }],
	};
	return {
		repositories: [{ repository, error: null, loading: false }],
		error,
		loading: false,
	};
}

/**
 * Records for two panes: A shows Checkout, B shows nothing yet.
 * @returns The records.
 */
function twoPaneRecords(): PaneRecords {
	const statusA = {
		...emptyPaneStatus("A"),
		clientId: "A-1",
		connected: true,
		board: CHECKOUT,
		boardKey: "Checkout",
		vault: VAULT,
		version: 3,
	};
	return patchRecord(patchRecord({}, "A", { status: statusA, holder: null }), "B", {
		...initialPaneRecord("B"),
	});
}

test("the shell view names the active pane's board and carries its mounted panes", () => {
	const list = addPane(initialPaneList());
	const view = assembleShellView({
		theme: "dark",
		list,
		records: twoPaneRecords(),
		panes: { A: "pane-a", B: "pane-b" },
		catalog: catalogOf(),
		presentation: null,
		notices: [],
		agentActivity: {},
	});
	// Pane B is focused after being added; it shows no board.
	expect(view.activePaneId).toBe("B");
	expect(view.panes.map((pane) => [pane.status.paneId, pane.stage])).toEqual([
		["A", "pane-a"],
		["B", "pane-b"],
	]);
	expect(view.selectedBoardKey).toBeNull();
});

test("the focused pane's board key is the selected navigator entry", () => {
	const records = twoPaneRecords();
	const view = assembleShellView({
		theme: "light",
		list: initialPaneList(),
		records,
		panes: {},
		catalog: catalogOf("offline"),
		presentation: { kind: "live", paneId: "A" },
		notices: [],
		agentActivity: {},
	});
	expect(view.selectedBoardKey).toBe("Checkout");
	expect(view.boardsError).toBe("offline");
	expect(view.presentation).toEqual({ kind: "live", paneId: "A" });
	expect(view.panes[0]?.stage).toBeNull();
});

test("what an agent does in a vault is shown whether or not a pane of the tab is in it", () => {
	const since = "2026-10-15T00:00:00.000Z";
	const claim = {
		id: "Claim",
		target: { model: "Checkout", state: "Current" },
		writer: "agent-1",
		reason: "Planning checkout",
		subjects: ["Checkout#Queue"],
		since,
		until: since,
	};
	const entry = { board: "model:Checkout", model: "Checkout", claims: [claim], doing: null };
	/**
	 * The view while the tab's one pane is in a vault.
	 * @param vault The vault.
	 * @returns The view.
	 */
	const viewWith = (vault: string) =>
		assembleShellView({
			theme: "dark",
			list: initialPaneList(),
			records: patchRecord({}, "A", {
				status: { ...emptyPaneStatus("A"), board: CHECKOUT, boardKey: "Checkout", vault },
				holder: null,
			}),
			panes: {},
			catalog: catalogOf(),
			presentation: null,
			notices: [],
			agentActivity: { [VAULT]: { Checkout: entry } },
		});
	expect(viewWith(VAULT).repositories[0]?.activity).toEqual({ Checkout: entry });
	// Every pane hears every vault's account (ADR 0022), so the navigator marks a
	// board an agent has in a repository no pane is reading.
	expect(viewWith("/work/blog/.archboard/vault").repositories[0]?.activity).toEqual({
		Checkout: entry,
	});
});

test("pane news keeps the repositories the navigator lists", () => {
	const list = addPane(initialPaneList());
	const records = twoPaneRecords();
	const inputs = {
		theme: "dark",
		list,
		records,
		panes: {},
		catalog: catalogOf(),
		presentation: null,
		notices: [],
		agentActivity: {},
	} as const;
	const before = assembleShellView(inputs).repositories;
	// An agent claims pane A's board: the view is assembled again, and nothing
	// the navigator lists changed, so it keeps its rows as they were.
	const claimed = patchRecord(records, "A", {
		holder: { id: "agent-1", kind: "agent", since: "", until: "", process: "codex" },
	});
	expect(assembleShellView({ ...inputs, records: claimed }).repositories).toBe(before);
});
