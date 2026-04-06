import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        table: resolve(rootDir, 'table/index.html'),
        visualizer: resolve(rootDir, 'visualizer/index.html'),
        privacy: resolve(rootDir, 'privacy/index.html'),
        terms: resolve(rootDir, 'terms/index.html'),
        contact: resolve(rootDir, 'contact/index.html'),
        about: resolve(rootDir, 'about/index.html'),
      },
    },
  },
  plugins: [
    tailwindcss(), 
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,worker.js}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      },
      manifest: {
        name: 'ToolSpoon',
        short_name: 'ToolSpoon',
        description: 'Private, browser-based JSON formatter, visualizer, JSON to table tool, schema generator, diff tool, repair tool, validator, converter, and viewer.',
        start_url: '/',
        scope: '/',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
