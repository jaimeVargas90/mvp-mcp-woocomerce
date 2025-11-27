import "dotenv/config";
import express from "express";
import cors from "cors"; // <--- NUEVO IMPORT
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

// 1. Configuración de CORS (Vital para Meteor/Web)
app.use(
  cors({
    origin: "*", // Permite acceso desde cualquier lugar (Meteor, UChat, etc.)
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Client-ID"], // Permitimos tu header personalizado
  })
);

app.use(express.json());
const PORT = process.env.PORT || 3000;

app.use("/mcp", async (req, res) => {
  console.log(`📨 Petición MCP entrante (${req.method})`);

  // 2. Validación de Headers (Respondiendo siempre con JSON)
  const clientId = req.headers["x-client-id"] as string;

  if (!clientId) {
    console.error("❌ Falta header X-Client-ID");
    return res.status(400).json({
      error: "Falta el header X-Client-ID",
      details:
        "Asegurate de enviar el header 'X-Client-ID' con el ID de tu tienda.",
    });
  }

  // 3. Carga de Credenciales
  const clientsEnv = process.env.CLIENTS;
  if (!clientsEnv) {
    console.error("❌ Error CRÍTICO: No hay variable CLIENTS");
    return res
      .status(500)
      .json({ error: "Error interno de configuración del servidor" });
  }

  let clientData;
  try {
    const clients = JSON.parse(clientsEnv);
    clientData = clients.find((c: any) => c.clientId === clientId);
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Error interno: Formato JSON de clientes inválido" });
  }

  if (!clientData) {
    console.warn(`⚠️ Cliente no encontrado: ${clientId}`);
    // Tip: Imprimimos los IDs disponibles en los logs para que puedas depurar si te equivocas de nuevo
    const available = JSON.parse(clientsEnv).map((c: any) => c.clientId);
    console.log(`ℹ️ IDs Disponibles: ${available.join(", ")}`);

    return res.status(404).json({
      error: "Cliente no encontrado",
      clientIdProvided: clientId,
    });
  }

  console.log(`🔑 Cliente autenticado: ${clientId} (${clientData.storeUrl})`);

  // 4. Inicialización de API WooCommerce
  const wooApi = new WooCommerceRestApi({
    url: clientData.storeUrl,
    consumerKey: clientData.consumerKey,
    consumerSecret: clientData.consumerSecret,
    version: "wc/v3",
  });

  // 5. Configuración del Servidor MCP
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

  // --- REGISTRO DE HERRAMIENTAS ---
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as any,
    })),
  }));

  // --- EJECUCIÓN DE HERRAMIENTAS ---
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = ALL_TOOLS.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Herramienta desconocida: ${toolName}`);
    }

    // Ejecutamos el handler pasando la API ya configurada
    return await tool.handler(wooApi, request.params.arguments);
  });

  // 6. Conexión y Transporte
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
  console.log(`🚀 Servidor Modular + CORS corriendo en puerto ${PORT}`);
});
