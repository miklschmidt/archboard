// Opening a code target: the wire contract of the open route, the opener settings and the rules for an opener executable. Safe for the browser.
export { isAbsoluteOrBareOpenerExecutable } from "#shared/rules/opener-executable.ts";
export {
	CodeTargetOpenFailureSchema,
	CodeTargetOpenReplySchema,
	CodeTargetOpenRequestSchema,
	CodeTargetOpenSuccessSchema,
	GitHubHttpsUrlSchema,
} from "#shared/schemas/code-target-open.ts";
export type {
	CodeTargetFailureCode,
	CodeTargetNotice,
	CodeTargetNoticeAction,
	CodeTargetOpenFailure,
	CodeTargetOpenReply,
	CodeTargetOpenRequest,
	CodeTargetOpenSuccess,
} from "#shared/schemas/code-target-open.ts";
export {
	LINE_TOKEN,
	OpenerSelectionReplySchema,
	OpenerSelectionSchema,
	OpenerSettingsReplySchema,
	OpenerSettingsTestRequestSchema,
	OpenerTestReplySchema,
	PATH_TOKEN,
} from "#shared/schemas/opener-settings.ts";
export type {
	OpenerCommand,
	OpenerSelection,
	OpenerSelectionReply,
	OpenerSettingsReply,
	OpenerSettingsTestRequest,
	OpenerTestReply,
} from "#shared/schemas/opener-settings.ts";
