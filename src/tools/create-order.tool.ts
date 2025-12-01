import { z } from "zod";
import { WooTool } from "../types.js";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce. Soporta múltiples productos (carrito), selección de envío y cupones. Pago por defecto: Contra Reembolso.",

    inputSchema: z.object({
        // CHANGE 1: Now receiving an ARRAY of products, not just one.
        items: z.array(z.object({
            productId: z.coerce.number().describe("ID del producto"),
            quantity: z.coerce.number().min(1).default(1).describe("Cantidad"),
            variationId: z.coerce.number().optional().describe("ID de variación (si aplica)")
        })).describe("Lista de productos a comprar"),

        firstName: z.string().describe("Nombre del cliente"),
        lastName: z.string().describe("Apellido del cliente"),
        email: z.string().email().describe("Email para notificaciones"),
        phone: z.string().optional().describe("Teléfono"),

        // Address
        address: z.string().describe("Calle y número"),
        city: z.string().describe("Ciudad"),
        state: z.string().optional().describe("Departamento/Estado (Código ISO si es posible, ej: CUN)"),
        country: z.string().length(2).default("CO").describe("País (Código ISO, ej: CO)"),

        note: z.string().optional().describe("Nota del cliente"),

        // CHANGE 2: Support for shipping method (ID obtained from getShippingMethods)
        shippingMethodId: z.string().optional().describe("ID del método de envío (ej: 'flat_rate:1'). Si se omite, Woo intentará asignar uno por defecto."),

        // CHANGE 3: Coupons
        couponCode: z.string().optional().describe("Código de cupón a aplicar")
    }),

    handler: async (api, args) => {
        try {
            console.log(`🛒 Creating Multi-Item order for ${args.email} | Items: ${args.items.length}`);

            // 1. Map items to Woo format
            const lineItems = args.items.map(item => {
                const line: any = {
                    product_id: item.productId,
                    quantity: item.quantity
                };
                if (item.variationId) line.variation_id = item.variationId;
                return line;
            });

            // 2. Configure shipping lines (if ID was sent)
            const shippingLines = args.shippingMethodId ? [
                {
                    method_id: args.shippingMethodId,
                    method_title: "Envío Seleccionado" // Woo will recalculate the real title on creation
                }
            ] : [];

            // 3. Configure coupons
            const couponLines = args.couponCode ? [
                { code: args.couponCode }
            ] : [];

            // 4. Build full payload
            const data = {
                payment_method: "cod",
                payment_method_title: "Pago contra reembolso",
                set_paid: false,
                customer_note: args.note || "",
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
                shipping_lines: shippingLines,
                coupon_lines: couponLines
            };

            const response = await api.post("orders", data);
            const order = response.data;

            // 5. Enriched response
            const resultData = {
                success: true,
                order_id: order.id,
                status: order.status,
                currency: order.currency,
                total: order.total,
                shipping_total: order.shipping_total,
                discount_total: order.discount_total, // To confirm if coupon worked
                items_count: order.line_items.length,
                payment_method: order.payment_method_title,
                message: "Pedido creado exitosamente. Se ha enviado un correo al cliente."
            };

            return {
                content: [{ type: "text", text: JSON.stringify(resultData, null, 2) }],
            };

        } catch (error: any) {
            const wooError = error.response?.data?.message;
            console.error("Error creating order:", wooError || error.message);

            return {
                content: [{ type: "text", text: `Error al crear pedido: ${wooError || error.message}` }],
                isError: true,
            };
        }
    },
};