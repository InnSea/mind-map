import { readFile } from 'node:fs/promises'

const sourcePath = '/simple-mind-map/src/'
const packageUrl = new URL('../package.json', import.meta.url).href

export async function load(url, context, defaultLoad) {
  if (url === packageUrl) {
    const source = await readFile(new URL(url), 'utf8')
    return {
      format: 'module',
      source: `export default ${source}`,
      shortCircuit: true
    }
  }
  if (url.startsWith('file:') && url.includes(sourcePath) && url.endsWith('.js')) {
    return {
      format: 'module',
      source: await readFile(new URL(url), 'utf8'),
      shortCircuit: true
    }
  }
  return defaultLoad(url, context, defaultLoad)
}
