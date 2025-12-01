import { z } from "zod";
import { WooTool } from "../types.js";

export const updateOrderTool: WooTool = {
    name: "updateOrder",
    description: "Herramienta para gestionar pedidos. Permite CANCELAR (status='cancelled') o corregir datos de contacto y envío. NO cambia productos.",

    inputSchema: z.object({
        orderId: z.coerce.number().describe("ID del pedido a modificar"),
        status: z.enum(["pending", "processing", "on-hold", "cancelled", "completed"]).optional().describe("Nuevo estado. Usa 'cancelled' para cancelar."),

        // Datos de Contacto
        firstName: z.string().optional().describe("Nuevo nombre"),
        lastName: z.string().optional().describe("Nuevo apellido"),
        email: z.string().email().optional().describe("Nuevo email"),
        phone: z.string().optional().describe("Nuevo teléfono"),

        // Dirección Completa (Agregamos state y country)
        address: z.string().optional().describe("Nueva dirección (Calle y número)"),
        city: z.string().optional().describe("Nueva ciudad"),
        state: z.string().optional().describe("Código del Departamento/Estado (ej: 'CUN', 'ANT', 'MIA')"),
        country: z.string().length(2).optional().describe("Código de país (ej: 'CO', 'MX')"),

        note: z.string().optional().describe("Nota para agregar al pedido"),
    }),

    handler: async (api, args) => {
        try {
            console.log(`📝 Actualizando pedido #${args.orderId}...`);

            // 1. Verificar existencia y estado actual
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

            // 2. Candado de Seguridad
            if (currentOrder.status === "completed" || currentOrder.status === "refunded") {
                return {
                    content: [{ type: "text", text: `🚫 No se puede editar el pedido #${args.orderId} porque ya está '${currentOrder.status}'.` }],
                    isError: true
                };
            }

            // 3. Construcción dinámica del payload
            const updateData: any = {};

            if (args.status) updateData.status = args.status;
            if (args.note) updateData.customer_note = args.note;

            // Función helper para actualizar dirección sin repetir código
            const buildAddressObject = (current: any, newArgs: any) => ({
                ...current, // Mantiene datos viejos
                ...(newArgs.firstName && { first_name: newArgs.firstName }),
                ...(newArgs.lastName && { last_name: newArgs.lastName }),
                ...(newArgs.address && { address_1: newArgs.address }),
                ...(newArgs.city && { city: newArgs.city }),
                ...(newArgs.state && { state: newArgs.state }),   // 🔥 Nuevo
                ...(newArgs.country && { country: newArgs.country }), // 🔥 Nuevo
                ...(newArgs.email && { email: newArgs.email }),
                ...(newArgs.phone && { phone: newArgs.phone }),
            });

            // Detectar si hay cambios de dirección/contacto
            const hasContactChanges = args.firstName || args.lastName || args.email || args.phone || args.address || args.city || args.state || args.country;

            if (hasContactChanges) {
                updateData.billing = buildAddressObject(currentOrder.billing, args);
                updateData.shipping = buildAddressObject(currentOrder.shipping, args);
            }

            // 4. Salida temprana si no hay nada que hacer
            if (Object.keys(updateData).length === 0) {
                return {
                    content: [{ type: "text", text: "⚠️ No se enviaron datos para actualizar." }],
                };
            }

            // 5. Ejecutar actualización
            const response = await api.put(`orders/${args.orderId}`, updateData);
            const updated = response.data;

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            id: updated.id,
                            status: updated.status,
                            updated_fields: Object.keys(updateData),
                            new_shipping: {
                                address: updated.shipping.address_1,
                                city: updated.shipping.city,
                                state: updated.shipping.state // Confirmamos el cambio
                            },
                            message: "Pedido actualizado correctamente."
                        }, null, 2),
                    },
                ],
            };

        } catch (error: any) {
            console.error("Error updating order:", error.message);
            return {
                content: [{ type: "text", text: `Error al actualizar: ${error.message}` }],
                isError: true,
            };
        }
    },
};