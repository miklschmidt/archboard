import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

interface GeneratedClientRequestVariant {
	readonly method: string;
	readonly paramsType: string;
}

export interface ClientRequestSchemaConformanceOptions {
	readonly generatedRoot: string;
	readonly localParamsModulePath: string;
	readonly methods: readonly string[];
	readonly repositoryTsconfigPath: string;
	readonly typeScriptExecutablePath: string;
}

const TYPESCRIPT_BUILTIN_TYPE_NAMES = new Set([
	"any",
	"bigint",
	"boolean",
	"never",
	"null",
	"number",
	"object",
	"string",
	"symbol",
	"undefined",
	"unknown",
	"void",
]);

function moduleSpecifier(fromFile: string, targetFile: string): string {
	const path = relative(dirname(fromFile), targetFile).split(sep).join("/");
	return path.startsWith(".") ? path : `./${path}`;
}

function generatedClientRequestVariants(source: string): readonly GeneratedClientRequestVariant[] {
	const variants = [
		...source.matchAll(/\{ "method": "([^"]+)", id: RequestId, params\??: ([^,]+), \}/g),
	].map((match) => ({ method: match[1]!, paramsType: match[2]!.trim() }));
	if (!variants.length) throw new Error("generated ClientRequest.ts contains no request variants");
	const methods = variants.map((variant) => variant.method);
	if (new Set(methods).size !== methods.length)
		throw new Error("generated ClientRequest.ts contains duplicate request methods");
	return variants;
}

function generatedTypeImports(source: string): ReadonlyMap<string, string> {
	const imports = new Map<string, string>();
	for (const match of source.matchAll(/^import type \{ ([A-Za-z_$][\w$]*) \} from "([^"]+)";$/gm)) {
		const [, name, path] = match;
		if (imports.has(name!)) throw new Error(`generated ClientRequest.ts imports ${name} twice`);
		imports.set(name!, path!);
	}
	return imports;
}

function requestedVariants(
	variants: readonly GeneratedClientRequestVariant[],
	methods: readonly string[],
): readonly GeneratedClientRequestVariant[] {
	const byMethod = new Map(variants.map((variant) => [variant.method, variant] as const));
	return methods.map((method) => {
		const variant = byMethod.get(method);
		if (!variant)
			throw new Error(`generated ClientRequest.ts has no params variant for method ${method}`);
		return variant;
	});
}

function importedTypeNames(variants: readonly GeneratedClientRequestVariant[]): readonly string[] {
	return [
		...new Set(
			variants.flatMap((variant) =>
				[...variant.paramsType.matchAll(/[A-Za-z_$][\w$]*/g)]
					.map((match) => match[0])
					.filter((name) => !TYPESCRIPT_BUILTIN_TYPE_NAMES.has(name)),
			),
		),
	].toSorted();
}

function writePayloadOwner(
	filePath: string,
	generatedRoot: string,
	localParamsModulePath: string,
	variants: readonly GeneratedClientRequestVariant[],
	imports: ReadonlyMap<string, string>,
): void {
	const importLines = importedTypeNames(variants).map((name) => {
		const generatedPath = imports.get(name);
		if (!generatedPath)
			throw new Error(
				`generated ClientRequest params reference ${name}, but ClientRequest.ts does not import it`,
			);
		const targetPath = resolve(generatedRoot, `${generatedPath}.ts`);
		if (!existsSync(targetPath))
			throw new Error(`generated ClientRequest params import ${name} from missing ${targetPath}`);
		return `import type { ${name} } from ${JSON.stringify(moduleSpecifier(filePath, targetPath))};`;
	});
	const payloadLines = variants.map(
		(variant) => `\t${JSON.stringify(variant.method)}: ${variant.paramsType};`,
	);
	writeFileSync(
		filePath,
		[
			`import type { ClientRequestParams as ArchboardClientRequestParams } from ${JSON.stringify(moduleSpecifier(filePath, localParamsModulePath))};`,
			...importLines,
			"",
			"export type { ArchboardClientRequestParams };",
			"export interface GeneratedClientRequestPayloads {",
			...payloadLines,
			"}",
			"",
		].join("\n"),
	);
}

function writeMethodCheck(
	filePath: string,
	payloadOwnerPath: string,
	method: string,
	direction: "archboard-schema-to-generated" | "generated-to-archboard-schema",
): void {
	mkdirSync(dirname(filePath), { recursive: true });
	const archboardType = `ArchboardClientRequestParams<${JSON.stringify(method)}>`;
	const generatedType = `GeneratedClientRequestPayloads[${JSON.stringify(method)}]`;
	const [sourceType, targetType] =
		direction === "archboard-schema-to-generated"
			? [archboardType, generatedType]
			: [generatedType, archboardType];
	writeFileSync(
		filePath,
		[
			`import type { ArchboardClientRequestParams, GeneratedClientRequestPayloads } from ${JSON.stringify(moduleSpecifier(filePath, payloadOwnerPath))};`,
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

/** Compiles local Zod inference against generated Codex request params in both directions. */
export function assertGeneratedClientRequestSchemaConformance(
	options: ClientRequestSchemaConformanceOptions,
): void {
	const generatedClientRequestPath = join(options.generatedRoot, "ClientRequest.ts");
	const source = readFileSync(generatedClientRequestPath, "utf8");
	const variants = requestedVariants(generatedClientRequestVariants(source), options.methods);
	const imports = generatedTypeImports(source);
	const conformanceRoot = mkdtempSync(join(tmpdir(), "archboard-codex-request-conformance-"));
	try {
		const payloadOwnerPath = join(conformanceRoot, "payloads.ts");
		writePayloadOwner(
			payloadOwnerPath,
			options.generatedRoot,
			options.localParamsModulePath,
			variants,
			imports,
		);
		const checkFiles = options.methods.flatMap((method) => {
			const methodRoot = join(
				conformanceRoot,
				"methods",
				...method.split("/").map(encodeURIComponent),
			);
			return (["archboard-schema-to-generated", "generated-to-archboard-schema"] as const).map(
				(direction) => {
					const filePath = join(methodRoot, `${direction}.ts`);
					writeMethodCheck(filePath, payloadOwnerPath, method, direction);
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
