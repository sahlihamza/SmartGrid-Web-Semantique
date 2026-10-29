import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Le back-end Flask tourne sur le port 5000 ; CORS est déjà activé côté serveur,
    // on interroge donc directement http://localhost:5000/api via VITE_API_URL.
    host: true,
  },
})
