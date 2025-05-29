import { Duplex, Readable, Writable } from 'node:stream'

interface WrappedElement {
    name: string;
    getAttribute(key: string, cb?: (value: string | null) => void): string | null;
    getAttributes(cb?: (attrs: Record<string, string>) => void): Record<string, string>;
    setAttribute(key: string, value: string): void;
    removeAttribute(key: string): void;
    createReadStream(opts?: { outer?: boolean }): Readable;
    createWriteStream(opts?: { outer?: boolean }): Writable;
    createStream(opts?: { outer?: boolean }): Duplex;
}

export const wrap = (elem: {
    name: string;
    getAttribute: (key: string) => string | null;
    getAttributes: () => Record<string, string>;
    setAttribute: (key: string, value: string) => void;
    removeAttribute: (key: string) => void;
    createReadStream: (opts: { inner: boolean }) => Readable;
    createWriteStream: (opts: { inner: boolean }) => Writable;
    createStream: (opts: { inner: boolean }) => Duplex;
}): WrappedElement => {
    const welem: WrappedElement = {
        name: elem.name,

        getAttribute (key, cb) {
            const value = elem.getAttribute(key.toLowerCase())
            if (cb) cb(value)
            return value
        },

        getAttributes (cb) {
            const attrs = elem.getAttributes()
            if (cb) cb(attrs)
            return attrs
        },

        setAttribute (key, value) {
            elem.setAttribute(key, value)
        },

        removeAttribute (key) {
            elem.removeAttribute(key)
        },

        createReadStream (opts = {}) {
            const rs = elem.createReadStream({ inner: !opts.outer })
            const r = new Readable({
                read () {
                    let row
                    let reads = 0
                    while ((row = rs.read()) !== null) {
                        if (row[1].length) {
                            this.push(row[1])
                            reads++
                        }
                    }
                    if (reads === 0) {
                        rs.once('readable', this.read.bind(this))
                    }
                }
            })
            rs.on('end', () => r.push(null))
            return r
        },

        createWriteStream (opts = {}) {
            const ws = elem.createWriteStream({ inner: !opts.outer })
            const w = new Writable({
                write (buf, _enc, next) {
                    ws.write(['data', buf])
                    next()
                }
            })
            w.on('finish', () => ws.end())
            return w
        },

        createStream (opts = {}) {
            const s = elem.createStream({ inner: !opts.outer })
            const d = new Duplex({
                write (buf, _enc, next) {
                    s.write(['data', buf])
                    next()
                },
                read () {
                    let row
                    let reads = 0
                    while ((row = s.read()) !== null) {
                        if (row[1].length) {
                            this.push(row[1])
                            reads++
                        }
                    }
                    if (reads === 0) {
                        s.once('readable', this.read.bind(this))
                    }
                }
            })
            d.on('finish', () => s.end())
            s.on('end', () => d.push(null))
            return d
        }
    }

    return welem
}
