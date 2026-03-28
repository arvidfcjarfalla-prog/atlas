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
  BasemapStyle,
  BasemapConfig,
  ManifestIntent,
  ManifestValidation,
  GeometryType,
  // v2: flow & isochrone
  TravelMode,
  FlowConfig,
  IsochroneConfig,
  IsochroneUnit,
  // v2: creative rendering
  ImageFillConfig,
  ChartOverlayConfig,
  ChartOverlayType,
  ExtrusionConfig,
  AnimatedRouteConfig,
  TimelineConfig,
  // v2: hexbin + deck.gl families
  HexbinConfig,
  Hexbin3DConfig,
  ScreenGridConfig,
  TripConfig,
  // v2: transforms
  TransformType,
  TransformConfig,
  BufferTransform,
  VoronoiTransform,
  ConvexHullTransform,
  CentroidTransform,
  SimplifyTransform,
  DissolveTransform,
} from "./manifest";

export { getAgeBracket, jitterCoordinates } from "./transforms";

export { COLOR_PALETTES, getColors } from "./palettes";
export { classify, type ClassBreaks } from "./classification";
