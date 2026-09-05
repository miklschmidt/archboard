import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";

import type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchState,
	ThreadLinkAccountDisclosure,
	ThreadLinkAccountFieldValues,
	ThreadLinkAccountForm,
	ThreadLinkAccountFormId,
	ThreadLinkLoginBuild,
	ThreadLinkLoginParams,
	ThreadLinkUnavailableAccountMethod,
} from "./contract.js";

/**
 * The four account/login/start forms the closed browser contract admits. Their
 * field names are the vendor parameter names, so a form maps onto one login
 * value without a second spelling.
 */
export const THREAD_LINK_ACCOUNT_FORMS = [
	{
		id: "chatgpt",
		label: "ChatGPT",
		description: "Continue with your ChatGPT account.",
		fields: [],
	},
	{
		id: "apiKey",
		label: "API key",
		description: "Use an OpenAI API key.",
		fields: [
			{
				name: "apiKey",
				label: "API key",
				description: "",
				required: true,
				secret: true,
			},
		],
	},
	{
		id: "amazonBedrock",
		label: "Amazon Bedrock API key",
		description: "Enter your Amazon Bedrock API key and region.",
		fields: [
			{
				name: "apiKey",
				label: "Bedrock API key",
				description: "",
				required: true,
				secret: true,
			},
			{
				name: "region",
				label: "Region",
				description: "For example, us-east-1.",
				required: true,
				secret: false,
			},
		],
	},
	{
		id: "amazonBedrockAccessKeys",
		label: "Amazon Bedrock access keys",
		description:
			"Enter your AWS access keys and region. Add a session token for temporary credentials.",
		fields: [
			{
				name: "accessKeyId",
				label: "Access key ID",
				description: "",
				required: true,
				secret: false,
			},
			{
				name: "secretAccessKey",
				label: "Secret access key",
				description: "",
				required: true,
				secret: true,
			},
			{
				name: "sessionToken",
				label: "Session token (optional)",
				description: "",
				required: false,
				secret: true,
			},
			{
				name: "region",
				label: "Region",
				description: "For example, us-east-1.",
				required: true,
				secret: false,
			},
		],
	},
] as const satisfies readonly ThreadLinkAccountForm[];

/**
 * The Codex sign-in methods this workbench deliberately does not offer. Each is
 * named with the reason it is unavailable rather than hidden or disabled blank.
 */
export const THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS = [
	{
		id: "chatgptDeviceCode",
		label: "ChatGPT device code",
		explanation:
			"Unavailable: the device-code flow completes on another device, so this workbench cannot show or confirm its outcome. Use ChatGPT instead.",
	},
	{
		id: "chatgptAuthTokens",
		label: "ChatGPT client tokens",
		explanation:
			"Unavailable: supplying access tokens and a workspace id directly would make the browser a credential source for the owned Codex session. Use ChatGPT instead.",
	},
	{
		id: "amazonBedrockProfile",
		label: "Bedrock named profile setup",
		explanation:
			"Unavailable: a named AWS profile is machine-local Codex setup, not a browser sign-in. Configure it where Codex runs, then sign in with an explicit Bedrock form.",
	},
	{
		id: "amazonBedrockEnvironment",
		label: "Bedrock environment setup",
		explanation:
			"Unavailable: environment-selected Bedrock credentials are machine-local Codex setup, not a browser sign-in. Configure them where Codex runs, then sign in with an explicit Bedrock form.",
	},
] as const satisfies readonly ThreadLinkUnavailableAccountMethod[];

function trimmed(values: ThreadLinkAccountFieldValues, name: string): string {
	return (values[name] ?? "").trim();
}

function missingFields(
	form: ThreadLinkAccountForm,
	values: ThreadLinkAccountFieldValues,
): readonly string[] {
	return form.fields
		.filter((field) => field.required && trimmed(values, field.name).length === 0)
		.map((field) => field.label);
}

export function threadLinkAccountForm(id: ThreadLinkAccountFormId): ThreadLinkAccountForm {
	const form = THREAD_LINK_ACCOUNT_FORMS.find((candidate) => candidate.id === id);
	if (form === undefined) throw new Error(`Unknown Codex sign-in form ${id}.`);
	return form;
}

/** Build one vendor login value, or say exactly which required field is missing. */
export function buildThreadLinkLogin(
	id: ThreadLinkAccountFormId,
	values: ThreadLinkAccountFieldValues,
): ThreadLinkLoginBuild {
	const missing = missingFields(threadLinkAccountForm(id), values);
	if (missing.length > 0)
		return {
			ok: false,
			reason: `Complete every required field before signing in: ${missing.join(", ")}.`,
		};
	const login = ((): ThreadLinkLoginParams => {
		switch (id) {
			case "apiKey":
				return { type: "apiKey", apiKey: trimmed(values, "apiKey") };
			case "chatgpt":
				return { type: "chatgpt" };
			case "amazonBedrock":
				return {
					type: "amazonBedrock",
					apiKey: trimmed(values, "apiKey"),
					region: trimmed(values, "region"),
				};
			case "amazonBedrockAccessKeys": {
				const sessionToken = trimmed(values, "sessionToken");
				return {
					type: "amazonBedrockAccessKeys",
					accessKeyId: trimmed(values, "accessKeyId"),
					secretAccessKey: trimmed(values, "secretAccessKey"),
					region: trimmed(values, "region"),
					...(sessionToken.length === 0 ? {} : { sessionToken }),
				};
			}
		}
	})();
	return { ok: true, login };
}

const ACCOUNT_LABELS = {
	unknown: "Not connected",
	signed_out: "Signed out",
	login_pending: "Sign-in in progress",
	ready: "Signed in",
	failed: "Sign-in failed",
} as const satisfies Record<ThreadLinkAccountDisclosure["state"], string>;

function accountDetail(account: BrowserSnapshot["account"]): string {
	switch (account.state) {
		case "unknown":
			return account.reason;
		case "signed_out":
			return "Choose how to sign in.";
		case "login_pending":
			return "Complete the sign-in in progress, or cancel to choose another method.";
		case "ready":
			return `Signed in with ${account.accountType === "chatgpt" ? "ChatGPT" : account.accountType === "apiKey" ? "an OpenAI API key" : "Amazon Bedrock"}.`;
		case "failed":
			return account.reason;
	}
}

export function projectThreadLinkAccount(input: {
	readonly state: BrowserWorkbenchState;
	readonly capabilities: BrowserWorkbenchCapabilities;
}): ThreadLinkAccountDisclosure {
	const account = input.state.snapshot?.account ?? null;
	const login = input.state.snapshot?.login ?? null;
	const canLogin = input.capabilities.supportsCommand("accountLogin");
	const canCancelLogin =
		input.capabilities.supportsCommand("accountLoginCancel") && login?.state === "pending";
	const canLogout =
		input.capabilities.supportsCommand("accountLogout") && account?.state === "ready";
	const authUrl =
		input.state.kind === "readiness" &&
		account?.state === "login_pending" &&
		account.variant === "chatgpt" &&
		login?.state === "pending" &&
		login.variant === "chatgpt" &&
		login.loginId === account.loginId
			? login.authUrl
			: null;
	return Object.freeze({
		state: account?.state ?? "unknown",
		label: ACCOUNT_LABELS[account?.state ?? "unknown"],
		detail:
			account === null
				? "The workbench has published no account facts for this pane yet."
				: authUrl !== null
					? "Continue to ChatGPT to finish signing in."
					: accountDetail(account),
		pendingLoginId: login?.state === "pending" ? login.loginId : null,
		authUrl,
		forms: THREAD_LINK_ACCOUNT_FORMS,
		unavailable: THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS,
		canLogin,
		canCancelLogin,
		canLogout,
		blockedReason: canLogin
			? null
			: account?.state === "login_pending"
				? "Finish or cancel the current sign-in."
				: "Reconnect to Codex before signing in.",
	});
}
