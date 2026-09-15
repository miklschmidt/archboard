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
 * board and no comparison.
 */
const GroupPolicySchema = z.object({ name: PolicyDisplayNameSchema }).strict();
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
				.meta({ uniqueItems: true }),
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
 */
const DEFAULT_SEMANTIC_POLICY: SemanticPolicy = {
	levels: ["system", "service", "module"],
	nodeKinds: {
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
const VaultDiagnosticSchema = z.object({
	severity: z.enum(["warning", "error"]),
	code: z.string(),
	file: z.string(),
	path: z.string().optional(),
	board: z.string().optional(),
	variant: z.string().optional(),
	message: z.string(),
});
type VaultDiagnostic = z.infer<typeof VaultDiagnosticSchema>;
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
	VaultDiagnosticSchema,
	type VaultDiagnostic,
	VaultCheckSchema,
	type VaultCheck,
};
