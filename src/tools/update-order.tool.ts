import { z } from "zod";
import { WooTool } from "../types.js";

export const updateOrderTool: WooTool = {
    name: "updateOrder",
    description: "Herramienta polivalente para gestión de pedidos. Úsala para CANCELAR un pedido (status='cancelled') o para corregir datos del cliente (dirección, teléfono, notas). NO permite cambiar productos.",

    inputSchema: z.object({
        orderId: z.coerce.number().describe("ID del pedido a modificar"),
        status: z.enum(["pending", "processing", "on-hold", "cancelled", "completed"]).optional().describe("Nuevo estado del pedido. Usa 'cancelled' si el usuario pide cancelar."),
        firstName: z.string().optional().describe("Nuevo nombre del cliente"),
        lastName: z.string().optional().describe("Nuevo apellido del cliente"),
        email: z.string().email().optional().describe("Nuevo email"),
        phone: z.string().optional().describe("Nuevo teléfono"),
        address: z.string().optional().describe("Nueva dirección (Calle y número)"),
        city: z.string().optional().describe("Nueva ciudad"),
        note: z.string().optional().describe("Nota para agregar al pedido"),
    }),

    handler: async (api, args) => {
        try {
            console.log(`📝 Actualizando pedido #${args.orderId}...`);

            // 1. Primero obtenemos el pedido para verificar su estado actual
            // Esto es una medida de seguridad para no editar pedidos ya enviados.
            let currentOrder;
            try {
                const response = await api.get(`orders/${args.orderId}`);
                currentOrder = response.data;
            } catch (e) {
                return {
                    content: [{ type: "text", text: `Error: El pedido #${args.orderId} no existe.` }],
                    isError: true
                };
            }

            // 2. Validación de seguridad: No editar si ya está completado (salvo que sea un admin, pero la IA no debería poder)
            if (currentOrder.status === "completed" || currentOrder.status === "refunded") {
                return {
                    content: [{ type: "text", text: `🚫 No se puede modificar el pedido #${args.orderId} porque ya está '${currentOrder.status}'. Contacta a soporte humano.` }],
                    isError: true
                };
            }

            // 3. Construimos el objeto de actualización dinámicamente
            const updateData: any = {};

            if (args.status) updateData.status = args.status;
            if (args.note) updateData.customer_note = args.note;

            // Actualizamos Billing (Facturación)
            if (args.firstName || args.lastName || args.email || args.phone || args.address || args.city) {
                updateData.billing = {
                    ...currentOrder.billing, // Mantenemos lo que ya tenía
                };
                if (args.firstName) updateData.billing.first_name = args.firstName;
                if (args.lastName) updateData.billing.last_name = args.lastName;
                if (args.email) updateData.billing.email = args.email;
                if (args.phone) updateData.billing.phone = args.phone;
                if (args.address) updateData.billing.address_1 = args.address;
                if (args.city) updateData.billing.city = args.city;
            }

            // Actualizamos Shipping (Envío) - Generalmente igual al billing
            if (args.firstName || args.lastName || args.address || args.city) {
                updateData.shipping = {
                    ...currentOrder.shipping,
                };
                if (args.firstName) updateData.shipping.first_name = args.firstName;
                if (args.lastName) updateData.shipping.last_name = args.lastName;
                if (args.address) updateData.shipping.address_1 = args.address;
                if (args.city) updateData.shipping.city = args.city;
            }

            // 4. Si no hay nada que actualizar, avisamos
            if (Object.keys(updateData).length === 0) {
                return {
                    content: [{ type: "text", text: "⚠️ No se enviaron datos para actualizar." }],
                };
            }

            // 5. Enviamos la actualización a Woo
            const response = await api.put(`orders/${args.orderId}`, updateData);
            const updatedOrder = response.data;

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            id: updatedOrder.id,
                            status: updatedOrder.status,
                            new_address: updatedOrder.shipping.address_1,
                            message: "Pedido actualizado correctamente."
                        }, null, 2),
                    },
                ],
            };

        } catch (error: any) {
            console.error("Error updating order:", error.message);
            return {
                content: [{ type: "text", text: `Error al actualizar pedido: ${error.message}` }],
                isError: true,
            };
        }
    },
};