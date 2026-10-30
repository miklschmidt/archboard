import { expect, test } from "bun:test";

import { initialPaneList } from "#ui/rules/application/pane-list.ts";
import { initialPaneRecord } from "#ui/rules/application/pane-records.ts";
import {
	createWorkspacePort,
	type WorkspacePortDeps,
} from "#ui/clients/application/workspace-port.ts";
import type { ShellNotice } from "#ui/rules/shell/contracts.ts";

// The address names a repository (ADR 0050), and the port turns that name into
// the vault a show is sent to. A name the page does not list with a vault opens
// nothing, rather than the same key in the vault the pane is in.

const OWN = "/checkouts/shop/.archboard/vault";

/** Fail if the port reaches a pane owner these checks do not use. */
function unrelated(): never {
	throw new Error("The port reached an unrelated pane owner.");
}

/**
 * One pane the server has placed in the shop's vault.
 * @returns The panes.
 */
function placedPane(): WorkspacePortDeps["panes"] {
	const initial = initialPaneRecord("A");
	const record = {
		...initial,
		status: {
			...initial.status,
			clientId: "client-a",
			connected: true,
			registered: true,
			boardKey: "payments",
			vault: OWN,
			repository: "github.com/acme/shop",
		},
	};
	return {
		list: initialPaneList(),
		records: { A: record },
		links: {},
		/**
		 * The panes' sessions, which only a show that is sent reaches.
		 * @returns Never; these checks send none.
		 */
		get handles() {
			return unrelated();
		},
		/**
		 * The session callbacks.
		 * @returns Never; the port does not use them.
		 */
		get callbacks() {
			return unrelated();
		},
		add: unrelated,
		close: unrelated,
		select: unrelated,
		patch: unrelated,
		active: record,
		bindEvents: unrelated,
	};
}

/**
 * The port over that pane, with a repository list and a server that records each show.
 * @param vaultOf The repositories as the page has read them, or null before it has.
 * @returns The port, the vaults each show was sent to, and the notices it raised.
 */
function portOver(vaultOf: ((repository: string) => string | null) | null) {
	const shownIn: string[] = [];
	const raised: ShellNotice[] = [];
	const port = createWorkspacePort({
		panes: placedPane(),
		notices: {
			notices: [],
			/**
			 * Record a notice the port raised.
			 * @param notice The notice.
			 */
			raise: (notice: ShellNotice) => {
				raised.push(notice);
			},
			dismiss: unrelated,
		},
		vaultOf,
		/**
		 * Record a show the port sent.
		 * @param _clientId The pane.
		 * @param boardKey The board.
		 * @param vault The vault it was sent to.
		 * @returns The board, as the server would answer.
		 */
		show: async (_clientId: string, boardKey: string, vault: string) => {
			shownIn.push(vault);
			return { boardKey, repository: null };
		},
	});
	return { port, shownIn, raised };
}

/**
 * The repositories this page lists: none with a vault to read.
 * @returns Null, for every name.
 */
function listed(): string | null {
	return null;
}

test("a pane is not addressed until the repositories are read", () => {
	expect(portOver(null).port.ready("A")).toBe(false);
	expect(portOver(listed).port.ready("A")).toBe(true);
});

test("a repository the page does not list with a vault is unreachable, and nothing is shown", async () => {
	const { port, shownIn } = portOver(listed);
	expect(await port.open("A", "ledger", "github.com/acme/elsewhere")).toEqual({
		kind: "unreachable",
	});
	expect(shownIn).toEqual([]);
});

test("a board the address asked of a repository with no vault is reported by its repository", () => {
	const { port, raised } = portOver(listed);
	port.reportUnreachable([
		{ boardKey: "ledger", repository: "github.com/acme/elsewhere" },
		{ boardKey: "audit", repository: "github.com/acme/elsewhere" },
		{ boardKey: "nowhere", repository: null },
	]);
	expect(raised.map((notice) => notice.id)).toEqual([
		"unreachable-repository:github.com/acme/elsewhere",
		"unreachable-boards",
	]);
	expect(raised[0]?.title).toContain("github.com/acme/elsewhere");
	expect(raised[1]?.title).toContain("nowhere");
});
