import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("production service worker", () => {
  it("fetches stable URLs with a build key and caches them at their canonical path", async () => {
    const addAll = vi.fn();
    const put = vi.fn();
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    const cache = { addAll, put };
    let install;
    const source = readFileSync(new URL("./sw.js", import.meta.url), "utf8")
      .replace("__BUILD_ID__", "test-build")
      .replace("/*__PRECACHE__*/[]", '["index.html","manifest.webmanifest","assets/index-abc.js"]');
    runInNewContext(source, {
      URL,
      fetch,
      caches: { open: vi.fn().mockResolvedValue(cache) },
      self: {
        location: { href: "https://example.test/Math_press/sw.js" },
        addEventListener(type, listener) {
          if (type === "install") install = listener;
        }
      }
    });
    let completion;
    install?.({ waitUntil: promise => { completion = promise; } });
    await completion;
    expect(addAll).toHaveBeenCalledWith(["https://example.test/Math_press/assets/index-abc.js"]);
    expect(fetch.mock.calls.map(([url, options]) => [url.pathname + url.search, options.cache])).toEqual([
      ["/Math_press/index.html?mp-build=test-build", "no-store"],
      ["/Math_press/manifest.webmanifest?mp-build=test-build", "no-store"]
    ]);
    expect(put.mock.calls.map(([url]) => url.pathname)).toEqual([
      "/Math_press/index.html", "/Math_press/manifest.webmanifest"
    ]);
  });
});
