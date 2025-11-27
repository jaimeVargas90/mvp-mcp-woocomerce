import { z } from "zod";
import { WooTool } from "../types.js";

export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Consulta las opciones y costos de envío disponibles para un país específico.",

    inputSchema: z.object({
        countryCode: z.string().length(2).describe("Código ISO del país (ej: 'CO' para Colombia, 'MX' para México, 'US' para USA)."),
    }),

    handler: async (api, args) => {
        try {
            const country = args.countryCode.toUpperCase();
            console.log(`🚚 Consultando envíos para: ${country}`);

            // 1. Obtener todas las zonas de envío
            const zonesRes = await api.get("shipping/zones");
            const zones = zonesRes.data;

            let matchedZoneId = 0; // 0 es la zona "Resto del mundo" por defecto

            // 2. Buscar si hay una zona específica para este país
            // Nota: Esto es una simplificación. WooCommerce permite configurar zonas por código postal, 
            // pero para un chatbot, validar por País es lo más robusto y rápido.
            for (const zone of zones) {
                // Obtenemos las ubicaciones de esta zona
                try {
                    const locationsRes = await api.get(`shipping/zones/${zone.id}/locations`);
                    const locations = locationsRes.data;

                    // Verificamos si el país está en esta zona
                    const found = locations.find((loc: any) => loc.code === country);
                    if (found) {
                        matchedZoneId = zone.id;
                        break; // Encontramos la zona, dejamos de buscar
                    }
                } catch (e) {
                    continue;
                }
            }

            console.log(`📍 Zona detectada ID: ${matchedZoneId}`);

            // 3. Obtener los métodos de envío de la zona encontrada
            const methodsRes = await api.get(`shipping/zones/${matchedZoneId}/methods`);
            const methods = methodsRes.data;

            // 4. Limpiar la respuesta
            const availableMethods = methods
                .filter((m: any) => m.enabled) // Solo métodos activos
                .map((m: any) => {
                    let cost = "Por calcular";
                    // Intentamos leer el costo si es tarifa plana
                    if (m.settings && m.settings.cost) {
                        cost = m.settings.cost.value || m.settings.cost;
                    }
                    if (m.method_id === "free_shipping") {
                        cost = "Gratis";
                    }

                    return {
                        method: m.title,
                        cost: cost,
                        description: m.method_description || "",
                        id: m.instance_id // Útil si quisieras forzar este método en el pedido
                    };
                });

            if (availableMethods.length === 0) {
                return {
                    content: [{ type: "text", text: `No hay métodos de envío configurados para ${country}.` }],
                };
            }

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        country: country,
                        zone_match: matchedZoneId,
                        methods: availableMethods
                    }, null, 2)
                }],
            };

        } catch (error: any) {
            console.error("Error getShippingMethods:", error.message);
            return {
                content: [{ type: "text", text: `Error consultando envíos: ${error.message}` }],
                isError: true,
            };
        }
    },
};