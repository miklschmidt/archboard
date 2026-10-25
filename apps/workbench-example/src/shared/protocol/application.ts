import { z } from "zod";

const WORKBENCH_SOCKET_PATH = "/api/workbench";
const ExampleConfigurationSchema = z
	.object({
		checkout: z.object({ label: z.string().min(1), path: z.string().min(1) }).strict(),
		socketPath: z.literal(WORKBENCH_SOCKET_PATH),
	})
	.strict();
type ExampleConfiguration = z.infer<typeof ExampleConfigurationSchema>;

export { WORKBENCH_SOCKET_PATH, ExampleConfigurationSchema, type ExampleConfiguration };
