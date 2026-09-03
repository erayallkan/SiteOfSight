// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Viewer HTML'i, web-ifc WASM'i ve ornek IFC modeli "asset" olarak paketlensin
config.resolver.assetExts.push('html', 'wasm', 'ifc');

module.exports = config;
