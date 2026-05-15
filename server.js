const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const express = require('express')
const cron = require('node-cron')
const qrcode = require('qrcode')
const fs = require('fs')
const session = require('express-session')

const app = express()
app.use(express.json())
app.use(express.static('public'))
app.use(session({
    secret: 'whatsapp-secret-123',
    resave: false,
    saveUninitialized: false
}))

const GROUP_ID = '120363409966359858@g.us'
const POSTS_FILE = 'posts.json'
const LOGIN = { username: 'admin', password: 'admin123' }

let whatsappStatus = 'disconnected'
let qrCodeData = null

if (!fs.existsSync(POSTS_FILE)) {
    fs.writeFileSync(POSTS_FILE, JSON.stringify([]))
}

// Auth middleware
function auth(req, res, next) {
    if (req.session.loggedIn) return next()
    res.status(401).json({ success: false, message: 'Login பண்ணுங்க!' })
}

// WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
})

client.on('qr', async (qr) => {
    whatsappStatus = 'qr'
    qrCodeData = await qrcode.toDataURL(qr)
    console.log('QR Ready!')
})

client.on('ready', () => {
    whatsappStatus = 'connected'
    qrCodeData = null
    console.log('✅ WhatsApp Connected!')
    startScheduler()
})

client.on('disconnected', () => {
    whatsappStatus = 'disconnected'
    console.log('❌ Disconnected!')
})

function startScheduler() {
    cron.schedule('* * * * *', async () => {
        const posts = JSON.parse(fs.readFileSync(POSTS_FILE))
        const now = new Date()
        const todayStr = now.toISOString().split('T')[0]
        const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0')

        for (const post of posts) {
            if (post.date === todayStr && post.time === timeStr && !post.sent) {
                try {
                    const media = await MessageMedia.fromUrl(post.imageUrl)
                    await client.sendMessage(GROUP_ID, media, { caption: post.caption })
                    console.log('✅ Group Posted!')
                    post.sent = true
                    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2))
                } catch (err) {
                    console.log('❌ Error:', err.message)
                }
            }
        }
    })
}

// Login API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body
    if (username === LOGIN.username && password === LOGIN.password) {
        req.session.loggedIn = true
        res.json({ success: true })
    } else {
        res.json({ success: false, message: 'Wrong username or password!' })
    }
})

app.post('/api/logout', (req, res) => {
    req.session.destroy()
    res.json({ success: true })
})

app.get('/api/check-auth', (req, res) => {
    res.json({ loggedIn: !!req.session.loggedIn })
})

// WhatsApp Status API
app.get('/api/whatsapp-status', auth, (req, res) => {
    res.json({ status: whatsappStatus, qr: qrCodeData })
})

// Posts API
app.get('/api/posts', auth, (req, res) => {
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE))
    res.json(posts)
})

app.post('/api/posts', auth, (req, res) => {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(req.body, null, 2))
    res.json({ success: true, message: '✅ Saved!' })
})

// Send Now API
app.post('/api/send', auth, async (req, res) => {
    try {
        const { imageUrl, caption } = req.body
        const media = await MessageMedia.fromUrl(imageUrl)
        await client.sendMessage(GROUP_ID, media, { caption })
        console.log('✅ Group Sent!')
        res.json({ success: true, message: '✅ Group-ல Posted!' })
    } catch (err) {
        res.json({ success: false, message: err.message })
    }
})

// Dashboard Stats API
app.get('/api/stats', auth, (req, res) => {
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE))
    const total = posts.length
    const sent = posts.filter(p => p.sent).length
    const pending = posts.filter(p => !p.sent).length
    res.json({ total, sent, pending, whatsappStatus })
})

app.listen(3000, () => console.log('🌐 http://localhost:3000'))

client.initialize()