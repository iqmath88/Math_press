const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright-core");

const baseline = process.env.MATHPRESS_BASELINE_DIST;
const candidate = path.resolve(process.env.MATHPRESS_CANDIDATE_DIST || "dist");
const nextVersion = "v" + require("./package.json").version;
const prefix = "/Math_press/";
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function run() {
  if (!baseline)
    throw new Error(
      "Set MATHPRESS_BASELINE_DIST to the built 0.4.0 dist directory",
    );
  let current = path.resolve(baseline);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/") {
      response
        .writeHead(200, { "Content-Type": "text/html" })
        .end("<p>Outside the app scope</p>");
      return;
    }
    const file = url.pathname.slice(prefix.length) || "index.html";
    if (
      !url.pathname.startsWith(prefix) ||
      !/^[a-zA-Z\d/._-]+$/.test(file) ||
      file.split("/").includes("..")
    ) {
      response.writeHead(404).end();
      return;
    }
    try {
      const content = await readFile(path.join(current, file));
      response
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] || "application/octet-stream",
          "Cache-Control":
            file === "sw.js" ? "no-cache" : "public, max-age=3600",
        })
        .end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const base = origin + prefix;
    browser = await chromium.launch({
      ...(process.env.MATHPRESS_CHROMIUM
        ? { executablePath: process.env.MATHPRESS_CHROMIUM }
        : {}),
      ...(process.env.MATHPRESS_CHROMIUM_NO_SANDBOX === "1"
        ? { args: ["--no-sandbox"] }
        : {}),
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const waitVersion = (version) =>
      page.waitForFunction(
        (value) => document.querySelector(".version")?.textContent === value,
        version,
      );
    await page.goto(base);
    await waitVersion("v0.4.0");
    await page.waitForFunction(() =>
      Boolean(navigator.serviceWorker.controller),
    );
    const oldCache = await page.evaluate(async () =>
      (await caches.keys()).find((name) => name.startsWith("mathpress-build:")),
    );
    assert.ok(oldCache);
    const documentTitle = "وثيقة محفوظة قبل تحديث التطبيق";
    await page.getByLabel("عنوان المستند").fill(documentTitle);
    await page.getByText("محفوظ محليًا", { exact: true }).waitFor();

    current = candidate;
    await page.reload();
    await waitVersion(nextVersion);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    const workerSource = await readFile(path.join(candidate, "sw.js"), "utf8");
    const build = workerSource.match(/^const BUILD = "([^"]+)";/m)?.[1];
    assert.ok(build);
    const newCache = `mathpress-build:${prefix}:${build}`;
    const indexURL = base + "index.html";
    await page.waitForFunction(
      async ({ name, url }) => {
        if (!(await caches.keys()).includes(name)) return false;
        return Boolean(await (await caches.open(name)).match(url));
      },
      { name: newCache, url: indexURL },
    );
    await page.goto(origin);
    await page.waitForFunction(
      async (old) => !(await caches.keys()).includes(old),
      oldCache,
    );

    // Read the specific build being activated, the same way the worker handles navigation.
    const storedIndex = await page.evaluate(
      async ({ name, url }) =>
        (await (await caches.open(name)).match(url))?.text(),
      { name: newCache, url: indexURL },
    );
    assert.equal(
      storedIndex,
      await readFile(path.join(candidate, "index.html"), "utf8"),
    );
    await context.setOffline(true);
    await page.goto(base);
    await waitVersion(nextVersion);
    await page.getByRole("tab", { name: "ملف" }).click();
    await page
      .getByRole("button", { name: "المستندات المحفوظة على هذا الجهاز" })
      .click();
    await page
      .locator(".library-open")
      .filter({ hasText: documentTitle })
      .click();
    assert.equal(
      await page.getByLabel("عنوان المستند").inputValue(),
      documentTitle,
    );
    if (process.env.MATHPRESS_QA_OUTPUT) {
      await page.screenshot({
        path: path.join(process.env.MATHPRESS_QA_OUTPUT, "pwa-offline.png"),
      });
    }
    console.log(
      "PWA update passed under /Math_press/: fresh offline bundle and existing IndexedDB data",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
