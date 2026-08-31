import { describe, expect, test } from "bun:test";

import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import {
	COORDINATOR_TOOLS_OWNER,
	isCoordinatorToolRequest,
	type CoordinatorToolsServerRequest,
} from "../index.js";
import { fixture, responseEnvelope, type CoordinatorToolsFixture } from "./support.js";

function dispatch(fixtureValue: CoordinatorToolsFixture, request: DynamicServerRequest) {
	return fixtureValue.dispatcher.dispatch(request as CoordinatorToolsServerRequest);
}

function changedRequest(
	request: DynamicServerRequest,
	patch: Partial<DynamicServerRequest>,
): DynamicServerRequest {
	return { ...request, ...patch } as DynamicServerRequest;
}

async function expectBoundaryRefusal(
	fixtureValue: CoordinatorToolsFixture,
	request: DynamicServerRequest,
	reason: string,
): Promise<void> {
	const result = await dispatch(fixtureValue, request);
	const envelope = responseEnvelope(result.response);
	expect(result.response.success).toBe(reason === "not_ready" || reason === "busy");
	expect(envelope).toMatchObject({ tag: "refused", reason });
	expect(fixtureValue.transport.writes).toHaveLength(1);
	expect(fixtureValue.operations.calls.inspect).toHaveLength(0);
	expect(fixtureValue.operations.calls.delegate).toHaveLength(0);
	expect(fixtureValue.operations.calls.manageQueue).toHaveLength(0);
	expect(fixtureValue.operations.calls.steer).toHaveLength(0);
}

describe("coordinator dynamic-tool identity and authority validation", () => {
	test("fails closed before any operation for malformed or unavailable authority", async () => {
		const cases: Array<{
			readonly label: string;
			readonly reason: string;
			readonly make: (fixtureValue: CoordinatorToolsFixture) => DynamicServerRequest;
		}> = [
			{
				label: "coordinator not ready",
				reason: "not_ready",
				make: (h) => {
					h.authority.setCoordinator(null);
					return h.request("inspect_workhorse");
				},
			},
			{
				label: "workhorse binding missing",
				reason: "not_ready",
				make: (h) => {
					h.authority.setBinding(null);
					return h.request("inspect_workhorse");
				},
			},
			{
				label: "self target",
				reason: "unknown_provenance",
				make: (h) => {
					const request = h.request("inspect_workhorse");
					h.authority.setBinding({
						...h.binding,
						workhorse: { ...h.binding.workhorse, threadId: h.coordinatorThreadId },
					});
					return request;
				},
			},
			{
				label: "binding attached to another coordinator",
				reason: "unknown_provenance",
				make: (h) => {
					const request = h.request("inspect_workhorse");
					const otherCoordinator = h.identity.decoder.adoptThreadId("other-coordinator");
					h.authority.setBinding({
						...h.binding,
						coordinator: { ...h.binding.coordinator, threadId: otherCoordinator },
					});
					return request;
				},
			},
			{
				label: "caller chooses the workhorse target",
				reason: "invalid_call",
				make: (h) => h.request("inspect_workhorse", { threadId: h.workhorseThreadId }),
			},
			{
				label: "manifest drift",
				reason: "invalid_call",
				make: (h) => h.request("inspect_workhorse", { manifestHash: "not-reviewed" }),
			},
			{
				label: "namespace catalogue mismatch",
				reason: "invalid_call",
				make: (h) => h.request("inspect_workhorse", { namespace: "archboard_voice" }),
			},
			{
				label: "tool catalogue mismatch",
				reason: "invalid_call",
				make: (h) => {
					const request = h.request("inspect_workhorse");
					return changedRequest(request, {
						params: { ...request.params, tool: "not_declared" },
					});
				},
			},
			{
				label: "cross-domain wire identity",
				reason: "unknown_provenance",
				make: (h) => {
					const request = h.request("inspect_workhorse");
					return changedRequest(request, {
						params: {
							...request.params,
							threadId: h.identity.decoder.serializeCodexIdentity(h.expectedTurnId),
						},
					});
				},
			},
			{
				label: "closed input schema",
				reason: "invalid_call",
				make: (h) =>
					h.request("delegate_to_workhorse", {
						arguments: { input: "", transcriptDelta: "" },
					}),
			},
			{
				label: "active turn proof missing",
				reason: "busy",
				make: (h) => {
					const request = h.request("steer_workhorse");
					h.authority.setExpectedTurnId(null);
					return request;
				},
			},
			{
				label: "current logical call cleared",
				reason: "invalid_call",
				make: (h) => {
					const request = h.request("inspect_workhorse");
					h.authority.setCall(null);
					return request;
				},
			},
			{
				label: "unissued wire correlation",
				reason: "invalid_call",
				make: (h) => {
					const request = h.request("inspect_workhorse");
					return changedRequest(request, {
						correlation: {
							...request.correlation,
							requestId: "not-issued",
						} as DynamicServerRequest["correlation"],
					});
				},
			},
		];

		for (const { label, reason, make } of cases) {
			const h = fixture();
			await expectBoundaryRefusal(h, make(h), reason);
			expect(label.length).toBeGreaterThan(0);
		}
	});

	test("maps a foreign child and prior epoch to explicit stale identity refusals", async () => {
		const h = fixture();
		const foreign = fixture();
		await expectBoundaryRefusal(h, foreign.request("inspect_workhorse"), "stale_child");

		const prior = fixture();
		const priorEpoch = prior.identity.issuer.mintChildEpoch();
		const currentRequest = prior.request("inspect_workhorse");
		const priorRequest = changedRequest(currentRequest, {
			epoch: priorEpoch,
			correlation: { ...currentRequest.correlation, epoch: priorEpoch },
		});
		await expectBoundaryRefusal(prior, priorRequest, "prior_epoch");
	});

	test("keeps the coordinator owner boundary exclusive", async () => {
		const h = fixture();
		const request = h.request("inspect_workhorse");
		const foreignOwner = {
			...request,
			owner: "codex-dynamic-tools",
		} as unknown as TransportServerRequest;
		expect(isCoordinatorToolRequest(foreignOwner)).toBe(false);
		h.dispatcher.onServerRequest(foreignOwner);
		await Promise.resolve();
		expect(h.operations.calls.inspect).toHaveLength(0);
		expect(h.transport.writes).toHaveLength(0);
		expect(COORDINATOR_TOOLS_OWNER).toBe("codex-coordinator-tools");
	});

	test("refuses a validated call when the host cannot supply an operation identity", async () => {
		const h = fixture();
		h.authority.setOperationId(null);
		const result = await dispatch(h, h.request("inspect_workhorse"));
		expect(result.response.success).toBe(true);
		expect(responseEnvelope(result.response)).toMatchObject({
			tag: "refused",
			reason: "not_ready",
		});
		expect(h.operations.calls.inspect).toHaveLength(0);
	});
});
