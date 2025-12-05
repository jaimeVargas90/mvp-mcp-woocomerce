import { z } from "zod";
import { WooTool } from "../types.js";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce recibiendo el JSON completo (Payload) idéntico a la API.",

    inputSchema: z.object({
        // Solo pedimos un argumento: El JSON completo como string
        orderPayload: z.string().describe("El JSON completo del pedido con estructura de WooCommerce API (billing, shipping, line_items, etc).")
    }),

    handler: async (api, args) => {
        try {
            console.log("🚨 1. PAYLOAD RECIBIDO DEL CHAT:", args.orderPayload);

            // 1. Limpieza del string (Por si la IA manda comillas extra o bloques de código Markdown)
            let cleanJson = args.orderPayload.trim();

            // Quitar bloques de código markdown (```json ... ```) si la IA los pone
            if (cleanJson.startsWith("```json")) {
                cleanJson = cleanJson.replace("```json", "").replace("```", "");
            } else if (cleanJson.startsWith("```")) {
                cleanJson = cleanJson.replace("```", "");
            }

            cleanJson = cleanJson.trim();

            // 2. Convertir Texto a Objeto JSON
            let orderData;
            try {
                orderData = JSON.parse(cleanJson);
            } catch (e) {
                console.error("❌ Error de sintaxis JSON:", e);
                throw new Error("El texto enviado por el chat no es un JSON válido. Revisa el prompt en uChat.");
            }

            console.log("📦 2. ENVIANDO A WOOCOMMERCE...", JSON.stringify(orderData.line_items));

            // 3. Enviar a WooCommerce (Pasamanos directo)
            const response = await api.post("orders", orderData);
            const order = response.data;

            // 4. Generar Link de Pago si es necesario (y si no es contraentrega)
            let paymentLink = null;
            if (orderData.payment_method !== 'cod' && order.status !== 'completed') {
                paymentLink = `https://tiendamedicalospinos.com/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
            }

            console.log(`✅ Pedido #${order.id} Creado. Total: ${order.total}`);

            const result = {
                success: true,
                order_id: order.id,
                status: order.status,
                total: order.total,
                payment_link: paymentLink,
                message: "Pedido creado correctamente."
            };

            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
            };

        } catch (error: any) {
            console.error("❌ ERROR WOOCOMMERCE:", error.response?.data || error.message);
            // Devolver error detallado para ver qué falló
            return {
                content: [{ type: "text", text: `Error: ${error.message} - ${JSON.stringify(error.response?.data?.message || "")}` }],
                isError: true
            };
        }
    }
};