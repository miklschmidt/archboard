// The staged argument grammar of the arrange subcommands: every one names
// element ids, and each adds its own option that is validated after server contact.
import { z } from "zod";

const AlignmentInputSchema = z.enum(["left", "center", "right", "top", "middle", "bottom"]);
const DirectionInputSchema = z.enum(["horizontal", "vertical"]);

/**
 * Splits a comma-separated `--ids` value into trimmed, non-empty ids, reporting
 * the subcommand's usage line when the value is missing or blank.
 * @param value - The raw `--ids` option value.
 * @param usage - The usage line reported when no ids were given.
 * @param context - The refinement context that receives the usage issue.
 * @returns The ids, or `z.NEVER` after the issue was reported.
 */
function parsedIds(value: string | undefined, usage: string, context: z.RefinementCtx) {
	if (!value?.trim()) {
		context.addIssue({ code: "custom", message: usage });
		return z.NEVER;
	}
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

const ArrangeAlignStageSchema = z
	.object({ ids: z.string().optional(), to: z.string().optional() })
	.transform((input, context) => {
		const ids = parsedIds(
			input.ids,
			"Usage: arrange align --ids a,b,c --to left|center|right|top|middle|bottom",
			context,
		);
		if (ids === z.NEVER) {
			return z.NEVER;
		}
		const alignment = AlignmentInputSchema.safeParse(input.to);
		if (!alignment.success) {
			context.addIssue({
				code: "custom",
				message: "arrange align requires --to left|center|right|top|middle|bottom",
			});
			return z.NEVER;
		}
		return { ids, alignment: alignment.data };
	});
type ArrangeAlignStage = z.infer<typeof ArrangeAlignStageSchema>;

const ArrangeDistributeStageSchema = z
	.object({ ids: z.string().optional(), to: z.string().optional() })
	.transform((input, context) => {
		const ids = parsedIds(
			input.ids,
			"Usage: arrange distribute --ids a,b,c --to horizontal|vertical",
			context,
		);
		if (ids === z.NEVER) {
			return z.NEVER;
		}
		const direction = DirectionInputSchema.safeParse(input.to);
		if (!direction.success) {
			context.addIssue({
				code: "custom",
				message: "arrange distribute requires --to horizontal|vertical",
			});
			return z.NEVER;
		}
		return { ids, direction: direction.data };
	});
type ArrangeDistributeStage = z.infer<typeof ArrangeDistributeStageSchema>;

/**
 * Builds the stage schema of a subcommand whose only argument is `--ids`.
 * @param usage - The usage line reported when the ids are missing.
 * @returns A schema producing the parsed ids.
 */
const idsStage = (usage: string) =>
	z.object({ ids: z.string().optional() }).transform((input, context) => {
		const ids = parsedIds(input.ids, usage, context);
		return ids === z.NEVER ? z.NEVER : { ids };
	});
const ArrangeGroupStageSchema = idsStage("Usage: arrange group --ids a,b,c");
type ArrangeGroupStage = z.infer<typeof ArrangeGroupStageSchema>;
const ArrangeLockStageSchema = idsStage("Usage: arrange lock --ids a,b,c");
type ArrangeLockStage = z.infer<typeof ArrangeLockStageSchema>;
const ArrangeUnlockStageSchema = idsStage("Usage: arrange unlock --ids a,b,c");
type ArrangeUnlockStage = z.infer<typeof ArrangeUnlockStageSchema>;

const ArrangeUngroupStageSchema = z.object({
	group: z.string({ error: "Usage: arrange ungroup --group <groupId>" }).min(1),
});
type ArrangeUngroupStage = z.infer<typeof ArrangeUngroupStageSchema>;

const ArrangeDuplicateStageSchema = z
	.object({ ids: z.string().optional(), offset: z.string().optional() })
	.transform((input, context) => {
		const ids = parsedIds(
			input.ids,
			"Usage: arrange duplicate --ids a,b,c [--offset 20,20]",
			context,
		);
		if (ids === z.NEVER) {
			return z.NEVER;
		}
		if (input.offset === undefined) {
			return { ids, offsetX: 20, offsetY: 20 };
		}
		const parts = input.offset.split(",").map((part) => Number(part.trim()));
		if (parts.length !== 2 || parts.some(Number.isNaN)) {
			context.addIssue({ code: "custom", message: '--offset expects "x,y"' });
			return z.NEVER;
		}
		return { ids, offsetX: parts[0]!, offsetY: parts[1]! };
	});
type ArrangeDuplicateStage = z.infer<typeof ArrangeDuplicateStageSchema>;

/**
 * Describes one arrange subcommand's after-server stage for the contract.
 * @param name - The stage name recorded in the contract.
 * @param schema - The schema that validates the subcommand's arguments.
 * @returns The stage description.
 */
const arrangementStage = (name: string, schema: z.ZodType) => ({
	name,
	when: "after-server" as const,
	description: "Validated arrangement arguments",
	rules: ["Parse comma-separated element ids and validate action-specific options"],
	schema,
});

export {
	ArrangeAlignStageSchema,
	type ArrangeAlignStage,
	ArrangeDistributeStageSchema,
	type ArrangeDistributeStage,
	ArrangeGroupStageSchema,
	type ArrangeGroupStage,
	ArrangeLockStageSchema,
	type ArrangeLockStage,
	ArrangeUnlockStageSchema,
	type ArrangeUnlockStage,
	ArrangeUngroupStageSchema,
	type ArrangeUngroupStage,
	ArrangeDuplicateStageSchema,
	type ArrangeDuplicateStage,
	arrangementStage,
};
