const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium, webkit } = require("playwright-core");

const engine = process.argv[2] === "webkit" ? webkit : chromium;
const url = process.env.MATHPRESS_QA_URL || "http://localhost:4174/";
const output = process.env.MATHPRESS_QA_OUTPUT || "/tmp/mathpress-compact";

async function run() {
  await mkdir(output, { recursive: true });
  const browser = await engine.launch(engine === chromium && process.env.MATHPRESS_CHROMIUM
    ? { executablePath: process.env.MATHPRESS_CHROMIUM } : {});
  try {
    for (const [width, height] of [[1080, 810], [810, 1080]]) {
      const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
      await page.goto(url);
      const design = page.getByRole("button", { name: "التصميم والصناديق", exact: true });
      await design.waitFor();
      assert.equal(await page.locator(".creative-tools").count(), 0);
      const dimensions = await page.evaluate(() => {
        const { height: top } = document.querySelector(".topbar").getBoundingClientRect();
        const { height: tabs } = document.querySelector(".rb-strip").getBoundingClientRect();
        return { top, tabs };
      });
      if (width > height) assert.ok(dimensions.top + dimensions.tabs <= 110, JSON.stringify(dimensions));
      await page.screenshot({ path: join(output, `${engine.name()}-compact-${width}.png`) });
      await design.tap();
      await page.getByRole("button", { name: "مكتبة أنماط الصناديق" }).waitFor();
      await design.tap();
      await page.locator(".creative-tools").waitFor({ state: "detached" });
      await page.getByRole("button", { name: "خصائص المستند" }).tap();
      const properties = page.getByRole("complementary", { name: "خصائص المستند" });
      await properties.waitFor();
      const stage = await page.locator(".page-stage").boundingBox();
      const panel = await properties.boundingBox();
      assert.ok(stage && panel && panel.x + panel.width <= stage.x + 1,
        JSON.stringify({ stage, panel }));
      await page.screenshot({ path: join(output, `${engine.name()}-docked-properties-${width}.png`) });
      await properties.getByRole("button", { name: "إغلاق" }).tap();
      await page.getByRole("button", { name: "الوضع الداكن" }).tap();
      await page.screenshot({ path: join(output, `${engine.name()}-compact-dark-${width}.png`) });
      await page.getByRole("tab", { name: "عرض", exact: true }).tap();
      await page.getByRole("button", { name: "وضع التركيز", exact: true }).tap();
      await page.getByRole("button", { name: "إنهاء وضع التركيز" }).waitFor();
      assert.equal(await page.locator(".rb-strip").count(), 0);
      await page.screenshot({ path: join(output, `${engine.name()}-focus-${width}.png`) });
      console.log(engine.name(), width, height, dimensions);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
