// scripts/embed-icon.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const exePath = path.join(__dirname, "../release/win-unpacked/Converra.exe");
const iconPath = path.join(__dirname, "../resources/icon.ico");

console.log("\n=== Embedding Icon ===");
console.log("Exe path:", exePath);
console.log("Icon path:", iconPath);

// Check if files exist
if (!fs.existsSync(exePath)) {
  console.error("❌ Exe not found:", exePath);
  process.exit(1);
}

if (!fs.existsSync(iconPath)) {
  console.error("❌ Icon not found:", iconPath);
  process.exit(1);
}

// Find rcedit binary
const rceditBinPath = path.join(
  __dirname,
  "../node_modules/rcedit/bin/rcedit.exe",
);

if (!fs.existsSync(rceditBinPath)) {
  console.error("❌ rcedit binary not found at:", rceditBinPath);
  console.log("\n💡 Trying to use rcedit as module instead...");
  embedIconWithModule();
} else {
  console.log("✓ Found rcedit binary at:", rceditBinPath);
  embedIconWithBinary();
}

function embedIconWithBinary() {
  console.log("⏳ Embedding icon using rcedit binary...");

  const args = [exePath, "--set-icon", iconPath];

  const rcedit = spawn(rceditBinPath, args, {
    stdio: "inherit",
    shell: false,
  });

  rcedit.on("close", (code) => {
    if (code === 0) {
      console.log("✅ Icon embedded successfully!");
      console.log("===================\n");
    } else {
      console.error(`❌ rcedit exited with code ${code}`);
      process.exit(1);
    }
  });

  rcedit.on("error", (err) => {
    console.error("❌ Failed to spawn rcedit:", err.message);
    console.log("\n💡 Trying module approach...");
    embedIconWithModule();
  });
}

async function embedIconWithModule() {
  try {
    const rcedit = require("rcedit");

    console.log("⏳ Embedding icon using rcedit module...");

    await rcedit(exePath, {
      icon: iconPath,
      "version-string": {
        CompanyName: "Converra",
        FileDescription: "Converra Player",
        ProductName: "Converra Player",
        InternalName: "Converra",
        OriginalFilename: "Converra.exe",
      },
    });

    console.log("✅ Icon embedded successfully!");
    console.log("===================\n");
  } catch (error) {
    console.error("❌ Failed to embed icon:", error.message);
    process.exit(1);
  }
}
