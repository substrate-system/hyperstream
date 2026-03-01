# hyperstream
[![tests](https://img.shields.io/github/actions/workflow/status/substrate-system/hyperstream/nodejs.yml?style=flat-square)](https://github.com/substrate-system/hyperstream/actions/workflows/nodejs.yml)
[![types](https://img.shields.io/npm/types/@substrate-system/hyperstream?style=flat-square)](README.md)
[![module](https://img.shields.io/badge/module-ESM%2FCJS-blue?style=flat-square)](README.md)
[![semantic versioning](https://img.shields.io/badge/semver-2.0.0-blue?logo=semver&style=flat-square)](https://semver.org/)
[![Common Changelog](https://nichoth.github.io/badge/common-changelog.svg)](./CHANGELOG.md)
[![install size](https://flat.badgen.net/packagephobia/install/@substrate-system/hyperstream)](https://packagephobia.com/result?p=@substrate-system/hyperstream)
[![license](https://img.shields.io/badge/license-Big_Time-blue?style=flat-square)](LICENSE)


Use CSS selectors & HTML as a template language.

A re-implementation of the classic
[@substack module](https://www.npmjs.com/package/hyperstream), using
[Web Streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
for compatibility with browsers, Cloudflare Workers, and Deno.

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Browser Example](#browser-example)
- [Example](#example)
  * [Strings](#strings)
  * [TransformStream API](#transformstream-api)
  * [Streams](#streams)
  * [Attribute manipulation](#attribute-manipulation)
  * [Transform functions](#transform-functions)
- [API](#api)
  * [`hyperstream(config)`](#hyperstreamconfig)
  * [`fromString(html, config)`](#fromstringhtml-config)
  * [`createHyperstream(config)`](#createhyperstreamconfig)
  * [`processHyperstream(input, config)`](#processhyperstreaminput-config)
- [Configuration](#configuration)

<!-- tocstop -->

</details>

## Install

```sh
npm i -S @substrate-system/hyperstream
```

## Example

Take some template HTML, and transform it using CSS selectors.

```ts
import hyperstream from '@substrate-system/hyperstream'
import { createReadStream, createWriteStream } from 'node:fs'
import { Readable, Writable } from 'node:stream'

const hs = hyperstream({
    '#title': 'Hello World',
    '.content': { _html: '<p>Injected content</p>' }
})

const destination = Writable.toWeb(createWriteStream('./output.html'))

Readable.toWeb(createReadStream('./template.html'))
    .pipeThrough(hs.transform)
    .pipeTo(destination)
```


## Browser Example

Because this is using 
[Web Streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API),
we can run it in a browser too. A browser demo is in
[`/example_browser`](./example_browser/).

```sh
npm start
```

### Streams as Values

Stream a template file through `hyperstream`, inject streams by selector,
then stream the transformed output into `result.html`. The selector values
are streams here. You can also pass in [string as values](#strings).

```ts
import hyperstream from '@substrate-system/hyperstream'
import { S } from '@substrate-system/stream'
import { createWriteStream } from 'node:fs'
import { Writable } from 'node:stream'
import { open } from 'node:fs/promises'

async function run ():Promise<void> {
    const template = await open('./template.html', 'r')
    const nav = await open('./partials/nav.html', 'r')
    const footer = await open('./partials/footer.html', 'r')

    try {
        // setup template logic
        const hs = hyperstream({
            '#main-nav': nav.readableWebStream(),
            '#main-footer': footer.readableWebStream(),
            '#build-time': S.from([new Date().toISOString()]).toStream()
        })

        // build the template
        await template.readableWebStream()
            .pipeThrough(hs.transform)
            .pipeTo(Writable.toWeb(createWriteStream('./result.html')))
    } finally {
        await Promise.allSettled([
            template.close(),
            nav.close(),
            footer.close(),
        ])
    }
}

await run()
```

### Strings

Use strings as selector values, and use a string as the template.

```ts
// our template is a string, not stream
import { fromString } from '@substrate-system/hyperstream'

const template = `<html>
    <head>
        <title id="title"></title>
    </head>
    <body>
        <div class="content"></div>
    </body>
</html>`

const result = await fromString(template, {
    '#title': 'Hello World',
    '.content': { _html: '<p>This is the content</p>' }
})

console.log(result)
```

#### Output

```html
<html>
    <head><title id="title">Hello World</title></head>
    <body>
        <div class="content"><p>This is the content</p></div>
    </body>
</html>
```

### TransformStream API

Use the `TransformStream` interface:

```ts
import hyperstream from '@substrate-system/hyperstream'
import { S } from '@substrate-system/stream'

const hs = hyperstream({
    '#title': 'Hello World',
    '.content': { _html: '<p>This is the content</p>' }
})

const template = `<html>
    <head><title id="title"></title></head>
    <body>
        <div class="content"></div>
    </body>
    </html>
`

S.from([template]).toStream().pipeTo(hs.writable)

const result = await hs.asString()
console.log(result)
```

#### Append and prepend

Use `_appendHtml`, `_prependHtml`, `_append` (text), or `_prepend` (text)
to add content before or after existing content:

```ts
import { fromString } from '@substrate-system/hyperstream'

// takes a string as input
// returns a string as output
const result = await fromString(
    '<ul class="list"><li>First</li></ul><span class="greeting">World</span>',
    {
        '.list': { _appendHtml: '<li>New item</li>' },
        '.greeting': { _prepend: 'Hello, ' }
    }
)

console.log(result)
```

Output:
```html
<ul class="list"><li>First</li><li>New item</li></ul><span class="greeting">Hello, World</span>
```

### Streams

Pass a `ReadableStream` as the value to insert streamed content:

```ts
import hyperstream from '@substrate-system/hyperstream'
import fs from 'node:fs'
import { S } from '@substrate-system/stream'

// Helper to convert a file to a ReadableStream
function fileToStream(path: string): ReadableStream<Uint8Array> {
    const content = fs.readFileSync(path)
    return S.from([new Uint8Array(content)]).toStream()
}

const hs = hyperstream({
    '#a': fileToStream('./content-a.html'),
    '#b': fileToStream('./content-b.html')
})

// Process template
const template = fileToStream('./template.html')
const output = template.pipeThrough(hs.transform)
const chunks = await S(output).toArray()
const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
const bytes = new Uint8Array(totalLength)
let offset = 0
for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
}

const decoder = new TextDecoder()
console.log(decoder.decode(bytes))
```

### Attribute manipulation

Set attributes directly, or use `append`/`prepend` to modify existing values:

```ts
import { fromString } from '@substrate-system/hyperstream'

const result = await fromString(
    '<input><button class="btn">Click</button><a>Link</a>',
    {
        'input': { value: 'default', placeholder: 'Enter text...' },
        '.btn': { class: { append: ' active' } },
        'a': { href: 'https://example.com' }
    }
)

console.log(result)
```

Output:
```html
<input value="default" placeholder="Enter text...">
<button class="btn active">Click</button>
<a href="https://example.com">Link</a>
```

### Transform functions

Pass a function to transform the existing content:

```ts
import { fromString } from '@substrate-system/hyperstream'

const result = await fromString(
    '<span class="count">41</span><span class="upper">hello</span>',
    {
        '.count': (html) => String(parseInt(html) + 1),
        '.upper': (html) => html.toUpperCase()
    }
)

console.log(result)
```

Output:
```html
<span class="count">42</span><span class="upper">HELLO</span>
```

## API

### `hyperstream(config)`

Create a `Hyperstream` instance with the given configuration.

Returns an object with:
- `transform`: A `TransformStream<Uint8Array, Uint8Array>` for piping
- `readable`: The readable side of the transform
- `writable`: The writable side of the transform

### `fromString(html, config)`

Convenience function to process HTML from a string.

Returns a `Promise<string>` with the processed HTML.

### `createHyperstream(config)`

Create a raw `TransformStream<Uint8Array, Uint8Array>`.

### `processHyperstream(input, config)`

Process a `ReadableStream<Uint8Array>` and return a `Promise<Uint8Array>`.

## Configuration

The config object maps CSS selectors to values:

- **String/Number**: Replace element content
- **`{ _html: string }`**: Replace content with raw HTML
- **`{ _text: string }`**: Replace content with HTML-escaped text
- **`{ _appendHtml: string }`**: Append raw HTML to content
- **`{ _prependHtml: string }`**: Prepend raw HTML to content
- **`{ _append: string }`**: Append HTML-escaped text
- **`{ _prepend: string }`**: Prepend HTML-escaped text
- **`{ attr: value }`**: Set attribute value
- **`{ attr: { append: string } }`**: Append to attribute
- **`{ attr: { prepend: string } }`**: Prepend to attribute
- **`ReadableStream`**: Replace content with stream output
- **`(html) => string`**: Transform existing content
- **`null`**: Skip this selector
