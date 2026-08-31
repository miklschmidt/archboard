import {
	CodexSessionMutationError,
	type SessionQueueAddResult,
	type SessionQueueListResult,
	type SessionQueueStartResult,
	type SessionQueueUpdateResult,
} from "../../codex-session/index.js";
import { createTextUserInput } from "../../codex-instructions/index.js";
import {
	createCodexWorkhorseQueue,
	type CodexWorkhorseQueue,
	type WorkhorseQueueBinding,
	type WorkhorseQueueOperationIdPort,
	type WorkhorseQueueSessionPort,
} from "../index.js";
import {
	createIdentityAuthority,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.js";
import type { QueuedSubmissionId } from "../../../shared/codex-workbench-identity/index.js";

type QueueAddParams = Parameters<WorkhorseQueueSessionPort["queueAdd"]>[0];
type QueueListParams = Parameters<WorkhorseQueueSessionPort["queueListPage"]>[0];
type QueueUpdateParams = Parameters<WorkhorseQueueSessionPort["queueUpdate"]>[0];
type QueueDeleteParams = Parameters<WorkhorseQueueSessionPort["queueDelete"]>[0];
type QueueReorderParams = Parameters<WorkhorseQueueSessionPort["queueReorder"]>[0];
type QueueStartParams = Parameters<WorkhorseQueueSessionPort["queueStart"]>[0];
type QueueDeleteResponse = Awaited<ReturnType<WorkhorseQueueSessionPort["queueDelete"]>>;
type QueueReorderResponse = Awaited<ReturnType<WorkhorseQueueSessionPort["queueReorder"]>>;

export function binding(identity: IdentityAuthority, suffix = "one"): WorkhorseQueueBinding {
	return {
		childId: identity.validator.childId,
		epoch: identity.validator.epoch,
		coordinatorThreadId: identity.decoder.adoptThreadId(`coordinator-${suffix}`),
		workhorseThreadId: identity.decoder.adoptThreadId(`workhorse-${suffix}`),
	};
}

export function submission(
	identity: IdentityAuthority,
	rawId: string,
	prompt: string,
	clientUserMessageId = `client-${rawId}`,
): SessionQueueListResult["data"][number] {
	return {
		id: identity.decoder.adoptQueuedSubmissionId(rawId),
		input: [createTextUserInput(prompt)],
		clientUserMessageId,
	};
}

function startedTurn(identity: IdentityAuthority): SessionQueueStartResult["turn"] {
	const itemId = identity.decoder.adoptItemId("start-item");
	return {
		id: identity.decoder.adoptTurnId("start-turn"),
		items: [
			{
				type: "userMessage",
				id: itemId,
				clientId: null,
				content: [createTextUserInput("started")],
			},
		],
		itemsView: "full",
		status: "completed",
		error: null,
		startedAt: 1,
		completedAt: 2,
		durationMs: 1,
	};
}

export class QueueSession implements WorkhorseQueueSessionPort {
	readonly requests: Array<{ readonly method: string; readonly params: unknown }> = [];
	state: SessionQueueListResult["data"] = [];
	pageMap: ReadonlyMap<string | null, SessionQueueListResult> | null = null;
	nextAddId: QueuedSubmissionId;
	addIds: QueuedSubmissionId[] = [];
	beforeMutation: ((method: string) => void | Promise<void>) | null = null;
	nextAddError: Error | null = null;
	nextStartError: Error | null = null;
	private readonly identity: IdentityAuthority;

	constructor(identity: IdentityAuthority, nextAddId = "queue-added") {
		this.identity = identity;
		this.nextAddId = identity.decoder.adoptQueuedSubmissionId(nextAddId);
	}

	async queueListPage(params: QueueListParams): Promise<SessionQueueListResult> {
		this.requests.push({ method: "thread/queue/list", params });
		if (this.pageMap !== null) {
			const page = this.pageMap.get(params.cursor ?? null);
			if (page === undefined) throw new Error(`missing page for ${params.cursor ?? "null"}`);
			return page;
		}
		return { data: this.state, nextCursor: null };
	}

	async queueAdd(params: QueueAddParams): Promise<SessionQueueAddResult> {
		this.requests.push({ method: "thread/queue/add", params });
		await this.beforeMutation?.("add");
		if (this.nextAddError !== null) {
			const error = this.nextAddError;
			this.nextAddError = null;
			throw error;
		}
		const queuedSubmission = {
			id: this.addIds.shift() ?? this.nextAddId,
			input: params.input,
			clientUserMessageId: params.clientUserMessageId,
		};
		this.state = [...this.state, queuedSubmission];
		return { queuedSubmission };
	}

	async queueUpdate(params: QueueUpdateParams): Promise<SessionQueueUpdateResult> {
		this.requests.push({ method: "thread/queue/update", params });
		await this.beforeMutation?.("update");
		const current = this.state.find((candidate) => candidate.id === params.queuedSubmissionId);
		if (current === undefined) throw new Error("missing update target");
		const queuedSubmission = { ...current, input: params.input };
		this.state = this.state.map((candidate) =>
			candidate.id === params.queuedSubmissionId ? queuedSubmission : candidate,
		);
		return { queuedSubmission };
	}

	async queueDelete(params: QueueDeleteParams): Promise<QueueDeleteResponse> {
		this.requests.push({ method: "thread/queue/delete", params });
		await this.beforeMutation?.("delete");
		const previousLength = this.state.length;
		this.state = this.state.filter((candidate) => candidate.id !== params.queuedSubmissionId);
		return { deleted: this.state.length !== previousLength };
	}

	async queueReorder(params: QueueReorderParams): Promise<QueueReorderResponse> {
		this.requests.push({ method: "thread/queue/reorder", params });
		await this.beforeMutation?.("reorder");
		const byId = new Map(this.state.map((candidate) => [candidate.id, candidate]));
		this.state = params.queuedSubmissionIds
			.map((id) => byId.get(id))
			.filter(
				(candidate): candidate is SessionQueueListResult["data"][number] => candidate !== undefined,
			);
		return {};
	}

	async queueStart(params: QueueStartParams): Promise<SessionQueueStartResult> {
		this.requests.push({ method: "thread/queue/start", params });
		await this.beforeMutation?.("start");
		if (this.nextStartError !== null) {
			const error = this.nextStartError;
			this.nextStartError = null;
			throw error;
		}
		this.state = this.state.filter((candidate) => candidate.id !== params.queuedSubmissionId);
		return { turn: startedTurn(this.identity) };
	}
}

export interface Fixture {
	readonly identity: IdentityAuthority;
	readonly session: QueueSession;
	readonly operationIds: WorkhorseQueueOperationIdPort<string>;
	readonly queue: CodexWorkhorseQueue<string>;
	setBinding: (next: WorkhorseQueueBinding | null) => void;
}

export function fixture(initial: SessionQueueListResult["data"] = []): Fixture {
	const identity = createIdentityAuthority();
	const session = new QueueSession(identity);
	session.state = initial;
	let currentBinding: WorkhorseQueueBinding | null = binding(identity);
	const operationIds: WorkhorseQueueOperationIdPort<string> = {
		assertCurrent: (operationId) => {
			if (operationId === "stale-operation") throw new Error("operation is stale");
		},
		serialize: (operationId) => `client-${operationId}`,
	};
	const queue = createCodexWorkhorseQueue({
		session,
		currentBinding: () => currentBinding,
		identity: { validator: identity.validator },
		operationIds,
	});
	return {
		identity,
		session,
		operationIds,
		queue,
		setBinding: (next) => {
			currentBinding = next;
		},
	};
}

export function requestParams(fixtureValue: Fixture, method: string): unknown {
	const request = fixtureValue.session.requests.find((candidate) => candidate.method === method);
	if (request === undefined) throw new Error(`missing ${method} request`);
	return request.params;
}

export async function flush(): Promise<void> {
	for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

export async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		return new Error("expected the promise to reject");
	} catch (error) {
		return error;
	}
}

export function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
	let resolvePromise: (() => void) | undefined;
	const promise = new Promise<void>((resolve) => {
		resolvePromise = resolve;
	});
	return {
		promise,
		resolve: () => {
			if (resolvePromise === undefined) throw new Error("deferred promise was not initialized");
			resolvePromise();
		},
	};
}

export { CodexSessionMutationError };
