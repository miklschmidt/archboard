import { z } from "zod";
import { ArchitectureRenderRequestSchema } from "#shared/canonical-contracts/schemas/model-operations.ts";
import { ModelFlowSchema, NewFlowSchema } from "#shared/canonical-contracts/schemas/model-flows.ts";
import { ReadingSelectionSchema } from "#shared/schemas/model-explanation.ts";
import { LayoutEngineSchema } from "#shared/protocol/render-reply.ts";
import { LineEffectSchema } from "#shared/schemas/semantic-policy.ts";
import { DiagramGrammarSchema } from "#shared/schemas/vocabulary.ts";
import { QualifiedSubjectIdSchema } from "#shared/schemas/primitives.ts";

/** Theme choice an agent or reader can set on the connected browser. */
const PaneThemePreferenceSchema = z.enum(["light", "dark", "system"]);

/** Whether hovering a card dims unrelated parts of the picture. */
const PaneHoverLightSchema = z.enum(["on", "off"]);

/** Which page of the open module is shown in the pane. */
const PanePageSchema = z.enum(["diagram", "about"]);

/** Browser display settings applied without changing navigation. */
const PaneDisplaySettingsSchema = z.strictObject({
	layout: LayoutEngineSchema.optional(),
	theme: PaneThemePreferenceSchema.optional(),
	hoverLight: PaneHoverLightSchema.optional(),
});

/** Socket message that updates browser display settings in place. */
const PaneSettingsRequestSchema = z
	.object({
		type: z.literal("pane_settings"),
		...PaneDisplaySettingsSchema.shape,
	})
	.strip();

/** A transient actor or component synthesized for an unsaved ephemeral flow. */
const EphemeralParticipantSchema = z.strictObject({
	id: QualifiedSubjectIdSchema,
	name: z.string().min(1).max(120),
});

/** A server-resolved unsaved flow rendered in session only, never written to the vault. */
const ResolvedEphemeralFlowSchema = z.strictObject({
	flow: ModelFlowSchema,
	syntheticParticipants: z.array(EphemeralParticipantSchema).optional(),
});

const ArchitecturePaneReadingSchema = ArchitectureRenderRequestSchema.omit({
	theme: true,
	legend: true,
	layout: true,
	grammar: true,
	scope: true,
	focus: true,
	expand: true,
}).extend({
	...ReadingSelectionSchema.shape,
	model: z.string().min(1).optional(),
	grammar: DiagramGrammarSchema.optional(),
	scope: z.string().min(1).optional(),
	focus: z.array(z.string().min(1)).optional(),
	expand: z.array(z.string().min(1)).optional(),
	beat: z.int().nonnegative().optional(),
	/** Positive relationship-kind filter; expands into lens + complement hideKinds on the server. */
	onlyKinds: z.array(z.string().min(1)).optional(),
	/** Positive effect filter; expands into complement hideEffects on the server. */
	onlyEffects: z.array(LineEffectSchema).optional(),
	/** Directional filter: focus relationships whose target is one of these modules (or descendants). */
	to: z.array(z.string().min(1)).optional(),
	/** Directional filter: focus relationships whose source is one of these modules (or descendants). */
	from: z.array(z.string().min(1)).optional(),
	/** Subjects to select in the pane without changing its scope or focus. */
	select: z.array(z.string().min(1)).optional(),
	/** Configured semantic group whose member modules should be selected. */
	group: z.string().min(1).optional(),
	/** Source Git branch or commit for a read-only branch reading. */
	ref: z.string().min(1).optional(),
	/** Repository-relative file path to show in Code mode. */
	file: z.string().min(1).optional(),
	/** Repository of `file` when outside the model's own repository. */
	fileRepo: z.string().min(1).optional(),
	/** Which page of the open module to show: diagram or about. */
	page: PanePageSchema.optional(),
	/** Layout engine preference to apply to the browser. */
	layout: LayoutEngineSchema.optional(),
	/** Theme preference to apply to the browser. */
	theme: PaneThemePreferenceSchema.optional(),
	/** Hover-dimming preference to apply to the browser. */
	hoverLight: PaneHoverLightSchema.optional(),
	/** Preserve the target pane's current reading fields for anything not explicitly overridden. */
	keep: z.boolean().optional(),
	/** Unsaved flow input validated and projected on the fly without writing to the vault. */
	ephemeralFlow: NewFlowSchema.optional(),
	/** Server-resolved unsaved flow delivered over the pane socket. */
	resolvedEphemeralFlow: ResolvedEphemeralFlowSchema.optional(),
});

export {
	ArchitecturePaneReadingSchema,
	EphemeralParticipantSchema,
	PaneDisplaySettingsSchema,
	PaneHoverLightSchema,
	PanePageSchema,
	PaneSettingsRequestSchema,
	PaneThemePreferenceSchema,
	ResolvedEphemeralFlowSchema,
};

/**
 * The schema `ArchitecturePaneReadingSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function architecturePaneReadingSchema(): typeof ArchitecturePaneReadingSchema {
	return ArchitecturePaneReadingSchema;
}

/**
 * The schema `NewFlowSchema`, for callers that parse ephemeral flow input.
 * @returns The schema.
 */
export function ephemeralFlowInputSchema(): typeof NewFlowSchema {
	return NewFlowSchema;
}

/**
 * The schema `PaneDisplaySettingsSchema`, for callers that parse browser display settings.
 * @returns The schema.
 */
export function paneDisplaySettingsSchema(): typeof PaneDisplaySettingsSchema {
	return PaneDisplaySettingsSchema;
}

/**
 * The schema `PaneSettingsRequestSchema`, for callers that parse socket display-settings messages.
 * @returns The schema.
 */
export function paneSettingsRequestSchema(): typeof PaneSettingsRequestSchema {
	return PaneSettingsRequestSchema;
}

/**
 * The schema `ResolvedEphemeralFlowSchema`, for callers that inspect resolved temporary flows.
 * @returns The schema.
 */
export function resolvedEphemeralFlowSchema(): typeof ResolvedEphemeralFlowSchema {
	return ResolvedEphemeralFlowSchema;
}

/**
 * The schema `QualifiedSubjectIdSchema`, for validating qualified subject identities.
 * @returns The schema.
 */
export function qualifiedSubjectIdSchema(): typeof QualifiedSubjectIdSchema {
	return QualifiedSubjectIdSchema;
}
