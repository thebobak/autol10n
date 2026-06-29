export interface TransUnit {
  element: Element
  id: string
  sourceXml: string // inner XML of <source>, may contain tags
}

export interface ParsedXliff {
  doc: Document
  units: TransUnit[]
  sourceLanguage: string | null
}

export function parseXliff(xmlString: string): ParsedXliff {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error(`XML parse error: ${parserError.textContent}`)
  }

  const units: TransUnit[] = []
  const transUnits = doc.querySelectorAll('trans-unit')

  transUnits.forEach((unit) => {
    const sourceEl = unit.querySelector('source')
    if (!sourceEl) return

    const sourceXml = getInnerXml(sourceEl)
    if (!sourceXml.trim()) return // skip empty

    units.push({
      element: unit,
      id: unit.getAttribute('id') ?? '',
      sourceXml,
    })
  })

  const sourceLanguage = doc.querySelector('file')?.getAttribute('source-language') ?? null

  return { doc, units, sourceLanguage }
}

export function setTranslation(unit: TransUnit, translatedXml: string): void {
  const existing = unit.element.querySelector('target')
  if (existing) {
    setInnerXml(existing, translatedXml)
    return
  }

  const sourceEl = unit.element.querySelector('source')
  const targetEl = unit.element.ownerDocument!.createElementNS(
    unit.element.namespaceURI,
    'target'
  )
  setInnerXml(targetEl, translatedXml)

  // Insert <target> after <source>
  if (sourceEl?.nextSibling) {
    unit.element.insertBefore(targetEl, sourceEl.nextSibling)
  } else {
    unit.element.appendChild(targetEl)
  }
}

export function serializeXliff(doc: Document): string {
  const serializer = new XMLSerializer()
  let xml = serializer.serializeToString(doc)

  // Normalize XML declaration
  if (!xml.startsWith('<?xml')) {
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml
  }

  return xml
}

function getInnerXml(el: Element): string {
  const serializer = new XMLSerializer()
  let result = ''
  el.childNodes.forEach((child) => {
    result += serializer.serializeToString(child)
  })
  return result
}

function setInnerXml(el: Element, xml: string): void {
  // Remove existing children
  while (el.firstChild) el.removeChild(el.firstChild)

  if (!xml.trim()) return

  // Parse the xml fragment inside a wrapper
  const ns = el.namespaceURI ?? ''
  const nsAttr = ns ? ` xmlns="${ns}"` : ''
  const wrapped = `<_wrapper${nsAttr}>${xml}</_wrapper>`
  const parser = new DOMParser()
  const tmpDoc = parser.parseFromString(wrapped, 'application/xml')
  const wrapper = tmpDoc.documentElement

  // Import and append each child
  wrapper.childNodes.forEach((child) => {
    el.appendChild(el.ownerDocument!.importNode(child, true))
  })
}
