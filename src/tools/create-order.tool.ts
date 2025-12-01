import { z } from "zod";
import { WooTool } from "../types.js";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce. Soporta múltiples productos (carrito), selección de envío y cupones. Pago por defecto: Contra Reembolso.",

    inputSchema: z.object({
        // 🔥 CAMBIO 1: Ahora recibimos un ARRAY de productos, no uno solo.
        items: z.array(z.object({
            productId: z.coerce.number().describe("ID del producto"),
            quantity: z.coerce.number().min(1).default(1).describe("Cantidad"),
            variationId: z.coerce.number().optional().describe("ID de variación (si aplica)")
        })).describe("Lista de productos a comprar"),

        firstName: z.string().describe("Nombre del cliente"),
        lastName: z.string().describe("Apellido del cliente"),
        email: z.string().email().describe("Email para notificaciones"),
        phone: z.string().optional().describe("Teléfono"),

        // Dirección
        address: z.string().describe("Calle y número"),
        city: z.string().describe("Ciudad"),
        state: z.string().optional().describe("Departamento/Estado (Código ISO si es posible, ej: CUN)"),
        country: z.string().length(2).default("CO").describe("País (Código ISO, ej: CO)"),

        note: z.string().optional().describe("Nota del cliente"),

        // 🔥 CAMBIO 2: Soporte para método de envío (ID obtenido de getShippingMethods)
        shippingMethodId: z.string().optional().describe("ID del método de envío (ej: 'flat_rate:1'). Si se omite, Woo intentará asignar uno por defecto."),

        // 🔥 CAMBIO 3: Cupones
        couponCode: z.string().optional().describe("Código de cupón a aplicar")
    }),

    handler: async (api, args) => {
        try {
            console.log(`🛒 Creando pedido Multi-Item para ${args.email} | Items: ${args.items.length}`);

            // 1. Mapeamos los items al formato de Woo
            const lineItems = args.items.map(item => {
                const line: any = {
                    product_id: item.productId,
                    quantity: item.quantity
                };
                if (item.variationId) line.variation_id = item.variationId;
                return line;
            });

            // 2. Configuramos líneas de envío (si se envió el ID)
            const shippingLines = args.shippingMethodId ? [
                {
                    method_id: args.shippingMethodId,
                    method_title: "Envío Seleccionado" // Woo recalculará el título real al crear
                }
            ] : [];

            // 3. Configuramos cupones
            const couponLines = args.couponCode ? [
                { code: args.couponCode }
            ] : [];

            // 4. Construimos el payload completo
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

            // 5. Respuesta enriquecida
            const resultData = {
                success: true,
                order_id: order.id,
                status: order.status,
                currency: order.currency,
                total: order.total,
                shipping_total: order.shipping_total,
                discount_total: order.discount_total, // Para confirmar si el cupón funcionó
                items_count: order.line_items.length,
                payment_method: order.payment_method_title,
                message: "Pedido creado exitosamente. Se ha enviado un correo al cliente."
            };

            return {
                content: [{ type: "text", text: JSON.stringify(resultData, null, 2) }],
            };

        } catch (error: any) {
            const wooError = error.response?.data?.message;
            console.error("Error creando pedido:", wooError || error.message);

            return {
                content: [{ type: "text", text: `Error al crear pedido: ${wooError || error.message}` }],
                isError: true,
            };
        }
    },
};