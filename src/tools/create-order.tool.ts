import { z } from "zod";
import { WooTool } from "../types.js";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce recibiendo el JSON completo (Versión Integrada).",

    inputSchema: z.object({
        orderPayload: z.string().describe("JSON completo del pedido con estructura de WooCommerce API.")
    }),

    // Usamos 'api' directamente, igual que en searchWooProducts
    handler: async (api, args) => {
        try {
            // 1. Parsear el JSON del chat
            let orderData;
            try {
                let cleanJson = args.orderPayload.trim();
                // Limpieza de bloques de código markdown
                if (cleanJson.startsWith("```json")) cleanJson = cleanJson.replace("```json", "").replace("```", "");
                if (cleanJson.startsWith("```")) cleanJson = cleanJson.replace("```", "");
                orderData = JSON.parse(cleanJson);
            } catch (e) {
                throw new Error("El texto enviado no es un JSON válido.");
            }

            console.log("📦 Enviando a WooCommerce (Vía Cliente Nativo)...");

            // 2. Usar el objeto 'api' inyectado
            // Esto asegura que use las credenciales del cliente correcto (Multi-Tenant)
            const response = await api.post("orders", orderData);
            const order = response.data;

            // 3. Generar Link de Pago
            // Intentamos obtener la URL base del objeto api para construir el link
            let paymentLink = null;
            // @ts-ignore: Accedemos a la propiedad interna .url si existe, o intentamos inferirla
            const baseUrl = api.url || (api as any)._url || "";

            if (order.payment_method !== 'cod' && order.status !== 'completed') {
                if (baseUrl) {
                    // Quitamos barra final si la tiene para evitar dobles //
                    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                    paymentLink = `${cleanBase}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
                } else {
                    paymentLink = "(No se pudo generar el link automáticamente, verifica la configuración del host)";
                }
            }

            console.log(`✅ ¡PEDIDO #${order.id} CREADO! Total: ${order.total}`);

            const result = {
                success: true,
                order_id: order.id,
                total: order.total,
                status: order.status,
                payment_link: paymentLink,
                message: "Pedido creado correctamente."
            };

            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
            };

        } catch (error: any) {
            console.error("❌ Error createOrder:", error.response?.data?.message || error.message);
            return {
                content: [{ type: "text", text: `Error: ${error.response?.data?.message || error.message}` }],
                isError: true
            };
        }
    }
};