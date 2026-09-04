import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const moduleRoot = path.resolve(import.meta.dirname, "..");
const themePath = path.resolve(moduleRoot, "../theme/app.css");

function productSources(): readonly string[] {
	return readdirSync(moduleRoot, { recursive: true, withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				[".ts", ".tsx"].includes(path.extname(entry.name)) &&
				!path.relative(moduleRoot, entry.parentPath).startsWith("tests"),
		)
		.map((entry) => path.join(entry.parentPath, entry.name));
}

const SOURCES = productSources().map((file) => ({
	file: path.relative(moduleRoot, file),
	text: readFileSync(file, "utf8"),
}));

/**
 * Names that would mean this module had reached past its adapter: a media
 * resource of its own, a protocol state machine of its own, a second owner, or
 * a chat framework nothing here needs.
 */
const FORBIDDEN = [
	"getUserMedia",
	"RTCPeerConnection",
	"RTCDataChannel",
	"MediaStream",
	"MediaStreamTrack",
	"AudioContext",
	"AnalyserNode",
	"createDataChannel",
	"setLocalDescription",
	"setRemoteDescription",
	"createOffer",
	"attachRemoteMedia",
	"transitionRealtimeState",
	"createRealtimeMediaSession",
	"createBrowserWorkbenchMediaOwner",
	"createBrowserWorkbenchTransport",
	"createVoiceSession",
	"@assistant-ui",
	"requestAnimationFrame",
] as const;

/** Utilities whose value must be a semantic name the canonical theme defines. */
const TOKEN_FAMILIES = ["bg", "text", "border", "outline", "fill", "stroke", "ring"] as const;

/** Non-colour utilities that share those prefixes. */
const STRUCTURAL = new Set([
	"text-center",
	"text-left",
	"text-right",
	"text-nowrap",
	"border",
	"border-0",
	"border-t",
	"border-b",
	"border-l",
	"border-r",
	"outline-none",
	"outline-solid",
	"outline-2",
	"outline-offset-2",
	"fill-none",
	"bg-transparent",
	"border-transparent",
]);

function themeNames(): ReadonlySet<string> {
	const css = readFileSync(themePath, "utf8");
	const names = new Set<string>();
	for (const match of css.matchAll(
		/--(?:color|text|font|radius|spacing|shadow|opacity)-([\w-]+):/gu,
	))
		names.add(match[1]!);
	return names;
}

function classTokens(): readonly { readonly file: string; readonly token: string }[] {
	const found: { file: string; token: string }[] = [];
	for (const { file, text } of SOURCES) {
		for (const match of text.matchAll(/"([^"\n]*?)"/gu)) {
			const value = match[1] ?? "";
			// Only strings that look like utility lists; a sentence has no dashes
			// and a class list has no full stops.
			if (!/^[\w\s!:&[\]/.\-#]+$/u.test(value) || value.includes(". ")) continue;
			for (const raw of value.split(/\s+/u)) {
				const token = raw.replace(/^!/u, "").split(":").at(-1) ?? "";
				if (token.length > 0) found.push({ file, token });
			}
		}
	}
	return found;
}

describe("voice control boundaries", () => {
	test("finds the module's own product sources", () => {
		expect(SOURCES.map((source) => source.file).toSorted()).toEqual([
			"contract.ts",
			"index.tsx",
			"lib/VoiceControls.tsx",
			"lib/VoiceGlyph.tsx",
			"lib/VoiceLevelMeter.tsx",
			"lib/projection.ts",
			"lib/reduced-motion.ts",
		]);
	});

	test("owns no media resource and constructs no owner", () => {
		for (const { file, text } of SOURCES)
			for (const name of FORBIDDEN) expect(text, `${file} names ${name}`).not.toContain(name);
	});

	test("exposes no raw media, protocol, or transport object through its contract", () => {
		const contract = SOURCES.find((source) => source.file === "contract.ts")!.text;
		// The contract's only imports are the presentation adapter's plain values.
		const imports = [...contract.matchAll(/from "([^"]+)"/gu)].map((match) => match[1]);
		expect(imports).toEqual(["../voice-session/index.js"]);
		for (const name of ["RealtimeMediaSnapshot", "RealtimeState", "BrowserSnapshot", "MediaStream"])
			expect(contract, name).not.toContain(name);
	});

	test("styles itself only with names the canonical theme defines", () => {
		const names = themeNames();
		const offend = (token: string): boolean => {
			if (STRUCTURAL.has(token)) return false;
			const family = TOKEN_FAMILIES.find((prefix) => token.startsWith(`${prefix}-`));
			if (family === undefined) return false;
			return !names.has(token.slice(family.length + 1));
		};
		const scanned = classTokens();
		const inspected = scanned.filter(({ token }) =>
			TOKEN_FAMILIES.some((prefix) => token.startsWith(`${prefix}-`)),
		);
		// The scan is only worth anything if it is reading real utilities.
		expect(inspected.length).toBeGreaterThan(10);
		expect(new Set(inspected.map((entry) => entry.token))).toContain("text-muted-foreground");
		// And only if a framework default would fail it.
		expect(["bg-blue-500", "text-slate-700", "border-red-200"].filter(offend)).toHaveLength(3);

		const offenders = scanned
			.filter(({ token }) => offend(token))
			.map(({ file, token }) => `${file}: ${token}`);
		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	test("writes no raw colour and no arbitrary visual value", () => {
		for (const { file, text } of SOURCES) {
			expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
			expect(text, file).not.toMatch(/\b(?:rgb|rgba|hsl|oklch)\(/u);
			// An arbitrary Tailwind value is a second visual authority.
			expect(text, file).not.toMatch(/\b(?:bg|text|border|p|m|gap|h|w)-\[/u);
		}
	});
});
