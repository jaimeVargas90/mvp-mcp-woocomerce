# 🚀 MCP WooCommerce Multi-Tenant Server

A Model Context Protocol (MCP) server designed to empower AI chatbots (UChat, 5ire, Claude, etc.) with complete E-commerce capabilities, supporting multiple stores simultaneously.

## 📖 Description

This project acts as an "intelligent bridge" between your AI assistants and WooCommerce. Unlike a simple integration, this server:

*   **Multi-Client:** A single server instance can manage hundreds of different stores.
*   **Contextual:** Tools are designed for the AI to understand context (e.g., if searching for shoes, it returns available sizes; if the user wants to cancel, it changes the order status).
*   **Secure:** Validates data before sending it to WooCommerce and protects critical actions.

## ✨ Key Features

*   **Multi-Tenant Architecture:** Dynamic store selection via the `x-client-id` header.
*   **Performance Optimization:** In-memory cache system for client configuration (avoids redundant disk reads).
*   **Robust Validation:** Uses Zod to ensure the AI sends correct data.
*   **Clean Responses:** Processes WooCommerce responses (cleans HTML, summarizes data) to save tokens and improve AI comprehension.

## 🛠️ Tool Catalog

The server exposes the following functions to the AI:

### 1. 🔍 searchWooProducts (Master Search)

All-in-one tool for product discovery.

*   **Functions:** Search by keyword, filter by price range, pagination, and sorting (price, newness, relevance).
*   **Intelligence:**
    *   If no search term is provided, it lists the catalog (new arrivals).
    *   Returns variation IDs and attributes (Size, Color) to facilitate precise selling.
    *   Cleans HTML from descriptions.

### 2. 🛒 createOrder (Sales)

Order generation.

*   **Capabilities:**
    *   Supports simple and variable products (using `variationId`).
    *   Supports customer notes ("Broken doorbell").
    *   Sets "Cash on Delivery" payment by default.
*   **Output:** Returns a structured JSON with order ID, total, and status.

### 3. 📦 getOrderStatus (Post-Sale)

Status query for customer support.

*   **Returned Info:** Current status, total, items, and shipping address (useful for confirming destination).
*   **Security:** Handles 404 errors gracefully if the user provides an incorrect ID.

### 4. 📝 updateOrder (Management)

Order modification and cancellation.

*   **Uses:**
    *   Cancel: Changing status to `cancelled`.
    *   Correct: Modify address, phone, or email.
*   **Restrictions:** Does not allow editing orders that are already "Completed" or "Shipped".

### 5. 🚚 getShippingMethods (Logistics)

Shipping cost calculator.

*   **Logic:** Receives a country code (e.g., CO, MX), searches for the corresponding Shipping Zone in WooCommerce, and returns available methods and costs.

### 6. 🎟️ checkCoupon (Marketing)

Discount validation.

*   **Functions:** Verifies existence, expiration, and discount amount of a promotional code.

### 7. 📂 getStoreCategories (Catalog)

Category listing.

*   **Functions:** Retrieves the list of product categories from the store.
*   **Use Case:** Use when the user asks what type of products are sold in general.

## ⚙️ Installation and Configuration

### 1. Prerequisites

*   Node.js (v18 or higher)
*   NPM
*   One or multiple WooCommerce stores with API Keys generated (Read/Write Permissions).

### 2. Environment Variables Configuration

Create a `.env` file in the root. The `CLIENTS` variable must be a JSON String containing the array of stores.

```env
PORT=3000
# Example configuration for 2 clients
CLIENTS='[
  {
    "clientId": "client_alpha",
    "storeUrl": "https://clothing-store.com",
    "consumerKey": "ck_XXXXXXXXXXXXXXXX",
    "consumerSecret": "cs_XXXXXXXXXXXXXXXX"
  },
  {
    "clientId": "client_beta",
    "storeUrl": "https://shoe-store.com",
    "consumerKey": "ck_YYYYYYYYYYYYYYYY",
    "consumerSecret": "cs_YYYYYYYYYYYYYYYY"
  }
]'
```

### 3. Execution

```bash
# Install dependencies
npm install

# Development Mode (with auto-reload)
npm run dev

# Production Mode
npm start
```

## 🔌 Integration with UChat / 5ire

To connect your chatbot, configure your HTTP Request or Action as follows:

*   **URL:** `https://your-railway-domain.app/mcp`
*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type`: `application/json`
    *   `x-client-id`: The ID you configured in the JSON (e.g., `client_alpha`).

The message body (Body) will be handled automatically by the MCP protocol.

## 📂 Project Structure

```
src/
├── index.ts           # 🧠 Main Server (Express + MCP + Multi-tenant Logic)
├── types.ts           # 📄 Type Definitions (TS Interfaces)
└── tools/             # 🧰 Modular Tools Folder
    ├── index.ts             # Central tool registration
    ├── search-products.tool.ts  # Advanced search
    ├── create-order.tool.ts     # Order creation
    ├── get-order.tool.ts        # Status query
    ├── update-order.tool.ts     # Edit/Cancel
    ├── get-shipping.tool.ts     # Shipping calculation
    ├── check-coupon.tool.ts     # Coupon validation
    └── get-categories.tool.ts   # Category listing
```
