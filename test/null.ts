import hyperstream from '../src/index.js'
import { test } from '@substrate-system/tapzero'
import concat from 'concat-stream'

test('null value', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '.row': null
    })
    hs.pipe(concat(function (body) {
        t.equal(
            body.toString('utf8'),
            '<div class="row"></div>'
        )
    }))
    hs.end('<div class="row"></div>')
})
