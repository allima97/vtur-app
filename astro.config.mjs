import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  adapter: cloudflare({
    // Sharp não roda no runtime do Cloudflare; servir imagens sem processamento.
    imageService: "passthrough",
    // Envolve o handler do Astro com try/catch para evitar Error 1101 (uncaught exception no Worker).
    workerEntryPoint: {
      path: "src/worker.ts",
    },
  }),
  // Middleware + Supabase SSR precisam de modo server/híbrido para evitar redirecionos durante o build.
  output: 'server',
  vite: {
    ssr: {
      // Primer injeta imports CSS internos no runtime SSR; sem bundlar o pacote,
      // Node/Workers tenta carregar esses .css como módulo externo e quebra a rota.
      noExternal: [/^@primer\//],
    },
    // Evita falhas de "Outdated Optimize Dep" no dev ao carregar gráficos
    optimizeDeps: {
      // Vite pode reotimizar deps ao navegar entre telas e causar 504 "Outdated Optimize Dep".
      // Com `noDiscovery`, a lista abaixo vira a fonte de verdade e evita reotimizações em runtime.
      noDiscovery: true,
      force: true,
      // Essas libs são pesadas e, quando reotimizadas, geram 504 "Outdated Optimize Dep" com mais frequência.
      // Como já carregamos sob demanda (dynamic import), mantemos fora do prebundle.
      exclude: ["xlsx", "jspdf", "jspdf-autotable"],
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom/client",
        "scheduler",
        "prop-types",
        "react-transition-group",
        "react-transition-group/CSSTransition",
        "react-transition-group/Transition",
        "react-transition-group/TransitionGroup",
        "react-transition-group/SwitchTransition",
        "react-transition-group/ReplaceTransition",
        "@supabase/ssr",
        "recharts",
        // @supabase/ssr importa `cookie` (parse/serialize); sem prebundle pode falhar em WebKit/Safari.
        "cookie",
        "lucide-react",
        "@fullcalendar/react",
        "@fullcalendar/daygrid",
        "@fullcalendar/timegrid",
        "@fullcalendar/scrollgrid",
        "@fullcalendar/list",
        "@fullcalendar/interaction",
        "@toast-ui/editor",
        "stream-chat",
        "tesseract.js",
        "pdfjs-dist",
        "@supabase/supabase-js",
      ],
    },
    resolve: {
      // Evita múltiplas instâncias do React (Invalid hook call) quando o Vite reotimiza deps.
      dedupe: ["react", "react-dom", "scheduler"],
    },
  },
});
