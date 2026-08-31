import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const entrypoint = path.join(repoRoot, "src/ui/button/index.tsx");
const frontendConfig = path.join(repoRoot, "tsconfig.frontend.json");

function compileTypeContract(): ReturnType<typeof spawnSync> {
	const temporaryRoot = fs.mkdtempSync(path.join(repoRoot, ".task-14420-button-types-"));
	const contractPath = path.join(temporaryRoot, "contract.tsx");
	const configPath = path.join(temporaryRoot, "tsconfig.json");
	const contract = `
import { createElement, createRef, type Ref } from "react";
import * as publicApi from ${JSON.stringify(entrypoint)};
import { Button, type ButtonProps } from ${JSON.stringify(entrypoint)};

const ref = createRef<HTMLElement>();
const accepted = {
	tone: "secondary",
	size: "icon",
	disabled: true,
	focusableWhenDisabled: true,
	nativeButton: false,
	ref,
	render: createElement("div"),
	className: (state) => (state.disabled ? "border-warning" : undefined),
	style: (state) => ({ opacity: state.disabled ? 0.5 : 1 }),
	children: "Inspect",
	type: "submit",
	form: "settings",
	"aria-label": "Inspect settings",
	"data-owner": "archboard",
	onClick: (event) => event.preventBaseUIHandler(),
	onKeyDown: (event) => event.preventBaseUIHandler(),
	onPointerDown: (event) => event.preventBaseUIHandler(),
} satisfies ButtonProps;
createElement(Button, accepted);

const allTones = [
	{ tone: "primary" },
	{ tone: "secondary" },
	{ tone: "quiet" },
] satisfies ButtonProps[];
const allSizes = [
	{ tone: "primary", size: "control" },
	{ tone: "primary", size: "icon" },
] satisfies ButtonProps[];

// @ts-expect-error The Archboard tone is required.
const missingTone: ButtonProps = {};
// @ts-expect-error Unknown tones cannot enter the static class map.
const unknownTone: ButtonProps = { tone: "danger" };
// @ts-expect-error Stock shadcn variants are not part of the owned API.
const stockVariant: ButtonProps = { tone: "primary", variant: "outline" };
// @ts-expect-error Stock shadcn sizes are not part of the owned API.
const stockSize: ButtonProps = { tone: "primary", size: "sm" };
// @ts-expect-error No class recipe or helper is public.
void publicApi.buttonClassName;

declare const polymorphicProps: ButtonProps;
const requiresButtonRef = (_props: { ref?: Ref<HTMLButtonElement> }) => undefined;
// @ts-expect-error A render replacement may attach the forwarded ref to any HTMLElement.
requiresButtonRef(polymorphicProps);

void allTones;
void allSizes;
void missingTone;
void unknownTone;
void stockVariant;
void stockSize;
`;
	const config = {
		extends: frontendConfig,
		compilerOptions: { noEmit: true },
		files: [contractPath],
	};

	try {
		fs.writeFileSync(contractPath, contract);
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`);
		return spawnSync("bunx", ["tsc", "--noEmit", "-p", configPath], {
			cwd: repoRoot,
			encoding: "utf8",
		});
	} finally {
		fs.rmSync(temporaryRoot, { recursive: true, force: true });
	}
}

describe("button compile-time contract", () => {
	test("accepts the owned API and rejects generated or unsafe polymorphic assumptions", () => {
		const result = compileTypeContract();
		expect(result.status, String(result.stdout) + String(result.stderr)).toBe(0);
	});
});
