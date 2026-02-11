/**
 * ═══════════════════════════════════════════════════════════════════
 *  IMAGE SEARCH — Pexels Product Image Discovery
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Searches the Pexels free stock photo API for product images.
 *  Returns high-quality image URLs ready to upload to Shopify or
 *  any e-commerce platform.
 *
 *  REQUIRED ENV VARS:
 *    PEXELS_API_KEY=xxxxxxxxx     (free at https://www.pexels.com/api/)
 *
 *  REQUIRED PACKAGES:
 *    npm install axios dotenv
 *
 *  USAGE:
 *    import { searchProductImages, batchSearchImages } from './image-search.js';
 *
 *    // Search for images of a single product
 *    const images = await searchProductImages('bamboo bath caddy', 3);
 *    // Returns: ['https://images.pexels.com/...', 'https://...', 'https://...']
 *
 *    // Batch search for multiple products
 *    const results = await batchSearchImages([
 *      { name: 'Bamboo Bath Caddy', imageSearch: 'bamboo bath caddy' },
 *      { name: 'Memory Foam Pillow', imageSearch: 'memory foam pillow' },
 *      { name: 'LED Desk Lamp' },  // uses name as search term
 *    ], 3);
 *    // Returns: Map<string, string[]> — product name -> image URLs
 *
 *  NOTES:
 *    - Free tier: 200 requests/hour, 20,000 requests/month
 *    - Returns square-oriented photos (best for product listings)
 *    - Large 2x resolution by default (great for e-commerce)
 *    - These are STOCK PHOTOS — not actual product photos
 *    - Best for lifestyle/category images, not specific product shots
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import axios from 'axios';

// ─── CONFIG ───────────────────────────────────────────────────────

const PEXELS_BASE = 'https://api.pexels.com/v1';
const API_KEY = process.env.PEXELS_API_KEY;

function log(level, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [${level}] ${msg}`);
}

// ─── SEARCH IMAGES ────────────────────────────────────────────────

/**
 * Search for product images via Pexels API.
 * Returns an array of high-quality image URLs.
 *
 * @param {string} query — product name or search term
 * @param {number} count — how many images (default 3, max 10)
 * @returns {string[]} — array of image URLs
 */
export async function searchProductImages(query, count = 3) {
  if (!API_KEY) {
    log('warn', 'PEXELS_API_KEY not configured — skipping image search');
    return [];
  }

  try {
    const { data } = await axios.get(`${PEXELS_BASE}/search`, {
      headers: { Authorization: API_KEY },
      params: {
        query,
        per_page: Math.min(count, 10),
        orientation: 'square',
      },
      timeout: 10000,
    });

    const urls = (data.photos || []).map(photo =>
      photo.src.large2x || photo.src.large || photo.src.original
    );

    log('info', `Found ${urls.length} images for "${query}"`);
    return urls;
  } catch (err) {
    log('warn', `Image search failed for "${query}": ${err.message}`);
    return [];
  }
}

// ─── BATCH SEARCH ─────────────────────────────────────────────────

/**
 * Search images for multiple products in batch.
 * Includes a short delay between requests to respect rate limits.
 *
 * @param {Array<{name: string, imageSearch?: string}>} products
 * @param {number} imagesPerProduct — images per product (default 3)
 * @returns {Map<string, string[]>} — map of product name -> image URLs
 */
export async function batchSearchImages(products, imagesPerProduct = 3) {
  if (!API_KEY) {
    log('warn', 'PEXELS_API_KEY not configured — skipping batch image search');
    return new Map();
  }

  const results = new Map();

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const query = product.imageSearch || product.name;
    const images = await searchProductImages(query, imagesPerProduct);
    results.set(product.name, images);

    // Rate limit: 200 requests/hour = ~3.3/sec, but be conservative
    if (i < products.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const totalImages = [...results.values()].reduce((sum, imgs) => sum + imgs.length, 0);
  log('info', `Batch search complete: ${results.size} products, ${totalImages} total images`);
  return results;
}
