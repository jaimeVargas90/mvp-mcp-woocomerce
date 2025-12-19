import { z } from "zod";
import { WooTool } from "../types.js";

export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Calcula fletes reales forzando la consulta al plugin de Coordinadora.",

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

            // Normalización obligatoria para transportadoras colombianas
            const cleanCity = city.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const formattedState = stateCode.toUpperCase().startsWith("CO-") ? stateCode.toUpperCase() : `CO-${stateCode.toUpperCase()}`;

            // 1. SIMULACIÓN DE PEDIDO CON LÍNEA DE ENVÍO FORZADA
            const orderRes = await api.post("orders", {
                status: "pending",
                shipping: {
                    city: cleanCity,
                    state: formattedState,
                    postcode: postcode,
                    country: countryCode
                },
                line_items: [
                    {
                        product_id: productId,
                        quantity: 1,
                        // Inyección de metadatos técnicos
                        meta_data: [
                            { key: "_weight", value: weight || "1" },
                            { key: "_length", value: dimensions?.length || "10" },
                            { key: "_width", value: dimensions?.width || "10" },
                            { key: "_height", value: dimensions?.height || "10" }
                        ]
                    }
                ],
                // FORZAMOS LA LÍNEA DE COORDINADORA
                shipping_lines: [
                    {
                        method_id: "coordinadora",
                        method_title: "Coordinadora"
                    }
                ]
            });

            // 2. Extraer el costo calculado por el plugin
            const orderData = orderRes.data;
            const shippingMethods = orderData.shipping_lines.map((m: any) => ({
                method_title: m.method_title,
                cost: parseFloat(m.total) || 0
            }));

            // Borrado del pedido temporal
            await api.delete(`orders/${orderData.id}`, { force: true });

            // Si el costo es 0 y no es un método gratuito, algo falló en la comunicación con la transportadora
            if (shippingMethods.length > 0 && shippingMethods[0].cost > 0) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ shipping_options: shippingMethods }, null, 2) }]
                };
            }

            return {
                content: [{ type: "text", text: `No se pudo obtener una tarifa válida de Coordinadora para ${cleanCity}. Revisa la conexión del plugin.` }]
            };

        } catch (error: any) {
            return { content: [{ type: "text", text: `Error de conexión: ${error.message}` }], isError: true };
        }
    },
};