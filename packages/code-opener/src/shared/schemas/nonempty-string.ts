import { z } from "zod";

/** A string with its surrounding whitespace trimmed and at least one character left. */
const NonemptyString = z.string().trim().min(1);

export { NonemptyString };
