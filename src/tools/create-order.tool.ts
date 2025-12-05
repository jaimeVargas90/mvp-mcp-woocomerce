import { z } from "zod";
import { WooTool } from "../types.js";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce. Soporta 'Pago en Línea' (genera link) y 'Contra Entrega' (sin link).",

    inputSchema: z.object({
        // 👇👇👇 NUEVO CAMPO: SELECTOR DE PAGO 👇👇👇
        paymentMethod: z.enum(["online", "cod"])
            .describe("Método de pago. Usa 'online' si el cliente quiere pagar ya (Link de pago). Usa 'cod' si el cliente pagará al recibir (Contraentrega)."),

        // ... (El resto de tus campos de productos siguen igual) ...
        items: z.preprocess(
            (val) => {
                if (typeof val === 'string') {
                    try { return JSON.parse(val); } catch (e) { return val; }
                }
                return val;
            },
            z.array(z.object({
                productId: z.coerce.number().describe("ID del producto"),
                quantity: z.coerce.number().min(1).default(1).describe("Cantidad"),
                variationId: z.coerce.number().optional().describe("ID de variación")
            }))
        ).describe("Lista de productos"),

        firstName: z.string().describe("Nombre"),
        lastName: z.string().describe("Apellido"),
        email: z.string().email().describe("Email"),
        phone: z.string().optional().describe("Teléfono"),
        address: z.string().describe("Dirección"),
        city: z.string().describe("Ciudad"),
        state: z.string().optional().describe("Departamento"),
        country: z.string().length(2).default("CO").describe("País"),
        note: z.string().optional().describe("Nota"),
        shippingMethodId: z.string().optional().describe("ID envío"),
        couponCode: z.string().optional().describe("Cupón")
    }),

    handler: async (api, args) => {
        try {
            console.log(`🛒 Creating Order (${args.paymentMethod}) for ${args.email}`);

            const lineItems = args.items.map(item => {
                const line: any = { product_id: item.productId, quantity: item.quantity };
                if (item.variationId) line.variation_id = item.variationId;
                return line;
            });

            // 👇👇👇 LÓGICA MÁGICA DE PAGO 👇👇👇
            let paymentConfig = {};

            if (args.paymentMethod === 'cod') {
                // Configuración para CONTRAENTREGA
                paymentConfig = {
                    payment_method: "cod",
                    payment_method_title: "Pago Contra Entrega",
                    status: "processing", // La orden nace confirmada (para despachar)
                    set_paid: false
                };
            } else {
                // Configuración para PAGO ONLINE (Tarjeta/PSE)
                paymentConfig = {
                    payment_method: "bacs", // Pendiente / Transferencia
                    payment_method_title: "Pago en Línea (Pendiente)",
                    status: "pending", // La orden nace en espera del pago
                    set_paid: false
                };
            }

            const data = {
                ...paymentConfig, // Inyectamos la config elegida arriba
                customer_note: args.note || "Pedido vía Chatbot",
                billing: {
                    first_name: args.firstName,
                    last_name: args.lastName,
                    address_1: args.address,
                    city: args.city,
                    state: args.state || "",
                    country: args.country,
                    email: args.email,
                    phone: args.phone || "",
                },
                shipping: {
                    first_name: args.firstName,
                    last_name: args.lastName,
                    address_1: args.address,
                    city: args.city,
                    state: args.state || "",
                    country: args.country,
                },
                line_items: lineItems,
                shipping_lines: args.shippingMethodId ? [{ method_id: args.shippingMethodId, method_title: "Envío" }] : [],
                coupon_lines: args.couponCode ? [{ code: args.couponCode }] : []
            };

            const response = await api.post("orders", data);
            const order = response.data;

            // 👇 PREPARAMOS LA RESPUESTA PARA LA IA
            let responseData: any = {
                success: true,
                order_id: order.id,
                total: order.total,
                status: order.status,
                message: ""
            };

            if (args.paymentMethod === 'online') {
                // SI ES ONLINE -> Generamos y devolvemos el Link
                const domain = "https://tiendamedicalospinos.com";
                const payLink = `${domain}/finalizar-compra/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;

                responseData.payment_link = payLink;
                responseData.message = "Orden Creada. Se requiere pago en el link.";
            } else {
                // SI ES CONTRAENTREGA -> No hay link, solo confirmación
                responseData.payment_link = null;
                responseData.message = "Orden Confirmada exitosamente. Se pagará al recibir.";
            }

            console.log(`✅ Order #${order.id} Created [${args.paymentMethod}].`);

            return {
                content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }],
            };

        } catch (error: any) {
            console.error("Error creating order:", error.response?.data?.message || error.message);
            return {
                content: [{ type: "text", text: `Error: ${error.response?.data?.message || error.message}` }],
                isError: true,
            };
        }
    },
};