import path from "node:path";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";

/**
 * The directory the frontend build writes to, at the root of the checkout whose source runs
 * (ADR 0014, `vite.config.ts`). The server serves this directory and nothing else of the build.
 */
const FRONTEND_DIRECTORY = path.join(SOURCE_CHECKOUT, "dist", "frontend");

export { FRONTEND_DIRECTORY };
