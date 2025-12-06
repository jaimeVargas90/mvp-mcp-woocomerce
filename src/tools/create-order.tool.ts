import { z } from "zod";
import { WooTool } from "../types.js";
import axios from "axios";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en la tienda. No requiere construir JSON complejo, solo pasar los datos del cliente y los productos.",

    inputSchema: z.object({
        // 1. Datos del Cliente (Simplificados)
        firstName: z.string().describe("Nombre del cliente"),
        lastName: z.string().describe("Apellido del cliente"),
        email: z.string().email().describe("Email del cliente"),
        phone: z.string().describe("Teléfono"),
        address: z.string().describe("Dirección completa"),
        city: z.string().describe("Ciudad"),
        state: z.string().describe("Código de provincia/estado (ej: ANT, CUN, BOG)"),
        country: z.string().default("CO").describe("Código de país (Default: CO)"),

        // 2. Productos (Array simple)
        line_items: z.array(z.object({
            product_id: z.number().describe("ID del producto a comprar"),
            variation_id: z.number().optional().describe("ID de la variación si aplica (talla/color)"),
            quantity: z.number().default(1).describe("Cantidad")
        })).describe("Lista de productos a comprar"),

        // 3. Método de pago (Opcional, con defaults inteligentes)
        paymentMethod: z.enum(["bacs", "cod"]).default("bacs").describe("bacs (Transferencia) o cod (Contra entrega)"),
        paymentTitle: z.string().optional().describe("Título del pago (ej: Transferencia Bancaria)")
    }),

    handler: async (api, args) => {
        try {
            // --- 1. CONSTRUCCIÓN DEL JSON "DIFÍCIL" (Lo hacemos aquí, no en el Prompt) ---
            const billingData = {
                first_name: args.firstName,
                last_name: args.lastName,
                address_1: args.address,
                city: args.city,
                state: args.state,
                postcode: "", // Opcional
                country: args.country,
                email: args.email,
                phone: args.phone
            };

            // Por defecto, envío = facturación para simplificar
            const shippingData = { ...billingData };

            const orderPayload = {
                payment_method: args.paymentMethod,
                payment_method_title: args.paymentTitle || (args.paymentMethod === 'cod' ? 'Contra Entrega' : 'Transferencia'),
                set_paid: false,
                status: "pending", // Siempre pendiente hasta que paguen
                billing: billingData,
                shipping: shippingData,
                line_items: args.line_items
            };

            // --- 2. LOGICA DE CONEXIÓN (Igual que antes, robusta) ---
            const client = api as any;
            let url = client.url || client._url || "";
            const key = client.consumerKey || client._consumerKey || "";
            const secret = client.consumerSecret || client._consumerSecret || "";

            if (!url.startsWith("http")) url = "https://" + url;
            if (url.endsWith("/")) url = url.slice(0, -1);

            console.log(`🛒 Creando pedido para: ${args.firstName} ${args.lastName} | Items: ${args.line_items.length}`);

            const response = await axios.post(
                `${url}/wp-json/wc/v3/orders`,
                orderPayload,
                {
                    params: { consumer_key: key, consumer_secret: secret },
                    headers: { "Content-Type": "application/json" }
                }
            );

            const order = response.data;

            // --- 3. RESPUESTA ---
            // Generamos link de pago si no es Contra Entrega
            let paymentLink = null;
            if (order.payment_method !== 'cod' && order.status !== 'completed') {
                // Intentamos ser más inteligentes con la URL del checkout
                paymentLink = `${url}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
            }

            return {
                content: [{
                    type: "text", text: JSON.stringify({
                        success: true,
                        order_id: order.id,
                        status: order.status,
                        total: order.total,
                        payment_link: paymentLink, // El LLM le mostrará esto al usuario
                        message: "Pedido creado exitosamente."
                    }, null, 2)
                }]
            };

        } catch (error: any) {
            const msg = error.response?.data?.message || error.message;
            console.error("❌ Error creando pedido:", msg);
            return {
                content: [{ type: "text", text: `Error al crear el pedido: ${msg}` }],
                isError: true
            };
        }
    }
};