import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";

import type {
	BrowserWorkbenchCapabilities,
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
		id: "apiKey",
		label: "API key",
		description: "Sign in with an OpenAI API key held by this Codex workbench.",
		fields: [
			{
				name: "apiKey",
				label: "API key",
				description: "The OpenAI API key Codex authenticates with.",
				required: true,
				secret: true,
			},
		],
	},
	{
		id: "chatgpt",
		label: "Hosted ChatGPT",
		description:
			"Sign in through the hosted ChatGPT flow. Codex opens it and reports progress here; this form has no fields to fill in.",
		fields: [],
	},
	{
		id: "amazonBedrock",
		label: "Amazon Bedrock API key",
		description: "Sign in to Amazon Bedrock with an explicit API key and region.",
		fields: [
			{
				name: "apiKey",
				label: "Bedrock API key",
				description: "The Amazon Bedrock API key.",
				required: true,
				secret: true,
			},
			{
				name: "region",
				label: "Region",
				description: "The Amazon Bedrock region, for example us-east-1.",
				required: true,
				secret: false,
			},
		],
	},
	{
		id: "amazonBedrockAccessKeys",
		label: "Amazon Bedrock access keys",
		description:
			"Sign in to Amazon Bedrock with explicit access keys. The session token is optional; the region is not.",
		fields: [
			{
				name: "accessKeyId",
				label: "Access key ID",
				description: "The AWS access key ID.",
				required: true,
				secret: false,
			},
			{
				name: "secretAccessKey",
				label: "Secret access key",
				description: "The AWS secret access key.",
				required: true,
				secret: true,
			},
			{
				name: "sessionToken",
				label: "Session token (optional)",
				description: "The AWS session token, when the credentials are temporary.",
				required: false,
				secret: true,
			},
			{
				name: "region",
				label: "Region",
				description: "The Amazon Bedrock region, for example us-east-1.",
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
			"Unavailable: the device-code flow completes on another device, so this workbench cannot show or confirm its outcome. Use hosted ChatGPT instead.",
	},
	{
		id: "chatgptAuthTokens",
		label: "ChatGPT client tokens",
		explanation:
			"Unavailable: supplying access tokens and a workspace id directly would make the browser a credential source for the owned Codex session. Use hosted ChatGPT instead.",
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
	unknown: "Account facts unknown",
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
			return "Codex has no account. Choose one of the supported forms below.";
		case "login_pending":
			return `Codex is completing a ${account.variant} sign-in. Cancel it to choose another form.`;
		case "ready":
			return `Codex is signed in with the ${account.accountType} account type.`;
		case "failed":
			return account.reason;
	}
}

export function projectThreadLinkAccount(input: {
	readonly snapshot: BrowserSnapshot | null;
	readonly capabilities: BrowserWorkbenchCapabilities;
}): ThreadLinkAccountDisclosure {
	const account = input.snapshot?.account ?? null;
	const login = input.snapshot?.login ?? null;
	const canLogin = input.capabilities.supportsCommand("accountLogin");
	const canCancelLogin =
		input.capabilities.supportsCommand("accountLoginCancel") && login?.state === "pending";
	const canLogout =
		input.capabilities.supportsCommand("accountLogout") && account?.state === "ready";
	return Object.freeze({
		state: account?.state ?? "unknown",
		label: ACCOUNT_LABELS[account?.state ?? "unknown"],
		detail:
			account === null
				? "The workbench has published no account facts for this pane yet."
				: accountDetail(account),
		pendingLoginId: login?.state === "pending" ? login.loginId : null,
		forms: THREAD_LINK_ACCOUNT_FORMS,
		unavailable: THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS,
		canLogin,
		canCancelLogin,
		canLogout,
		blockedReason: canLogin
			? null
			: "Signing in needs a connected workbench whose account state has been read and an active browser command lease.",
	});
}
