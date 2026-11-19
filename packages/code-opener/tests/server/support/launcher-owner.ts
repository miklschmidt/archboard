import { z } from "zod";
import { OpenerSelectionSchema } from "#shared/schemas/opener-settings.ts";
import { openInEditor } from "#server/routes/code-opener.ts";

const [encoded] = process.argv.slice(2);
if (encoded === undefined || encoded.length === 0) {
	throw new Error("launcher-owner requires one JSON argument: the selection and the target");
}
const asked = z
	.object({ selection: OpenerSelectionSchema, target: z.string() })
	.parse(JSON.parse(encoded));
const result = await openInEditor(asked.selection, asked.target, { platform: process.platform });
if (!result.ok) {
	throw new Error(`${result.code}: ${result.error}`);
}
