#!/usr/bin/env bun
//
// Module scope must not create long-lived state (TASK-059, ADR 0014).
//
// A reload re-evaluates the whole module graph inside the running process, so
// every top-level statement below runs again while tabs are still connected,
// boards are still open and the port is still bound. Two bugs found while
// building TASK-057 were exactly that: `boards.set(SCRATCH_KEY, ...)` re-ran
// and blanked the scratch board under an open pane, and a connection handler
// was added rather than replaced, so the next reload answered every message
// twice.
//
// Both were found by reloading a live server and looking, which is not a
// safety net. This is one: it reads the source and refuses the shapes that
// only work the first time a module is evaluated.
//
// SCOPE is the static import graph of `src/dev-canvas.ts` and `src/server.ts`,
// because that is exactly what a canvas reload re-evaluates. A module joins the
// checked set the moment one of those imports it, transitively, and nobody has
// to remember to add it. The CLI is a one-shot process and is not checked.
//
// The heuristic errs toward false positives on purpose. Anything it flags can
// be waived with a marker naming a reason:
//
//     // hot-safe: <why re-running this is harmless>
//
// on the statement or at the end of its line. A waiver is a sentence somebody
// had to write, which is the point; a silent exemption is the rule this exists
// to stop relying on.
//
// What it cannot see is in the FALSE NEGATIVES note at the bottom.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/async";
import * as ts from "typescript/unstable/ast";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(repoRoot, "scripts", "fixtures", "module-scope");
const fixtureFiles = fs
	.readdirSync(fixtureDir)
	.filter((name) => name.endsWith(".ts"))
	.map((name) => path.join(fixtureDir, name));
// The canvas, and the dev entry that reloads it. The dev entry matters most:
// it is the one file bun re-evaluates by itself, on every save, so a side
// effect there runs whether anybody asked for a reload or not.
const ENTRIES = [
	path.join(repoRoot, "src", "dev-canvas.ts"),
	path.join(repoRoot, "src", "server.ts"),
];

// TypeScript 7's native compiler no longer exposes createSourceFile from the
// package root. Its supported AST interface belongs to a compiler snapshot.
// Load the configured source graph and the deliberately excluded self-test
// fixtures once, then close the compiler process before running the checks.
const parsedSources = new Map();
const compiler = new API({ cwd: repoRoot });
try {
	const snapshot = await compiler.updateSnapshot({
		openProjects: [path.join(repoRoot, "tsconfig.json")],
		openFiles: fixtureFiles,
	});
	for (const project of snapshot.getProjects()) {
		for (const file of await project.program.getSourceFileNames()) {
			const absolute = path.resolve(file);
			if (
				!absolute.startsWith(path.join(repoRoot, "src") + path.sep) &&
				!fixtureFiles.includes(absolute)
			)
				continue;
			const source = await project.program.getSourceFile(absolute);
			if (source) parsedSources.set(absolute, source);
		}
	}
} finally {
	compiler.close();
}

function parsedSource(file) {
	const source = parsedSources.get(path.resolve(file));
	if (!source) throw new Error(`TypeScript did not parse ${path.relative(repoRoot, file)}.`);
	return source;
}

// Constructors whose instances hold nothing the process outlives: rebuilding
// one on a reload costs nothing and loses nothing.
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

// Containers that are safe at module scope only while nothing writes to them:
// a lookup table built from literals is rebuilt identical on every reload.
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

// Calls that write into a container.
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

// Binding an address is a once-per-process act; the second one either throws
// or steals the first one's traffic.
const BINDERS = new Set(["listen", "bind"]);

const WAIVER = /\/\/\s*hot-safe:\s*(\S.*)$/;

// ── The module graph a reload re-evaluates ────────────────────────────────

/**
 * Every `.ts` file reachable from the entry by a static import.
 *
 * Specifiers are written `./x.js` because that is what TypeScript's ESM output
 * wants, and the file on disk is `./x.ts`. A dynamic import is deliberately
 * not followed: it does not run at evaluation time, so it is not part of what
 * a reload re-runs at module scope.
 */
function moduleGraph(entries) {
	const seen = new Set();
	const queue = [...entries];
	while (queue.length > 0) {
		const file = queue.pop();
		if (seen.has(file) || !fs.existsSync(file)) continue;
		seen.add(file);
		const source = parsedSource(file);
		for (const statement of source.statements) {
			const specifier =
				(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
				statement.moduleSpecifier &&
				ts.isStringLiteral(statement.moduleSpecifier)
					? statement.moduleSpecifier.text
					: null;
			if (!specifier || !specifier.startsWith(".")) continue;
			const resolved = path.resolve(path.dirname(file), specifier);
			queue.push(resolved.replace(/\.js$/, ".ts"));
		}
	}
	return [...seen].sort();
}

// ── Parsing helpers ───────────────────────────────────────────────────────

function isFunctionLike(node) {
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

/**
 * Walk the statements that run when the module is evaluated.
 *
 * Function bodies and class members are skipped: they run when something calls
 * them, which a reload does not. `kept(name, () => ...)` is skipped for the
 * same reason from the other direction. Its callback runs at most once per
 * process however many times the module around it is re-evaluated, which is
 * the whole contract of src/core/hot.ts.
 */
function walkModuleScope(node, visit) {
	const skip =
		isFunctionLike(node) ||
		ts.isClassDeclaration(node) ||
		ts.isClassExpression(node) ||
		ts.isModuleDeclaration(node) ||
		ts.isInterfaceDeclaration(node) ||
		ts.isTypeAliasDeclaration(node);
	if (skip) return;
	visit(node);
	node.forEachChild((child) => walkModuleScope(child, visit));
}

function walkAll(node, visit) {
	visit(node);
	node.forEachChild((child) => walkAll(child, visit));
}

/** Is this node the callback handed to `kept()`? */
function insideKept(node) {
	for (let current = node.parent; current; current = current.parent) {
		if (
			ts.isCallExpression(current) &&
			ts.isIdentifier(current.expression) &&
			current.expression.text === "kept"
		) {
			return true;
		}
	}
	return false;
}

/**
 * Is this write guarded by a test that it has not happened yet?
 *
 * `if (!boards.has(SCRATCH_KEY)) boards.set(SCRATCH_KEY, ...)` is the fix for
 * the board-store bug, and it is safe for a reason the check can see: the
 * write is reached only when the container does not already hold the thing.
 * The guard has to name the same receiver, so testing an unrelated flag does
 * not launder the write.
 */
function guardedByPresenceTest(node, receiver, source) {
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
			) {
				return true;
			}
		}
		if (isFunctionLike(current)) return false;
	}
	return false;
}

/** Does this sit behind a flag that says it has already happened once? */
function guardedByOnceFlag(node, source) {
	for (let current = node.parent; current; current = current.parent) {
		if (ts.isIfStatement(current)) {
			// A negated flag read off something long-lived: `if (!wiring.listening)`.
			if (/^!\w+(\.\w+)*$/.test(current.expression.getText(source).trim())) return true;
		}
		if (isFunctionLike(current)) return false;
	}
	return false;
}

/** Is an addition paired with a removal of the same event in module scope? */
function pairedWithRemoval(receiver, event, removals) {
	return removals.some((r) => r.receiver === receiver && (r.event === event || r.event === null));
}

/** The top-level `const NAME = <this expression>` this node initialises, if any. */
function declaredNameFor(node) {
	const parent = node.parent;
	if (
		parent &&
		ts.isVariableDeclaration(parent) &&
		parent.initializer === node &&
		ts.isIdentifier(parent.name)
	) {
		return parent.name.text;
	}
	return null;
}

// ── The rules ─────────────────────────────────────────────────────────────

/**
 * Findings and waivers for a set of files, judged as one module graph.
 *
 * Pass one collects what gets written to, anywhere in the set. A container
 * nobody writes to is a lookup table, and rebuilding one on a reload is free;
 * a container somebody writes to holds state. The difference is not visible in
 * the declaration, so it has to be gathered first, by name. Two unrelated
 * things sharing a name make this stricter than it needs to be, which is the
 * direction to be wrong in.
 */
function analyze(files) {
	const parsed = new Map();
	const mutatedNames = new Set();

	for (const file of files) {
		const text = fs.readFileSync(file, "utf8");
		const source = parsedSource(file);
		parsed.set(file, { text, source });
		walkAll(source, (node) => {
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				MUTATORS.has(node.expression.name.text) &&
				ts.isIdentifier(node.expression.expression)
			) {
				mutatedNames.add(node.expression.expression.text);
			}
			// `x.y = ...` and `x[i] = ...`, which is how an object literal is written to.
			if (
				ts.isBinaryExpression(node) &&
				node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				(ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)) &&
				ts.isIdentifier(node.left.expression)
			) {
				mutatedNames.add(node.left.expression.text);
			}
		});
	}

	// Pass two: judge every module-scope statement.

	const findings = [];
	const waived = [];

	for (const file of files) {
		const { text, source } = parsed.get(file);
		const relative = path.relative(repoRoot, file);

		const waivers = new Map();
		text.split("\n").forEach((line, index) => {
			const match = WAIVER.exec(line);
			if (!match) return;
			const reason = match[1].trim();
			// A waiver covers its own line and the next one, so both a trailing
			// comment and one on the line above work. Anything wider would let one
			// waiver cover a block somebody grew later.
			waivers.set(index + 1, reason);
			waivers.set(index + 2, reason);
		});

		const report = (node, rule, message) => {
			const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
			const entry = { file: relative, line, rule, message, reason: waivers.get(line) };
			(entry.reason ? waived : findings).push(entry);
		};

		// Names this module imports, and names bound to a kept() call. Both are
		// long-lived by construction, so a module-scope write to one is a write to
		// something a browser tab may be looking at.
		const longLived = new Set();
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
			) {
				longLived.add(node.name.text);
			}
		});

		// Removals first: an addition is judged against the removals in the module.
		const removals = [];
		walkModuleScope(source, (node) => {
			if (!ts.isCallExpression(node) || insideKept(node)) return;
			if (!ts.isPropertyAccessExpression(node.expression)) return;
			if (!REMOVE_LISTENER.has(node.expression.name.text)) return;
			const first = node.arguments[0];
			removals.push({
				receiver: node.expression.expression.getText(source),
				event: first && ts.isStringLiteral(first) ? first.text : null,
			});
		});

		walkModuleScope(source, (node) => {
			if (insideKept(node)) return;

			// An object built at evaluation time and replaced on every reload, while
			// whatever holds a reference to the old one carries on using it.
			if (ts.isNewExpression(node)) {
				const constructed = node.expression.getText(source);
				const root = constructed.split(".")[0];
				if (HARMLESS_CONSTRUCTORS.has(root) || constructed.endsWith('Error')) return;
				const name = declaredNameFor(node);
				// A container bound to a name nobody writes to is a lookup table.
				if (name && CONTAINERS.has(constructed) && !mutatedNames.has(name)) return;
				report(
					node,
					"new-at-module-scope",
					`\`new ${constructed}\` runs again on every reload, and the old one stays alive in ` +
						"whatever already holds it. Put it behind kept() if anything outlives the module.",
				);
				return;
			}

			// A literal at module scope that something writes to later is state, and
			// the reload silently rewinds it.
			if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
				const name = declaredNameFor(node);
				if (name && mutatedNames.has(name)) {
					report(
						node,
						"mutable-literal-at-module-scope",
						`\`${name}\` is written to elsewhere, so it holds state, and this rebuilds it empty ` +
							"on every reload. Put it behind kept().",
					);
				}
				return;
			}

			if (!ts.isCallExpression(node)) return;

			if (ts.isIdentifier(node.expression) && TIMERS.has(node.expression.text)) {
				report(
					node,
					"timer-at-module-scope",
					`\`${node.expression.text}\` at module scope starts another timer on every reload, ` +
						"and nothing stops the one before it.",
				);
				return;
			}

			if (!ts.isPropertyAccessExpression(node.expression)) return;
			const method = node.expression.name.text;
			const receiver = node.expression.expression.getText(source);

			if (ADD_LISTENER.has(method)) {
				const first = node.arguments[0];
				const event = first && ts.isStringLiteral(first) ? first.text : null;
				if (!pairedWithRemoval(receiver, event, removals) && !guardedByOnceFlag(node, source)) {
					report(
						node,
						"listener-at-module-scope",
						`\`${receiver}.${method}(${event ? `'${event}'` : "..."})\` adds a handler on every ` +
							"reload, so the next reload answers everything twice. Remove the old one first " +
							`(\`${receiver}.removeAllListeners(${event ? `'${event}'` : "..."})\`), or guard it ` +
							"with a flag that survives the reload.",
					);
				}
				return;
			}

			if (BINDERS.has(method) && node.arguments.length > 0) {
				if (!guardedByOnceFlag(node, source)) {
					report(
						node,
						"bind-at-module-scope",
						`\`${receiver}.${method}(...)\` binds on every reload. The second one fails on ` +
							"EADDRINUSE against this very process, or steals the first one's traffic.",
					);
				}
				return;
			}

			if (MUTATORS.has(method) && /^[A-Za-z_$][\w$]*$/.test(receiver) && longLived.has(receiver)) {
				if (!guardedByPresenceTest(node, receiver, source)) {
					report(
						node,
						"mutation-at-module-scope",
						`\`${receiver}.${method}(...)\` writes to long-lived state every time this module is ` +
							`evaluated, overwriting whatever a pane is looking at. Guard it ` +
							`(\`if (!${receiver}.has(...))\`) or move the write into kept().`,
					);
				}
			}
		});
	}

	return { findings, waived };
}

// ── Running it ────────────────────────────────────────────────────────────

/**
 * The rules, checked against source that is wrong on purpose.
 *
 * The two bugs TASK-057 found are in here as fixtures, because the argument
 * for this whole check is that those two were caught by reloading a live
 * server and looking. A rule that stops catching them should fail loudly, and
 * `reload-safe.ts` is the other half: every shape that is genuinely safe, so a
 * check that simply failed everything could not pass either.
 */
function selfTest() {
	const expected = [
		[
			"blanks-a-kept-board.ts",
			"mutation-at-module-scope",
			"TASK-057: re-running boards.set() blanked the scratch board under an open pane",
		],
		[
			"answers-every-message-twice.ts",
			"listener-at-module-scope",
			"TASK-057: a connection handler added rather than replaced answered every message twice",
		],
		[
			"starts-a-second-timer.ts",
			"timer-at-module-scope",
			"a timer started again on every reload, with nothing stopping the last one",
		],
		["binds-the-port-again.ts", "bind-at-module-scope", "a port bound again on every reload"],
		[
			"rewinds-a-mutable-literal.ts",
			"mutable-literal-at-module-scope",
			"state in a module-scope literal, rewound to its defaults by the reload",
		],
	];

	let failures = 0;
	const say = (ok, label) => {
		if (!ok) failures += 1;
		console.log(`${ok ? "ok  " : "FAIL"} - ${label}`);
	};

	for (const [name, rule, what] of expected) {
		const { findings } = analyze([path.join(fixtureDir, name)]);
		say(
			findings.some((f) => f.rule === rule),
			`${what} [${rule}]`,
		);
	}

	const safe = analyze([path.join(fixtureDir, "reload-safe.ts")]);
	say(
		safe.findings.length === 0,
		`reload-safe source passes${safe.findings.length ? `: ${safe.findings.map((f) => f.rule).join(", ")}` : ""}`,
	);
	say(safe.waived.length === 1, "and the one waived line is reported as waived, not as a pass");

	if (failures > 0) {
		console.error(
			`\n${failures} self-test failure${failures === 1 ? "" : "s"}: the rules no longer catch what they claim to.`,
		);
		process.exit(1);
	}
	console.log("module scope self-test: the rules catch every shape they claim to.");
}

if (process.argv.includes("--self-test")) {
	selfTest();
	process.exit(0);
}

const files = moduleGraph(ENTRIES);
const { findings, waived } = analyze(files);

for (const entry of waived) {
	console.log(`waived - ${entry.file}:${entry.line} ${entry.rule}: ${entry.reason}`);
}

if (findings.length === 0) {
	console.log(
		`module scope: ${files.length} modules in the canvas graph, ${waived.length} waived, ` +
			"no unwaived long-lived state.",
	);
	process.exit(0);
}

console.error("");
for (const entry of findings) {
	console.error(`FAIL - ${entry.file}:${entry.line} [${entry.rule}]`);
	console.error(`       ${entry.message}`);
}
console.error(
	`\n${findings.length} module-scope finding${findings.length === 1 ? "" : "s"} in ` +
		`${files.length} modules. Move the state behind kept() (src/core/hot.ts), guard the ` +
		"statement, or waive it with `// hot-safe: <reason>` if re-running it is genuinely harmless.",
);
process.exit(1);

// FALSE NEGATIVES, so nobody mistakes this for proof.
//
// It knows nothing about types, so it matches receivers by name: two different
// `boards` in two files are one name to it, and a container reached through a
// property (`state.boards.set(...)`) is not matched at all. It takes a
// `removeAllListeners` in the same module as evidence of replacement without
// checking the two run in that order, or on the same object. State created
// inside a function that a module-scope statement calls is invisible to it,
// and so is anything reached through a dynamic import, which it does not
// follow. `mutatedNames` is collected by bare identifier, so a write through
// an alias is missed.
//
// It is the first of two nets on purpose. The reload canary
// (src/core/reload-canary.ts) watches the live process afterwards, and it
// exists because this will miss things.
