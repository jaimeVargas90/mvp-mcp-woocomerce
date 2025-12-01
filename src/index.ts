import "dotenv/config";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pkg from "@woocommerce/woocommerce-rest-api";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools } from "./tools/index.js";

// Adjust to import WooCommerce library in ESM/TypeScript environments
const WooCommerceRestApi = (pkg as any).default || pkg;

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// ==================================================================
// Performance Optimization: Client Cache
// ==================================================================
let CLIENTS_CACHE: any[] = [];

try {
  const envClients = process.env.CLIENTS || "[]";
  CLIENTS_CACHE = JSON.parse(envClients);

  if (CLIENTS_CACHE.length > 0) {
    console.log(`✅ Configuration loaded successfully: ${CLIENTS_CACHE.length} clients in memory.`);
  } else {
    console.warn("⚠️ WARNING: Client list is empty (CLIENTS=[] or empty).");
  }

} catch (error) {
  console.error("❌ CRITICAL ERROR ON STARTUP:");
  console.error("The CLIENTS environment variable does not contain valid JSON.");
  process.exit(1);
}

// ------------------------------------------------------------------
// MCP Master Endpoint
// ------------------------------------------------------------------
app.use("/mcp", async (req, res) => {
  console.log(`📨 Incoming MCP Request (${req.method})`);

  const clientId = req.headers["x-client-id"] as string;

  if (!clientId) {
    console.error("❌ Error: Missing X-Client-ID header");
    return res.status(400).send("Missing X-Client-ID header");
  }

  // Optimized in-memory search
  const clientData = CLIENTS_CACHE.find((c: any) => c.clientId === clientId);

  if (!clientData) {
    console.warn(`⚠️ Client not found or unauthorized: ${clientId}`);
    return res.status(404).send(`Client not configured: ${clientId}`);
  }

  const server = new Server(
    {
      name: "woo-mcp-multiclient",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // -- Handler to list tools --
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const mcpTools = tools.map((tool) => ({
      name: tool.name,
      description: `${tool.description} (Store: ${clientData.storeUrl})`,
      inputSchema: zodToJsonSchema(tool.inputSchema),
    }));

    return { tools: mcpTools };
  });

  // -- Handler to execute tools --
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find((t) => t.name === name);

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Initialize Woo with "Stealth Mode" to evade Firewalls (403)
    const api = new WooCommerceRestApi({
      url: clientData.storeUrl,
      consumerKey: clientData.consumerKey,
      consumerSecret: clientData.consumerSecret,
      version: "wc/v3",
      queryStringAuth: true,
      // Improved Disguise: Headers to simulate a real browser
      axiosConfig: {
        headers: {
          // Identidad de navegador estándar
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",

          // Cabeceras de seguridad avanzadas (Client Hints) para parecer Chrome real
          "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",

          "Cache-Control": "max-age=0",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1"
        }
      }
    });

    try {
      // Execute tool logic
      return await tool.handler(api, args);

    } catch (error: any) {
      // Detailed log to diagnose blocks
      console.error(`🚨 CRITICAL Error executing ${name}:`, error.message);

      if (error.response) {
        console.error("🔴 Status Code:", error.response.status);
        console.error("🔴 Headers:", JSON.stringify(error.response.headers));

        // Try to show useful error data
        const errorData = error.response.data;
        if (typeof errorData === 'object') {
          console.error("🔴 Data (JSON):", JSON.stringify(errorData));
        } else {
          // If HTML (common in WAFs), show a fragment
          console.error("🔴 Data (HTML/Text):", errorData ? errorData.toString().substring(0, 300) : "No data");
        }
      }

      return {
        content: [{ type: "text", text: `Store Connection Error: ${error.message}. (See server logs)` }],
        isError: true,
      };
    }
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Clean up resources on connection close
  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`🚀 Multi-Client Server running on port ${PORT}`);
});