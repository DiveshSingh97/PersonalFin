import "server-only";
import { z } from "zod";

const requiredSecret = z.string().min(1, "Required environment variable is missing");
const optionalSecret = z.string().optional().or(z.literal(""));

export const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredSecret,
  SUPABASE_SERVICE_ROLE_KEY: requiredSecret,
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("financial-uploads"),
  DATABASE_URL: requiredSecret,
  DIRECT_URL: requiredSecret,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL_CLASSIFICATION: z.string().default("gpt-5.4-mini"),
  OPENAI_MODEL_REASONING: z.string().default("gpt-5.5"),
  APP_ENCRYPTION_KEY: optionalSecret,
  CRON_SECRET: optionalSecret
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid server environment: ${message}`);
  }

  return parsed.data;
}
