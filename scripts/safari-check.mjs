import { webkit, devices } from "playwright";
import fs from "node:fs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4322";
const EMAIL = process.env.E2E_EMAIL || "";
const PASSWORD = process.env.E2E_PASSWORD || "";
const STORAGE_STATE_PATH = process.env.E2E_STORAGE_STATE || "";

const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/recover",
  "/auth/reset",
  "/test-env",
];

const PRIVATE_ROUTES = [
  "/",
  "/consultoria-online",
  "/operacao/campanhas",
  "/operacao/agenda",
  "/operacao/todo",
  "/operacao/recados",
  "/vendas/consulta",
  "/orcamentos/consulta",
];

const WAIT_UNTIL = "domcontentloaded";

const uniq = (items) => Array.from(new Set(items));

function classifyConsoleError(text) {
  const msg = String(text || "").trim();
  if (!msg) return { kind: "unknown", msg };
  if (/Failed to load resource/i.test(msg)) return { kind: "resource", msg };
  if (/Hydration failed|did not match|Text content does not match/i.test(msg)) {
    return { kind: "hydration", msg };
  }
  return { kind: "js", msg };
}

async function tryLogin(page) {
  if (!EMAIL || !PASSWORD) return { attempted: false, ok: false };

  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(250);

  const emailInput = page.getByLabel(/e-?mail/i);
  const passwordInput = page.getByLabel(/senha/i);
  const submitButton = page.getByRole("button", { name: /^entrar$/i });

  await emailInput.fill(EMAIL);
  await passwordInput.fill(PASSWORD);
  await submitButton.click();

  // Aguarda redirecionar para fora do /auth/login
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), { timeout: 45000 });
  return { attempted: true, ok: true };
}

function safeStorageStateOption() {
  if (!STORAGE_STATE_PATH) return undefined;
  try {
    if (fs.existsSync(STORAGE_STATE_PATH)) return STORAGE_STATE_PATH;
  } catch {}
  return undefined;
}

async function checkRoute(context, route, aggregators) {
  const page = await context.newPage();

  page.on("pageerror", (err) => {
    aggregators.pageErrors.push(
      `${route}: ${err && err.stack ? err.stack : String(err)}`
    );
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const { kind, msg: text } = classifyConsoleError(msg.text());
    const loc = msg.location();
    const at = loc?.url
      ? ` @ ${loc.url}:${loc.lineNumber || 0}:${loc.columnNumber || 0}`
      : "";
    aggregators.consoleErrors.push(`${route}: ${kind.toUpperCase()}: ${text}${at}`);
  });

  page.on("requestfailed", (req) => {
    const failure = req.failure();
    const url = req.url();
    if (url.includes("favicon")) return;
    const errorText = failure ? failure.errorText : "unknown failure";
    if (String(errorText).toLowerCase() === "cancelled") return;
    aggregators.requestFailures.push(
      `${route}: ${req.method()} ${url} :: ${errorText}`
    );
  });

  page.on("response", (resp) => {
    const status = resp.status();
    if (status < 400) return;
    const url = resp.url();
    if (url.includes("/@vite/") || url.includes("favicon")) return;
    aggregators.httpErrors.push(`${route}: ${status} ${url}`);
  });

  try {
    const resp = await page.goto(`${BASE_URL}${route}`, {
      waitUntil: "load",
      timeout: 45000,
    });
    await page.waitForTimeout(1200);
    return {
      route,
      status: resp ? resp.status() : null,
      finalUrl: page.url(),
    };
  } catch (err) {
    return { route, status: "NAV_ERROR", finalUrl: page.url(), err: String(err) };
  } finally {
    await page.close().catch(() => {});
  }
}

async function runContext(label, contextOptions) {
  const browser = await webkit.launch();
  const context = await browser.newContext(contextOptions);

  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const httpErrors = [];

  const results = [];
  const aggregators = { pageErrors, consoleErrors, requestFailures, httpErrors };

  // Se tiver storage state, já abre autenticado.
  let loggedIn = false;
  try {
    if (safeStorageStateOption()) {
      const state = await context.storageState();
      if (state?.cookies?.length) loggedIn = true;
    }
  } catch {}

  // Se não tiver state, tenta login por formulário se houver credenciais.
  if (!loggedIn) {
    try {
      const loginPage = await context.newPage();
      const loginResult = await tryLogin(loginPage);
      loggedIn = Boolean(loginResult.ok);
      await loginPage.close().catch(() => {});
    } catch (err) {
      results.push({
        route: "/auth/login",
        status: "LOGIN_ERROR",
        finalUrl: "",
        err: String(err),
      });
    }
  }

  const routes = uniq([...PUBLIC_ROUTES, ...PRIVATE_ROUTES]);
  for (const route of routes) {
    results.push(await checkRoute(context, route, aggregators));
  }

  await browser.close();

  const hasHydrationError = consoleErrors.some((line) => line.includes(": HYDRATION:"));
  const hasJsConsoleError =
    consoleErrors.some((line) => line.includes(": JS:")) ||
    consoleErrors.some((line) => line.includes(": UNKNOWN:"));
  const hasPageError = pageErrors.length > 0;

  return {
    label,
    loggedIn,
    results,
    pageErrors: uniq(pageErrors),
    consoleErrors: uniq(consoleErrors),
    requestFailures: uniq(requestFailures),
    httpErrors: uniq(httpErrors),
    hasHydrationError,
    hasJsConsoleError,
    hasPageError,
  };
}

function summarize(ctx) {
  console.log(`\n=== ${ctx.label} (${ctx.loggedIn ? "autenticado" : "não autenticado"}) ===`);
  for (const r of ctx.results) {
    const status = String(r.status).padEnd(10);
    const finalUrl = String(r.finalUrl || "").replace(BASE_URL, "") || "/";
    console.log(`${status} ${r.route} -> ${finalUrl}`);
    if (r.err) console.log(`  ${r.err}`);
  }

  if (ctx.pageErrors.length) {
    console.log(`\n[${ctx.label}] page errors (${ctx.pageErrors.length}):`);
    ctx.pageErrors.forEach((e) => console.log(" -", e));
  }

  if (ctx.consoleErrors.length) {
    console.log(`\n[${ctx.label}] console errors (${ctx.consoleErrors.length}):`);
    ctx.consoleErrors.forEach((e) => console.log(" -", e));
  }

  if (ctx.requestFailures.length) {
    console.log(`\n[${ctx.label}] request failures (${ctx.requestFailures.length}):`);
    ctx.requestFailures.forEach((e) => console.log(" -", e));
  }

  if (ctx.httpErrors.length) {
    console.log(`\n[${ctx.label}] HTTP >= 400 (${ctx.httpErrors.length}):`);
    ctx.httpErrors.slice(0, 20).forEach((e) => console.log(" -", e));
    if (ctx.httpErrors.length > 20) console.log(` - ... (+${ctx.httpErrors.length - 20})`);
  }
}

const iphoneDevice =
  devices["iPhone 13"] || devices["iPhone 12"] || devices["iPhone 14"] || devices["iPhone 11"];

const desktop = await runContext("webkit-desktop", {
  viewport: { width: 1280, height: 720 },
  storageState: safeStorageStateOption(),
});

const mobile = await runContext("webkit-iphone", {
  ...(iphoneDevice || { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
  storageState: safeStorageStateOption(),
});

[desktop, mobile].forEach(summarize);

const shouldFail =
  desktop.hasPageError ||
  desktop.hasHydrationError ||
  desktop.hasJsConsoleError ||
  mobile.hasPageError ||
  mobile.hasHydrationError ||
  mobile.hasJsConsoleError;

process.exitCode = shouldFail ? 1 : 0;
