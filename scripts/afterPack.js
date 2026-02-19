// scripts/afterPack.js
// This runs AFTER electron packs the app but BEFORE creating installer
// Perfect timing to embed icon!

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

exports.default = async function (context) {
  console.log("\n=== afterPack Hook: Embedding Icon ===");

  const appOutDir = context.appOutDir;
  const exeName = context.packager.appInfo.productFilename + ".exe";
  const exePath = path.join(appOutDir, exeName);
  const iconPath = path.join(context.packager.projectDir, "resources/icon.ico");

  console.log("App output dir:", appOutDir);
  console.log("Exe path:", exePath);
  console.log("Icon path:", iconPath);

  // Check if files exist
  if (!fs.existsSync(exePath)) {
    console.error("Exe not found:", exePath);
    return;
  }

  if (!fs.existsSync(iconPath)) {
    console.error("Icon not found:", iconPath);
    return;
  }

  console.log("✓ Files found, embedding icon...");

  // Try rcedit binary first
  const rceditBinPath = path.join(
    context.packager.projectDir,
    "node_modules/rcedit/bin/rcedit.exe",
  );

  if (fs.existsSync(rceditBinPath)) {
    try {
      await embedWithBinary(rceditBinPath, exePath, iconPath);
      console.log("Icon embedded successfully!");
      return;
    } catch (error) {
      console.log("Binary method failed, trying module...");
    }
  }

  // Fallback to rcedit module
  try {
    await embedWithModule(exePath, iconPath);
    console.log("Icon embedded successfully!");
  } catch (error) {
    console.error("Failed to embed icon:", error.message);
    throw error;
  }
};

function embedWithBinary(rceditPath, exePath, iconPath) {
  return new Promise((resolve, reject) => {
    const args = [exePath, "--set-icon", iconPath];
    const rcedit = spawn(rceditPath, args, { stdio: "inherit" });

    rcedit.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`rcedit exited with code ${code}`));
      }
    });

    rcedit.on("error", (err) => {
      reject(err);
    });
  });
}

async function embedWithModule(exePath, iconPath) {
  const rcedit = require("rcedit");

  await rcedit(exePath, {
    icon: iconPath,
    "version-string": {
      CompanyName: "Converra",
      FileDescription: "Converra Player",
      ProductName: "Converra",
      InternalName: "Converra",
      OriginalFilename: "Converra.exe",
    },
  });
}
