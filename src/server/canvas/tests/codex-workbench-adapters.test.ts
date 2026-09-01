import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createDynamicAuthorityTokenIssuer } from "../../../runtime/codex-dynamic-tools/index.js";
import { createCanvasDynamicOperationIdAdapter } from "../codex-workbench.js";

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
	const adapter = createCanvasDynamicOperationIdAdapter(authorities.operation);
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
