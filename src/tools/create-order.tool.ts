import { z } from "zod";
import { WooTool } from "../types.js";
import axios from "axios";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce (Modo Directo con Credenciales Fijas).",

    inputSchema: z.object({
        orderPayload: z.string().describe("JSON completo del pedido.")
    }),

    handler: async (api, args) => {
        try {
            // ============================================================
            // 🚨 ZONA DE CREDENCIALES (PÉGALAS AQUÍ DIRECTAMENTE)
            // ============================================================
            // 1. URL DE TU TIENDA (Ya la puse yo, NO la cambies)
            let url = "https://tiendamedicalospinos.com";

            // 2. TUS CLAVES DE WOOCOMMERCE (¡Pegalas dentro de las comillas!)
            const key = "ck_f9c4606e08a1780f8ff97168654ccac496b7210e"; // <--- Pega tu Consumer Key aquí
            const secret = "cs_7d8d5e41d46b32885ef6161e5a08258a0c5ec098"; // <--- Pega tu Consumer Secret aquí

            console.log(`🔌 1. CONECTANDO A: ${url}/wp-json/wc/v3/orders`);

            // Validación rápida para que no falle silenciosamente
            if (key.startsWith("ck_XXX") || secret.startsWith("cs_XXX")) {
                throw new Error("❌ FALTA CONFIGURAR LAS CLAVES: Edita el archivo createOrder.ts y pon tus credenciales reales (ck_... y cs_...).");
            }

            // ============================================================
            // LOGICA DE PROCESAMIENTO
            // ============================================================
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

            console.log("📦 2. ENVIANDO PAYLOAD:", JSON.stringify(orderData.line_items));

            // ENVÍO MANUAL CON AXIOS
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

            // RESPUESTA EXITOSA
            let paymentLink = null;
            if (order.status !== 'completed' && order.status !== 'processing') {
                paymentLink = `${url}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
            }

            console.log(`✅ ¡PEDIDO #${order.id} CREADO! Total: ${order.total}`);

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
            // Log mejorado para ver el error real de Axios
            const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error("❌ ERROR AXIOS:", errorDetails);
            return {
                content: [{ type: "text", text: `Error conectando a la tienda: ${errorDetails}` }],
                isError: true
            };
        }
    }
};