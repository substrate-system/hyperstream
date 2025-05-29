import { test } from '@substrate-system/tapzero'
import concat from 'concat-stream'
import http from 'http'
import through from 'through'
import hyperstream from '../src/index.js'
import hyperquest from 'hyperquest'

test('queue an empty string to an http response', function (t) {
    t.plan(1)

    const server = http.createServer(function (req, res) {
        createStream().pipe(res)
    })
    server.listen(function () {
        const address = server.address()
        if (address && typeof address !== 'string') {
            const port = address.port
            const hq = hyperquest('http://localhost:' + port)
            hq.pipe(concat(function (src) {
                t.equal(String(src), '<div class="a">xyz</div>')
            }))
        }
    })
})

function createStream () {
    const stream = through()
    const hs = hyperstream({ '.a': stream })
    const rs = through().pause()
    rs.pipe(hs)
    rs.queue('<div class="a"></div>')
    rs.queue(null)

    process.nextTick(function () {
        rs.resume()
    })

    setTimeout(function () {
        stream.queue('xy')
    }, 25)
    setTimeout(function () {
        stream.queue('')
    }, 50)
    setTimeout(function () {
        stream.queue('z')
    }, 75)
    setTimeout(function () {
        stream.queue(null)
    }, 100)

    return hs
}
