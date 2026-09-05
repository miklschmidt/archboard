// The four account/login/start forms the closed browser contract admits, the
// sign-in methods this workbench deliberately does not offer, and building
// one vendor login value from a form's fields.

import type {
	ThreadLinkAccountFieldValues,
	ThreadLinkAccountForm,
	ThreadLinkAccountFormId,
	ThreadLinkLoginBuild,
	ThreadLinkUnavailableAccountMethod,
} from "@/ui/workbench-thread-link/contracts";
import type { ThreadLinkLoginParams } from "@/ui/workbench-thread-link/transport-port";

const REGION_FIELD = {
	name: "region",
	label: "Region",
	description: "For example, us-east-1.",
	required: true,
	secret: false,
} as const;

/** Field names are the vendor parameter names, so a form maps onto one login value. */
const THREAD_LINK_ACCOUNT_FORMS = [
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
		fields: [{ name: "apiKey", label: "API key", description: "", required: true, secret: true }],
	},
	{
		id: "amazonBedrock",
		label: "Amazon Bedrock API key",
		description: "Enter your Amazon Bedrock API key and region.",
		fields: [
			{ name: "apiKey", label: "Bedrock API key", description: "", required: true, secret: true },
			REGION_FIELD,
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
			REGION_FIELD,
		],
	},
] as const satisfies readonly ThreadLinkAccountForm[];

/** Each is named with the reason it is unavailable rather than hidden. */
const THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS = [
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

/**
 * One trimmed field value.
 * @param values The form's values.
 * @param name The field.
 * @returns The value, or empty.
 */
function trimmed(values: ThreadLinkAccountFieldValues, name: string): string {
	return (values[name] ?? "").trim();
}

/**
 * The labels of the required fields a form is missing.
 * @param form The form.
 * @param values The form's values.
 * @returns The labels.
 */
function missingFields(
	form: ThreadLinkAccountForm,
	values: ThreadLinkAccountFieldValues,
): readonly string[] {
	return form.fields
		.filter((field) => field.required && trimmed(values, field.name).length === 0)
		.map((field) => field.label);
}

/**
 * One supported form.
 * @param id The form.
 * @returns The form.
 * @throws {Error} For an id the contract does not admit.
 */
function threadLinkAccountForm(id: ThreadLinkAccountFormId): ThreadLinkAccountForm {
	const form = THREAD_LINK_ACCOUNT_FORMS.find((candidate) => candidate.id === id);
	if (form === undefined) {
		throw new Error(`Unknown Codex sign-in form ${id}.`);
	}
	return form;
}

/**
 * The login value of one complete form.
 * @param id The form.
 * @param values The form's values.
 * @returns The login.
 */
function loginOf(
	id: ThreadLinkAccountFormId,
	values: ThreadLinkAccountFieldValues,
): ThreadLinkLoginParams {
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
		default:
			return accessKeysLogin(values);
	}
}

/**
 * The Bedrock access-keys login, with a session token only when one was supplied.
 * @param values The form's values.
 * @returns The login.
 */
function accessKeysLogin(values: ThreadLinkAccountFieldValues): ThreadLinkLoginParams {
	const sessionToken = trimmed(values, "sessionToken");
	return {
		type: "amazonBedrockAccessKeys",
		accessKeyId: trimmed(values, "accessKeyId"),
		secretAccessKey: trimmed(values, "secretAccessKey"),
		region: trimmed(values, "region"),
		...(sessionToken.length === 0 ? {} : { sessionToken }),
	};
}

/**
 * Build one vendor login value, or say exactly which required field is missing.
 * @param id The form.
 * @param values The form's values.
 * @returns The login, or the reason it cannot be built.
 */
function buildThreadLinkLogin(
	id: ThreadLinkAccountFormId,
	values: ThreadLinkAccountFieldValues,
): ThreadLinkLoginBuild {
	const missing = missingFields(threadLinkAccountForm(id), values);
	if (missing.length > 0) {
		return {
			ok: false,
			reason: `Complete every required field before signing in: ${missing.join(", ")}.`,
		};
	}
	return { ok: true, login: loginOf(id, values) };
}

export {
	THREAD_LINK_ACCOUNT_FORMS,
	THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS,
	buildThreadLinkLogin,
	threadLinkAccountForm,
};
