import { createTextUserInput } from "../../codex-instructions/index.js";
import type { SessionQueuedSubmission } from "../../codex-session/index.js";
import {
	CodexWorkhorseQueueError,
	type CodexWorkhorseQueue,
	type QueueBeforeEffect,
	type QueueEffectContext,
	type QueueMutationOutcome,
	type QueueSnapshot,
} from "../../codex-workhorse-queue/index.js";
import type {
	IdentityAuthority,
	OperationAuthority,
	OperationId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";

export class FakeQueue implements CodexWorkhorseQueue<OperationId> {
	readonly calls: string[] = [];
	state: SessionQueuedSubmission[] = [];
	nextError: Error | null = null;
	nextOutcome: QueueMutationOutcome = "delivered";
	nextStartTurnId: TurnId | null;
	beforeEffect: (() => void) | null = null;
	private nextId = 0;

	constructor(
		readonly identity: IdentityAuthority,
		readonly operation: OperationAuthority,
	) {
		this.nextStartTurnId = identity.decoder.adoptTurnId("queue-start-turn");
	}

	async list() {
		this.calls.push("list");
		return Object.freeze({ operation: "list" as const, queue: this.snapshot() });
	}

	async add(request: Parameters<CodexWorkhorseQueue<OperationId>["add"]>[0]) {
		this.calls.push("add");
		await this.authorize(request.beforeEffect, { operation: "add", target: null });
		this.throwNext();
		const item = {
			id: this.identity.decoder.adoptQueuedSubmissionId("queue-" + this.nextId++),
			input: [createTextUserInput(request.prompt)],
			clientUserMessageId: this.operation.decoder.serializeOperationId(request.operationId),
		};
		if (this.nextOutcome === "delivered") this.state = [...this.state, item];
		return this.result("add", request.operationId);
	}

	async update(request: Parameters<CodexWorkhorseQueue<OperationId>["update"]>[0]) {
		this.calls.push("update");
		await this.authorize(request.beforeEffect, {
			operation: "update",
			target: this.target(request.submissionId),
		});
		this.throwNext();
		this.state = this.state.map((item) =>
			item.id === request.submissionId
				? { ...item, input: [createTextUserInput(request.prompt)] }
				: item,
		);
		return this.result("update", request.operationId);
	}

	async delete(request: Parameters<CodexWorkhorseQueue<OperationId>["delete"]>[0]) {
		this.calls.push("delete");
		await this.authorize(request.beforeEffect, {
			operation: "delete",
			target: this.target(request.submissionId),
		});
		this.throwNext();
		this.state = this.state.filter((item) => item.id !== request.submissionId);
		return this.result("delete", request.operationId);
	}

	async reorder(request: Parameters<CodexWorkhorseQueue<OperationId>["reorder"]>[0]) {
		this.calls.push("reorder");
		await this.authorize(request.beforeEffect, { operation: "reorder", target: null });
		this.throwNext();
		const byId = new Map(this.state.map((item) => [item.id, item]));
		this.state = request.orderedSubmissionIds.flatMap((id) => {
			const item = byId.get(id);
			return item === undefined ? [] : [item];
		});
		return this.result("reorder", request.operationId);
	}

	async start(request: Parameters<CodexWorkhorseQueue<OperationId>["start"]>[0]) {
		this.calls.push("start");
		const target = this.target(request.submissionId);
		if (target === null) throw new Error("missing queue start target");
		await this.authorize(request.beforeEffect, { operation: "start", target });
		this.throwNext();
		this.state = this.state.filter((item) => item.id !== request.submissionId);
		return Object.freeze({
			...this.result("start", request.operationId),
			clientUserMessageId: target.clientUserMessageId,
			turnId: this.nextOutcome === "not_delivered" ? null : this.nextStartTurnId,
		});
	}

	private target(id: SessionQueuedSubmission["id"]): SessionQueuedSubmission | null {
		return this.state.find((item) => item.id === id) ?? null;
	}

	private snapshot(): QueueSnapshot {
		return Object.freeze([...this.state]);
	}

	private async authorize(
		hook: QueueBeforeEffect | undefined,
		context: QueueEffectContext,
	): Promise<void> {
		try {
			this.beforeEffect?.();
			await hook?.(context);
		} catch (error) {
			throw new CodexWorkhorseQueueError("authorization_failed", "revoked", {
				outcome: "not_delivered",
				cause: error,
			});
		}
	}

	private throwNext(): void {
		if (this.nextError === null) return;
		const error = this.nextError;
		this.nextError = null;
		throw error;
	}

	private result<Operation extends "add" | "update" | "delete" | "reorder" | "start">(
		operation: Operation,
		operationId: OperationId,
	) {
		return Object.freeze({
			operation,
			operationId,
			outcome: this.nextOutcome,
			queue: this.snapshot(),
		});
	}
}
