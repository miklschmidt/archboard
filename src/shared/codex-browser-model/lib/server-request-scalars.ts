import { z } from "zod";

import { boundedWireText } from "./scalars.js";

export { JsonValueSchema, boundedText, boundedWireText, optionalNullableText } from "./scalars.js";

export const FileChangeSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("add"), content: boundedWireText(16_384) }).strict(),
	z.object({ type: z.literal("delete"), content: boundedWireText(16_384) }).strict(),
	z
		.object({
			type: z.literal("update"),
			unified_diff: boundedWireText(16_384),
			move_path: boundedWireText(16_384).nullable(),
		})
		.strict(),
]);

export type FileChange = z.infer<typeof FileChangeSchema>;
