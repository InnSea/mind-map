const fs = require('fs')
const path = require('path')

const projectRoot = __dirname
const distDir = path.resolve(projectRoot, 'dist')
const generatedIndex = path.join(distDir, 'index.html')
const standaloneIndex = path.join(projectRoot, 'index.html')
const testerWebRoot = process.env.TESTER_WEB_ROOT
  ? path.resolve(process.env.TESTER_WEB_ROOT)
  : path.resolve(projectRoot, '../tester-web')
const testerWebPublicRoot = path.join(testerWebRoot, 'public')
const testerWebDistDir = path.join(testerWebPublicRoot, 'mindmap/dist')
const manifestPath = path.join(distDir, 'mindmap-assets.json')

const dryRun = process.argv.includes('--dry-run')
const syncOnly = process.argv.includes('--sync-only')

const hostPages = [
  {
    file: path.join(testerWebPublicRoot, 'mindmap/mindmap.html'),
    assetBase: 'dist/'
  },
  {
    file: path.join(testerWebPublicRoot, 'document-mindmap/index.html'),
    assetBase: '/mindmap/dist/'
  }
]

const uniqueToken = () => `${process.pid}-${Date.now()}`

const removePath = target => {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true })
  }
}

const atomicWrite = (target, content) => {
  const tempFile = `${target}.tmp-${uniqueToken()}`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try {
    fs.writeFileSync(tempFile, content)
    fs.renameSync(tempFile, target)
  } finally {
    removePath(tempFile)
  }
}

const copyDirectory = (source, target) => {
  fs.mkdirSync(target, { recursive: true })
  fs.readdirSync(source, { withFileTypes: true }).forEach(entry => {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath)
    } else if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(sourcePath), targetPath)
    } else {
      fs.copyFileSync(sourcePath, targetPath)
    }
  })
}

const stageDirectorySwap = (source, target) => {
  const token = uniqueToken()
  const parentDir = path.dirname(target)
  const stageDir = path.join(parentDir, `.${path.basename(target)}.stage-${token}`)
  const backupDir = path.join(parentDir, `.${path.basename(target)}.backup-${token}`)
  const hadTarget = fs.existsSync(target)

  removePath(stageDir)
  removePath(backupDir)
  copyDirectory(source, stageDir)
  if (hadTarget) fs.renameSync(target, backupDir)

  try {
    fs.renameSync(stageDir, target)
  } catch (error) {
    if (hadTarget && fs.existsSync(backupDir)) fs.renameSync(backupDir, target)
    removePath(stageDir)
    throw error
  }

  return {
    commit() {
      removePath(backupDir)
    },
    rollback() {
      removePath(target)
      if (hadTarget && fs.existsSync(backupDir)) fs.renameSync(backupDir, target)
      removePath(stageDir)
      removePath(backupDir)
    }
  }
}

const validateAssetPath = (asset, extension) => {
  if (
    typeof asset !== 'string' ||
    !asset.endsWith(extension) ||
    path.isAbsolute(asset) ||
    asset.split('/').includes('..') ||
    !/^[a-zA-Z0-9_./-]+$/.test(asset)
  ) {
    throw new Error(`Invalid mindmap asset path: ${String(asset)}`)
  }
  const assetFile = path.join(distDir, asset)
  if (!fs.existsSync(assetFile) || !fs.statSync(assetFile).isFile()) {
    throw new Error(`Mindmap asset does not exist: ${assetFile}`)
  }
}

const readManifest = () => {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Mindmap asset manifest does not exist: ${manifestPath}`)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!Array.isArray(manifest.css) || !Array.isArray(manifest.js)) {
    throw new Error('Mindmap asset manifest must contain css and js arrays')
  }
  manifest.css.forEach(asset => validateAssetPath(asset, '.css'))
  manifest.js.forEach(asset => validateAssetPath(asset, '.js'))
  return manifest
}

const replaceAssetBlock = (html, assetType, tags) => {
  const startMarker = `<!-- mindmap-assets:${assetType}:start -->`
  const endMarker = `<!-- mindmap-assets:${assetType}:end -->`
  const startIndex = html.indexOf(startMarker)
  const endIndex = html.indexOf(endMarker, startIndex + startMarker.length)
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Missing ${assetType} asset markers in host page`)
  }
  if (
    html.indexOf(startMarker, startIndex + startMarker.length) >= 0 ||
    html.indexOf(endMarker, endIndex + endMarker.length) >= 0
  ) {
    throw new Error(`Duplicate ${assetType} asset markers in host page`)
  }

  const lineStart = html.lastIndexOf('\n', startIndex) + 1
  const indent = html.slice(lineStart, startIndex)
  const tagLines = tags.map(tag => `${indent}${tag}`).join('\n')
  const replacement = `${startMarker}\n${tagLines}\n${indent}${endMarker}`
  return `${html.slice(0, startIndex)}${replacement}${html.slice(
    endIndex + endMarker.length
  )}`
}

const renderHostPage = (html, manifest, assetBase) => {
  const cssTags = manifest.css.map(
    asset => `<link href="${assetBase}${asset}" rel="stylesheet" />`
  )
  const jsTags = manifest.js.map(
    asset => `<script src="${assetBase}${asset}"></script>`
  )
  return replaceAssetBlock(
    replaceAssetBlock(html, 'css', cssTags),
    'js',
    jsTags
  )
}

const updateStandaloneIndex = () => {
  if (syncOnly || !fs.existsSync(generatedIndex)) return
  const content = fs.readFileSync(generatedIndex)
  if (dryRun) {
    console.log(`[dry-run] Update ${standaloneIndex}`)
    return
  }
  atomicWrite(standaloneIndex, content)
  fs.unlinkSync(generatedIndex)
  console.log(`Updated ${standaloneIndex}`)
}

const syncTesterWeb = () => {
  if (!fs.existsSync(testerWebRoot)) {
    console.warn(`Skip tester-web sync: directory does not exist (${testerWebRoot})`)
    return
  }

  const manifest = readManifest()
  const pageUpdates = hostPages.map(config => {
    if (!fs.existsSync(config.file)) {
      throw new Error(`Mindmap host page does not exist: ${config.file}`)
    }
    const original = fs.readFileSync(config.file, 'utf8')
    return {
      ...config,
      original,
      updated: renderHostPage(original, manifest, config.assetBase)
    }
  })

  if (dryRun) {
    console.log(`[dry-run] Sync ${distDir} -> ${testerWebDistDir}`)
    pageUpdates.forEach(page => console.log(`[dry-run] Update ${page.file}`))
    return
  }

  const directorySwap = stageDirectorySwap(distDir, testerWebDistDir)
  try {
    pageUpdates.forEach(page => atomicWrite(page.file, page.updated))
    directorySwap.commit()
  } catch (error) {
    const rollbackErrors = []
    pageUpdates.forEach(page => {
      try {
        atomicWrite(page.file, page.original)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    })
    try {
      directorySwap.rollback()
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    rollbackErrors.forEach(rollbackError => {
      console.error(`[mindmap-copy] Rollback failed: ${rollbackError.message}`)
    })
    throw error
  }

  console.log(`Synced mindmap assets to ${testerWebDistDir}`)
  pageUpdates.forEach(page => console.log(`Updated ${page.file}`))
}

const main = () => {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Mindmap dist directory does not exist: ${distDir}`)
  }
  updateStandaloneIndex()
  syncTesterWeb()
}

try {
  main()
} catch (error) {
  console.error(`[mindmap-copy] ${error.message}`)
  process.exitCode = 1
}
