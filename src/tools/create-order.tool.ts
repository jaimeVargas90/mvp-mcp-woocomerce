import { z } from "zod";
import { WooTool } from "../types.js";
import axios from "axios"; // 🔥 IMPORTANTE: Usamos Axios directo

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce (Modo Directo).",

    inputSchema: z.object({
        orderPayload: z.string().describe("JSON completo del pedido.")
    }),

    handler: async (api, args) => { // 'api' llega pero lo ignoraremos para usar axios manual
        try {
            // 1. OBTENER Y LIMPIAR CREDENCIALES
            // (Las leemos directamente del entorno para asegurar que no haya intermediarios)
            let url = process.env.WOO_URL || "";
            const key = process.env.WOO_CONSUMER_KEY || "";
            const secret = process.env.WOO_SECRET || "";

            // 🔥 CORRECCIÓN AUTOMÁTICA DE URL (El antídoto al pedido vacío)
            if (url.endsWith("/")) url = url.slice(0, -1); // Quitar barra final
            if (!url.startsWith("http")) url = "https://" + url; // Forzar protocolo

            console.log(`🔌 CONECTANDO A: ${url}/wp-json/wc/v3/orders`);

            // 2. PARSEAR EL JSON QUE VIENE DEL CHAT
            let orderData;
            try {
                let cleanJson = args.orderPayload.trim();
                // Limpieza de bloques de código Markdown
                if (cleanJson.startsWith("```json")) cleanJson = cleanJson.replace("```json", "").replace("```", "");
                if (cleanJson.startsWith("```")) cleanJson = cleanJson.replace("```", "");
                orderData = JSON.parse(cleanJson);
            } catch (e) {
                throw new Error("El texto no es un JSON válido.");
            }

            console.log("📦 PAYLOAD A ENVIAR:", JSON.stringify(orderData));

            // 3. ENVÍO MANUAL CON AXIOS (Saltando la librería wrapper)
            // Esto evita problemas de versión o redirecciones ocultas
            const response = await axios.post(
                `${url}/wp-json/wc/v3/orders`,
                orderData,
                {
                    params: {
                        consumer_key: key,
                        consumer_secret: secret
                    },
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );

            const order = response.data;

            // 4. RESPUESTA EXITOSA
            let paymentLink = null;
            if (order.status !== 'completed' && order.status !== 'processing') {
                paymentLink = `${url}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
            }

            console.log(`✅ ¡PEDIDO CREADO! ID: ${order.id} | Total: ${order.total}`);

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        success: true,
                        order_id: order.id,
                        total: order.total,
                        payment_link: paymentLink,
                        message: "Pedido creado correctamente."
                    }, null, 2)
                }]
            };

        } catch (error: any) {
            console.error("❌ ERROR AXIOS:", error.response?.data || error.message);
            return {
                content: [{ type: "text", text: `Error: ${JSON.stringify(error.response?.data || error.message)}` }],
                isError: true
            };
        }
    }
};