import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { tileHostname } from "@/lib/map-tiles";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    ...defaultCache,
    {
      matcher: ({ url }) => url.pathname.startsWith("/incidents"),
      method: "GET",
      handler: new NetworkFirst({
        cacheName: "wg-register",
        networkTimeoutSeconds: 5,
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 })],
      }),
    },
    {
      matcher: ({ url }) => url.pathname.startsWith("/media/"),
      method: "GET",
      handler: new CacheFirst({
        cacheName: "wg-media",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 })],
      }),
    },
    {
      // Cache whichever raster tile host is configured (see lib/map-tiles).
      matcher: ({ url }) => url.hostname.includes(tileHostname()),
      method: "GET",
      handler: new CacheFirst({
        cacheName: "wg-tiles",
        plugins: [new ExpirationPlugin({ maxEntries: 512, maxAgeSeconds: 60 * 60 * 24 * 7 })],
      }),
    },
  ],
});

serwist.addEventListeners();
