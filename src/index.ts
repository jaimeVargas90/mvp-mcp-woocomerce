import "dotenv/config";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pkg from "@woocommerce/woocommerce-rest-api";
import { ALL_TOOLS } from "./tools/index.js"; // Importamos el registro de tools

const WooCommerceRestApi = (pkg as any).default || pkg;

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.use("/mcp", async (req, res) => {
  console.log(`📨 Petición MCP entrante (${req.method})`);

  // 1. Validación de Headers
  const clientId = req.headers["x-client-id"] as string;
  if (!clientId) {
    console.error("❌ Falta header X-Client-ID");
    return res.status(400).send("Falta el header X-Client-ID");
  }

  // 2. Carga de Credenciales
  const clientsEnv = process.env.CLIENTS;
  if (!clientsEnv) {
    return res
      .status(500)
      .send("Error de configuración del servidor (CLIENTS)");
  }

  let clientData;
  try {
    const clients = JSON.parse(clientsEnv);
    clientData = clients.find((c: any) => c.clientId === clientId);
  } catch (e) {
    return res.status(500).send("Error interno JSON");
  }

  if (!clientData) {
    console.warn(`⚠️ Cliente no encontrado: ${clientId}`);
    return res.status(404).send(`Cliente no configurado: ${clientId}`);
  }

  console.log(`🔑 Cliente autenticado: ${clientId} (${clientData.storeUrl})`);

  // 3. Inicialización de API WooCommerce (Contexto único para esta petición)
  const wooApi = new WooCommerceRestApi({
    url: clientData.storeUrl,
    consumerKey: clientData.consumerKey,
    consumerSecret: clientData.consumerSecret,
    version: "wc/v3",
  });

  // 4. Configuración del Servidor MCP
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

  // --- REGISTRO DINÁMICO DE LISTA DE HERRAMIENTAS ---
  // Recorremos el array ALL_TOOLS para generar la lista
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as any, // Cast necesario por compatibilidad de tipos Zod/JSON
    })),
  }));

  // --- EJECUCIÓN DINÁMICA DE HERRAMIENTAS ---
  // Buscamos la tool solicitada en el array y ejecutamos su handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = ALL_TOOLS.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Herramienta desconocida: ${toolName}`);
    }

    // Ejecutamos el handler pasando la API ya configurada
    return await tool.handler(wooApi, request.params.arguments);
  });

  // 5. Conexión y Transporte
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor Modular Multi-Cliente corriendo en puerto ${PORT}`);
});
