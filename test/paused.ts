import { test } from '@substrate-system/tapzero'
import through from 'through'
import hyperstream from '../src/index.js'
import fs from 'fs'
import path from 'path'

const expected = fs.readFileSync(path.join(__dirname, 'none', 'index.html'), 'utf8')

test('paused output', function (t) {
    t.plan(1)

    const hs = hyperstream({})
    hs.pause()
    setTimeout(function () {
        hs.resume()
    }, 500)

    const rs = fs.createReadStream(path.join(__dirname, 'none', 'index.html'))

    let data = ''
    rs.pipe(hs).pipe(through(write, end))

    function write (buf) { data += buf }

    function end () {
        t.equal(data, expected)
    }
})
