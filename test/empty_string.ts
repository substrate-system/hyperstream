import { test } from '@substrate-system/tapzero'
import { S } from '@substrate-system/stream'
import hyperstream from '../src/index.js'
import { processHtml } from './helpers.js'

const encoder = new TextEncoder()

test('queue an empty string', async function (t) {
    // Create a stream that emits: 'xy', '', 'z' with delays
    async function * chunks ():AsyncGenerator<Uint8Array> {
        await new Promise(resolve => setTimeout(resolve, 25))
        yield encoder.encode('xy')
        await new Promise(resolve => setTimeout(resolve, 25))
        yield encoder.encode('')
        await new Promise(resolve => setTimeout(resolve, 25))
        yield encoder.encode('z')
    }

    const stream = S.from(chunks()).toStream()

    const hs = hyperstream({ '.a': stream })
    const result = await processHtml(hs, '<div class="a"></div>')
    t.equal(result, '<div class="a">xyz</div>')
})
