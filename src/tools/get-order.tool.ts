
import { z } from "zod";
import { WooTool } from "../types.js";

export const getOrderTool: WooTool = {
    name: "getOrderStatus",
    description: "Obtiene el estado, total, método de envío y notas de un pedido por su ID.",

    inputSchema: z.object({
        orderId: z.coerce.number().describe("El ID numérico del pedido (ej: 1234)"),
    }),

    handler: async (api, args) => {
        try {
            console.log(`Consultando pedido #${args.orderId}`);

            const response = await api.get(`orders/${args.orderId}`);
            const order = response.data;

            // Extract shipping method (usually the first one in the array)
            const shippingMethod = order.shipping_lines?.[0]?.method_title || "No especificado";

            // Simplify response for AI
            const orderInfo = {
                id: order.id,
                status: order.status, // e.g., pending, processing, completed, cancelled
                currency: order.currency,
                total: order.total,
                date_created: order.date_created,
                date_modified: order.date_modified, // Useful to know when status changed
                payment_method: order.payment_method_title,
                shipping_method: shippingMethod, // "Express Shipping" vs "Pickup"
                customer_note: order.customer_note || "(Sin notas del cliente)", // To confirm instructions

                customer: {
                    name: `${order.billing.first_name} ${order.billing.last_name}`,
                    email: order.billing.email,
                    phone: order.billing.phone
                },

                shipping_address: {
                    address: order.shipping.address_1,
                    city: order.shipping.city,
                    state: order.shipping.state,
                    country: order.shipping.country
                },

                line_items: order.line_items.map((item: any) => ({
                    product: item.name,
                    quantity: item.quantity,
                    total: item.total,
                    // Useful if it has variations (size/color)
                    variation_id: item.variation_id || null
                }))
            };

            return {
                content: [{ type: "text", text: JSON.stringify(orderInfo, null, 2) }],
            };

        } catch (error: any) {
            // Specific handling if order does not exist (404)
            if (error.response && error.response.status === 404) {
                return {
                    content: [{ type: "text", text: `El pedido #${args.orderId} no existe en esta tienda.` }],
                    isError: true,
                };
            }

            console.error("Error in getOrder:", error.message);
            return {
                content: [{ type: "text", text: `Error consultando pedido: ${error.message}` }],
                isError: true,
            };
        }
    },
};