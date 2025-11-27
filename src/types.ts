import { z } from "zod";

// Definimos la estructura que debe tener cualquier Tool de nuestro sistema
export interface WooTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  // El handler recibe la instancia de la API ya autenticada y los argumentos
  handler: (api: any, args: any) => Promise<any>;
}
