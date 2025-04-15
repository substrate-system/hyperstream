import through2, { type Transform, type TransformCallback } from 'through2'
import inherits from 'inherits'
import Splicer from 'stream-splicer'
import { Duplex as DuplexStream } from 'readable-stream'
import Match from './match.js'
import selfClosing from './lib/self_closing.js'
import getTag from './lib/get_tag.js'
import lang from './lib/lang.js'

const nextTick: (callback: (...args: any[]) => void) => void = typeof setImmediate !== 'undefined'
    ? setImmediate : process.nextTick

export default Plex
inherits(Plex, Splicer)

interface PlexOptions {
    objectMode: boolean;
}

interface SelectorEntry {
    test: (tree: any) => boolean;
    fn: (elem: any) => void;
}

function Plex (this: any, sel?: string, cb?: (elem: any) => void): void {
    if (!(this instanceof Plex)) return new Plex(sel, cb)

    const streams: any[] = [this._pre(), [], this._post()]
    Splicer.call(this, streams, { objectMode: true } as PlexOptions)

    this._root = {}
    this._current = this._root

    this._selectors = []
    this._lang = lang()

    if (sel && cb) this.select(sel, cb)
}

Plex.prototype._pre = function (this: any): Transform {
    const self = this
    let pipeline: any

    return through2.obj(function (this: Transform, row: any, enc: BufferEncoding, next: TransformCallback) {
        const tree = self._updateTree(row)
        if (!pipeline) pipeline = self.get(1)

        let matched: any = null

        if (row[0] === 'open') {
            for (let i = 0, l = self._selectors.length; i < l; i++) {
                const s: SelectorEntry = self._selectors[i]
                if (s.test(tree)) {
                    matched = self._createMatch(tree, s.fn)
                    this.push(['FIRST', matched])
                }
            }
        }

        if (row[0] === 'open' && tree.selfClosing && tree.parent) {
            self._current = self._current.parent
        }

        if ((matched && tree.selfClosing) || row[0] === 'close') {
            const s = pipeline.get(0)
            if (s && s.finished && s.finished(tree)) {
                s.once('close', function () {
                    nextTick(next)
                })
                this.push(['END', row])
                return
            }
        }

        this.push(row)

        next()
    })
}

Plex.prototype._post = function (this: any): Transform {
    return through2.obj(function (this: Transform, row: any, enc: BufferEncoding, next: TransformCallback) {
        if (row[0] !== 'FIRST') this.push(row)
        next()
    })
}

Plex.prototype.select = function (this: any, sel: string, cb: (elem: any) => void): any {
    this._selectors.push({ test: this._lang(sel), fn: cb })
    return this
}

Plex.prototype._updateTree = function (this: any, row: any): any {
    if (row[0] === 'open') {
        const node: any = { parent: this._current, row }
        node.selfClosing = node.parent && selfClosing(getTag(node))
        if (!this._current.children) this._current.children = [node]
        else this._current.children.push(node)
        this._current = node
    } else if (row[0] === 'close') {
        if (this._current.parent) this._current = this._current.parent
    }
    return this._current
}

Plex.prototype._createMatch = function (this: any, tree: any, fn: (elem: any) => void): any {
    const self = this
    const m = new Match(tree, fn)
    const pipeline = this.get(1)
    pipeline.splice(0, 0, m)

    m.once('close', function () {
        const ix = pipeline.indexOf(m)
        if (ix >= 0) pipeline.splice(ix, 1)

        const next = pipeline.get(ix)
        if (next && next._start === tree) {
            next.write(['END'])
        }
    })

    return m
}
