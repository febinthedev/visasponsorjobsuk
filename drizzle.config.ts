import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local', quiet: true });

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // Session pooler (port 5432): migrations need a session connection.
    url: process.env.DIRECT_DATABASE_URL!,
  },
});
