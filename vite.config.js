import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';

export default defineConfig({
  define: {
    'import.meta.env.PILOT_SHIP_GLB': existsSync(new URL('./public/models/ship.glb', import.meta.url)),
    'import.meta.env.PILOT_STATION_GLB': existsSync(new URL('./public/models/station.glb', import.meta.url)),
  },
  optimizeDeps: {
    include: ['three','gsap','gsap/ScrollTrigger','lenis','marked','dompurify','three/addons/postprocessing/EffectComposer.js','three/addons/postprocessing/RenderPass.js','three/addons/postprocessing/UnrealBloomPass.js','three/addons/postprocessing/OutputPass.js','three/addons/postprocessing/ShaderPass.js','three/addons/controls/OrbitControls.js','three/addons/loaders/GLTFLoader.js','three/addons/loaders/DRACOLoader.js'],
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'pilot-loaders', test: /three[\\/]examples[\\/]jsm[\\/]loaders[\\/](GLTFLoader|DRACOLoader)\.js$/, priority: 1 },
            { name: 'three-core', test: /three[\\/]build[\\/]three\.core\.js/ },
            { name: 'three-engine', test: /node_modules[\\/]three/ },
            { name: 'motion', test: /node_modules[\\/](gsap|lenis)/ },
          ],
        },
      },
    },
  },
});
