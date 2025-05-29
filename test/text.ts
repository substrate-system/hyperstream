import hyperstream from '../src/index.js'
import { test } from '@substrate-system/tapzero'
import concat from 'concat-stream'
import through from 'through2'
import ent from 'ent'

test('string _text', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '.row': { _text: '<b>beep boop</b>' }
    })
    hs.pipe(concat(function (body) {
        t.equal(
            body.toString('utf8'),
            '<div class="row">' +
                ent.encode('<b>beep boop</b>') +
                '</div>'
        )
    }))
    hs.end('<div class="row"></div>')
})

test('stream _text', function (t) {
    t.plan(1)
    const stream = through()
    stream.push('<b>beep boop</b>')
    stream.push(null)

    const hs = hyperstream({
        '.row': { _text: stream }
    })
    hs.pipe(concat(function (body) {
        t.equal(
            body.toString('utf8'),
            '<div class="row">' +
                ent.encode('<b>beep boop</b>') +
                '</div>'
        )
    }))
    hs.end('<div class="row"></div>')
})
