import { z } from "zod";
import { WooTool } from "../types.js";

export const searchWooProductsTool: WooTool = {
    name: "searchWooProducts",
    description: "Herramienta maestra de productos. Busca por texto, filtra por categoría, precio, ofertas o estado de stock.",

    inputSchema: z.object({
        keyword: z.string().optional().describe("Término de búsqueda. Si se omite, lista todos los productos."),
        category: z.string().optional().describe("Slug o ID de la categoría a filtrar (ej: 'ropa-hombre', 'ortopedia')."),
        limit: z.coerce.number().min(1).max(50).default(15).describe("Cantidad de resultados a devolver (máx 50)."),
        page: z.coerce.number().min(1).default(1).describe("Número de página."),
        minPrice: z.coerce.number().optional().describe("Precio mínimo."),
        maxPrice: z.coerce.number().optional().describe("Precio máximo."),
        onSale: z.boolean().optional().describe("Si es true, solo devuelve productos con descuento."),
        stockStatus: z.enum(["instock", "outofstock", "onbackorder", "all"])
            .default("instock")
            .describe("Estado del inventario. Usa 'all' para ver todo, incluso agotados."),
        sort: z.enum(["relevance", "price_asc", "price_desc", "newest", "popularity"])
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
                case "popularity": orderBy = "popularity"; order = "desc"; break;
                case "relevance":
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

            console.log(`🔍 Searching: "${args.keyword || 'ALL'}" | Cat: ${args.category || 'N/A'} | Stock: ${args.stockStatus}`);

            const params: any = {
                per_page: args.limit,
                page: args.page,
                status: "publish",
            };

            if (orderBy) params.orderby = orderBy;
            if (order) params.order = order;

            if (args.keyword && args.keyword.trim() !== "") params.search = args.keyword;
            if (args.category) params.category = args.category;
            if (args.minPrice) params.min_price = args.minPrice;
            if (args.maxPrice) params.max_price = args.maxPrice;
            if (args.onSale) params.on_sale = true;

            if (args.stockStatus !== 'all') {
                params.stock_status = args.stockStatus;
            }

            const response = await api.get("products", params);

            const totalProductsRaw = parseInt(response.headers["x-wp-total"] || "0");
            const totalPages = parseInt(response.headers["x-wp-totalpages"] || "0");

            // 1. Mapeamos los productos tal cual lo hacías
            let products = response.data.map((p: any) => {
                const cleanDesc = p.short_description ? p.short_description.replace(/<[^>]*>?/gm, '') : "";
                const categoryNames = p.categories.map((c: any) => c.name).join(", ");

                return {
                    id: p.id,
                    name: p.name,
                    status: p.status,
                    stock_status: p.stock_status,
                    price: parseFloat(p.price) || 0,
                    regular_price: parseFloat(p.regular_price) || 0,
                    on_sale: p.on_sale,
                    categories: categoryNames,
                    image: p.images[0]?.src || null,
                    description: cleanDesc.substring(0, 150) + "...",
                    permalink: p.permalink,
                    attributes: p.attributes.map((attr: any) => ({
                        name: attr.name,
                        options: attr.options
                    })),
                    variations: p.variations.length > 0 ? p.variations : undefined
                };
            });

            // 🔥🔥🔥 AQUI ESTÁ EL FILTRO NUEVO 🔥🔥🔥
            // Eliminamos "Links de Pago", "Productos de Segunda" y "Sin Categorizar"
            products = products.filter((p: any) => {
                const nameLower = p.name.toLowerCase();
                const catsLower = p.categories.toLowerCase();

                // 1. Excluir si el nombre dice "link de pago"
                if (nameLower.includes("link de pago")) return false;

                // 2. Excluir si la categoría es de segunda o basura
                if (catsLower.includes("productos de segunda")) return false;
                if (catsLower.includes("sin categorizar")) return false;

                return true; // Si pasa los filtros, se queda
            });
            // 🔥🔥🔥 FIN DEL FILTRO 🔥🔥🔥


            if (products.length === 0) {
                return {
                    content: [{ type: "text", text: `No encontré productos con esos criterios (se filtraron resultados irrelevantes).` }],
                };
            }

            const resultData = {
                meta: {
                    total_results: totalProductsRaw, // Nota: Este número es el total bruto de Woo, no refleja el filtro post-búsqueda, pero está bien para paginación.
                    current_page: args.page,
                    total_pages: totalPages,
                    showing: products.length,
                    filters_applied: {
                        keyword: args.keyword,
                        category: args.category,
                        stock: args.stockStatus
                    }
                },
                products: products
            };

            return {
                content: [{ type: "text", text: JSON.stringify(resultData, null, 2) }],
            };

        } catch (error: any) {
            console.error("Error in searchWooProducts:", error.message);
            return {
                content: [{ type: "text", text: `Error Woo: ${error.message}` }],
                isError: true,
            };
        }
    },
};