import through2, { type Transform, type TransformCallback } from 'through2'
import { Readable, Writable, Duplex } from 'readable-stream'
import { EventEmitter } from 'events'
import parseTag from './parse-tag.js'

interface InterfaceOptions {
    objectMode?: boolean
    inner?: boolean
}

interface Pipeline {
    push: (stream: Transform) => void
}

interface MatchObject {
    once(event: string, listener: (...args: any[]) => void): void
    _start: {
        _parsed: {
            name: string
            getAttributes: () => Record<string, string | boolean>
        }
    }
}

class Interface extends EventEmitter {
    private readonly _pipeline: Pipeline
    private readonly _match: MatchObject
    private _closed = false
    readonly name: string
    readonly attributes: Record<string, string | boolean>
    _setAttr: Record<string, string | boolean | undefined> | null = null

    constructor (pipeline: Pipeline, match: MatchObject) {
        super()
        this._pipeline = pipeline
        this._match = match

        match.once('close', () => {
            this._closed = true
            this.emit('close')
        })

        const tag = match._start._parsed
        this.name = tag.name
        this.attributes = tag.getAttributes()
        this._setAttr = null
    }

    getAttribute (key: string, cb?: (value: string | boolean) => void): string | boolean | undefined {
        const value = this.attributes[String(key).toLowerCase()]
        if (cb) cb(value)
        return value
    }

    getAttributes (cb?: (attrs: Record<string, string | boolean>) => void): Record<string, string | boolean> {
        if (cb) cb(this.attributes)
        return this.attributes
    }

    setAttribute (key: string, value: string | boolean) {
        if (!this._setAttr) this._setAttr = {}
        this._setAttr[key] = value
    }

    removeAttribute (key: string) {
        if (!this._setAttr) this._setAttr = {}
        this._setAttr[key] = undefined
    }

    createStream (opts: InterfaceOptions = {}): Duplex {
        const input = through2.obj()
        const output = through2.obj()
        let first = true
        let last = false
        let lastBuf: any = null
        let pending = 2

        const duplex = new Duplex({
            objectMode: true,
            write (chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
                output.write(chunk, encoding, callback)
            },
            read () {
                // no-op
            },
            final (callback: (error?: Error | null) => void) {
                output.end()
                callback()
            }
        })

        output.on('data', (row: any) => {
            if (row[0] === 'FIRST') {
                input.write(row)
                return
            }
            if (row[0] === 'LAST') {
                last = true
                input.write(row)
                return
            }

            if (opts.inner && first) {
                first = false
                input.write(row)
            } else if (opts.inner && last) {
                lastBuf = row
            } else if (last) {
                const tag = parseTag(row[1])
                if (this._match._start._parsed.name === tag.name) {
                    duplex.push(row)
                }
            } else {
                duplex.push(row)
            }

            first = false
        })

        output.on('end', () => {
            duplex.push(null)
            done()
        })

        const done = () => {
            if (--pending === 0) {
                if (lastBuf) input.push(lastBuf)
                input.push(null)
            }
        }

        input.pipe(duplex)
        this._pipeline.push(output)
        return duplex
    }

    createReadStream (opts: InterfaceOptions = {}): Readable {
        let first = true
        let last = false

        const r = new Readable({ objectMode: true, read () { } })

        const write = (
            _this: Transform,
            row: any,
            _enc: BufferEncoding,
            next: TransformCallback
        ) => {
            if (row[0] === 'FIRST') {
                _this.push(row)
                return next()
            }
            if (row[0] === 'LAST') {
                last = true
                _this.push(row)
                return next()
            }

            if (opts.inner && (first || last)) {
                // nothing
            } else if (last) {
                const tag = parseTag(row[1])
                if (this._match._start._parsed.name === tag.name) {
                    r.push(row)
                }
            } else {
                r.push(row)
            }
            first = false

            _this.push(row)
            next()
        }

        const end = (_this: Transform) => {
            r.push(null)
            _this.push(null)
        }

        const stream = through2.obj(write, end)
        this._pipeline.push(stream)

        return r
    }

    createWriteStream (opts: InterfaceOptions = {}): Writable {
        const stream = this.createStream(opts)
        const w = new Writable({
            objectMode: true,
            write (buf: any, enc: BufferEncoding, next: TransformCallback) {
                stream._write(buf, enc, next)
            }
        })

        // since we're only using this stream for write,
        // siphon off the read end to prevent it from blocking.
        stream.resume()
        w.on('finish', () => {
            stream.end()
        })
        return w
    }
}

export default Interface
