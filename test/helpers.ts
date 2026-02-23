import fs from 'node:fs'
import { S } from '@substrate-system/stream'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Convert a string to a ReadableStream of bytes
 */
export function stringToStream (str: string): ReadableStream<Uint8Array> {
    return S.from([encoder.encode(str)]).toStream()
}

/**
 * Read a file and return a web ReadableStream
 */
export function fileToStream (filepath: string): ReadableStream<Uint8Array> {
    const content = fs.readFileSync(filepath)
    return S.from([new Uint8Array(content)]).toStream()
}

/**
 * Consume a ReadableStream and return the data as a string
 */
export async function streamToString (stream: ReadableStream<Uint8Array>): Promise<string> {
    const chunks = await S(stream).toArray()
    const totalLength = chunks.reduce((sum, arr) => sum + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
    }
    return decoder.decode(result)
}

/**
 * Run html through hyperstream and return the result as a string
 */
export async function processHtml (
    hs: { transform: TransformStream<Uint8Array, Uint8Array> },
    html: string
): Promise<string> {
    const input = stringToStream(html)
    const output = input.pipeThrough(hs.transform)
    return streamToString(output)
}

/**
 * Run a file through hyperstream and return the result as a string
 */
export async function processFile (
    hs: { transform: TransformStream<Uint8Array, Uint8Array> },
    filepath: string
): Promise<string> {
    const input = fileToStream(filepath)
    const output = input.pipeThrough(hs.transform)
    return streamToString(output)
}

/**
 * Create a delayed stream that emits characters one by one with a delay
 */
export function createDelayedStream (chars: string, delayMs: number): ReadableStream<Uint8Array> {
    async function * delayedChars (): AsyncGenerator<Uint8Array> {
        for (const char of chars) {
            await new Promise(resolve => setTimeout(resolve, delayMs))
            yield encoder.encode(char)
        }
    }

    return S.from(delayedChars()).toStream()
}

/**
 * Create an A-Z stream (letters a-z with delays)
 */
export function createAzStream (delayMs = 25): ReadableStream<Uint8Array> {
    return createDelayedStream('abcdefghijklmnopqrstuvwxyz', delayMs)
}
