import path from "path";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";

/**
 * The `src/` directory this server is running from. Asset resolution stays
 * anchored where the former root application module lived, so moving the
 * implementation changed no dist or dependency path.
 */
const moduleDir = path.join(SOURCE_CHECKOUT, "src");

/** The repository checkout that owns this server: the parent of `src/`. */
const checkoutRoot = SOURCE_CHECKOUT;

export { checkoutRoot, moduleDir };
