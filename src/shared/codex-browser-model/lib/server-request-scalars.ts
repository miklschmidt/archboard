import { z } from "zod";

import { wireText } from "./scalars.js";

export {
	JsonValueSchema,
	boundedText,
	boundedWireText,
	optionalNullableText,
	wireText,
} from "./scalars.js";

export const FileChangeSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("add"), content: wireText() }).strict(),
	z.object({ type: z.literal("delete"), content: wireText() }).strict(),
	z
		.object({
			type: z.literal("update"),
			unified_diff: wireText(),
			move_path: wireText().nullable(),
		})
		.strict(),
]);

export type FileChange = z.infer<typeof FileChangeSchema>;
