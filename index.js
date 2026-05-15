const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const cron = require('node-cron')

const client = new Client({
    authStrategy: new LocalAuth()
})

const GROUP_ID = '120363409966359858@g.us'

const posts = [
    {
        image: 'https://mockup.aurotec.in/mockup/PrincyHub/Insta%20Poster/1%20with%20out%20inventory.jpg',
        caption: 'How to Start a Clothing Brand in India Without Inventory'
    },
    {
        image: 'https://mockup.aurotec.in/mockup/PrincyHub/Insta%20Poster/2%20what%20is%20print%20on%20demand.jpg',
        caption: 'What is Print-on-Demand and How Does It Work?'
    },
    {
        image: 'https://mockup.aurotec.in/mockup/PrincyHub/Insta%20Poster/3%20Best%20Print-on-Demand%20Platform%20in%20India%20for%20Startups.jpg',
        caption: 'Best Print-on-Demand Platform in India for Startups'
    },

]

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true })
})

client.on('ready', async () => {
    console.log('✅ Connected! Scheduler ready!')

    cron.schedule('45 15 * * *', async () => {
        const dayIndex = new Date().getDate() % posts.length
        const post = posts[dayIndex]

        const media = await MessageMedia.fromUrl(post.image)
        await client.sendMessage(GROUP_ID, media, {
            caption: post.caption
        })
        console.log('✅ Posted!')
    }, {
        timezone: 'Asia/Kolkata'
    })
})

client.initialize()