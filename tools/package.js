#!/usr/bin/env node

/**
 * Extension Packaging Script
 * Builds and packages the Chrome extension for distribution
 */

const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const BUILD_DIR = path.join(process.cwd(), 'build');
const CHROME_BUILD_DIR = path.join(BUILD_DIR, 'chrome');
const PACKAGE_DIR = path.join(BUILD_DIR, 'packages');
const MANIFEST_PATH = path.join(process.cwd(), 'manifest.json');

async function ensureDirectories() {
  console.log('📁 Creating build directories...');
  await fs.ensureDir(BUILD_DIR);
  await fs.ensureDir(CHROME_BUILD_DIR);
  await fs.ensureDir(PACKAGE_DIR);
}

async function buildExtension() {
  console.log('🔨 Building extension...');
  try {
    // Check if .env file exists
    const envPath = path.join(process.cwd(), '.env');
    if (!await fs.pathExists(envPath)) {
      console.warn('⚠️  No .env file found. Creating a temporary one for build...');
      const envContent = `VITE_DEEPGRAM_API_KEY=temp_key_for_build
NODE_ENV=production
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG_LOGGING=false
VITE_ENABLE_BETA_FEATURES=false
VITE_EXTENSION_VERSION=1.0.0
VITE_EXTENSION_NAME="Live Transcription Extension"
VITE_API_BASE_URL=https://api.yourbackend.com
VITE_ANALYTICS_ENDPOINT=https://analytics.yourbackend.com
VITE_DEV_SERVER_PORT=3000
VITE_ENABLE_SOURCE_MAPS=false`;
      await fs.writeFile(envPath, envContent);
    }

    // Run the build command
    execSync('npm run build:chrome', { stdio: 'inherit' });
    console.log('✅ Extension built successfully');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

async function createZipPackage() {
  console.log('📦 Creating zip package...');
  
  const packageName = 'live-transcription-extension.zip';
  const zipPath = path.join(PACKAGE_DIR, packageName);
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ Package created: ${packageName} (${sizeInMB} MB)`);
      console.log(`📁 Location: ${zipPath}`);
      resolve(zipPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add all files from the Chrome build directory
    archive.directory(CHROME_BUILD_DIR, false);
    
    archive.finalize();
  });
}

async function validatePackage() {
  console.log('🔍 Validating package...');
  
  const requiredFiles = [
    'manifest.json',
    'background/background.js',
    'content/contentScript.js',
    'pages/popup.html',
    'pages/popup.js'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(CHROME_BUILD_DIR, file);
    if (!await fs.pathExists(filePath)) {
      console.error(`❌ Missing required file: ${file}`);
      return false;
    }
  }

  console.log('✅ Package validation passed');
  return true;
}

async function cleanup() {
  console.log('🧹 Cleaning up temporary files...');
  
  // Remove temporary .env file if it was created
  const envPath = path.join(process.cwd(), '.env');
  if (await fs.pathExists(envPath)) {
    const envContent = await fs.readFile(envPath, 'utf8');
    if (envContent.includes('temp_key_for_build')) {
      await fs.remove(envPath);
      console.log('🗑️  Removed temporary .env file');
    }
  }
}

async function main() {
  try {
    console.log('🚀 Starting extension packaging process...\n');
    
    await ensureDirectories();
    await buildExtension();
    
    const isValid = await validatePackage();
    if (!isValid) {
      console.error('❌ Package validation failed');
      process.exit(1);
    }
    
    const zipPath = await createZipPackage();
    await cleanup();
    
    console.log('\n🎉 Packaging completed successfully!');
    console.log(`📦 Extension package: ${zipPath}`);
    console.log('\n📋 Next steps:');
    console.log('1. Load the extension in Chrome: chrome://extensions/');
    console.log('2. Enable "Developer mode"');
    console.log('3. Click "Load unpacked" and select the build/chrome directory');
    console.log('4. Or use the zip file for distribution');
    
  } catch (error) {
    console.error('❌ Packaging failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main, buildExtension, createZipPackage }; 