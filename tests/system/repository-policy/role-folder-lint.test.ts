// The lint rules that read a role folder accept both layouts while the move to behavior first
// runs (ADR 0075, TASK-582.03): the role folder first below ui/, or the folder that holds the
// file. Each test lints one fixture project in one run and names what each file earns, in the
// old form and in the new, so a rule that keeps only one layout or loses its guarantee fails.
import { describe, test } from "bun:test";

import { expectJudged, plugin, withProject } from "./support/oxlint-project.ts";

const PLACEMENT = "archboard(ui-concern-placement)";
const ASSISTANT_UI = "archboard(assistant-ui-imports)";

const RULES = JSON.stringify({
	categories: { correctness: "off" },
	jsPlugins: [plugin],
	rules: {
		"archboard/ui-concern-placement": "error",
		"archboard/assistant-ui-imports": "error",
	},
});

const HOOK =
	'import { useState } from "react";\nexport function useThing() { return useState(0); }\n';
const COMPONENT = "export const Card = () => <div />;\n";
const HELPER = "export const helper = 1;\n";

describe("ui-concern-placement reads the one role folder of a path", () => {
	const allowed = {
		// Role first, as every ui area is today.
		"packages/alpha/src/ui/hooks/thing/use-thing.ts": HOOK,
		"packages/alpha/src/ui/components/thing/Card.tsx": COMPONENT,
		"packages/alpha/src/ui/rules/thing/deeper/helper.ts": HELPER,
		// Behavior first, as every ui area is after its move.
		"packages/alpha/src/ui/thing/hooks/use-thing.ts": HOOK,
		"packages/alpha/src/ui/thing/components/Card.tsx": COMPONENT,
		"packages/alpha/src/ui/thing/deeper/rules/helper.ts": HELPER,
		"apps/alpha/src/ui/thing/state/helper.ts": HELPER,
		// The area as a whole, and its interface.
		"packages/alpha/src/ui/rules/helper.ts": HELPER,
		"packages/alpha/src/ui/api/thing.ts":
			'export { useThing } from "#ui/thing/hooks/use-thing.ts";\n',
	};
	const refused = {
		// The guarantees of the role, in both layouts.
		"packages/alpha/src/ui/state/thing/use-thing.ts": HOOK,
		"packages/alpha/src/ui/thing/state/use-thing.ts": HOOK,
		"packages/alpha/src/ui/rules/thing/Widget.tsx": COMPONENT,
		"packages/alpha/src/ui/thing/rules/Widget.tsx": COMPONENT,
		"packages/alpha/src/ui/thing/components/helper.ts": HELPER,
		// A path with no role folder, two of them, or one in the middle.
		"packages/alpha/src/ui/thing/helper.ts": HELPER,
		"packages/alpha/src/ui/components/thing/state/helper.ts": HELPER,
		"packages/alpha/src/ui/thing/rules/deeper/helper.ts": HELPER,
		// The interface stays directly below ui/.
		"packages/alpha/src/ui/thing/api/thing.ts": HELPER,
	};

	test("passes both layouts and refuses a misplaced role or a broken role rule in either", async () => {
		await withProject({ ".oxlintrc.jsonc": RULES, ...allowed, ...refused }, (root) =>
			expectJudged(
				root,
				Object.fromEntries(Object.keys(refused).map((file) => [file, PLACEMENT])),
				Object.keys(allowed),
			),
		);
	});
});

describe("assistant-ui-imports finds its owners in both layouts", () => {
	const UI = "packages/workbench/src/ui";
	const ROOT_IMPORT =
		'import { ThreadPrimitive } from "@assistant-ui/react";\nexport const Root = ThreadPrimitive.Root;\n';
	const MARKDOWN =
		'import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";\nexport const Text = MarkdownTextPrimitive;\n';
	const FORBIDDEN =
		'import { AssistantTransport } from "@assistant-ui/react";\nexport const transport = AssistantTransport;\n';
	const allowed = {
		[`${UI}/components/thread/Thread.tsx`]: ROOT_IMPORT,
		[`${UI}/hooks/runtime/use-runtime.ts`]: ROOT_IMPORT,
		[`${UI}/components/thread/MarkdownText.tsx`]: MARKDOWN,
		[`${UI}/workbench-client/thread/components/Thread.tsx`]: ROOT_IMPORT,
		[`${UI}/workbench-client/assistant-runtime/hooks/use-runtime.ts`]: ROOT_IMPORT,
		[`${UI}/workbench-client/thread/components/MarkdownText.tsx`]: MARKDOWN,
		"packages/workbench/tests/ui/workbench-client/thread/components/thread.test.tsx": ROOT_IMPORT,
	};
	const refused = {
		// Another behavior, in either layout.
		[`${UI}/components/dock/Dock.tsx`]: ROOT_IMPORT,
		[`${UI}/workbench-client/dock/components/Dock.tsx`]: ROOT_IMPORT,
		// An owner name in the wrong place: below the role folder of a behavior-first path, or
		// the old runtime name above it.
		[`${UI}/workbench-client/components/thread/Thread.tsx`]: ROOT_IMPORT,
		[`${UI}/workbench-client/runtime/hooks/use-runtime.ts`]: ROOT_IMPORT,
		// Markdown belongs to the thread alone, and a forbidden API to no owner.
		[`${UI}/hooks/runtime/use-markdown.ts`]: MARKDOWN,
		[`${UI}/workbench-client/assistant-runtime/hooks/use-markdown.ts`]: MARKDOWN,
		[`${UI}/components/thread/Transport.tsx`]: FORBIDDEN,
		[`${UI}/workbench-client/thread/components/Transport.tsx`]: FORBIDDEN,
	};

	test("passes the owners of both layouts and refuses everything else in either", async () => {
		await withProject({ ".oxlintrc.jsonc": RULES, ...allowed, ...refused }, (root) =>
			expectJudged(
				root,
				Object.fromEntries(Object.keys(refused).map((file) => [file, ASSISTANT_UI])),
				Object.keys(allowed),
			),
		);
	});
});
