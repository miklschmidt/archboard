import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const packageRoot = path.join(repositoryRoot, "node_modules/@excalidraw/excalidraw");
const patchPath = path.join(repositoryRoot, "patches/@excalidraw%2Fexcalidraw@0.18.1.patch");
const declarationRoot = "dist/types/excalidraw";
const companions = [
	"app.scss.d.ts",
	"components/Button.scss.d.ts",
	"components/ContextMenu.scss.d.ts",
	"components/Sidebar/Sidebar.scss.d.ts",
	"components/Stats/Stats.scss.d.ts",
	"components/TTDDialog/TTDDialog.scss.d.ts",
	"components/dropdownMenu/DropdownMenu.scss.d.ts",
	"components/footer/FooterCenter.scss.d.ts",
	"components/live-collaboration/LiveCollaborationTrigger.scss.d.ts",
	"components/main-menu/DefaultItems.scss.d.ts",
	"components/welcome-screen/WelcomeScreen.scss.d.ts",
	"fonts/fonts.css.d.ts",
	"styles.scss.d.ts",
] as const;
const localeHash = "c8c9c8a50a14cd2d5c53703a273ce134608712f84335d9c4e2613b6d3b5bb6f5";

test("the pinned Excalidraw patch repairs only missing declaration assets", () => {
	const patch = readFileSync(patchPath, "utf8");
	const destinations = [...patch.matchAll(/^\+\+\+ b\/(.+)$/gmu)].map((match) => match[1]);
	expect(destinations).toEqual([
		...companions.slice(0, 11).map((file) => `${declarationRoot}/${file}`),
		`${declarationRoot}/en.json`,
		`${declarationRoot}/fonts/fonts.css.d.ts`,
		`${declarationRoot}/i18n.d.ts`,
		`${declarationRoot}/index.d.ts`,
		`${declarationRoot}/styles.scss.d.ts`,
	]);
	expect(patch).toContain('-import fallbackLangData from "./locales/en.json";');
	expect(patch).toContain('+import fallbackLangData from "./en.json";');
	expect(patch).toContain('-import "./css/app.scss";');
	expect(patch).toContain('+import "./app.scss";');
	expect(patch).toContain('-import "./css/styles.scss";');
	expect(patch).toContain('+import "./styles.scss";');
	for (const companion of companions) {
		expect(readFileSync(path.join(packageRoot, declarationRoot, companion), "utf8"), companion).toBe(
			"export {};\n",
		);
	}
	const locale = readFileSync(path.join(packageRoot, declarationRoot, "en.json"));
	expect(createHash("sha256").update(locale).digest("hex")).toBe(localeHash);
	const manifest = readFileSync(path.join(repositoryRoot, "package.json"), "utf8");
	const lock = readFileSync(path.join(repositoryRoot, "bun.lock"), "utf8");
	for (const source of [manifest, lock]) {
		expect(source).toContain('"@excalidraw/excalidraw@0.18.1"');
		expect(source).toContain('"patches/@excalidraw%2Fexcalidraw@0.18.1.patch"');
	}
	expect(lock).toContain(
		'"sha512-6i5Gt7IDTOH//qa0Z315Ly5iVRhjWpu2whrlQFqkuwrkKUWgRsMk0P5qdE7bpyDpai7jeLeWYkyj1eVAfni1lw=="',
	);
});
