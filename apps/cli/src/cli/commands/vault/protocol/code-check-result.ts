// The code check's part of the answer of `archboard check` (ADR 0057): the
// answer of `GET /api/vault/code-check`, which leaves out the names of each
// measured module's exports. Every gate run prints it, and only the About page
// of one module shows the names, from `GET /api/vault/code-exports`
// (TASK-646.08).

import { z } from "zod";
import { codeCheckAnswerSchema } from "@archboard/code-intel/code-check";

/** One module the pass measured, as the pass answers it. */
const MeasuredSchema = codeCheckAnswerSchema().shape.depth.unwrap().element;

/** The code check's answer, each measured module without the names of its exports. */
const CodeCheckResultSchema = codeCheckAnswerSchema().extend({
	depth: z.array(MeasuredSchema.omit({ names: true })).optional(),
});
type CodeCheckResult = z.output<typeof CodeCheckResultSchema>;

export { CodeCheckResultSchema, type CodeCheckResult };
