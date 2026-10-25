#!/usr/bin/env bun
// The on-demand skill evaluation. Not part of `bun run check`: every author
// run and the grading session call a model, and a human decides when that
// happens. See evals/README.md, and `bun run eval:skill --help` for the
// commands.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runEvaluationCommand } from "@archboard/skills/evaluation";

await runEvaluationCommand(process.argv, join(dirname(fileURLToPath(import.meta.url)), ".."));
