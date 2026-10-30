import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function offlineAssetManifest(): Plugin {
  return {
    name: "edusphere-offline-asset-manifest",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .filter((output) => output.type === "chunk" || /\.(?:css|svg|png|ico|woff2?)$/.test(output.fileName))
        .map((output) => `/${output.fileName}`);
      this.emitFile({
        type: "asset",
        fileName: "precache-manifest.json",
        source: JSON.stringify(assets),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineAssetManifest()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  preview: {
    port: 5181,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
