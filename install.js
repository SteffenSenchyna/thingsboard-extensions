/*
 * Copyright © 2023 ThingsBoard, Inc.
 */
const fse = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");

// The bundle's build, in this placeholder's place (src/app/components/shared/feedback/feedback.models.ts, appBuild — what
// a user's feedback says it was sent from): padded to its length, so the source map still lines up.
const BUILD_PLACEHOLDER = "__TB_EXT_BUILD_STAMP____________________";

let _projectRoot = null;

(async () => {
  // Move the JavaScript file and its associated source map
  await moveFileWithSourceMap(sourcePackage(), targetPackage());
  await stampBuild(targetPackage());
})();

// The build ("2026-11-12 14:05 b3e6aa1": when, and the commit it was built on) into the bundle.
async function stampBuild(file) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  let hash = "";
  try {
    hash = execSync("git rev-parse --short HEAD", { cwd: projectRoot() }).toString().trim();
  } catch {
    // Not a checkout: the time alone.
  }
  const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const stamp = `${when}${hash ? ` ${hash}` : ""}`.slice(0, BUILD_PLACEHOLDER.length).padEnd(BUILD_PLACEHOLDER.length, " ");
  const code = await fse.readFile(file, "utf8");
  const parts = code.split(BUILD_PLACEHOLDER);
  if (parts.length < 2) {
    console.warn("Build stamp: placeholder not found");
    return;
  }
  await fse.writeFile(file, parts.join(stamp));
  console.log(`Stamped build: ${stamp.trim()}`);
}

// Function to move the main package and its source map
async function moveFileWithSourceMap(sourceFilePath, targetFilePath) {
  try {
    // Move the main JavaScript file
    await fse.move(sourceFilePath, targetFilePath, { overwrite: true });
    console.log(`Moved: ${sourceFilePath} -> ${targetFilePath}`);

    // Check if a source map exists and move it if found
    const sourceMapPath = `${sourceFilePath}.map`;
    const targetMapPath = `${targetFilePath}.map`;

    if (fse.pathExists(sourceMapPath)) {
      await fse.move(sourceMapPath, targetMapPath, { overwrite: true });
      console.log(`Moved: ${sourceMapPath} -> ${targetMapPath}`);
    } else {
      console.log(`Source map not found for: ${sourceFilePath}`);
    }
  } catch (err) {
    console.error(`Error moving files: ${err.message}`);
  }
}

function projectRoot() {
  if (!_projectRoot) {
    _projectRoot = __dirname;
  }
  return _projectRoot;
}

function sourcePackage() {
  return path.join(
    projectRoot(),
    "dist",
    // `yarn build` has its own output folder so it never wipes or moves the
    // bundle `yarn start` / `yarn dev` serves from dist/widget-extension.
    "widget-extension-build",
    "system",
    "thingsboard-extension-widgets.js"
  );
}

function targetPackage() {
  return path.join(
    projectRoot(),
    "target",
    "generated-resources",
    "thingsboard-extension-widgets.js"
  );
}
