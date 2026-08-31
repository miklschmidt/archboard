import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";

export interface ClientRequestSchemaConformanceOptions {
	readonly generatedRoot: string;
	readonly localParamsModulePath: string;
	readonly methods: readonly string[];
	readonly repositoryTsconfigPath: string;
	readonly typeScriptExecutablePath: string;
}
function moduleSpecifier(fromFile: string, targetFile: string): string {
	const path = relative(dirname(fromFile), targetFile).split(sep).join("/");
	return path.startsWith(".") ? path : `./${path}`;
}

function writeTypeOwner(
	filePath: string,
	generatedRoot: string,
	localParamsModulePath: string,
): void {
	const generatedClientRequestPath = join(generatedRoot, "ClientRequest.ts");
	if (!existsSync(generatedClientRequestPath))
		throw new Error(`generated ClientRequest union is missing at ${generatedClientRequestPath}`);
	writeFileSync(
		filePath,
		[
			`import type { ClientRequest as GeneratedClientRequest } from ${JSON.stringify(moduleSpecifier(filePath, generatedClientRequestPath))};`,
			`import type { ClientRequestInput as ArchboardClientRequestInput, ClientRequestParams as ArchboardClientRequestOutput } from ${JSON.stringify(moduleSpecifier(filePath, localParamsModulePath))};`,
			"",
			"// ts-rs emits JSON/string index signatures as optional even though JSON cannot carry undefined.",
			"type GeneratedJsonValue =",
			'\tExtract<GeneratedClientRequest, { method: "thread/inject_items" }>["params"]["items"][number];',
			"type ArchboardJsonValueInput =",
			'\tArchboardClientRequestInput<"thread/inject_items">["items"][number];',
			"type SameType<Left, Right> =",
			"\t[Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;",
			"type NormalizeTsRsOptionalIndexArtifactsForSchemaInput<Value> =",
			"\tSameType<Value, GeneratedJsonValue> extends true",
			"\t\t? ArchboardJsonValueInput",
			"\t\t: Value extends readonly unknown[]",
			"\t\t? { [Index in keyof Value]: NormalizeTsRsOptionalIndexArtifactsForSchemaInput<Value[Index]> }",
			"\t\t: Value extends object",
			"\t\t\t? string extends keyof Value",
			"\t\t\t\t? { [Key in keyof Value]-?: NormalizeTsRsOptionalIndexArtifactsForSchemaInput<Exclude<Value[Key], undefined>> }",
			"\t\t\t\t: { [Key in keyof Value]: NormalizeTsRsOptionalIndexArtifactsForSchemaInput<Exclude<Value[Key], undefined>> }",
			"\t\t\t: Value;",
			"",
			'type GeneratedClientRequestParams<Method extends GeneratedClientRequest["method"]> =',
			'\tExtract<GeneratedClientRequest, { method: Method }>["params"];',
			"",
			"export type { ArchboardClientRequestInput, ArchboardClientRequestOutput };",
			'export type RawGeneratedClientRequestParams<Method extends GeneratedClientRequest["method"]> =',
			"\tGeneratedClientRequestParams<Method>;",
			'export type NormalizedGeneratedClientRequestInput<Method extends GeneratedClientRequest["method"]> =',
			"\tNormalizeTsRsOptionalIndexArtifactsForSchemaInput<GeneratedClientRequestParams<Method>>;",
			"",
		].join("\n"),
	);
}

function writeMethodCheck(
	filePath: string,
	typeOwnerPath: string,
	method: string,
	direction: "schema-output-to-generated" | "generated-to-schema-input",
): void {
	mkdirSync(dirname(filePath), { recursive: true });
	const archboardInputType = `ArchboardClientRequestInput<${JSON.stringify(method)}>`;
	const archboardOutputType = `ArchboardClientRequestOutput<${JSON.stringify(method)}>`;
	const normalizedGeneratedType = `NormalizedGeneratedClientRequestInput<${JSON.stringify(method)}>`;
	const rawGeneratedType = `RawGeneratedClientRequestParams<${JSON.stringify(method)}>`;
	const [sourceType, targetType] =
		direction === "schema-output-to-generated"
			? [archboardOutputType, rawGeneratedType]
			: [normalizedGeneratedType, archboardInputType];
	writeFileSync(
		filePath,
		[
			`import type { ArchboardClientRequestInput, ArchboardClientRequestOutput, NormalizedGeneratedClientRequestInput, RawGeneratedClientRequestParams } from ${JSON.stringify(moduleSpecifier(filePath, typeOwnerPath))};`,
			"",
			`declare const params: ${sourceType};`,
			`const conformance: ${targetType} = params;`,
			"",
			"export type RequestSchemaConformance = typeof conformance;",
			"",
		].join("\n"),
	);
}

function writeTypeScriptProject(
	filePath: string,
	repositoryTsconfigPath: string,
	checkFiles: readonly string[],
): void {
	writeFileSync(
		filePath,
		`${JSON.stringify(
			{
				extends: repositoryTsconfigPath,
				compilerOptions: {
					typeRoots: [join(dirname(repositoryTsconfigPath), "node_modules", "@types")],
				},
				files: checkFiles,
				include: [],
			},
			null,
			"\t",
		)}\n`,
	);
}

/** Compiles schema output to raw vendor params and normalized vendor params to schema input. */
export function assertGeneratedClientRequestSchemaConformance(
	options: ClientRequestSchemaConformanceOptions,
): void {
	const conformanceRoot = mkdtempSync(join(tmpdir(), "archboard-codex-request-conformance-"));
	try {
		const typeOwnerPath = join(conformanceRoot, "request-types.ts");
		writeTypeOwner(typeOwnerPath, options.generatedRoot, options.localParamsModulePath);
		const checkFiles = options.methods.flatMap((method) => {
			const methodRoot = join(
				conformanceRoot,
				"methods",
				...method.split("/").map(encodeURIComponent),
			);
			return (["schema-output-to-generated", "generated-to-schema-input"] as const).map(
				(direction) => {
					const filePath = join(methodRoot, `${direction}.ts`);
					writeMethodCheck(filePath, typeOwnerPath, method, direction);
					return filePath;
				},
			);
		});
		const projectPath = join(conformanceRoot, "tsconfig.json");
		writeTypeScriptProject(projectPath, options.repositoryTsconfigPath, checkFiles);
		const compiled = spawnSync(
			process.execPath,
			[options.typeScriptExecutablePath, "--project", projectPath, "--pretty", "false"],
			{ encoding: "utf8", stdio: "pipe" },
		);
		if (compiled.error) throw compiled.error;
		if (compiled.status !== 0) {
			const diagnostics = `${compiled.stdout}${compiled.stderr}`.trim();
			throw new Error(
				`generated ClientRequest params do not match local schema inference${diagnostics ? `:\n${diagnostics}` : `; TypeScript exited ${compiled.status}`}`,
			);
		}
	} finally {
		rmSync(conformanceRoot, { recursive: true, force: true });
	}
}
