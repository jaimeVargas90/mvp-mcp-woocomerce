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

// ------------------------------------------------------------------
// ENDPOINT MAESTRO MCP (Maneja la lógica Multi-Cliente)
// ------------------------------------------------------------------
app.use("/mcp", async (req, res) => {
  console.log(`📨 Petición MCP entrante (${req.method})`);

  // 1. VALIDACIÓN: Obtener el ID del cliente del header
  const clientId = req.headers["x-client-id"] as string;

  if (!clientId) {
    console.error("❌ Error: Falta el header X-Client-ID");
    return res.status(400).send("Falta el header X-Client-ID");
  }

  // 2. BÚSQUEDA: Encontrar configuración del cliente
  const clientsEnv = process.env.CLIENTS;
  if (!clientsEnv) {
    return res.status(500).send("Error de configuración del servidor");
  }

  let clientData;
  try {
    const clients = JSON.parse(clientsEnv);
    clientData = clients.find((c: any) => c.clientId === clientId);
  } catch (e) {
    return res.status(500).send("Error interno de configuración");
  }

  if (!clientData) {
    console.warn(`⚠️ Cliente no encontrado: ${clientId}`);
    return res.status(404).send(`Cliente no configurado: ${clientId}`);
  }

  // 3. INSTANCIACIÓN: Crear servidor efímero para esta petición
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

  // 4. DEFINICIÓN DE HERRAMIENTAS DINÁMICA

  // -- Handler para listar herramientas --
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const mcpTools = tools.map((tool) => ({
      name: tool.name,
      // Concatenamos la URL para visibilidad en el cliente MCP
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

    // Inicializamos Woo con las credenciales ESPECÍFICAS de este cliente
    const api = new WooCommerceRestApi({
      url: clientData.storeUrl,
      consumerKey: clientData.consumerKey,
      consumerSecret: clientData.consumerSecret,
      version: "wc/v3",
    });

    try {
      return await tool.handler(api, args);
    } catch (error: any) {
      console.error(`Error ejecutando herramienta ${name}:`, error.message);
      return {
        content: [{ type: "text", text: `Error Interno: ${error.message}` }],
        isError: true,
      };
    }
  });

  // 5. CONEXIÓN Y TRANSPORTE
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
  console.log(`🚀 Servidor Multi-Cliente corriendo en puerto ${PORT}`);
});