/**
 * XLIFF 1.2 parser and serializer.
 *
 * General approach:
 *   1. parseXliff()    – turns the raw .xlf string into a live DOM (DOMParser)
 *                        and collects every <trans-unit> element as a TransUnit.
 *   2. setTranslation() – writes a <target> child into each TransUnit element
 *                        directly on the live DOM, so no reassembly step is needed.
 *   3. serializeXliff() – serializes the mutated DOM back to an XML string
 *                        (XMLSerializer) ready for download.
 *
 * Why use the browser DOM API instead of a library?
 *   Articulate Rise XLIFF files are heavily namespaced and contain nested <g>
 *   inline-markup elements. The browser's DOMParser handles this correctly
 *   out of the box; most lightweight XML libraries strip or mangle namespaces.
 */

export interface TransUnit {
  element: Element
  id: string
  sourceXml: string // inner XML of <source>, may contain nested <g> tags
}

export interface ParsedXliff {
  doc: Document
  units: TransUnit[]
  sourceLanguage: string | null
}

/**
 * Parse an XLIFF 1.2 string.
 *
 * Returns a live DOM document (mutated by setTranslation later),
 * all non-empty trans-units, and the source-language attribute from
 * the first <file> element.
 */
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
    if (!sourceXml.trim()) return // skip whitespace-only segments

    units.push({
      element: unit,
      id: unit.getAttribute('id') ?? '',
      sourceXml,
    })
  })

  const sourceLanguage = doc.querySelector('file')?.getAttribute('source-language') ?? null

  return { doc, units, sourceLanguage }
}

/**
 * Write a translated string into a trans-unit on the live DOM.
 *
 * If a <target> already exists (e.g. a partially translated file was
 * uploaded) its content is replaced. Otherwise a new <target> element
 * is created and inserted immediately after <source>, which is the
 * position required by the XLIFF 1.2 spec.
 *
 * createElementNS uses the parent's namespace URI so the new element
 * inherits the XLIFF namespace (urn:oasis:names:tc:xliff:document:1.2).
 * Without this, XMLSerializer emits a bare <target> without a namespace
 * declaration, which Articulate Rise rejects on import.
 */
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

  if (sourceEl?.nextSibling) {
    unit.element.insertBefore(targetEl, sourceEl.nextSibling)
  } else {
    unit.element.appendChild(targetEl)
  }
}

/**
 * Read the current translated XML from a unit's <target>, or null if it
 * has none. Used to seed a translation cache from already-translated units
 * (e.g. when resuming a paused run) without re-deriving it from a session.
 */
export function getTranslatedXml(unit: TransUnit): string | null {
  const targetEl = unit.element.querySelector('target')
  if (!targetEl) return null
  return getInnerXml(targetEl)
}

/**
 * Serialize the mutated DOM back to an XML string.
 *
 * XMLSerializer's output may or may not include an XML declaration
 * depending on the browser; we normalize to always include one so
 * the downloaded file is a valid standalone XML document.
 */
export function serializeXliff(doc: Document): string {
  const serializer = new XMLSerializer()
  let xml = serializer.serializeToString(doc)

  if (!xml.startsWith('<?xml')) {
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml
  }

  return xml
}

/**
 * Return the inner XML of an element as a string.
 *
 * We cannot use element.innerHTML here because innerHTML is an HTML API;
 * XML documents parsed with DOMParser don't have it. Instead we serialize
 * each child node individually with XMLSerializer and concatenate.
 */
function getInnerXml(el: Element): string {
  const serializer = new XMLSerializer()
  let result = ''
  el.childNodes.forEach((child) => {
    result += serializer.serializeToString(child)
  })
  return result
}

/**
 * Replace all children of an element with the nodes parsed from an XML string.
 *
 * The wrapper trick: DOMParser requires a single root element, so we wrap
 * the fragment in a temporary <_wrapper> element. We propagate the parent's
 * namespace onto the wrapper so that any namespace-prefixed attributes on
 * the translated <g> child elements resolve correctly — without it, the
 * parser treats them as undeclared-namespace errors and drops the attributes.
 *
 * After parsing, we import each child node into the target document
 * (importNode is required when moving nodes across document boundaries).
 */
function setInnerXml(el: Element, xml: string): void {
  while (el.firstChild) el.removeChild(el.firstChild)

  if (!xml.trim()) return

  const ns = el.namespaceURI ?? ''
  const nsAttr = ns ? ` xmlns="${ns}"` : ''
  const wrapped = `<_wrapper${nsAttr}>${xml}</_wrapper>`
  const parser = new DOMParser()
  const tmpDoc = parser.parseFromString(wrapped, 'application/xml')
  const wrapper = tmpDoc.documentElement

  wrapper.childNodes.forEach((child) => {
    el.appendChild(el.ownerDocument!.importNode(child, true))
  })
}
