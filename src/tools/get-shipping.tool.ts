import { z } from "zod";
import { WooTool } from "../types.js";

/**
 * Herramienta para consultar costos de envío reales.
 * Utiliza la simulación de pedidos para activar cálculos dinámicos (ej: Coordinadora).
 */
export const getShippingTool: WooTool = {
    name: "getShippingMethods",
    description: "Consulta costos de envío reales. Usa simulación de pedido para obtener tarifas dinámicas de transportadoras.",

    inputSchema: z.object({
        productId: z.coerce.number().describe("ID del producto para calcular peso y dimensiones."),
        city: z.string().describe("Ciudad de destino (ej: 'Medellín')."),
        stateCode: z.string().describe("Código del departamento (ej: 'ANT', 'CO-ANT')."),
        postcode: z.string().describe("Código postal (ej: '050010' o '05001000')."),
        countryCode: z.string().length(2).default("CO").describe("Código ISO del país (ej: 'CO')."),
    }),

    handler: async (api, args) => {
        try {
            const { productId, city, stateCode, postcode, countryCode } = args;

            // 1. CORRECCIÓN DE FORMATO: Asegurar que el estado tenga el formato CO-XXX
            // Los plugins de Colombia requieren el prefijo del país para mapear la zona
            const formattedState = stateCode.startsWith("CO-") ? stateCode.toUpperCase() : `CO-${stateCode.toUpperCase()}`;

            // 2. LIMPIEZA DE POSTCODE: Algunos plugins solo aceptan los primeros 6 dígitos
            const cleanPostcode = postcode.length > 6 ? postcode.substring(0, 6) : postcode;

            console.log(`🚚 Simulando envío para Producto ID ${productId} hacia ${city} (${formattedState}) CP: ${cleanPostcode}...`);

            // 3. Crear un pedido borrador (draft) para forzar el cálculo de la transportadora
            // WooCommerce usará el peso y dimensiones del producto que ya configuramos en la tool de búsqueda
            const orderRes = await api.post("orders", {
                status: "pending",
                billing: {
                    city: city,
                    state: formattedState,
                    postcode: cleanPostcode,
                    country: countryCode
                },
                shipping: {
                    city: city,
                    state: formattedState,
                    postcode: cleanPostcode,
                    country: countryCode
                },
                line_items: [
                    {
                        product_id: productId,
                        quantity: 1
                    }
                ]
            });

            const orderData = orderRes.data;
            const orderId = orderData.id;

            // 4. Extraer los métodos de envío calculados
            // Aquí es donde aparecerá el costo de Coordinadora si los datos coinciden con la zona
            const availableMethods = orderData.shipping_lines
                .filter((m: any) => parseFloat(m.total) >= 0) // Incluye costo 0 si es recogida o gratis
                .map((m: any) => ({
                    method_title: m.method_title,
                    method_id: m.method_id,
                    cost: parseFloat(m.total) || 0,
                    tax: parseFloat(m.total_tax) || 0
                }));

            // 5. Limpieza: Borrar el pedido temporal inmediatamente para no ensuciar la base de datos
            try {
                await api.delete(`orders/${orderId}`, { force: true });
                console.log(`🗑️ Pedido temporal ${orderId} eliminado exitosamente.`);
            } catch (delError: any) {
                console.warn(`⚠️ Error al eliminar pedido temporal ${orderId}:`, delError.message);
            }

            if (availableMethods.length === 0) {
                return {
                    content: [{ type: "text", text: `No se encontraron métodos de envío disponibles para ${city}, ${formattedState}. Verifica que el método esté activo en WooCommerce para esta zona.` }],
                };
            }

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        location_used: `${city}, ${formattedState} (${cleanPostcode})`,
                        product_id: productId,
                        shipping_options: availableMethods
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