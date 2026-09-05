import { z } from "zod";

import { looseObject } from "./scalars.js";

const MisalignmentSteerSchema = looseObject({ message: z.string() });

const MisalignmentErrorDetailsSchema = looseObject({
	errorType: z.string().nullable(),
	detailedExplanation: z.string().nullable(),
	steer: MisalignmentSteerSchema.nullable(),
});

export { MisalignmentErrorDetailsSchema, MisalignmentSteerSchema };
