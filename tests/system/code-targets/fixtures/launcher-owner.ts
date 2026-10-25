import { z } from "zod";
import { OpenerSelectionReplySchema } from "@archboard/code-opener/opening";
import { openInEditor } from "@archboard/code-opener/opener";

const [encoded] = process.argv.slice(2);
if (encoded === undefined || encoded.length === 0) {
	throw new Error("launcher-owner requires one JSON argument: the selection and the target");
}
const asked = z
	.object({ selection: OpenerSelectionReplySchema.shape.selection, target: z.string() })
	.parse(JSON.parse(encoded));
const result = await openInEditor(asked.selection, asked.target, { platform: process.platform });
if (!result.ok) {
	throw new Error(`${result.code}: ${result.error}`);
}
