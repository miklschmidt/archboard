import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createDynamicAuthorityTokenIssuer } from "../../../runtime/codex-dynamic-tools/index.js";
import {
	createServerDynamicOperationIdAdapter,
	presentingPane,
} from "../codex-workbench-adapters.js";

test("server-started work presents through the bound pane while it is open, another once it is not, and a recording page's only when nothing else is open", () => {
	const panes = [
		{ paneId: "pane-left", focused: false },
		{ paneId: "pane-focused", focused: true },
		{ paneId: "pane-bound", focused: false },
	];
	expect(presentingPane("pane-bound", panes)).toBe(panes[2]!);
	// The conversation belongs to the tab: closing the pane that made it
	// moves presentation to the pane the person is in, not to a refusal.
	expect(presentingPane("pane-gone", panes)).toBe(panes[1]!);
	expect(presentingPane(null, panes)).toBe(panes[1]!);
	// With nobody focused, the first pane in reading order.
	const unfocused = [
		{ paneId: "pane-left", focused: false },
		{ paneId: "pane-right", focused: false },
	];
	expect(presentingPane("pane-gone", unfocused)).toBe(unfocused[0]!);
	expect(() => presentingPane("pane-bound", [])).toThrow();
	// A recording page presents the same id as the person's pane and comes first in reading
	// order; the person's pane is what the work presents through while it is open.
	const recorded = [
		{ paneId: "A", focused: false, recording: true as const },
		{ paneId: "A", focused: false },
	];
	expect(presentingPane("A", recorded)).toBe(recorded[1]!);
	expect(presentingPane(null, recorded)).toBe(recorded[1]!);
	expect(presentingPane("A", [recorded[0]!])).toBe(recorded[0]!);
});

test("the production dynamic authority token issuer retires exact opaque capabilities", () => {
	const issuer = createDynamicAuthorityTokenIssuer();
	const first = issuer.issue();
	const second = issuer.issue();
	expect(first).not.toBe(second);
	expect(issuer.owns(first)).toBeTrue();
	issuer.retire(first);
	expect(issuer.owns(first)).toBeFalse();
	expect(issuer.owns(second)).toBeTrue();
	issuer.retireAll();
	expect(issuer.owns(second)).toBeFalse();
});

test("the production operation adapter shares authority and terminalizes exactly once", () => {
	const authorities = createIdentityAuthorities();
	const adapter = createServerDynamicOperationIdAdapter(authorities.operation);
	const operationId = adapter.issueCanonicalOperationId();

	adapter.validateCurrentUnconsumedOperationId(operationId);
	expect(adapter.serializeForOwnedWireFields(operationId)).toBe(String(operationId));
	const terminal = adapter.terminalizeCanonicalOperationId({
		operationId,
		disposition: "consumed",
	});
	expect(adapter.readCanonicalOperationTerminalResult(operationId)).toBe(terminal);
	expect(() => adapter.validateCurrentUnconsumedOperationId(operationId)).toThrow(
		"already terminal",
	);
	expect(adapter.terminalizeCanonicalOperationId({ operationId, disposition: "consumed" })).toBe(
		terminal,
	);
	expect(() =>
		adapter.terminalizeCanonicalOperationId({ operationId, disposition: "retired" }),
	).toThrow("different terminal disposition");
});
