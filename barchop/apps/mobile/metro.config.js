// Config necessária pro Metro (bundler do Expo) enxergar os
// pacotes internos do monorepo (@barchop/types, design-tokens etc).
// Depois de rodar `npx create-expo-app`, troque o metro.config.js
// gerado por este.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// enxerga os pacotes irmãos em packages/*
config.watchFolders = [workspaceRoot];

// resolve node_modules tanto do app quanto da raiz do monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
