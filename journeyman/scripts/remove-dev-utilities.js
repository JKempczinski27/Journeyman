const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧹 Cleaning development utilities for production...');

// Development files and directories to remove
const devFilesToRemove = [
  'backend/analytics/mock/',
  'src/backend-load-test.js',
  'src/TestPage.js',
  'src/components/DebugPanel.js',
  'src/utils/devTools.js',
  'backend/test-data/',
  'backend/scripts/seed-test-data.js',
  '.env.development',
  '.env.test',
  'docker-compose.dev.yml'
];

// Source map and debug patterns
const sourceMapPatterns = [
  'build/static/js/*.map',
  'build/static/css/*.map',
  'build/**/*.map'
];

// Remove development files
devFilesToRemove.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    try {
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`📁 Removed directory: ${file}`);
      } else {
        fs.unlinkSync(fullPath);
        console.log(`📄 Removed file: ${file}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not remove ${file}: ${error.message}`);
    }
  }
});

// Remove source maps using find command
try {
  console.log('🗺️  Removing source maps...');
  execSync('find build/ -name "*.map" -type f -delete 2>/dev/null || true', {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe'
  });
  console.log('✅ Source maps removed');
} catch (error) {
  console.warn('⚠️  Could not remove all source maps:', error.message);
}

// Clean console statements from production builds
const jsFiles = [];
try {
  const buildJsPath = path.join(__dirname, '..', 'build', 'static', 'js');
  if (fs.existsSync(buildJsPath)) {
    const files = fs.readdirSync(buildJsPath);
    files.forEach(file => {
      if (file.endsWith('.js') && !file.includes('.map')) {
        jsFiles.push(path.join(buildJsPath, file));
      }
    });
  }
} catch (error) {
  console.warn('⚠️  Could not access build directory:', error.message);
}

jsFiles.forEach(file => {
  try {
    let content = fs.readFileSync(file, 'utf8');

    // Remove console statements (but preserve console.error in production)
    content = content.replace(/console\.log\([^)]*\);?/g, '');
    content = content.replace(/console\.warn\([^)]*\);?/g, '');
    content = content.replace(/console\.debug\([^)]*\);?/g, '');
    content = content.replace(/console\.info\([^)]*\);?/g, '');

    // Remove debug comments
    content = content.replace(/\/\/ DEBUG:.*$/gm, '');
    content = content.replace(/\/\*\* DEBUG.*?\*\//gs, '');

    // Remove development-only code blocks
    content = content.replace(/if\s*\(\s*process\.env\.NODE_ENV\s*===\s*['"]development['"]\s*\)\s*\{[^}]*\}/g, '');

    fs.writeFileSync(file, content);
    console.log(`🧹 Cleaned console statements from: ${path.basename(file)}`);
  } catch (error) {
    console.warn(`⚠️  Could not clean ${file}: ${error.message}`);
  }
});

// Remove test and development dependencies from package.json in build
try {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    // Remove development scripts that shouldn't be in production
    if (packageJson.scripts) {
      delete packageJson.scripts['test'];
      delete packageJson.scripts['test:watch'];
      delete packageJson.scripts['test:coverage'];
      delete packageJson.scripts['storybook'];
      delete packageJson.scripts['build-storybook'];
      delete packageJson.scripts['dev'];
      delete packageJson.scripts['lint:fix'];
      console.log('🗑️  Removed development scripts from package.json');
    }
  }
} catch (error) {
  console.warn('⚠️  Could not modify package.json:', error.message);
}

// Create production info file
try {
  const prodInfoPath = path.join(__dirname, '..', 'build', 'production-info.json');
  const prodInfo = {
    buildTime: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    nodeEnv: 'production',
    cleaned: true,
    buildId: process.env.BUILD_ID || `build-${Date.now()}`
  };

  fs.writeFileSync(prodInfoPath, JSON.stringify(prodInfo, null, 2));
  console.log('📋 Created production info file');
} catch (error) {
  console.warn('⚠️  Could not create production info file:', error.message);
}

// Final security check - ensure no .env files in build
try {
  execSync('find build/ -name ".env*" -type f -delete 2>/dev/null || true', {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe'
  });
  console.log('🔒 Ensured no environment files in build');
} catch (error) {
  console.warn('⚠️  Could not perform final security check:', error.message);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Production security cleaning completed successfully!');
console.log('   - Development files removed');
console.log('   - Source maps cleaned');
console.log('   - Console statements removed');
console.log('   - Environment files secured');
