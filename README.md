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
for compatibility with browsers, Cloudflare Workers, Deno, and other runtimes.

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Example](#example)
  * [Strings](#strings)
  * [TransformStream API](#transformstream-api)
  * [Streams](#streams)
  * [Attribute manipulation](#attribute-manipulation)
  * [Transform functions](#transform-functions)
- [API](#api)
  * [`hyperstream(config)`](#hyperstreamconfig)
  * [`hyperstreamFromString(html, config)`](#hyperstreamfromstringhtml-config)
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

### Strings

Process HTML with string replacements:

```ts
import { hyperstreamFromString } from '@substrate-system/hyperstream'

const result = await hyperstreamFromString(
    `<html>
        <head><title id="title"></title></head>
        <body>
            <div class="content"></div>
        </body>
    </html>`,
    {
        '#title': 'Hello World',
        '.content': { _html: '<p>This is the content</p>' }
    }
)

console.log(result)
```

Output:
```html
<html>
    <head><title id="title">Hello World</title></head>
    <body>
        <div class="content"><p>This is the content</p></div>
    </body>
</html>
```

### TransformStream API

Use the `TransformStream` interface for streaming processing:

```ts
import hyperstream from '@substrate-system/hyperstream'

const hs = hyperstream({
    '#title': 'Hello World',
    '.content': { _html: '<p>This is the content</p>' }
})

// Create a readable stream from a string
const encoder = new TextEncoder()
const input = new ReadableStream({
    start(controller) {
        controller.enqueue(encoder.encode('<html><head><title id="title"></title></head><body><div class="content"></div></body></html>'))
        controller.close()
    }
})

// Pipe through hyperstream and consume the result
const decoder = new TextDecoder()
const reader = input.pipeThrough(hs.transform).getReader()
let result = ''

while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value)
}

console.log(result)
```

#### Append and prepend

Use `_appendHtml`, `_prependHtml`, `_append` (text), or `_prepend` (text)
to add content before or after existing content:

```ts
import { hyperstreamFromString } from '@substrate-system/hyperstream'

const result = await hyperstreamFromString(
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

// Helper to convert a file to a ReadableStream
function fileToStream(path: string): ReadableStream<Uint8Array> {
    const content = fs.readFileSync(path)
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(content))
            controller.close()
        }
    })
}

const hs = hyperstream({
    '#a': fileToStream('./content-a.html'),
    '#b': fileToStream('./content-b.html')
})

// Process template
const template = fileToStream('./template.html')
const reader = template.pipeThrough(hs.transform).getReader()

// Collect output
const chunks: Uint8Array[] = []
while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
}

const decoder = new TextDecoder()
console.log(decoder.decode(Buffer.concat(chunks)))
```

### Attribute manipulation

Set attributes directly, or use `append`/`prepend` to modify existing values:

```ts
import { hyperstreamFromString } from '@substrate-system/hyperstream'

const result = await hyperstreamFromString(
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
<input value="default" placeholder="Enter text..."><button class="btn active">Click</button><a href="https://example.com">Link</a>
```

### Transform functions

Pass a function to transform the existing content:

```ts
import { hyperstreamFromString } from '@substrate-system/hyperstream'

const result = await hyperstreamFromString(
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

### `hyperstreamFromString(html, config)`

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
