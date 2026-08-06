export const serwistOptions = {
  swSrc: "src/sw/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  // Deliberately off: reloading on reconnect can destroy an in-progress
  // report submission. The offline queue flushes itself when back online.
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
};