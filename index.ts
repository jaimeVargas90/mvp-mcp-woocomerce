import "dotenv/config";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import pkg from "@woocommerce/woocommerce-rest-api";

// Ajuste para importar la librería de Woo en entornos ESM/TypeScript
const WooCommerceRestApi = (pkg as any).default || pkg;

const app = express();
app.use(express.json()); // Necesario para leer JSON bodies
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------------
// ENDPOINT MAESTRO MCP (Maneja la lógica Multi-Cliente)
// ------------------------------------------------------------------
app.use("/mcp", async (req, res) => {
  console.log(`📨 Petición MCP entrante (${req.method})`);

  // 1. VALIDACIÓN: Obtener el ID del cliente del header
  const clientId = req.headers['x-client-id'] as string;

  if (!clientId) {
    console.error("❌ Error: Falta el header X-Client-ID");
    return res.status(400).send("Falta el header X-Client-ID");
  }

  console.log(`🔑 Autenticando Client ID: ${clientId}`);

  // 2. BÚSQUEDA: Encontrar las credenciales en la variable de entorno
  const clientsEnv = process.env.CLIENTS;
  if (!clientsEnv) {
    console.error("❌ Error CRÍTICO: No hay variable CLIENTS en Railway");
    return res.status(500).send("Error de configuración del servidor");
  }

  let clientData;
  try {
    const clients = JSON.parse(clientsEnv);

    // 👇👇 AGREGA ESTAS 2 LÍNEAS PARA DEPURAR 👇👇
    const availableIds = clients.map((c: any) => c.clientId);
    console.log(`📋 Clientes cargados en memoria: ${JSON.stringify(availableIds)}`);
    // 👆👆 FIN DEL DEBUG 👆👆

    // 🔥 CAMBIO CLAVE: Buscamos la tienda exacta por su ID
    clientData = clients.find((c: any) => c.clientId === clientId);
  } catch (e) {
    console.error("❌ Error parseando JSON de CLIENTS");
    return res.status(500).send("Error interno de configuración");
  }

  if (!clientData) {
    console.warn(`⚠️ Cliente no encontrado: ${clientId}`);
    return res.status(404).send(`Cliente no configurado: ${clientId}`);
  }

  // 3. INSTANCIACIÓN: Crear un servidor efímero para ESTA petición específica
  const server = new Server({
    name: "woo-mcp-multiclient",
    version: "1.0.0",
  }, {
    capabilities: {
      tools: {},
    },
  });

  // 4. DEFINICIÓN DE HERRAMIENTAS (Usando el clientData encontrado)

  // -- Handler para listar herramientas --
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "listWooProducts",
        description: `Lista 5 productos de WooCommerce (Tienda: ${clientData.storeUrl})`,
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  }));

  // -- Handler para ejecutar herramientas --
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;

    if (name === "listWooProducts") {
      // Inicializamos Woo con las credenciales ESPECÍFICAS de este cliente
      const api = new WooCommerceRestApi({
        url: clientData.storeUrl,
        consumerKey: clientData.consumerKey,
        consumerSecret: clientData.consumerSecret,
        version: "wc/v3",
      });

      try {
        console.log(`ZEjecutando listWooProducts para ${clientData.storeUrl}...`);
        const response = await api.get("products", { per_page: 5 });

        const products = response.data.map((p: any) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          permalink: p.permalink
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(products, null, 2) }]
        };
      } catch (error: any) {
        console.error("Error en API Woo:", error.response?.data || error.message);
        return {
          content: [{ type: "text", text: `Error Woo: ${error.message}` }],
          isError: true
        };
      }
    }

    throw new Error(`Herramienta desconocida: ${name}`);
  });

  // 5. CONEXIÓN Y TRANSPORTE
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Limpieza de recursos al cerrar la conexión
  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Arrancar el servidor Express
app.listen(PORT, () => {
  console.log(`🚀 Servidor Multi-Cliente corriendo en puerto ${PORT}`);
});