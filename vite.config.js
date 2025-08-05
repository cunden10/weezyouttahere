/* ================================================================
 * VITE CONFIGURATION FOR SECURE ENVIRONMENT HANDLING
 * ================================================================ */

import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

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

  // Log environment validation (without exposing keys)
  console.log(`🔧 Building in ${mode} mode`);
  console.log(`✅ Environment variables validated: ${requiredEnvVars.length} required vars present`);

  return {
  // Build configuration for browser extension
  build: {
    // Generate multiple entry points for different extension components
    rollupOptions: {
      input: {
        // Extension pages
        popup: resolve(__dirname, 'src/pages/popup.html'),
        dashboard: resolve(__dirname, 'src/pages/dashboard.html'),
        settings: resolve(__dirname, 'src/pages/settings.html'),
        onboarding: resolve(__dirname, 'src/pages/onboarding.html'),
        activation: resolve(__dirname, 'src/pages/activation.html'),
        
        // Background script
        background: resolve(__dirname, 'src/background/background.js'),
        
        // Content scripts
        contentScript: resolve(__dirname, 'src/content/contentScript.js'),
        
        // Extension script manager
        extensionScriptManager: resolve(__dirname, 'src/background/extensionScriptManager.js')
      },
      output: {
        // Organize output files by type
        entryFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId;
          if (facadeModuleId?.includes('background/')) {
            return 'background/[name].js';
          }
          if (facadeModuleId?.includes('content/')) {
            return 'content/[name].js';
          }
          if (facadeModuleId?.includes('pages/')) {
            return 'pages/[name].js';
          }
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Organize assets by type
          if (assetInfo.name?.endsWith('.css')) {
            return 'styles/[name][extname]';
          }
          if (assetInfo.name?.match(/\.(png|jpg|jpeg|svg|ico)$/)) {
            return 'assets/images/[name][extname]';
          }
          if (assetInfo.name?.match(/\.(mp3|wav|ogg)$/)) {
            return 'assets/sounds/[name][extname]';
          }
          return 'assets/[name][extname]';
        }
      }
    },
    
    // Output directory
    outDir: 'build/chrome',
    
    // Generate source maps for debugging (secure: no source maps in production)
    sourcemap: mode === 'development',
    
    // Minification settings
    minify: mode === 'production',
    
    // Copy static assets
    copyPublicDir: true,
    
    // Emit manifest for dependency tracking
    manifest: true
  },

  // Development server configuration
  server: {
    port: env.VITE_DEV_SERVER_PORT || 3000,
    host: env.VITE_DEV_SERVER_HOST || 'localhost',
    open: false, // Don't auto-open browser for extension development
    cors: true,
    // HTTPS for development (recommended for microphone access)
    https: mode === 'development' && env.VITE_ENABLE_HTTPS === 'true',
    hmr: {
      // Enable hot module replacement for extension development
      port: 24678
    }
  },

  // Environment variable configuration
  define: {
    // Make build-time constants available
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __DEV__: mode === 'development',
    // Optionally create process.env compatibility for legacy code
    'process.env': Object.keys(env).reduce((prev, key) => {
      prev[key] = JSON.stringify(env[key]);
      return prev;
    }, {})
  },

  // Plugin configuration
  plugins: [
    // Extension-specific plugins would go here
  ],

  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@modules': resolve(__dirname, 'src/modules'),
      '@assets': resolve(__dirname, 'src/assets'),
      '@styles': resolve(__dirname, 'src/styles'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@config': resolve(__dirname, 'config')
    }
  },

  // Optimize dependencies
  optimizeDeps: {
    // Include dependencies that should be pre-bundled
    include: [],
    // Exclude dependencies that should not be bundled
    exclude: []
  },

  // CSS configuration
  css: {
    devSourcemap: true,
    modules: {
      localsConvention: 'camelCase'
    }
  },

  // Browser extension specific settings
  experimental: {
    // Enable experimental features as needed
  },

  // Security enhancements
  build: {
    ...this.build,
    // Ensure sensitive data doesn't leak in source maps
    sourcemap: mode === 'development',
    // Additional security for production builds
    rollupOptions: {
      ...this.build?.rollupOptions,
      external: mode === 'production' ? ['eval'] : []
    }
  }
  };
});