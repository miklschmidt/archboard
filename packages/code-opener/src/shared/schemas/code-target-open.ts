import { z } from "zod";

import { NonemptyString } from "#shared/schemas/nonempty-string.ts";

const CodeTargetOpenRequestSchema = z.union([
	z.strictObject({ board: NonemptyString, element: NonemptyString }),
	z.strictObject({
		model: NonemptyString,
		subject: NonemptyString,
		checkpoint: NonemptyString.optional(),
	}),
]);
type CodeTargetOpenRequest = z.infer<typeof CodeTargetOpenRequestSchema>;

const CodeTargetFailureCodeSchema = z.enum([
	"CROSS_ORIGIN_REFUSED",
	"REQUEST_INVALID",
	"BOARD_NOT_FOUND",
	"ELEMENT_NOT_FOUND",
	"BINDING_UNAVAILABLE",
	"MODEL_UNAVAILABLE",
	"SOURCE_UNAVAILABLE",
	"CHECKOUT_UNAVAILABLE",
	"CHECKOUT_IDENTITY_CHANGED",
	"CHECKOUT_ON_OTHER_REF",
	"TARGET_UNAVAILABLE",
	"TARGET_OUTSIDE_CHECKOUT",
	"OPENER_CONFIG_INVALID",
	"OPENER_PLATFORM_UNSUPPORTED",
	"OPENER_UNAVAILABLE",
	"OPENER_SPAWN_FAILED",
	"RESPONSE_INVALID",
]);
type CodeTargetFailureCode = z.infer<typeof CodeTargetFailureCodeSchema>;

const GitHubHttpsUrlSchema = z
	.string()
	.url()
	.refine((value) => {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === "github.com";
	}, "GitHub actions require an https://github.com URL");
type GitHubHttpsUrl = z.infer<typeof GitHubHttpsUrlSchema>;

const CodeTargetNoticeActionSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("settings"), label: z.literal("Opener settings") }).strict(),
	z
		.object({ kind: z.literal("github"), label: NonemptyString, href: GitHubHttpsUrlSchema })
		.strict(),
]);
type CodeTargetNoticeAction = z.infer<typeof CodeTargetNoticeActionSchema>;

const CodeTargetOpenSuccessSchema = z
	.object({
		success: z.literal(true),
		code: z.literal("CODE_TARGET_OPENED"),
		repository: NonemptyString,
		path: z.string(),
		kind: z.enum(["file", "directory"]),
		/**
		 * The binding names a branch or commit the checkout is not on, and there was nowhere else
		 * to open it, so the checkout's version was opened.
		 */
		otherRef: z.object({ named: NonemptyString, checkedOut: NonemptyString }).strict().optional(),
	})
	.strict();
type CodeTargetOpenSuccess = z.infer<typeof CodeTargetOpenSuccessSchema>;

const CodeTargetOpenFailureSchema = z
	.object({
		success: z.literal(false),
		code: CodeTargetFailureCodeSchema,
		error: NonemptyString,
		actions: z.array(CodeTargetNoticeActionSchema).optional(),
	})
	.strict();
type CodeTargetOpenFailure = z.infer<typeof CodeTargetOpenFailureSchema>;
const CodeTargetOpenReplySchema = z.discriminatedUnion("success", [
	CodeTargetOpenSuccessSchema,
	CodeTargetOpenFailureSchema,
]);
type CodeTargetOpenReply = z.infer<typeof CodeTargetOpenReplySchema>;

interface CodeTargetNotice {
	/** An error, or information the person needs about what was or was not opened. */
	kind: "error" | "info";
	message: string;
	actions: readonly CodeTargetNoticeAction[];
}

export {
	CodeTargetOpenRequestSchema,
	type CodeTargetOpenRequest,
	CodeTargetFailureCodeSchema,
	type CodeTargetFailureCode,
	GitHubHttpsUrlSchema,
	type GitHubHttpsUrl,
	CodeTargetNoticeActionSchema,
	type CodeTargetNoticeAction,
	CodeTargetOpenSuccessSchema,
	type CodeTargetOpenSuccess,
	CodeTargetOpenFailureSchema,
	type CodeTargetOpenFailure,
	CodeTargetOpenReplySchema,
	type CodeTargetOpenReply,
	type CodeTargetNotice,
};
