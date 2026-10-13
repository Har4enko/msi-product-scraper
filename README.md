# MSI Product Scraper

A Node.js web scraper built with Playwright that extracts structured product information from the MSI US Official Store.

The scraper targets the **MSI MAG Z890 TOMAHAWK WIFI** motherboard and saves the collected information as JSON.

## Technologies

- Node.js
- JavaScript (CommonJS)
- Playwright
- Google Chrome

## Features

- Extracts product ID, title, brand, and category hierarchy
- Collects product description, pricing, and availability
- Extracts the main product image and additional high-resolution images
- Collects product specifications
- Supports structured product data (JSON-LD) when available
- Extracts ratings, review counts, GTIN, and MPN when available
- Normalizes whitespace, prices, and image URLs
- Removes duplicate images and specifications
- Saves the result to `output/product.json`

## Requirements

- Node.js
- npm
- Google Chrome

**Note:** The scraper uses Playwright with the installed Google Chrome browser in headed mode (`headless: false`). A graphical desktop environment is required.

## Installation

Clone the repository:

```bash
git clone https://github.com/Har4enko/msi-product-scraper.git
cd msi-product-scraper
```

Install dependencies:

```bash
npm ci
```

## Usage

Run the scraper:

```bash
npm run scrape
```

The scraper opens the MSI product page in Google Chrome, extracts product information, and saves the result to:

```text
output/product.json
```

## Target Product

**Product:** MSI MAG Z890 TOMAHAWK WIFI

**URL:** https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard/INTEL-Z890/MAG-Z890-TOMAHAWK-WIFI

## Output Schema

The generated JSON contains the following fields:

| Field                   | Type           | Description                                |
| ----------------------- | -------------- | ------------------------------------------ |
| `url`                   | string         | Product page URL                           |
| `item_id`               | string or null | MSI product identifier                     |
| `title`                 | string         | Product name                               |
| `brand`                 | string         | Manufacturer                               |
| `product_category`      | string or null | Main product category                      |
| `category_tree`         | array          | Category hierarchy with names and URLs     |
| `description`           | string or null | Product description                        |
| `price`                 | number or null | Regular product price                      |
| `sale_price`            | number or null | Sale price, when available                 |
| `availability`          | string or null | `in_stock`, `out_of_stock`, or `pre_order` |
| `image_url`             | string or null | Main product image                         |
| `additional_image_urls` | array          | Additional product image URLs              |
| `specs`                 | array          | Product specifications as name/value pairs |
| `star_rating`           | number or null | Product rating, when available             |
| `review_count`          | number or null | Number of reviews, when available          |
| `gtin`                  | string or null | Global Trade Item Number                   |
| `mpn`                   | string or null | Manufacturer Part Number                   |
| `scraped_at`            | string         | Scraping timestamp in ISO 8601 format      |

Unavailable optional values are represented as `null`.

## Example Result

An example of the generated output is included in:

```text
output/product.json
```

## Limitations

- The scraper is designed for the specified MSI product page.
- It depends on the current HTML structure of the MSI store.
- Website layout changes may require selector updates.
- Availability and prices may change over time.
- The website may restrict automated browser access.
- Some optional product fields may not be provided by the website.

## License

This project was created as a technical assessment.
