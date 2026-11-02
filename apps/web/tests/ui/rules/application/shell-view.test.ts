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

const CHECKOUT = { model: "Checkout", variant: "current" };

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
		model: CHECKOUT,
		paneKey: "Checkout",
		vault: VAULT,
		version: 3,
	};
	return patchRecord(patchRecord({}, "A", { status: statusA }), "B", {
		...initialPaneRecord("B"),
	});
}

test("the shell view names the active pane's model and carries its mounted panes", () => {
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
	// Pane B is focused after being added; it shows no model.
	expect(view.activePaneId).toBe("B");
	expect(view.panes.map((pane) => [pane.status.paneId, pane.stage])).toEqual([
		["A", "pane-a"],
		["B", "pane-b"],
	]);
	expect(view.selectedPaneKey).toBeNull();
});

test("the focused pane's model key is the selected navigator entry", () => {
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
	expect(view.selectedPaneKey).toBe("Checkout");
	expect(view.modelsError).toBe("offline");
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
	const entry = { paneKey: "model:Checkout", model: "Checkout", claims: [claim], doing: null };
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
				status: { ...emptyPaneStatus("A"), model: CHECKOUT, paneKey: "Checkout", vault },
			}),
			panes: {},
			catalog: catalogOf(),
			presentation: null,
			notices: [],
			agentActivity: { [VAULT]: { Checkout: entry } },
		});
	expect(viewWith(VAULT).repositories[0]?.activity).toEqual({ Checkout: entry });
	// Every pane hears every vault's account (ADR 0022), so the navigator marks a
	// model an agent has in a repository no pane is reading.
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
	// Pane A loses its connection: the view is assembled again, and nothing the
	// navigator lists changed, so it keeps its rows as they were.
	const dropped = patchRecord(records, "A", {
		status: { ...records["A"]!.status, connected: false },
	});
	expect(assembleShellView({ ...inputs, records: dropped }).repositories).toBe(before);
});
