/**
 * ═══════════════════════════════════════════════════════════════════
 *  SHOPIFY SYNC — Product & Order Sync + Management Tool
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Syncs products and orders from Shopify to PostgreSQL, pushes
 *  optimized descriptions back, creates products, and manages images.
 *
 *  REQUIRED ENV VARS:
 *    SHOPIFY_STORE_NAME=your-store        (without .myshopify.com)
 *    SHOPIFY_ACCESS_TOKEN=shpat_xxx
 *    DATABASE_URL=postgresql://user:pass@host:5432/dbname
 *    DATABASE_SSL=true|false              (optional)
 *
 *  REQUIRED PACKAGES:
 *    npm install shopify-api-node pg dotenv
 *
 *  USAGE:
 *    import { syncProducts, syncOrders, pushDescriptionToShopify,
 *             createProduct, addProductImages, removeAllImages,
 *             getStoreInfo } from './shopify-sync.js';
 *
 *    // Sync all products from Shopify -> your database
 *    const products = await syncProducts();
 *
 *    // Sync recent orders
 *    const orders = await syncOrders('any', 50);
 *
 *    // Push an optimized description back to Shopify
 *    await pushDescriptionToShopify(productId);
 *
 *    // Push all optimized descriptions at once
 *    const results = await pushAllOptimized();
 *
 *    // Create a new product in Shopify (with optional images)
 *    const product = await createProduct({
 *      name: 'Cozy Blanket',
 *      description: '<p>Super soft and warm</p>',
 *      category: 'Bedding',
 *      sellPrice: 29.99,
 *      compareAtPrice: 49.99,
 *      images: ['https://example.com/image1.jpg'],
 *    });
 *
 *    // Add images to an existing product
 *    await addProductImages(shopifyProductId, ['https://...']);
 *
 *    // Remove all images from a product
 *    await removeAllImages(shopifyProductId);
 *
 *    // Get store metadata
 *    const info = await getStoreInfo();
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import Shopify from 'shopify-api-node';
import pg from 'pg';

// ─── CONFIG ───────────────────────────────────────────────────────

const STORE_NAME = process.env.SHOPIFY_STORE_NAME;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

// ─── SHOPIFY CLIENT ───────────────────────────────────────────────

let shopify = null;

function getShopify() {
  if (!shopify) {
    if (!STORE_NAME || !ACCESS_TOKEN) {
      throw new Error('SHOPIFY_STORE_NAME and SHOPIFY_ACCESS_TOKEN env vars are required');
    }
    shopify = new Shopify({
      shopName: STORE_NAME,
      accessToken: ACCESS_TOKEN,
      apiVersion: '2024-10',
    });
  }
  return shopify;
}

// ─── DATABASE (optional — for sync features) ─────────────────────

let pool = null;
let db = null;

if (DATABASE_URL) {
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 5,
  });

  // Minimal query helper (or import pg-query-builder.js for full Supabase API)
  db = {
    query: (sql, params) => pool.query(sql, params),
  };
}

function log(level, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [${level}] ${msg}`);
}

// ─── SYNC PRODUCTS ────────────────────────────────────────────────

/**
 * Sync all products from Shopify -> PostgreSQL
 * Handles pagination automatically.
 *
 * Requires DB table: products (shopify_id, title, handle, vendor,
 *   product_type, original_description, tags, images, variants,
 *   price, compare_at_price, status, synced_at)
 */
export async function syncProducts() {
  log('info', 'Syncing products from Shopify...');

  let allProducts = [];
  let params = { limit: 250 };

  do {
    const products = await getShopify().product.list(params);
    allProducts = allProducts.concat(products);
    params = products.nextPageParameters || null;
  } while (params);

  log('info', `Fetched ${allProducts.length} products from Shopify`);

  if (!db) {
    log('warn', 'No DATABASE_URL — returning products without saving');
    return allProducts;
  }

  // Upsert each product
  for (const p of allProducts) {
    const record = {
      shopify_id: p.id,
      title: p.title,
      handle: p.handle,
      vendor: p.vendor,
      product_type: p.product_type,
      original_description: p.body_html || '',
      tags: p.tags ? p.tags.split(', ') : [],
      images: p.images.map(img => ({ id: img.id, src: img.src, alt: img.alt })),
      variants: p.variants.map(v => ({
        id: v.id, title: v.title, price: v.price,
        compare_at_price: v.compare_at_price, sku: v.sku,
        inventory_quantity: v.inventory_quantity,
      })),
      price: parseFloat(p.variants[0]?.price || 0),
      compare_at_price: parseFloat(p.variants[0]?.compare_at_price || 0) || null,
      status: p.status,
      synced_at: new Date().toISOString(),
    };

    await db.query(`
      INSERT INTO products (shopify_id, title, handle, vendor, product_type, original_description, tags, images, variants, price, compare_at_price, status, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (shopify_id) DO UPDATE SET
        title = EXCLUDED.title, handle = EXCLUDED.handle, vendor = EXCLUDED.vendor,
        product_type = EXCLUDED.product_type, original_description = EXCLUDED.original_description,
        tags = EXCLUDED.tags, images = EXCLUDED.images, variants = EXCLUDED.variants,
        price = EXCLUDED.price, compare_at_price = EXCLUDED.compare_at_price,
        status = EXCLUDED.status, synced_at = EXCLUDED.synced_at
    `, [record.shopify_id, record.title, record.handle, record.vendor, record.product_type,
        record.original_description, JSON.stringify(record.tags), JSON.stringify(record.images),
        JSON.stringify(record.variants), record.price, record.compare_at_price,
        record.status, record.synced_at]);
  }

  log('info', `Synced ${allProducts.length} products to database`);
  return allProducts;
}

// ─── SYNC ORDERS ──────────────────────────────────────────────────

/**
 * Sync orders from Shopify -> PostgreSQL
 *
 * @param {string} status  — 'any', 'open', 'closed', 'cancelled'
 * @param {number} limit   — max orders to fetch (default 50)
 */
export async function syncOrders(status = 'any', limit = 50) {
  log('info', `Syncing orders (status: ${status})...`);

  const orders = await getShopify().order.list({ status, limit, order: 'created_at DESC' });

  if (!db) {
    log('warn', 'No DATABASE_URL — returning orders without saving');
    return orders;
  }

  for (const o of orders) {
    await db.query(`
      INSERT INTO tracked_orders (shopify_order_id, order_number, customer_email, customer_name, total_price, fulfillment_status, tracking_number, tracking_url, carrier, ordered_at, shipped_at, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (shopify_order_id) DO UPDATE SET
        fulfillment_status = EXCLUDED.fulfillment_status, tracking_number = EXCLUDED.tracking_number,
        tracking_url = EXCLUDED.tracking_url, carrier = EXCLUDED.carrier,
        shipped_at = EXCLUDED.shipped_at, synced_at = EXCLUDED.synced_at
    `, [o.id, o.name, o.email,
        o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : null,
        parseFloat(o.total_price), o.fulfillment_status || 'unfulfilled',
        o.fulfillments?.[0]?.tracking_number || null,
        o.fulfillments?.[0]?.tracking_url || null,
        o.fulfillments?.[0]?.tracking_company || null,
        o.created_at, o.fulfillments?.[0]?.created_at || null,
        new Date().toISOString()]);
  }

  log('info', `Synced ${orders.length} orders`);
  return orders;
}

// ─── PUSH DESCRIPTION TO SHOPIFY ──────────────────────────────────

/**
 * Push an optimized description from the DB back to Shopify
 *
 * @param {string|number} shopifyProductId — the Shopify product ID
 * @param {string} htmlDescription — the new description HTML
 */
export async function pushDescriptionToShopify(shopifyProductId, htmlDescription) {
  await getShopify().product.update(shopifyProductId, {
    body_html: htmlDescription,
  });
  log('info', `Pushed description to Shopify product ${shopifyProductId}`);
  return { success: true };
}

/**
 * Push all optimized descriptions from DB to Shopify
 * Reads products where optimized_description is set but pushed_to_shopify is false.
 */
export async function pushAllOptimized() {
  if (!db) throw new Error('DATABASE_URL required for pushAllOptimized');

  const { rows: products } = await db.query(
    `SELECT id, shopify_id, optimized_description FROM products
     WHERE optimized_description IS NOT NULL AND pushed_to_shopify = false`
  );

  log('info', `Pushing ${products.length} optimized descriptions to Shopify...`);
  const results = [];

  for (const product of products) {
    try {
      await getShopify().product.update(product.shopify_id, {
        body_html: product.optimized_description,
      });
      await db.query('UPDATE products SET pushed_to_shopify = true WHERE id = $1', [product.id]);
      results.push({ id: product.id, status: 'success' });
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      results.push({ id: product.id, status: 'failed', error: err.message });
    }
  }

  return results;
}

// ─── CREATE PRODUCT ───────────────────────────────────────────────

/**
 * Create a product in Shopify
 *
 * @param {object} productData
 * @param {string} productData.name — product title
 * @param {string} productData.description — HTML body
 * @param {string} productData.category — product type
 * @param {number} productData.sellPrice — price
 * @param {number} productData.compareAtPrice — compare at price
 * @param {string} productData.vendor — vendor name
 * @param {string} productData.tags — comma-separated tags
 * @param {string[]} productData.images — array of image URLs
 */
export async function createProduct(productData) {
  const images = (productData.images || []).map(img =>
    typeof img === 'string' ? { src: img } : img
  );

  const payload = {
    title: productData.name || productData.title,
    body_html: productData.description || '',
    vendor: productData.vendor || 'Import',
    product_type: productData.category || '',
    tags: productData.tags || '',
    variants: [{
      price: productData.sellPrice || productData.price,
      compare_at_price: productData.compareAtPrice || null,
      requires_shipping: true,
    }],
    status: 'draft',
  };

  if (images.length > 0) payload.images = images;

  const product = await getShopify().product.create(payload);
  log('info', `Created product "${product.title}" — ${product.images?.length || 0} images`);
  return product;
}

// ─── IMAGE MANAGEMENT ─────────────────────────────────────────────

/**
 * Add images to an existing Shopify product
 *
 * @param {string|number} shopifyProductId
 * @param {string[]} imageUrls — array of image URLs
 */
export async function addProductImages(shopifyProductId, imageUrls) {
  const results = [];
  for (const url of imageUrls) {
    try {
      const image = await getShopify().productImage.create(shopifyProductId, { src: url });
      results.push({ url, status: 'added', id: image.id });
    } catch (err) {
      results.push({ url, status: 'failed', error: err.message });
    }
  }
  log('info', `Added ${results.filter(r => r.status === 'added').length}/${imageUrls.length} images to product ${shopifyProductId}`);
  return results;
}

/**
 * Remove all images from a Shopify product
 *
 * @param {string|number} shopifyProductId
 */
export async function removeAllImages(shopifyProductId) {
  const images = await getShopify().productImage.list(shopifyProductId);
  let removed = 0;

  for (const img of images) {
    try {
      await getShopify().productImage.delete(shopifyProductId, img.id);
      removed++;
    } catch (err) {
      log('warn', `Failed to delete image ${img.id}: ${err.message}`);
    }
  }

  log('info', `Removed ${removed}/${images.length} images from product ${shopifyProductId}`);
  return { total: images.length, removed };
}

// ─── STORE INFO ───────────────────────────────────────────────────

/**
 * Get Shopify store metadata and policies
 */
export async function getStoreInfo() {
  const shop = await getShopify().shop.get();
  const policies = await getShopify().policy.list();
  return { shop, policies };
}

// ─── EXPORT RAW CLIENT ───────────────────────────────────────────

export { getShopify, pool };
