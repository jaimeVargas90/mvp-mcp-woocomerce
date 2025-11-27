import "dotenv/config";
import express from "express";
import cors from "cors"; // Necesitas instalarlo: npm install cors
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pkg from "@woocommerce/woocommerce-rest-api";
import { ALL_TOOLS } from "./tools/index.js";

const WooCommerceRestApi = (pkg as any).default || pkg;

const app = express();

// 1. Configuración de CORS (Igual que Shopify pero explícito)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Client-ID"],
  })
);

app.use(express.json());
const PORT = process.env.PORT || 3000;

// 2. Ruta POST específica (Igual que en tu server.ts de Shopify)
app.post("/mcp", async (req, res) => {
  console.log(`📨 Petición MCP entrante (POST)`);

  const clientId = req.headers["x-client-id"] as string;

  if (!clientId) {
    return res.status(400).json({
      error: "Falta el header X-Client-ID",
      details:
        "Asegúrate de enviar el header 'X-Client-ID' con el ID de tu tienda.",
    });
  }

  const clientsEnv = process.env.CLIENTS;
  if (!clientsEnv) {
    return res
      .status(500)
      .json({ error: "Error interno: Variable CLIENTS no configurada" });
  }

  let clientData;
  try {
    const clients = JSON.parse(clientsEnv);
    clientData = clients.find((c: any) => c.clientId === clientId);
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Error interno: JSON de clientes inválido" });
  }

  if (!clientData) {
    console.warn(`⚠️ Cliente no encontrado: ${clientId}`);
    return res
      .status(404)
      .json({ error: `Cliente no encontrado: ${clientId}` });
  }

  console.log(`🔑 Cliente autenticado: ${clientId}`);

  // 3. Inicializar API Woo
  const wooApi = new WooCommerceRestApi({
    url: clientData.storeUrl,
    consumerKey: clientData.consumerKey,
    consumerSecret: clientData.consumerSecret,
    version: "wc/v3",
  });

  // 4. Crear servidor MCP efímero
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

  // Registrar herramientas
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as any,
    })),
  }));

  // Ejecutar herramientas
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = ALL_TOOLS.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Herramienta desconocida: ${toolName}`);
    }
    return await tool.handler(wooApi, request.params.arguments);
  });

  // 5. Conectar transporte (Igual que Shopify)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// 6. Ruta GET para verificación (Health Check)
app.get("/mcp", (req, res) => {
  res.json({
    status: "ok",
    message: "MCP Server is running. Use POST to interact.",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor WooCommerce MCP corriendo en puerto ${PORT}`);
});
