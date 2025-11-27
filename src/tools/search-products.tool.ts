import { z } from "zod";
import { WooTool } from "../types.js";

export const searchWooProductsTool: WooTool = {
    name: "searchWooProducts",
    description: "Busca productos en la tienda por una palabra clave.",
    // Aquí definimos que esta herramienta NECESITA un parámetro "keyword"
    inputSchema: z.object({
        keyword: z.string().describe("Nombre o término a buscar (ej: 'zapatillas', 'gorra')"),
    }),
    handler: async (api, args) => {
        try {
            const searchTerm = args.keyword;
            console.log(`🔍 Buscando productos con: "${searchTerm}"`);

            // Llamada a la API de Woo filtrando por "search"
            const response = await api.get("products", {
                search: searchTerm,
                per_page: 5, // Limitamos a 5 resultados
                status: "publish",
            });

            const products = response.data.map((p: any) => ({
                id: p.id,
                name: p.name,
                price: p.price,
                stock_status: p.stock_status, // Agregamos status de stock, es útil
                permalink: p.permalink,
            }));

            if (products.length === 0) {
                return {
                    content: [{ type: "text", text: `No encontré productos relacionados con "${searchTerm}".` }],
                };
            }

            return {
                content: [{ type: "text", text: JSON.stringify(products, null, 2) }],
            };
        } catch (error: any) {
            console.error("Error en searchWooProducts:", error.message);
            return {
                content: [{ type: "text", text: `Error buscando en Woo: ${error.message}` }],
                isError: true,
            };
        }
    },
};