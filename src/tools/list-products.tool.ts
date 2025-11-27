import { z } from "zod";
import { WooTool } from "../types.js";

export const listWooProductsTool: WooTool = {
  name: "listWooProducts",
  description: "Lista los últimos 5 productos de la tienda WooCommerce.",
  inputSchema: z.object({}), // No requiere parámetros de entrada
  handler: async (api, args) => {
    try {
      console.log("🛠️ Ejecutando herramienta: listWooProducts");
      const response = await api.get("products", { per_page: 5 });

      const products = response.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        permalink: p.permalink,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(products, null, 2) }],
      };
    } catch (error: any) {
      console.error("Error en listWooProducts:", error.message);
      return {
        content: [{ type: "text", text: `Error Woo: ${error.message}` }],
        isError: true,
      };
    }
  },
};
