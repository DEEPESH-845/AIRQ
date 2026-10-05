// AIRQ web push: one function, two jobs.
//  - HTTP (API Gateway, via CloudFront /api/*): subscribe / unsubscribe a browser to a district
//  - SNS (arq-smog-raids): send a push to every browser watching the raided district
import { createHash } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { gunzipSync } from 'node:zlib'
import { FIRE_KM, FIRE_MIN, newFiresNear } from './fires.mjs'
import webpush from 'web-push'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE = process.env.TABLE
webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE)

const DISTRICT = /^d\d{3}$/
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32)
const res = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// validate at the trust boundary: only well-formed Web Push subscriptions for real district ids
function parse(body) {
  let b
  try {
    b = JSON.parse(body ?? '')
  } catch {
    return null
  }
  const s = b?.sub
  const ok =
    DISTRICT.test(b?.d ?? '') &&
    typeof s?.endpoint === 'string' &&
    s.endpoint.startsWith('https://') &&
    s.endpoint.length < 1000 &&
    typeof s?.keys?.p256dh === 'string' &&
    typeof s?.keys?.auth === 'string' &&
    s.keys.p256dh.length < 200 &&
    s.keys.auth.length < 100
  return ok ? { d: b.d, sub: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } } } : null
}

async function http(event) {
  const method = event.requestContext.http.method
  const p = parse(event.body)
  if (!p) return res(400, { error: 'Send a district id and a valid push subscription.' })
  const key = { d: p.d, e: hash(p.sub.endpoint) }
  if (method === 'DELETE') {
    await db.send(new DeleteCommand({ TableName: TABLE, Key: key }))
    return res(200, { ok: true })
  }
  const ttl = Math.floor(Date.now() / 1000) + 60 * 24 * 3600
  await db.send(new PutCommand({ TableName: TABLE, Item: { ...key, sub: p.sub, ttl } }))
  // a welcome push proves the pipe works end to end
  await webpush
    .sendNotification(p.sub, JSON.stringify({ title: 'AIRQ alerts are on', body: 'We will warn you before smog reaches this district.', url: `/?d=${p.d}` }))
    .catch(() => {})
  return res(200, { ok: true })
}

function message(r) {
  const where = `${r.n}, ${r.s}`
  const what = r.dust ? 'Dust storm' : 'Smog raid'
  if (r.kind === 'now') return { title: `${what} in ${r.n}`, body: `${where} just crossed AQI ${r.aqi}. Close windows and wear an N95 outdoors.` }
  return {
    title: `${what} incoming: ${r.n}`,
    body: `AQI in ${where} is forecast to reach ${r.aqi} in about ${r.etaH} h. Plan indoor time and keep windows shut.`,
  }
}

async function raids(event) {
  let sent = 0
  for (const rec of event.Records) {
    const detail = JSON.parse(rec.Sns.Message).detail
    if (!DISTRICT.test(detail?.id ?? '')) continue
    const { Items = [] } = await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: 'd = :d', ExpressionAttributeValues: { ':d': detail.id } }))
    const payload = JSON.stringify({ ...message(detail), url: `/?d=${detail.id}` })
    await Promise.all(
      Items.map((it) =>
        webpush.sendNotification(it.sub, payload, { TTL: 6 * 3600, urgency: 'high' }).then(
          () => sent++,
          (err) => (err.statusCode === 404 || err.statusCode === 410 ? db.send(new DeleteCommand({ TableName: TABLE, Key: { d: it.d, e: it.e } })) : console.warn('push failed', err.statusCode)),
        ),
      ),
    )
  }
  return { sent }
}

// ---------- fire near you: after each world tick, new satellite fires close to districts people watch
const s3 = new S3Client({})
const FIRE_GAP_H = 12 // at most one fire alert per district per 12 h

async function fireAlerts() {
  const raw = Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket: process.env.BUCKET, Key: 'data/world.json' }))).Body.transformToByteArray())
  const world = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString())
  const byId = new Map(world.districts.map((d) => [d.id, d]))
  const subs = new Map()
  let start
  do {
    const r = await db.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: start }))
    for (const it of r.Items ?? []) if (DISTRICT.test(it.d)) subs.set(it.d, [...(subs.get(it.d) ?? []), it])
    start = r.LastEvaluatedKey
  } while (start)
  const now = Date.now()
  let sent = 0
  for (const [id, items] of subs) {
    const d = byId.get(id)
    if (!d) continue
    const n = newFiresNear(d.c, world.fires)
    if (n < FIRE_MIN) continue
    const last = (await db.send(new GetCommand({ TableName: TABLE, Key: { d: 'meta#fire', e: id } }))).Item
    if (last && now - last.at < FIRE_GAP_H * 3600e3) continue
    await db.send(new PutCommand({ TableName: TABLE, Item: { d: 'meta#fire', e: id, at: now, ttl: Math.floor(now / 1000) + 2 * 86400 } }))
    const payload = JSON.stringify({
      title: `${n} new farm fires near ${d.n}`,
      body: `NASA satellites saw ${n} fires within ${FIRE_KM} km in the last few hours. If the wind turns your way, smoke can arrive within a day.`,
      url: `/?d=${id}`,
    })
    await Promise.all(
      items.map((it) =>
        webpush.sendNotification(it.sub, payload, { TTL: 6 * 3600 }).then(
          () => sent++,
          (err) => (err.statusCode === 404 || err.statusCode === 410 ? db.send(new DeleteCommand({ TableName: TABLE, Key: { d: it.d, e: it.e } })) : null),
        ),
      ),
    )
  }
  return { districts: subs.size, sent }
}

export const handler = (event) => (event.job === 'fires' ? fireAlerts() : event.Records?.[0]?.Sns ? raids(event) : http(event))
