# Turbopack Compatibility Issue - Fixed

## Issue
Build error with Next.js 15.5.3 and Turbopack:
```
Export applyDecoratedDescriptor doesn't exist in target module
./node_modules/fontkit/dist/module.mjs:3:1
```

## Root Cause
- **Turbopack** bundling conflicts with **pdf-lib** dependency
- **fontkit** (used by pdf-lib) expects `applyDecoratedDescriptor` from @swc/helpers
- **@swc/helpers v0.5.15** only exports snake_case `_apply_decorated_descriptor`
- This is a known compatibility issue between Turbopack and certain libraries

## Solution Applied
1. **Disabled Turbopack** (temporary workaround)
   - Removed `--turbopack` flags from package.json scripts
   - Cleared cache and reinstalled dependencies

2. **Fixed TypeScript issues** that emerged after disabling Turbopack:
   - Fixed dynamic import type annotations in VideoWorkbench.tsx
   - Updated ref types to include null (HTMLVideoElement | null)
   - Fixed GoogleGenAI constructor to use options object
   - Fixed Buffer to Uint8Array conversion for File constructor

## Files Modified
- `package.json` - Removed --turbopack flags
- `components/VideoWorkbench.tsx` - Fixed dynamic import types
- `hooks/useVideoWorkbench.ts` - Updated ref types
- `components/workbench/UploadSection.tsx` - Updated ref types
- `lib/gemini.ts` - Fixed GoogleGenAI constructor
- `lib/geminiUploads.ts` - Fixed Buffer type conversion

## Alternative Solutions (for future)
1. **Update dependencies** when compatible versions become available
2. **Use alternative PDF generation** that doesn't depend on fontkit
3. **Wait for Turbopack stability** - currently in beta for builds

## Current Status
✅ Build working without Turbopack
✅ All TypeScript errors resolved
✅ PDF export functionality preserved