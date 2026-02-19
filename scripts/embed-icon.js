// scripts/embed-icon-debug.js
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const exePath = path.join(__dirname, "../release/win-unpacked/Converra.exe");
const iconPath = path.join(__dirname, "../resources/icon.ico");

console.log("\n=== Embedding Icon (Debug Mode) ===");
console.log("Exe path:", exePath);
console.log("Icon path:", iconPath);

// Check if files exist
if (!fs.existsSync(exePath)) {
  console.error("ERROR: Exe not found!");
  console.error("   Expected:", exePath);

  // Check for alternative names
  const altPath = path.join(
    __dirname,
    "../release/win-unpacked/Converra Player.exe",
  );
  if (fs.existsSync(altPath)) {
    console.error("   Found 'Converra Player.exe' instead!");
    console.error(
      "   This means executableName in package.json is not working!",
    );
  }

  process.exit(1);
}

if (!fs.existsSync(iconPath)) {
  console.error("ERROR: Icon not found!");
  console.error("   Expected:", iconPath);
  process.exit(1);
}

// Get file stats BEFORE
const statsBefore = fs.statSync(exePath);
console.log("\nFile Info BEFORE:");
console.log("   Size:", (statsBefore.size / 1024 / 1024).toFixed(2), "MB");
console.log("   Modified:", statsBefore.mtime.toLocaleString());

// Check icon file
const iconStats = fs.statSync(iconPath);
console.log("\nIcon File:");
console.log("   Size:", (iconStats.size / 1024).toFixed(2), "KB");
console.log("   Valid .ico format:", iconPath.endsWith(".ico") ? "✓" : "✗");

// Find rcedit binary
const rceditBinPath = path.join(
  __dirname,
  "../node_modules/rcedit/bin/rcedit.exe",
);

console.log("\nLooking for rcedit...");
if (!fs.existsSync(rceditBinPath)) {
  console.error("rcedit binary not found at:", rceditBinPath);
  console.log("\nTrying to use rcedit as module instead...");
  embedIconWithModule();
} else {
  console.log("✓ Found rcedit binary");
  embedIconWithBinary();
}

function embedIconWithBinary() {
  console.log("\nMethod: Using rcedit binary...");

  const args = [exePath, "--set-icon", iconPath];
  console.log("   Command:", rceditBinPath);
  console.log("   Args:", args.join(" "));

  const rcedit = spawn(rceditBinPath, args, {
    stdio: "pipe",
    shell: false,
  });

  let stderr = "";
  let stdout = "";

  rcedit.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  rcedit.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  rcedit.on("close", (code) => {
    if (stdout) console.log("   Output:", stdout);
    if (stderr) console.log("   Errors:", stderr);

    if (code === 0) {
      console.log("\nIcon embedded successfully!");
      verifySuccess();
    } else {
      console.error(`\nrcedit failed with code ${code}`);
      console.log("\nTrying module approach...");
      embedIconWithModule();
    }
  });

  rcedit.on("error", (err) => {
    console.error("\nFailed to spawn rcedit:", err.message);
    console.log("\nTrying module approach...");
    embedIconWithModule();
  });
}

async function embedIconWithModule() {
  try {
    console.log("\nMethod: Using rcedit module...");

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

    console.log("\nIcon embedded successfully!");
    verifySuccess();
  } catch (error) {
    console.error("\nFailed to embed icon:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  }
}

function verifySuccess() {
  // Get file stats AFTER
  const statsAfter = fs.statSync(exePath);
  console.log("\nFile Info AFTER:");
  console.log("   Size:", (statsAfter.size / 1024 / 1024).toFixed(2), "MB");
  console.log("   Modified:", statsAfter.mtime.toLocaleString());

  const sizeChanged = statsAfter.size !== statsBefore.size;
  const timeChanged = statsAfter.mtime > statsBefore.mtime;

  console.log("\nVerification:");
  console.log("   File size changed:", sizeChanged ? "✓ Yes" : "✗ No");
  console.log("   Timestamp changed:", timeChanged ? "✓ Yes" : "✗ No");

  if (!timeChanged) {
    console.warn("\nWARNING: File timestamp didn't change!");
    console.warn(" This might mean embedding failed silently.");
  }

  // Check for ICO signature
  const fileBuffer = fs.readFileSync(exePath);
  const icoSignature = Buffer.from([0x00, 0x00, 0x01, 0x00]);

  let found = false;
  for (let i = 0; i < fileBuffer.length - 4; i++) {
    if (
      fileBuffer[i] === 0x00 &&
      fileBuffer[i + 1] === 0x00 &&
      fileBuffer[i + 2] === 0x01 &&
      fileBuffer[i + 3] === 0x00
    ) {
      found = true;
      console.log("   ICO data found:", `✓ Yes (at offset ${i})`);
      break;
    }
  }

  if (!found) {
    console.error("ICO data found: ✗ No");
    console.error("\nIcon embedding may have failed!");
  }

  console.log("\n" + "=".repeat(50));
  console.log("Next steps:");
  console.log("1. Check file properties of Converra.exe");
  console.log("2. If icon correct in properties but wrong on desktop = cache");
  console.log("3. If icon wrong everywhere = embedding failed");
  console.log("=".repeat(50) + "\n");
}
