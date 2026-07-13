import { defineConfig } from "drizzle-kit";
import path from "node:path";

// Schema generation is credential-free. Migration execution requires a
// separately authorized caller-supplied connection outside this phase.
export default defineConfig({
  schema: path.join(__dirname, "./src/schema.ts"),
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
});
