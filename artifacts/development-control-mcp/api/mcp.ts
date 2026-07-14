import { createDab3cNodeHandler } from "../src/activation.js";

export { createRemoteMcpHttpHandler } from "../src/runtime.js";

const handler = createDab3cNodeHandler({
  // Reading values is deferred until a request reaches this isolated boundary.
  readEnvironment: () => process.env,
});

export default handler;
