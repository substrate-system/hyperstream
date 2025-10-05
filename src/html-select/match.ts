import Interface from './interface.js'
import through2, {
    type Transform,
    type TransformCallback
} from 'through2'
import Splicer from 'stream-splicer'
import setAttrs from './set-attrs.js'

interface TreeNode {
    selfClosing?: boolean
    parent?: TreeNode
}

interface Row {
    [index: number]: string | Buffer | any
}

export class Match extends Splicer {
    private readonly _start: TreeNode
    private readonly _fn: (iface: Interface) => void
    private _ended = false

    constructor (start: TreeNode, fn: (iface: Interface) => void) {
        super({ objectMode: true })
        this._start = start
        this._fn = fn
    }

    _pre (): Transform {
        let matched = false
        let first = true
        return through2.obj(
            (
                row: Row,
                _enc: BufferEncoding,
                cb: TransformCallback
            ) => {
                // detect when the selected tokens start
                if (!matched && row[0] === 'FIRST' && row[1] === this) {
                    matched = true
                }

                // first interesting token of the selection
                if (matched && first && row[0] !== 'FIRST') {
                    const iface = this.createInterface()
                    this._fn(iface)

                    if (iface._setAttr && row[0] === 'END') {
                        row[1][1] = setAttrs(row[1][1], iface._setAttr)
                    } else if (iface._setAttr) {
                        row[1] = setAttrs(row[1], iface._setAttr)
                    }
                    first = false
                }

                if (row[0] === 'END' && this._ended) {
                    this._ended = false
                    ;(this as any).emit('close')
                    cb()
                } else if (row[0] === 'END') {
                    this._ended = true
                    ;(this as any).push(['LAST'])
                    ;(this as any).push(row[1])
                    ;(this as any).push(null)
                } else {
                    if (!this._ended) (this as any).push(row)
                    cb()
                }
            },
            function end (_this: Transform) {
                // end function
            }
        )
    }

    _post (): Transform {
        return through2.obj(
            function (
                this: Transform,
                row: Row,
                _enc: BufferEncoding,
                next: TransformCallback
            ) {
                if (row[0] !== 'LAST') this.push(row)
                next()
            },
            function end (this: Transform) {
                if ((this as any)._next) {
                    (this as any).emit('close')
                    ;(this as any)._next()
                } else {
                    (this as any)._ended = true
                }
            }
        )
    }

    finished (tree: TreeNode): boolean {
        if (this._start.selfClosing) return true
        return tree === this._start.parent
    }

    createInterface (): Interface {
        return new Interface((this as any).get(1), this as any)
    }
}

export default Match
