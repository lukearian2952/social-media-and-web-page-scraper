# Social Media & Web Page Scraper

A Node.js microservice that scrapes web pages to extract text content and social media links (Facebook, Instagram, LinkedIn). Uses Axios for fast fetching with automatic Puppeteer fallback for JavaScript-rendered SPAs.

## Features

- Fast HTML fetching via Axios with retry logic
- Automatic Puppeteer fallback for SPAs (React, Angular, Next.js)
- Social media link extraction (Facebook, Instagram, LinkedIn)
- Proxy rotation support via Geonix residential proxies
- Automatic proxy health checking every 10 minutes
- HTML-to-text conversion with clean output

## Prerequisites

- Node.js >= 16
- Chromium / Google Chrome (for Puppeteer fallback)

## Installation

```bash
git clone https://github.com/lukearian2952/social-media-and-web-page-scraper.git
cd social-media-and-web-page-scraper
npm install
cp .env.example .env
# Fill in your proxy credentials in .env
```

## Configuration

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `4403` |
| `GEONIX_PROXY_HOST` | Proxy hostname | `res.geonix.com` |
| `GEONIX_PROXY_PORT` | Proxy base port | `10000` |
| `GEONIX_PROXY_USER` | Proxy username | *(required)* |
| `GEONIX_PROXY_PASS` | Proxy password | *(required)* |
| `SCRAPER_USER_AGENT` | Custom User-Agent string | Chrome 120 UA |

## Usage

```bash
node app.js
```

## API Endpoints

### `GET /website?url=<target_url>`

Scrapes the target URL and returns extracted text content and social media links.

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | The URL to scrape (also accepts `website`) |

**Response:**

```json
{
  "content": "Extracted page text...",
  "facebook": "https://facebook.com/example",
  "instagram": "https://instagram.com/example",
  "linkedin": "https://linkedin.com/company/example",
  "status": "success"
}
```

### `GET /test-proxy?url=<target_url>`

Tests proxy connectivity by loading a page through Puppeteer.

**Response:**

```json
{
  "status": "success",
  "htmlLength": 45231
}
```

## How It Works

1. Attempts fast fetch via Axios with rotating proxy
2. If the response looks like a SPA or is too short, falls back to Puppeteer
3. Extracts social media links from all anchor tags
4. Converts raw HTML to clean text using `html-to-text`

## Security Notes

- TLS certificate verification is disabled globally (`NODE_TLS_REJECT_UNAUTHORIZED=0`) to handle proxy certificate mismatches. Be aware of the implications if using in production.

## License

ISC
