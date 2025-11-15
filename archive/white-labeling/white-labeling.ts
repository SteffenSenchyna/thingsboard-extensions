export interface PaletteColors {
  "50": string;
  "100": string;
  "200": string;
  "300": string;
  "400": string;
  "500": string;
  "600": string;
  "700": string;
  "800": string;
  "900": string;
  A100: string;
  A200: string;
  A400: string;
  A700: string;

  [key: string]: string;
}

interface CustomPalette {
  type: "custom";
  colors: PaletteColors; // Object of color key/value pairs
  extends: string; // Name of the preset to extend (e.g., "purple", "indigo", etc.)
}

interface PresetPalette {
  type: Exclude<string, "custom">; // e.g. "teal", "purple", "indigo", etc.
  colors: PaletteColors | null;
  extends: string | null;
}

export type TbPalette = CustomPalette | PresetPalette;

interface TbPaletteSettings {
  primaryPalette: TbPalette;
  accentPalette: TbPalette;
}

interface Favicon {
  url: string | null;
}

interface DomainId {
  id: string;
  entityType: string;
}

export interface TbWhiteLabelConfig {
  logoImageUrl: string;
  logoImageHeight: number;
  appTitle: string;
  favicon: Favicon | string;
  paletteSettings: TbPaletteSettings;
  helpLinkBaseUrl: string;
  uiHelpBaseUrl: string;
  enableHelpLinks: boolean;
  whiteLabelingEnabled: boolean;
  showNameVersion: boolean | null;
  platformName: string | null;
  platformVersion: string | null;
  customCss: string;
  hideConnectivityDialog: boolean;
}

export interface TbLoginWhiteLabelConfig {
  logoImageUrl: string;
  logoImageHeight: number;
  appTitle: string;
  favicon: Favicon | string;
  paletteSettings: TbPaletteSettings;
  helpLinkBaseUrl: string;
  uiHelpBaseUrl: string;
  enableHelpLinks: boolean;
  whiteLabelingEnabled: boolean;
  showNameVersion: boolean | null;
  platformName: string | null;
  platformVersion: string | null;
  customCss: string;
  hideConnectivityDialog: boolean;
  pageBackgroundColor: string;
  darkForeground: boolean;
  domainId: DomainId | null;
  baseUrl: string;
  prohibitDifferentUrl: boolean;
  adminSettingsId: string;
  showNameBottom: boolean;
}
