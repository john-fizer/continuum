import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

// Reuse the working client UI without the Sites/Cloudflare server runtime.
export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_CLOUD_MEMORY': JSON.stringify('true') },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: 'dist-vercel', sourcemap: false },
});
