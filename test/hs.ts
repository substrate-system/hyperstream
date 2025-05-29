import { test } from '@substrate-system/tapzero'
import through from 'through'
import hyperstream from '../src/index.js'
import fs from 'fs'
import path from 'path'

const expected = fs.readFileSync(path.join(__dirname, 'hs', 'expected.html'), 'utf8')

test('glue html streams from disk', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '#a': fs.createReadStream(path.join(__dirname, 'hs', 'a.html')),
        '#b': fs.createReadStream(path.join(__dirname, 'hs', 'b.html'))
    })
    const rs = fs.createReadStream(path.join(__dirname, 'hs', 'index.html'))

    let data = ''
    rs.pipe(hs).pipe(through(write, end))

    function write (buf) { data += buf }

    function end () {
        t.equal(data, expected)
    }
})
