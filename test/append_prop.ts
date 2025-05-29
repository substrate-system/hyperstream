import hyperstream from '../src/index.js'
import { test } from '@substrate-system/tapzero'
import concat from 'concat-stream'

test('append property', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '.row': { class: { append: ' post' } }
    })
    hs.pipe(concat(function (body) {
        t.equal(
            body.toString('utf8'),
            '<div class="row post">so </div>'
        )
    }))
    hs.end('<div class="row">so </div>')
})

test('prepend property', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '.row': { class: { prepend: 'pre ' } }
    })
    hs.pipe(concat(function (body) {
        t.equal(
            body.toString('utf8'),
            '<div class="pre row">so </div>'
        )
    }))
    hs.end('<div class="row">so </div>')
})

test('append and prepend property', function (t) {
    t.plan(1)

    const hs = hyperstream({
        '.row': { class: { prepend: 'pre ', append: ' post' } }
    })
    hs.pipe(concat(function (body) {
        t.equal(
            body.toString('utf8'),
            '<div class="pre row post">so </div>'
        )
    }))
    hs.end('<div class="row">so </div>')
})

test('append and prepend empty property', function (t) {
    t.plan(1)

    const hs = hyperstream({
        div: { class: { prepend: 'pre ', append: ' post' } }
    })
    hs.pipe(concat(function (body) {
        t.equal(
            body.toString('utf8'),
            '<div class="pre  post">so </div>'
        )
    }))
    hs.end('<div>so </div>')
})

test('append property with empty string', function (t) {
    t.plan(1)

    const hs = hyperstream({
        div: { class: { append: '' } }
    })
    hs.pipe(concat(function (body) {
        t.equal(
            body.toString('utf8'),
            '<div class="row">so </div>'
        )
    }))
    hs.end('<div class="row">so </div>')
})

