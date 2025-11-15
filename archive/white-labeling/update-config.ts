// update-config.ts
import { tbClient } from "../auth";
import { accent as accentColors, primary as primaryColors } from "./colors";
import type {
  PaletteColors,
  TbLoginWhiteLabelConfig,
  TbWhiteLabelConfig,
} from "./white-labeling";

/**
 * Helper to extract only the required keys from a palette object.
 * This strips out any extra properties (e.g. contrastDefaultColor).
 */
function getPaletteColors(colors: { [key: string]: string }): PaletteColors {
  return {
    "50": colors["50"],
    "100": colors["100"],
    "200": colors["200"],
    "300": colors["300"],
    "400": colors["400"],
    "500": colors["500"],
    "600": colors["600"],
    "700": colors["700"],
    "800": colors["800"],
    "900": colors["900"],
    A100: colors["A100"],
    A200: colors["A200"],
    A400: colors["A400"],
    A700: colors["A700"],
  };
}

/**
 * Fetch the existing white label configuration.
 */
async function getWhiteLabelConfig(): Promise<TbWhiteLabelConfig> {
  const client = await tbClient();
  const response = await client.request("/api/whiteLabel/whiteLabelParams", {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GET request failed: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

/**
 * Update the white label configuration with new palette values.
 * This function fetches the current config, updates the palette values,
 * and sends the new configuration to the update endpoint.
 */
async function updateWhiteLabelConfig(): Promise<void> {
  try {
    const existingConfig = await getWhiteLabelConfig();
    const updatedPrimary: PaletteColors = getPaletteColors(primaryColors);
    const updatedAccent: PaletteColors = getPaletteColors(accentColors);
    existingConfig.paletteSettings.primaryPalette = {
      type: "custom",
      colors: updatedPrimary,
      extends:
        existingConfig.paletteSettings.primaryPalette.extends || "indigo",
    };
    existingConfig.paletteSettings.accentPalette = {
      type: "custom",
      colors: updatedAccent,
      extends: existingConfig.paletteSettings.accentPalette.extends || "indigo",
    };

    const requestBody = JSON.stringify(existingConfig);
    const client = await tbClient();
    const response = await client.request("/api/whiteLabel/whiteLabelParams", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: requestBody,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(
        `Update failed: ${response.status} ${response.statusText}`
      );
    }

    await response.json();
  } catch (error) {
    console.error("Error updating white label config:", error);
    // Propagate the error so the caller can handle it:
    throw error;
  }
}

/**
 * Fetch the existing login white label configuration.
 */
async function getLoginWhiteLabelConfig(): Promise<TbLoginWhiteLabelConfig> {
  const client = await tbClient();
  const response = await client.request(
    "/api/noauth/whiteLabel/loginWhiteLabelParams",
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    }
  );
  if (!response.ok) {
    throw new Error(
      `Login GET request failed: ${response.status} ${response.statusText}`
    );
  }
  return await response.json();
}

/**
 * Update the login white label configuration with new palette values.
 * This function fetches the existing login config, updates the palette
 * settings with the new primary and accent values from colors.ts,
 * and then sends the updated config via a POST request.
 */
async function updateLoginWhiteLabelConfig() {
  try {
    const loginConfig = await getLoginWhiteLabelConfig();

    const updatedPrimary: PaletteColors = getPaletteColors(primaryColors);
    const updatedAccent: PaletteColors = getPaletteColors(accentColors);

    loginConfig.paletteSettings.primaryPalette = {
      type: "custom",
      colors: updatedPrimary,
      extends: loginConfig.paletteSettings.primaryPalette?.extends || "indigo",
    };
    loginConfig.paletteSettings.accentPalette = {
      type: "custom",
      colors: updatedAccent,
      extends: loginConfig.paletteSettings.accentPalette.extends || "indigo",
    };

    const requestBody = JSON.stringify(loginConfig);
    const client = await tbClient();
    const response = await client.request(
      "/api/whiteLabel/loginWhiteLabelParams",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: requestBody,
        redirect: "follow",
      }
    );
    if (!response.ok) {
      throw new Error(
        `Login update failed: ${response.status} ${response.statusText}`
      );
    }
    await response.json();
  } catch (error) {
    console.error("Error updating login white label config:", error);
    throw error;
  }
}

updateLoginWhiteLabelConfig();

updateWhiteLabelConfig();
