import { z } from "zod";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import { CodeCheckPolicySchema } from "#shared/schemas/code-check-policy.ts";

/** Stable vocabulary names; their light and dark colors live in packages/renderer/assets/theme.css. */
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
/**
 * What one piece of code or infrastructure proves about two parts (ADR 0046).
 * They live beside the vocabulary because the vault configuration names the
 * ones each relationship kind accepts.
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
/**
 * What a relationship does at its target: it changes state or has an effect
 * outside the caller (`mutation`), it reads held or fetched state (`query`), or
 * its answer follows from what it hands over alone (`compute`). The kind says
 * how a relationship travels and the effect what it does (TASK-663).
 */
const RelationshipEffectSchema = z.enum(["mutation", "query", "compute"]);
/**
 * The one kind whose relationships may state no effect: a declared
 * requirement, of which nothing runs at run time. Every other kind, a vault's
 * own included, states one.
 */
const EFFECTLESS_KIND = "dependency";
const ArrowheadSchema = z.enum(["filled", "open", "none"]);
/** How the old format dashed a kind's lines. The current format takes a line's dash from its effect. */
const DashSchema = z.enum(["solid", "dashed", "dotted"]);
/** One relationship kind as a vault writes it. The kind is the color of its lines. */
const RelationshipPolicySchema = z
	.object({
		name: PolicyDisplayNameSchema,
		color: PaletteColorSchema.optional(),
		arrowhead: ArrowheadSchema,
		evidence: z
			.array(EvidenceKindSchema)
			.min(1)
			.refine((values) => new Set(values).size === values.length, "Evidence kinds must be unique")
			.optional()
			.meta({
				uniqueItems: true,
				description:
					"The evidence kinds that prove a relationship of this kind to `archboard check code` (ADR 0046). A kind without the key accepts every evidence kind, and the check never judges the evidence of its relationships.",
			}),
	})
	.strict();
type RelationshipPolicy = z.infer<typeof RelationshipPolicySchema>;
/**
 * One relationship kind with a dash, its fields in the order the old format
 * wrote them, which the digests of old readings read.
 * @param dash The dash, required or optional.
 * @returns The kind's schema.
 */
function dashedKindSchema<Dash extends z.ZodType>(dash: Dash) {
	const { name, color, arrowhead, evidence } = RelationshipPolicySchema.shape;
	return z.object({ name, color, dash, arrowhead, evidence }).strict();
}
/** One relationship kind of a vault in the old format, which dashed every line of a kind alike. */
const LegacyRelationshipPolicySchema = dashedKindSchema(DashSchema);
/**
 * One relationship kind as a reading carries it. Only a reading of the old
 * format has a dash: it keeps its recorded look (ADR 0065).
 */
const RelationshipLookSchema = dashedKindSchema(DashSchema.optional());
/**
 * Which relationships one entry of a lens names: those of a kind, those with
 * an effect, or those of a kind with an effect. A relationship that states no
 * effect matches no selector that names one.
 */
const LensSelectorSchema = z
	.object({
		kind: VocabularyNameSchema.optional(),
		effect: RelationshipEffectSchema.optional(),
	})
	.strict()
	.refine((selector) => selector.kind !== undefined || selector.effect !== undefined, {
		message: "A selector names a kind, an effect, or both",
	});
/**
 * A named question a picture is read through: which of its relationships
 * draw. It has exactly one list: `show` draws only what its selectors match,
 * `hide` draws all but that. A lens never removes a part.
 */
const LensSchema = z
	.object({
		name: PolicyDisplayNameSchema,
		question: z.string().trim().min(1).optional(),
		show: z.array(LensSelectorSchema).optional(),
		hide: z.array(LensSelectorSchema).optional(),
	})
	.strict()
	.refine((lens) => (lens.show === undefined) !== (lens.hide === undefined), {
		message: "A lens has exactly one list: show or hide",
	});
type Lens = z.infer<typeof LensSchema>;
/**
 * One configured group a node may belong to. The record key is the stable id
 * models carry; the name is what a reader sees, and renaming it changes no
 * model and no comparison. The colour is required: a group colours the cards
 * and the containers' headers placed with it and the region that gathers them
 * (ADR 0038), so a group without one could not be drawn. A kind's colour is
 * its icon chip's. The refusal's path names the group.
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
 * What proves a relationship across a network, an event bus, a queue, a
 * process boundary or a store: a use in code, a trigger or a route in
 * infrastructure, or configuration that points one part at the other (ADR 0046).
 */
const NETWORK: EvidenceKind[] = ["call", "configured-path"];
/**
 * The relationship kinds every vault has, by how a relationship travels. A
 * vault's own entry replaces the built-in of its id whole, and a vault adds a
 * kind with an id of its own. `other` is a labelled relationship that fits no
 * kind. Every kind but `other` names the evidence kinds that prove it to the
 * code check (ADR 0046); `other` has no key, so it accepts every kind.
 */
const BUILT_IN_RELATIONSHIP_KINDS: Record<string, RelationshipPolicy> = {
	call: { name: "Call", arrowhead: "filled", evidence: ["call"] },
	http: { name: "HTTP", color: "sky", arrowhead: "filled", evidence: NETWORK },
	rpc: { name: "RPC", color: "blue", arrowhead: "filled", evidence: NETWORK },
	event: { name: "Event", color: "amber", arrowhead: "open", evidence: NETWORK },
	queue: { name: "Queue", color: "orange", arrowhead: "open", evidence: NETWORK },
	stream: { name: "Stream", color: "teal", arrowhead: "filled", evidence: NETWORK },
	spawn: { name: "Spawn", color: "fuchsia", arrowhead: "filled", evidence: NETWORK },
	render: { name: "Render", color: "pink", arrowhead: "filled", evidence: ["call"] },
	storage: { name: "Storage", color: "emerald", arrowhead: "filled", evidence: NETWORK },
	dependency: {
		name: "Dependency",
		arrowhead: "open",
		evidence: ["call", "configured-path", "import", "build-dependency"],
	},
	other: { name: "Other", arrowhead: "filled" },
};
/**
 * The lens of every relationship. A vault may rename it but not narrow it, so
 * Show all means one thing in every vault.
 */
const ALL_LENS_ID = "all";
const ALL_LENS: Lens = { name: "All relationships", hide: [] };
/**
 * The lenses every vault has. A vault's own lens replaces the built-in of its
 * id whole; `all` keeps showing everything. `main` is the default: it leaves out declared
 * dependencies and in-process queries and computes, and shows every mutation
 * and all traffic between processes.
 */
const BUILT_IN_LENSES: Record<string, Lens> = {
	main: {
		name: "Main lines",
		hide: [
			{ kind: EFFECTLESS_KIND },
			{ kind: "call", effect: "query" },
			{ kind: "call", effect: "compute" },
		],
	},
	effects: {
		name: "Effects",
		question: "Where does state change?",
		show: [{ effect: "mutation" }],
	},
	reads: {
		name: "Reads",
		question: "Where is held or fetched state read?",
		show: [{ effect: "query" }],
	},
	network: {
		name: "Network",
		question: "How does traffic flow between processes?",
		show: ["http", "rpc", "queue", "event", "stream"].map((kind) => ({ kind })),
	},
	dependencies: { name: "Declared dependencies", show: [{ kind: EFFECTLESS_KIND }] },
	[ALL_LENS_ID]: ALL_LENS,
};
const DEFAULT_LENS_ID = "main";
/**
 * The vocabulary fields a vault writes and a reading carries alike, in the
 * order every policy has kept them, which digests and fingerprints read.
 * @param icon Valid icon names.
 * @param relationshipKinds The relationship kinds of this form of the policy.
 * @returns The shape of those fields.
 */
function vocabularyShape<Kinds extends z.ZodType>(
	icon: z.ZodType<string>,
	relationshipKinds: Kinds,
) {
	return {
		levels: z
			.array(VocabularyNameSchema)
			.default([])
			.refine((values) => new Set(values).size === values.length, "Levels must be unique")
			.meta({
				uniqueItems: true,
				description:
					"Original legacy levels retained for migration and exact historical readings. Canonical navigation uses module containment.",
			}),
		nodeKinds: z
			.record(VocabularyNameSchema, NodePolicySchema.extend({ icon }))
			.refine((values) => Object.keys(values).length > 0, "Define at least one node kind")
			.meta({ minProperties: 1 }),
		relationshipKinds,
		/** Groups nodes may belong to, by stable id. None by default. */
		groups: z.record(VocabularyNameSchema, GroupPolicySchema).default({}),
		codeCheck: CodeCheckPolicySchema.optional().meta({
			description:
				"What the code check fails on beyond its warnings, and the level of each module-depth finding. Without it, every module-depth finding keeps its built-in level and no gate is on.",
		}),
	};
}
/**
 * The policy a reading carries: the vocabulary in effect, built-ins included,
 * with the lenses it is read through. Readers need only the transport spelling
 * of an icon.
 */
const SemanticPolicySchema = z
	.object({
		...vocabularyShape(
			NodePolicySchema.shape.icon,
			z
				.record(VocabularyNameSchema, RelationshipLookSchema)
				.refine((values) => Object.keys(values).length > 0, "Define at least one relationship kind")
				.meta({ minProperties: 1 }),
		),
		lenses: z.record(VocabularyNameSchema, LensSchema).default({ [ALL_LENS_ID]: ALL_LENS }),
		defaultLens: VocabularyNameSchema.default(ALL_LENS_ID),
	})
	.strict();
type SemanticPolicy = z.infer<typeof SemanticPolicySchema>;
type AuthoredPolicy = z.infer<ReturnType<typeof authoredPolicySchema>>;
/**
 * The policy a vault writes in its configuration: its own node kinds and
 * groups, the relationship kinds it adds or replaces, and its lenses.
 * @param icon Valid icon names.
 * @returns The authored shape, before validation against the kinds in effect.
 */
function authoredPolicySchema(icon: z.ZodType<string>) {
	return z
		.object({
			...vocabularyShape(
				icon,
				z.record(VocabularyNameSchema, RelationshipPolicySchema).default({}).meta({
					description:
						"The relationship kinds this vault adds, or replaces by id. The built-in kinds sit under them: call, http, rpc, event, queue, stream, spawn, render, storage, dependency and other. A kind the vault adds names its color.",
				}),
			),
			lenses: z.record(VocabularyNameSchema, LensSchema).default({}).meta({
				description:
					"The lenses this vault adds, or replaces by id. The built-in lenses sit under them: main, effects, reads, network, dependencies and all. `all` shows every relationship: a vault may rename it, and its list stays `hide: []`.",
			}),
			defaultLens: VocabularyNameSchema.optional().meta({
				description: "The lens a picture is read through when it names none. Without it, `main`.",
			}),
		})
		.strict();
}
/** One refusal of an authored policy, where its repair starts. */
interface PolicyIssue {
	readonly path: PropertyKey[];
	readonly message: string;
}
/**
 * The kinds a vault adds without a color: the kind is the color of its lines.
 * @param authored The authored policy.
 * @returns A refusal for each, at its color.
 */
function colorlessKinds(authored: AuthoredPolicy): PolicyIssue[] {
	return Object.entries(authored.relationshipKinds)
		.filter(
			([id, kind]) => !Object.hasOwn(BUILT_IN_RELATIONSHIP_KINDS, id) && kind.color === undefined,
		)
		.map(([id]) => ({
			path: ["relationshipKinds", id, "color"],
			message: `A kind the vault adds names its color, because the kind is the color of its lines: add color: with one of ${PaletteColorSchema.options.join(", ")}`,
		}));
}
/**
 * A vault's `all` lens that no longer shows every relationship.
 * @param authored The authored policy.
 * @returns Its refusal, or none.
 */
function narrowedAll(authored: AuthoredPolicy): PolicyIssue[] {
	const all = authored.lenses[ALL_LENS_ID];
	if (all === undefined || (all.show === undefined && (all.hide ?? []).length === 0)) return [];
	return [
		{
			path: ["lenses", ALL_LENS_ID],
			message:
				"The lens all shows every relationship in every vault: a vault may rename it, and its list stays hide: []. Give this lens another id",
		},
	];
}
/**
 * The lens selectors that name a kind the policy does not have.
 * @param authored The authored policy.
 * @returns A refusal for each, at the selector's kind.
 */
function unknownLensKinds(authored: AuthoredPolicy): PolicyIssue[] {
	const kinds = new Set([
		...Object.keys(BUILT_IN_RELATIONSHIP_KINDS),
		...Object.keys(authored.relationshipKinds),
	]);
	return Object.entries(authored.lenses).flatMap(([id, lens]) =>
		(["show", "hide"] as const).flatMap((list) =>
			(lens[list] ?? []).flatMap((selector, index) =>
				selector.kind === undefined || kinds.has(selector.kind)
					? []
					: [
							{
								path: ["lenses", id, list, index, "kind"],
								message: `Unknown relationship kind "${selector.kind}": use one of ${[...kinds].join(", ")}`,
							},
						],
			),
		),
	);
}
/**
 * A default lens the policy does not have.
 * @param authored The authored policy.
 * @returns Its refusal, or none.
 */
function unknownDefaultLens(authored: AuthoredPolicy): PolicyIssue[] {
	const lenses = new Set([...Object.keys(BUILT_IN_LENSES), ...Object.keys(authored.lenses)]);
	if (authored.defaultLens === undefined || lenses.has(authored.defaultLens)) return [];
	return [
		{
			path: ["defaultLens"],
			message: `Unknown lens "${authored.defaultLens}": use one of ${[...lenses].join(", ")}`,
		},
	];
}
/**
 * Refuse an authored policy at each place where it names what is not in
 * effect, or adds a kind without its color.
 * @param authored The authored policy.
 * @param context Where the issues go.
 */
function refusePolicyIssues(authored: AuthoredPolicy, context: z.RefinementCtx): void {
	for (const issue of [
		...colorlessKinds(authored),
		...narrowedAll(authored),
		...unknownLensKinds(authored),
		...unknownDefaultLens(authored),
	])
		context.addIssue({ code: "custom", ...issue });
}
/**
 * The policy in effect for an authored one: the built-ins under the vault's own.
 * @param authored The validated authored policy.
 * @returns The policy a reading carries.
 */
function resolvePolicy(authored: AuthoredPolicy): SemanticPolicy {
	return {
		...authored,
		relationshipKinds: { ...BUILT_IN_RELATIONSHIP_KINDS, ...authored.relationshipKinds },
		lenses: { ...BUILT_IN_LENSES, ...authored.lenses },
		defaultLens: authored.defaultLens ?? DEFAULT_LENS_ID,
	};
}
/**
 * The entries a vault states itself: those that differ from the built-in of their id.
 * @param values The entries in effect.
 * @param builtIn The built-ins they sit over.
 * @returns The vault's own entries.
 */
function ownEntries<T>(values: Record<string, T>, builtIn: Record<string, T>): Record<string, T> {
	return Object.fromEntries(
		Object.entries(values).filter(([id, value]) => !sameSemanticValue(value, builtIn[id])),
	);
}
/**
 * The configuration that reads back as a policy in effect, so a reading can
 * be written again as inputs, and what a digest of a reading's policy reads. A policy of the old format, which records a dash
 * on each kind, is written in the old format and without lenses; any other
 * keeps only what differs from the built-ins.
 * @param policy The policy in effect.
 * @returns The configuration to write.
 */
function configurationOf(policy: SemanticPolicy): Record<string, unknown> {
	const { lenses, defaultLens, ...vocabulary } = policy;
	if (Object.values(vocabulary.relationshipKinds).some((kind) => kind.dash !== undefined))
		return vocabulary;
	return {
		...vocabulary,
		relationshipKinds: ownEntries(vocabulary.relationshipKinds, BUILT_IN_RELATIONSHIP_KINDS),
		lenses: ownEntries(lenses, BUILT_IN_LENSES),
		...(defaultLens === DEFAULT_LENS_ID ? {} : { defaultLens }),
	};
}
/**
 * Build the contract of a vault's configuration, which reads as the policy in effect.
 * @param icon Valid icon names.
 * @returns The configuration schema.
 */
function createVaultConfigurationSchema(icon: z.ZodType<string> = NodePolicySchema.shape.icon) {
	return authoredPolicySchema(icon).superRefine(refusePolicyIssues).transform(resolvePolicy);
}
/**
 * Build the contract of a vault configuration in the old format, read exactly
 * for an old vault and for history: its kinds, dashes included, are the whole
 * vocabulary, and it has no lenses, so every relationship draws.
 * @param icon Valid icon names.
 * @returns The old configuration schema.
 */
function createLegacyVaultConfigurationSchema(
	icon: z.ZodType<string> = NodePolicySchema.shape.icon,
) {
	return z
		.object({
			...vocabularyShape(
				icon,
				z
					.record(VocabularyNameSchema, LegacyRelationshipPolicySchema)
					.refine(
						(values) => Object.keys(values).length > 0,
						"Define at least one relationship kind",
					)
					.meta({ minProperties: 1 }),
			),
		})
		.strict()
		.transform((legacy): SemanticPolicy => ({
			...legacy,
			lenses: { [ALL_LENS_ID]: ALL_LENS },
			defaultLens: ALL_LENS_ID,
		}));
}
/**
 * The node kinds a vault has before its owner writes config.yaml, which
 * `model init` writes for it. Every kind a model is likely to draw carries a
 * colour, so a fresh vault is not neutral gray (ADR 0038 makes a group's
 * colour mandatory once configured); external and other stay neutral so a
 * part outside the checkout reads as outside.
 *
 * There is a kind for every level, named after it, because a node standing for
 * what another model describes carries that model's level as its kind
 * (ADR 0029). Without `system` beside `service` and `module`, a model could
 * not say that one of its parts is a whole system described elsewhere.
 */
const DEFAULT_VAULT_CONFIGURATION = {
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
} as const satisfies z.input<ReturnType<typeof authoredPolicySchema>>;
/** The policy in effect before a vault writes config.yaml, with the levels a legacy reading falls back to. */
const DEFAULT_SEMANTIC_POLICY: SemanticPolicy = createVaultConfigurationSchema().parse({
	...DEFAULT_VAULT_CONFIGURATION,
	levels: ["system", "service", "module"],
});
export {
	VocabularyNameSchema,
	createVaultConfigurationSchema,
	createLegacyVaultConfigurationSchema,
	configurationOf,
	DEFAULT_VAULT_CONFIGURATION,
	RelationshipEffectSchema,
	EFFECTLESS_KIND,
	PaletteColorSchema,
	SemanticPolicySchema,
	type SemanticPolicy,
	DEFAULT_SEMANTIC_POLICY,
	EvidenceKindSchema,
};

/**
 * The value `DEFAULT_SEMANTIC_POLICY`, for callers that read it.
 * @returns The value.
 */
export function defaultSemanticPolicy(): typeof DEFAULT_SEMANTIC_POLICY {
	return DEFAULT_SEMANTIC_POLICY;
}

/**
 * The schema `EvidenceKindSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function evidenceKindSchema(): typeof EvidenceKindSchema {
	return EvidenceKindSchema;
}

/**
 * The schema `PaletteColorSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function paletteColorSchema(): typeof PaletteColorSchema {
	return PaletteColorSchema;
}

/**
 * The schema `SemanticPolicySchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function semanticPolicySchema(): typeof SemanticPolicySchema {
	return SemanticPolicySchema;
}
