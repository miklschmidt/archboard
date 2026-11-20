// Measures every fixture and readings of this repository's model on the scorecard a layout change
// is judged by (packages/renderer/tests/runtime/support/drawn-scorecard.ts): fit,
// page area, how much of the page is card, route length, bends, crossings,
// margin-lane ink, flank fan, how far a label sits from the line it names, the
// corridors two routes share and the two
// invariants. No single measure decides a comparison; layout tasks
// record the numbers it prints. A fixture is any `*.content.json` beside this
// file; the readings are the whole model of `.archboard/vault` and each module
// that holds parts (items.ts).
//
// Run from the repository root:
//   bun packages/renderer/tests/runtime/support/wide-boards/measure.ts [outdir]
//
// SAVE=run.json      also write this run's scorecards
// AGAINST=run.json   compare this run with a saved one, measure by measure
// ALL=1              also measure the readings of every proposal, not only the current state
// ENGINE=track       lay every picture out with this engine, not the default one
// PICTURES=1         write a PNG of each drawing to outdir (default .skill-evals/repro)
//
// A layout experiment is compared by saving a run on the tree as it is, then
// running again with the experiment applied and AGAINST pointing at the save.
import fs from "node:fs";
import path from "node:path";
import { defaultLayoutEngine } from "@archboard/model-contract";
import { shell } from "@archboard/renderer/shell-geometry";
import { rasterizeAll } from "@archboard/raster";
import { renderArchitecture } from "@archboard/renderer/bun";
import { fixtureDocument } from "../model-documents.ts";
import { scorecardOf, verdictOf, type Measure } from "../drawn-scorecard.ts";
import { wideBoardItems } from "./items.ts";

const out = process.argv[2] ?? ".skill-evals/repro";
const every = process.env["ALL"] === "1";
const layout = fixtureDocument("layoutEngine", process.env["ENGINE"] ?? defaultLayoutEngine());
const pictures = process.env["PICTURES"] === "1";
const save = process.env["SAVE"];
const against = process.env["AGAINST"];

/** One document's saved result. */
interface Result {
  readonly page: string;
  readonly reads: string;
  readonly measures: Measure[];
}

const items = await wideBoardItems(every);

/**
 * A measure's value as the scorecard prints it.
 * @param measure The measure.
 * @returns The printed value.
 */
function shown(measure: Measure): string {
  return measure.value.toFixed(measure.digits);
}

const saved: Record<string, Result> =
  against === undefined ? {} : JSON.parse(fs.readFileSync(against, "utf8"));
const results: Record<string, Result> = {};

console.log(`reference pane ${shell("referencePane").width}x${shell("referencePane").height}`);
let header = false;
/** The key of each drawing yielded for a picture and not yet written, oldest first. */
const keys: string[] = [];

/**
 * Measure each item and print its row, yielding each drawing for its picture.
 * @yields {{ svg: string; width: number; height: number; scale: number }} The drawing to capture.
 */
async function* measured() {
  for (const item of items) {
    const { content } = item;
    const drawn = await renderArchitecture({
      content,
      theme: "light",
      layout,
      policy: item.policy,
    });
    const key = `${item.name} ${item.variant}`;
    const measures = scorecardOf(drawn, content);
    const reads = drawn.readingDirection ?? "-";
    const page = `${Math.round(drawn.width)}x${Math.round(drawn.height)}`;
    results[key] = { page, reads, measures };
    if (!header) {
      console.log(
        ["document", "reads", "page", ...measures.map((measure) => measure.name)].join(" | "),
      );
      header = true;
    }
    console.log([key, reads, page, ...measures.map(shown)].join(" | "));
    keys.push(key);
    yield { svg: drawn.svg, width: drawn.width, height: drawn.height, scale: 1 };
  }
}

if (pictures) {
  fs.mkdirSync(out, { recursive: true });
  // Each picture is written before the next drawing is measured.
  for await (const shot of rasterizeAll(measured())) {
    const key = keys.shift()!;
    fs.writeFileSync(path.join(out, `${key.replace(/[^A-Za-z0-9]+/g, "-")}.png`), shot.png);
  }
} else {
  for await (const _drawing of measured());
}

if (save !== undefined) fs.writeFileSync(save, JSON.stringify(results, null, "\t"));

if (against !== undefined) {
  console.log(`\ncompared with ${against}, measure by measure`);
  for (const [key, result] of Object.entries(results)) {
    const before = saved[key];
    if (before === undefined) {
      console.log(`${key}: not in the saved run`);
      continue;
    }
    const moved: string[] = [];
    const counts = { better: 0, worse: 0 };
    result.measures.forEach((measure, index) => {
      const previous = before.measures[index]!;
      const verdict = verdictOf(previous, measure);
      if (verdict === "same") return;
      if (verdict === "better" || verdict === "worse") counts[verdict] += 1;
      moved.push(`${measure.name} ${shown(previous)} -> ${shown(measure)} ${verdict}`);
    });
    const pageNote = before.page === result.page ? "" : ` page ${before.page} -> ${result.page};`;
    const readNote =
      before.reads === result.reads ? "" : ` reads ${before.reads} -> ${result.reads};`;
    console.log(
      moved.length === 0 && pageNote === "" && readNote === ""
        ? `${key}: unchanged`
        : `${key}: ${counts.better} better, ${counts.worse} worse;${readNote}${pageNote} ${moved.join("; ")}`,
    );
  }
}
