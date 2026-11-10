import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
let entry
const window = { __ModuleLoader__: { load(value) { entry = value } } }
const injectedStyles = []
runInNewContext(source, {
  window,
  fetch() {},
  styles: { insert(css) { injectedStyles.push(css); return () => injectedStyles.pop() } },
})
assert.equal(entry.id, 'daily-question')
const plugin = entry.factory((module) => {
  assert.equal(module, 'react')
  return {}
})
assert.equal(plugin.inject.join(','), 'slots')

const registrations = []
const cleanups = []
const slots = {
  inject(_name, setup) { setup(); return () => {} },
  register(spec, component) { registrations.push([spec, component]) },
}
plugin.apply({ slots, effect(setup) { cleanups.push(setup()) } })
assert.deepEqual(registrations.map(([spec]) => spec.name), ['sidebar.panellist', 'main'])
assert(registrations.every(([, component]) => typeof component === 'function'))
assert.match(injectedStyles[0], /\.kd-page/)
for (const cleanup of cleanups.reverse()) cleanup()
assert.equal(injectedStyles.length, 0)
