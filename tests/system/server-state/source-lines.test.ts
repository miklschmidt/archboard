// The source excerpt of remembered code evidence (TASK-590.06, ADR 0046 amendment of
// 2026-11-07). `GET /api/code/source-lines` answers the evidence line with up to 3 lines on
// each side, only for a place that a finding the server remembers names, only from a file
// inside its checkout that Git does not ignore, and only to a page of the server's origin.
//
// A real code pass over a small Python checkout fills the memory: Orders calls Mail, and no
// relationship draws it, so the finding's evidence names the call in Orders.

import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CodeCheckAnswerSchema, CodeSourceLinesSchema } from "@archboard/code-intel/code-check";
import { seedCanonicalFixture } from "../support/canonical-fixture.ts";
import { vaultUrl } from "../support/http.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";

const SHOP = "github.com/acme/shop";
const ORDERS = "src/shop/orders.py";
const ORDERS_LINES = [
	"from shop.mail import send",
	"",
	"",
	"def place(order):",
	"    total = order",
	"    receipt = total",
	"    return send(receipt)",
	"",
	"",
	"def cancel(order):",
	"    return None",
];

const root = realpathSync(mkdtempSync(join(tmpdir(), "archboard-source-lines-")));
const checkout = join(root, "shop");
const vault = vaultIn(checkout);
let server: OwnedServer;
/** The place that the evidence of the remembered finding names. */
let place: { repo: string; path: string; line: number };

/**
 * Write files below a directory.
 * @param directory The directory.
 * @param files Each file's path below it, and its text.
 */
function write(directory: string, files: Readonly<Record<string, string>>): void {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(dirname(join(directory, file)), { recursive: true });
		writeFileSync(join(directory, file), text);
	}
}

/**
 * Run Git in the checkout, with no configuration of this machine.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	const ran = Bun.spawnSync(["git", "-C", checkout, ...args], {
		env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
	});
	if (ran.exitCode !== 0) throw new Error(ran.stderr.toString());
}

/**
 * Ask for the source excerpt of a place, as a page of the server's own origin does.
 * @param asked The place.
 * @param headers The browser headers of the request.
 * @returns The status and the body's text.
 */
async function sourceLines(
	asked: typeof place,
	headers: Record<string, string> = { Referer: `${server.base}/`, "Sec-Fetch-Site": "same-origin" },
): Promise<{ status: number; text: string }> {
	const query = new URLSearchParams({ ...asked, line: String(asked.line) });
	const response = await fetch(vaultUrl(server, `/api/code/source-lines?${query}`), { headers });
	return { status: response.status, text: await response.text() };
}

beforeAll(async () => {
	write(checkout, {
		"src/shop/__init__.py": "",
		"src/shop/mail.py": "def send(order):\n    return order\n",
		[ORDERS]: `${ORDERS_LINES.join("\n")}\n`,
		".gitignore": "ignored/\n",
		"ignored/secret.py": "API_KEY = 'ignored secret'\n",
	});
	write(root, { "outside/secret.py": "API_KEY = 'outside secret'\n" });
	seedCanonicalFixture(vault, "Shop", [
		{ name: "Orders", kind: "service", binding: { repo: SHOP, path: ORDERS } },
		{ name: "Mail", kind: "service", binding: { repo: SHOP, path: "src/shop/mail.py" } },
	]);
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	git("add", "-A");
	git("-c", "user.name=Shop", "-c", "user.email=shop@example.test", "commit", "-q", "-m", "shop");
	server = await startOwnedServer({
		serverPath: resolve(import.meta.dir, "../../../apps/server/src/server.ts"),
		vault,
	});
	const checked = await fetch(vaultUrl(server, "/api/vault/code-check"));
	const answer = CodeCheckAnswerSchema.parse(await checked.json());
	const evidence = answer.findings
		.flatMap((finding) => finding.evidence ?? [])
		.find((piece) => piece.path === ORDERS);
	if (evidence === undefined)
		throw new Error(`No evidence in ${ORDERS}: ${JSON.stringify(answer)}`);
	place = { repo: evidence.repo, path: evidence.path, line: evidence.line };
});

afterAll(async () => {
	await server?.dispose();
	rmSync(root, { recursive: true, force: true });
});

test("a remembered evidence place answers its line with up to 3 lines on each side", async () => {
	const { status, text } = await sourceLines(place);
	expect(status).toBe(200);
	const first = Math.max(1, place.line - 3);
	expect(CodeSourceLinesSchema.parse(JSON.parse(text))).toEqual({
		...place,
		first,
		lines: ORDERS_LINES.slice(first - 1, place.line + 3),
	});
});

test("a place that no remembered finding names is a 404 that quotes nothing", async () => {
	for (const asked of [
		{ ...place, line: place.line + 1 },
		{ ...place, path: "src/shop/mail.py", line: 1 },
		{ ...place, path: "../outside/secret.py", line: 1 },
	]) {
		const { status, text } = await sourceLines(asked);
		expect(status).toBe(404);
		expect(JSON.parse(text)).toMatchObject({ success: false, code: "EVIDENCE_NOT_REMEMBERED" });
		expect(text).not.toContain("secret'");
	}
});

test("an evidence file that now leads outside its checkout or to an ignored file is refused", async () => {
	const file = join(checkout, ORDERS);
	renameSync(file, `${file}.kept`);
	try {
		for (const target of [join(root, "outside/secret.py"), join(checkout, "ignored/secret.py")]) {
			rmSync(file, { force: true });
			symlinkSync(target, file);
			const { status, text } = await sourceLines(place);
			expect(status).toBe(404);
			expect(JSON.parse(text)).toMatchObject({ success: false, code: "SOURCE_REFUSED" });
			expect(text).not.toContain("secret'");
		}
	} finally {
		rmSync(file, { force: true });
		renameSync(`${file}.kept`, file);
	}
});

test("only a page of the server's own origin reads the source", async () => {
	for (const headers of [
		{ Origin: "https://example.com", "Sec-Fetch-Site": "cross-site" },
		{ Referer: "https://example.com/", "Sec-Fetch-Site": "cross-site" },
		// A request with no browser headers does not prove a page of this origin.
		{},
	]) {
		const { status, text } = await sourceLines(place, headers);
		expect(status).toBe(403);
		expect(JSON.parse(text)).toMatchObject({ success: false, code: "CROSS_ORIGIN_REFUSED" });
		expect(text).not.toContain("send(receipt)");
	}
});
