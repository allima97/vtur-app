#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");
const ignorePath = path.join(distDir, ".assetsignore");

if (!fs.existsSync(distDir)) {
  console.error("[post-build] diretório dist não existe, nada a fazer.");
  process.exit(0);
}

const content = "_worker.js\n";

try {
  fs.writeFileSync(ignorePath, content, "utf8");
  console.log("[post-build] criado dist/.assetsignore com exclusão de _worker.js");
} catch (err) {
  console.error("[post-build] erro ao criar dist/.assetsignore:", err.message);
  process.exit(1);
}
