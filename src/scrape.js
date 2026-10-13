const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

const PRODUCT_URL =
  "https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard/INTEL-Z890/MAG-Z890-TOMAHAWK-WIFI";

const OUTPUT_PATH = path.join(__dirname, "..", "output", "product.json");

const PRODUCT_NAME_PATTERN = /MAG\s*Z890\s*TOMAHAWK\s*WIFI/i;

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function cleanText(value) {
  if (typeof value !== "string") {
    return null;
  }

  return value.replace(/\s+/g, " ").trim() || null;
}

async function getText(locator) {
  try {
    if ((await locator.count()) === 0) {
      return null;
    }

    return cleanText(await locator.first().innerText({ timeout: 5000 }));
  } catch {
    return null;
  }
}

async function getAttribute(locator, attribute) {
  try {
    if ((await locator.count()) === 0) {
      return null;
    }

    return cleanText(await locator.first().getAttribute(attribute));
  } catch {
    return null;
  }
}

function firstValue(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function parsePrice(value) {
  if (value == null) {
    return null;
  }

  const match = String(value).match(/\d[\d,]*(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const price = Number(match[0].replace(/,/g, ""));

  return Number.isFinite(price) ? price : null;
}

function absoluteUrl(value, baseUrl) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, baseUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function parseAvailability(text) {
  const value = String(text || "").toLowerCase();

  if (/pre[\s-]?order|preorder|presale|coming soon/.test(value)) {
    return "pre_order";
  }

  if (
    /out[\s-]?of[\s-]?stock|outofstock|sold out|soldout|unavailable|discontinued/.test(
      value,
    )
  ) {
    return "out_of_stock";
  }

  if (/in[\s-]?stock|instock|limitedavailability|add to cart/.test(value)) {
    return "in_stock";
  }

  return null;
}

// --------------------------------------------------
// Structured data (JSON-LD)
// --------------------------------------------------

async function getStructuredData(page) {
  const scripts = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();

  const result = [];

  for (const script of scripts) {
    try {
      result.push(JSON.parse(script));
    } catch {
      // Ignore invalid JSON-LD.
    }
  }

  return result;
}

function flattenStructuredData(items) {
  const result = [];

  function visit(item) {
    if (!item || typeof item !== "object") {
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }

    result.push(item);

    if (item["@graph"]) {
      visit(item["@graph"]);
    }
  }

  visit(items);

  return result;
}

function findProductData(items) {
  return (
    flattenStructuredData(items).find((item) => {
      const type = item["@type"];

      const isProduct =
        type === "Product" || (Array.isArray(type) && type.includes("Product"));

      if (!isProduct) {
        return false;
      }

      // Do not use structured data belonging to another product.
      return PRODUCT_NAME_PATTERN.test(String(item.name || ""));
    }) || null
  );
}

function getOfferData(product) {
  const offers = product?.offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;

  if (!offer || typeof offer !== "object") {
    return {};
  }

  return {
    price: parsePrice(firstValue(offer.price, offer.lowPrice)),
    salePrice: parsePrice(offer.salePrice),
    availability: parseAvailability(offer.availability),
  };
}

// --------------------------------------------------
// Categories
// --------------------------------------------------

async function getBreadcrumbs(page) {
  const selectors = [
    'nav[aria-label*="breadcrumb" i] a',
    ".breadcrumb a",
    ".breadcrumbs a",
    '[class*="breadcrumb"] a',
  ];

  for (const selector of selectors) {
    const links = page.locator(selector);

    if ((await links.count()) === 0) {
      continue;
    }

    const result = [];

    for (const link of await links.all()) {
      const name = cleanText(await link.innerText());
      const href = await link.getAttribute("href");

      if (!name || /^home$/i.test(name)) {
        continue;
      }

      result.push({
        name,
        url: absoluteUrl(href, page.url()),
      });
    }

    if (result.length > 0) {
      return result;
    }
  }

  return [];
}

// --------------------------------------------------
// Product specifications
// --------------------------------------------------

async function getSpecs(page) {
  const specs = [];
  const seen = new Set();

  function addSpec(name, value) {
    name = cleanText(name);
    value = cleanText(value);

    if (!name || !value) {
      return;
    }

    const key = `${name.toLowerCase()}|${value.toLowerCase()}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    specs.push({ name, value });
  }

  // Specifications stored in HTML tables.
  const rows = page.locator("table tr");

  for (const row of await rows.all()) {
    const cells = await row.locator("th, td").allTextContents();

    if (cells.length >= 2) {
      addSpec(cells[0], cells.slice(1).join(" "));
    }
  }

  // Specifications stored as definition lists.
  const terms = page.locator("dt");

  for (const term of await terms.all()) {
    const name = await term.innerText();

    const value = await term.evaluate((element) => {
      const next = element.nextElementSibling;

      return next?.tagName === "DD" ? next.textContent : null;
    });

    addSpec(name, value);
  }

  return specs;
}

// --------------------------------------------------
// Product images
// --------------------------------------------------

async function getImages(page) {
  const sources = await page
    .locator("img")
    .evaluateAll((images) =>
      images
        .map((image) => image.getAttribute("src"))
        .filter(
          (src) =>
            src &&
            src.includes("/Z890TOMAHAWKWIFI/") &&
            src.includes("-1024x1024."),
        ),
    );

  const uniqueImages = [
    ...new Set(
      sources.map((src) => absoluteUrl(src, page.url())).filter(Boolean),
    ),
  ];

  return {
    imageUrl: uniqueImages[0] || null,
    additionalImageUrls: uniqueImages.slice(1),
  };
}

// --------------------------------------------------
// Product description
// --------------------------------------------------

async function getDescription(page, product) {
  const candidates = [
    await getText(page.locator('[class*="product"] [class*="description"]')),
    await getAttribute(page.locator('meta[name="description"]'), "content"),
    product?.description,
  ];

  const matchingDescription = candidates.find(
    (value) => typeof value === "string" && PRODUCT_NAME_PATTERN.test(value),
  );

  if (!matchingDescription) {
    return null;
  }

  return (
    cleanText(matchingDescription.replace(/^Unite as One\s*/i, "")) || null
  );
}

// --------------------------------------------------
// Main scraping logic
// --------------------------------------------------

async function scrapeProduct(page) {
  const response = await page.goto(PRODUCT_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  console.log("HTTP status:", response?.status());
  console.log("Final URL:", page.url());

  if (!response || !response.ok()) {
    throw new Error(`Failed to load product page: HTTP ${response?.status()}`);
  }

  // The product title is not necessarily inside an h1.
  // Check the actual product identifier instead.
  const productIdLocator = page.locator('input[name="product_id"]');

  await productIdLocator.waitFor({
    state: "attached",
    timeout: 30000,
  });

  const structuredData = await getStructuredData(page);
  const product = findProductData(structuredData);
  const offer = getOfferData(product);

  const title = firstValue(
    await getText(
      page.getByText(PRODUCT_NAME_PATTERN, {
        exact: false,
      }),
    ),
    product?.name,
    await getAttribute(page.locator('meta[property="og:title"]'), "content"),
  );

  if (!title || !PRODUCT_NAME_PATTERN.test(title)) {
    throw new Error(`Unexpected product page. Found title: ${title || "none"}`);
  }

  const itemId = firstValue(
    await getAttribute(productIdLocator, "value"),
    product?.productID,
    product?.sku,
  );

  const description = await getDescription(page, product);

  // Price and availability are taken from the product's
  // own price section, not from recommended products.
  const priceText = await getText(page.locator("#prices-new"));

  const salePriceText = await getText(
    page.locator('[class*="special-price"] .price, [class*="sale-price"]'),
  );

  const availabilityText = await getText(page.locator("#prices-wrapper"));

  const price = parsePrice(priceText) ?? offer.price ?? null;

  const salePrice = parsePrice(salePriceText) ?? offer.salePrice ?? null;

  const availability =
    parseAvailability(availabilityText) ?? offer.availability ?? null;

  const breadcrumbs = await getBreadcrumbs(page);

  const categoryTree = breadcrumbs.filter(
    (item) => !PRODUCT_NAME_PATTERN.test(item.name),
  );

  const images = await getImages(page);
  const specs = await getSpecs(page);

  const ratingValue = firstValue(
    product?.aggregateRating?.ratingValue,
    await getAttribute(page.locator('[itemprop="ratingValue"]'), "content"),
  );

  const reviewCountValue = firstValue(
    product?.aggregateRating?.reviewCount,
    product?.aggregateRating?.ratingCount,
    await getAttribute(page.locator('[itemprop="reviewCount"]'), "content"),
  );

  const manufacturerNumber =
    specs.find((spec) => /manufacturer number|mpn|part number/i.test(spec.name))
      ?.value ?? null;

  return {
    url: page.url(),

    item_id: itemId != null ? String(itemId) : null,

    title,

    brand: firstValue(
      typeof product?.brand === "string" ? product.brand : product?.brand?.name,
      await getText(page.locator('[itemprop="brand"]')),
      "MSI",
    ),

    product_category: categoryTree[0]?.name ?? null,

    category_tree: categoryTree,

    description,

    price,

    sale_price: salePrice,

    availability,

    image_url: images.imageUrl,

    additional_image_urls: images.additionalImageUrls,

    specs,

    star_rating:
      ratingValue != null && Number.isFinite(Number(ratingValue))
        ? Number(ratingValue)
        : null,

    review_count:
      reviewCountValue != null && Number.isFinite(Number(reviewCountValue))
        ? Number(reviewCountValue)
        : null,

    gtin:
      firstValue(
        product?.gtin,
        product?.gtin13,
        product?.gtin12,
        product?.gtin14,
      )?.toString() ?? null,

    mpn: firstValue(product?.mpn, manufacturerNumber),

    scraped_at: new Date().toISOString(),
  };
}

// --------------------------------------------------
// Application entry point
// --------------------------------------------------

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 1000,
      },
    });

    const result = await scrapeProduct(page);

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });

    await fs.writeFile(
      OUTPUT_PATH,
      JSON.stringify(result, null, 2) + "\n",
      "utf8",
    );

    console.log(`Product data saved to: ${OUTPUT_PATH}`);

    console.log(`Title: ${result.title}`);
    console.log(`Price: ${result.price}`);
    console.log(`Availability: ${result.availability}`);
    console.log(`Specs found: ${result.specs.length}`);
    console.log(
      `Images found: ${
        result.additional_image_urls.length + (result.image_url ? 1 : 0)
      }`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Scraping failed:", error.message);

  process.exitCode = 1;
});
