import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen here reads the live log: a session opened two minutes ago, a
  // tally that changed on the last tap. There is nothing worth prerendering,
  // so the app renders dynamically rather than splitting each page around a
  // cache boundary.
  cacheComponents: false,
  turbopack: {
    rules: {
      // Only the global entry imports Tailwind. Rewriting a *.module.css
      // file as *.css removes CSS Module scoping and its class-name exports.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
