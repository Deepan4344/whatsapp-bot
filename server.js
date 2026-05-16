const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const express = require('express')
const cron = require('node-cron')
const qrcode = require('qrcode')
const session = require('express-session')
const { v4: uuidv4 } = require('uuid')
const db = require('./database')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json())
app.use(express.static('public'))
app.use(session({
    secret: 'whatsapp-secret-123',
    resave: false,
    saveUninitialized: false
}))

// Multi-user WhatsApp clients store
const clients = {}

// Auth middleware
function auth(req, res, next) {
    if (req.session.userId) return next()
    res.status(401).json({ success: false, message: 'Login பண்ணுங்க!' })
}

// Create WhatsApp client for user
async function createClient(userId) {
    if (clients[userId]) return clients[userId]

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: userId }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    })

    clients[userId] = {
        client,
        status: 'disconnected',
        qr: null
    }

    client.on('qr', async (qr) => {
        clients[userId].status = 'qr'
        clients[userId].qr = await qrcode.toDataURL(qr)
    })

    client.on('ready', () => {
        clients[userId].status = 'connected'
        clients[userId].qr = null
        console.log(`✅ User ${userId} WhatsApp Connected!`)
    })

    client.on('disconnected', () => {
        clients[userId].status = 'disconnected'
        clients[userId].qr = null
    })

    await client.initialize()
    return clients[userId]
}

// Scheduler — every minute check
cron.schedule('* * * * *', async () => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')

    const pendingPosts = db.getPendingPosts(todayStr, timeStr)

    for (const post of pendingPosts) {
        const userClient = clients[post.user_id]
        if (userClient && userClient.status === 'connected') {
            try {
                const media = await MessageMedia.fromUrl(post.image_url)
                await userClient.client.sendMessage(post.group_id, media, { caption: post.caption })
                db.markSent(post.id)
                console.log(`✅ Posted for user ${post.user_id}`)
            } catch (err) {
                console.log(`❌ Error: ${err.message}`)
            }
        }
    }
})

// ===== AUTH APIs =====

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body
        if (!username || !password) return res.json({ success: false, message: 'Username & Password வேணும்!' })
        
        const existing = db.findUser(username)
        if (existing) return res.json({ success: false, message: 'Username already exists!' })

        const id = uuidv4()
        db.createUser(id, username, password)
        req.session.userId = id
        req.session.username = username
        res.json({ success: true })
    } catch (err) {
        res.json({ success: false, message: err.message })
    }
})

app.post('/api/login', (req, res) => {
    const { username, password } = req.body
    const user = db.findUser(username)
    if (!user || !db.verifyPassword(password, user.password)) {
        return res.json({ success: false, message: 'Wrong username or password!' })
    }
    req.session.userId = user.id
    req.session.username = user.username
    res.json({ success: true, username: user.username })
})

app.post('/api/logout', (req, res) => {
    req.session.destroy()
    res.json({ success: true })
})

app.get('/api/check-auth', (req, res) => {
    res.json({ 
        loggedIn: !!req.session.userId,
        username: req.session.username 
    })
})

// ===== WHATSAPP APIs =====

app.post('/api/whatsapp/connect', auth, async (req, res) => {
    try {
        await createClient(req.session.userId)
        res.json({ success: true })
    } catch (err) {
        res.json({ success: false, message: err.message })
    }
})

app.get('/api/whatsapp/status', auth, (req, res) => {
    const userClient = clients[req.session.userId]
    if (!userClient) return res.json({ status: 'disconnected', qr: null })
    res.json({ status: userClient.status, qr: userClient.qr })
})

app.get('/api/whatsapp/groups', auth, async (req, res) => {
    try {
        const userClient = clients[req.session.userId]
        if (!userClient || userClient.status !== 'connected') {
            return res.json({ success: false, message: 'WhatsApp connect பண்ணுங்க!' })
        }
        const chats = await userClient.client.getChats()
        const groups = chats
            .filter(c => c.isGroup)
            .map(c => ({ id: c.id._serialized, name: c.name }))
        res.json({ success: true, groups })
    } catch (err) {
        res.json({ success: false, message: err.message })
    }
})

// ===== POSTS APIs =====

app.get('/api/posts', auth, (req, res) => {
    const posts = db.getPosts(req.session.userId)
    res.json(posts)
})

app.post('/api/posts', auth, (req, res) => {
    try {
        const { imageUrl, caption, date, time, groupId } = req.body
        const id = uuidv4()
        db.createPost(id, req.session.userId, imageUrl, caption, date, time, groupId)
        res.json({ success: true, message: '✅ Saved!' })
    } catch (err) {
        res.json({ success: false, message: err.message })
    }
})

app.put('/api/posts/:id', auth, (req, res) => {
    const { imageUrl, caption, date, time, groupId } = req.body
    db.updatePost(req.params.id, imageUrl, caption, date, time, groupId)
    res.json({ success: true })
})

app.delete('/api/posts/:id', auth, (req, res) => {
    db.deletePost(req.params.id)
    res.json({ success: true })
})

// ===== SEND APIs =====

app.post('/api/send', auth, async (req, res) => {
    const { imageUrl, caption, groupId } = req.body
    console.log('[/api/send] Request received:', { userId: req.session.userId, groupId, imageUrl, captionLength: caption?.length })
    try {
        const userClient = clients[req.session.userId]
        console.log('[/api/send] Client lookup:', userClient ? `status=${userClient.status}` : 'NOT FOUND')
        if (!userClient || userClient.status !== 'connected') {
            console.log('[/api/send] Rejected: client not connected')
            return res.json({ success: false, message: 'WhatsApp connect பண்ணுங்க!' })
        }
        console.log('[/api/send] Client found and connected. Fetching media from URL:', imageUrl)
        const media = await MessageMedia.fromUrl(imageUrl)
        console.log('[/api/send] Media fetched:', { mimetype: media.mimetype, dataLength: media.data?.length })
        console.log('[/api/send] Calling sendMessage to groupId:', groupId)
        await userClient.client.sendMessage(groupId, media, { caption })
        console.log('[/api/send] sendMessage completed successfully')
        res.json({ success: true, message: '✅ Posted!' })
    } catch (err) {
        console.error('[/api/send] Error:', err.message)
        console.error('[/api/send] Stack:', err.stack)
        res.json({ success: false, message: err.message })
    }
})

// ===== STATS API =====

app.get('/api/stats', auth, (req, res) => {
    const stats = db.getStats(req.session.userId)
    const userClient = clients[req.session.userId]
    stats.whatsappStatus = userClient ? userClient.status : 'disconnected'
    res.json(stats)
})

app.listen(3000, () => console.log('🌐 http://localhost:3000'))