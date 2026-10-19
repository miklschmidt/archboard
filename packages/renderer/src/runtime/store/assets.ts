import { fileURLToPath } from "node:url";

/** The diagram font files and the licence texts beside them: the faces a picture is measured and drawn in. */
const DIAGRAM_FONTS_DIRECTORY = fileURLToPath(new URL("../../../assets/fonts/", import.meta.url));

/** The stylesheet that holds the colours of both themes, which the shell and the pictures share. */
const THEME_STYLESHEET = fileURLToPath(new URL("../../../assets/theme.css", import.meta.url));

export { DIAGRAM_FONTS_DIRECTORY, THEME_STYLESHEET };
