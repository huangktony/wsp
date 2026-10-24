import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ["pg"],
  // Explicit alias: tsconfig paths matching was flaky for files under [id] route folders.
  webpack(config) {
    config.resolve.alias["@"] = root;
    return config;
  },
};
