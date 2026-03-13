export type {
  Severity,
  AgeBracket,
  EntityKind,
  GeoEntity,
} from "./entities/base";

export type { EventEntity } from "./entities/event";
export type { AssetEntity } from "./entities/asset";

export {
  SEVERITY_PRIORITY,
  SEVERITY_COLOR,
  SEVERITY_HEX,
  compareSeverity,
  maxSeverity,
} from "./entities/severity";

export type {
  // v1
  MapTheme,
  MapManifest,
  LayerManifest,
  LayerStyle,
  // v2
  MapFamily,
  ClassificationMethod,
  ClassificationConfig,
  ColorScheme,
  ColorConfig,
  NormalizationMethod,
  NormalizationConfig,
  LegendType,
  LegendConfig,
  InteractionConfig,
  PerformanceConfig,
  AccessibilityConfig,
  BasemapConfig,
  ManifestIntent,
  ManifestValidation,
  GeometryType,
  // v2: flow & isochrone
  TravelMode,
  FlowConfig,
  IsochroneConfig,
  IsochroneUnit,
} from "./manifest";

export { getAgeBracket, jitterCoordinates } from "./transforms";

export { COLOR_PALETTES, getColors } from "./palettes";
export { classify, type ClassBreaks } from "./classification";
