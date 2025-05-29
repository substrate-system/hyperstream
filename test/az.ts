import { test } from '@substrate-system/tapzero'
import hyperstream from '../src/index.js'
import Stream from 'stream'
import fs from 'fs'
import path from 'path'

const expected = fs.readFileSync(path.join(__dirname, 'az', 'expected.html'), 'utf8')

test('fs stream and a slow stream', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '#a': createAzStream(),
        '#b': fs.createReadStream(path.join(__dirname, 'az', 'b.html'))
    })
    let data = ''
    hs.on('data', function (buf) { data += buf })
    hs.on('end', function () {
        t.equal(data, expected)
    })

    const rs = fs.createReadStream(path.join(__dirname, 'az', 'index.html'))
    rs.pipe(hs)
})

function createAzStream () {
    const rs = new Stream()
    // @ts-expect-error: Stream.readable is not typed in node's Stream
    rs.readable = true
    let ix = 0
    const iv = setInterval(function () {
        rs.emit('data', String.fromCharCode(97 + ix))
        if (++ix === 26) {
            clearInterval(iv)
            rs.emit('end')
        }
    }, 25)
    return rs
}
