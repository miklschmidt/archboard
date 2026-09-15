// Model-free owners of attachment delivery: no author or model is started.
import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	fileImageReceipt,
	graderArgv,
	imagesForRun,
	suppliedCaptures,
} from "@/runtime/skill-evaluation/audit";
import { loadSuite } from "@/runtime/skill-evaluation";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const run = "run-0123456789";
const loaded = loadSuite(path.join(import.meta.dir, "../../../..", "evals"));
// These bytes exercise only the PNG header/dimensions preflight. Codex's
// image decoder owns complete decoding and a failed call produces no receipt.
const png = (width = 1, height = 1) => {
	const bytes = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=",
		"base64",
	);
	bytes.writeUInt32BE(width, 16);
	bytes.writeUInt32BE(height, 20);
	return bytes;
};

function fixture(width = 1) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-grade-images-"));
	roots.push(root);
	const workspace = path.join(root, "grader/workspace");
	const directory = path.join(workspace, "runs", run);
	fs.mkdirSync(path.join(directory, "captures"), { recursive: true });
	const image = path.join(directory, "captures/main.png");
	fs.writeFileSync(image, png(width));
	const capture = {
		label: "overview",
		ok: true,
		file: "captures/main.png",
		provenance: { width, height: 1 },
		tiles:
			width === 1
				? []
				: [
						{ x: 0, y: 0, width: 1600, height: 1, file: "captures/left.png" },
						{ x: 1600, y: 0, width: width - 1600, height: 1, file: "captures/right.png" },
					],
	};
	for (const tile of capture.tiles)
		fs.writeFileSync(path.join(directory, tile.file), png(tile.width));
	const bundle = path.join(directory, "bundle.json");
	fs.writeFileSync(bundle, JSON.stringify({ captures: [capture] }));
	const verdict = path.join(root, "grader/verdicts", `${run}.json`);
	fs.mkdirSync(path.dirname(verdict), { recursive: true });
	fs.writeFileSync(verdict, JSON.stringify({ run, summary: "answer" }));
	return { root, workspace, directory, image, bundle, capture, verdict };
}

test("every initial and resumed grading argv attaches the full image and all native tiles", () => {
	const f = fixture(1601);
	const images = imagesForRun(f.workspace, run);
	expect(images.suppliedCaptures).toEqual(["overview"]);
	expect(images.images).toHaveLength(3);
	const paths = {
		root: path.join(f.root, "grader"),
		workspace: f.workspace,
		codexHome: path.join(f.root, "home"),
		verdicts: path.dirname(f.verdict),
		session: path.join(f.root, "session.json"),
		schema: path.join(f.root, "schema.json"),
	};
	const prompt = path.join(f.root, "prompt.md");
	fs.writeFileSync(prompt, "Grade the attached diagrams");
	const options = {
		batchRoot: f.root,
		checkout: f.root,
		cache: f.root,
		loaded,
		chunkSize: 1,
		signal: new AbortController().signal,
		log: () => {},
	};
	for (const thread of [null, "existing-thread"]) {
		const argv = graderArgv(options, paths, thread, {
			prompt,
			verdict: f.verdict,
			images: [images],
		});
		const attached = argv.flatMap((arg, index) => (arg === "--image" ? [argv[index + 1]] : []));
		expect(attached).toEqual(images.images.map((image) => path.join(f.workspace, image.file)));
		expect(argv.includes("resume")).toBe(thread !== null);
	}
});

test("missing, unreadable, wrong-sized images and absent native tiles cannot qualify a capture", () => {
	const f = fixture(1601);
	fs.unlinkSync(path.join(f.directory, "captures/right.png"));
	expect(imagesForRun(f.workspace, run).suppliedCaptures).toEqual([]);
	fs.writeFileSync(path.join(f.directory, "captures/right.png"), png());
	fs.writeFileSync(
		f.bundle,
		JSON.stringify({ captures: [{ ...f.capture, tiles: f.capture.tiles.slice(0, 1) }] }),
	);
	expect(imagesForRun(f.workspace, run).suppliedCaptures).toEqual([]);
	const small = fixture();
	for (const content of [Buffer.from("unreadable"), png(2)]) {
		fs.writeFileSync(small.image, content);
		const images = imagesForRun(small.workspace, run);
		expect(images.suppliedCaptures).toEqual([]);
		expect(images.failures).toHaveLength(1);
	}
});

test("delivery receipts belong to the successful call's exact images and verdict", () => {
	const f = fixture();
	const images = imagesForRun(f.workspace, run);
	expect(suppliedCaptures(f.root, run)).toEqual([]);
	fileImageReceipt(f.verdict, images);
	expect(suppliedCaptures(f.root, run)).toEqual(["overview"]);
	fs.appendFileSync(f.image, "changed");
	expect(suppliedCaptures(f.root, run)).toEqual([]);
	fs.writeFileSync(f.image, png());
	fs.appendFileSync(f.verdict, " ");
	expect(suppliedCaptures(f.root, run)).toEqual([]);
	fileImageReceipt(f.verdict, images);
	expect(suppliedCaptures(f.root, run)).toEqual(["overview"]);
	fileImageReceipt(f.verdict, null);
	expect(suppliedCaptures(f.root, run)).toEqual([]);
});
