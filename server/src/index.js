const { createApp } = require("./app");
const path = require("node:path");

const port = Number(process.env.PORT || 3001);
const projectRoot = path.resolve(__dirname, "../..");
const app = createApp({
  projectRoot,
  dataDir: process.env.INKSPIRE_DATA_DIR
    ? path.resolve(projectRoot, process.env.INKSPIRE_DATA_DIR)
    : undefined
});

app.listen(port, () => {
  console.log(`Inkspire server listening on http://localhost:${port}`);
});
