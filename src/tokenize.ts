import { type TransformCallback, Transform } from 'node:stream'

const codes = {
    lt: '<'.charCodeAt(0),
    gt: '>'.charCodeAt(0),
    slash: '/'.charCodeAt(0),
    dquote: '"'.charCodeAt(0),
    squote: "'".charCodeAt(0),
    equal: '='.charCodeAt(0)
}

const strings = {
    endScript: Buffer.from('</script'),
    endStyle: Buffer.from('</style'),
    endTitle: Buffer.from('</title'),
    comment: Buffer.from('<!--'),
    endComment: Buffer.from('-->'),
    cdata: Buffer.from('<![CDATA['),
    endCdata: Buffer.from(']]>')
}

const states = {
    TagNameState: 1,
    AttributeNameState: 2,
    BeforeAttributeValueState: 3,
    AttributeValueState: 4
}

/**
 * Transform stream to tokenize HTML
 */
export class Tokenize extends Transform {
    private state: string
    private tagState: number | null
    private quoteState: string | null
    private raw: Buffer | null
    private buffers: Buffer[]
    private _offset?: number
    private _prev?: Buffer | null
    private _last: number[]

    constructor () {
        super({ objectMode: true })
        this.state = 'text'
        this.tagState = null
        this.quoteState = null
        this.raw = null
        this.buffers = []
        this._last = []
    }

    private _pushState (ev: string): void {
        if (this.buffers.length === 0) return
        const buf = Buffer.concat(this.buffers)
        this.buffers = []
        this.push([ev, buf])
    }

    private _getChar (i: number): number | undefined {
        let offset = 0
        for (const buf of this.buffers) {
            if (offset + buf.length > i) {
                return buf[i - offset]
            }
            offset += buf.length
        }
    }

    private _getTag (): string {
        let tag = ''
        for (const buf of this.buffers) {
            for (let k = 0; k < buf.length; k++) {
                const c = String.fromCharCode(buf[k])
                if (/[^\w-![\]]/.test(c)) {
                    return tag.toLowerCase()
                } else {
                    tag += c
                }
            }
        }
        return tag.toLowerCase()
    }

    private _testRaw (
        buf: Buffer,
        offset: number,
        index: number
    ): [Buffer, Buffer] | undefined {
        if (!compare(this._last, this.raw)) return

        this.buffers.push(buf.slice(offset, index + 1))
        const _buf = Buffer.concat(this.buffers)
        const k = _buf.length - (this.raw?.length || 0)
        return [_buf.slice(0, k), _buf.slice(k)]
    }

    _transform (buf: Buffer, _enc: BufferEncoding, next: TransformCallback): void {
        let i = 0
        let offset = 0

        if (this._prev) {
            buf = Buffer.concat([this._prev, buf])
            i = this._prev.length - 1
            offset = this._offset || 0
            this._prev = null
            this._offset = 0
        }

        for (; i < buf.length; i++) {
            const b = buf[i]
            this._last.push(b)
            if (this._last.length > 9) this._last.shift()

            if (this.raw) {
                const parts = this._testRaw(buf, offset, i)
                if (parts) {
                    this.push(['text', parts[0]])
                    if (this.raw === strings.endComment || this.raw === strings.endCdata) {
                        this.state = 'text'
                        this.buffers = []
                        this.push(['close', parts[1]])
                    } else {
                        this.state = 'open'
                        this.buffers = [parts[1]]
                    }
                    this.raw = null
                    offset = i + 1
                }
            } else if (this.state === 'text' && b === codes.lt && i === buf.length - 1) {
                this._prev = buf
                this._offset = offset
                return next()
            } else if (this.state === 'text' && b === codes.lt && !isWhiteSpace(buf[i + 1])) {
                if (i > 0 && i - offset > 0) {
                    this.buffers.push(buf.slice(offset, i))
                }
                offset = i
                this.state = 'open'
                this.tagState = states.TagNameState
                this._pushState('text')
            } else if (this.tagState === states.TagNameState && isWhiteSpace(b)) {
                this.tagState = states.AttributeNameState
            } else if (this.tagState === states.AttributeNameState && b === codes.equal) {
                this.tagState = states.BeforeAttributeValueState
            } else if (this.tagState === states.BeforeAttributeValueState && !isWhiteSpace(b)) {
                this.tagState = states.AttributeValueState
                this.quoteState = b === codes.dquote ? 'double' : b === codes.squote ? 'single' : null
            } else if (this.tagState === states.AttributeValueState && this.quoteState === 'double' && b === codes.dquote) {
                this.quoteState = null
                this.tagState = states.AttributeNameState
            } else if (this.tagState === states.AttributeValueState && this.quoteState === 'single' && b === codes.squote) {
                this.quoteState = null
                this.tagState = states.AttributeNameState
            } else if (this.state === 'open' && b === codes.gt && !this.quoteState) {
                this.buffers.push(buf.slice(offset, i + 1))
                offset = i + 1
                this.state = 'text'
                this.tagState = null
                if (this._getChar(1) === codes.slash) {
                    this._pushState('close')
                } else {
                    const tag = this._getTag()
                    if (tag === 'script') this.raw = strings.endScript
                    if (tag === 'style') this.raw = strings.endStyle
                    if (tag === 'title') this.raw = strings.endTitle
                    this._pushState('open')
                }
            }
        }

        if (offset < buf.length) this.buffers.push(buf.slice(offset))
        next()
    }

    _flush (next: TransformCallback): void {
        if (this.state === 'text') this._pushState('text')
        this.push(null)
        next()
    }
}

function compare (a: number[], b: Buffer | null): boolean {
    if (!b || a.length < b.length) return false
    for (let i = a.length - 1, j = b.length - 1; j >= 0; i--, j--) {
        if (lower(a[i]) !== lower(b[j])) return false
    }
    return true
}

function lower (n: number): number {
    return n >= 65 && n <= 90 ? n + 32 : n
}

function isWhiteSpace (b: number): boolean {
    return b === 0x20 || b === 0x09 || b === 0x0A || b === 0x0C || b === 0x0D
}
