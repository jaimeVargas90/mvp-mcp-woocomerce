import { z } from "zod";
import { WooTool } from "../types.js";

export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Consulta costos de envío reales forzando datos técnicos para transportadoras dinámicas.",

    inputSchema: z.object({
        productId: z.coerce.number(),
        city: z.string(),
        stateCode: z.string(),
        postcode: z.string(),
        countryCode: z.string().default("CO"),
        // Añadimos estos como opcionales para que la IA los pase si los tiene
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

            const formattedState = stateCode.startsWith("CO-") ? stateCode.toUpperCase() : `CO-${stateCode.toUpperCase()}`;
            const cleanPostcode = postcode.length > 6 ? postcode.substring(0, 6) : postcode;

            // 1. SIMULACIÓN DE PEDIDO FORZANDO METADATOS
            // Al pasar el peso y dimensiones aquí, obligamos al plugin a calcular el flete
            const orderRes = await api.post("orders", {
                status: "pending",
                shipping: {
                    city: city,
                    state: formattedState,
                    postcode: cleanPostcode,
                    country: countryCode
                },
                line_items: [
                    {
                        product_id: productId,
                        quantity: 1,
                        // Forzamos metadatos que el plugin de Coordinadora pueda leer si fallan los del producto
                        meta_data: [
                            { key: "_weight", value: weight || "1" },
                            { key: "_length", value: dimensions?.length || "10" },
                            { key: "_width", value: dimensions?.width || "10" },
                            { key: "_height", value: dimensions?.height || "10" }
                        ]
                    }
                ]
            });

            const orderData = orderRes.data;
            const availableMethods = orderData.shipping_lines.map((m: any) => ({
                method_title: m.method_title,
                cost: parseFloat(m.total) || 0
            }));

            // Borramos el pedido de prueba
            await api.delete(`orders/${orderData.id}`, { force: true });

            if (availableMethods.length === 0 || (availableMethods.length === 1 && availableMethods[0].cost === 0)) {
                return {
                    content: [{ type: "text", text: `Coordinadora no devolvió tarifa. Verifica que el CP ${cleanPostcode} sea servido por la transportadora.` }],
                };
            }

            return {
                content: [{ type: "text", text: JSON.stringify({ shipping_options: availableMethods }, null, 2) }],
            };

        } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
    },
};