import { z } from "zod";
import { SemanticPolicySchema } from "#shared/schemas/semantic-policy.ts";

/**
 * The one node, relationship or flow step a diagnostic is about. The model and
 * variant it sits on are the diagnostic's own, so `id` alone finds it there.
 * The kinds are the model's own subject kinds (`edge` is a relationship). A
 * step carries an anchor, so the code check names one (ADR 0046); the plain
 * check never does, and every reader accepts one. `name` is what a reader
 * would call it, carried so a line of text can say it without reading the
 * model again: a step, which has no name of its own, is named by its flow, its
 * ends and its label.
 */
const DiagnosticSubjectSchema = z.object({
	kind: z.enum(["node", "edge", "flow", "step"]),
	id: z.string(),
	name: z.string(),
});
type DiagnosticSubject = z.infer<typeof DiagnosticSubjectSchema>;
/**
 * One of the two parts a `SHARED_SYMBOL` warning names: its model, its id and
 * name, and the ids of the live variants of that model that carry it.
 */
const SharedSymbolPartSchema = z.object({
	board: z.string(),
	id: z.string(),
	name: z.string(),
	variants: z.array(z.string()),
});
/**
 * What a `SHARED_SYMBOL` warning is about: the repository, path and symbol
 * that two distinct parts both bind, and those two parts.
 */
const SharedSymbolSchema = z.object({
	binding: z.object({ repo: z.string(), path: z.string(), symbol: z.string() }),
	parts: z.tuple([SharedSymbolPartSchema, SharedSymbolPartSchema]),
});
const VaultDiagnosticSchema = z.object({
	severity: z.enum(["warning", "error"]),
	code: z.string(),
	file: z.string(),
	path: z.string().optional(),
	board: z.string().optional(),
	variant: z.string().optional(),
	subject: DiagnosticSubjectSchema.optional(),
	sharedSymbol: SharedSymbolSchema.optional(),
	/** The binding that a containment warning asks its container to take: one directory that holds every part. */
	suggestedBinding: z.object({ repo: z.string(), path: z.string() }).optional(),
	message: z.string(),
});
type VaultDiagnostic = z.infer<typeof VaultDiagnosticSchema>;
/**
 * A diagnostic as a line of text reads it. A finding of the code check has
 * the same shape with the severity `information` beside `warning` (ADR 0046).
 */
type DiagnosticOfAnySeverity = Omit<VaultDiagnostic, "severity"> & {
	severity: VaultDiagnostic["severity"] | "information";
};
/** Each subject kind in the words of a person. */
const SUBJECT_WORD = { node: "module", edge: "relationship", flow: "flow", step: "step" } as const;
/**
 * A subject as a line of text names it.
 * @param subject The diagnostic's subject.
 * @returns Its kind in the words of a person, then its quoted name.
 */
function describeSubject(subject: DiagnosticSubject): string {
	return `${SUBJECT_WORD[subject.kind]} ${JSON.stringify(subject.name)}`;
}
/**
 * One diagnostic as a line of text: severity, where, the node, relationship or
 * step it is about when it names one, and what is wrong.
 * @param issue The diagnostic, or a finding of the code check.
 * @returns The line.
 */
function diagnosticLine(issue: DiagnosticOfAnySeverity): string {
	const where = `${issue.file}${issue.path === undefined ? "" : `:${issue.path}`}`;
	const about = issue.subject === undefined ? "" : `${describeSubject(issue.subject)}: `;
	return `${issue.severity}: ${where}: ${about}${issue.message}`;
}
const VaultCheckSchema = z.object({
	policy: SemanticPolicySchema,
	configurationValid: z.boolean(),
	configurationFile: z.string(),
	fingerprint: z.string(),
	diagnostics: z.array(VaultDiagnosticSchema),
});

export {
	type DiagnosticSubject,
	describeSubject,
	diagnosticLine,
	VaultDiagnosticSchema,
	type VaultDiagnostic,
	VaultCheckSchema,
};

/**
 * The schema `VaultCheckSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function vaultCheckSchema(): typeof VaultCheckSchema {
	return VaultCheckSchema;
}

/**
 * The schema `VaultDiagnosticSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function vaultDiagnosticSchema(): typeof VaultDiagnosticSchema {
	return VaultDiagnosticSchema;
}
