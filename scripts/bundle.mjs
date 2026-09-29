// Bundle all data JSON into one JS file so the site works from file:// with no server.
import { readFileSync, writeFileSync } from 'node:fs'

const D = 'D:/临时/dsh研究/data'
const read = f => JSON.parse(readFileSync(`${D}/${f}`, 'utf8'))

const bundle = {
  packages: read('packages.json'),
  services: read('services.json'),
  tools: read('tools.json'),
  events: read('events.json'),
  bundles: read('bundles.json'),
  layers: read('layers.json'),
  code: read('code.json'),
  deep: read('deep.json'),
}

writeFileSync(
  'D:/临时/dsh研究/data/bundle.js',
  'window.DSH_DATA=' + JSON.stringify(bundle) + ';\n'
)

const kb = (readFileSync('D:/临时/dsh研究/data/bundle.js', 'utf8').length / 1024).toFixed(0)
console.log('bundle.js written,', kb, 'KB')
