import { z } from "zod";
import { WooTool } from "../types.js";
import axios from "axios";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido extrayendo credenciales del cliente activo.",

    inputSchema: z.object({
        orderPayload: z.string().describe("JSON completo del pedido.")
    }),

    handler: async (api, args) => {
        try {
            // 1. EXTRAER CREDENCIALES
            // Forzamos el tipo 'api' a any para acceder a propiedades internas manualmente
            const client = api as any;

            // Intentamos leer la URL y Claves que la librería ya cargó desde Railway
            let url = client.url || client._url || "";
            const key = client.consumerKey || client._consumerKey || "";
            const secret = client.consumerSecret || client._consumerSecret || "";

            console.log(`🔍 Diagnóstico de Cliente: URL=${url ? 'OK' : 'VACÍA'} | Key=${key ? 'OK' : 'FALTA'}`);

            if (!url || !key || !secret) {
                throw new Error("❌ Error Interno: No se pudieron extraer las credenciales del cliente activo.");
            }

            // 2. LIMPIEZA DE URL (Para evitar el error ENOTFOUND)
            // Si la URL termina en /, la quitamos
            if (url.endsWith("/")) url = url.slice(0, -1);
            // Aseguramos protocolo
            if (!url.startsWith("http")) url = "https://" + url;

            // 3. PREPARAR DATOS
            let orderData;
            try {
                let cleanJson = args.orderPayload.trim();
                if (cleanJson.startsWith("```json")) cleanJson = cleanJson.replace("```json", "").replace("```", "");
                if (cleanJson.startsWith("```")) cleanJson = cleanJson.replace("```", "");
                orderData = JSON.parse(cleanJson);
            } catch (e) {
                throw new Error("El JSON del pedido no es válido.");
            }

            console.log(`🔌 Conectando manualmente a: ${url}/wp-json/wc/v3/orders`);

            // 4. ENVIAR CON AXIOS
            // Petición directa para evitar problemas de librería con endpoints específicos
            const response = await axios.post(
                `${url}/wp-json/wc/v3/orders`,
                orderData,
                {
                    params: { consumer_key: key, consumer_secret: secret },
                    headers: { "Content-Type": "application/json" }
                }
            );

            const order = response.data;

            // 5. RESPUESTA
            let paymentLink = null;
            if (order.payment_method !== 'cod' && order.status !== 'completed') {
                paymentLink = `${url}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
            }

            console.log(`✅ ¡PEDIDO #${order.id} CREADO CORRECTAMENTE! Total: ${order.total}`);

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
            const msg = error.response?.data?.message || error.message;
            console.error("❌ ERROR FATAL:", msg);
            // Si falla, mostramos qué URL intentó usar para depurar
            if (error.code === 'ENOTFOUND') {
                return { content: [{ type: "text", text: `Error de URL: Intenté conectar a '${error.config?.url}' pero falló.` }], isError: true };
            }
            return {
                content: [{ type: "text", text: `Error: ${msg}` }],
                isError: true
            };
        }
    }
};