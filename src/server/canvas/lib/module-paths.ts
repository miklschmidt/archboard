import path from "path";
import { fileURLToPath } from "url";

const moduleFile = fileURLToPath(import.meta.url);

/**
 * The `src/` directory this canvas is running from. Asset resolution stays
 * anchored where the former root application module lived, so moving the
 * implementation into `src/server/canvas/lib` changed no dist or dependency path.
 */
const moduleDir = path.resolve(path.dirname(moduleFile), "../../..");

/** The repository checkout that owns this canvas: the parent of `src/`. */
const checkoutRoot = path.resolve(moduleDir, "..");

export { checkoutRoot, moduleDir };
