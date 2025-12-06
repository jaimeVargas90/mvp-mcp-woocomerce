import { z } from "zod";
import { WooTool } from "../types.js";

export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Consulta las opciones y costos de envío. Requiere código de país y opcionalmente el estado/provincia.",

    inputSchema: z.object({
        countryCode: z.string().length(2).describe("Código ISO del país (ej: 'CO', 'MX', 'US')."),
        stateCode: z.string().optional().describe("Código del estado/provincia si aplica (ej: 'NY', 'FL', 'ANT')."),
    }),

    handler: async (api, args) => {
        try {
            const country = args.countryCode.toUpperCase();
            const state = args.stateCode ? args.stateCode.toUpperCase() : "";

            console.log(`🚚 Consultando envíos para: ${country} ${state ? `(${state})` : ""}`);

            // 1. Obtener todas las zonas de envío
            const zonesRes = await api.get("shipping/zones");
            const zones = zonesRes.data;

            let matchedZoneId = 0; // 0 es la zona "Resto del mundo" por defecto

            // 2. Buscar zona específica
            // Iteramos sobre las zonas creadas por el usuario (saltando la 0 por ahora)
            for (const zone of zones) {
                if (zone.id === 0) continue;

                try {
                    // Obtenemos las ubicaciones de esta zona
                    const locationsRes = await api.get(`shipping/zones/${zone.id}/locations`);
                    const locations = locationsRes.data;

                    // Lógica de coincidencia jerárquica
                    const match = locations.find((loc: any) => {
                        // A. Coincidencia exacta de Estado (ej: US:NY)
                        if (state && loc.type === 'state' && loc.code === `${country}:${state}`) {
                            return true;
                        }
                        // B. Coincidencia de País completo (ej: CO)
                        if (loc.type === 'country' && loc.code === country) {
                            return true;
                        }
                        // C. Continente (menos común)
                        if (loc.type === 'continent' && loc.code === api.continent_code) { // Requiere que la API exponga continente, si no, ignorar
                            return false;
                        }
                        return false;
                    });

                    if (match) {
                        matchedZoneId = zone.id;
                        console.log(`✅ Coincidencia encontrada en Zona ID: ${zone.id} (${zone.name})`);
                        break; // Dejamos de buscar si encontramos una zona específica
                    }
                } catch (e) {
                    continue;
                }
            }

            if (matchedZoneId === 0) {
                console.log("ℹ️ Usando zona por defecto (Resto del mundo)");
            }

            // 3. Obtener los métodos de envío de la zona encontrada
            const methodsRes = await api.get(`shipping/zones/${matchedZoneId}/methods`);
            const methods = methodsRes.data;

            // 4. Limpiar y formatear respuesta
            const availableMethods = methods
                .filter((m: any) => m.enabled) // Solo métodos activos
                .map((m: any) => {
                    let cost = "Por calcular";

                    // Intentamos leer el costo (soporta Flat Rate y otros estándares)
                    if (m.settings?.cost?.value !== undefined) {
                        cost = m.settings.cost.value;
                    } else if (m.settings?.cost) {
                        // A veces viene directo
                        cost = m.settings.cost;
                    }

                    if (m.method_id === "free_shipping") {
                        cost = "0";
                    }

                    return {
                        method_title: m.title,
                        cost: cost,
                        method_id: m.method_id, // ej: flat_rate
                        instance_id: m.instance_id // ID único para el pedido
                    };
                });

            if (availableMethods.length === 0) {
                return {
                    content: [{ type: "text", text: `No hay métodos de envío configurados para la ubicación ${country} ${state}.` }],
                };
            }

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        location_used: `${country} ${state ? state : '(Todo el país)'}`,
                        zone_id: matchedZoneId,
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