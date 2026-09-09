// The Archboard Oxlint plugin: the module-layout, dependency-direction and
// vendor-ownership rules of docs/agents/boundaries.md, loaded by both lint
// lanes through `jsPlugins`. The rules live in tools/oxlint-plugin-archboard/.
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import { assistantUiImports } from "./oxlint-plugin-archboard/assistant-ui-imports.ts";
import {
	mappedSourcePaths,
	noAnonymousJsxHandlers,
	noArchiveReferences,
	noCatchAllExports,
	noCompatibilityIdentifiers,
	noGenericBuckets,
	rootImplementationModules,
	stateFilesPure,
	typescriptSource,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./oxlint-plugin-archboard/layout-rules.ts";
import {
	absoluteImports,
	importBoundaries,
	moduleEntrypoints,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
} from "./oxlint-plugin-archboard/module-rules.ts";
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import type { Rule } from "./oxlint-plugin-archboard/rule-api.ts";
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import { namedReactImports, uiConcernPlacement } from "./oxlint-plugin-archboard/ui-rules.ts";

// Oxlint 1.80 exports no plugin type; this is the shape its loader registers.
interface ArchboardPlugin {
	meta: { name: string; version: string };
	rules: Record<string, Rule>;
}

const plugin: ArchboardPlugin = {
	meta: {
		name: "eslint-plugin-archboard",
		version: "0.0.0",
	},
	rules: {
		"typescript-source": typescriptSource,
		"absolute-imports": absoluteImports,
		"no-archive-references": noArchiveReferences,
		"no-anonymous-jsx-handlers": noAnonymousJsxHandlers,
		"assistant-ui-imports": assistantUiImports,
		"no-catch-all-exports": noCatchAllExports,
		"no-compatibility-identifiers": noCompatibilityIdentifiers,
		"no-generic-buckets": noGenericBuckets,
		"mapped-source-paths": mappedSourcePaths,
		"import-boundaries": importBoundaries,
		"module-entrypoints": moduleEntrypoints,
		"root-implementation-modules": rootImplementationModules,
		"state-files-pure": stateFilesPure,
		"ui-concern-placement": uiConcernPlacement,
		"named-react-imports": namedReactImports,
	},
};

// oxlint-disable-next-line no-restricted-exports -- Oxlint loads a jsPlugin from its module's default export
export default plugin;
