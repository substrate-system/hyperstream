/**
 * This example demonstrates all transformation methods in hyperstream:
 * - String replacement
 * - Numeric replacement
 * - HTML replacement via _html
 * - Text replacement via _text (HTML-escaped)
 * - Append/prepend HTML via _appendHtml/_prependHtml
 * - Append/prepend text via _append/_prepend
 * - Attribute modification (set, append, prepend)
 * - Stream injection from files
 * - Transform functions
 * - Null values (skip selector)
 * - First-only matching with :first suffix
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { S } from '@substrate-system/stream'
import { processHyperstream } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Convert a string to a Web ReadableStream
 */
function stringToStream (str:string):ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return S.from([encoder.encode(str)]).toStream()
}

/**
 * Read a file as a Web ReadableStream
 */
function fileToStream (filepath:string):ReadableStream<Uint8Array> {
    const content = fs.readFileSync(filepath)
    return S.from([new Uint8Array(content)]).toStream()
}

async function main () {
    console.log('Hyperstream Example\n')
    console.log('='.repeat(60))
    console.log('Reading template.html and applying transformations...\n')

    // Read the template file as a stream
    const templatePath = join(__dirname, 'template.html')
    const templateStream = fileToStream(templatePath)

    // Current timestamp for build info
    const buildTime = new Date().toISOString()

    // Process the template with all transformation types
    const result = await processHyperstream(templateStream, {
        // ─────────────────────────────────────────────────────────────
        // 1. STREAM INJECTION FROM FILES
        // Inject content from external HTML files via ReadableStream
        // ─────────────────────────────────────────────────────────────
        '#main-nav': fileToStream(join(__dirname, 'partials/nav.html')),
        '#main-footer': fileToStream(join(__dirname, 'partials/footer.html')),
        '#features-list': fileToStream(join(__dirname, 'partials/features.html')),

        // ─────────────────────────────────────────────────────────────
        // 2. STRING REPLACEMENT (inline template strings)
        // Replace element content with a plain string
        // ─────────────────────────────────────────────────────────────
        '#page-title': 'Welcome to Hyperstream',
        '#subtitle': 'Transform HTML streams with CSS selectors',
        title: 'Hyperstream Demo | Stream HTML Transformations',

        // ─────────────────────────────────────────────────────────────
        // 3. NUMERIC REPLACEMENT
        // Replace content with numbers (automatically converted to string)
        // ─────────────────────────────────────────────────────────────
        '#user-count': 1234,
        '#download-count': 56789,
        '#star-count': 42,

        // ─────────────────────────────────────────────────────────────
        // 4. HTML REPLACEMENT via _html
        // Replace content with raw HTML (not escaped)
        // ─────────────────────────────────────────────────────────────
        '#card-1 .card-body': {
            _html: '<em>This content was injected as <strong>raw HTML</strong></em>'
        },

        // ─────────────────────────────────────────────────────────────
        // 5. TEXT REPLACEMENT via _text
        // Replace content with text (HTML entities are escaped)
        // ─────────────────────────────────────────────────────────────
        '#card-2 .card-body': {
            _text: 'This shows <escaped> HTML entities & special chars'
        },

        // ─────────────────────────────────────────────────────────────
        // 6. APPEND/PREPEND HTML
        // Add HTML content before or after existing content
        // ─────────────────────────────────────────────────────────────
        '#card-1 .card-title': {
            _prependHtml: '<span style="color: green;">&#10003; </span>'
        },
        '#card-2 .card-title': {
            _appendHtml: ' <span style="color: blue;">(updated)</span>'
        },

        // ─────────────────────────────────────────────────────────────
        // 7. APPEND/PREPEND TEXT (escaped)
        // Add text content (HTML-escaped) before or after existing content
        // Note: _prepend and _append in same object don't stack - use separate selectors
        // ─────────────────────────────────────────────────────────────
        '#sidebar-content': {
            _append: ' <-- This & that are escaped.'
        },

        // ─────────────────────────────────────────────────────────────
        // 8. ATTRIBUTE MODIFICATION - Set attribute value
        // Set or replace an attribute value
        // ─────────────────────────────────────────────────────────────
        '#main-link': {
            href: 'https://github.com/substrate-system/hyperstream',
            target: '_blank',
            rel: 'noopener noreferrer'
        },

        // ─────────────────────────────────────────────────────────────
        // 9. ATTRIBUTE MODIFICATION - Append/Prepend
        // Add to existing attribute values
        // ─────────────────────────────────────────────────────────────
        '#dynamic-box': {
            class: { append: ' highlighted active' },
            style: 'border: 2px solid blue; padding: 10px;'
        },

        // ─────────────────────────────────────────────────────────────
        // 10. TRANSFORM FUNCTIONS
        // Apply a function to transform existing content
        // ─────────────────────────────────────────────────────────────
        '#build-time': (content:string) => {
            return content.replace('unknown', buildTime)
        },

        '#version': (content:string) => {
            return content.replace('0.0.0', '1.0.0-example')
        },

        // ─────────────────────────────────────────────────────────────
        // 11. STREAM FROM STRING (inline stream)
        // Create a stream from a template string
        // ─────────────────────────────────────────────────────────────
        '.sidebar h3': stringToStream('Latest Updates'),

        // ─────────────────────────────────────────────────────────────
        // 12. PREPEND TEXT (escaped) - separate from append
        // Demonstrates _prepend on its own element
        // ─────────────────────────────────────────────────────────────
        '.sidebar': {
            _prependHtml: '<p style="color: #666; font-style: italic;">Welcome to the sidebar!</p>'
        },

        // ─────────────────────────────────────────────────────────────
        // 13. NULL VALUE (skip selector)
        // Use null to skip a selector (useful for conditional rendering)
        // ─────────────────────────────────────────────────────────────
        '#nonexistent-element': null  // This selector is skipped
    })

    // Convert result to string and output
    const decoder = new TextDecoder()
    const html = decoder.decode(result)

    console.log('Transformed HTML:')
    console.log('-'.repeat(60))
    console.log(html)
    console.log('-'.repeat(60))
    console.log('\nTransformations applied:')
    console.log('  1.  Injected nav, footer, and features from external files (stream injection)')
    console.log('  2.  Set page title and subtitle via string replacement')
    console.log('  3.  Set numeric stats (user count, downloads, stars)')
    console.log('  4.  Injected raw HTML into card-1 (_html)')
    console.log('  5.  Injected escaped text into card-2 (_text)')
    console.log('  6.  Prepended checkmark HTML to card-1 title (_prependHtml)')
    console.log('  6.  Appended "(updated)" to card-2 title (_appendHtml)')
    console.log('  7.  Appended escaped text to sidebar content (_append)')
    console.log('  8.  Set href, target, rel attributes on main link')
    console.log('  9.  Appended classes and set style on dynamic-box')
    console.log('  10. Applied transform functions to build-time and version')
    console.log('  11. Used stringToStream for inline stream content')
    console.log('  12. Prepended welcome message to sidebar (_prependHtml)')
    console.log('  13. Demonstrated null value (skipped selector)')
    console.log('\nDone!')
}

main().catch(console.error)
