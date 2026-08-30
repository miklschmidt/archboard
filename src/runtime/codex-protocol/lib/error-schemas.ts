import { z } from "zod";

import { looseObject } from "./scalars.js";

export const MisalignmentSteerSchema = looseObject({ message: z.string() });

export const MisalignmentErrorDetailsSchema = looseObject({
	errorType: z.string().nullable(),
	detailedExplanation: z.string().nullable(),
	steer: MisalignmentSteerSchema.nullable(),
});
