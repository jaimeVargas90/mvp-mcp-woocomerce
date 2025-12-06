import { z } from "zod";

// Define la estructura para cualquier Herramienta (Tool) en el sistema
export interface WooTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  // El handler recibe la instancia de la API autenticada y los argumentos
  handler: (api: any, args: any) => Promise<any>;
}
