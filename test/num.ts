import { test } from '@substrate-system/tapzero'
import through from 'through'
import hyperstream from '../src/index.js'
import fs from 'fs'
import path from 'path'

const expected = fs.readFileSync(path.join(__dirname, 'num', 'expected.html'), 'utf8')

test('num', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '#a': 5,
        '#b': 6,
        '#c': { n: 123 },
        '#c span': function (html) { return html.length }
    })
    const rs = fs.createReadStream(path.join(__dirname, 'num', 'index.html'))

    let data = ''
    rs.pipe(hs).pipe(through(write, end))

    function write (buf) { data += buf }

    function end () {
        t.equal(data, expected)
    }
})
