import "dotenv/config";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import pkg from "@woocommerce/woocommerce-rest-api";

const WooCommerceRestApi = (pkg as any).default || pkg;

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const server = new Server({
  name: "woo-mcp-mvp",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

// Handler para listar las herramientas disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "listWooProducts",
      description: "Lista 5 productos de WooCommerce",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

// Handler para ejecutar herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name !== "listWooProducts") {
    throw new Error(`Herramienta desconocida: ${name}`);
  }

  const clientsEnv = process.env.CLIENTS;
  if (!clientsEnv) {
    return { content: [{ type: "text", text: "Falta variable CLIENTS" }] };
  }

  let clientData;
  try {
    const clients = JSON.parse(clientsEnv);
    clientData = clients[0];
  } catch (e) {
    return { content: [{ type: "text", text: "JSON CLIENTS inválido" }] };
  }

  const api = new WooCommerceRestApi({
    url: clientData.storeUrl,
    consumerKey: clientData.consumerKey,
    consumerSecret: clientData.consumerSecret,
    version: "wc/v3",
  });

  try {
    const response = await api.get("products", { per_page: 5 });
    const products = response.data.map((p: any) => ({
      id: p.id,
      name: p.name,
      price: p.price,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(products, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error Woo: ${error.message}` }],
    };
  }
});

app.use("/mcp", async (req, res) => {
  console.log("📨 Petición MCP recibida");
  const transport = new SSEServerTransport("/message", res);

  // Limpieza vital para evitar fugas de memoria
  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
});

app.listen(PORT, () => {
  console.log(`🚀 MVP corriendo en puerto ${PORT}`);
});
