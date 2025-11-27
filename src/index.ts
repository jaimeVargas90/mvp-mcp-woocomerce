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

// Ajuste para importar la librería de Woo en entornos ESM/TypeScript
const WooCommerceRestApi = (pkg as any).default || pkg;

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// ==================================================================
// 🔥 OPTIMIZACIÓN DE RENDIMIENTO (CACHÉ DE CLIENTES)
// ==================================================================
let CLIENTS_CACHE: any[] = [];

try {
  const envClients = process.env.CLIENTS || "[]";
  CLIENTS_CACHE = JSON.parse(envClients);

  if (CLIENTS_CACHE.length > 0) {
    console.log(`✅ Configuración cargada exitosamente: ${CLIENTS_CACHE.length} clientes en memoria.`);
  } else {
    console.warn("⚠️ ALERTA: La lista de clientes está vacía (Variable CLIENTS=[] o vacía).");
  }

} catch (error) {
  console.error("❌ ERROR CRÍTICO AL INICIAR:");
  process.exit(1);
}

// ------------------------------------------------------------------
// ENDPOINT MAESTRO MCP
// ------------------------------------------------------------------
app.use("/mcp", async (req, res) => {
  console.log(`📨 Petición MCP entrante (${req.method})`);

  const clientId = req.headers["x-client-id"] as string;

  if (!clientId) {
    console.error("❌ Error: Falta el header X-Client-ID");
    return res.status(400).send("Falta el header X-Client-ID");
  }

  const clientData = CLIENTS_CACHE.find((c: any) => c.clientId === clientId);

  if (!clientData) {
    console.warn(`⚠️ Cliente no encontrado o no autorizado: ${clientId}`);
    return res.status(404).send(`Cliente no configurado: ${clientId}`);
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

  // -- Handler para listar herramientas --
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const mcpTools = tools.map((tool) => ({
      name: tool.name,
      description: `${tool.description} (Tienda: ${clientData.storeUrl})`,
      inputSchema: zodToJsonSchema(tool.inputSchema),
    }));

    return { tools: mcpTools };
  });

  // -- Handler para ejecutar herramientas --
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find((t) => t.name === name);

    if (!tool) {
      throw new Error(`Herramienta desconocida: ${name}`);
    }

    // Inicializamos Woo con el "Disfraz" de User-Agent
    const api = new WooCommerceRestApi({
      url: clientData.storeUrl,
      consumerKey: clientData.consumerKey,
      consumerSecret: clientData.consumerSecret,
      version: "wc/v3",
      // 👇 AQUÍ ESTÁ EL TRUCO 👇
      axiosConfig: {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      }
    });

    try {
      return await tool.handler(api, args);
    } catch (error: any) {
      // Log más detallado para debug
      console.error(`Error ejecutando herramienta ${name}:`, error.message);
      if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Data:", JSON.stringify(error.response.data));
      }

      return {
        content: [{ type: "text", text: `Error Interno: ${error.message}` }],
        isError: true,
      };
    }
  });

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
  console.log(`🚀 Servidor Multi-Cliente Optimizado corriendo en puerto ${PORT}`);
});