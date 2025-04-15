import trumpet from './trumpet.js'
import { Transform, Readable } from 'node:stream'
import { encode as encodeHtml } from 'ent'

interface StreamValue {
    _html?: string | Buffer | Readable;
    _text?: string | Buffer | Readable;
    _appendHtml?: string | Buffer | Readable;
    _prependHtml?: string | Buffer | Readable;
    _appendText?: string | Buffer | Readable;
    _prependText?: string | Buffer | Readable;
    [key: string]: any;
}

export default function hyperstream (streams: Record<string, string | StreamValue | Readable | null>): Transform {
    const tr = trumpet()
    tr.setMaxListeners(Infinity)

    Object.entries(streams).forEach(([key, value]) => {
        if (value === null) return

        const isStreamValue = (val: any): val is StreamValue => typeof val === 'object' && !Buffer.isBuffer(val) && !val.pipe

        const handleMatch = (elem: any) => {
            if (typeof value === 'string' || Buffer.isBuffer(value)) {
                elem.createWriteStream().end(value)
            } else if (value instanceof Readable) {
                value.pipe(elem.createWriteStream())
            } else if (isStreamValue(value)) {
                Object.entries(value).forEach(([prop, propValue]) => {
                    const lowerProp = prop.toLowerCase()
                    if (lowerProp === '_html' && (typeof propValue === 'string' || Buffer.isBuffer(propValue))) {
                        elem.createWriteStream().end(propValue)
                    } else if (lowerProp === '_html' && propValue instanceof Readable) {
                        propValue.pipe(elem.createWriteStream())
                    } else if (lowerProp === '_text' && (typeof propValue === 'string' || Buffer.isBuffer(propValue))) {
                        elem.createWriteStream().end(encodeHtml(String(propValue)))
                    } else if (lowerProp === '_text' && propValue instanceof Readable) {
                        propValue.pipe(encodeStream()).pipe(elem.createWriteStream())
                    } else {
                        elem.setAttribute(prop, String(propValue))
                    }
                })
            }
        }

        if (key.endsWith(':first')) {
            tr.select(key.replace(/:first$/, ''), handleMatch)
        } else {
            tr.selectAll(key, handleMatch)
        }
    })

    return tr
}

function encodeStream (): Transform {
    return new Transform({
        transform (chunk, _encoding, callback) {
            callback(null, encodeHtml(chunk.toString()))
        }
    })
}
