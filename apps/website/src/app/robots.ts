import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://poolcare.africa";

// Explicitly welcome the major AI / answer-engine crawlers (AIEO/GEO) in
// addition to traditional search bots. Listing them is intentional so future
// blanket blocks don't accidentally cut PoolCare out of AI answers.
const AI_BOTS = [
  "GPTBot",            // OpenAI / ChatGPT
  "OAI-SearchBot",     // ChatGPT Search
  "ChatGPT-User",      // ChatGPT live browsing
  "ClaudeBot",         // Anthropic crawler
  "Claude-Web",        // Anthropic live fetch
  "anthropic-ai",      // Anthropic (legacy)
  "PerplexityBot",     // Perplexity
  "Perplexity-User",   // Perplexity live fetch
  "Google-Extended",   // Google Gemini / AI Overviews training
  "Applebot-Extended", // Apple Intelligence
  "Amazonbot",         // Amazon
  "Bytespider",        // TikTok / Doubao
  "CCBot",             // Common Crawl (feeds many LLMs)
  "cohere-ai",         // Cohere
  "Meta-ExternalAgent",// Meta AI
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // `/assess/` is the private, token-gated field assessment form — keep it
      // out of all indexes (it's unlinked and per-recipient anyway).
      { userAgent: "*", allow: "/", disallow: "/assess/" },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: "/assess/" })),
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
