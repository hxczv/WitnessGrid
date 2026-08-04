export const serwistOptions = {
  swSrc: "src/sw/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
};