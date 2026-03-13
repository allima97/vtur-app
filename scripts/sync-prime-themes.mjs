import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const sourceThemesRoot = resolve(projectRoot, "node_modules/primereact/resources/themes");
const targetThemesRoot = resolve(projectRoot, "public/themes");
const DEFAULT_THEMES = [
  "lara-light-indigo",
  "lara-light-blue",
  "lara-light-teal",
  "lara-light-green",
  "lara-light-amber",
  "lara-light-purple",
];

const requestedThemes = process.argv.slice(2).filter(Boolean);
const themes = requestedThemes.length > 0 ? requestedThemes : DEFAULT_THEMES;

function copyTheme(themeName) {
  const sourceDir = resolve(sourceThemesRoot, themeName);
  const sourceCss = resolve(sourceDir, "theme.css");
  const sourceFonts = resolve(sourceDir, "fonts");
  const targetDir = resolve(targetThemesRoot, themeName);
  const targetCss = resolve(targetDir, "theme.css");
  const targetFonts = resolve(targetDir, "fonts");

  if (!existsSync(sourceCss)) {
    throw new Error(`Tema não encontrado em node_modules: ${themeName}`);
  }

  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceCss, targetCss, { force: true });

  if (existsSync(sourceFonts)) {
    cpSync(sourceFonts, targetFonts, { recursive: true, force: true });
  }
}

if (!existsSync(sourceThemesRoot)) {
  throw new Error("Diretório de temas do PrimeReact não encontrado. Execute npm install.");
}

mkdirSync(targetThemesRoot, { recursive: true });

for (const themeName of themes) {
  copyTheme(themeName);
  console.log(`[sync-prime-themes] ${themeName} sincronizado em public/themes/${themeName}`);
}
