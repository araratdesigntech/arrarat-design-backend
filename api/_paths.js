// This file registers TypeScript path aliases at runtime
// It must be a .js file so it runs before TypeScript compilation affects it
// This is imported first in index.ts to resolve @src/* paths

try {
  // Try to register tsconfig-paths
  require('tsconfig-paths/register');
} catch (error) {
  // If that fails, try module-alias as fallback
  try {
    const moduleAlias = require('module-alias');
    const path = require('path');
    const srcPath = path.join(__dirname, '../src');
    moduleAlias.addAliases({
      '@src': srcPath,
    });
  } catch (aliasError) {
    console.warn('Failed to register path aliases:', aliasError);
  }
}

