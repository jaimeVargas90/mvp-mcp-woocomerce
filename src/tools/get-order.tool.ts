import { z } from "zod";
import { WooTool } from "../types.js";

export const getOrderTool: WooTool = {
    name: "getOrderStatus",
    description: "Obtiene el estado, total y detalles de un pedido específico por su ID.",
    inputSchema: z.object({
        orderId: z.coerce.number().describe("El ID numérico del pedido (ej: 1234)"),
    }),
    handler: async (api, args) => {
        try {
            console.log(`📦 Consultando pedido #${args.orderId}`);

            const response = await api.get(`orders/${args.orderId}`);
            const order = response.data;

            // Simplificamos la respuesta para la IA
            const orderInfo = {
                id: order.id,
                status: order.status, // ej: pending, processing, completed, cancelled
                currency: order.currency,
                total: order.total,
                date_created: order.date_created,
                payment_method: order.payment_method_title,
                customer: `${order.billing.first_name} ${order.billing.last_name}`,
                line_items: order.line_items.map((item: any) => ({
                    product: item.name,
                    quantity: item.quantity,
                    total: item.total
                }))
            };

            return {
                content: [{ type: "text", text: JSON.stringify(orderInfo, null, 2) }],
            };
        } catch (error: any) {
            // Manejo específico si el pedido no existe (404)
            if (error.response && error.response.status === 404) {
                return {
                    content: [{ type: "text", text: `El pedido #${args.orderId} no existe en esta tienda.` }],
                    isError: true,
                };
            }

            console.error("Error en getOrder:", error.message);
            return {
                content: [{ type: "text", text: `Error consultando pedido: ${error.message}` }],
                isError: true,
            };
        }
    },
};