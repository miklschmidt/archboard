import { TEST_INSTRUCTIONS } from "#tests/runtime/support/host.ts";
import { CODEX_PROTOCOL_VERSION } from "@archboard/codex-app-server/protocol";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";

import { createCodexEpochStore } from "#runtime/store/epoch/epoch.ts";
import { type CodexEpochStore, type EpochStageInput } from "#runtime/store/epoch/contract.ts";
import type {
	SessionParams,
	SessionResponse,
	SessionThread,
	SessionTurn,
} from "@archboard/codex-app-server/session";
import {
	type ThreadLinkBindingSnapshot,
	type ThreadLinkSnapshot,
} from "#runtime/rules/thread-link/contract.ts";
import {
	createIdentityAuthorities,
	type ChildEpoch,
	type ChildId,
	type IdentityAuthorities,
	type ThreadId,
} from "@archboard/codex-app-server/identity";
import { createCodexWorkhorseStart } from "#runtime/services/workhorse-start/start.ts";
import {
	type CodexWorkhorseStart,
	type CodexWorkhorseStartOptions,
	type WorkhorseSessionPort,
	type WorkhorseThreadLinkPort,
} from "#runtime/protocol/workhorse-start/contract.ts";

const CHECKOUT_ROOT = "/workspace/example";

interface WorkhorseFixture {
	readonly authorities: IdentityAuthorities;
	readonly epoch: CodexEpochStore;
	readonly session: FakeSession;
	readonly link: FakeThreadLink;
	readonly starter: CodexWorkhorseStart;
	readonly thread: SessionThread;
	readonly response: SessionResponse<"thread/start">;
	readonly dispose: () => void;
}

class FakeSession implements WorkhorseSessionPort {
	readonly startParams: SessionParams<"thread/start">[] = [];
	readonly readParams: SessionParams<"thread/read">[] = [];
	readonly deleteParams: SessionParams<"thread/delete">[] = [];
	startResult: SessionResponse<"thread/start"> | Error;
	readResult: SessionResponse<"thread/read"> | Error;
	deleteResult: SessionResponse<"thread/delete"> | Error = {};
	startGate: Promise<void> | null = null;
	activeStarts = 0;
	maxActiveStarts = 0;

	constructor(
		startResult: SessionResponse<"thread/start">,
		readResult: SessionResponse<"thread/read">,
	) {
		this.startResult = startResult;
		this.readResult = readResult;
	}

	async threadStart(
		params: SessionParams<"thread/start">,
	): Promise<SessionResponse<"thread/start">> {
		this.startParams.push(params);
		this.activeStarts += 1;
		this.maxActiveStarts = Math.max(this.maxActiveStarts, this.activeStarts);
		try {
			if (this.startGate !== null) {
				await this.startGate;
			}
			if (this.startResult instanceof Error) {
				throw this.startResult;
			}
			return this.startResult;
		} finally {
			this.activeStarts -= 1;
		}
	}

	async threadRead(params: SessionParams<"thread/read">): Promise<SessionResponse<"thread/read">> {
		this.readParams.push(params);
		if (this.readResult instanceof Error) {
			throw this.readResult;
		}
		return this.readResult;
	}

	async threadDelete(
		params: SessionParams<"thread/delete">,
	): Promise<SessionResponse<"thread/delete">> {
		this.deleteParams.push(params);
		if (this.deleteResult instanceof Error) {
			throw this.deleteResult;
		}
		return this.deleteResult;
	}
}

class FakeThreadLink implements WorkhorseThreadLinkPort {
	readonly targets: Array<{
		linkKey: string;
		target: Parameters<NonNullable<CodexWorkhorseStartOptions["threadLink"]["classifyAndBind"]>>[2];
	}> = [];
	outcome: ThreadLinkBindingSnapshot | Error;

	constructor(outcome: ThreadLinkBindingSnapshot | Error) {
		this.outcome = outcome;
	}

	async classifyAndBind(
		linkKey: string,
		_expected: Parameters<
			NonNullable<CodexWorkhorseStartOptions["threadLink"]["classifyAndBind"]>
		>[1],
		target: Parameters<NonNullable<CodexWorkhorseStartOptions["threadLink"]["classifyAndBind"]>>[2],
	): Promise<ThreadLinkBindingSnapshot> {
		this.targets.push({ linkKey, target });
		if (this.outcome instanceof Error) {
			throw this.outcome;
		}
		return this.outcome;
	}
}

function makeFixture(linkOutcome?: ThreadLinkBindingSnapshot): WorkhorseFixture {
	const parent = realpathSync(mkdtempSync(join("/tmp", "voice-workhorse-start-")));
	const epochRoot = join(parent, "epoch");
	const codexHome = join(parent, "codex-home");
	const sqliteHome = join(parent, "codex-sqlite");
	mkdirSync(epochRoot, { recursive: true, mode: 0o700 });
	mkdirSync(codexHome, { recursive: true, mode: 0o700 });
	mkdirSync(sqliteHome, { recursive: true, mode: 0o700 });

	const authorities = createIdentityAuthorities();
	const epoch = createCodexEpochStore({ rootDirectory: epochRoot, codexHome, sqliteHome });
	const epochOperationId = authorities.operation.issuer.mintOperationId();
	const epochInput: EpochStageInput = {
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		operationId: epochOperationId,
		kind: "epoch_start",
		rpc: "epoch/start",
		workspaceRoot: CHECKOUT_ROOT,
		instructionHash: "1".repeat(64),
		manifestHash: "2".repeat(64),
	};
	epoch.startEpoch(epochInput);

	const threadId = authorities.identity.decoder.adoptThreadId("workhorse-1");
	const thread = threadFixture(threadId);
	const response = startResponse(thread);
	const session = new FakeSession(response, { thread });
	const link = new FakeThreadLink(
		linkOutcome ??
			executableBinding(
				"link-1",
				1,
				authorities.identity.validator.childId,
				authorities.identity.validator.epoch,
				threadId,
			),
	);
	const options: CodexWorkhorseStartOptions = {
		session,
		threadLink: link,
		epoch,
		identity: authorities.identity,
		operation: authorities.operation,
		checkoutRoot: CHECKOUT_ROOT,
		profile: TEST_INSTRUCTIONS.workhorse,
	};
	return {
		authorities,
		epoch,
		session,
		link,
		starter: createCodexWorkhorseStart(options),
		thread,
		response,
		dispose: () => {
			epoch.close();
			rmSync(parent, { recursive: true, force: true });
		},
	};
}

function threadFixture(threadId: ThreadId): SessionThread {
	return {
		id: threadId,
		extra: {},
		sessionId: "session-1",
		forkedFromId: null,
		parentThreadId: null,
		preview: "workhorse fixture",
		ephemeral: false,
		section: null,
		sectionEnteredAt: null,
		projectId: null,
		historyMode: "paginated",
		modelProvider: "openai",
		createdAt: 1,
		updatedAt: 2,
		recencyAt: null,
		status: { type: "idle" },
		path: null,
		cwd: CHECKOUT_ROOT,
		cliVersion: CODEX_PROTOCOL_VERSION,
		source: "vscode",
		canAcceptDirectInput: true,
		threadSource: "test-host",
		agentNickname: null,
		agentRole: null,
		gitInfo: null,
		name: null,
		turns: [],
		environments: null,
		model: null,
		reasoningEffort: null,
		originator: null,
		daybreakEnabled: null,
	};
}

function startResponse(
	thread: SessionThread,
	overrides: Partial<
		Pick<SessionResponse<"thread/start">, "approvalPolicy" | "sandbox" | "activePermissionProfile">
	> = {},
): SessionResponse<"thread/start"> {
	return {
		thread,
		model: "gpt-6-luna",
		modelProvider: "openai",
		serviceTier: "priority",
		cwd: CHECKOUT_ROOT,
		runtimeWorkspaceRoots: [CHECKOUT_ROOT],
		instructionSources: [],
		approvalPolicy: "on-request",
		approvalsReviewer: "user",
		sandbox: { type: "dangerFullAccess" },
		activePermissionProfile: { id: "example-default", extends: null },
		reasoningEffort: null,
		multiAgentMode: "explicitRequestOnly",
		disabledPluginIds: [],
		...overrides,
	};
}

function turnFixture(authorities: IdentityAuthorities): SessionTurn {
	return {
		id: authorities.identity.decoder.adoptTurnId("workhorse-turn-1"),
		items: [
			{
				type: "userMessage",
				id: authorities.identity.decoder.adoptItemId("workhorse-item-1"),
				clientId: null,
				content: [{ type: "text", text: "existing turn", text_elements: [] }],
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

function executableBinding(
	linkKey: string,
	revision: number,
	childId: ChildId,
	epoch: ChildEpoch,
	threadId: ThreadId,
): ThreadLinkBindingSnapshot {
	const link: ThreadLinkSnapshot = {
		kind: "thread_link",
		state: "executable",
		childId,
		epoch,
		threadId,
		source: "vscode",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
	return {
		linkKey,
		revision,
		link,
		cas: {
			revision,
			linkKey,
			childId: link.childId,
			epoch: link.epoch,
			threadId: link.threadId,
		},
	};
}

function inspectOnlyBinding(
	linkKey: string,
	revision: number,
	threadId: ThreadId,
): ThreadLinkBindingSnapshot {
	const link: ThreadLinkSnapshot = {
		kind: "thread_link",
		state: "inspect_only",
		childId: null,
		epoch: null,
		threadId,
		source: "vscode",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: false,
		reason: "direct_input_false",
	};
	return {
		linkKey,
		revision,
		link,
		cas: {
			revision,
			linkKey,
			childId: null,
			epoch: null,
			threadId,
		},
	};
}

export {
	CHECKOUT_ROOT,
	type WorkhorseFixture,
	FakeSession,
	FakeThreadLink,
	makeFixture,
	threadFixture,
	startResponse,
	turnFixture,
	executableBinding,
	inspectOnlyBinding,
};
