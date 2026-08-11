import { createSerwistRoute } from "@serwist/turbopack";

export const {
  dynamic,
  dynamicParams,
  revalidate,
  generateStaticParams,
  GET,
} = createSerwistRoute({
  swSrc: "src/sw/sw.ts",
  useNativeEsbuild: true,
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
});
