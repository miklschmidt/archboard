import { z } from "zod";

import { NonemptyString } from "#shared/schemas/nonempty-string.ts";

/** What a custom opener argument holds where the file or directory to open goes. */
const PATH_TOKEN = "{path}";
/**
 * What a custom opener argument may hold where the line goes: the line where the
 * binding's symbol is defined, or 1 where there is none (TASK-367.25).
 */
const LINE_TOKEN = "{line}";
const MAX_ARGV = 32;
const MAX_ARG_BYTES = 16 * 1024;
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
/**
 * A command of the person's own, run without a shell. Exactly one argument holds
 * `{path}` ({@link PATH_TOKEN}), and any argument may hold `{line}`
 * ({@link LINE_TOKEN}), as in `--goto` and `{path}:{line}`.
 */
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

export {
	LINE_TOKEN,
	PATH_TOKEN,
	OpenerSelectionSchema,
	type OpenerSelection,
	OpenerCommandSchema,
	type OpenerCommand,
	OpenerSettingsTestRequestSchema,
	type OpenerSettingsTestRequest,
	OpenerAvailabilitySchema,
	OpenerSettingsReplySchema,
	type OpenerSettingsReply,
	OpenerSelectionReplySchema,
	type OpenerSelectionReply,
	OpenerTestReplySchema,
	type OpenerTestReply,
};
