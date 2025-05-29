import { test } from '@substrate-system/tapzero'
const through = require('through')
const hyperstream = require('../')

const fs = require('fs')
const expected = fs.readFileSync(__dirname + '/string/expected.html', 'utf8')

test('glue html streams from disk', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '#a': fs.createReadStream(__dirname + '/string/a.html'),
        '#b': fs.createReadStream(__dirname + '/string/b.html'),
        'head title': 'beep boop',
        '#c span': function (html) { return html.toUpperCase() }
    })
    const rs = fs.createReadStream(__dirname + '/string/index.html')

    let data = ''
    rs.pipe(hs).pipe(through(write, end))

    function write (buf) { data += buf }

    function end () {
        t.equal(data, expected)
    }
})
