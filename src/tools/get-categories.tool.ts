import { z } from "zod";
import { WooTool } from "../types.js";

export const getCategoriesTool: WooTool = {
    name: "getStoreCategories",
    description: "Obtiene la lista de categorías de productos de la tienda. Úsalo cuando el usuario pregunte qué tipo de productos vendemos en general.",

    inputSchema: z.object({
        parent: z.coerce.number().optional().describe("ID de categoría padre (0 para raíz). Opcional.")
    }),

    handler: async (api, args) => {
        try {
            console.log("📂 Consultando categorías...");
            const response = await api.get("products/categories", {
                per_page: 20,
                hide_empty: true,
                parent: args.parent || 0,
                orderby: "count",
                order: "desc"
            });

            const categories = response.data.map((c: any) => ({
                id: c.id,
                name: c.name,
                count: c.count,
                slug: c.slug,
                description: c.description
            }));

            return {
                content: [{ type: "text", text: JSON.stringify(categories, null, 2) }],
            };
        } catch (error: any) {
            console.error("Error getCategories:", error.message);
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }],
                isError: true,
            };
        }
    },
};