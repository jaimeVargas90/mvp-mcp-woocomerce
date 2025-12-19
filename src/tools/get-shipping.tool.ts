import { z } from "zod";
import { WooTool } from "../types.js";

export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Calcula fletes reales enviando códigos de ciudad de 8 dígitos requeridos por Coordinadora en Colombia.",

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

            // 1. MAPEADOR DE CIUDADES (Basado en tus registros exitosos de Coordinadora)
            const cityCodes: Record<string, string> = {
                "MEDELLIN": "05001000",
                "ITAGUI": "05360000",
                "ENVIGADO": "05266000",
                "BOGOTA": "11001000",
                "CALI": "76001000"
            };

            // Normalizamos el nombre de la ciudad para buscarlo en el mapa
            const cleanCityName = city.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Usamos el código de 8 dígitos si existe, si no, usamos el postcode enviado
            const finalCityCode = cityCodes[cleanCityName] || postcode;
            const formattedState = stateCode.toUpperCase().startsWith("CO-") ? stateCode.toUpperCase() : `CO-${stateCode.toUpperCase()}`;

            console.log(`🚀 Simulando envío para ${cleanCityName} usando código: ${finalCityCode}`);

            // 2. CREACIÓN DEL PEDIDO SIMULADO (Simulamos el proceso de checkout real)
            const orderRes = await api.post("orders", {
                status: "pending",
                shipping: {
                    city: finalCityCode, // Enviamos el código numérico que Coordinadora exige
                    state: formattedState,
                    postcode: finalCityCode,
                    country: countryCode
                },
                line_items: [
                    {
                        product_id: productId,
                        quantity: 1,
                        // Inyección de peso y dimensiones
                        meta_data: [
                            { key: "_weight", value: weight || "1" },
                            { key: "_length", value: dimensions?.length || "10" },
                            { key: "_width", value: dimensions?.width || "10" },
                            { key: "_height", value: dimensions?.height || "93" }
                        ]
                    }
                ],
                // Forzamos la línea de Coordinadora
                shipping_lines: [
                    {
                        method_id: "coordinadora",
                        method_title: "Coordinadora"
                    }
                ]
            });

            const orderData = orderRes.data;
            const orderId = orderData.id;

            // 3. EXTRACCIÓN DEL RESULTADO
            const shippingMethods = orderData.shipping_lines.map((m: any) => ({
                method_title: m.method_title,
                cost: parseFloat(m.total) || 0
            }));

            // Borrado del pedido temporal
            await api.delete(`orders/${orderId}`, { force: true });

            if (shippingMethods.length > 0 && shippingMethods[0].cost > 0) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            destinatario: cleanCityName,
                            codigo_ciudad: finalCityCode,
                            opciones: shippingMethods
                        }, null, 2)
                    }]
                };
            }

            return {
                content: [{ type: "text", text: `Coordinadora no devolvió tarifa para ${cleanCityName}. Verifica que el código postal o código de ciudad ${finalCityCode} sea correcto.` }]
            };

        } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
    },
};