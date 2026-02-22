const syncDirectory = require("sync-directory");
const path = require("path");
const fs = require("fs");

const src = path.resolve(__dirname, "../src");
const dist = path.resolve(__dirname, "../dist");

if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
}

syncDirectory(src, dist, {
  type: "copy",
  exclude: /\.tsx?$/,
});

console.log("Build initialized");
