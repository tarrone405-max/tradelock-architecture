import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't let `next dev` auto-inject an "AI agent rules" block into CLAUDE.md
  // on every run — we maintain that file's content ourselves.
  agentRules: false,
};

export default nextConfig;
