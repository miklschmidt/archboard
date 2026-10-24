import type { z } from "zod";
import type { WorkbenchExecutionContextSchema } from "#runtime/rules/host/context.ts";

type WorkbenchExecutionContext = z.infer<typeof WorkbenchExecutionContextSchema>;
type WorkbenchOperation = WorkbenchExecutionContext["operation"];

/** The host owns wire conversion. Its payload never changes execution facts. */
interface WorkbenchContextCodec {
	readonly key: string;
	readonly turnTrigger: string;
	readonly encode: (context: WorkbenchExecutionContext) => string;
}

export type { WorkbenchOperation, WorkbenchExecutionContext, WorkbenchContextCodec };
