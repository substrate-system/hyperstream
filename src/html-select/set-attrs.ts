import { parseTag } from './parse-tag.js'

export default function setAttrs (
    buf:Buffer,
    attrs:Record<string, string|boolean|undefined>
):string {
    const p = parseTag(buf)
    const xattrs = p.getAttributes()

    Object.keys(attrs).forEach(key => {
        xattrs[key] = attrs[key]!
    })

    const keys = Object.keys(xattrs).filter(key => {
        return xattrs[key] !== undefined
    })

    const parts = keys.map(key => {
        if (xattrs[key] === true) return key
        return `${key}="${esc(xattrs[key])}"`
    }).join(' ')

    return `<${p.name}${parts.length ? ' ' : ''}${parts}>`
}

function esc (s: string | boolean | undefined): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}
