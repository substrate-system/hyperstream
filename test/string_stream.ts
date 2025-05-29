import { test } from '@substrate-system/tapzero'
const concat = require('concat-stream')
const through = require('through')
const hyperstream = require('../')

test('string before a stream', function (t) {
    t.plan(1)
    const SIZE = 50
    const stream = through()

    const hs = hyperstream({
        '.a': Array(SIZE).join('THEBEST'),
        '.b': stream
    })
    const rs = through()
    rs.pipe(hs).pipe(concat(function (src) {
        t.equal(src.toString(), [
            '<div class="a">' + Array(SIZE).join('THEBEST') + '</div>',
            '<div class="b">onetwothreefourfive</div>'
        ].join(''))
    }))
    rs.queue('<div class="a"></div><div class="b"></div>')
    rs.queue(null)

    setTimeout(function () {
        stream.queue('one')
        stream.queue('two')
    }, 25)
    setTimeout(function () {
        stream.queue('three')
    }, 50)
    setTimeout(function () {
        stream.queue('four')
        stream.queue('five')
        stream.queue(null)
    }, 75)
})
