const codes = {
    lt: '<'.charCodeAt(0),
    gt: '>'.charCodeAt(0),
    slash: '/'.charCodeAt(0),
    dquote: '"'.charCodeAt(0),
    squote: "'".charCodeAt(0),
    equal: '='.charCodeAt(0)
}

const strings = {
    endScript: new TextEncoder().encode('</script'),
    endStyle: new TextEncoder().encode('</style'),
    endTitle: new TextEncoder().encode('</title'),
    comment: new TextEncoder().encode('<!--'),
    endComment: new TextEncoder().encode('-->'),
    cdata: new TextEncoder().encode('<![CDATA['),
    endCdata: new TextEncoder().encode(']]>')
}

const states = {
    TagNameState: 1,
    AttributeNameState: 2,
    BeforeAttributeValueState: 3,
    AttributeValueState: 4
}

export type Token = ['open'|'close'|'text', Uint8Array]

interface TokenizerState {
    state:string
    tagState:number|null
    quoteState:string|null
    raw:Uint8Array|null
    buffers:Uint8Array[]
    last:number[]
    prev:Uint8Array|null
    offset:number
}

function concatUint8Arrays (arrays:Uint8Array[]):Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
    }
    return result
}

function getChar (buffers:Uint8Array[], i:number):number|undefined {
    let offset = 0
    for (const buf of buffers) {
        if (offset + buf.length > i) {
            return buf[i - offset]
        }
        offset += buf.length
    }
}

function getTag (buffers:Uint8Array[]):string {
    let tag = ''
    for (const buf of buffers) {
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

function compare (a:number[], b:Uint8Array|null):boolean {
    if (!b || a.length < b.length) return false
    for (let i = a.length - 1, j = b.length - 1; j >= 0; i--, j--) {
        if (lower(a[i]) !== lower(b[j])) return false
    }
    return true
}

function lower (n:number):number {
    return n >= 65 && n <= 90 ? n + 32 : n
}

function isWhiteSpace (b:number):boolean {
    return b === 0x20 || b === 0x09 || b === 0x0A || b === 0x0C || b === 0x0D
}

function testRaw (
    st:TokenizerState,
    buf:Uint8Array,
    offset:number,
    index:number
):[Uint8Array, Uint8Array]|undefined {
    if (!compare(st.last, st.raw)) return

    st.buffers.push(buf.slice(offset, index + 1))
    const _buf = concatUint8Arrays(st.buffers)
    const k = _buf.length - (st.raw?.length || 0)
    return [_buf.slice(0, k), _buf.slice(k)]
}

function pushState (
    st:TokenizerState,
    ev:'open'|'close'|'text',
    controller:TransformStreamDefaultController<Token>
):void {
    if (st.buffers.length === 0) return
    const buf = concatUint8Arrays(st.buffers)
    st.buffers = []
    controller.enqueue([ev, buf])
}

function processChunk (
    st:TokenizerState,
    chunk:Uint8Array,
    controller:TransformStreamDefaultController<Token>
):void {
    let buf = chunk
    let i = 0
    let offset = 0

    if (st.prev) {
        buf = concatUint8Arrays([st.prev, chunk])
        i = st.prev.length - 1
        offset = st.offset
        st.prev = null
        st.offset = 0
    }

    for (; i < buf.length; i++) {
        const b = buf[i]
        st.last.push(b)
        if (st.last.length > 9) st.last.shift()

        if (st.raw) {
            const parts = testRaw(st, buf, offset, i)
            if (parts) {
                controller.enqueue(['text', parts[0]])
                if (st.raw === strings.endComment || st.raw === strings.endCdata) {
                    st.state = 'text'
                    st.buffers = []
                    controller.enqueue(['close', parts[1]])
                } else {
                    st.state = 'open'
                    st.buffers = [parts[1]]
                }
                st.raw = null
                offset = i + 1
            }
        } else if (st.state === 'text' && b === codes.lt && i === buf.length - 1) {
            st.prev = buf
            st.offset = offset
            return
        } else if (st.state === 'text' && b === codes.lt && !isWhiteSpace(buf[i + 1])) {
            if (i > 0 && i - offset > 0) {
                st.buffers.push(buf.slice(offset, i))
            }
            offset = i
            st.state = 'open'
            st.tagState = states.TagNameState
            pushState(st, 'text', controller)
        } else if (st.tagState === states.TagNameState && isWhiteSpace(b)) {
            st.tagState = states.AttributeNameState
        } else if (st.tagState === states.AttributeNameState && b === codes.equal) {
            st.tagState = states.BeforeAttributeValueState
        } else if (st.tagState === states.BeforeAttributeValueState && !isWhiteSpace(b)) {
            st.tagState = states.AttributeValueState
            st.quoteState = b === codes.dquote ? 'double' : b === codes.squote ? 'single' : null
        } else if (st.tagState === states.AttributeValueState && st.quoteState === 'double' && b === codes.dquote) {
            st.quoteState = null
            st.tagState = states.AttributeNameState
        } else if (st.tagState === states.AttributeValueState && st.quoteState === 'single' && b === codes.squote) {
            st.quoteState = null
            st.tagState = states.AttributeNameState
        } else if (st.state === 'open' && b === codes.gt && !st.quoteState) {
            st.buffers.push(buf.slice(offset, i + 1))
            offset = i + 1
            st.state = 'text'
            st.tagState = null
            if (getChar(st.buffers, 1) === codes.slash) {
                pushState(st, 'close', controller)
            } else {
                const tag = getTag(st.buffers)
                if (tag === 'script') st.raw = strings.endScript
                if (tag === 'style') st.raw = strings.endStyle
                if (tag === 'title') st.raw = strings.endTitle
                pushState(st, 'open', controller)
            }
        }
    }

    if (offset < buf.length) st.buffers.push(buf.slice(offset))
}

/**
 * Create a tokenizer TransformStream for HTML
 */
export function createTokenizer ():TransformStream<Uint8Array, Token> {
    const st:TokenizerState = {
        state: 'text',
        tagState: null,
        quoteState: null,
        raw: null,
        buffers: [],
        last: [],
        prev: null,
        offset: 0
    }

    return new TransformStream<Uint8Array, Token>({
        transform (chunk, controller) {
            processChunk(st, chunk, controller)
        },
        flush (controller) {
            if (st.state === 'text') {
                pushState(st, 'text', controller)
            }
        }
    })
}

/**
 * Legacy class wrapper for compatibility
 */
export class Tokenize {
    private stream:TransformStream<Uint8Array, Token>
    readonly readable:ReadableStream<Token>
    readonly writable:WritableStream<Uint8Array>

    constructor () {
        this.stream = createTokenizer()
        this.readable = this.stream.readable
        this.writable = this.stream.writable
    }
}
