import { z } from "zod";

/** One self-contained image offered to the local desktop by its private owner. */
const ImageClipboardInputSchema = z.object({
	png: z.string().min(1).base64(),
	html: z.string().min(1),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

/** Native publication acknowledgement, or a refusal before the owner detaches. */
const ImageClipboardReplySchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("ready") }),
	z.object({
		status: z.literal("failed"),
		code: z.enum(["CLIPBOARD_UNAVAILABLE", "CLIPBOARD_FAILED"]),
		message: z.string(),
	}),
]);

export { ImageClipboardInputSchema, ImageClipboardReplySchema };
