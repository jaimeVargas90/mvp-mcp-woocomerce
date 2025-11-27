import { z } from "zod";
import { WooTool } from "../types.js";

export const createOrderTool: WooTool = {
    name: "createOrder",
    description: "Crea un nuevo pedido para un cliente. Devuelve el ID del pedido creado.",
    inputSchema: z.object({
        productId: z.coerce.number().describe("ID del producto a comprar"),
        quantity: z.coerce.number().default(1).describe("Cantidad de productos"),
        firstName: z.string().describe("Nombre del cliente"),
        lastName: z.string().describe("Apellido del cliente"),
        email: z.string().email().describe("Correo electrónico del cliente"),
        phone: z.string().optional().describe("Teléfono del cliente (opcional)"),
        address: z.string().describe("Dirección de envío"),
    }),
    handler: async (api, args) => {
        try {
            console.log(`🛒 Creando pedido para ${args.email}...`);

            const data = {
                payment_method: "cod", // Cash on Delivery (Contra reembolso) por defecto
                payment_method_title: "Pago contra reembolso",
                set_paid: false,
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
                line_items: [
                    {
                        product_id: args.productId,
                        quantity: args.quantity,
                    },
                ],
            };

            const response = await api.post("orders", data);

            return {
                content: [
                    {
                        type: "text",
                        text: `¡Pedido creado con éxito! ID del pedido: ${response.data.id}. Estado: ${response.data.status}. Total a pagar: ${response.data.total} ${response.data.currency}.`,
                    },
                ],
            };
        } catch (error: any) {
            console.error("Error creando pedido:", error.response?.data?.message || error.message);
            return {
                content: [{ type: "text", text: `Error al crear el pedido: ${error.response?.data?.message || error.message}` }],
                isError: true,
            };
        }
    },
};