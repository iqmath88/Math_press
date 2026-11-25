import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("production service worker", () => {
  it("reloads stable URLs before precaching a new build under the Pages subpath", async () => {
    const addAll = vi.fn();
    const cache = { addAll };
    let install: ((event: { waitUntil: (promise: Promise<unknown>) => void }) => void) | undefined;
    const source = readFileSync(new URL("./sw.js", import.meta.url), "utf8")
      .replace("__BUILD_ID__", "test-build")
      .replace("/*__PRECACHE__*/[]", '["index.html","manifest.webmanifest","assets/index-abc.js"]');
    runInNewContext(source, {
      URL,
      Request,
      caches: { open: vi.fn().mockResolvedValue(cache) },
      self: {
        location: { href: "https://example.test/Math_press/sw.js" },
        addEventListener(type: string, listener: typeof install) {
          if (type === "install") install = listener;
        }
      }
    });
    let completion: Promise<unknown> | undefined;
    install?.({ waitUntil: promise => { completion = promise; } });
    await completion;
    const [requests] = addAll.mock.calls[0] as [Request[]];
    expect(requests.map(request => [new URL(request.url).pathname, request.cache])).toEqual([
      ["/Math_press/index.html", "reload"],
      ["/Math_press/manifest.webmanifest", "reload"],
      ["/Math_press/assets/index-abc.js", "default"]
    ]);
  });
});
