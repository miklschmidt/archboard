export {
	ApprovalIdSchema,
	DynamicToolCallIdSchema,
	ItemIdSchema,
	JsonRpcRequestIdSchema,
	JsonValueSchema,
	ThreadIdSchema,
	TurnIdSchema,
	boundedText,
	optionalNullableText,
} from "./scalars.js";

import { z } from "zod";

export const FileChangeSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("add"), content: z.string() }).strict(),
	z.object({ type: z.literal("delete"), content: z.string() }).strict(),
	z
		.object({
			type: z.literal("update"),
			unified_diff: z.string(),
			move_path: z.string().nullable(),
		})
		.strict(),
]);
