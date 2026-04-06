const { createApp } = require("./src/app");

const app = createApp();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`RAG API listening on port ${port}`);
});