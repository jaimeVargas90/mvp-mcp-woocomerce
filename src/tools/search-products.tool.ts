import { z } from "zod";
import { WooTool } from "../types.js";

export const searchWooProductsTool: WooTool = {
    name: "searchWooProducts",
    description: "Herramienta maestra de productos. Sirve para buscar por texto, filtrar por precio, o simplemente listar el catálogo completo si no se especifica búsqueda.",

    inputSchema: z.object({
        keyword: z.string().optional().describe("Término de búsqueda. Si se omite, lista todos los productos."),
        limit: z.coerce.number().min(1).max(20).default(5).describe("Cantidad de resultados a devolver (máx 20)"),
        page: z.coerce.number().min(1).default(1).describe("Número de página para ver más resultados"),
        minPrice: z.coerce.number().optional().describe("Precio mínimo (opcional)"),
        maxPrice: z.coerce.number().optional().describe("Precio máximo (opcional)"),
        sort: z.enum(["relevance", "price_asc", "price_desc", "newest"])
            .default("newest")
            .describe("Orden de los resultados"),
    }),

    handler: async (api, args) => {
        try {
            let orderBy: string | undefined = "date";
            let order: string | undefined = "desc";

            switch (args.sort) {
                case "price_asc": orderBy = "price"; order = "asc"; break;
                case "price_desc": orderBy = "price"; order = "desc"; break;
                case "relevance":
                    // Si hay búsqueda, dejamos undefined para que Woo use su default (relevancia)
                    // Si NO hay búsqueda, ordenamos por fecha
                    if (args.keyword) {
                        orderBy = undefined;
                        order = undefined;
                    } else {
                        orderBy = "date";
                        order = "desc";
                    }
                    break;
                case "newest": orderBy = "date"; order = "desc"; break;
            }

            console.log(`🔍 Query: "${args.keyword || 'TODO'}" | Pág: ${args.page} | Orden: ${orderBy || 'AUTO (Relevance)'}`);

            const params: any = {
                per_page: args.limit,
                page: args.page,
                status: "publish",
                stock_status: "instock",
            };

            if (orderBy) params.orderby = orderBy;
            if (order) params.order = order;

            if (args.keyword && args.keyword.trim() !== "") {
                params.search = args.keyword;
            }

            if (args.minPrice) params.min_price = args.minPrice;
            if (args.maxPrice) params.max_price = args.maxPrice;

            const response = await api.get("products", params);

            const totalProducts = parseInt(response.headers["x-wp-total"] || "0");
            const totalPages = parseInt(response.headers["x-wp-totalpages"] || "0");

            const products = response.data.map((p: any) => {
                const cleanDesc = p.short_description ? p.short_description.replace(/<[^>]*>?/gm, '') : "";
                const attributes = p.attributes.map((attr: any) => ({
                    name: attr.name,
                    options: attr.options
                }));

                return {
                    id: p.id,
                    name: p.name,
                    status: p.status,
                    type: p.type,
                    price: parseFloat(p.price),
                    regular_price: parseFloat(p.regular_price),
                    on_sale: p.on_sale,
                    stock_quantity: p.stock_quantity,
                    attributes: attributes,
                    variations: p.variations || [],
                    image: p.images[0]?.src || null,
                    description: cleanDesc.substring(0, 150) + "...",
                    permalink: p.permalink,
                };
            });

            if (products.length === 0) {
                return {
                    content: [{ type: "text", text: `No encontré productos con esos criterios (incluso buscando en borradores).` }],
                };
            }

            const resultData = {
                meta: {
                    total_results: totalProducts,
                    current_page: args.page,
                    total_pages: totalPages,
                    showing: products.length,
                    filters: {
                        keyword: args.keyword || "TODOS",
                        min_price: args.minPrice,
                        max_price: args.maxPrice,
                        status_mode: "any_with_stock"
                    }
                },
                products: products
            };

            return {
                content: [{ type: "text", text: JSON.stringify(resultData, null, 2) }],
            };

        } catch (error: any) {
            console.error("Error en searchWooProducts:", error.message);
            return {
                content: [{ type: "text", text: `Error Woo: ${error.message}` }],
                isError: true,
            };
        }
    },
};