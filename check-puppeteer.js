// check-puppeteer.js
const fs = require("fs");
const path = require("path");

console.log("Node version:", process.version);

try {
  console.log("puppeteer resolve:", require.resolve("puppeteer-core"));
  console.log("puppeteer package:", require("puppeteer/package.json").version);
  console.log(
    "puppeteer-core package:",
    require("puppeteer-core/package.json").version
  );
} catch (e) {
  console.error("resolve/package error:", e.message);
}

const dir = path.join(
  __dirname,
  "node_modules",
  "puppeteer-core",
  "lib",
  "cjs",
  "puppeteer"
);
console.log("Checking folder:", dir);
try {
  const files = fs.readdirSync(dir);
  console.log("Files:", files);
  console.log("index.js exists?", fs.existsSync(path.join(dir, "index.js")));
  console.log(
    "index-browser.js exists?",
    fs.existsSync(path.join(dir, "index-browser.js"))
  );
} catch (e) {
  console.error("fs error:", e.message);
}
