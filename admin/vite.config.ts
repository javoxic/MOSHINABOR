import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const pkg = (name: string) => fileURLToPath(new URL(`../packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@moshina/shared': pkg('shared'),
      '@moshina/validation': pkg('validation'),
      '@moshina/api-types': pkg('api-types'),
    },
  },
  server: {
    port: 5173,
    // Same-origin API in development so the SameSite=Strict refresh cookie works.
    proxy: { '/v1': { target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:3000', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/v1': { target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:3000', changeOrigin: false } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
