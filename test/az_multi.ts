import { test } from '@substrate-system/tapzero'
import hyperstream from '../src/index.js'
import through from 'through'
import concat from 'concat-stream'
import fs from 'fs'
import path from 'path'

const expected = fs.readFileSync(path.join(__dirname, 'az_multi', 'expected.html'), 'utf8')

test('fs stream and a slow stream', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '#a': createAzStream(),
        '#b': fs.createReadStream(path.join(__dirname, 'az_multi', 'b.html')),
        '#c': createAzStream(),
        '#d': fs.createReadStream(path.join(__dirname, 'az_multi', 'd.html'))
    })
    hs.pipe(concat(function (src) {
        t.equal(src.toString('utf8'), expected)
    }))

    const rs = fs.createReadStream(path.join(__dirname, 'az_multi', 'index.html'))
    rs.pipe(hs)
})

function createAzStream () {
    const rs = through()
    let ix = 0
    const iv = setInterval(function () {
        rs.queue(String.fromCharCode(97 + ix))
        if (++ix === 26) {
            clearInterval(iv)
            rs.queue(null)
        }
    }, 25)
    return rs
}
