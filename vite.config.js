import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const audioRoot = path.resolve(rootDir, "audio");

function serveAudioPlugin() {
  return {
    name: "echo-serve-audio",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] || "";
        if (!url.startsWith("/audio/")) return next();
        const rel = decodeURIComponent(url.slice("/audio/".length));
        const filePath = path.resolve(audioRoot, rel);
        if (!filePath.startsWith(audioRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.statusCode = 404;
          res.end("Audio not found");
          return;
        }
        res.setHeader("Content-Type", "audio/mpeg");
        fs.createReadStream(filePath).pipe(res);
      });
    },
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir || path.resolve(rootDir, "dist");
      const dest = path.join(outDir, "audio");
      fs.cpSync(audioRoot, dest, { recursive: true });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/echo-english/" : "/",
  plugins: [react(), serveAudioPlugin()],
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
}));
