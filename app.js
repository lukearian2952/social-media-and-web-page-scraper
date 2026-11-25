/**
 * app.js — Reliable Geonix-integrated scraper with full debug logging (v4)
 */

const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { convert } = require("html-to-text");
const dns = require("dns");
const { HttpsProxyAgent } = require("https-proxy-agent");
const puppeteer = require("puppeteer");
const https = require("https"); // add this at the top if not already

// ---------------------- DNS ----------------------
dns.setServers(["8.8.8.8", "1.1.1.1"]);
console.log("🔧 DNS servers set to Google + Cloudflare");

// ---------------------- Express Setup ----------------------
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4403;

// ---------------------- Geonix Config ----------------------
const GEONIX_PROXY = {
  host: process.env.GEONIX_PROXY_HOST || "res.geonix.com",
  basePort: parseInt(process.env.GEONIX_PROXY_PORT || "10000", 10),
  username: process.env.GEONIX_PROXY_USER || "",
  password: process.env.GEONIX_PROXY_PASS || "",
  maxPorts: 10, // number of ports Geonix allows
};

// Disable TLS cert check (Geonix often mismatches certs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ---------------------- Proxy Helpers ----------------------
function buildProxyUrl(port) {
  const { username, password, host } = GEONIX_PROXY;
  return `https://${encodeURIComponent(username)}:${encodeURIComponent(
    password
  )}@${host}:${port}`;
}

// rotate ports randomly for each request
function getRandomPort() {
  if (!healthyPorts || healthyPorts.length === 0)
    return (
      GEONIX_PROXY.basePort + Math.floor(Math.random() * GEONIX_PROXY.maxPorts)
    );
  return healthyPorts[Math.floor(Math.random() * healthyPorts.length)];
}

function newProxyAgent(port) {
  const proxyUrl = buildProxyUrl(port);
  console.log(`🌐 [ProxyAgent] Creating new agent for ${proxyUrl}`);
  try {
    return new HttpsProxyAgent(proxyUrl);
  } catch (err) {
    console.warn(
      `⚠️ Proxy agent creation failed for port ${port}:`,
      err.message
    );
    return null;
  }
}

// ==========================================================  🩺 Proxy Health Checker
async function testProxyPort(port) {
  const testUrl = "https://httpbin.org/ip"; // lightweight endpoint
  const proxyUrl = buildProxyUrl(port);
  const agent = new HttpsProxyAgent(proxyUrl);
  const start = Date.now();

  try {
    const res = await axios.get(testUrl, {
      timeout: 8000,
      httpsAgent: agent,
      httpAgent: agent,
      proxy: false,
      validateStatus: (s) => s === 200,
    });

    const ms = Date.now() - start;
    console.log(`✅ [Proxy ${port}] OK (${ms}ms) via ${res.data.origin}`);
    return { port, ok: true, latency: ms };
  } catch (err) {
    console.warn(`❌ [Proxy ${port}] ${err.code || err.message}`);
    return { port, ok: false };
  }
}

// 🧩 Test all available Geonix ports
async function getHealthyProxies() {
  const results = await Promise.all(
    Array.from({ length: GEONIX_PROXY.maxPorts }, (_, i) =>
      testProxyPort(GEONIX_PROXY.basePort + i)
    )
  );

  const healthy = results.filter((r) => r.ok).map((r) => r.port);
  if (healthy.length === 0) {
    console.warn(
      "⚠️ No healthy Geonix proxies found — using all ports anyway."
    );
    return Array.from(
      { length: GEONIX_PROXY.maxPorts },
      (_, i) => GEONIX_PROXY.basePort + i
    );
  }

  console.log(`🌐 Healthy proxies: ${healthy.join(", ")}`);
  return healthy;
}

// Keep healthy ports globally
let healthyPorts = [];

// Run at startup
(async () => {
  healthyPorts = await getHealthyProxies();

  // Re-test every 10 minutes automatically
  setInterval(async () => {
    console.log("🔄 Re-testing Geonix proxies...");
    healthyPorts = await getHealthyProxies();
  }, 10 * 60 * 1000);
})();

// ---------------------- Axios Fetch with retries ----------------------
async function fetchWithRetries(url, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const port = getRandomPort();
    const proxyUrl = buildProxyUrl(port);
    const agent = newProxyAgent(port);
    if (!agent) continue;

    console.log(
      `🔄 [Axios Attempt ${attempt}/${retries}] Fetching ${url} via ${proxyUrl}`
    );

    try {
      const res = await axios.get(url, {
        timeout: 45000,
        maxRedirects: 5,
        httpAgent: agent,
        httpsAgent: agent,
        proxy: false,
        headers: {
          "User-Agent":
            process.env.SCRAPER_USER_AGENT ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "close",
        },
        responseType: "text",
        validateStatus: (s) => s >= 200 && s < 400,
      });

      console.log(
        `✅ [Axios] Success via ${proxyUrl} (status=${res.status}, len=${res.data?.length})`
      );
      return res.data;
    } catch (err) {
      console.warn(
        `❌ [Axios Attempt ${attempt}] ${err.code || ""} ${err.message}`
      );
      if (attempt === retries) throw err;
      await new Promise((r) =>
        setTimeout(r, delay + Math.floor(Math.random() * 500))
      );
    }
  }
}

// ---------------------- Puppeteer Fetch via Geonix ----------------------
// ---------------------- Puppeteer Fetch via Geonix ----------------------
async function openWithPuppeteer(url, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const port = getRandomPort();
    const proxyFullUrl = buildProxyUrl(port);
    const proxyHostport = `${GEONIX_PROXY.host}:${port}`;

    console.log(`🦊 [Puppeteer Attempt ${attempt}] via ${proxyFullUrl}`);

    const launchArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--ignore-certificate-errors",
      `--proxy-server=https://${proxyHostport}`, // ✅ HTTPS instead of HTTP
    ];

    const browser = await puppeteer.launch({
      headless: true,
      args: launchArgs,
    });
    const page = await browser.newPage();

    await page.authenticate({
      username: GEONIX_PROXY.username,
      password: GEONIX_PROXY.password,
    });

    await page.setUserAgent(
      process.env.SCRAPER_USER_AGENT ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    try {
      console.log(`🌍 [Puppeteer] Navigating to ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 100000 });
      const content = await page.content();
      console.log(
        `✅ [Puppeteer] Page loaded (${content.length} chars) via ${proxyFullUrl}`
      );
      await browser.close();
      return content;
    } catch (err) {
      console.warn(`⚠️ [Puppeteer Attempt ${attempt}] ${err.message}`);
      await browser.close();
      if (attempt < maxAttempts) {
        console.log("🔁 Retrying Puppeteer with another proxy...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

// ---------------------- Social Links Extractor ----------------------
function extractSocialLinks(pageHtml) {
  const $ = cheerio.load(pageHtml);
  const anchors = $("a[href]")
    .map((i, el) => $(el).attr("href"))
    .get();
  const links = { facebook: "", instagram: "", linkedin: "" };

  for (const href of anchors) {
    if (!href) continue;
    const u = href.trim().toLowerCase();
    if (!links.facebook && /(facebook\.com|fb\.com|fb\.me)/.test(u))
      links.facebook = href;
    else if (!links.instagram && /(instagram\.com|instagr\.am)/.test(u))
      links.instagram = href;
    else if (!links.linkedin && /(linkedin\.com|lnkd\.in)/.test(u))
      links.linkedin = href;
  }

  return links;
}

// ---------------------- Main Route ----------------------
app.get("/website", async (req, res) => {
  const defaultResponse = {
    content: "",
    facebook: "",
    instagram: "",
    linkedin: "",
    status: "failed",
  };
  let targetUrl = req.query.url || req.query.website;
  if (!targetUrl) return res.json(defaultResponse);
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = `https://${targetUrl}`;

  console.log(`🚀 [Request] New scrape request: ${targetUrl}`);

  try {
    let pageHtml = "";
    try {
      pageHtml = await fetchWithRetries(targetUrl, 3, 800);
      console.log("🧩 [DEBUG] Raw HTML length:", pageHtml.length);
    } catch (err) {
      console.warn("⚠️ Axios fast-fetch failed:", err.message);
    }

    const looksLikeSPA =
      /<div id="root"|ng-app|__NEXT_DATA__|data-reactroot/.test(pageHtml);

    if (!pageHtml || pageHtml.length < 100 || looksLikeSPA) {
      console.log("🔁 Falling back to Puppeteer...");
      try {
        pageHtml = await openWithPuppeteer(targetUrl);
      } catch (puppErr) {
        console.warn(
          "⚠️ Puppeteer failed, keeping Axios result:",
          puppErr.message
        );
      }
    } else {
      console.log("✅ Axios provided sufficient HTML, skipping Puppeteer.");
    }

    if (!pageHtml) {
      console.error("❌ No HTML content retrieved");
      return res.json(defaultResponse);
    }

    const cleanText = convert(pageHtml, {
      wordwrap: false,
      selectors: [
        { selector: "a", format: "inline" },
        { selector: "img", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
      ],
    }).trim();

    const socialLinks = extractSocialLinks(pageHtml);
    const status =
      cleanText.length > 30 || Object.values(socialLinks).some((l) => l !== "")
        ? "success"
        : "failed";

    console.log(
      `📊 [Result] text=${cleanText.length} chars, fb=${socialLinks.facebook}, ig=${socialLinks.instagram}, li=${socialLinks.linkedin}, status=${status}`
    );
    res.json({ content: cleanText, ...socialLinks, status });
  } catch (err) {
    console.error(`❌ [Error] ${err.message}`);
    res.json(defaultResponse);
  }
});

// ---------------------- Start Server ----------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

// ---------------------- Test Route ----------------------
app.get("/test-proxy", async (req, res) => {
  const url = req.query.url || "https://bluesales.ai";
  console.log(`🚀 [Test] Opening ${url} via Puppeteer + Geonix proxy`);

  try {
    const html = await openWithPuppeteer(url);
    console.log(`✅ [Test] Page loaded successfully, length=${html.length}`);
    return res.json({ status: "success", htmlLength: html.length });
  } catch (err) {
    console.error(`❌ [Test] Failed to open page: ${err.message}`);
    return res.json({ status: "failed", error: err.message });
  }
});
