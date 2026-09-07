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
		const bytes = new TextEncoder().encode(argv.join("")).byteLength;
		if (bytes > MAX_ARG_BYTES) {
			context.addIssue({
				code: "custom",
				message: `argv exceeds ${MAX_ARG_BYTES} bytes`,
				path: ["argv"],
			});
		}
		const tokens = argv.reduce(
			(total, argument) => total + (argument.match(/\{path\}/gu)?.length ?? 0),
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
const OpenerSelectionSchema = z.discriminatedUnion("kind", [
	PlatformSelectionSchema,
	PresetSelectionSchema,
	CustomSelectionSchema,
]);
type OpenerSelection = z.infer<typeof OpenerSelectionSchema>;
const OpenerCommandSchema = z
	.object({ executable: NonemptyString, argv: z.array(z.string()).max(MAX_ARGV) })
	.strict();
type OpenerCommand = z.infer<typeof OpenerCommandSchema>;
const CodeBindingSchema = z
	.object({
		repo: NonemptyString,
		path: z.string(),
		branch: NonemptyString.optional(),
		commit: NonemptyString.optional(),
		confirmedAt: NonemptyString.optional(),
	})
	.strict();
type CodeBinding = z.infer<typeof CodeBindingSchema>;
const CodeTargetOpenRequestSchema = z
	.object({ board: NonemptyString, element: NonemptyString })
	.strict();
type CodeTargetOpenRequest = z.infer<typeof CodeTargetOpenRequestSchema>;

const OpenerSettingsTestRequestSchema = z
	.object({ selection: OpenerSelectionSchema, repository: NonemptyString })
	.strict();
type OpenerSettingsTestRequest = z.infer<typeof OpenerSettingsTestRequestSchema>;

const CheckoutChoiceSchema = z
	.object({
		repository: NonemptyString,
		root: z.string(),
		exists: z.boolean(),
		identityMatches: z.boolean(),
	})
	.strict();
const OpenerAvailabilitySchema = z.discriminatedUnion("available", [
	z.object({ available: z.literal(true) }).strict(),
	z
		.object({
			available: z.literal(false),
			code: z.enum(["OPENER_CONFIG_INVALID", "OPENER_PLATFORM_UNSUPPORTED", "OPENER_UNAVAILABLE"]),
			error: NonemptyString,
		})
		.strict(),
]);
const OpenerSettingsReplySchema = z
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
type OpenerSettingsReply = z.infer<typeof OpenerSettingsReplySchema>;

const OpenerSelectionReplySchema = z
	.object({ success: z.literal(true), selection: OpenerSelectionSchema })
	.strict();
type OpenerSelectionReply = z.infer<typeof OpenerSelectionReplySchema>;
const OpenerTestReplySchema = z
	.object({
		success: z.literal(true),
		code: z.literal("OPENER_TESTED"),
		repository: NonemptyString,
	})
	.strict();
type OpenerTestReply = z.infer<typeof OpenerTestReplySchema>;

const CodeTargetFailureCodeSchema = z.enum([
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
	kind: "error";
	message: string;
	actions: readonly CodeTargetNoticeAction[];
}

/**
 * Spells the internal link the canvas uses to ask the server to open the code
 * target bound to one element.
 *
 * @param request - The board and element whose binding should open.
 * @returns The relative `/api/code-targets/open` URL with both as query parameters.
 */
function buildInternalCodeTargetUrl(request: CodeTargetOpenRequest): string {
	const parsed = CodeTargetOpenRequestSchema.parse(request);
	const query = new URLSearchParams({ board: parsed.board, element: parsed.element });
	return `/api/code-targets/open?${query.toString()}`;
}

/**
 * Tells whether a link is a same-origin path: rooted, not protocol-relative,
 * without a fragment or a backslash that a URL parser might reinterpret.
 *
 * @param value - The raw link text.
 * @returns True when the link can only name a path on this server.
 */
function isRootedPath(value: string): boolean {
	return (
		value.startsWith("/") &&
		!value.startsWith("//") &&
		!value.includes("#") &&
		!value.includes("\\")
	);
}

/**
 * Parses a rooted path against a placeholder origin so the caller sees only
 * whether it is the code-target open route with exactly its two parameters.
 *
 * @param value - A link that passed {@link isRootedPath}.
 * @returns The parsed URL when it is the open route with `board` then `element`, else null.
 */
function codeTargetRouteUrl(value: string): URL | null {
	let url: URL;
	try {
		url = new URL(value, "http://archboard.invalid");
	} catch {
		return null;
	}
	if (url.pathname !== "/api/code-targets/open") {
		return null;
	}
	const keys = [...url.searchParams.keys()];
	const exact = keys.length === 2 && keys[0] === "board" && keys[1] === "element";
	return exact ? url : null;
}

/**
 * Reads a link back into the open request it was built from, accepting only
 * the exact shape {@link buildInternalCodeTargetUrl} produces so an arbitrary
 * link on the canvas is never mistaken for a code-target open.
 *
 * @param value - The raw link text found on an element.
 * @returns The board and element the link names, or null when it is not such a link.
 */
function parseInternalCodeTargetUrl(value: string): CodeTargetOpenRequest | null {
	if (!isRootedPath(value)) {
		return null;
	}
	const url = codeTargetRouteUrl(value);
	if (url === null) {
		return null;
	}
	const result = CodeTargetOpenRequestSchema.safeParse({
		board: url.searchParams.get("board"),
		element: url.searchParams.get("element"),
	});
	return result.success ? result.data : null;
}

export {
	PATH_TOKEN,
	OpenerSelectionSchema,
	type OpenerSelection,
	OpenerCommandSchema,
	type OpenerCommand,
	CodeBindingSchema,
	type CodeBinding,
	CodeTargetOpenRequestSchema,
	type CodeTargetOpenRequest,
	OpenerSettingsTestRequestSchema,
	type OpenerSettingsTestRequest,
	OpenerAvailabilitySchema,
	OpenerSettingsReplySchema,
	type OpenerSettingsReply,
	OpenerSelectionReplySchema,
	type OpenerSelectionReply,
	OpenerTestReplySchema,
	type OpenerTestReply,
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
	buildInternalCodeTargetUrl,
	parseInternalCodeTargetUrl,
};
export { isAbsoluteOrBareOpenerExecutable } from "@/shared/code-target/executable";
