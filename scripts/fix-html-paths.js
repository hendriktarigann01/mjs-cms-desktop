const fs = require("fs");
const path = require("path");

function fixHtmlPaths() {
  const playerHtmlPath = path.join(__dirname, "../out/player/index.html");

  if (!fs.existsSync(playerHtmlPath)) {
    console.log("Player HTML not found");
    return;
  }

  console.log("Fixing asset paths in player/index.html...");

  let html = fs.readFileSync(playerHtmlPath, "utf8");

  html = html.replace(
    /(?:src|href)=["']\.\/(_next|logo|idle)/g,
    (match, folder) => {
      return match.replace("./", "../");
    }
  );

  html = html.replace(/(?:src|href)=["'](_next)\//g, (match) => {
    return match.replace("_next/", "../_next/");
  });

  fs.writeFileSync(playerHtmlPath, html, "utf8");

  console.log("Asset paths fixed!");
}

fixHtmlPaths();
