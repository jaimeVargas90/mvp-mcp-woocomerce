import { z } from "zod";
import { WooTool } from "../types.js";
import axios from "axios";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce recibiendo el JSON completo (Producción).",

    inputSchema: z.object({
        orderPayload: z.string().describe("JSON completo del pedido con estructura de WooCommerce API.")
    }),

    handler: async (api, args) => {
        try {
            // ============================================================
            // 1. OBTENCIÓN SEGURA DE CREDENCIALES (Desde Railway/Env)
            // ============================================================
            // Intentamos leer las variables del sistema. 
            // Si por alguna razón no están, intentamos sacarlas del objeto 'api' si fuera posible, 
            // o dejamos strings vacíos para que salte el error abajo.
            let url = process.env.WOO_URL || "";
            const key = process.env.WOO_CONSUMER_KEY || "";
            const secret = process.env.WOO_SECRET || "";

            console.log(`🔍 Verificando entorno... URL detectada: ${url ? url : "NO DETECTADA"}`);

            // Validación de seguridad
            if (!url || !key || !secret) {
                throw new Error("❌ Error de Configuración: No se detectaron las variables de entorno (WOO_URL, WOO_CONSUMER_KEY, WOO_SECRET) en el servidor.");
            }

            // ============================================================
            // 2. LIMPIEZA Y PREPARACIÓN
            // ============================================================

            // Corrección de URL para evitar redirecciones que borren datos
            if (url.endsWith("/")) url = url.slice(0, -1);
            if (!url.startsWith("http")) url = "https://" + url;

            // Parseo del JSON que viene del chat
            let orderData;
            try {
                let cleanJson = args.orderPayload.trim();
                // Limpiar bloques de código markdown si la IA los pone
                if (cleanJson.startsWith("```json")) cleanJson = cleanJson.replace("```json", "").replace("```", "");
                if (cleanJson.startsWith("```")) cleanJson = cleanJson.replace("```", "");
                orderData = JSON.parse(cleanJson);
            } catch (e) {
                throw new Error("El texto enviado no es un JSON válido.");
            }

            console.log(`🔌 Conectando a: ${url}/wp-json/wc/v3/orders`);
            console.log("📦 Payload parseado (Items):", JSON.stringify(orderData.line_items));

            // ============================================================
            // 3. ENVÍO ROBUSTO (AXIOS)
            // ============================================================
            // Usamos Axios en lugar de 'api.post' para tener control total sobre headers
            // y evitar el bug del "pedido vacío" por redirecciones.
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

            // ============================================================
            // 4. RESPUESTA
            // ============================================================
            let paymentLink = null;
            // Generar link solo si no es contraentrega y no está completado
            if (order.payment_method !== 'cod' && order.status !== 'completed' && order.status !== 'processing') {
                paymentLink = `${url}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
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
            // Manejo detallado de errores
            const errorMsg = error.response?.data?.message || error.message;
            console.error("❌ ERROR CREATE ORDER:", errorMsg);

            return {
                content: [{ type: "text", text: `Error creando el pedido: ${errorMsg}` }],
                isError: true
            };
        }
    }
};