import { z } from "zod";
import { WooTool } from "../types.js";

/**
 * Herramienta para consultar costos de envío reales.
 * Fuerza la detección de Coordinadora inyectando datos técnicos y normalizando ubicación.
 */
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

            // 1. NORMALIZACIÓN GEOGRÁFICA (Crítico para que el plugin encuentre la tarifa)
            const cleanCity = city.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const formattedState = stateCode.toUpperCase().startsWith("CO-") ? stateCode.toUpperCase() : `CO-${stateCode.toUpperCase()}`;

            console.log(`🚚 Iniciando simulación para ${cleanCity} (${formattedState}) con ID ${productId}`);

            // 2. CREACIÓN DEL PEDIDO SIMULADO INYECTANDO METADATOS TÉCNICOS
            // Inyectamos _weight y dimensiones para que el plugin de Coordinadora tenga qué calcular
            let orderRes = await api.post("orders", {
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
                        meta_data: [
                            { key: "_weight", value: weight || "1" },
                            { key: "_length", value: dimensions?.length || "10" },
                            { key: "_width", value: dimensions?.width || "10" },
                            { key: "_height", value: dimensions?.height || "93" }
                        ]
                    }
                ]
            });

            let orderData = orderRes.data;
            const orderId = orderData.id;

            // 3. INTENTO DE FORZAR COORDINADORA SI NO APARECE AUTOMÁTICAMENTE
            // Si la respuesta inicial no trae métodos, intentamos forzar el ID técnico
            if (orderData.shipping_lines.length === 0) {
                console.log("⚠️ No se detectó método automático, intentando forzar ID técnico...");
                const updateRes = await api.put(`orders/${orderId}`, {
                    shipping_lines: [
                        {
                            method_id: "coordinadora", // ID estándar
                            method_title: "Coordinadora"
                        }
                    ]
                });
                orderData = updateRes.data;
            }

            // 4. PROCESAMIENTO DE RESULTADOS
            const shippingMethods = orderData.shipping_lines.map((m: any) => ({
                method_title: m.method_title,
                cost: parseFloat(m.total) || 0
            }));

            // 5. LIMPIEZA: Borrar pedido temporal
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
                    text: `No se pudo obtener una tarifa de Coordinadora. Verifica que el CP ${postcode} sea servido y que el plugin no tenga restricciones de peso.`
                }]
            };

        } catch (error: any) {
            console.error("Error en getShippingMethods:", error.message);
            return {
                content: [{ type: "text", text: `Error de API: ${error.message}` }],
                isError: true
            };
        }
    },
};