const PLUGIN_NAME = 'MindmapAssetManifestPlugin'

class MindmapAssetManifestPlugin {
  constructor(options = {}) {
    this.filename = options.filename || 'mindmap-assets.json'
  }

  apply(compiler) {
    compiler.hooks.emit.tap(PLUGIN_NAME, compilation => {
      const entrypoint = compilation.entrypoints.get('app')
      if (!entrypoint) {
        throw new Error(`${PLUGIN_NAME}: app entrypoint not found`)
      }

      const files = entrypoint
        .getFiles()
        .filter(file => !file.endsWith('.map'))
      const manifest = {
        version: compilation.hash,
        css: files.filter(file => file.endsWith('.css')),
        js: files.filter(file => file.endsWith('.js'))
      }
      const source = `${JSON.stringify(manifest, null, 2)}\n`

      compilation.assets[this.filename] = {
        source: () => source,
        size: () => Buffer.byteLength(source)
      }
    })
  }
}

module.exports = MindmapAssetManifestPlugin
