import { fileURLToPath } from "node:url";

/** The stylesheet that holds the colours of both themes, which the shell and the pictures share. */
const THEME_STYLESHEET = fileURLToPath(new URL("../../../assets/theme.css", import.meta.url));

export { THEME_STYLESHEET };
