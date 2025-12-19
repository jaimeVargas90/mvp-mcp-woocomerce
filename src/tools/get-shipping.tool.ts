import { z } from "zod";
import { WooTool } from "../types.js";

export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Calcula fletes reales inyectando datos técnicos y normalizando la ubicación para transportadoras en Colombia.",

    inputSchema: z.object({
        productId: z.coerce.number().describe("ID del producto."),
        city: z.string().describe("Ciudad (ej: MEDELLIN)."),
        stateCode: z.string().describe("Departamento (ej: CO-ANT)."),
        postcode: z.string().describe("Código postal (ej: 05001000)."),
        countryCode: z.string().length(2).default("CO"),
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

            // 1. NORMALIZACIÓN GEOGRÁFICA
            const cleanCity = city.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const formattedState = stateCode.toUpperCase().startsWith("CO-") ? stateCode.toUpperCase() : `CO-${stateCode.toUpperCase()}`;

            // 2. CREACIÓN DEL PEDIDO SIMULADO CON LÍNEA DE ENVÍO FORZADA
            // Forzamos el ID técnico 'coordinadora' para que el plugin se vea obligado a procesar el pedido
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
                        // Forzamos los metadatos de peso y dimensiones directamente
                        meta_data: [
                            { key: "_weight", value: weight || "1" },
                            { key: "_length", value: dimensions?.length || "10" },
                            { key: "_width", value: dimensions?.width || "10" },
                            { key: "_height", value: dimensions?.height || "93" }
                        ]
                    }
                ],
                // FORZADO DE LÍNEA DE ENVÍO
                shipping_lines: [
                    {
                        method_id: "coordinadora", // ID técnico que usa el plugin
                        method_title: "Coordinadora"
                    }
                ]
            });

            const orderData = orderRes.data;
            const orderId = orderData.id;

            // 3. PROCESAMIENTO DE RESULTADOS
            const shippingMethods = orderData.shipping_lines.map((m: any) => ({
                method_title: m.method_title,
                cost: parseFloat(m.total) || 0
            }));

            // 4. LIMPIEZA: Borrar pedido temporal
            await api.delete(`orders/${orderId}`, { force: true });

            if (shippingMethods.length > 0 && shippingMethods[0].cost > 0) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            location: `${cleanCity}, ${formattedState}`,
                            shipping_options: shippingMethods
                        }, null, 2)
                    }]
                };
            }

            return {
                content: [{
                    type: "text",
                    text: `No se encontró tarifa dinámica. Revisa que el plugin de Coordinadora esté configurado para permitir consultas vía API en sus ajustes internos.`
                }]
            };

        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error de API: ${error.message}` }],
                isError: true
            };
        }
    },
};