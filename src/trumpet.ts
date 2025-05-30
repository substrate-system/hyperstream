import { wrap as wrapElem } from './wrap.js'
import { Tokenize } from './tokenize.js'
import { Duplex, Readable, Writable } from 'node:stream'
import Plex from './html-select/index.js'

// Use Plex as the main selector engine
export const select = (...args: any[]) => new Plex(...args)

/**
 * Parse and transform streaming HTML using CSS selectors.
 */
export class Trumpet extends Duplex {
    private _tokenize: Tokenize
    private _writing: boolean
    private _piping: boolean
    private _select: any

    constructor () {
        super()
        this._tokenize = new Tokenize()
        this._writing = false
        this._piping = false
        this._select = this._tokenize.pipe(select() as any)
    }

    override _read (_size: number): void {
        let row
        let reads = 0
        while ((row = this._select.read()) !== null) {
            if (row[0] === 'END') {
                this.push(row[1][1])
                reads++
            } else if (row[1] && row[1].length) {
                this.push(row[1])
                reads++
            }
        }
        if (reads === 0) {
            this._select.once('readable', () => this._read(_size))
        }
    }

    override _write (chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        if (!this._writing && !this._piping) {
            this._piping = true
            this.resume()
        }
        this._tokenize._write(chunk, _encoding, callback)
    }

    select (selector: string, cb?: (elem: any) => void): any {
        return this._selectAll(selector, cb, true)
    }

    selectAll (selector: string, cb: (elem: any) => void): any {
        return this._selectAll(selector, cb, false)
    }

    private _selectAll (selector: string, cb?: (elem: any) => void, firstOnly = false): any {
        const readers: Array<{ stream: Readable, options?: any }> = []
        const writers: Array<{ stream: Writable, options?: any }> = []
        const duplexes: Array<{ input: Writable; output: Readable; options?: { outer?: boolean } }> = []
        const gets: [string, (value: string | null) => void][] = []
        const getss: ((attrs: Record<string, string>) => void)[] = []
        const sets: [string, string][] = []
        const removes: string[] = []

        let welem: any = null

        this._select.select(selector, (elem: any) => {
            if (firstOnly && welem) return

            welem = wrapElem(elem)

            if (cb) cb(welem)

            elem.once('close', () => {
                welem = null
            })

            readers.splice(0).forEach(({ stream, options }) => {
                welem.createReadStream(options).pipe(stream)
            })
            writers.splice(0).forEach(({ stream, options }) => {
                stream.pipe(welem.createWriteStream(options))
            })
            duplexes.splice(0).forEach((d) => {
                d.input.pipe(welem.createStream(d.options)).pipe(d.output)
            })
            gets.splice(0).forEach(([key, callback]) => welem.getAttribute(key, callback))
            getss.splice(0).forEach((callback) => welem.getAttributes(callback))
            sets.splice(0).forEach(([key, value]) => welem.setAttribute(key, value))
            removes.splice(0).forEach((key) => welem.removeAttribute(key))
        })

        return {
            getAttribute (key: string, cb?: (value: string | null) => void) {
                if (welem) return welem.getAttribute(key, cb)
                gets.push([key, cb!])
                return this
            },
            getAttributes (cb: (attrs: Record<string, string>) => void) {
                if (welem) return welem.getAttributes(cb)
                getss.push(cb)
                return this
            },
            setAttribute (key: string, value: string) {
                if (welem) return welem.setAttribute(key, value)
                sets.push([key, value])
                return this
            },
            removeAttribute (key: string) {
                if (welem) return welem.removeAttribute(key)
                removes.push(key)
                return this
            },
            createReadStream (opts?: { outer?: boolean }) {
                if (welem) return welem.createReadStream(opts)
                const r = new Readable({ read () {} })
                readers.push({ stream: r, options: opts })
                return r
            },
            createWriteStream (opts?: { outer?: boolean }) {
                if (welem) return welem.createWriteStream(opts)
                const w = new Writable({ write (_chunk, _enc, next) { next() } })
                writers.push({ stream: w, options: opts })
                return w
            },
            createStream (opts?: { outer?: boolean }) {
                if (welem) return welem.createStream(opts)
                const input = new Writable({ write (_chunk, _enc, next) { next() } })
                const output = new Readable({ read () {} })
                duplexes.push({ input, output, options: opts })
                return new Duplex({
                    write (chunk, enc, next) {
                        input.write(chunk, enc, next)
                    },
                    read () {
                        const chunk = output.read()
                        if (chunk) this.push(chunk)
                    }
                })
            }
        }
    }
}
