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
    
    // Determine base directory - in Vercel it's /var/task, locally it's project root
    let baseDir = __dirname.replace(/[\\/]api$/, '');
    if (!baseDir || baseDir === __dirname) {
      baseDir = process.cwd();
    }
    
    const srcDir = path.resolve(baseDir, 'src');
    const targetPath = path.resolve(srcDir, aliasPath);
    
    // Build search paths - include src directory and parent directories
    const searchPaths = [srcDir, baseDir];
    if (parent && parent.filename) {
      searchPaths.unshift(path.dirname(parent.filename));
    }
    
    // Try different resolution strategies
    const fs = require('fs');
    
    // Strategy 1: Try as a file with .js extension (compiled TypeScript)
    try {
      const jsFile = targetPath + '.js';
      if (fs.existsSync(jsFile)) {
        return jsFile;
      }
    } catch (e) {
      // Continue
    }
    
    // Strategy 2: Try as a directory with index.js (most common case)
    try {
      const indexJs = path.join(targetPath, 'index.js');
      if (fs.existsSync(indexJs)) {
        return indexJs;
      }
    } catch (e) {
      // Continue
    }
    
    // Strategy 3: Try as a file with other extensions
    const extensions = ['.ts', '.json'];
    for (const ext of extensions) {
      try {
        const filePath = targetPath + ext;
        if (fs.existsSync(filePath)) {
          return filePath;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Strategy 4: Try as a directory with index.ts or index.json
    const indexFiles = ['index.ts', 'index.json'];
    for (const indexFile of indexFiles) {
      try {
        const indexPath = path.join(targetPath, indexFile);
        if (fs.existsSync(indexPath)) {
          return indexPath;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Strategy 5: Use require.resolve with search paths (Node's default behavior)
    try {
      return require.resolve(targetPath, { paths: searchPaths });
    } catch (e) {
      // Continue
    }
    
    // Strategy 6: Try require.resolve with the alias path directly
    try {
      return require.resolve(path.join('src', aliasPath), { paths: [baseDir] });
    } catch (e) {
      // Continue
    }
    
    // If all strategies failed, log and fall through to original resolver
    console.warn(`Could not resolve @src alias: ${request}`);
    console.warn(`  Tried: ${targetPath}`);
    console.warn(`  Base dir: ${baseDir}`);
    console.warn(`  Src dir: ${srcDir}`);
  }
  
  // Use original resolver for non-aliased paths
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

console.log('Registered @src path alias resolver');


