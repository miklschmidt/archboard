import { z } from "zod";
const LegacyOriginalInputsSchema = z.array(
	z.strictObject({ file: z.string(), base64: z.string() }),
);
export { LegacyOriginalInputsSchema };
