// This file registers TypeScript path aliases at runtime
// It hooks into Node's module resolution to resolve @src/* paths
// This must run before any imports that use @src/* aliases

const path = require('path');
const Module = require('module');

// Get the original resolveFilename function
const originalResolveFilename = Module._resolveFilename;

// Override module resolution to handle @src/* aliases
Module._resolveFilename = function(request, parent, isMain, options) {
  // Check if the request uses @src alias
  if (request.startsWith('@src/')) {
    // Resolve the alias to the actual path
    const aliasPath = request.replace('@src/', '');
    const baseDir = __dirname.replace(/[\\/]api$/, '') || process.cwd();
    const srcPath = path.resolve(baseDir, 'src', aliasPath);
    
    // Build search paths
    const searchPaths = [];
    if (parent && parent.filename) {
      searchPaths.push(path.dirname(parent.filename));
    }
    searchPaths.push(path.resolve(baseDir, 'src'));
    searchPaths.push(path.resolve(baseDir));
    
    // Try to resolve the file (handle .js, .ts, .json extensions)
    const extensions = ['', '.js', '.ts', '.json'];
    for (const ext of extensions) {
      try {
        const resolvedPath = require.resolve(srcPath + ext, { paths: searchPaths });
        return resolvedPath;
      } catch (e) {
        // Try next extension
      }
    }
    
    // If no extension worked, try the path as-is
    try {
      return require.resolve(srcPath, { paths: searchPaths });
    } catch (e) {
      // Fall through to original resolver - log for debugging
      console.warn(`Could not resolve @src alias: ${request}`, e.message);
    }
  }
  
  // Use original resolver for non-aliased paths
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

console.log('Registered @src path alias resolver');

