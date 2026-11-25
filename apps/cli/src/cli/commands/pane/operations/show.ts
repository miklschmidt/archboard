import {
	architecturePaneReadingSchema,
	ephemeralFlowInputSchema,
	paneDisplaySettingsSchema,
} from "@archboard/model/pane-context";
import { statedJson } from "#cli/commands/model/operations/input.ts";
import { z } from "zod";
import {
	showModelInPane,
	updateBrowserSettings,
	type ShowModelResponse,
} from "#cli/server-access/clients/panes.ts";
import { CliUsageError, defineCommand } from "#cli/contract/protocol/contract.ts";
import { refusal } from "#cli/contract/protocol/refusals.ts";
import { openCanvas } from "#cli/contract/clients/prerequisites.ts";

const EFFECT_CHOICES = ["mutation", "query", "compute", "declared"] as const;

/**
 * The line that says a show chose another checkout, which the agent tells the user.
 * @param result The show's answer.
 * @returns The line, or none when the show changed no choice.
 */
function choiceLine(result: Pick<ShowModelResponse, "chose">): string[] {
	const { chose } = result;
	if (chose === undefined) return [];
	const instead = chose.replaced === null ? "" : ` in place of ${chose.replaced}`;
	return [
		`This machine now reads ${chose.checkout} for ${chose.repository}${instead}: every pane of it reads this checkout. Tell the user.`,
	];
}

const ShowInputSchema = architecturePaneReadingSchema().extend({
	pane: z.string().optional(),
	input: z.string().optional(),
	flowInput: z.string().optional(),
	noCompare: z.boolean().optional(),
});

const ShowResultSchema = z.looseObject({
	success: z.literal(true),
	model: z.string().optional(),
	reading: architecturePaneReadingSchema(),
	settings: paneDisplaySettingsSchema().optional(),
	revision: z.unknown().optional(),
	repository: z.string().nullable().optional(),
	checkout: z.string().optional(),
	chose: z
		.object({ repository: z.string(), checkout: z.string(), replaced: z.string().nullable() })
		.optional(),
	paneId: z.string(),
});

const browserShowContract = defineCommand({
	path: ["browser", "show"],
	shared: ["url", "directory", "as-session"],
	summary: "Show a canonical reading, filter, code file, or temporary flow in one pane",
	description:
		"Resolves the model, filters, directional focus, code file, page, display settings, or unsaved temporary flow before updating the pane. Use --keep to adjust the current reading without restating every flag. When no browser is connected, it opens the canvas in the default browser and waits for its pane.",
	examples: [
		"archboard browser show --pane A --module Gateway",
		"archboard browser show --only-kind async --only-effect mutation --to Billing",
		"archboard browser show --grammar flowchart --flow-input auth-flow.json",
		"archboard browser show --keep --layout lanes",
	],
	parameters: [
		{
			kind: "positional",
			key: "model",
			name: "model",
			description: "The optional model identity or name",
		},
		...(
			[
				[
					"pane",
					"--pane",
					"pane",
					"Target pane selector (`A`, `left`, `right`, `focused`, position, or id)",
				],
				["module", "--module", "id|name", "Module identity or name to open and select"],
				["scope", "--scope", "id|name", "Scope module identity or name"],
				["state", "--state", "state", "Mutable state (`current` or proposal id/name)"],
				["checkpoint", "--checkpoint", "digest", "Complete retained checkpoint digest"],
				["ref", "--ref", "ref", "Git branch or commit for a read-only branch reading"],
				["flow", "--flow", "id|name", "Authored flow identity or name"],
				[
					"flowInput",
					"--flow-input",
					"file|-",
					"JSON file or `-` for stdin describing a temporary unsaved flow",
				],
				["walkthrough", "--walkthrough", "id|name", "Authored walkthrough identity or name"],
				["lens", "--lens", "id", "Configured lens id (or `all` for every relationship)"],
				[
					"group",
					"--group",
					"id|label",
					"Configured semantic group whose member modules to select",
				],
				["file", "--file", "path", "Repository-relative file path to show in Code view"],
				[
					"fileRepo",
					"--file-repo",
					"repo",
					"Repository of `--file` when outside the model's repository",
				],
				["preview", "--preview", "id", "Migration preview identity"],
				["bookmark", "--bookmark", "id", "Imported bookmark identity"],
				["legacyAddress", "--legacy-address", "address", "Retained legacy address"],
				["input", "--input", "file|-", "JSON file or `-` replacing the reading flags"],
			] as const
		).map(([key, spelling, placeholder, description]) => ({
			kind: "option" as const,
			key,
			spellings: [spelling] as const,
			value: "required" as const,
			placeholder,
			description,
		})),
		{
			kind: "option",
			key: "against",
			spellings: ["--against"],
			value: "required",
			placeholder: "id|name",
			description: "Compare against one explicit state or complete checkpoint identity",
		},
		{
			kind: "option",
			key: "noCompare",
			spellings: ["--no-compare"],
			value: "none",
			description: "Turn comparison off for this reading",
		},
		{
			kind: "option",
			key: "keep",
			spellings: ["--keep"],
			value: "none",
			description: "Preserve the pane's current reading fields for anything not overridden",
		},
		{
			kind: "option",
			key: "grammar",
			spellings: ["--grammar"],
			value: "required",
			choices: ["architecture", "sequence", "flowchart"],
			description: "The diagram grammar",
		},
		{
			kind: "option",
			key: "page",
			spellings: ["--page"],
			value: "required",
			choices: ["diagram", "about"],
			description: "Which page of the open module to show",
		},
		{
			kind: "option",
			key: "layout",
			spellings: ["--layout"],
			value: "required",
			choices: ["blocks", "lanes"],
			description: "Switch the browser layout engine",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			choices: ["light", "dark", "system"],
			description: "Switch the browser color theme",
		},
		{
			kind: "option",
			key: "hoverLight",
			spellings: ["--dim-on-hover"],
			value: "required",
			choices: ["on", "off"],
			description: "Turn hover-dimming on or off in the browser",
		},
		{
			kind: "option",
			key: "beat",
			spellings: ["--beat"],
			value: "required",
			placeholder: "index",
			description: "The zero-based walkthrough beat",
		},
		...(
			[
				["focus", "--focus", "id|name", "Focus subjects or module names"],
				["select", "--select", "id|name", "Select subjects or module names without changing scope"],
				["expand", "--expand", "id|name", "Modules to expand beside the open scope"],
				["hideKinds", "--hide-kind", "kind", "Relationship kinds to hide"],
				["onlyKinds", "--only-kind", "kind", "Show only these relationship kinds"],
				[
					"to",
					"--to",
					"id|name",
					"Focus relationships targeting these modules or their descendants",
				],
				[
					"from",
					"--from",
					"id|name",
					"Focus relationships originating from these modules or their descendants",
				],
			] as const
		).map(([key, spelling, placeholder, description]) => ({
			kind: "option" as const,
			key,
			spellings: [spelling] as const,
			value: "required" as const,
			occurrences: "append" as const,
			placeholder,
			description,
		})),
		...(
			[
				["hideEffects", "--hide-effect", "Effects to hide"],
				["onlyEffects", "--only-effect", "Show only relationships with these effects"],
			] as const
		).map(([key, spelling, description]) => ({
			kind: "option" as const,
			key,
			spellings: [spelling] as const,
			value: "required" as const,
			occurrences: "append" as const,
			choices: [...EFFECT_CHOICES],
			description,
		})),
	],
	input: {
		ingress: ShowInputSchema.extend({ beat: z.coerce.number().int().nonnegative().optional() }),
	},
	result: ShowResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "What the pane is showing now",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: [refusal("server"), refusal("browser")],
	relationships: [
		{
			method: "POST",
			path: "/api/panes/show",
			cardinality: "one",
			description: "Point the existing pane at a canonical reading or update its display settings",
		},
	],
	/**
	 * Show a resolved canonical reading or temporary flow in the named pane.
	 * @param input The complete reading and pane selector.
	 * @param context The invocation capabilities.
	 * @returns The navigation receipt.
	 */
	async handler(input, context) {
		await context.require("server", "Show architecture");
		const { pane, input: file, flowInput, noCompare, ...flags } = input;
		if (file === "-" && flowInput === "-") {
			throw new CliUsageError(
				"--input - and --flow-input - both read standard input: pass one of them as a file.",
			);
		}
		if (noCompare === true && flags.against !== undefined) {
			throw new CliUsageError(
				"--no-compare turns comparison off and --against turns it on: pass one of them.",
			);
		}
		let reading =
			file === undefined
				? { ...flags, ...(noCompare === true ? { compare: false } : {}) }
				: context.parse(
						architecturePaneReadingSchema(),
						await statedJson({ input: file }, context),
					);
		if (flowInput !== undefined) {
			const ephemeralFlow = context.parse(
				ephemeralFlowInputSchema(),
				await statedJson({ input: flowInput }, context),
			);
			reading = { ...reading, ephemeralFlow };
		}
		const opened = await openCanvas(context.vault?.path ?? null, "Show architecture");
		const result = await showModelInPane(reading, pane ?? opened ?? undefined);
		return { result: ShowResultSchema.parse(result), diagnostics: choiceLine(result) };
	},
});

const SettingsInputSchema = paneDisplaySettingsSchema().extend({
	pane: z.string().optional(),
});

const browserSettingsContract = defineCommand({
	path: ["browser", "settings"],
	shared: ["url", "as-session"],
	summary: "Change browser display settings without resetting navigation",
	description:
		"Switches the connected browser's layout engine, color theme, or hover-dimming in place. Needs no vault or -C directory, and leaves the pane's current scope, focus, and filters untouched.",
	examples: [
		"archboard browser settings --layout lanes",
		"archboard browser settings --theme dark --dim-on-hover off",
	],
	parameters: [
		{
			kind: "option",
			key: "pane",
			spellings: ["--pane"],
			value: "required",
			placeholder: "pane",
			description: "Optional target pane selector",
		},
		{
			kind: "option",
			key: "layout",
			spellings: ["--layout"],
			value: "required",
			choices: ["blocks", "lanes"],
			description: "Switch the browser layout engine",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			choices: ["light", "dark", "system"],
			description: "Switch the browser color theme",
		},
		{
			kind: "option",
			key: "hoverLight",
			spellings: ["--dim-on-hover"],
			value: "required",
			choices: ["on", "off"],
			description: "Turn hover-dimming on or off",
		},
	],
	input: { ingress: SettingsInputSchema },
	result: ShowResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Applied browser display settings",
				presentation: ["result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: [refusal("server"), refusal("browser")],
	relationships: [
		{
			method: "POST",
			path: "/api/panes/show",
			cardinality: "one",
			description: "Update connected browser display settings in place",
		},
	],
	/**
	 * Apply browser display settings without resetting navigation or requiring a vault.
	 * @param input The display settings and optional pane selector.
	 * @param context The invocation capabilities.
	 * @returns The applied settings receipt.
	 */
	async handler(input, context) {
		await context.require("server", "Changing browser settings");
		const { pane, ...settings } = input;
		if (
			settings.layout === undefined &&
			settings.theme === undefined &&
			settings.hoverLight === undefined
		) {
			throw new CliUsageError(
				"browser settings needs at least one option: --layout, --theme, or --dim-on-hover.",
			);
		}
		await context.require("browser", "Changing browser settings");
		const result = await updateBrowserSettings(settings, pane);
		return { result: ShowResultSchema.parse(result) };
	},
});

export { ShowResultSchema, browserSettingsContract, browserShowContract };
