import { describe, expect, test } from "bun:test";

import {
	buildThreadLinkLogin,
	projectThreadLinkAccount,
	THREAD_LINK_ACCOUNT_FORMS,
	THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS,
	threadLinkAccountForm,
} from "../index.js";
import type { ThreadLinkAccountFormId, ThreadLinkLoginParams } from "../index.js";
import { capabilities, loginA, snapshot } from "./fixtures.js";

/** The exact supported set, pinned to the type the transport draft admits. */
const SUPPORTED = [
	"chatgpt",
	"apiKey",
	"amazonBedrock",
	"amazonBedrockAccessKeys",
] as const satisfies readonly ThreadLinkAccountFormId[];

function built(id: ThreadLinkAccountFormId, values: Record<string, string>): ThreadLinkLoginParams {
	const result = buildThreadLinkLogin(id, values);
	if (!result.ok) throw new Error(result.reason);
	return result.login;
}

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
		expect(result.ok).toBeFalse();
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
		).toBeFalse();
	});

	test("names the sign-in methods this workbench does not offer and why", () => {
		expect(THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS.map((method) => method.id)).toEqual([
			"chatgptDeviceCode",
			"chatgptAuthTokens",
			"amazonBedrockProfile",
			"amazonBedrockEnvironment",
		]);
		for (const method of THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS)
			expect(method.explanation.startsWith("Unavailable: ")).toBeTrue();
		expect(THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS[0]?.explanation).toContain("another device");
		expect(THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS[1]?.explanation).toContain("credential source");
		expect(THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS[2]?.explanation).toContain("machine-local");
		expect(THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS[3]?.explanation).toContain("machine-local");
	});
});

describe("Codex account disclosure", () => {
	test("discloses each account arm with its own detail", () => {
		const arms = [
			{ kind: "account", state: "unknown", reason: "Codex did not answer account/read." },
			{ kind: "account", state: "signed_out" },
			{ kind: "account", state: "login_pending", loginId: loginA, variant: "chatgpt" },
			{ kind: "account", state: "ready", accountType: "amazonBedrock" },
			{ kind: "account", state: "failed", reason: "Codex rejected the API key." },
		] as const;
		const details = arms.map(
			(account) =>
				projectThreadLinkAccount({
					snapshot: snapshot({ account }),
					capabilities: capabilities(),
				}).detail,
		);
		expect(details[0]).toBe("Codex did not answer account/read.");
		expect(details[1]).toContain("Choose how to sign in.");
		expect(details[2]).toContain("cancel to choose another method");
		expect(details[3]).toContain("Signed in with Amazon Bedrock.");
		expect(details[4]).toBe("Codex rejected the API key.");
	});

	test("offers cancel only while a sign-in is pending and sign-out only while signed in", () => {
		const pending = projectThreadLinkAccount({
			snapshot: snapshot({
				account: { kind: "account", state: "login_pending", loginId: loginA, variant: "apiKey" },
				login: { kind: "login", state: "pending", loginId: loginA, variant: "apiKey" },
			}),
			capabilities: capabilities(),
		});
		expect(pending.pendingLoginId).toBe(loginA);
		expect(pending.canCancelLogin).toBeTrue();
		expect(pending.canLogout).toBeFalse();
		const ready = projectThreadLinkAccount({
			snapshot: snapshot(),
			capabilities: capabilities(),
		});
		expect(ready.canCancelLogin).toBeFalse();
		expect(ready.canLogout).toBeTrue();
		expect(ready.pendingLoginId).toBeNull();
	});

	test("says why signing in is unavailable rather than offering a dead control", () => {
		const blocked = projectThreadLinkAccount({
			snapshot: null,
			capabilities: capabilities({ supported: [] }),
		});
		expect(blocked.canLogin).toBeFalse();
		expect(blocked.state).toBe("unknown");
		expect(blocked.blockedReason).toContain("Reconnect to Codex");
		expect(blocked.forms).toHaveLength(4);
		expect(blocked.unavailable).toHaveLength(4);
	});
});
