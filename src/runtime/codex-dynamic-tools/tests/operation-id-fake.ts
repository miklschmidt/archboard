import type { OperationId } from "../../../shared/codex-workbench-identity/index.js";
import type {
	DynamicOperationIdPort,
	DynamicOperationTerminalDisposition,
	DynamicOperationTerminalResult,
} from "../index.js";
import type { AuthorityIds } from "./fixtures.js";

export class FakeOperationIds implements DynamicOperationIdPort {
	readonly issued: OperationId[] = [];
	readonly consumed: OperationId[] = [];
	readonly retired: OperationId[] = [];
	readonly terminalAttempts: Array<{
		readonly operationId: OperationId;
		readonly disposition: DynamicOperationTerminalDisposition;
	}> = [];
	readonly terminalFaults: Array<"before" | "after"> = [];
	issueErrorAt: number | null = null;
	private issueAttempts = 0;
	private readonly terminal = new Map<OperationId, DynamicOperationTerminalResult>();
	private readonly operation: AuthorityIds["operation"];

	constructor(authorities: AuthorityIds) {
		this.operation = authorities.operation;
	}

	issueCanonicalOperationId(): OperationId {
		this.issueAttempts += 1;
		if (this.issueErrorAt === this.issueAttempts)
			throw new Error("operation identity issuance failed");
		const id = this.operation.issuer.mintOperationId();
		this.issued.push(id);
		return id;
	}

	validateCurrentUnconsumedOperationId(operationId: OperationId): void {
		this.operation.validator.assertCurrentOperationId(operationId);
		if (this.terminal.has(operationId)) throw new Error("the operation identity is terminal");
	}

	serializeForOwnedWireFields(operationId: OperationId): string {
		return String(this.operation.decoder.serializeOperationId(operationId));
	}

	terminalizeCanonicalOperationId(input: {
		readonly operationId: OperationId;
		readonly disposition: DynamicOperationTerminalDisposition;
	}): DynamicOperationTerminalResult {
		this.operation.validator.assertCurrentOperationId(input.operationId);
		this.terminalAttempts.push(input);
		const fault = this.terminalFaults.shift();
		if (fault === "before") throw new Error("terminal operation failed before transition");
		const existing = this.terminal.get(input.operationId);
		if (existing !== undefined && existing.disposition !== input.disposition)
			throw new Error("terminal operation disposition changed");
		const result =
			existing ??
			Object.freeze({
				operationId: input.operationId,
				disposition: input.disposition,
				terminal: true as const,
			});
		if (existing === undefined) {
			this.terminal.set(input.operationId, result);
			if (input.disposition === "consumed") this.consumed.push(input.operationId);
			else this.retired.push(input.operationId);
		}
		if (fault === "after") throw new Error("terminal operation failed after transition");
		return result;
	}

	readCanonicalOperationTerminalResult(
		operationId: OperationId,
	): DynamicOperationTerminalResult | null {
		this.operation.validator.assertCurrentOperationId(operationId);
		return this.terminal.get(operationId) ?? null;
	}
}
