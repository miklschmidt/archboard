import { z } from "zod";

/** Curated paired colors. Consumers name these; maintainers tune them here. */
const SEMANTIC_PALETTE = {
	red: { light: "#dc2626", dark: "#f87171" },
	orange: { light: "#ea580c", dark: "#fb923c" },
	amber: { light: "#b45309", dark: "#fbbf24" },
	yellow: { light: "#a16207", dark: "#facc15" },
	lime: { light: "#4d7c0f", dark: "#a3e635" },
	green: { light: "#15803d", dark: "#4ade80" },
	emerald: { light: "#047857", dark: "#34d399" },
	teal: { light: "#0f766e", dark: "#2dd4bf" },
	cyan: { light: "#0e7490", dark: "#22d3ee" },
	sky: { light: "#0369a1", dark: "#38bdf8" },
	blue: { light: "#2563eb", dark: "#60a5fa" },
	indigo: { light: "#4f46e5", dark: "#818cf8" },
	violet: { light: "#7c3aed", dark: "#a78bfa" },
	purple: { light: "#9333ea", dark: "#c084fc" },
	fuchsia: { light: "#c026d3", dark: "#e879f9" },
	pink: { light: "#db2777", dark: "#f472b6" },
	rose: { light: "#e11d48", dark: "#fb7185" },
} as const;
type PaletteColor = keyof typeof SEMANTIC_PALETTE;
const PaletteColorSchema = z.enum(
	Object.keys(SEMANTIC_PALETTE).filter((color): color is PaletteColor =>
		Object.hasOwn(SEMANTIC_PALETTE, color),
	),
);
const VocabularyNameSchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/iu);
const NodePolicySchema = z
	.object({
		name: z.string().trim().min(1),
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
		name: z.string().trim().min(1),
		color: PaletteColorSchema.optional(),
		dash: z.enum(["solid", "dashed", "dotted"]),
		arrowhead: z.enum(["filled", "open", "none"]),
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
				.refine((values) => new Set(values).size === values.length, "Levels must be unique"),
			nodeKinds: z
				.record(VocabularyNameSchema, NodePolicySchema.extend({ icon }))
				.refine((values) => Object.keys(values).length > 0, "Define at least one node kind"),
			relationshipKinds: z
				.record(VocabularyNameSchema, RelationshipPolicySchema)
				.refine(
					(values) => Object.keys(values).length > 0,
					"Define at least one relationship kind",
				),
		})
		.strict();
}
const SemanticPolicySchema = createSemanticPolicySchema();
type SemanticPolicy = z.infer<typeof SemanticPolicySchema>;
const DEFAULT_SEMANTIC_POLICY: SemanticPolicy = {
	levels: ["system", "service", "module"],
	nodeKinds: {
		service: { name: "Service", icon: "RiServerLine" },
		app: { name: "Application", icon: "RiWindowLine" },
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeLine" },
		route: { name: "Route", icon: "RiRouteLine" },
		job: { name: "Job", icon: "RiTimerLine" },
		queue: { name: "Queue", icon: "RiStackLine" },
		datastore: { name: "Data store", icon: "RiDatabase2Line" },
		cache: { name: "Cache", icon: "RiFlashlightLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
		config: { name: "Configuration", icon: "RiSettings3Line" },
		test: { name: "Test", icon: "RiFlaskLine" },
		package: { name: "Package", icon: "RiArchiveLine" },
		other: { name: "Other", icon: "RiPuzzleLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", dash: "dashed", arrowhead: "open" },
		queue: { name: "Queue", dash: "dashed", arrowhead: "open" },
		data: { name: "Data", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		render: { name: "Render", dash: "solid", arrowhead: "filled" },
		other: { name: "Other", dash: "solid", arrowhead: "filled" },
	},
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
	createSemanticPolicySchema,
	SEMANTIC_PALETTE,
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
