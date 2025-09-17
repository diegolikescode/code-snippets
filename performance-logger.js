const fs = require('node:fs')
const v8 = require('node:v8')
const perf = require('node:perf_hooks')

function mb(x) {
    return (x / 1024 / 1024).toFixed(1)
}

function gcKindName(kind) {
    if (!gcKindName.map) {
        gcKindName.map = {}
        for (const [k, v] of Object.entries(perf.constants)) {
            if (k.startsWith('NODE_PERFORMANCE_GC_')) {
                gcKindName.map[v] = k
                    .replace('NODE_PERFORMANCE_GC_', '')
                    .toLowerCase()
            }
        }
    }
    return gcKindName.map[kind] || String(kind)
}

function startMemLogger({
    intervalMs = 1000,
    path = './mem.log',
    heapSpacesEvery = 5,
} = {}) {
    const out = fs.createWriteStream(path, { flags: 'a' })

    const hasELDelay = typeof perf.monitorEventLoopDelay === 'function'
    const h = hasELDelay ? perf.monitorEventLoopDelay({ resolution: 20 }) : null
    if (h) h.enable()

    const gcObs = new perf.PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
            const m = process.memoryUsage()
            out.write(
                `[GC] kind=${gcKindName(e.kind)} duration=${e.duration.toFixed(2)}ms ` +
                    `heapUsed=${mb(m.heapUsed)}MB rss=${mb(m.rss)}MB\n`
            )
        }
    })
    gcObs.observe({ entryTypes: ['gc'], buffered: false })

    let lastHeap = process.memoryUsage().heapUsed
    let lastTs = perf.performance.now()
    let tick = 0

    const timer = setInterval(() => {
        const now = perf.performance.now()
        const m = process.memoryUsage()
        const r = process.resourceUsage?.()
        const dt = Math.max(1e-9, (now - lastTs) / 1000)
        const allocRateMBs = (
            (m.heapUsed - lastHeap) /
            1024 /
            1024 /
            dt
        ).toFixed(2)

        const p95 = h ? (h.percentile(95) / 1e6).toFixed(2) : 'n/a'
        const p99 = h ? (h.percentile(99) / 1e6).toFixed(2) : 'n/a'

        out.write(
            `[MEM] rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB ` +
                `heapTotal=${mb(m.heapTotal)}MB ext=${mb(m.external)}MB ` +
                (r ? `maxRSS=${(r.maxRSS / 1024).toFixed(1)}MB ` : '') +
                `allocRate=${allocRateMBs}MB/s ` +
                (eluDelta
                    ? `ELU=${(eluDelta.utilization * 100).toFixed(1)}% `
                    : '') +
                `loopDelay_p95=${p95}ms loopDelay_p99=${p99}ms ` +
                `uptime=${process.uptime().toFixed(1)}s\n`
        )

        if (++tick % heapSpacesEvery === 0) {
            const spaces = v8
                .getHeapSpaceStatistics()
                .map((s) => `${s.space_name}=${mb(s.space_used_size)}MB`)
                .join(' ')
            out.write(`[HEAP-SPACES] ${spaces}\n`)
            if (h) h.reset()
        }

        lastHeap = m.heapUsed
        lastTs = now
    }, intervalMs).unref()

    return () => {
        clearInterval(timer)
        gcObs.disconnect()
        if (h) h.disable()
        out.end()
    }
}

module.exports = { startMemLogger }
