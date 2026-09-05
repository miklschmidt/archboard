import { expect, test } from "bun:test";
import type { CodexSession } from "../../../runtime/codex-session/index.js";
import { decodeServerNotification } from "../../../runtime/codex-protocol/index.js";
import type { TransportServerNotification } from "../../../runtime/codex-transport/index.js";
import { createCodexWorkbenchGateway } from "../../codex-workbench/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import {
	projectionHarness,
	type HarnessOverrides,
} from "./support/codex-workbench-projection-harness.js";
import { processFacts } from "./support/codex-workbench-process-fixture.js";

const accountResponse = {
	account: { type: "chatgpt", email: "fixture@example.test", planType: "plus" },
	requiresOpenaiAuth: true,
} as const;

function harness(overrides: HarnessOverrides = {}) {
	const value = projectionHarness({
		...overrides,
		session: { accountRead: async () => accountResponse, ...overrides.session },
	});
	value.setFacts(processFacts());
	value.state.account = { kind: "account", state: "signed_out" };
	const gateway = createCodexWorkbenchGateway({
		...value.options,
		identity: value.authorities,
		threadLink: { read: () => value.context.binding },
	});
	const connection = gateway.connect(value.context.browserId, value.context.paneId);
	const command = (fields: Record<string, unknown>) => {
		const lease = connection.claimLease();
		return connection.command({
			kind: "browser_command",
			commandId: lease.commandId,
			paneId: lease.paneId,
			childId: lease.childId,
			epoch: lease.epoch,
			...fields,
		});
	};
	const notify = (method: string, params: Record<string, unknown>, foreign = false) => {
		const notification = decodeServerNotification({ method, params });
		const authority = foreign ? createIdentityAuthorities() : value.authorities;
		const event: TransportServerNotification = {
			correlation: {
				child: authority.identity.validator.childId,
				epoch: authority.identity.validator.epoch,
				requestId: null,
			},
			notification,
		};
		value.notifyAccount(event);
	};
	return {
		...value,
		gateway,
		connection,
		command,
		notify,
		login: () => command({ command: "accountLogin", login: { type: "chatgpt" } }),
		complete: (loginId = "login-readiness", success = true, foreign = false) =>
			notify(
				"account/login/completed",
				{
					loginId,
					success,
					error: success ? null : "fixture failure",
					onboardingEntrypoint: null,
				},
				foreign,
			),
	};
}

async function flush() {
	for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("authorization URLs are HTTPS and malformed input is a closed refusal", () => {
	const identity = createIdentityAuthorities();
	const schema = createCodexBrowserModel(identity).BrowserLoginSchema;
	const pending = {
		kind: "login",
		state: "pending",
		variant: "chatgpt",
		loginId: identity.identity.decoder.adoptLoginId("login-safe"),
	};
	for (const authUrl of ["not a URL", "http://example.test/login", "javascript:alert(1)"])
		expect(schema.safeParse({ ...pending, authUrl }).success).toBe(false);
	expect(schema.safeParse({ ...pending, authUrl: "https://example.test/login" }).success).toBe(
		true,
	);
});

test("matching completion refreshes the account while coordinator failure stays separate", async () => {
	const value = harness({
		coordinator: {
			ensure: async () => {
				throw new Error("coordinator failed");
			},
		},
	});
	try {
		await value.login();
		value.complete("other-login");
		value.complete("login-readiness", true, true);
		expect(value.state.login.state).toBe("pending");
		value.complete();
		await flush();
		expect(value.connection.snapshot().snapshot).toMatchObject({
			login: { state: "completed", loginId: value.loginId },
			account: { state: "ready" },
			readiness: { state: "account_ready" },
		});
	} finally {
		await value.gateway.dispose();
	}
});

test("account updated clears only the pending sign-in captured by its authoritative read", async () => {
	const response = deferred<typeof accountResponse>();
	const value = harness({ session: { accountRead: () => response.promise } });
	try {
		await value.login();
		value.notify("account/updated", { authMode: "chatgpt", planType: "plus" });
		await value.command({ command: "accountLoginCancel", loginId: value.loginId });
		response.resolve(accountResponse);
		await flush();
		expect(value.state.login.state).toBe("cancelled");
		expect(value.state.account).toMatchObject({ kind: "account", state: "unknown" });
		value.complete();
		expect(value.state.login.state).toBe("cancelled");
	} finally {
		await value.gateway.dispose();
	}
});

test("completion during cancellation cannot override its result, and notFound is not cancelled", async () => {
	const cancel = deferred<{ status: "notFound" }>();
	const entered = deferred<void>();
	const value = harness({
		session: {
			accountLoginCancel: async () => {
				entered.resolve();
				return cancel.promise;
			},
		},
	});
	try {
		await value.login();
		const pending = value.command({ command: "accountLoginCancel", loginId: value.loginId });
		await entered.promise;
		value.complete();
		cancel.resolve({ status: "notFound" });
		await pending;
		expect(value.state.login).toMatchObject({ state: "failed", loginId: value.loginId });
	} finally {
		await value.gateway.dispose();
	}
});

test("account update completes pending login without requiring notification ordering", async () => {
	const value = harness();
	try {
		await value.login();
		value.notify("account/updated", { authMode: "chatgpt", planType: "plus" });
		await flush();
		expect(value.state.login.state).toBe("completed");
		value.complete();
		expect(value.state.login.state).toBe("completed");
	} finally {
		await value.gateway.dispose();
	}
});

test("disposing the gateway invalidates an in-flight account refresh", async () => {
	const response = deferred<typeof accountResponse>();
	const value = harness({ session: { accountRead: () => response.promise } });
	await value.login();
	value.complete();
	const before = structuredClone(value.state);
	await value.gateway.dispose();
	response.resolve(accountResponse);
	await flush();
	expect(value.state).toEqual(before);
});

test("API key login reads account truth even without a pending login ID", async () => {
	const value = harness({ session: { accountLogin: async () => ({ type: "apiKey" }) } });
	try {
		await value.command({
			command: "accountLogin",
			login: { type: "apiKey", apiKey: "fixture-key" },
		});
		expect(value.connection.snapshot().snapshot).toMatchObject({
			account: { state: "ready" },
			login: { state: "idle" },
		});
	} finally {
		await value.gateway.dispose();
	}
});

test("failed completion retains its reason after an authoritative signed-out account read", async () => {
	const value = harness({
		session: { accountRead: async () => ({ account: null, requiresOpenaiAuth: true }) },
	});
	try {
		await value.login();
		value.complete("login-readiness", false);
		await flush();
		expect(value.connection.snapshot().snapshot).toMatchObject({
			account: { state: "signed_out" },
			login: {
				state: "failed",
				loginId: value.loginId,
				reason: "ChatGPT sign-in did not complete. Start sign-in again when ready.",
			},
		});
	} finally {
		await value.gateway.dispose();
	}
});

test("a completion received before the login RPC continuation is matched after the reply", async () => {
	const response = deferred<Awaited<ReturnType<CodexSession["accountLogin"]>>>();
	const entered = deferred<void>();
	const value = harness({
		session: {
			accountLogin: async () => {
				entered.resolve();
				return response.promise;
			},
		},
	});
	try {
		const pending = value.login();
		await entered.promise;
		value.complete();
		response.resolve({
			type: "chatgpt",
			loginId: value.loginId,
			authUrl: "https://example.test/login",
		});
		await pending;
		await flush();
		expect(value.state.login.state).toBe("completed");
	} finally {
		await value.gateway.dispose();
	}
});
