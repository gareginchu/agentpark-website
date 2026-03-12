#!/bin/bash
# Build script for Cloudflare Pages — copies only public files to public/
rm -rf public
mkdir -p public/Brand_assets
cp index.html event.html config.js public/
cp -r Brand_assets/* public/Brand_assets/
echo "Build complete — public/ ready for deployment"
