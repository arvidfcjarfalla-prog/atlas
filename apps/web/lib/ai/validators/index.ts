import type { MapManifest, ManifestValidation } from "@atlas/data-models";
import type { DatasetProfile } from "../types";
import { validateSchema } from "./schema";
import { validateCartographic } from "./cartographic";

/** Run all validation passes and merge results. */
export function validateManifest(
  manifest: MapManifest,
  profile?: DatasetProfile | null,
): ManifestValidation {
  const schema = validateSchema(manifest);
  const cartographic = validateCartographic(manifest, profile);

  return {
    valid: schema.valid && cartographic.valid,
    errors: [...schema.errors, ...cartographic.errors],
    warnings: [...schema.warnings, ...cartographic.warnings],
  };
}

export { validateSchema } from "./schema";
export { validateCartographic } from "./cartographic";
