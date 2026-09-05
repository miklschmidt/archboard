import { describe, expect, test } from "bun:test";

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import {
	buildThreadLinkLogin,
	projectThreadLinkAccount,
	THREAD_LINK_ACCOUNT_FORMS,
	THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS,
	threadLinkAccountForm,
} from "@/ui/workbench-thread-link";
import type {
	ThreadLinkAccountDisclosure,
	ThreadLinkAccountFormId,
} from "@/ui/workbench-thread-link/contracts";
import type {
	ThreadLinkLoginParams,
	WorkbenchTransportState,
} from "@/ui/workbench-thread-link/transport-port";
import {
	capabilities,
	connected,
	loginA,
	loginB,
	snapshot,
} from "@/ui/workbench-thread-link/tests/fixtures";

/** The exact supported set, pinned to the type the transport draft admits. */
const SUPPORTED = [
	"chatgpt",
	"apiKey",
	"amazonBedrock",
	"amazonBedrockAccessKeys",
] as const satisfies readonly ThreadLinkAccountFormId[];

/**
 * The login one complete form builds.
 * @param id The form.
 * @param values The form's values.
 * @returns The login.
 */
function built(id: ThreadLinkAccountFormId, values: Record<string, string>): ThreadLinkLoginParams {
	const result = buildThreadLinkLogin(id, values);
	if (!result.ok) {
		throw new Error(result.reason);
	}
	return result.login;
}

/**
 * The account disclosure of one connected snapshot.
 * @param value The snapshot.
 * @returns The disclosure.
 */
function projectAccount(value: BrowserSnapshot): ThreadLinkAccountDisclosure {
	return projectThreadLinkAccount({ state: connected(value), capabilities: capabilities() });
}

const PENDING_ACCOUNT: BrowserSnapshot["account"] = {
	kind: "account",
	state: "login_pending",
	loginId: loginA,
	variant: "chatgpt",
};
const PENDING_LOGIN: BrowserSnapshot["login"] = {
	kind: "login",
	state: "pending",
	loginId: loginA,
	variant: "chatgpt",
	authUrl: "https://example.test/login",
};

describe("Codex account forms", () => {
	test("renders exactly the four supported forms, each with its vendor field names", () => {
		expect(THREAD_LINK_ACCOUNT_FORMS.map((form) => form.id)).toEqual([...SUPPORTED]);
		expect(threadLinkAccountForm("apiKey").fields.map((field) => field.name)).toEqual(["apiKey"]);
		expect(threadLinkAccountForm("chatgpt").fields).toEqual([]);
		expect(threadLinkAccountForm("chatgpt").label).toBe("ChatGPT");
		expect(threadLinkAccountForm("amazonBedrock").fields.map((field) => field.name)).toEqual([
			"apiKey",
			"region",
		]);
		expect(
			threadLinkAccountForm("amazonBedrockAccessKeys").fields.map((field) => field.name),
		).toEqual(["accessKeyId", "secretAccessKey", "sessionToken", "region"]);
	});

	test("distinguishes the four forms by the login value each one builds", () => {
		expect(built("apiKey", { apiKey: " sk-test " })).toEqual({ type: "apiKey", apiKey: "sk-test" });
		expect(built("chatgpt", {})).toEqual({ type: "chatgpt" });
		expect(built("amazonBedrock", { apiKey: "bedrock-key", region: "us-east-1" })).toEqual({
			type: "amazonBedrock",
			apiKey: "bedrock-key",
			region: "us-east-1",
		});
		expect(
			built("amazonBedrockAccessKeys", {
				accessKeyId: "AKIA",
				secretAccessKey: "secret",
				region: "eu-west-1",
			}),
		).toEqual({
			type: "amazonBedrockAccessKeys",
			accessKeyId: "AKIA",
			secretAccessKey: "secret",
			region: "eu-west-1",
		});
	});

	test("carries the Bedrock session token only when one was supplied", () => {
		expect(
			built("amazonBedrockAccessKeys", {
				accessKeyId: "AKIA",
				secretAccessKey: "secret",
				sessionToken: "temporary",
				region: "eu-west-1",
			}),
		).toEqual({
			type: "amazonBedrockAccessKeys",
			accessKeyId: "AKIA",
			secretAccessKey: "secret",
			sessionToken: "temporary",
			region: "eu-west-1",
		});
		expect(
			built("amazonBedrockAccessKeys", {
				accessKeyId: "AKIA",
				secretAccessKey: "secret",
				sessionToken: "   ",
				region: "eu-west-1",
			}),
		).not.toHaveProperty("sessionToken");
	});

	test("names every missing required field instead of sending an incomplete login", () => {
		const result = buildThreadLinkLogin("amazonBedrockAccessKeys", { accessKeyId: "AKIA" });
		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toBe(
			"Complete every required field before signing in: Secret access key, Region.",
		);
	});

	test("marks every credential field secret and the region not", () => {
		const secrets = THREAD_LINK_ACCOUNT_FORMS.flatMap((form) =>
			form.fields.filter((field) => field.secret).map((field) => field.name),
		);
		expect(new Set(secrets)).toEqual(new Set(["apiKey", "secretAccessKey", "sessionToken"]));
		expect(
			threadLinkAccountForm("amazonBedrock").fields.find((field) => field.name === "region")
				?.secret,
		).toBe(false);
	});

	test("names the sign-in methods this workbench does not offer and why", () => {
		expect(THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS.map((method) => method.id)).toEqual([
			"chatgptDeviceCode",
			"chatgptAuthTokens",
			"amazonBedrockProfile",
			"amazonBedrockEnvironment",
		]);
		for (const method of THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS) {
			expect(method.explanation.startsWith("Unavailable: ")).toBe(true);
		}
		const explanations = THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS.map(
			(method) => method.explanation,
		);
		expect(explanations[0]).toContain("another device");
		expect(explanations[1]).toContain("credential source");
		expect(explanations[2]).toContain("machine-local");
		expect(explanations[3]).toContain("machine-local");
	});
});

describe("Codex account disclosure", () => {
	test("exposes the continuation for the current pending ChatGPT account", () => {
		expect(
			projectAccount(snapshot({ account: PENDING_ACCOUNT, login: PENDING_LOGIN })).authUrl,
		).toBe(PENDING_LOGIN.authUrl);
	});

	test("withholds the continuation while the snapshot is not authoritative", () => {
		const retained = snapshot({ account: PENDING_ACCOUNT, login: PENDING_LOGIN });
		const unsynchronized: readonly WorkbenchTransportState[] = [
			{
				kind: "stream",
				state: "stale_snapshot",
				connection: "connected",
				snapshot: retained,
				sequence: 4,
				expectedSequence: 5,
				receivedSequence: 9,
				reason: "The snapshot sequence skipped.",
			},
			{
				kind: "connection",
				state: "reconnecting",
				connection: "reconnecting",
				snapshot: retained,
				sequence: 4,
				reason: "The workbench disconnected.",
			},
		];
		for (const state of unsynchronized) {
			const disclosure = projectThreadLinkAccount({
				state,
				capabilities: capabilities({ supported: [] }),
			});
			expect(disclosure.authUrl).toBeNull();
			expect(disclosure.state).toBe("login_pending");
			expect(disclosure.pendingLoginId).toBe(loginA);
		}
	});

	test("withholds the continuation unless the login names the same ChatGPT sign-in", () => {
		expect(
			projectAccount(
				snapshot({ account: PENDING_ACCOUNT, login: { kind: "login", state: "idle" } }),
			).authUrl,
		).toBeNull();
		expect(projectAccount(snapshot({ login: PENDING_LOGIN })).authUrl).toBeNull();
		expect(
			projectAccount(
				snapshot({
					account: PENDING_ACCOUNT,
					login: { ...PENDING_LOGIN, variant: "apiKey", authUrl: null },
				}),
			).authUrl,
		).toBeNull();
		expect(
			projectAccount(
				snapshot({ account: PENDING_ACCOUNT, login: { ...PENDING_LOGIN, loginId: loginB } }),
			).authUrl,
		).toBeNull();
	});

	test("discloses each account arm with its own detail", () => {
		const arms: readonly BrowserSnapshot["account"][] = [
			{ kind: "account", state: "unknown", reason: "Codex did not answer account/read." },
			{ kind: "account", state: "signed_out" },
			PENDING_ACCOUNT,
			{ kind: "account", state: "ready", accountType: "amazonBedrock" },
			{ kind: "account", state: "failed", reason: "Codex rejected the API key." },
		];
		const details = arms.map((account) => projectAccount(snapshot({ account })).detail);
		expect(details[0]).toBe("Codex did not answer account/read.");
		expect(details[1]).toContain("Choose how to sign in.");
		expect(details[2]).toContain("cancel to choose another method");
		expect(details[3]).toContain("Signed in with Amazon Bedrock.");
		expect(details[4]).toBe("Codex rejected the API key.");
	});

	test("offers cancel only while a sign-in is pending and sign-out only while signed in", () => {
		const pending = projectAccount(
			snapshot({
				account: { kind: "account", state: "login_pending", loginId: loginA, variant: "apiKey" },
				login: {
					kind: "login",
					state: "pending",
					loginId: loginA,
					variant: "apiKey",
					authUrl: null,
				},
			}),
		);
		expect(pending.pendingLoginId).toBe(loginA);
		expect(pending.canCancelLogin).toBe(true);
		expect(pending.canLogout).toBe(false);
		const ready = projectAccount(snapshot());
		expect(ready.canCancelLogin).toBe(false);
		expect(ready.canLogout).toBe(true);
		expect(ready.pendingLoginId).toBeNull();
	});

	test("says why signing in is unavailable rather than offering a dead control", () => {
		const blocked = projectThreadLinkAccount({
			state: {
				kind: "connection",
				state: "stopped",
				connection: "stopped",
				snapshot: null,
				sequence: null,
				reason: "The workbench is stopped.",
			},
			capabilities: capabilities({ supported: [] }),
		});
		expect(blocked.canLogin).toBe(false);
		expect(blocked.state).toBe("unknown");
		expect(blocked.blockedReason).toContain("Reconnect to Codex");
		expect(blocked.forms).toHaveLength(4);
		expect(blocked.unavailable).toHaveLength(4);
	});
});
