export function parseTag (buf:Buffer|string):{
    name:string,
    getAttributes:() => Record<string, string|boolean>
} {
    if (typeof buf === 'string') {
        buf = Buffer.from(buf)
    }

    const closing = buf[1] === '/'.charCodeAt(0)
    const start = closing ? 2 : 1
    let name:string | undefined
    let i:number

    for (i = start; i < buf.length; i++) {
        const c = String.fromCharCode(buf[i])
        if (/[\s>/]/.test(c)) {
            name = buf.slice(start, i).toString('utf8').toLowerCase()
            break
        }
    }

    let attr:Record<string, string|boolean>|undefined

    function getAttributes ():Record<string, string|boolean> {
        if (attr) return attr
        attr = parse(buf as Buffer, i)
        return attr
    }

    if (!name) {
        name = ''
    }

    return {
        name,
        getAttributes
    }
}

function parse (buf: Buffer, i: number): Record<string, string | boolean> {
    const attr: Record<string, string | boolean> = {}
    const s = buf.slice(i, buf.length - 1).toString('utf8')
    const parts = s.match(/[^\s=/]+\s*=\s*("[^"]+"|'[^']+'|\S+)|[^\s=/]+/g) || []
    let key:string, value:string | boolean

    for (let j = 0; j < parts.length; j++) {
        const kv = parts[j].split('=')
        key = kv[0].toLowerCase().trim()
        if (kv.length > 1) {
            value = kv.slice(1).join('=')
            if (/^\s*"/.test(value)) {
                value = value.replace(/^\s*"/, '').replace(/"\s*$/, '')
            } else if (/^\s*'/.test(value)) {
                value = value.replace(/^\s*'/, '').replace(/'\s*$/, '')
            } else value = value.trim()
        } else value = true
        attr[key] = value
    }
    return attr
}

export default parseTag
