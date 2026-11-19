// A vault's configuration: the semantic policy, with the icons it names held to
// the ones this installation carries.

import { z } from "zod";
import { INSTALLED_ICONS } from "#installed-icons";
import { createSemanticPolicySchema } from "#shared/schemas/semantic-policy.ts";

const VaultConfigurationSchema = createSemanticPolicySchema(
	z.enum(INSTALLED_ICONS, {
		error: "Use an installed RemixIcon export name, for example RiServerLine",
	}),
);

export { VaultConfigurationSchema };
