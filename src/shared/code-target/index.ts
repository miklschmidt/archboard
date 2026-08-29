import { z } from "zod";

const PATH_TOKEN = "{path}";
const MAX_ARGV = 32;
const MAX_ARG_BYTES = 16 * 1024;
const NonemptyString = z.string().trim().min(1);
const SafeString = z.string().refine((value) => !value.includes("\0"), "NUL is not allowed");

const PlatformSelectionSchema = z
	.object({ version: z.literal(1), kind: z.literal("platform") })
	.strict();
const PresetSelectionSchema = z
	.object({
		version: z.literal(1),
		kind: z.literal("preset"),
		preset: z.enum(["vscode", "cursor", "zed"]),
	})
	.strict();
const CustomSelectionSchema = z
	.object({
		version: z.literal(1),
		kind: z.literal("custom"),
		executable: SafeString.pipe(NonemptyString),
		argv: z.array(SafeString).max(MAX_ARGV),
	})
	.strict()
	.superRefine(({ argv }, context) => {
		const bytes = argv.reduce((total, argument) => total + Buffer.byteLength(argument), 0);
		if (bytes > MAX_ARG_BYTES) {
			context.addIssue({
				code: "custom",
				message: `argv exceeds ${MAX_ARG_BYTES} bytes`,
				path: ["argv"],
			});
		}
		const tokens = argv.reduce(
			(total, argument) => total + (argument.match(/\{path\}/g)?.length ?? 0),
			0,
		);
		if (tokens !== 1) {
			context.addIssue({
				code: "custom",
				message: "argv must contain exactly one {path} token",
				path: ["argv"],
			});
		}
	});

export const OpenerSelectionSchema = z.discriminatedUnion("kind", [
	PlatformSelectionSchema,
	PresetSelectionSchema,
	CustomSelectionSchema,
]);
export type OpenerSelection = z.infer<typeof OpenerSelectionSchema>;

export const OpenerCommandSchema = z
	.object({ executable: NonemptyString, argv: z.array(z.string()).max(MAX_ARGV) })
	.strict();
export type OpenerCommand = z.infer<typeof OpenerCommandSchema>;

export const CodeBindingSchema = z
	.object({
		repo: NonemptyString,
		path: z.string(),
		branch: NonemptyString.optional(),
		commit: NonemptyString.optional(),
		confirmedAt: NonemptyString.optional(),
	})
	.strict();
export type CodeBinding = z.infer<typeof CodeBindingSchema>;

export const CodeTargetOpenRequestSchema = z
	.object({ board: NonemptyString, element: NonemptyString })
	.strict();
export type CodeTargetOpenRequest = z.infer<typeof CodeTargetOpenRequestSchema>;

export const OpenerSettingsTestRequestSchema = z
	.object({ selection: OpenerSelectionSchema, repository: NonemptyString })
	.strict();
export type OpenerSettingsTestRequest = z.infer<typeof OpenerSettingsTestRequestSchema>;

const CheckoutChoiceSchema = z
	.object({
		repository: NonemptyString,
		root: z.string(),
		exists: z.boolean(),
		identityMatches: z.boolean(),
	})
	.strict();
export const OpenerAvailabilitySchema = z.discriminatedUnion("available", [
	z.object({ available: z.literal(true) }).strict(),
	z
		.object({
			available: z.literal(false),
			code: z.enum(["OPENER_CONFIG_INVALID", "OPENER_PLATFORM_UNSUPPORTED", "OPENER_UNAVAILABLE"]),
			error: NonemptyString,
		})
		.strict(),
]);
export const OpenerSettingsReplySchema = z
	.object({
		success: z.literal(true),
		selection: OpenerSelectionSchema,
		effectiveCommand: OpenerCommandSchema.nullable(),
		availability: OpenerAvailabilitySchema,
		platformDefault: OpenerCommandSchema.nullable(),
		presets: z.array(
			z
				.object({ preset: z.enum(["vscode", "cursor", "zed"]), command: OpenerCommandSchema })
				.strict(),
		),
		repositories: z.array(CheckoutChoiceSchema),
	})
	.strict();
export type OpenerSettingsReply = z.infer<typeof OpenerSettingsReplySchema>;

export const OpenerSelectionReplySchema = z
	.object({ success: z.literal(true), selection: OpenerSelectionSchema })
	.strict();
export const OpenerTestReplySchema = z
	.object({
		success: z.literal(true),
		code: z.literal("OPENER_TESTED"),
		repository: NonemptyString,
	})
	.strict();

export const CodeTargetFailureCodeSchema = z.enum([
	"CROSS_ORIGIN_REFUSED",
	"REQUEST_INVALID",
	"BOARD_NOT_FOUND",
	"ELEMENT_NOT_FOUND",
	"BINDING_UNAVAILABLE",
	"CHECKOUT_UNAVAILABLE",
	"CHECKOUT_IDENTITY_CHANGED",
	"TARGET_UNAVAILABLE",
	"TARGET_OUTSIDE_CHECKOUT",
	"OPENER_CONFIG_INVALID",
	"OPENER_PLATFORM_UNSUPPORTED",
	"OPENER_UNAVAILABLE",
	"OPENER_SPAWN_FAILED",
	"RESPONSE_INVALID",
]);
export type CodeTargetFailureCode = z.infer<typeof CodeTargetFailureCodeSchema>;

export const GitHubHttpsUrlSchema = z
	.string()
	.url()
	.refine((value) => {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === "github.com";
	}, "GitHub actions require an https://github.com URL");
export type GitHubHttpsUrl = z.infer<typeof GitHubHttpsUrlSchema>;

export const CodeTargetNoticeActionSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("settings"), label: z.literal("Opener settings") }).strict(),
	z
		.object({ kind: z.literal("github"), label: NonemptyString, href: GitHubHttpsUrlSchema })
		.strict(),
]);
export type CodeTargetNoticeAction = z.infer<typeof CodeTargetNoticeActionSchema>;

export const CodeTargetOpenSuccessSchema = z
	.object({
		success: z.literal(true),
		code: z.literal("CODE_TARGET_OPENED"),
		repository: NonemptyString,
		path: z.string(),
		kind: z.enum(["file", "directory"]),
	})
	.strict();
export type CodeTargetOpenSuccess = z.infer<typeof CodeTargetOpenSuccessSchema>;

export const CodeTargetOpenFailureSchema = z
	.object({
		success: z.literal(false),
		code: CodeTargetFailureCodeSchema,
		error: NonemptyString,
		actions: z.array(CodeTargetNoticeActionSchema).optional(),
	})
	.strict();
export type CodeTargetOpenFailure = z.infer<typeof CodeTargetOpenFailureSchema>;
export const CodeTargetOpenReplySchema = z.discriminatedUnion("success", [
	CodeTargetOpenSuccessSchema,
	CodeTargetOpenFailureSchema,
]);
export type CodeTargetOpenReply = z.infer<typeof CodeTargetOpenReplySchema>;

export interface CodeTargetNotice {
	kind: "error";
	message: string;
	actions: readonly CodeTargetNoticeAction[];
}

export function buildInternalCodeTargetUrl(request: CodeTargetOpenRequest): string {
	const parsed = CodeTargetOpenRequestSchema.parse(request);
	const query = new URLSearchParams({ board: parsed.board, element: parsed.element });
	return `/api/code-targets/open?${query.toString()}`;
}

export function parseInternalCodeTargetUrl(value: string): CodeTargetOpenRequest | null {
	if (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("#") ||
		value.includes("\\")
	)
		return null;
	let url: URL;
	try {
		url = new URL(value, "http://archboard.invalid");
	} catch {
		return null;
	}
	if (url.pathname !== "/api/code-targets/open") return null;
	const keys = [...url.searchParams.keys()];
	if (keys.length !== 2 || keys[0] !== "board" || keys[1] !== "element") return null;
	const result = CodeTargetOpenRequestSchema.safeParse({
		board: url.searchParams.get("board"),
		element: url.searchParams.get("element"),
	});
	return result.success ? result.data : null;
}

export { PATH_TOKEN };
