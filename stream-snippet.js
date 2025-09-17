// this is a sample of something that I did last year, pretty simple and straight foward

const { Readable, Transform } = require('node:stream')
const { withParser } = require('stream-json/streamers/StreamArray')
const { pipeline } = require('node:stream/promises')
const { stringify } = require('csv-stringify')
const fs = require('fs')

const { startMemLogger } = require('./performance-logger')

const stop = startMemLogger()

// I DON'T LIKE "MAGIC NUMBERS"
const BASE_URL = 'https://jsonplaceholder.typicode.com'
const HTTP_OK = 200
const UTF8 = 'utf8'

const TODO_CSV_COLUMNS = {
    id: 'id',
    userId: 'userId',
    status: 'status',
    title: 'title',
}

const COMMENTS_CSV_COLUMNS = {
    postId: 'postId',
    id: 'id',
    name: 'name',
    email: 'email',
    body: 'body',
}

// I LIKE ENUMs
const TodoStatus = Object.freeze({
    DONE: 'DONE',
    PENDING: 'PENDING',
})

const startTodosPipeline = async () => {
    const resTodos = await fetch(`${BASE_URL}/todos`)
    if (resTodos.status !== HTTP_OK) {
        throw new Error(`Unexpected status ${resTodos.status} from ${BASE_URL}`)
    }

    const reader = Readable.fromWeb(resTodos.body)

    const mapTodo = new Transform({
        objectMode: true,
        transform({ value }, _enc, callback) {
            try {
                const { id, userId, completed, title } = value
                const status = completed ? TodoStatus.DONE : TodoStatus.PENDING
                callback(null, { id, userId, status, title })
            } catch (err) {
                callback(err)
            }
        },
    })

    const csvStringify = stringify({ header: true, columns: TODO_CSV_COLUMNS })

    const fileWriter = fs.createWriteStream('./todos.csv', {
        encoding: 'utf-8',
    })

    await pipeline(reader, withParser(), mapTodo, csvStringify, fileWriter)
}

const startCommentsPipeline = async () => {
    const resComments = await fetch(`${BASE_URL}/comments`)
    if (resComments.status !== HTTP_OK) {
        throw new Error(
            `Unexpected status ${resComments.status} from ${BASE_URL}`
        )
    }

    const reader = Readable.fromWeb(resComments.body)

    const mapPosts = new Transform({
        objectMode: true,
        transform({ value }, _enc, callback) {
            try {
                const { postId, id, name, email, body } = value
                const bodyStr = body.split('\n').join(' ')

                callback(null, { postId, id, name, email, body: bodyStr })
            } catch (err) {
                callback(err)
            }
        },
    })

    const csvStringify = stringify({
        header: true,
        columns: COMMENTS_CSV_COLUMNS,
    })

    const fileWriter = fs.createWriteStream('./comments.csv', {
        encoding: 'utf-8',
    })

    await pipeline(reader, withParser(), mapPosts, csvStringify, fileWriter)
}

async function main() {
    const responses = await Promise.allSettled([
        startTodosPipeline(),
        startCommentsPipeline(),
    ])

    responses.forEach((r) => {
        console.info(r.status)
    })
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => stop())
