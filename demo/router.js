import intro from './templates/intro.html?raw'
import datatypes from './templates/datatypes.html?raw'
import editMode from './templates/edit-mode.html?raw'
import viewerMode from './templates/viewer-mode.html?raw'
import queryMode from './templates/query-mode.html?raw'
import tryYourOwn from './templates/try-your-own.html?raw'
import mps from './templates/mps.html?raw'
import { initializers } from './sections.js'

const templates = {
  intro,
  datatypes,
  'edit-mode': editMode,
  'viewer-mode': viewerMode,
  'query-mode': queryMode,
  'try-your-own': tryYourOwn,
  mps
}

function currentSection() {
  return window.location.hash.slice(1).split('?', 1)[0]
}

export function initDemoRouter(context) {
  const main = document.querySelector('.main')
  const menu = document.querySelector('.menu')
  const content = document.getElementById('content')
  let navigation = 0

  menu.addEventListener('wheel', event => {
    main.scrollTop += event.deltaY
  })

  window.addEventListener('hashchange', async event => {
    event.preventDefault()
    const section = currentSection()

    if (!section) {
      window.location.hash = 'intro'
      return
    }

    const template = templates[section]
    if (!template) {
      window.location.hash = 'intro'
      return
    }

    const currentNavigation = ++navigation
    content.classList.add('loading')
    await window.demoReady

    // Keep the short transition from the original demo without allowing an
    // earlier navigation to overwrite a newer one.
    await new Promise(resolve => setTimeout(resolve, 300))
    if (currentNavigation !== navigation) return

    content.innerHTML = template
    await initializers[section]?.(content, context)
    if (currentNavigation !== navigation) return

    window.hljs?.highlightAll()
    content.classList.remove('loading')
  })

  window.dispatchEvent(new Event('hashchange'))
}
