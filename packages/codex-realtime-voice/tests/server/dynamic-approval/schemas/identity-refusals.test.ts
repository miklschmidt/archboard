import { describe, expect, test } from "bun:test";

import { createDynamicFixture } from "#tests/shared/support/dynamic-approval.ts";
import {
	authorityFixtureSource,
	testAuthorities,
} from "#tests/runtime/support/codex-connection.ts";

// The server binds the browser model to the connection's ledger, so it refuses what the browser
// model cannot know: an epoch of a restarted child, and an id the ledger issued in another domain.
describe("dynamic approval identities against the connection's ledger", () => {
	test("refuses a response that names another epoch of the child", () => {
		const authorities = testAuthorities();
		const fixture = createDynamicFixture(authorityFixtureSource(authorities));
		const response = fixture.response;
		const otherEpoch = authorities.identity.issuer.mintChildEpoch();
		for (const mutation of [
			{ capturedLink: { ...response.capturedLink, epoch: otherEpoch } },
			{ epoch: otherEpoch },
			{ identity: { ...response.identity, epoch: otherEpoch } },
		]) {
			expect(
				fixture.model.BrowserDynamicApprovalResponseSchema.safeParse({
					...response,
					...mutation,
				}).success,
			).toBeFalse();
		}
	});

	test("refuses a stale epoch and an id the ledger issued in another domain", () => {
		const authorities = testAuthorities();
		const fixture = createDynamicFixture(authorityFixtureSource(authorities));
		const request = fixture.requests[0]!;
		const fabricated = authorities.identity.issuer.mintBrowserCommandId();
		for (const changed of [
			{ epoch: authorities.identity.issuer.mintChildEpoch() },
			{ operationId: fabricated },
			{ callId: fabricated },
		]) {
			expect(
				fixture.model.DynamicApprovalIdentitySchema.safeParse({
					...request.identity,
					...changed,
				}).success,
			).toBeFalse();
		}
	});
});
