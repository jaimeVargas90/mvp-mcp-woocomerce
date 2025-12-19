import { z } from "zod";
import { WooTool } from "../types.js";

export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Calcula fletes reales traduciendo nombres de ciudades a códigos de 8 dígitos para Coordinadora.",

    inputSchema: z.object({
        productId: z.coerce.number(),
        city: z.string(),
        stateCode: z.string(),
        postcode: z.string(),
        countryCode: z.string().default("CO"),
        weight: z.string().optional(),
        dimensions: z.object({
            length: z.string(),
            width: z.string(),
            height: z.string()
        }).optional()
    }),

    handler: async (api, args) => {
        try {
            const { productId, city, stateCode, postcode, countryCode, weight, dimensions } = args;

            // 1. DICCIONARIO DE TRADUCCIÓN (Basado en tus registros exitosos)
            const cityMapper: Record<string, string> = {
                "MEDELLIN": "05001000",
                "ITAGUI": "05360000",
                "BOGOTA": "11001000",
                "CALI": "76001000",
                "BARRANQUILLA": "08001000"
            };

            const cleanCity = city.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Si la ciudad está en el mapa usamos el código, si no, usamos el postcode original
            const finalCityCode = cityMapper[cleanCity] || postcode;

            // 2. SIMULACIÓN DE PEDIDO
            const orderRes = await api.post("orders", {
                status: "pending",
                shipping: {
                    city: finalCityCode, // Forzamos el código numérico
                    state: stateCode.includes("-") ? stateCode : `CO-${stateCode.toUpperCase()}`,
                    postcode: finalCityCode,
                    country: countryCode
                },
                line_items: [{
                    product_id: productId,
                    quantity: 1,
                    meta_data: [
                        { key: "_weight", value: weight || "1" },
                        { key: "_length", value: dimensions?.length || "10" },
                        { key: "_width", value: dimensions?.width || "10" },
                        { key: "_height", value: dimensions?.height || "93" }
                    ]
                }],
                shipping_lines: [{ method_id: "coordinadora", method_title: "Coordinadora" }]
            });

            const shippingMethods = orderRes.data.shipping_lines.map((m: any) => ({
                method_title: m.method_title,
                cost: parseFloat(m.total) || 0
            }));

            await api.delete(`orders/${orderRes.data.id}`, { force: true });

            if (shippingMethods.length > 0 && shippingMethods[0].cost > 0) {
                return { content: [{ type: "text", text: JSON.stringify({ ciudad: cleanCity, tarifa: shippingMethods }, null, 2) }] };
            }

            return { content: [{ type: "text", text: "Coordinadora no devolvió flete. Verifica el código de ciudad." }] };

        } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
    },
};