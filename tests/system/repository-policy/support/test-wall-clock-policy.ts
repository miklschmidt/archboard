import { parse } from "@babel/parser";
import { VISITOR_KEYS, type Node, type ObjectExpression } from "@babel/types";
import path from "node:path";

const DECLARATION = "declareTestWallClockBudget";
const PRELOAD = "./tests/system/repository-policy/support/test-preload.ts";
const HELPER = "tests/system/repository-policy/support/test-wall-clock.ts";
const REQUIRED_FIELDS = ["test", "reason", "outerBoundMs", "task", "evidence"] as const;

interface TestWallClockPolicyInput {
	readonly bunfig: string;
	readonly sources: ReadonlyMap<string, string>;
}

function isNode(value: unknown): value is Node {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const type: unknown = Reflect.get(value, "type");
	return typeof type === "string" && Object.hasOwn(VISITOR_KEYS, type);
}

function children(node: Node): Node[] {
	const found: Node[] = [];
	for (const key of VISITOR_KEYS[node.type] ?? []) {
		const value: unknown = Reflect.get(node, key);
		if (isNode(value)) {
			found.push(value);
		} else if (Array.isArray(value)) {
			for (const item of value) {
				if (isNode(item)) {
					found.push(item);
				}
			}
		}
	}
	return found;
}

function walk(node: Node, visit: (node: Node, ancestors: readonly Node[]) => void): void {
	const ancestors: Node[] = [];
	const descend = (current: Node): void => {
		visit(current, ancestors);
		ancestors.push(current);
		for (const child of children(current)) {
			descend(child);
		}
		ancestors.pop();
	};
	descend(node);
}

function identifierName(node: unknown): string | undefined {
	return isNode(node) && node.type === "Identifier" && typeof node.name === "string"
		? node.name
		: undefined;
}

function stringValue(node: unknown): string | undefined {
	return isNode(node) && node.type === "StringLiteral" && typeof node.value === "string"
		? node.value
		: undefined;
}

function helperImport(file: string, specifier: string): boolean {
	return path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)) === HELPER;
}

function preloadErrors(bunfig: string): string[] {
	let document: unknown;
	try {
		document = Bun.TOML.parse(bunfig);
	} catch (error) {
		return [
			`bunfig.toml is not valid TOML: ${error instanceof Error ? error.message : String(error)}`,
		];
	}
	if (typeof document !== "object" || document === null) {
		return ["bunfig.toml has no [test] table"];
	}
	const testTable = (document as { test?: unknown }).test;
	if (typeof testTable !== "object" || testTable === null) {
		return ["bunfig.toml has no [test] table"];
	}
	const preload = (testTable as { preload?: unknown }).preload;
	if (!Array.isArray(preload) || !preload.includes(PRELOAD)) {
		return [`bunfig.toml test.preload must include ${PRELOAD}`];
	}
	return [];
}

function declarationObjectErrors(
	file: string,
	object: ObjectExpression,
	testName: string,
): string[] {
	const errors: string[] = [];
	const properties = Array.isArray(object.properties) ? object.properties : [];
	const fields = new Map<string, Node>();
	for (const property of properties) {
		if (
			!isNode(property) ||
			property.type !== "ObjectProperty" ||
			property.computed === true ||
			property.shorthand === true
		) {
			errors.push(`${file}: wall-clock declaration must contain only direct object fields`);
			continue;
		}
		const key = identifierName(property.key) ?? stringValue(property.key);
		if (!key || !REQUIRED_FIELDS.includes(key as (typeof REQUIRED_FIELDS)[number])) {
			errors.push(`${file}: wall-clock declaration has unsupported field ${JSON.stringify(key)}`);
			continue;
		}
		if (fields.has(key)) {
			errors.push(`${file}: wall-clock declaration repeats field ${key}`);
		}
		if (isNode(property.value)) {
			fields.set(key, property.value);
		}
	}
	for (const field of REQUIRED_FIELDS) {
		if (!fields.has(field)) {
			errors.push(`${file}: wall-clock declaration needs field ${field}`);
		}
	}

	const declaredTest = stringValue(fields.get("test"));
	if (!declaredTest) {
		errors.push(`${file}: wall-clock declaration test must be a non-empty literal`);
	} else if (declaredTest !== testName) {
		errors.push(
			`${file}: wall-clock declaration names ${JSON.stringify(declaredTest)}, not its containing test ${JSON.stringify(testName)}`,
		);
	} else if (declaredTest.includes("*")) {
		errors.push(`${file}: wall-clock declaration test must not contain a wildcard`);
	}
	for (const field of ["reason", "evidence"] as const) {
		if (!stringValue(fields.get(field))) {
			errors.push(`${file}: wall-clock declaration ${field} must be a non-empty literal`);
		}
	}
	const task = stringValue(fields.get("task"));
	if (!task || !/^TASK-\d+(?:\.\d+)*$/.test(task)) {
		errors.push(`${file}: wall-clock declaration task must be a literal TASK-* reference`);
	}
	const outerBound = identifierName(fields.get("outerBoundMs"));
	if (!outerBound || !/^TEST_[A-Z0-9_]+$/.test(outerBound)) {
		errors.push(`${file}: wall-clock declaration outerBoundMs must name a TEST_* constant`);
	}
	return errors;
}

function declarationErrors(file: string, source: string): string[] {
	let ast: ReturnType<typeof parse>;
	try {
		ast = parse(source, {
			sourceType: "module",
			plugins: ["typescript", "jsx", "explicitResourceManagement"],
		});
	} catch (error) {
		return [
			`${file}: cannot parse declaration owner: ${error instanceof Error ? error.message : String(error)}`,
		];
	}
	const errors: string[] = [];
	const allowedIdentifiers = new Set<Node>();
	let canonicalImport = false;
	if (file === HELPER) {
		walk(ast, (node) => {
			if (
				node.type === "FunctionDeclaration" &&
				identifierName(node.id) === DECLARATION &&
				isNode(node.id)
			) {
				allowedIdentifiers.add(node.id);
			}
		});
	}
	walk(ast, (node) => {
		if (node.type !== "ImportDeclaration") {
			return;
		}
		const specifier = stringValue(node.source);
		if (!specifier || !helperImport(file, specifier)) {
			return;
		}
		const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
		for (const imported of specifiers) {
			if (!isNode(imported)) {
				continue;
			}
			if (imported.type !== "ImportSpecifier") {
				errors.push(`${file}: wall-clock helper must not use a default or namespace import`);
				continue;
			}
			const importedName = identifierName(imported.imported);
			if (importedName !== DECLARATION) {
				continue;
			}
			const localName = identifierName(imported.local);
			if (localName !== DECLARATION) {
				errors.push(`${file}: ${DECLARATION} must not be aliased`);
			} else {
				canonicalImport = true;
			}
			if (isNode(imported.imported)) {
				allowedIdentifiers.add(imported.imported);
			}
			if (isNode(imported.local)) {
				allowedIdentifiers.add(imported.local);
			}
		}
	});

	walk(ast, (node, ancestors) => {
		if (node.type !== "CallExpression" || identifierName(node.callee) !== DECLARATION) {
			return;
		}
		if (isNode(node.callee)) {
			allowedIdentifiers.add(node.callee);
		}
		if (!canonicalImport) {
			errors.push(`${file}: ${DECLARATION} needs a direct unaliased helper import`);
		}
		const statement = ancestors.at(-1);
		const block = ancestors.at(-2);
		const callback = ancestors.at(-3);
		const testCall = ancestors.at(-4);
		const callArguments =
			testCall?.type === "CallExpression" && Array.isArray(testCall.arguments)
				? testCall.arguments
				: [];
		const body = block?.type === "BlockStatement" && Array.isArray(block.body) ? block.body : [];
		const exactOwner =
			isNode(statement) &&
			statement.type === "ExpressionStatement" &&
			statement.expression === node &&
			isNode(block) &&
			block.type === "BlockStatement" &&
			body[0] === statement &&
			isNode(callback) &&
			(callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression") &&
			isNode(testCall) &&
			testCall.type === "CallExpression" &&
			identifierName(testCall.callee) === "test" &&
			callArguments[1] === callback;
		if (!exactOwner) {
			errors.push(
				`${file}: ${DECLARATION} must be the first statement inside one direct test(name, callback) body`,
			);
			return;
		}
		const testName = stringValue(callArguments[0]);
		if (!testName) {
			errors.push(`${file}: an approved wall-clock test needs a literal exact name`);
			return;
		}
		const declarationArguments = Array.isArray(node.arguments) ? node.arguments : [];
		const object = declarationArguments[0];
		if (
			declarationArguments.length !== 1 ||
			!isNode(object) ||
			object.type !== "ObjectExpression"
		) {
			errors.push(`${file}: ${DECLARATION} needs one inline object literal`);
			return;
		}
		errors.push(...declarationObjectErrors(file, object, testName));
	});

	walk(ast, (node) => {
		if (node.type !== "Identifier" || node.name !== DECLARATION || allowedIdentifiers.has(node)) {
			return;
		}
		errors.push(`${file}: ${DECLARATION} may only appear in its direct import and call`);
	});
	return [...new Set(errors)];
}

function inspectTestWallClockPolicy(input: TestWallClockPolicyInput): string[] {
	const errors = preloadErrors(input.bunfig);
	for (const [file, source] of input.sources) {
		if (!source.includes(DECLARATION) && !source.includes("test-wall-clock")) {
			continue;
		}
		errors.push(...declarationErrors(file.replaceAll("\\", "/"), source));
	}
	return errors;
}

export { type TestWallClockPolicyInput, inspectTestWallClockPolicy };
