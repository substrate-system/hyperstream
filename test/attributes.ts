import { test } from '@substrate-system/tapzero'
import hyperstream from '../src/index.js'
import concat from 'concat-stream'

const src = '<div><input value=""><span></span></div>'
const expected = '<div><input value="value"><span class="class"></span></div>'

test('attributes', function (t) {
    t.plan(1)
    const hs = hyperstream({
        input: { value: 'value' },
        span: { class: 'class' }
    })
    hs.pipe(concat(function (html) {
        t.equal(html.toString(), expected)
    }))
    hs.end(src)
})
