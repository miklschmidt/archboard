// Print the diagram theme colours as JSON, for the browser build.
//
// The colours are parsed out of src/shared/theme/theme.css with lightningcss,
// which a browser cannot run, so vite.config.ts runs this once per build and
// hands the page the result. One parser, one answer, for Bun and the browser.

import { readFileSync } from "node:fs";

import { readThemeColors } from "@/shared/theme/server";

const css = readFileSync(new URL("../src/shared/theme/theme.css", import.meta.url), "utf8");
process.stdout.write(JSON.stringify(readThemeColors(css)));
