import { z } from "zod";
const ModelDiagnosticSchema = z
	.object({
		code: z.string(),
		file: z.string(),
		path: z.string().optional(),
		subjects: z.array(z.string()).optional(),
		message: z.string(),
		recovery: z.string(),
	})
	.strict();

export { ModelDiagnosticSchema };
