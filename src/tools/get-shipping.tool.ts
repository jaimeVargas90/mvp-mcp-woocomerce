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
        stateCode: z.string().describe("Código del estado/provincia (ej: 'ANT', 'DC')."),
        postcode: z.string().describe("Código postal de 8 dígitos para Colombia (ej: '05001000')."),
        countryCode: z.string().length(2).default("CO").describe("Código ISO del país (ej: 'CO')."),
    }),

    handler: async (api, args) => {
        try {
            const { productId, city, stateCode, postcode, countryCode } = args;

            console.log(`🚚 Simulando envío para Producto ID ${productId} hacia ${city} (${postcode})...`);

            // 1. Crear un pedido borrador (draft) para forzar el cálculo de la transportadora
            // WooCommerce usará internamente el peso y dimensiones del producto
            const orderRes = await api.post("orders", {
                status: "pending",
                billing: {
                    city: city,
                    state: stateCode,
                    postcode: postcode,
                    country: countryCode
                },
                shipping: {
                    city: city,
                    state: stateCode,
                    postcode: postcode,
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

            // 2. Extraer los métodos de envío calculados (incluyendo Coordinadora)
            const availableMethods = orderData.shipping_lines.map((m: any) => ({
                method_title: m.method_title,
                method_id: m.method_id,
                cost: parseFloat(m.total) || 0,
                tax: parseFloat(m.total_tax) || 0
            }));

            // 3. Limpieza: Borrar el pedido temporal inmediatamente
            try {
                await api.delete(`orders/${orderId}`, { force: true });
                console.log(`🗑️ Pedido temporal ${orderId} eliminado.`);
            } catch (delError: any) {
                console.warn(`⚠️ No se pudo eliminar el pedido ${orderId}:`, delError.message);
            }

            if (availableMethods.length === 0) {
                return {
                    content: [{ type: "text", text: `WooCommerce no devolvió métodos de envío para esta ubicación. Revisa que el producto tenga peso/dimensiones.` }],
                };
            }

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        location_used: `${city}, ${stateCode} (${postcode})`,
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