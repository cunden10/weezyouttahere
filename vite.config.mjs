/* ================================================================
 * VITE CONFIGURATION FOR SECURE ENVIRONMENT HANDLING (ESM)
 * ================================================================ */

import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  // Load environment variables based on current mode
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Validate required environment variables at build time
  const requiredEnvVars = ['VITE_DEEPGRAM_API_KEY'];
  const missingVars = requiredEnvVars.filter(key => !env[key]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      'Please check your .env file and ensure all required keys are set.'
    );
  }

  console.log(`🔧 Building in ${mode} mode`);
  console.log(`✅ Environment variables validated: ${requiredEnvVars.length} required vars present`);

  return {
    build: {
      rollupOptions: {
        input: {
          popup: resolve(process.cwd(), 'src/pages/popup.html'),
          dashboard: resolve(process.cwd(), 'src/pages/dashboard.html'),
          settings: resolve(process.cwd(), 'src/pages/settings.html'),
          onboarding: resolve(process.cwd(), 'src/pages/onboarding.html'),
          activation: resolve(process.cwd(), 'src/pages/activation.html'),
          background: resolve(process.cwd(), 'src/background/background.js'),
          contentScript: resolve(process.cwd(), 'src/content/contentScript.js'),
          meetingOverlay: resolve(process.cwd(), 'src/content/meetingOverlay.js'),
          apolloIntegration: resolve(process.cwd(), 'src/content/apolloIntegration.js'),
          salesloftIntegration: resolve(process.cwd(), 'src/content/salesloftIntegration.js'),
          'styles/meetingOverlay': resolve(process.cwd(), 'src/styles/content/meetingOverlay.css'),
          'styles/integrationCommon': resolve(process.cwd(), 'src/styles/content/integrationCommon.css'),
          extensionScriptManager: resolve(process.cwd(), 'src/background/extensionScriptManager.js')
        },
        output: {
          entryFileNames: (chunkInfo) => {
            const facadeModuleId = chunkInfo.facadeModuleId;
            if (facadeModuleId?.includes('background/')) return 'background/[name].js';
            if (facadeModuleId?.includes('content/')) return 'content/[name].js';
            if (facadeModuleId?.includes('pages/')) return 'pages/[name].js';
            return '[name].js';
          },
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) return 'styles/[name][extname]';
            if (assetInfo.name?.match(/\.(png|jpg|jpeg|svg|ico)$/)) return 'assets/images/[name][extname]';
            if (assetInfo.name?.match(/\.(mp3|wav|ogg)$/)) return 'assets/sounds/[name][extname]';
            return 'assets/[name][extname]';
          }
        }
      },
      outDir: 'build/chrome',
      sourcemap: mode === 'development',
      minify: mode === 'production',
      copyPublicDir: true,
      manifest: true
    },

    server: {
      port: env.VITE_DEV_SERVER_PORT || 3000,
      host: env.VITE_DEV_SERVER_HOST || 'localhost',
      open: false,
      cors: true,
      https: mode === 'development' && env.VITE_ENABLE_HTTPS === 'true',
      hmr: { port: 24678 }
    },

    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __DEV__: mode === 'development',
      'process.env': Object.keys(env).reduce((prev, key) => {
        prev[key] = JSON.stringify(env[key]);
        return prev;
      }, {})
    },

    plugins: [
      {
        name: 'copy-manifest',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.json',
            source: readFileSync(resolve(process.cwd(), 'manifest.json'), 'utf8')
          });
        }
      },
      viteStaticCopy({
        targets: [
          { src: resolve(process.cwd(), 'config/deepgramRuleset.json'), dest: 'config' },
          { src: resolve(process.cwd(), 'src/assets/**/*'), dest: 'src/assets' }
        ]
      })
    ],

    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src'),
        '@modules': resolve(process.cwd(), 'src/modules'),
        '@assets': resolve(process.cwd(), 'src/assets'),
        '@styles': resolve(process.cwd(), 'src/styles'),
        '@pages': resolve(process.cwd(), 'src/pages'),
        '@config': resolve(process.cwd(), 'config')
      }
    },

    optimizeDeps: {
      include: [],
      exclude: []
    },

    css: {
      devSourcemap: true,
      modules: { localsConvention: 'camelCase' }
    },

    experimental: {}
  };
});