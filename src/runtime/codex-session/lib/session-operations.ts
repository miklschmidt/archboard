import { LOGIN_POLICIES, SupportedLoginAccountParamsSchema } from "@/runtime/codex-protocol";
import {
	CodexSessionError,
	type CodexSession,
	type CodexSessionOptions,
	type SessionParams,
} from "@/runtime/codex-session/lib/contract";
import type { OutboundMethod } from "@/runtime/codex-session/lib/request-identities";
import type { SessionResponsePayloads } from "@/runtime/codex-session/lib/results";
import { isRecord, mutationOutcome } from "@/runtime/codex-session/lib/session-failures";

/** How far initialization must have got before a call is allowed to leave the session. */
type SessionGate = "login-capable" | "thread-capable";

/** The session machinery every protocol operation is expressed through. */
interface SessionOperationPorts {
	readonly read: <Method extends OutboundMethod>(
		method: Method,
		params: unknown,
		gate: SessionGate,
	) => Promise<SessionResponsePayloads[Method]>;
	readonly mutate: <Method extends OutboundMethod>(
		method: Method,
		params: unknown,
		gate: SessionGate | undefined,
		prepare?: (value: unknown) => unknown,
	) => Promise<SessionResponsePayloads[Method]>;
	/** Record whether the signed-in account may run thread operations. */
	readonly setAccountReadiness: (ready: boolean) => void;
	/** Whether thread operations are allowed right now. */
	readonly isThreadReady: () => boolean;
	readonly lifecycle: CodexSessionOptions["lifecycle"];
}

/** Every Codex protocol operation this session exposes, apart from initialization. */
type SessionOperations = Omit<
	CodexSession,
	| "initialize"
	| "respondCurrentTime"
	| "respondUnsupportedTokenRefresh"
	| "respondUnsupportedAttestation"
>;

/**
 * The login variant the caller named, if it named one at all.
 * @param value - The caller's login parameters.
 * @returns The variant name, or undefined when the parameters do not carry one.
 */
function loginVariant(value: unknown): string | undefined {
	return isRecord(value) && typeof value["type"] === "string" ? value["type"] : undefined;
}

/**
 * Refuse a login variant the review rejected, and the two Bedrock setups Archboard does not
 * implement, naming which of the two reasons applies.
 * @param variant - The login variant the caller named.
 */
function assertReviewedLoginVariant(variant: string | undefined): void {
	const policy = LOGIN_POLICIES.find((candidate) => candidate.variant === variant);
	if (policy?.policy === "refused") {
		throw new CodexSessionError(
			"unsupported_login",
			`The reviewed login variant ${JSON.stringify(variant)} is refused before RPC.`,
		);
	}
	if (variant === "profile" || variant === "environment") {
		throw new CodexSessionError(
			"unsupported_login",
			`The reviewed Bedrock ${variant} setup is refused before RPC.`,
		);
	}
}

/**
 * Refuse the login variants Archboard does not implement before any RPC is sent, then prove the
 * remainder against the supported-login schema. Doing this in the session, not at the wire,
 * keeps a refused sign-in from ever reaching the app-server.
 * @param value - The caller's login parameters.
 * @returns The parameters, narrowed to a supported login variant.
 */
function validateLogin(value: unknown): unknown {
	const variant = loginVariant(value);
	assertReviewedLoginVariant(variant);
	const supported = SupportedLoginAccountParamsSchema.safeParse(value);
	if (!supported.success) {
		throw new CodexSessionError(
			"unsupported_login",
			"The login variant is not supported by the reviewed Archboard session.",
		);
	}
	return supported.data;
}

/**
 * Read the account and adopt what it says about readiness: an account that is present opens the
 * thread gate and tells the process lifecycle the child is usable, an absent one closes it.
 * @param ports - The session machinery.
 * @param params - The account/read parameters.
 * @returns The account result.
 */
async function readAccount(
	ports: SessionOperationPorts,
	params?: SessionParams<"account/read">,
): Promise<SessionResponsePayloads["account/read"]> {
	const result = await ports.read("account/read", params, "login-capable");
	if (result.account === null) {
		ports.setAccountReadiness(false);
	} else {
		ports.setAccountReadiness(true);
		ports.lifecycle?.markAccountReady();
	}
	return result;
}

/**
 * Log out, closing the thread gate before the request so no thread call races the sign-out. The
 * gate reopens only when the failure proves the logout never reached Codex; an unknown outcome
 * leaves the account closed, because it may in fact be signed out.
 * @param ports - The session machinery.
 * @returns The logout result.
 */
async function logOutAccount(
	ports: SessionOperationPorts,
): Promise<SessionResponsePayloads["account/logout"]> {
	const restoreReady = ports.isThreadReady();
	if (restoreReady) {
		ports.setAccountReadiness(false);
	}
	try {
		const result = await ports.mutate("account/logout", undefined, "login-capable");
		ports.setAccountReadiness(false);
		return result;
	} catch (error) {
		ports.setAccountReadiness(restoreReady && mutationOutcome(error) === "not_delivered");
		throw error;
	}
}

/**
 * Build the session's protocol surface: one named operation per app-server method, each stating
 * which gate it needs and whether it is a read or a mutation. Nothing else in the session decides
 * that, so a method's delivery semantics are readable in one place.
 * @param ports - The session machinery every operation runs through.
 * @returns The frozen operations.
 */
function createSessionOperations(ports: SessionOperationPorts): SessionOperations {
	const { read, mutate } = ports;
	return Object.freeze({
		/**
		 * Read the effective Codex configuration.
		 * @param params - The config/read parameters.
		 * @returns The configuration.
		 */
		configRead: (params?: SessionParams<"config/read">) =>
			read("config/read", params, "login-capable"),
		/**
		 * Read the signed-in account and adopt its readiness.
		 * @param params - The account/read parameters.
		 * @returns The account result.
		 */
		accountRead: (params?: SessionParams<"account/read">) => readAccount(ports, params),
		/**
		 * Start a sign-in, refusing every unsupported login variant before the RPC.
		 * @param params - The login parameters.
		 * @returns The login result.
		 */
		accountLogin: (params: Parameters<CodexSession["accountLogin"]>[0]) =>
			mutate("account/login/start", params, "login-capable", validateLogin),
		/**
		 * Cancel a sign-in that is still pending.
		 * @param params - The cancel parameters naming the login.
		 * @returns The cancel result.
		 */
		accountLoginCancel: (params: SessionParams<"account/login/cancel">) =>
			mutate("account/login/cancel", params, "login-capable"),
		/**
		 * Sign out and close the thread gate.
		 * @returns The logout result.
		 */
		accountLogout: () => logOutAccount(ports),
		/**
		 * List the models the account may use.
		 * @param params - The model/list parameters.
		 * @returns The model page.
		 */
		modelList: (params?: SessionParams<"model/list">) =>
			read("model/list", params, "login-capable"),
		/**
		 * Start a new thread.
		 * @param params - The thread/start parameters.
		 * @returns The started thread.
		 */
		threadStart: (params: SessionParams<"thread/start">) =>
			mutate("thread/start", params, "thread-capable"),
		/**
		 * Fork an existing thread.
		 * @param params - The thread/fork parameters.
		 * @returns The forked thread.
		 */
		threadFork: (params: SessionParams<"thread/fork">) =>
			mutate("thread/fork", params, "thread-capable"),
		/**
		 * List threads, one page at a time.
		 * @param params - The thread/list parameters.
		 * @returns The thread page.
		 */
		threadListPage: (params?: SessionParams<"thread/list">) =>
			read("thread/list", params, "thread-capable"),
		/**
		 * List the threads the app-server currently holds loaded.
		 * @param params - The thread/loaded/list parameters.
		 * @returns The loaded-thread page.
		 */
		threadLoadedListPage: (params?: SessionParams<"thread/loaded/list">) =>
			read("thread/loaded/list", params, "thread-capable"),
		/**
		 * Read one thread.
		 * @param params - The thread/read parameters.
		 * @returns The thread.
		 */
		threadRead: (params: SessionParams<"thread/read">) =>
			read("thread/read", params, "thread-capable"),
		/**
		 * List a thread's turns, one page at a time.
		 * @param params - The thread/turns/list parameters.
		 * @returns The turn page.
		 */
		threadTurnsListPage: (params: SessionParams<"thread/turns/list">) =>
			read("thread/turns/list", params, "thread-capable"),
		/**
		 * List a thread's items, one page at a time.
		 * @param params - The thread/items/list parameters.
		 * @returns The item page.
		 */
		threadItemsListPage: (params: SessionParams<"thread/items/list">) =>
			read("thread/items/list", params, "thread-capable"),
		/**
		 * Delete a thread.
		 * @param params - The thread/delete parameters.
		 * @returns The delete result.
		 */
		threadDelete: (params: SessionParams<"thread/delete">) =>
			mutate("thread/delete", params, "thread-capable"),
		/**
		 * Update a thread's settings.
		 * @param params - The thread/settings/update parameters.
		 * @returns The updated settings.
		 */
		threadSettingsUpdate: (params: SessionParams<"thread/settings/update">) =>
			mutate("thread/settings/update", params, "thread-capable"),
		/**
		 * Start a turn on a thread.
		 * @param params - The turn/start parameters.
		 * @returns The started turn.
		 */
		turnStart: (params: SessionParams<"turn/start">) =>
			mutate("turn/start", params, "thread-capable"),
		/**
		 * Steer the turn that is running.
		 * @param params - The turn/steer parameters.
		 * @returns The steer result.
		 */
		turnSteer: (params: SessionParams<"turn/steer">) =>
			mutate("turn/steer", params, "thread-capable"),
		/**
		 * Interrupt the turn that is running.
		 * @param params - The turn/interrupt parameters.
		 * @returns The interrupt result.
		 */
		turnInterrupt: (params: SessionParams<"turn/interrupt">) =>
			mutate("turn/interrupt", params, "thread-capable"),
		/**
		 * Queue a submission behind the running turn.
		 * @param params - The queue/add parameters.
		 * @returns The queue after the add.
		 */
		queueAdd: (params: SessionParams<"thread/queue/add">) =>
			mutate("thread/queue/add", params, "thread-capable"),
		/**
		 * List the queue, one page at a time.
		 * @param params - The queue/list parameters.
		 * @returns The queue page.
		 */
		queueListPage: (params: SessionParams<"thread/queue/list">) =>
			read("thread/queue/list", params, "thread-capable"),
		/**
		 * Change a queued submission.
		 * @param params - The queue/update parameters.
		 * @returns The queue after the update.
		 */
		queueUpdate: (params: SessionParams<"thread/queue/update">) =>
			mutate("thread/queue/update", params, "thread-capable"),
		/**
		 * Remove a queued submission.
		 * @param params - The queue/delete parameters.
		 * @returns The queue after the delete.
		 */
		queueDelete: (params: SessionParams<"thread/queue/delete">) =>
			mutate("thread/queue/delete", params, "thread-capable"),
		/**
		 * Reorder the queue.
		 * @param params - The queue/reorder parameters.
		 * @returns The reordered queue.
		 */
		queueReorder: (params: SessionParams<"thread/queue/reorder">) =>
			mutate("thread/queue/reorder", params, "thread-capable"),
		/**
		 * Start one queued submission now.
		 * @param params - The queue/start parameters.
		 * @returns The queue after the start.
		 */
		queueStart: (params: SessionParams<"thread/queue/start">) =>
			mutate("thread/queue/start", params, "thread-capable"),
		/**
		 * Inject items into a thread's model-visible history without starting a turn; this is how
		 * a board change reaches a running conversation.
		 * @param params - The inject_items parameters.
		 * @returns The injection result.
		 */
		threadInjectItems: (params: SessionParams<"thread/inject_items">) =>
			mutate("thread/inject_items", params, "thread-capable"),
		/**
		 * Start a realtime voice session on a thread.
		 * @param params - The realtime/start parameters.
		 * @returns The started realtime session.
		 */
		realtimeStart: (params: SessionParams<"thread/realtime/start">) =>
			mutate("thread/realtime/start", params, "thread-capable"),
		/**
		 * Append typed text to a realtime session.
		 * @param params - The appendText parameters.
		 * @returns The append result.
		 */
		realtimeAppendText: (params: SessionParams<"thread/realtime/appendText">) =>
			mutate("thread/realtime/appendText", params, "thread-capable"),
		/**
		 * Append captured speech to a realtime session.
		 * @param params - The appendSpeech parameters.
		 * @returns The append result.
		 */
		realtimeAppendSpeech: (params: SessionParams<"thread/realtime/appendSpeech">) =>
			mutate("thread/realtime/appendSpeech", params, "thread-capable"),
		/**
		 * Stop a realtime voice session.
		 * @param params - The realtime/stop parameters.
		 * @returns The stop result.
		 */
		realtimeStop: (params: SessionParams<"thread/realtime/stop">) =>
			mutate("thread/realtime/stop", params, "thread-capable"),
		/**
		 * List a thread's timeline, one page at a time.
		 * @param params - The timeline/list parameters.
		 * @returns The timeline page.
		 */
		timelineListPage: (params: SessionParams<"thread/timeline/list">) =>
			read("thread/timeline/list", params, "thread-capable"),
	});
}

export {
	createSessionOperations,
	validateLogin,
	type SessionGate,
	type SessionOperationPorts,
	type SessionOperations,
};
