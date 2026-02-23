import { selectAll } from 'css-select'
import { parseDocument } from 'htmlparser2'
import type { Element } from 'domhandler'
import { S } from '@substrate-system/stream'
import { createTokenizer, type Token } from './tokenize.js'
import { encode as entEncode } from './ent/index.js'

type StreamValue = ReadableStream<Uint8Array>
type TransformFn = (html:string) => string
type AttrModifier = { append?:string; prepend?:string }

type PropertyValue =
    | string
    | Uint8Array
    | number
    | StreamValue
    | AttrModifier

type SelectorValue =
    | string
    | Uint8Array
    | number
    | null
    | StreamValue
    | TransformFn
    | Record<string, PropertyValue>

interface HyperstreamConfig {
    [selector:string]:SelectorValue
}

interface MatchedElement {
    selector:string
    value:SelectorValue
    depth:number
    openTag:Uint8Array
    content:Array<Uint8Array|Promise<Uint8Array>>
    closeTag:Uint8Array|null
    firstOnly:boolean
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function concatUint8Arrays (arrays:Uint8Array[]):Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
    }
    return result
}

function isStream (s:unknown):s is StreamValue {
    return (
        s !== null &&
        typeof s === 'object' &&
        typeof (s as ReadableStream).getReader === 'function'
    )
}

function isObj (o:unknown):o is Record<string, unknown> {
    return (
        typeof o === 'object' &&
        o !== null &&
        !(o instanceof Uint8Array) &&
        !isStream(o)
    )
}

function toStr (s:unknown):string {
    if (s instanceof Uint8Array) return decoder.decode(s)
    if (typeof s === 'string') return s
    return String(s)
}

function toBytes (s:unknown):Uint8Array {
    if (s instanceof Uint8Array) return s
    if (typeof s === 'string') return encoder.encode(s)
    return encoder.encode(String(s))
}

function parseTagAttrs (tag:Uint8Array):Record<string, string> {
    const tagStr = decoder.decode(tag)
    const attrs:Record<string, string> = {}
    const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
    let match:RegExpExecArray|null

    const tagMatch = tagStr.match(/^<\/?([a-zA-Z][-a-zA-Z0-9]*)/)
    const startIndex = tagMatch ? tagMatch[0].length : 1
    const attrPart = tagStr.slice(startIndex)

    while ((match = attrRegex.exec(attrPart)) !== null) {
        const name = match[1].toLowerCase()
        const value = match[2] ?? match[3] ?? match[4] ?? ''
        attrs[name] = value
    }

    return attrs
}

function rebuildTag (
    tag:Uint8Array,
    attrChanges:Record<string, string|null>
):Uint8Array {
    const tagStr = decoder.decode(tag)
    const tagMatch = tagStr.match(/^<([a-zA-Z][-a-zA-Z0-9]*)/)
    if (!tagMatch) return tag

    const tagName = tagMatch[1]
    const existingAttrs = parseTagAttrs(tag)

    for (const [key, value] of Object.entries(attrChanges)) {
        if (value === null) {
            delete existingAttrs[key.toLowerCase()]
        } else {
            existingAttrs[key.toLowerCase()] = value
        }
    }

    const selfClosing = tagStr.trimEnd().endsWith('/>')
    let result = '<' + tagName
    for (const [key, value] of Object.entries(existingAttrs)) {
        result += ` ${key}="${value.replace(/"/g, '&quot;')}"`
    }
    result += selfClosing ? ' />' : '>'

    return encoder.encode(result)
}

function getTagName (tag:Uint8Array):string {
    const tagStr = decoder.decode(tag)
    const match = tagStr.match(/^<\/?([a-zA-Z][-a-zA-Z0-9]*)/)
    return match ? match[1].toLowerCase() : ''
}

function isSelfClosing (tag:Uint8Array):boolean {
    const tagStr = decoder.decode(tag).trim()
    return tagStr.endsWith('/>') || isVoidElement(getTagName(tag))
}

const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
])

function isVoidElement (tagName:string):boolean {
    return VOID_ELEMENTS.has(tagName.toLowerCase())
}

function matchesSelector (
    tag:Uint8Array,
    selector:string,
    ancestors:Uint8Array[]
):boolean {
    const tagName = getTagName(tag)
    const attrs = parseTagAttrs(tag)

    let html = ''
    for (const ancestorTag of ancestors) {
        const name = getTagName(ancestorTag)
        const ancestorAttrs = parseTagAttrs(ancestorTag)
        html += `<${name}`
        for (const [k, v] of Object.entries(ancestorAttrs)) {
            html += ` ${k}="${v}"`
        }
        html += '>'
    }

    html += `<${tagName}`
    for (const [k, v] of Object.entries(attrs)) {
        html += ` ${k}="${v}"`
    }
    html += `></${tagName}>`

    for (let i = ancestors.length - 1; i >= 0; i--) {
        const name = getTagName(ancestors[i])
        html += `</${name}>`
    }

    try {
        const doc = parseDocument(html)
        const elements = selectAll(selector, doc) as unknown as Element[]
        if (elements.length > 0) {
            const last = elements[elements.length - 1]
            return last.name === tagName
        }
        return false
    } catch {
        return false
    }
}

async function streamToUint8Array (stream:ReadableStream<Uint8Array>):Promise<Uint8Array> {
    const chunks = await S(stream).toArray()
    return concatUint8Arrays(chunks)
}

interface HyperstreamState {
    selectors:Array<{
        selector:string
        value:SelectorValue
        firstOnly:boolean
        matchedOnce:boolean
    }>
    ancestors:Uint8Array[]
    activeMatches:MatchedElement[]
    depth:number
}

function createState (config:HyperstreamConfig):HyperstreamState {
    return {
        selectors: Object.keys(config).map(key => {
            const firstOnly = /:first$/.test(key)
            return {
                selector: key.replace(/:first$/, ''),
                value: config[key],
                firstOnly,
                matchedOnce: false
            }
        }),
        ancestors: [],
        activeMatches: [],
        depth: 0
    }
}

function buildOutput (
    openTag:Uint8Array,
    content:Uint8Array,
    closeTag:Uint8Array|null,
    attrChanges:Record<string, string|null>
):Uint8Array {
    const modifiedTag = Object.keys(attrChanges).length > 0
        ? rebuildTag(openTag, attrChanges) : openTag

    const parts = [modifiedTag, content]
    if (closeTag) parts.push(closeTag)
    return concatUint8Arrays(parts)
}

async function processObjectValue (
    openTag:Uint8Array,
    originalContent:Uint8Array,
    closeTag:Uint8Array|null,
    props:Record<string, PropertyValue>
):Promise<Uint8Array> {
    let newContent:Uint8Array|null = null
    let pendingContent:Promise<Uint8Array>|null = null
    const attrChanges:Record<string, string|null> = {}

    for (const [prop, v] of Object.entries(props)) {
        const lprop = prop.toLowerCase()

        if (prop === '_html') {
            if (isStream(v)) {
                pendingContent = streamToUint8Array(v)
            } else {
                newContent = toBytes(v)
            }
        } else if (prop === '_text') {
            if (isStream(v)) {
                pendingContent = streamToUint8Array(v).then(buf =>
                    encoder.encode(entEncode(decoder.decode(buf)))
                )
            } else {
                newContent = encoder.encode(entEncode(toStr(v)))
            }
        } else if (lprop === '_appendhtml') {
            if (isStream(v)) {
                pendingContent = streamToUint8Array(v).then(buf =>
                    concatUint8Arrays([originalContent, buf])
                )
            } else {
                newContent = concatUint8Arrays([originalContent, toBytes(v)])
            }
        } else if (lprop === '_prependhtml') {
            if (isStream(v)) {
                pendingContent = streamToUint8Array(v).then(buf =>
                    concatUint8Arrays([buf, originalContent])
                )
            } else {
                newContent = concatUint8Arrays([toBytes(v), originalContent])
            }
        } else if (prop === '_append' || lprop === '_appendtext') {
            if (isStream(v)) {
                pendingContent = streamToUint8Array(v).then(buf =>
                    concatUint8Arrays([originalContent, encoder.encode(entEncode(decoder.decode(buf)))])
                )
            } else {
                newContent = concatUint8Arrays([originalContent, encoder.encode(entEncode(toStr(v)))])
            }
        } else if (prop === '_prepend' || lprop === '_prependtext') {
            if (isStream(v)) {
                pendingContent = streamToUint8Array(v).then(buf =>
                    concatUint8Arrays([encoder.encode(entEncode(decoder.decode(buf))), originalContent])
                )
            } else {
                newContent = concatUint8Arrays([encoder.encode(entEncode(toStr(v))), originalContent])
            }
        } else {
            if (isObj(v) && ('append' in v || 'prepend' in v)) {
                const modifier = v as AttrModifier
                const currentAttrs = parseTagAttrs(openTag)
                let current = currentAttrs[prop.toLowerCase()] || ''
                if (modifier.append) current += modifier.append
                if (modifier.prepend) current = modifier.prepend + current
                attrChanges[prop] = current
            } else if (v === null || v === undefined) {
                attrChanges[prop] = null
            } else {
                attrChanges[prop] = toStr(v)
            }
        }
    }

    if (pendingContent) {
        const buf = await pendingContent
        return buildOutput(openTag, buf, closeTag, attrChanges)
    } else {
        const finalContent = newContent ?? originalContent
        return buildOutput(openTag, finalContent, closeTag, attrChanges)
    }
}

async function transformContent (
    value:SelectorValue,
    openTag:Uint8Array,
    originalContent:Uint8Array,
    closeTag:Uint8Array|null
):Promise<Uint8Array> {
    if (typeof value === 'string') {
        return buildOutput(openTag, encoder.encode(value), closeTag, {})
    } else if (typeof value === 'number') {
        return buildOutput(openTag, encoder.encode(String(value)), closeTag, {})
    } else if (value instanceof Uint8Array) {
        return buildOutput(openTag, value, closeTag, {})
    } else if (typeof value === 'function') {
        const result = value(decoder.decode(originalContent))
        return buildOutput(openTag, toBytes(result), closeTag, {})
    } else if (isStream(value)) {
        const buf = await streamToUint8Array(value)
        return buildOutput(openTag, buf, closeTag, {})
    } else if (isObj(value)) {
        return processObjectValue(openTag, originalContent, closeTag, value as Record<string, PropertyValue>)
    } else {
        const parts = [openTag, originalContent]
        if (closeTag) parts.push(closeTag)
        return concatUint8Arrays(parts)
    }
}

async function resolveContent (content:Array<Uint8Array|Promise<Uint8Array>>):Promise<Uint8Array> {
    const resolved = await Promise.all(content)
    return concatUint8Arrays(resolved)
}

async function processMatch (match:MatchedElement):Promise<Uint8Array> {
    const { value, openTag, content, closeTag } = match
    const hasPromises = content.some(c => c instanceof Promise)

    let originalContent:Uint8Array
    if (hasPromises) {
        originalContent = await resolveContent(content)
    } else {
        originalContent = concatUint8Arrays(content as Uint8Array[])
    }

    return transformContent(value, openTag, originalContent, closeTag)
}

/**
 * Process HTML through hyperstream asynchronously
 */
export async function processHyperstream (
    input:ReadableStream<Uint8Array>,
    config:HyperstreamConfig = {}
):Promise<Uint8Array> {
    const state = createState(config)
    const outputQueue:Array<Uint8Array|Promise<Uint8Array>> = []

    function queueOutput (
        data:Uint8Array|Promise<Uint8Array>,
        activeMatches:MatchedElement[]
    ):void {
        if (activeMatches.length > 0) {
            const parent = activeMatches[activeMatches.length - 1]
            parent.content.push(data)
        } else {
            outputQueue.push(data)
        }
    }

    function handleOpenTag (tag:Uint8Array):void {
        const selfClosing = isSelfClosing(tag)

        for (const sel of state.selectors) {
            if (sel.value === null) continue
            if (sel.firstOnly && sel.matchedOnce) continue

            if (matchesSelector(tag, sel.selector, state.ancestors)) {
                sel.matchedOnce = true

                const match:MatchedElement = {
                    selector: sel.selector,
                    value: sel.value,
                    depth: state.depth,
                    openTag: tag,
                    content: [],
                    closeTag: null,
                    firstOnly: sel.firstOnly
                }

                if (selfClosing) {
                    queueOutput(processMatch(match), state.activeMatches)
                } else {
                    state.activeMatches.push(match)
                    state.ancestors.push(tag)
                    state.depth++
                }
                return
            }
        }

        queueOutput(tag, state.activeMatches)

        if (!selfClosing) {
            state.ancestors.push(tag)
            state.depth++
        }
    }

    function handleCloseTag (tag:Uint8Array):void {
        state.depth--
        if (state.ancestors.length > 0) {
            state.ancestors.pop()
        }

        if (state.activeMatches.length > 0) {
            const match = state.activeMatches[state.activeMatches.length - 1]
            if (state.depth === match.depth) {
                match.closeTag = tag
                state.activeMatches.pop()
                queueOutput(processMatch(match), state.activeMatches)
                return
            }
        }

        queueOutput(tag, state.activeMatches)
    }

    function processToken (token:Token):void {
        const [type, data] = token
        if (type === 'open') {
            handleOpenTag(data)
        } else if (type === 'close') {
            handleCloseTag(data)
        } else if (type === 'text') {
            queueOutput(data, state.activeMatches)
        }
    }

    // Process the input through tokenizer
    const tokenizer = createTokenizer()
    const tokenStream = input.pipeThrough(tokenizer)
    await S(tokenStream).forEach(processToken).toArray()

    // Resolve all queued output
    const resolvedOutput:Uint8Array[] = []
    for (const item of outputQueue) {
        if (item instanceof Promise) {
            resolvedOutput.push(await item)
        } else {
            resolvedOutput.push(item)
        }
    }

    return concatUint8Arrays(resolvedOutput)
}

/**
 * Create a hyperstream TransformStream
 */
export function createHyperstream (config:HyperstreamConfig = {}):TransformStream<Uint8Array, Uint8Array> {
    const chunks:Uint8Array[] = []

    return new TransformStream<Uint8Array, Uint8Array>({
        transform (chunk) {
            // Buffer all input chunks
            chunks.push(chunk)
        },
        async flush (controller) {
            // Process all buffered input at once
            const input = S.from(chunks).toStream()

            const result = await processHyperstream(input, config)
            controller.enqueue(result)
        }
    })
}

/**
 * Hyperstream class - provides a TransformStream interface
 */
export class Hyperstream {
    readonly transform:TransformStream<Uint8Array, Uint8Array>
    readonly readable:ReadableStream<Uint8Array>
    readonly writable:WritableStream<Uint8Array>

    constructor (config:HyperstreamConfig = {}) {
        this.transform = createHyperstream(config)
        this.readable = this.transform.readable
        this.writable = this.transform.writable
    }
}

/**
 * Create a hyperstream from a string (convenience function)
 */
export async function hyperstreamFromString (
    html:string,
    config:HyperstreamConfig = {}
):Promise<string> {
    const hs = createHyperstream(config)
    const inputBytes = encoder.encode(html)
    const output = S.from([inputBytes]).toStream().pipeThrough(hs)
    const chunks = await S(output).toArray()
    return decoder.decode(concatUint8Arrays(chunks))
}

/**
 * Default export - create a hyperstream instance
 */
export default function hyperstream (config?:HyperstreamConfig):Hyperstream {
    return new Hyperstream(config)
}
