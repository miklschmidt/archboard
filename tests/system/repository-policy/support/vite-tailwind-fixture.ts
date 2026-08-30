import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ViteTailwindFixture = {
	root: string;
	projectRoot: string;
	sourceRoot: string;
	outputRoot: string;
	dispose: () => Promise<void>;
};

export function toPosixSpecifier(value: string): string {
	return value.replaceAll("\\", "/");
}

export async function createViteTailwindFixture(
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
): Promise<ViteTailwindFixture> {
	const root = await mkdtemp(join(parent, "archboard-vite-tailwind-"));
	const fixture: ViteTailwindFixture = {
		root,
		projectRoot: join(root, "project"),
		sourceRoot: join(root, "source with spaces"),
		outputRoot: join(root, "output"),
		dispose: async () => rm(root, { recursive: true, force: true }),
	};
	try {
		await symlink(join(dependenciesRoot, "node_modules"), join(root, "node_modules"), "dir");
		await mkdir(join(fixture.projectRoot, "frontend"), { recursive: true });
		await mkdir(join(fixture.sourceRoot, "nested"), { recursive: true });
		return fixture;
	} catch (error) {
		await fixture.dispose();
		throw error;
	}
}

export async function writeViteTailwindFixture(fixture: ViteTailwindFixture): Promise<void> {
	await writeFile(
		join(fixture.projectRoot, "frontend/index.html"),
		'<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>',
	);
	await writeFile(
		join(fixture.projectRoot, "frontend/main.ts"),
		`import "@/app.css";\nimport { fixtureClassName } from "@/nested/source.ts";\ndocument.body.className = fixtureClassName;\n`,
	);
	await writeFile(
		join(fixture.sourceRoot, "nested/source.ts"),
		'export const fixtureClassName = "bg-red-500";\n',
	);
	await writeFile(
		join(fixture.sourceRoot, "app.css"),
		`@import "tailwindcss";\n@source "./${toPosixSpecifier("nested/source.ts")}";\n`,
	);
}

export async function withViteTailwindFixture<T>(
	callback: (fixture: ViteTailwindFixture) => Promise<T>,
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
): Promise<T> {
	const fixture = await createViteTailwindFixture(parent, dependenciesRoot);
	try {
		return await callback(fixture);
	} finally {
		await fixture.dispose();
	}
}
