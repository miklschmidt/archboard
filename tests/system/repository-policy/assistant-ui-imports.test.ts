import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");
const vite = path.join(repoRoot, "node_modules/.bin/vite");
const plugin = path.join(repoRoot, "tools/oxlint-plugin-archboard.js");
const ASSISTANT_UI_PACKAGE = "@assistant-ui/react";
const OWNER_MEMBERS = new Map([
	[
		"src/ui/workbench-runtime/runtime.ts",
		[
			"useExternalStoreRuntime",
			"AssistantRuntimeProvider",
			"ReadonlyThreadProvider",
			"MessageNotSentError",
		],
	],
	[
		"src/ui/workbench-timeline/timeline.ts",
		["ThreadPrimitive", "MessagePrimitive", "MessagePartPrimitive"],
	],
	["src/ui/workbench-composer/composer.ts", ["ComposerPrimitive"]],
]);
// This intentionally small inventory covers reviewed copied-Element signatures.
// It does not claim to detect arbitrary equivalent source copied from assistant-ui.
const COPIED_ELEMENT_SIGNATURES = ["Message", "CodeDiff", "ReviewableDiff"] as const;
const EXPECTED_BUNDLE_PACKAGE_ROOTS = new Set(
	"@assistant-ui/core @assistant-ui/react @assistant-ui/store @assistant-ui/tap @babel/runtime @radix-ui/primitive @radix-ui/react-compose-refs @radix-ui/react-primitive @radix-ui/react-slot @radix-ui/react-use-callback-ref @radix-ui/react-use-escape-keydown assistant-stream radix-ui react react-dom react-textarea-autosize secure-json-parse use-composed-ref use-isomorphic-layout-effect use-latest zustand".split(
		" ",
	),
);
const DEPENDENCY_SECTIONS =
	"dependencies devDependencies peerDependencies optionalDependencies".split(" ");
const EXPECTED_REACT = { key: "react", identity: "react@19.2.8" };
const EXPECTED_REACT_DOM = { key: "react-dom", identity: "react-dom@19.2.8" };
const ASSISTANT_UI_TRANSITIVE_ALLOWLIST = new Set(
	`@assistant-ui/core@0.3.16 @assistant-ui/react@0.15.17 @assistant-ui/store@0.3.11 @assistant-ui/tap@0.9.15 @babel/runtime@7.29.7 @floating-ui/core@1.8.0 @floating-ui/dom@1.8.0 @floating-ui/react-dom@2.1.9 @floating-ui/utils@0.2.12 @radix-ui/number@1.1.3 @radix-ui/primitive@1.1.7 @radix-ui/react-accessible-icon@1.1.15 @radix-ui/react-accordion@1.2.20 @radix-ui/react-alert-dialog@1.1.23 @radix-ui/react-arrow@1.1.15 @radix-ui/react-aspect-ratio@1.1.15 @radix-ui/react-avatar@1.2.6 @radix-ui/react-checkbox@1.3.11 @radix-ui/react-collapsible@1.1.20 @radix-ui/react-collection@1.1.15 @radix-ui/react-compose-refs@1.1.5 @radix-ui/react-context-menu@2.3.7 @radix-ui/react-context@1.2.2 @radix-ui/react-dialog@1.1.23 @radix-ui/react-direction@1.1.4 @radix-ui/react-dismissable-layer@1.1.19 @radix-ui/react-dropdown-menu@2.1.24 @radix-ui/react-focus-guards@1.1.6 @radix-ui/react-focus-scope@1.1.16 @radix-ui/react-form@0.1.16 @radix-ui/react-hover-card@1.1.23 @radix-ui/react-id@1.1.4 @radix-ui/react-label@2.1.15 @radix-ui/react-menu@2.1.24 @radix-ui/react-menubar@1.1.24 @radix-ui/react-navigation-menu@1.2.22 @radix-ui/react-one-time-password-field@0.1.16 @radix-ui/react-password-toggle-field@0.1.11 @radix-ui/react-popover@1.1.23 @radix-ui/react-popper@1.3.7 @radix-ui/react-portal@1.1.17 @radix-ui/react-presence@1.1.10 @radix-ui/react-primitive@2.1.10 @radix-ui/react-progress@1.1.16 @radix-ui/react-radio-group@1.4.7 @radix-ui/react-roving-focus@1.1.19 @radix-ui/react-scroll-area@1.2.18 @radix-ui/react-select@2.3.7 @radix-ui/react-separator@1.1.15 @radix-ui/react-slider@1.4.7 @radix-ui/react-slot@1.3.3 @radix-ui/react-switch@1.3.7 @radix-ui/react-tabs@1.1.21 @radix-ui/react-toast@1.2.23 @radix-ui/react-toggle-group@1.1.19 @radix-ui/react-toggle@1.1.18 @radix-ui/react-toolbar@1.1.19 @radix-ui/react-tooltip@1.2.16 @radix-ui/react-use-callback-ref@1.1.4 @radix-ui/react-use-controllable-state@1.2.6 @radix-ui/react-use-effect-event@0.0.5 @radix-ui/react-use-escape-keydown@1.1.5 @radix-ui/react-use-is-hydrated@0.1.3 @radix-ui/react-use-layout-effect@1.1.4 @radix-ui/react-use-previous@1.1.4 @radix-ui/react-use-rect@1.1.4 @radix-ui/react-use-size@1.1.4 @radix-ui/react-visually-hidden@1.2.11 @radix-ui/rect@1.1.3 @standard-schema/spec@1.1.0 aria-hidden@1.2.6 assistant-cloud@0.1.42 assistant-stream@0.3.40 detect-node-es@1.1.0 get-nonce@1.0.1 nanoid@6.0.1 radix-ui@1.6.7 react-remove-scroll-bar@2.3.8 react-remove-scroll@2.7.2 react-style-singleton@2.2.3 react-textarea-autosize@8.5.9 safe-content-frame@0.0.28 secure-json-parse@4.1.0 tslib@2.8.1 use-callback-ref@1.3.3 use-composed-ref@1.4.0 use-isomorphic-layout-effect@1.2.1 use-latest@1.3.0 use-sidecar@1.1.3 zod@4.4.3 zustand@5.0.15`.split(
		" ",
	),
);
type CommandResult = { exitCode: number; output: string };
function run(cwd: string, command: string[]): CommandResult {
	const result = Bun.spawnSync({
		cmd: command,
		cwd,
		env: {
			...process.env,
			NODE_ENV: "production", // Measure Vite's production graph under Bun test.
			PATH: `${path.join(repoRoot, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}
function repositoryOxlintConfig(): string {
	const authored = fs.readFileSync(path.join(repoRoot, ".oxlintrc.jsonc"), "utf8");
	const relativePlugin = '"./tools/oxlint-plugin-archboard.js"';
	if (!authored.includes(relativePlugin))
		throw new Error("repository Oxlint plugin path is missing");
	return authored.replace(relativePlugin, JSON.stringify(plugin));
}
async function withProject<T>(
	files: Record<string, string>,
	check: (root: string) => T | Promise<T>,
): Promise<T> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-assistant-ui-"));
	try {
		fs.writeFileSync(path.join(root, ".oxlintrc.jsonc"), repositoryOxlintConfig());
		fs.copyFileSync(path.join(repoRoot, "tsconfig.json"), path.join(root, "tsconfig.json"));
		fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "dir");
		for (const [relative, content] of Object.entries(files)) {
			const target = path.join(root, relative);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.writeFileSync(target, content);
		}
		return await check(root);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}
function lint(root: string, relativePath: string): CommandResult {
	return run(root, [oxlint, "--config=.oxlintrc.jsonc", "--format=default", relativePath]);
}
function expectPass(result: CommandResult): void {
	expect(result.exitCode, result.output).toBe(0);
}
function expectRule(result: CommandResult, message: string): void {
	expect(result.exitCode, result.output).not.toBe(0);
	expect(result.output).toContain("archboard(assistant-ui-imports)");
	expect(result.output).toContain(message);
}
function resolvePackageJson(name: string, fromDirectory: string): string | undefined {
	let directory = fromDirectory;
	while (true) {
		const candidate = path.join(directory, "node_modules", name, "package.json");
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}
function assistantUiDependencyGraph(): Map<string, Record<string, unknown>> {
	const packages = new Map<string, Record<string, unknown>>();
	const pending: Array<[string, string]> = [[ASSISTANT_UI_PACKAGE, repoRoot]];
	while (pending.length > 0) {
		const [name, fromDirectory] = pending.shift() as [string, string];
		const manifestPath = resolvePackageJson(name, fromDirectory);
		if (!manifestPath) throw new Error(`missing installed assistant-ui dependency ${name}`);
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
		const identity = `${String(manifest.name)}@${String(manifest.version)}`;
		if (packages.has(identity)) continue;
		packages.set(identity, manifest);
		const dependencies = manifest.dependencies;
		if (typeof dependencies !== "object" || dependencies === null) continue;
		for (const dependency of Object.keys(dependencies))
			pending.push([dependency, path.dirname(manifestPath)]);
	}
	return packages;
}
function directRadixDependencies(packageJson: Record<string, unknown>): string[] {
	return DEPENDENCY_SECTIONS.flatMap((section) => {
		const dependencies = packageJson[section];
		if (typeof dependencies !== "object" || dependencies === null) return [];
		return Object.keys(dependencies as Record<string, unknown>)
			.filter((name) => name === "radix-ui" || name.startsWith("@radix-ui/"))
			.map((name) => `${section}.${name}`);
	});
}
function resolvedIdentities(
	packages: Record<string, [string, string, Record<string, unknown>?]>,
	pattern: RegExp,
): Array<{ key: string; identity: string }> {
	return Object.entries(packages)
		.map(([key, [identity]]) => ({ key, identity }))
		.filter(({ identity }) => pattern.test(identity));
}
function packageRootFromModule(module: string): string | undefined {
	return module.match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
}

describe("assistant-ui dependency and import policy", () => {
	test("pins the root package, lock entry, licenses, and exact transitive allowlist", () => {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
		) as {
			dependencies?: Record<string, string>;
		};
		expect(packageJson.dependencies?.[ASSISTANT_UI_PACKAGE]).toBe("0.15.17");
		expect(directRadixDependencies(packageJson)).toEqual([]);
		const lock = Bun.JSON5.parse(fs.readFileSync(path.join(repoRoot, "bun.lock"), "utf8")) as {
			workspaces: Record<string, { dependencies?: Record<string, string> }>;
			packages: Record<string, [string, string, Record<string, unknown>?]>;
		};
		expect(lock.workspaces[""]?.dependencies?.[ASSISTANT_UI_PACKAGE]).toBe("0.15.17");
		expect(lock.packages[ASSISTANT_UI_PACKAGE]?.[0]).toBe("@assistant-ui/react@0.15.17");
		expect(resolvedIdentities(lock.packages, /^react@/)).toEqual([EXPECTED_REACT]);
		expect(resolvedIdentities(lock.packages, /^react-dom@/)).toEqual([EXPECTED_REACT_DOM]);
		const graph = assistantUiDependencyGraph();
		expect(new Set(graph.keys())).toEqual(ASSISTANT_UI_TRANSITIVE_ALLOWLIST);
		for (const [identity, manifest] of graph) {
			expect(["MIT", "BSD-3-Clause", "0BSD"], identity).toContain(manifest.license);
		}
	});
	test("audits Radix declarations in every package dependency section", () => {
		const hostile = Object.fromEntries(
			DEPENDENCY_SECTIONS.map((section) => [
				section,
				{ "@radix-ui/react-dialog": "1.0.0", "radix-ui": "1.0.0" },
			]),
		);
		expect(directRadixDependencies(hostile)).toEqual(
			DEPENDENCY_SECTIONS.flatMap((section) => [
				`${section}.@radix-ui/react-dialog`,
				`${section}.radix-ui`,
			]),
		);
	});
	test("counts React identities in hostile nested lock keys", () => {
		const hostile = {
			"owner/react": ["react@19.2.8", "", {}],
			"nested/react": ["react@19.2.8", "", {}],
			"nested/react-v18": ["react@18.3.1", "", {}],
			"owner/react-dom": ["react-dom@19.2.8", "", {}],
			"nested/react-dom": ["react-dom@19.2.8", "", {}],
			"nested/react-dom-v18": ["react-dom@18.3.1", "", {}],
		} as Record<string, [string, string, Record<string, unknown>?]>;
		expect(resolvedIdentities(hostile, /^react@/)).toEqual([
			{ key: "owner/react", identity: "react@19.2.8" },
			{ key: "nested/react", identity: "react@19.2.8" },
			{ key: "nested/react-v18", identity: "react@18.3.1" },
		]);
		expect(resolvedIdentities(hostile, /^react-dom@/)).toEqual([
			{ key: "owner/react-dom", identity: "react-dom@19.2.8" },
			{ key: "nested/react-dom", identity: "react-dom@19.2.8" },
			{ key: "nested/react-dom-v18", identity: "react-dom@18.3.1" },
		]);
	});
	for (const [file, members] of OWNER_MEMBERS) {
		test(`allows the exact named members in ${path.dirname(file)}`, () =>
			withProject(
				{
					[file]: `import { ${members.join(", ")} } from "${ASSISTANT_UI_PACKAGE}";\nexport const contract = [${members.join(", ")}];\n`,
				},
				(root) => expectPass(lint(root, file)),
			));
	}
	test("rejects wrong owners, extra members, copied Elements, and every forbidden API family", async () => {
		const cases: Array<[string, string]> = [
			[
				`import { ComposerPrimitive } from "${ASSISTANT_UI_PACKAGE}";`,
				"belongs to a different Archboard module",
			],
			[
				`import { useAssistantContext } from "${ASSISTANT_UI_PACKAGE}";`,
				"is not in Archboard's assigned allowlist",
			],
			...COPIED_ELEMENT_SIGNATURES.map(
				(member) =>
					[
						`import { ${member} } from "${ASSISTANT_UI_PACKAGE}";`,
						member === "Message" ? `member '${member}'` : `API '${member}'`,
					] as [string, string],
			),
			[`import { AssistantTransport } from "${ASSISTANT_UI_PACKAGE}";`, "API 'AssistantTransport'"],
			[
				`import { ThreadListPrimitive } from "${ASSISTANT_UI_PACKAGE}";`,
				"API 'ThreadListPrimitive'",
			],
			[`import { createMessageQueue } from "${ASSISTANT_UI_PACKAGE}";`, "API 'createMessageQueue'"],
			[`import { useAssistantTool } from "${ASSISTANT_UI_PACKAGE}";`, "API 'useAssistantTool'"],
			[`import { useVoiceState } from "${ASSISTANT_UI_PACKAGE}";`, "API 'useVoiceState'"],
			[`import { useAssistantState } from "${ASSISTANT_UI_PACKAGE}";`, "API 'useAssistantState'"],
			[
				`import { useCloudThreadListRuntime } from "${ASSISTANT_UI_PACKAGE}";`,
				"API 'useCloudThreadListRuntime'",
			],
			[
				`import { getMcpAppFromToolPart } from "${ASSISTANT_UI_PACKAGE}";`,
				"API 'getMcpAppFromToolPart'",
			],
			[`import { DevToolsHooks } from "${ASSISTANT_UI_PACKAGE}";`, "API 'DevToolsHooks'"],
		];
		for (const [source, message] of cases) {
			await withProject(
				{ "src/ui/workbench-runtime/hostile.ts": `${source}\nexport const contract = true;\n` },
				(root) => expectRule(lint(root, "src/ui/workbench-runtime/hostile.ts"), message),
			);
		}
	});
	test("rejects local aliases and nested primitive internals", async () => {
		const composerCase = (
			body: string,
			message = "Do not alias an assistant-ui import",
		): [string, string] => [
			`import { ComposerPrimitive } from "${ASSISTANT_UI_PACKAGE}";\n${body}`,
			message,
		];
		const cases: Array<[string, string]> = [
			[
				`import { ComposerPrimitive as Primitive } from "${ASSISTANT_UI_PACKAGE}";\nvoid Primitive;`,
				"Do not alias an assistant-ui import",
			],
			composerCase("void ComposerPrimitive.Queue;", "ComposerPrimitive.Queue"),
			composerCase('void ComposerPrimitive["Dictate"];', "ComposerPrimitive.Dictate"),
			composerCase(
				'const key = "Queue";\nvoid ComposerPrimitive[key];',
				"non-literal dynamic import",
			),
			composerCase("let Primitive;\nPrimitive = ComposerPrimitive;\nvoid Primitive.Queue;"),
			composerCase("let Primitive;\nPrimitive = ComposerPrimitive;\nvoid Primitive.Dictate;"),
			composerCase(
				"const Primitive = ComposerPrimitive as typeof ComposerPrimitive;\nvoid Primitive.Queue;",
				"ComposerPrimitive.Queue",
			),
			composerCase("let Primitive;\nPrimitive = ComposerPrimitive!;\nvoid Primitive.Dictate;"),
			composerCase(
				"let Tool;\n({ Tool } = <typeof ComposerPrimitive>ComposerPrimitive);\nvoid Tool;",
			),
			[
				`import { MessagePrimitive } from "${ASSISTANT_UI_PACKAGE}";\nlet Primitive;\nPrimitive = MessagePrimitive;\nvoid Primitive.GenerativeUI;`,
				"Do not alias an assistant-ui import",
			],
			[
				`import { ComposerPrimitive } from "${ASSISTANT_UI_PACKAGE}";\nconst { StopDictation: stop } = ComposerPrimitive;\nvoid stop;`,
				"ComposerPrimitive.StopDictation",
			],
			[
				`import { MessagePrimitive } from "${ASSISTANT_UI_PACKAGE}";\nconst Primitive = MessagePrimitive;\nvoid Primitive.GenerativeUI;`,
				"MessagePrimitive.GenerativeUI",
			],
			...["Queue", "Dictate", "Tool"].map((member) =>
				composerCase(`let ${member};\n({ ${member} } = ComposerPrimitive);\nvoid ${member};`),
			),
			composerCase(
				"const Primitive = ComposerPrimitive satisfies typeof ComposerPrimitive;\nvoid Primitive.Queue;",
				"ComposerPrimitive.Queue",
			),
			composerCase(
				"let Primitive;\nPrimitive = ComposerPrimitive satisfies typeof ComposerPrimitive;\nvoid Primitive.Dictate;",
			),
			composerCase(
				"let Tool;\n({ Tool } = ComposerPrimitive satisfies typeof ComposerPrimitive);\nvoid Tool;",
			),
			composerCase(
				"void (ComposerPrimitive as typeof ComposerPrimitive).Queue;",
				"ComposerPrimitive.Queue",
			),
			composerCase("void ComposerPrimitive!.Dictate;", "ComposerPrimitive.Dictate"),
			composerCase(
				"void (ComposerPrimitive satisfies typeof ComposerPrimitive).Queue;",
				"ComposerPrimitive.Queue",
			),
		];
		for (const [source, message] of cases) {
			await withProject({ "src/ui/workbench-composer/hostile.ts": `${source}\n` }, (root) =>
				expectRule(lint(root, "src/ui/workbench-composer/hostile.ts"), message),
			);
		}
	});
	test("rejects default, namespace, side-effect, re-export, dynamic, require, and type forms", async () => {
		const cases: Array<[string, string]> = [
			["default", `import AssistantUI from "${ASSISTANT_UI_PACKAGE}";`],
			["namespace", `import * as AssistantUI from "${ASSISTANT_UI_PACKAGE}";`],
			["side effect", `import "${ASSISTANT_UI_PACKAGE}";`],
			["re-export", `export { useExternalStoreRuntime } from "${ASSISTANT_UI_PACKAGE}";`],
			["wildcard re-export", `export * from "${ASSISTANT_UI_PACKAGE}";`],
			["dynamic", `void import("${ASSISTANT_UI_PACKAGE}");`],
			["require", `const runtime = require("${ASSISTANT_UI_PACKAGE}");`],
			["type", `type Runtime = import("${ASSISTANT_UI_PACKAGE}").AssistantRuntime;`],
			["nonliteral dynamic", `const source = "${ASSISTANT_UI_PACKAGE}"; void import(source);`],
			[
				"nonliteral require",
				`const source = "${ASSISTANT_UI_PACKAGE}"; const runtime = require(source);`,
			],
		];
		for (const [label, source] of cases) {
			await withProject(
				{ "src/ui/workbench-runtime/hostile.ts": `${source}\nexport const contract = true;\n` },
				(root) => {
					const result = lint(root, "src/ui/workbench-runtime/hostile.ts");
					expectRule(
						result,
						label === "re-export" || label === "wildcard re-export" ? "re-export" : "assistant-ui",
					);
				},
			);
		}
	});
	test("rejects assistant-ui imports from every other module, alternate packages, and all subpaths", async () => {
		await withProject(
			{
				"src/ui/other-module/hostile.ts": `import { useExternalStoreRuntime } from "${ASSISTANT_UI_PACKAGE}";\n`,
				"src/ui/workbench-runtime/subpath.ts": `import { useExternalStoreRuntime } from "${ASSISTANT_UI_PACKAGE}/runtime";\n`,
				"src/ui/workbench-runtime/query.ts": `import { useExternalStoreRuntime } from "${ASSISTANT_UI_PACKAGE}?raw";\n`,
				"src/ui/workbench-runtime/hash.ts": `import { useExternalStoreRuntime } from "${ASSISTANT_UI_PACKAGE}#root";\n`,
				"src/ui/workbench-runtime/slash.ts": `import { useExternalStoreRuntime } from "${ASSISTANT_UI_PACKAGE}/";\n`,
				"src/ui/workbench-runtime/alternate.ts":
					'import { AssistantRuntimeProvider } from "@assistant-ui/core";\n',
				"src/ui/workbench-runtime/cloud.ts": 'import { createCloud } from "assistant-cloud";\n',
				"src/ui/workbench-runtime/stream.ts": 'import { toDataStream } from "assistant-stream";\n',
			},
			(root) => {
				expectRule(lint(root, "src/ui/other-module/hostile.ts"), "Only src/ui/workbench-runtime");
				expectRule(
					lint(root, "src/ui/workbench-runtime/subpath.ts"),
					"exact @assistant-ui/react package root",
				);
				for (const file of ["query.ts", "hash.ts", "slash.ts"])
					expectRule(
						lint(root, `src/ui/workbench-runtime/${file}`),
						"exact @assistant-ui/react package root",
					);
				expectRule(lint(root, "src/ui/workbench-runtime/alternate.ts"), "alternate package");
				expectRule(
					lint(root, "src/ui/workbench-runtime/cloud.ts"),
					"cloud or stream auxiliary package",
				);
				expectRule(
					lint(root, "src/ui/workbench-runtime/stream.ts"),
					"cloud or stream auxiliary package",
				);
			},
		);
	});
	test("rejects direct Radix imports through the same real-Oxlint source visitor", async () => {
		await withProject(
			{
				"src/ui/workbench-runtime/radix.ts": 'import { Dialog } from "@radix-ui/react-dialog";\n',
				"src/ui/workbench-runtime/radix-root.ts": 'import radix from "radix-ui";\n',
			},
			(root) => {
				expectRule(lint(root, "src/ui/workbench-runtime/radix.ts"), "Do not import Radix directly");
				expectRule(
					lint(root, "src/ui/workbench-runtime/radix-root.ts"),
					"Do not import Radix directly",
				);
			},
		);
	});
	test("keeps the assistant runtime bundle within the bounded headless surface", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-assistant-ui-bundle-"));
		try {
			fs.mkdirSync(path.join(root, "src"));
			fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "dir");
			fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n');
			fs.writeFileSync(
				path.join(root, "index.html"),
				'<script type="module" src="/src/main.ts"></script>\n',
			);
			fs.writeFileSync(
				path.join(root, "src/main.ts"),
				`import {
	useExternalStoreRuntime,
	AssistantRuntimeProvider,
	ReadonlyThreadProvider,
	MessageNotSentError,
	ThreadPrimitive,
	MessagePrimitive,
	MessagePartPrimitive,
	ComposerPrimitive,
} from "${ASSISTANT_UI_PACKAGE}";
const approved = [
	useExternalStoreRuntime,
	AssistantRuntimeProvider,
	ReadonlyThreadProvider,
	MessageNotSentError,
	ThreadPrimitive,
	MessagePrimitive,
	MessagePartPrimitive,
	ComposerPrimitive,
];
globalThis.__archboardAssistantUiProbe = approved;
export { approved };
`,
			);
			fs.writeFileSync(
				path.join(root, "vite.config.mjs"),
				`import { defineConfig } from "vite";
const audit = {
	name: "archboard-assistant-ui-bundle-audit",
	generateBundle(_options, bundle) {
		const modules = [...new Set(Object.values(bundle).flatMap((asset) =>
			asset.type === "chunk" ? Object.keys(asset.modules) : []))].sort();
		this.emitFile({
			type: "asset",
			fileName: "assistant-ui-bundle-audit.json",
			source: JSON.stringify({ modules }),
		});
	},
};
export default defineConfig({ plugins: [audit], build: { outDir: "dist", emptyOutDir: true } });
`,
			);
			const result = run(root, [vite, "build", "--config", "vite.config.mjs"]);
			expect(result.exitCode, result.output).toBe(0);
			const assets = path.join(root, "dist/assets");
			const bundle = fs
				.readdirSync(assets)
				.filter((file) => file.endsWith(".js"))
				.map((file) => fs.readFileSync(path.join(assets, file), "utf8"))
				.join("\n");
			const audit = JSON.parse(
				fs.readFileSync(path.join(root, "dist/assistant-ui-bundle-audit.json"), "utf8"),
			) as { modules: string[] };
			const baselineBytes = 280_379,
				baselineModules = 280;
			const packageRoots = new Set(
				audit.modules
					.map(packageRootFromModule)
					.filter((packageRoot): packageRoot is string => packageRoot !== undefined),
			);
			const sortedPackageRoots = [...packageRoots].toSorted();
			expect(
				sortedPackageRoots,
				`unexpected bundle package roots: ${sortedPackageRoots.join(", ")}`,
			).toEqual([...EXPECTED_BUNDLE_PACKAGE_ROOTS].toSorted());
			expect(
				Buffer.byteLength(bundle),
				`assistant-ui bundle bytes delta: ${Buffer.byteLength(bundle) - baselineBytes}`,
			).toBeLessThanOrEqual(baselineBytes);
			expect(
				audit.modules.length,
				`assistant-ui bundle module delta: ${audit.modules.length - baselineModules}`,
			).toBeLessThanOrEqual(baselineModules);
			expect(audit.modules.some((module) => module.includes("assistant-cloud"))).toBeFalse();
			expect(audit.modules.some((module) => module.includes("safe-content-frame"))).toBeFalse();
			expect(bundle).not.toContain("assistant-cloud");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
