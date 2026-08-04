import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { serwistOptions } from "./serwist.config";

const withSerwist = withSerwistInit(serwistOptions);

const nextConfig: NextConfig = {
  transpilePackages: ["@witnessgrid/contract"],
  reactStrictMode: true,
};

export default withSerwist(nextConfig);