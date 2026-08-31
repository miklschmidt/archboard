import type { ChildEpoch, ChildId } from "../../../shared/codex-workbench-identity/index.js";
import type {
	DynamicEpochTeardownProof,
	DynamicFailClosedShutdownOwner,
	DynamicFailClosedShutdownReason,
	DynamicFatalLifecycleFault,
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
	readonly releases: Array<{
		readonly cause: string;
		readonly owner: DynamicWaitOwner;
	}> = [];
	readonly childReleases: ChildId[] = [];
	readonly quarantineInputs: Array<{
		readonly identity: DynamicMutationQuarantineIdentity;
		readonly retryTerminalization: () => Promise<DynamicMutationTerminalProof>;
	}> = [];
	readonly poisonedEpochs = new Set<string>();
	readonly shutdownInputs: Array<{
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
		readonly reason: DynamicFailClosedShutdownReason;
	}> = [];
	readonly fatalFaults: DynamicFatalLifecycleFault[] = [];
	poisonError: Error | null = null;
	poisonOwnerOverride: {
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
	} | null = null;
	shutdownError: Error | null = null;
	shutdownOwnerOverride: {
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
	} | null = null;
	private readonly exitResolvers: Array<
		(value: { readonly child: ChildId; readonly epoch: ChildEpoch; readonly exited: true }) => void
	> = [];
	private readonly teardownResolvers: Array<
		(value: DynamicEpochTeardownProof | PromiseLike<DynamicEpochTeardownProof>) => void
	> = [];
	private readonly teardownRejectors: Array<(error: unknown) => void> = [];
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
		if (this.poisonError !== null) throw this.poisonError;
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
			child: this.poisonOwnerOverride?.child ?? input.identity.child,
			childExit,
			epoch: this.poisonOwnerOverride?.epoch ?? input.identity.epoch,
			poisoned: true,
		});
	}

	failClosedShutdownEpoch(input: {
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
		readonly reason: DynamicFailClosedShutdownReason;
	}): DynamicFailClosedShutdownOwner {
		this.shutdownInputs.push(input);
		if (this.shutdownError !== null) throw this.shutdownError;
		let resolveTeardown!: (
			value: DynamicEpochTeardownProof | PromiseLike<DynamicEpochTeardownProof>,
		) => void;
		let rejectTeardown!: (error: unknown) => void;
		const teardown = new Promise<DynamicEpochTeardownProof>((resolve, reject) => {
			resolveTeardown = resolve;
			rejectTeardown = reject;
		});
		this.teardownResolvers.push(resolveTeardown);
		this.teardownRejectors.push(rejectTeardown);
		return Object.freeze({
			child: this.shutdownOwnerOverride?.child ?? input.child,
			epoch: this.shutdownOwnerOverride?.epoch ?? input.epoch,
			shutdownInitiated: true,
			teardown,
		});
	}

	reportFatalLifecycleFault(fault: DynamicFatalLifecycleFault): void {
		this.fatalFaults.push(fault);
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
		resolve({
			child: input.identity.child,
			epoch: input.identity.epoch,
			exited: true,
		});
	}

	exitQuarantineWith(child: ChildId, epoch: ChildEpoch, index = 0): void {
		const resolve = this.exitResolvers[index];
		if (resolve === undefined) throw new Error("missing quarantine owner");
		resolve({ child, epoch, exited: true });
	}

	completeShutdown(index = 0): void {
		const input = this.shutdownInputs[index];
		if (input === undefined) throw new Error("missing shutdown owner");
		this.completeShutdownWith(input.child, input.epoch, index);
	}

	completeShutdownWith(child: ChildId, epoch: ChildEpoch, index = 0): void {
		const resolve = this.teardownResolvers[index];
		if (resolve === undefined) throw new Error("missing shutdown owner");
		resolve({ child, epoch, sessionClosed: true, transportClosed: true });
	}

	rejectShutdown(error: unknown, index = 0): void {
		const reject = this.teardownRejectors[index];
		if (reject === undefined) throw new Error("missing shutdown owner");
		reject(error);
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
