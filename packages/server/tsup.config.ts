import { defineConfig } from "tsup";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["src/bin.ts", "src/server.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  noExternal: ["@claude-blocker/shared"],
  esbuildOptions(options) {
    options.alias = {
      "@claude-blocker/shared": resolve(__dirname, "../shared/src/index.ts"),
    };
  },
});
