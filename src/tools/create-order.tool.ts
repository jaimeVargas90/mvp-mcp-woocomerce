import { z } from "zod";
import { WooTool } from "../types.js";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un pedido en WooCommerce. Soporta productos simples y variaciones. El pago se configura como 'Contra Reembolso' por defecto.",

    inputSchema: z.object({
        productId: z.coerce.number().describe("ID del producto principal (padre)"),
        variationId: z.coerce.number().optional().describe("ID de la variación específica (si es talla/color). Opcional."),
        quantity: z.coerce.number().default(1).describe("Cantidad a comprar"),
        firstName: z.string().describe("Nombre del cliente"),
        lastName: z.string().describe("Apellido del cliente"),
        email: z.string().email().describe("Correo electrónico (usado para notificaciones)"),
        phone: z.string().optional().describe("Teléfono de contacto"),
        address: z.string().describe("Dirección completa de envío (Calle, número, ciudad)"),
        note: z.string().optional().describe("Nota del cliente para el pedido (ej: 'Dejar en portería')"),
    }),

    handler: async (api, args) => {
        try {
            console.log(`🛒 Creando pedido para ${args.email} | Producto: ${args.productId} ${args.variationId ? `(Var: ${args.variationId})` : ''}`);

            // Construcción del ítem de línea
            const lineItem: any = {
                product_id: args.productId,
                quantity: args.quantity,
            };

            // 🔥 CRUCIAL: Si la IA detectó una variación (talla/color), la inyectamos aquí.
            if (args.variationId) {
                lineItem.variation_id = args.variationId;
            }

            const data = {
                payment_method: "cod",
                payment_method_title: "Pago contra reembolso / Transferencia",
                set_paid: false,
                customer_note: args.note || "", // Agregamos la nota del cliente
                billing: {
                    first_name: args.firstName,
                    last_name: args.lastName,
                    address_1: args.address,
                    email: args.email,
                    phone: args.phone || "",
                },
                shipping: {
                    first_name: args.firstName,
                    last_name: args.lastName,
                    address_1: args.address,
                },
                line_items: [lineItem], // Usamos el objeto dinámico creado arriba
            };

            const response = await api.post("orders", data);

            // Devolvemos un JSON estructurado para que la IA tenga los datos exactos
            // y pueda armar una respuesta bonita.
            const resultData = {
                success: true,
                order_id: response.data.id,
                order_key: response.data.order_key, // Útil si quieres generar links de pago
                status: response.data.status,
                currency: response.data.currency,
                total: response.data.total,
                payment_method: response.data.payment_method_title
            };

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(resultData, null, 2),
                    },
                ],
            };

        } catch (error: any) {
            // Intentamos capturar errores específicos de WooCommerce (ej: "Out of stock")
            const wooError = error.response?.data?.message;
            console.error("Error creando pedido:", wooError || error.message);

            return {
                content: [{ type: "text", text: `Error al crear el pedido: ${wooError || error.message}` }],
                isError: true,
            };
        }
    },
};
