const syncDirectory = require("sync-directory");
const path = require("path");

const src = path.resolve(__dirname, "../src");
const dist = path.resolve(__dirname, "../dist");

syncDirectory(src, dist, {
  type: "copy",
  watch: true,
  exclude: /\.tsx?$/,
  skipInitialSync: true,
  afterEachSync({ eventType, relativePath }) {
    console.log(`[sync] ${eventType}: ${relativePath}`);
  },
});

console.log("Watching for non-TypeScript file changes in src/");
