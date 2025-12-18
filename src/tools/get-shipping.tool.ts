import { z } from "zod";
import { WooTool } from "../types.js";

export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Calcula fletes reales inyectando datos técnicos y normalizando la ubicación para transportadoras en Colombia.",

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

            // 1. NORMALIZACIÓN AUTOMÁTICA (Crítico para Coordinadora/QCode)
            // Convertimos la ciudad a MAYÚSCULAS y quitamos tildes
            const cleanCity = city.toUpperCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

            // Aseguramos el prefijo CO- para el departamento
            const formattedState = stateCode.toUpperCase().startsWith("CO-")
                ? stateCode.toUpperCase()
                : `CO-${stateCode.toUpperCase()}`;

            // Aseguramos que el código postal sea de 6 dígitos
            const cleanPostcode = postcode.substring(0, 6);

            console.log(`🚀 Enviando a Woo: ${cleanCity}, ${formattedState}, CP: ${cleanPostcode}`);

            // 2. SIMULACIÓN DE PEDIDO CON DATOS TÉCNICOS INYECTADOS
            const orderRes = await api.post("orders", {
                status: "pending",
                shipping: {
                    city: cleanCity,
                    state: formattedState,
                    postcode: cleanPostcode,
                    country: countryCode
                },
                line_items: [
                    {
                        product_id: productId,
                        quantity: 1,
                        // Inyectamos peso y dimensiones directamente en la línea
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

            // Borrado preventivo del pedido temporal
            await api.delete(`orders/${orderData.id}`, { force: true });

            if (availableMethods.length === 0) {
                return { content: [{ type: "text", text: `Error: No se encontró tarifa para ${cleanCity}. Revisa zonas de envío en Woo.` }] };
            }

            return {
                content: [{ type: "text", text: JSON.stringify({ shipping_options: availableMethods }, null, 2) }]
            };

        } catch (error: any) {
            return { content: [{ type: "text", text: `Error de API: ${error.message}` }], isError: true };
        }
    },
};