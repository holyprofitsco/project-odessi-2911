import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The app is served from github.io/<repo-name>/, so every path starts there.
export default defineConfig({
  base: '/project-odessi-2911/',
  plugins: [react(), tailwindcss()],
})
