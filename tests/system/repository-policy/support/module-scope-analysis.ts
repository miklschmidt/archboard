import fs from "node:fs";
import path from "node:path";
import { API } from "typescript/unstable/async";
import * as ts from "typescript/unstable/ast";

export interface ModuleScopeFinding {
	file: string;
	line: number;
	rule: string;
	message: string;
	reason?: string;
}

export interface ModuleScopeResult {
	findings: ModuleScopeFinding[];
	waived: ModuleScopeFinding[];
}

const HARMLESS_CONSTRUCTORS = new Set([
	"RegExp",
	"Date",
	"URL",
	"URLSearchParams",
	"TextEncoder",
	"TextDecoder",
	"Intl",
	"Number",
	"String",
	"Boolean",
	"Symbol",
	"BigInt",
	"Promise",
	"Uint8Array",
	"Int8Array",
	"Uint16Array",
	"Int16Array",
	"Uint32Array",
	"Int32Array",
	"Float32Array",
	"Float64Array",
	"ArrayBuffer",
	"DataView",
]);
const CONTAINERS = new Set(["Map", "Set", "WeakMap", "WeakSet", "Array"]);
const TIMERS = new Set(["setInterval", "setTimeout", "setImmediate"]);
const ADD_LISTENER = new Set([
	"on",
	"once",
	"addListener",
	"addEventListener",
	"prependListener",
	"prependOnceListener",
]);
const REMOVE_LISTENER = new Set([
	"off",
	"removeListener",
	"removeAllListeners",
	"removeEventListener",
]);
const MUTATORS = new Set([
	"set",
	"add",
	"push",
	"delete",
	"clear",
	"unshift",
	"splice",
	"pop",
	"shift",
]);
const BINDERS = new Set(["listen", "bind"]);
const WAIVER = /\/\/\s*hot-safe:\s*(\S.*)$/;

function isFunctionLike(node: ts.Node): boolean {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isConstructorDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node)
	);
}

function walkModuleScope(node: ts.Node, visit: (node: ts.Node) => void): void {
	if (
		isFunctionLike(node) ||
		ts.isClassDeclaration(node) ||
		ts.isClassExpression(node) ||
		ts.isModuleDeclaration(node) ||
		ts.isInterfaceDeclaration(node) ||
		ts.isTypeAliasDeclaration(node)
	)
		return;
	visit(node);
	node.forEachChild((child) => walkModuleScope(child, visit));
}

function walkAll(node: ts.Node, visit: (node: ts.Node) => void): void {
	visit(node);
	node.forEachChild((child) => walkAll(child, visit));
}

function insideKept(node: ts.Node): boolean {
	for (let current = node.parent; current; current = current.parent) {
		if (
			ts.isCallExpression(current) &&
			ts.isIdentifier(current.expression) &&
			current.expression.text === "kept"
		)
			return true;
	}
	return false;
}

function guardedByPresenceTest(node: ts.Node, receiver: string, source: ts.SourceFile): boolean {
	for (let current = node.parent; current; current = current.parent) {
		if (ts.isIfStatement(current)) {
			const condition = current.expression.getText(source);
			if (
				condition.includes(`${receiver}.has(`) ||
				condition.includes(`${receiver}.get(`) ||
				condition.includes(`${receiver}.size`) ||
				condition.includes(`${receiver}.length`) ||
				condition.includes(`${receiver}.includes(`) ||
				condition.includes(`!${receiver}`)
			)
				return true;
		}
		if (isFunctionLike(current)) return false;
	}
	return false;
}

function guardedByOnceFlag(node: ts.Node, source: ts.SourceFile): boolean {
	for (let current = node.parent; current; current = current.parent) {
		if (
			ts.isIfStatement(current) &&
			/^!\w+(\.\w+)*$/.test(current.expression.getText(source).trim())
		)
			return true;
		if (isFunctionLike(current)) return false;
	}
	return false;
}

function declaredNameFor(node: ts.Node): string | undefined {
	const parent = node.parent;
	return parent &&
		ts.isVariableDeclaration(parent) &&
		parent.initializer === node &&
		ts.isIdentifier(parent.name)
		? parent.name.text
		: undefined;
}

interface Removal {
	receiver: string;
	event?: string;
}

function pairedWithRemoval(
	receiver: string,
	event: string | undefined,
	removals: Removal[],
): boolean {
	return removals.some(
		(removal) =>
			removal.receiver === receiver && (removal.event === event || removal.event === undefined),
	);
}

export async function parseModuleSources(
	repoRoot: string,
	openFiles: string[],
): Promise<Map<string, ts.SourceFile>> {
	const parsed = new Map<string, ts.SourceFile>();
	const compiler = new API({ cwd: repoRoot });
	try {
		const snapshot = await compiler.updateSnapshot({
			openProjects: [path.join(repoRoot, "tsconfig.json")],
			openFiles,
		});
		for (const project of snapshot.getProjects()) {
			for (const file of await project.program.getSourceFileNames()) {
				const source = await project.program.getSourceFile(file);
				if (source) parsed.set(path.resolve(file), source);
			}
		}
	} finally {
		void compiler.close();
	}
	return parsed;
}

export function moduleGraph(
	entries: string[],
	parsedSources: ReadonlyMap<string, ts.SourceFile>,
): string[] {
	const seen = new Set<string>();
	const queue = [...entries];
	while (queue.length > 0) {
		const file = path.resolve(queue.pop() ?? "");
		if (seen.has(file) || !fs.existsSync(file)) continue;
		seen.add(file);
		const source = parsedSources.get(file);
		if (!source) throw new Error(`TypeScript did not parse ${file}.`);
		for (const statement of source.statements) {
			const specifier =
				(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
				statement.moduleSpecifier &&
				ts.isStringLiteral(statement.moduleSpecifier)
					? statement.moduleSpecifier.text
					: undefined;
			if (!specifier?.startsWith(".")) continue;
			queue.push(path.resolve(path.dirname(file), specifier).replace(/\.js$/, ".ts"));
		}
	}
	return [...seen].toSorted();
}

export function analyzeModuleScope(
	repoRoot: string,
	files: string[],
	parsedSources: ReadonlyMap<string, ts.SourceFile>,
): ModuleScopeResult {
	const parsed = new Map<string, { text: string; source: ts.SourceFile }>();
	const mutatedNames = new Set<string>();
	for (const file of files) {
		const absolute = path.resolve(file);
		const source = parsedSources.get(absolute);
		if (!source) throw new Error(`TypeScript did not parse ${path.relative(repoRoot, file)}.`);
		parsed.set(absolute, { text: fs.readFileSync(absolute, "utf8"), source });
		walkAll(source, (node) => {
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				MUTATORS.has(node.expression.name.text) &&
				ts.isIdentifier(node.expression.expression)
			)
				mutatedNames.add(node.expression.expression.text);
			if (
				ts.isBinaryExpression(node) &&
				node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				(ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)) &&
				ts.isIdentifier(node.left.expression)
			)
				mutatedNames.add(node.left.expression.text);
		});
	}

	const findings: ModuleScopeFinding[] = [];
	const waived: ModuleScopeFinding[] = [];
	for (const file of files.map((value) => path.resolve(value))) {
		const parsedFile = parsed.get(file);
		if (!parsedFile) continue;
		const { text, source } = parsedFile;
		const waivers = new Map<number, string>();
		text.split("\n").forEach((line, index) => {
			const reason = WAIVER.exec(line)?.[1]?.trim();
			if (!reason) return;
			waivers.set(index + 1, reason);
			waivers.set(index + 2, reason);
		});
		const report = (node: ts.Node, rule: string, message: string): void => {
			const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
			const reason = waivers.get(line);
			const entry: ModuleScopeFinding = {
				file: path.relative(repoRoot, file),
				line,
				rule,
				message,
				...(reason ? { reason } : {}),
			};
			(reason ? waived : findings).push(entry);
		};

		const longLived = new Set<string>();
		walkModuleScope(source, (node) => {
			if (ts.isImportDeclaration(node) && node.importClause) {
				const clause = node.importClause;
				if (clause.name) longLived.add(clause.name.text);
				if (clause.namedBindings) {
					if (ts.isNamespaceImport(clause.namedBindings))
						longLived.add(clause.namedBindings.name.text);
					else
						for (const element of clause.namedBindings.elements) longLived.add(element.name.text);
				}
			}
			if (
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				node.initializer &&
				ts.isCallExpression(node.initializer) &&
				ts.isIdentifier(node.initializer.expression) &&
				node.initializer.expression.text === "kept"
			)
				longLived.add(node.name.text);
		});

		const removals: Removal[] = [];
		walkModuleScope(source, (node) => {
			if (!ts.isCallExpression(node) || insideKept(node)) return;
			if (!ts.isPropertyAccessExpression(node.expression)) return;
			if (!REMOVE_LISTENER.has(node.expression.name.text)) return;
			const first = node.arguments[0];
			removals.push({
				receiver: node.expression.expression.getText(source),
				...(first && ts.isStringLiteral(first) ? { event: first.text } : {}),
			});
		});

		walkModuleScope(source, (node) => {
			if (insideKept(node)) return;
			if (ts.isNewExpression(node)) {
				const constructed = node.expression.getText(source);
				const root = constructed.split(".")[0] ?? constructed;
				if (HARMLESS_CONSTRUCTORS.has(root) || constructed.endsWith("Error")) return;
				const name = declaredNameFor(node);
				if (name && CONTAINERS.has(constructed) && !mutatedNames.has(name)) return;
				report(node, "new-at-module-scope", `new ${constructed} runs again on every reload`);
				return;
			}
			if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
				const name = declaredNameFor(node);
				if (name && mutatedNames.has(name))
					report(node, "mutable-literal-at-module-scope", `${name} is rebuilt on every reload`);
				return;
			}
			if (!ts.isCallExpression(node)) return;
			if (ts.isIdentifier(node.expression) && TIMERS.has(node.expression.text)) {
				report(
					node,
					"timer-at-module-scope",
					`${node.expression.text} starts again on every reload`,
				);
				return;
			}
			if (!ts.isPropertyAccessExpression(node.expression)) return;
			const method = node.expression.name.text;
			const receiver = node.expression.expression.getText(source);
			if (ADD_LISTENER.has(method)) {
				const first = node.arguments[0];
				const event = first && ts.isStringLiteral(first) ? first.text : undefined;
				if (!pairedWithRemoval(receiver, event, removals) && !guardedByOnceFlag(node, source))
					report(
						node,
						"listener-at-module-scope",
						`${receiver}.${method} adds a handler on every reload`,
					);
				return;
			}
			if (BINDERS.has(method) && node.arguments.length > 0) {
				if (!guardedByOnceFlag(node, source))
					report(node, "bind-at-module-scope", `${receiver}.${method} binds on every reload`);
				return;
			}
			if (
				MUTATORS.has(method) &&
				/^[A-Za-z_$][\w$]*$/.test(receiver) &&
				longLived.has(receiver) &&
				!guardedByPresenceTest(node, receiver, source)
			)
				report(node, "mutation-at-module-scope", `${receiver}.${method} writes on every reload`);
		});
	}
	return { findings, waived };
}
