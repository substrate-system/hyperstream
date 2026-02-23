import '@substrate-system/button'
import { hyperstreamFromString } from '../src/index.js'

type TransformBuilder = (content:unknown)=>unknown|Promise<unknown>

const defaultTemplate = `<article class="card">
    <h2 id="title">placeholder title</h2>
    <p class="body">placeholder body</p>
    <a id="cta" href="#">placeholder link</a>
    <ul id="list"></ul>
</article>`

const defaultContent = JSON.stringify({
    title: 'Hyperstream in the browser',
    body: 'Use CSS selectors to replace content in this template.',
    url: 'https://github.com/substrate-system/hyperstream',
    ctaText: 'view repo',
    items: [
        'replace text by selector',
        'set attributes',
        'inject html'
    ]
}, null, 4)

const defaultTransform = [
    '(content) => ({',
    '    \'#title\': content.title,',
    '    \'.body\': { _text: content.body },',
    '    \'#cta\': {',
    '        href: content.url,',
    '        _text: content.ctaText,',
    '        target: \'_blank\',',
    '        rel: \'noopener noreferrer\'',
    '    },',
    '    \'#list\': {',
    '        _html: content.items.map(item => \'<li>\' + item + \'</li>\').join(\'\')',
    '    },',
    '    \'.card\': { class: { append: \' transformed\' } }',
    '})'
].join('\n')

function byId (id:string):HTMLElement {
    const el = document.getElementById(id)
    if (!el) throw new Error(`Missing #${id}`)
    return el
}

const templateInput = byId('templateInput') as HTMLTextAreaElement
const contentInput = byId('contentInput') as HTMLTextAreaElement
const transformInput = byId('transformInput') as HTMLTextAreaElement
const runButton = byId('runButton') as HTMLButtonElement
const output = byId('output')
const error = byId('error')
const live = byId('live')

templateInput.value = defaultTemplate
contentInput.value = defaultContent
transformInput.value = defaultTransform

function parseContent (source:string):unknown {
    try {
        return JSON.parse(source)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Invalid content JSON: ${message}`)
    }
}

function parseTransform (source:string):TransformBuilder {
    let value:unknown
    try {
        // eslint-disable-next-line no-new-func
        value = new Function(`return (${source});`)()
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Invalid transform function: ${message}`)
    }

    if (typeof value !== 'function') {
        throw new Error('Transform code must evaluate to a function.')
    }

    return value as TransformBuilder
}

function setError (message:string|null):void {
    if (message === null) {
        error.textContent = ''
        error.hidden = true
        return
    }

    error.textContent = message
    error.hidden = false
}

async function run ():Promise<void> {
    setError(null)

    const content = parseContent(contentInput.value)
    const transform = parseTransform(transformInput.value)
    const config = await transform(content)
    const transformed = await hyperstreamFromString(templateInput.value, config as never)

    output.textContent = transformed
    live.innerHTML = transformed
}

runButton.addEventListener('click', () => {
    run().catch(err => {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
    })
})

run().catch(err => {
    const message = err instanceof Error ? err.message : String(err)
    setError(message)
})
