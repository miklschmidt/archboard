// The open's wire contract as a reader outside sees it: what the person is told of an open, the GitHub link a notice may offer, and the replies of the open and settings routes. Safe for the browser.
export {
	CodeTargetOpenFailureSchema,
	CodeTargetOpenReplySchema,
	GitHubHttpsUrlSchema,
} from "#shared/schemas/code-target-open.ts";
export type { CodeTargetNotice } from "#shared/schemas/code-target-open.ts";
export {
	OpenerSelectionReplySchema,
	OpenerSettingsReplySchema,
	OpenerTestReplySchema,
} from "#shared/schemas/opener-settings.ts";
