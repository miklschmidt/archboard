// Writes the fixtures of the core's native render test
// (`crates/archboard-render/tests/native.rs`): corpus documents drawn by the
// WebAssembly core, each with the request this host wrote, the icons the core
// was given, and the document the core wrote. The native test draws the same
// requests with a native build of the core, Graphviz included, and holds each
// to the same document.
//
// `recommendations.json` is a reading of the old format, which draws each kind
// as its policy recorded it. `effects.json` is the same request in the current
// format: the built-in kinds, and every relationship stating an effect, one of
// them a dependency that states none, so each effect's line type and head is
// held to one document on both builds (TASK-663).
//
// Each solve runs here, one at a time, with the core's `layOutPicture`, as a
// layout worker runs it; a solve's answer depends on its graph alone, so the
// document is the one the worker pool draws.
//
// Run from the repository root, inside `nix develop`, after `bun run build:core`:
//   bun packages/renderer/tests/runtime/support/capture-native-fixture.ts
// The first needs the example's retained history. Without it, redraw both from
// the request the first holds, after a change to how the core paints:
//   bun packages/renderer/tests/runtime/support/capture-native-fixture.ts stored

import { readFileSync, writeFileSync } from "node:fs";
import { projectModel } from "@archboard/model/content";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { readArchitectureModel } from "@archboard/model/store-read";
import { iconPaths } from "#runtime/operations/icon-paths.ts";
import { loadCore } from "#runtime/bun-renderer/services/core.ts";
import { THEME_STYLESHEET } from "#runtime/store/assets.ts";
import { readThemeColors } from "#runtime/theme/store/read.ts";
import { renderArchitecture } from "#shared/render/rules/diagram.ts";
import { installRendererHost } from "#shared/render/rules/host.ts";

/** The corpus drawing the fixture holds: the Nightly batch proposal of the example model. */
const VAULT = "examples/web-shop";
const STATE = "LjzZMsi7";
/** Where the native test reads them. */
const FIXTURE = "crates/archboard-render/tests/fixtures/recommendations.json";
const EFFECTS_FIXTURE = "crates/archboard-render/tests/fixtures/effects.json";

const core = loadCore();
const kept: { request: string; icons: Record<string, readonly string[]> } = {
	request: "",
	icons: {},
};
installRendererHost({
	core: () => ({
		render: (request, host) => {
			kept.request = request;
			return core.render(request, {
				solve: host.solve,
				icons: (names) => {
					const given = host.icons(names);
					Object.assign(kept.icons, given);
					return given;
				},
			});
		},
	}),
	solve: async (graph) => core.layOutPicture(graph),
	themeColors: readThemeColors(readFileSync(THEME_STYLESHEET, "utf8")),
	iconPaths,
});

/** One fixture: what the core was asked and given, and what it wrote. */
interface Fixture {
	readonly drawing: string;
	readonly request: string;
	readonly icons: Record<string, readonly string[]>;
	readonly svg: string;
}

/**
 * Write a fixture where the native test reads it.
 * @param path Where.
 * @param fixture What.
 */
function write(path: string, fixture: Fixture): void {
	writeFileSync(path, `${JSON.stringify(fixture, null, "\t")}\n`);
	process.stdout.write(`Wrote ${path}: ${fixture.svg.length} bytes of SVG.\n`);
}

/**
 * Draw the example's reading as the WebAssembly core draws it, through this host.
 * @returns The fixture.
 */
async function recommendations(): Promise<Fixture> {
	const model = await readArchitectureModel(VAULT, undefined, undefined, {
		state: STATE,
		compare: false,
	});
	if (!model.success) throw new Error(`${VAULT} does not read: ${JSON.stringify(model)}`);
	const reading = projectModel(model);
	const drawn = await renderArchitecture({
		content: reading.content,
		policy: model.policy,
		theme: "light",
	});
	return {
		drawing: `${VAULT} | ${model.manifest.name} | ${STATE} | (whole model) | light | plain`,
		request: kept.request,
		icons: kept.icons,
		svg: drawn.svg,
	};
}

/** The effects the relationships of the current-format fixture state, in turn. */
const EFFECTS = ["mutation", "query", "compute"] as const;

/** A relationship of a stored request. */
interface StoredEdge {
	readonly id: string;
	readonly kind: string;
	readonly effect?: string;
}

/**
 * A relationship of the old request as the current format states it: each states an effect in
 * turn, `data` travels as `storage`, a `call` as `sync`, and the last is a dependency that states
 * none.
 * @param ids Every relationship's id, in the content's order.
 * @returns The relationship restated.
 */
function restated(ids: readonly string[]): (edge: StoredEdge) => StoredEdge {
	return (edge) => {
		const at = Math.max(ids.indexOf(edge.id), 0);
		const { effect: _none, ...rest } = edge;
		if (at === ids.length - 1) return { ...rest, kind: "dependency" };
		const kind = { data: "storage", call: "sync" }[edge.kind] ?? edge.kind;
		return { ...rest, kind, effect: EFFECTS[at % EFFECTS.length]! };
	};
}

/**
 * The stored request of the old format, restated in the current one and drawn by the WebAssembly
 * core.
 * @param old The fixture of the old format.
 * @returns The fixture.
 */
async function effects(old: Fixture): Promise<Fixture> {
	const request = JSON.parse(old.request) as Record<string, unknown> & {
		readonly policy: Record<string, unknown>;
		readonly content: { readonly edges: readonly StoredEdge[] };
	};
	const ids = request.content.edges.map((edge) => edge.id);
	const readings = Object.fromEntries(
		(["content", "held", "variant"] as const).flatMap((key) => {
			const reading = request[key] as { readonly edges: readonly StoredEdge[] } | undefined;
			return reading === undefined
				? []
				: [[key, { ...reading, edges: reading.edges.map(restated(ids)) }]];
		}),
	);
	const { relationshipKinds } = defaultSemanticPolicy();
	const current = JSON.stringify({
		...request,
		...readings,
		policy: { ...request.policy, relationshipKinds },
	});
	const rendered = await core.render(current, {
		solve: (graph) => Promise.resolve(core.layOutPicture(graph)),
		icons: (names) => Object.fromEntries(names.map((name) => [name, old.icons[name] ?? []])),
	});
	if ("empty" in rendered) throw new Error("the current-format request drew nothing");
	return {
		drawing: `${old.drawing} | current format`,
		request: current,
		icons: old.icons,
		svg: rendered.svg,
	};
}

/**
 * A fixture drawn again by the WebAssembly core from the request it holds.
 * @param old The fixture.
 * @returns The fixture with the document the core writes now.
 */
async function redrawn(old: Fixture): Promise<Fixture> {
	const rendered = await core.render(old.request, {
		solve: (graph) => Promise.resolve(core.layOutPicture(graph)),
		icons: (names) => Object.fromEntries(names.map((name) => [name, old.icons[name] ?? []])),
	});
	if ("empty" in rendered) throw new Error("the stored request drew nothing");
	return { ...old, svg: rendered.svg };
}

const stored = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
write(FIXTURE, process.argv[2] === "stored" ? await redrawn(stored) : await recommendations());
write(EFFECTS_FIXTURE, await effects(JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture));
