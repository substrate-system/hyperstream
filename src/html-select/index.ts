import through2, { type Transform, type TransformCallback } from 'through2'
import Splicer from 'stream-splicer'
import Match from './match.js'
import Interface from './interface.js'
import voidElements from 'void-elements'
import { is as cssIs } from 'css-select'
import type { EventEmitter } from 'events'

const nextTick: (callback: (...args: any[]) => void) => void = typeof setImmediate !== 'undefined'
    ? setImmediate
    : process.nextTick

interface PlexOptions {
    objectMode: boolean
}

interface SelectorEntry {
    test: (tree: TreeNode) => boolean
    fn: (elem: Interface) => void
}

interface TreeNode {
    parent?: TreeNode
    children?: TreeNode[]
    row?: any
    selfClosing?: boolean
}

class Plex extends Splicer {
    private _root: TreeNode
    private _current: TreeNode
    private _selectors: SelectorEntry[]
    private readonly _lang: (sel: string) => (tree: TreeNode) => boolean
    get!: (index: number) => any // from Splicer

    constructor (sel?: string, cb?: (elem: Interface) => void) {
        const streams: any[] = [Plex._preFactory(), [], Plex._postFactory()]
        super(streams, { objectMode: true } as PlexOptions)
        this._root = {}
        this._current = this._root
        this._selectors = []
        this._lang = lang()
        if (sel && cb) this.select(sel, cb)
    }

    static _preFactory () {
        return function (this: Plex): Transform {
            let pipeline: any
            return through2.obj(function (this: Transform, row: any, _enc: BufferEncoding, next: TransformCallback) {
                const tree = this._updateTree(row)
                if (!pipeline) pipeline = this.get(1)
                let matched: any = null
                if (row[0] === 'open') {
                    for (let i = 0, l = this._selectors.length; i < l; i++) {
                        const s: SelectorEntry = this._selectors[i]
                        if (s.test(tree)) {
                            matched = this._createMatch(tree, s.fn)
                            this.push(['FIRST', matched])
                        }
                    }
                }
                if (row[0] === 'open' && tree.selfClosing && tree.parent) {
                    this._current = this._current.parent
                }
                if ((matched && tree.selfClosing) || row[0] === 'close') {
                    const s = pipeline.get(0)
                    if (s && s.finished && s.finished(tree)) {
                        (s as unknown as EventEmitter).once('close', () => { nextTick(next) })
                        this.push(['END', row])
                        return
                    }
                }
                this.push(row)
                next()
            })
        }
    }

    static _postFactory () {
        return function (): Transform {
            return through2.obj(function (this: Transform, row: any, _enc: BufferEncoding, next: TransformCallback) {
                if (row[0] !== 'FIRST') this.push(row)
                next()
            })
        }
    }

    select (sel: string, cb: (elem: Interface) => void): this {
        this._selectors.push({ test: this._lang(sel), fn: cb })
        return this
    }

    _updateTree (row: any): TreeNode {
        if (row[0] === 'open') {
            const node: TreeNode = { parent: this._current, row }
            node.selfClosing = node.parent && selfClosing(getTag(node))
            if (!this._current.children) this._current.children = [node]
            else this._current.children.push(node)
            this._current = node
        } else if (row[0] === 'close') {
            if (this._current.parent) this._current = this._current.parent
        }
        return this._current
    }

    _createMatch (tree: TreeNode, fn: (elem: Interface) => void): Match {
        const m = new Match(tree, fn)
        const pipeline = this.get(1)
        pipeline.splice(0, 0, m);
        (m as unknown as EventEmitter).once('close', () => {
            const ix = pipeline.indexOf(m)
            if (ix >= 0) pipeline.splice(ix, 1)
            const next = pipeline.get(ix)
            if (next && next._start === tree) {
                next.write(['END'])
            }
        })
        return m
    }
}

function getTag (node: TreeNode): string {
    const buf = node.row?.[1]
    const str = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf)
    const match = str.match(/^<\/?([\w-]+)/)
    return match ? match[1].toLowerCase() : ''
}

function selfClosing (tag: string): boolean {
    return !!voidElements[tag]
}

function lang (): (selector: string) => (node: TreeNode) => boolean {
    return (selector: string) => (node: TreeNode) => {
        const tag = getTag(node)
        const fakeElem = { type: 'tag', name: tag, attribs: (node as any).attributes || {} }
        return cssIs(fakeElem, selector)
    }
}

export default Plex

