import { z } from "zod";

/** Stable vocabulary names; their light and dark colors live in shared/theme/theme.css. */
const PaletteColorSchema = z.enum([
	"red",
	"orange",
	"amber",
	"yellow",
	"lime",
	"green",
	"emerald",
	"teal",
	"cyan",
	"sky",
	"blue",
	"indigo",
	"violet",
	"purple",
	"fuchsia",
	"pink",
	"rose",
]);
type PaletteColor = z.infer<typeof PaletteColorSchema>;
const VocabularyNameSchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/iu);
const PolicyDisplayNameSchema = z.string().trim().min(1).regex(/\S/u, "Name cannot be blank");
const NodePolicySchema = z
	.object({
		name: PolicyDisplayNameSchema,
		icon: z
			.string()
			.regex(
				/^Ri[A-Za-z0-9]+(?:Line|Fill)$/u,
				"Use a RemixIcon export name, for example RiServerLine",
			),
		color: PaletteColorSchema.optional(),
	})
	.strict();
const RelationshipPolicySchema = z
	.object({
		name: PolicyDisplayNameSchema,
		color: PaletteColorSchema.optional(),
		dash: z.enum(["solid", "dashed", "dotted"]),
		arrowhead: z.enum(["filled", "open", "none"]),
	})
	.strict();
/**
 * One configured group a node may belong to. The record key is the stable id
 * boards carry; the name is what a reader sees, and renaming it changes no
 * board and no comparison. The colour is required: a group colours the cards
 * placed with it and the region that gathers them (ADR 0038), so a group
 * without one could not be drawn. The refusal's path names the group.
 */
const GroupPolicySchema = z
	.object({
		name: PolicyDisplayNameSchema,
		color: z.enum(PaletteColorSchema.options, {
			error: `Every group needs a color: add color: with one of ${PaletteColorSchema.options.join(", ")}.`,
		}),
	})
	.strict();
/**
 * Build the policy contract with the icon vocabulary available at this boundary.
 * @param icon Valid icon names; browser readers only need the transport spelling.
 * @returns The policy schema shared by authoring validation and read contracts.
 */
function createSemanticPolicySchema(icon: z.ZodType<string> = NodePolicySchema.shape.icon) {
	return z
		.object({
			levels: z
				.array(VocabularyNameSchema)
				.min(1)
				.refine((values) => new Set(values).size === values.length, "Levels must be unique")
				.meta({
					uniqueItems: true,
					description:
						"The vault's levels, coarsest first: the order decides which board a drill link places above another.",
				}),
			nodeKinds: z
				.record(VocabularyNameSchema, NodePolicySchema.extend({ icon }))
				.refine((values) => Object.keys(values).length > 0, "Define at least one node kind")
				.meta({ minProperties: 1 }),
			relationshipKinds: z
				.record(VocabularyNameSchema, RelationshipPolicySchema)
				.refine((values) => Object.keys(values).length > 0, "Define at least one relationship kind")
				.meta({ minProperties: 1 }),
			/** Groups nodes may belong to, by stable id. None by default. */
			groups: z.record(VocabularyNameSchema, GroupPolicySchema).default({}),
		})
		.strict();
}
const SemanticPolicySchema = createSemanticPolicySchema();
type SemanticPolicy = z.infer<typeof SemanticPolicySchema>;
/**
 * The vocabulary a vault has before its owner writes config.yaml. Every kind
 * a board is likely to draw carries a colour, so a fresh vault is not neutral
 * gray (ADR 0025 makes containment colour mandatory once configured);
 * external and other stay neutral so a part outside the checkout reads as
 * outside, and call and dependency keep the neutral edge ink.
 *
 * There is a kind for every level, named after it, because a node standing for
 * what another board describes carries that board's level as its kind
 * (ADR 0029). Without `system` beside `service` and `module`, a board could
 * not say that one of its parts is a whole system described elsewhere.
 */
const DEFAULT_SEMANTIC_POLICY: SemanticPolicy = {
	levels: ["system", "service", "module"],
	nodeKinds: {
		system: { name: "System", icon: "RiApps2Line", color: "sky" },
		service: { name: "Service", icon: "RiServerLine", color: "blue" },
		app: { name: "Application", icon: "RiWindowLine", color: "indigo" },
		module: { name: "Module", icon: "RiBox3Line", color: "teal" },
		function: { name: "Function", icon: "RiCodeLine", color: "cyan" },
		route: { name: "Route", icon: "RiRouteLine", color: "violet" },
		job: { name: "Job", icon: "RiTimerLine", color: "amber" },
		queue: { name: "Queue", icon: "RiStackLine", color: "orange" },
		datastore: { name: "Data store", icon: "RiDatabase2Line", color: "emerald" },
		cache: { name: "Cache", icon: "RiFlashlightLine", color: "yellow" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		ui: { name: "User interface", icon: "RiLayoutLine", color: "pink" },
		config: { name: "Configuration", icon: "RiSettings3Line", color: "lime" },
		test: { name: "Test", icon: "RiFlaskLine", color: "purple" },
		package: { name: "Package", icon: "RiArchiveLine", color: "fuchsia" },
		other: { name: "Other", icon: "RiPuzzleLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "blue", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "amber", dash: "dashed", arrowhead: "open" },
		queue: { name: "Queue", color: "orange", dash: "dashed", arrowhead: "open" },
		data: { name: "Data", color: "emerald", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
		other: { name: "Other", dash: "solid", arrowhead: "filled" },
	},
	groups: {},
};
/**
 * The one node, relationship or flow step a diagnostic is about. The board and
 * variant it sits on are the diagnostic's own, so `id` alone finds it there.
 * The kinds are the board's own subject kinds (`edge` is a relationship). A
 * step carries an anchor, so the code check names one (ADR 0046); the plain
 * check never does, and every reader accepts one. `name` is what a reader
 * would call it, carried so a line of text can say it without reading the
 * board again: a step, which has no name of its own, is named by its flow, its
 * ends and its label.
 */
const DiagnosticSubjectSchema = z.object({
	kind: z.enum(["node", "edge", "step"]),
	id: z.string(),
	name: z.string(),
});
type DiagnosticSubject = z.infer<typeof DiagnosticSubjectSchema>;
const VaultDiagnosticSchema = z.object({
	severity: z.enum(["warning", "error"]),
	code: z.string(),
	file: z.string(),
	path: z.string().optional(),
	board: z.string().optional(),
	variant: z.string().optional(),
	subject: DiagnosticSubjectSchema.optional(),
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
const SUBJECT_WORD = { node: "node", edge: "relationship", step: "step" } as const;
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
/**
 * What one piece of code or infrastructure proves about two parts (ADR 0046).
 * They live beside the vocabulary because the vault configuration will name
 * the ones each relationship kind accepts (TASK-367.07).
 */
const EvidenceKindSchema = z.enum([
	"call",
	"configured-path",
	"permission",
	"import",
	"build-dependency",
	"provisioning",
]);
type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
const VaultCheckSchema = z.object({
	policy: SemanticPolicySchema,
	configurationValid: z.boolean(),
	configurationFile: z.string(),
	fingerprint: z.string(),
	diagnostics: z.array(VaultDiagnosticSchema),
});
type VaultCheck = z.infer<typeof VaultCheckSchema>;

export {
	VocabularyNameSchema,
	GroupPolicySchema,
	createSemanticPolicySchema,
	PaletteColorSchema,
	type PaletteColor,
	SemanticPolicySchema,
	type SemanticPolicy,
	DEFAULT_SEMANTIC_POLICY,
	type DiagnosticSubject,
	describeSubject,
	diagnosticLine,
	EvidenceKindSchema,
	type EvidenceKind,
	VaultDiagnosticSchema,
	type VaultDiagnostic,
	VaultCheckSchema,
	type VaultCheck,
};
