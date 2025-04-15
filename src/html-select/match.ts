import Interface from './interface.js'
import through2, { type Transform, type TransformCallback } from 'through2'
import Splicer from 'stream-splicer'
import { Readable } from 'readable-stream'
import setAttrs from './set_attrs.js'

interface MatchOptions {
    objectMode: boolean;
}

interface SelectorEntry {
    test: (tree: any) => boolean;
    fn: (elem: any) => void;
}

export class Match extends Splicer {
    _start: any
    _fn: (iface: any) => void
    _ended: boolean = false
    _next: TransformCallback | null = null

    constructor (start: any, fn: (iface: any) => void) {
        super({ objectMode: true })
        this._start = start
        this._fn = fn
    }

    _pre (): Transform {
        const self = this
        let matched = false
        let first = true
        return through2.obj(function (this: Transform, row: any, enc: BufferEncoding, next: TransformCallback) {
            // detect when the selected tokens start
            if (!matched && row[0] === 'FIRST' && row[1] === self) {
                matched = true
            }

            // first interesting token of the selection
            if (matched && first && row[0] !== 'FIRST') {
                const iface = self.createInterface()
                self._fn(iface)

                if (iface._setAttr && row[0] === 'END') {
                    row[1][1] = setAttrs(row[1][1], iface._setAttr)
                } else if (iface._setAttr) {
                    row[1] = setAttrs(row[1], iface._setAttr)
                }
                first = false
            }

            if (row[0] === 'END' && self._ended) {
                self._ended = false
                self.emit('close')
                next()
            } else if (row[0] === 'END') {
                self._next = next

                self._ended = true
                this.push(['LAST'])
                this.push(row[1])
                this.push(null)
            } else {
                if (!self._ended) this.push(row)
                next()
            }
        }, function end (this: Transform) {
            // end function
        })
    }

    _post (): Transform {
        const self = this
        return through2.obj(function (this: Transform, row: any, enc: BufferEncoding, next: TransformCallback) {
            if (row[0] !== 'LAST') this.push(row)
            next()
        }, function end (this: Transform) {
            if (self._next) {
                self.emit('close')
                self._next()
            } else {
                self._ended = true
            }
        })
    }

    finished (tree: any): boolean {
        if (this._start.selfClosing) return true
        return tree === this._start.parent
    }

    createInterface (): Interface {
        return new Interface(this.get(1), this)
    }
}

export default Match
