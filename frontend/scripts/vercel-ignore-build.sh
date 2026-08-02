#!/bin/bash
# Vercel "Ignored Build Step" script.
# Exit 0 = skip build (no frontend changes), exit 1 = proceed with build.
# Configure in Vercel: Settings > Git > Ignored Build Step > run this script.

git diff --quiet HEAD^ HEAD -- frontend/
if [ $? -eq 0 ]; then
  echo "No frontend changes detected — skipping Vercel build."
  exit 0
fi

echo "Frontend changes detected — proceeding with build."
exit 1
