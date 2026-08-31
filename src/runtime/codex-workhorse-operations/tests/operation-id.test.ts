import { describe, expect, test } from "bun:test";

import {
	createIdentityAuthorities,
	restoreIdentityAuthorities,
	type JsonRpcRequestId,
	type OperationId,
} from "../../../shared/codex-workbench-identity/index.js";
import { rejected } from "./evidence.js";
import { fixture, turn } from "./support.js";

function operationWire(value: ReturnType<typeof fixture>, operationId: OperationId): string {
	return value.operation.decoder.serializeOperationId(operationId);
}

function operationTypeBoundary(requestId: JsonRpcRequestId, operationId: OperationId): void {
	void operationId;
	const value = fixture();
	void value.operations.delegate({
		call: value.setCall("delegate_to_workhorse"),
		// @ts-expect-error JSON-RPC request identity is not an operation identity.
		operationId: requestId,
		input: "compile-only",
		transcriptDelta: "",
	});
}
void operationTypeBoundary;

describe("workhorse host-issued operation identity", () => {
	test("reuses one supplied identity through direct, queue, and steer mutation boundaries", async () => {
		const direct = fixture();
		try {
			const operationId = direct.operation.issuer.mintOperationId();
			const result = await direct.operations.delegate({
				call: direct.setCall("delegate_to_workhorse"),
				operationId,
				input: "canonical direct work",
				transcriptDelta: "",
			});
			expect(result.clientUserMessageId).toBe(operationWire(direct, operationId));
			expect(direct.session.starts[0]?.clientUserMessageId).toBe(
				operationWire(direct, operationId),
			);
		} finally {
			direct.cleanup();
		}

		const queued = fixture("active");
		try {
			const operationId = queued.operation.issuer.mintOperationId();
			await queued.operations.manageQueue({
				call: queued.setCall("manage_workhorse_queue"),
				operation: "add",
				operationId,
				prompt: "canonical queued work",
			});
			expect(queued.queue.state[0]?.clientUserMessageId).toBe(operationWire(queued, operationId));
		} finally {
			queued.cleanup();
		}

		const steered = fixture("active");
		try {
			const activeTurn = turn(steered.identity, "canonical-active", "inProgress");
			steered.setStatus("active", [activeTurn]);
			const operationId = steered.operation.issuer.mintOperationId();
			const observed: OperationId[] = [];
			steered.operations.subscribe((event) => observed.push(event.correlation.operationId));
			await steered.operations.steer({
				call: steered.setCall("steer_workhorse"),
				operationId,
				expectedTurnId: activeTurn.id,
				input: "canonical correction",
			});
			expect(observed).not.toHaveLength(0);
			expect(observed.every((candidate) => candidate === operationId)).toBe(true);
		} finally {
			steered.cleanup();
		}
	});

	test("rejects cross-domain, unissued, and stale identities before an effect", async () => {
		const base = createIdentityAuthorities();
		const staleOperation = base.operation.issuer.mintOperationId();
		const current = restoreIdentityAuthorities({
			childId: base.identity.validator.childId,
			epoch: base.identity.issuer.mintChildEpoch(),
		});
		const unissued = restoreIdentityAuthorities({
			childId: current.identity.validator.childId,
			epoch: current.identity.validator.epoch,
		}).operation.issuer.mintOperationId();
		const value = fixture("idle", current);
		try {
			const crossDomain = value.identity.decoder.adoptJsonRpcRequestId("wrong-domain");
			for (const candidate of [crossDomain as unknown as OperationId, unissued, staleOperation]) {
				const result = await rejected(
					value.operations.delegate({
						call: value.setCall("delegate_to_workhorse"),
						operationId: candidate,
						input: "must not run",
						transcriptDelta: "",
					}),
				);
				expect(result).toMatchObject({ code: "invalid_input" });
			}
			expect(value.session.starts).toHaveLength(0);
		} finally {
			value.cleanup();
		}
	});
});
