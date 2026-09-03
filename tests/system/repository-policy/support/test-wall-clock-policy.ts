const DECLARATION = "declareTestWallClockBudget";

export interface TestWallClockPolicyInput {
	readonly bunfig: string;
	readonly sources: ReadonlyMap<string, string>;
}

function declarationBodies(source: string): string[] {
	const bodies: string[] = [];
	const starts: number[] = [];
	let quote: '"' | "'" | "`" | undefined;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		const next = source[index + 1];
		if (lineComment) {
			if (character === "\n") lineComment = false;
			continue;
		}
		if (blockComment) {
			if (character === "*" && next === "/") {
				blockComment = false;
				index += 1;
			}
			continue;
		}
		if (escaped) {
			escaped = false;
			continue;
		}
		if (quote) {
			if (character === "\\") escaped = true;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "/" && next === "/") {
			lineComment = true;
			index += 1;
			continue;
		}
		if (character === "/" && next === "*") {
			blockComment = true;
			index += 1;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (source.startsWith(`${DECLARATION}({`, index)) starts.push(index);
	}
	for (const cursor of starts) {
		const start = cursor + DECLARATION.length + 1;
		let depth = 0;
		let bodyQuote: '"' | "'" | "`" | undefined;
		let bodyEscaped = false;
		for (let index = start; index < source.length; index += 1) {
			const character = source[index];
			if (bodyEscaped) {
				bodyEscaped = false;
				continue;
			}
			if (character === "\\" && bodyQuote) {
				bodyEscaped = true;
				continue;
			}
			if (bodyQuote) {
				if (character === bodyQuote) bodyQuote = undefined;
				continue;
			}
			if (character === '"' || character === "'" || character === "`") {
				bodyQuote = character;
				continue;
			}
			if (character === "{") depth += 1;
			if (character !== "}") continue;
			depth -= 1;
			if (depth !== 0) continue;
			bodies.push(source.slice(start, index + 1));
			break;
		}
		if (depth !== 0) {
			bodies.push(source.slice(start));
			break;
		}
	}
	return bodies;
}

function hasNonemptyString(body: string, field: string): boolean {
	return new RegExp(`\\b${field}\\s*:\\s*(["'\\x60])(?:(?!\\1).)+\\1`, "s").test(body);
}

function stringField(body: string, field: string): string | undefined {
	const match = new RegExp(`\\b${field}\\s*:\\s*(["'])(.*?)\\1`, "s").exec(body);
	return match?.[2];
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function inspectTestWallClockPolicy(input: TestWallClockPolicyInput): string[] {
	const errors: string[] = [];
	if (
		!/\[test\][\s\S]*?\bpreload\s*=\s*\[[^\]]*["']\.\/tests\/test-preload\.ts["']/.test(
			input.bunfig,
		)
	) {
		errors.push("bunfig.toml must preload ./tests/test-preload.ts for every native Bun test lane");
	}
	for (const [file, source] of input.sources) {
		for (const body of declarationBodies(source)) {
			if (!/(?:^|\/)\w[^/]*(?:\.|_)(?:test|spec)\.ts$/.test(file)) {
				errors.push(`${file}: wall-clock declarations must live in the test owner they approve`);
			}
			for (const field of ["test", "reason", "evidence"])
				if (!hasNonemptyString(body, field))
					errors.push(`${file}: wall-clock declaration needs a non-empty ${field} string`);
			const testName = stringField(body, "test");
			if (
				testName &&
				!new RegExp(`\\btest\\s*\\(\\s*(["'])${escapeRegExp(testName)}\\1`).test(source)
			)
				errors.push(`${file}: wall-clock declaration must name a test in the same owner`);
			if (!/\bouterBoundMs\s*:\s*TEST_[A-Z0-9_]+\b/.test(body))
				errors.push(`${file}: wall-clock declaration outerBoundMs must name a TEST_* constant`);
			if (!/\btask\s*:\s*["']TASK-\d+(?:\.\d+)*["']/.test(body))
				errors.push(`${file}: wall-clock declaration needs a TASK-* reference`);
		}
	}
	return errors;
}
