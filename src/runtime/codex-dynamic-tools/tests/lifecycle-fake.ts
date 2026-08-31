import type { ChildEpoch, ChildId } from "../../../shared/codex-workbench-identity/index.js";
import type {
	DynamicMutationQuarantineIdentity,
	DynamicMutationQuarantineOwner,
	DynamicMutationTerminalProof,
	DynamicToolLifecyclePort,
	DynamicWaitEvent,
	DynamicWaitOwner,
} from "../index.js";

export class FakeLifecycle implements DynamicToolLifecyclePort {
	readonly assertions: string[] = [];
	readonly registered: DynamicWaitOwner[] = [];
	readonly releases: Array<{ readonly cause: string; readonly owner: DynamicWaitOwner }> = [];
	readonly childReleases: ChildId[] = [];
	readonly quarantineInputs: Array<{
		readonly identity: DynamicMutationQuarantineIdentity;
		readonly retryTerminalization: () => Promise<DynamicMutationTerminalProof>;
	}> = [];
	readonly poisonedEpochs = new Set<string>();
	private readonly exitResolvers: Array<
		(value: { readonly child: ChildId; readonly epoch: ChildEpoch; readonly exited: true }) => void
	> = [];
	readonly waitInputs: Array<{
		readonly owner: DynamicWaitOwner;
		readonly cursor: string | null;
		readonly timeoutMs: number;
		readonly previousSequence: number;
	}> = [];
	waitEvent: DynamicWaitEvent | Error = {
		event: "timeout",
		threadId: null,
		sequence: 0,
		cursor: null,
	};
	assertionError: Error | null = null;
	assertionErrorPhase: string | null = null;

	assertCallExecuting(input: Parameters<DynamicToolLifecyclePort["assertCallExecuting"]>[0]): void {
		this.assertions.push(input.phase);
		if (this.poisonedEpochs.has(`${String(input.caller.childId)}:${String(input.caller.epoch)}`))
			throw new Error("the exact child epoch is poisoned");
		if (
			this.assertionError !== null &&
			(this.assertionErrorPhase === null || this.assertionErrorPhase === input.phase)
		)
			throw this.assertionError;
	}

	registerWaitOwner(input: { readonly owner: DynamicWaitOwner }): void {
		this.registered.push(input.owner);
	}

	releaseWaitOwner(input: {
		readonly owner: DynamicWaitOwner;
		readonly cause: "settle" | "cancellation" | "interruption" | "disconnect";
	}): void {
		this.releases.push(input);
	}

	releaseWaitOwnersForChild(input: { readonly child: ChildId }): void {
		this.childReleases.push(input.child);
	}

	poisonEpochAndOwnMutationQuarantine(input: {
		readonly identity: DynamicMutationQuarantineIdentity;
		readonly retryTerminalization: () => Promise<DynamicMutationTerminalProof>;
	}): DynamicMutationQuarantineOwner {
		this.quarantineInputs.push(input);
		this.poisonedEpochs.add(`${String(input.identity.child)}:${String(input.identity.epoch)}`);
		let resolveExit!: (value: {
			readonly child: ChildId;
			readonly epoch: ChildEpoch;
			readonly exited: true;
		}) => void;
		const childExit = new Promise<{
			readonly child: ChildId;
			readonly epoch: ChildEpoch;
			readonly exited: true;
		}>((resolve) => {
			resolveExit = resolve;
		});
		this.exitResolvers.push(resolveExit);
		return Object.freeze({
			child: input.identity.child,
			childExit,
			epoch: input.identity.epoch,
			poisoned: true,
		});
	}

	retryQuarantine(index = 0): Promise<DynamicMutationTerminalProof> {
		const input = this.quarantineInputs[index];
		if (input === undefined) throw new Error("missing quarantine owner");
		return input.retryTerminalization();
	}

	exitQuarantine(index = 0): void {
		const input = this.quarantineInputs[index];
		const resolve = this.exitResolvers[index];
		if (input === undefined || resolve === undefined) throw new Error("missing quarantine owner");
		resolve({ child: input.identity.child, epoch: input.identity.epoch, exited: true });
	}

	exitQuarantineWith(child: ChildId, epoch: ChildEpoch, index = 0): void {
		const resolve = this.exitResolvers[index];
		if (resolve === undefined) throw new Error("missing quarantine owner");
		resolve({ child, epoch, exited: true });
	}

	async waitForTargets(input: {
		readonly owner: DynamicWaitOwner;
		readonly cursor: string | null;
		readonly timeoutMs: number;
		readonly previousSequence: number;
	}): Promise<DynamicWaitEvent> {
		this.waitInputs.push(input);
		if (this.waitEvent instanceof Error) throw this.waitEvent;
		return this.waitEvent;
	}
}
