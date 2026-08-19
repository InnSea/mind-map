const path = require('path')
const isDev = process.env.NODE_ENV === 'development'
const isLibrary = process.env.NODE_ENV === 'library'

const WebpackDynamicPublicPathPlugin = require('webpack-dynamic-public-path')
const MindmapAssetManifestPlugin = require('./build/MindmapAssetManifestPlugin')

module.exports = {
  publicPath: isDev ? '' : './dist',
  outputDir: '../dist',
  lintOnSave: false,
  productionSourceMap: false,
  filenameHashing: true,
  transpileDependencies: ['yjs', 'lib0', 'quill'],
  chainWebpack: config => {
    if (isDev) {
      const { codeInspectorPlugin } = require('code-inspector-plugin');
      config.plugin('code-inspector-plugin').use(
        codeInspectorPlugin({
          bundler: 'webpack',
        })
      );
    }
    // 移除 preload 插件
    config.plugins.delete('preload')
    // 移除 prefetch 插件
    config.plugins.delete('prefetch')
    // 支持运行时设置public path
    if (!isDev) {
      config
        .plugin('dynamicPublicPathPlugin')
        .use(WebpackDynamicPublicPathPlugin, [
          { externalPublicPath: 'window.externalPublicPath' }
        ])
    }
    if (!isLibrary) {
      config
        .plugin('mindmap-asset-manifest')
        .use(MindmapAssetManifestPlugin)
    }
  },
  configureWebpack: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/')
      }
    }
  },
  devServer: {
    proxy: {
      '^/api/v3/': {
        target: 'http://ark.cn-beijing.volces.com',
        changeOrigin: true
      }
    }
  }
}
