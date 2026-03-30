import { createMDX } from "fumadocs-mdx/next";
import path from "path";

const withMDX = createMDX();

const config: import("next").NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  webpack(webpackConfig) {
    webpackConfig.resolve = webpackConfig.resolve ?? {};
    webpackConfig.resolve.alias = webpackConfig.resolve.alias ?? {};
    (webpackConfig.resolve.alias as Record<string, string>)["@/.source"] = path.join(
      process.cwd(),
      ".source"
    );
    return webpackConfig;
  },
};

export default withMDX(config);
