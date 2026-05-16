const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const path = require('path')

const db = new Database(path.join(__dirname, 'app.db'))

// Tables create
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    caption TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    group_id TEXT NOT NULL,
    sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`)

module.exports = {
  // User functions
  createUser: (id, username, password) => {
    const hash = bcrypt.hashSync(password, 10)
    return db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)').run(id, username, hash)
  },

  getAllUsers: () => {
    return db.prepare('SELECT id, username FROM users').all()
  },

  findUser: (username) => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  },

  findUserById: (id) => {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  },

  verifyPassword: (password, hash) => {
    return bcrypt.compareSync(password, hash)
  },

  // Posts functions
  getPosts: (userId) => {
    return db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY date, time').all(userId)
  },

  createPost: (id, userId, imageUrl, caption, date, time, groupId) => {
    return db.prepare('INSERT INTO posts (id, user_id, image_url, caption, date, time, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, userId, imageUrl, caption, date, time, groupId)
  },

  updatePost: (id, imageUrl, caption, date, time, groupId) => {
    return db.prepare('UPDATE posts SET image_url=?, caption=?, date=?, time=?, group_id=? WHERE id=?').run(imageUrl, caption, date, time, groupId, id)
  },

  deletePost: (id) => {
    return db.prepare('DELETE FROM posts WHERE id = ?').run(id)
  },

  markSent: (id) => {
    return db.prepare('UPDATE posts SET sent = 1 WHERE id = ?').run(id)
  },

  getPendingPosts: (date, time) => {
    return db.prepare('SELECT * FROM posts WHERE date = ? AND time = ? AND sent = 0').all(date, time)
  },

  getStats: (userId) => {
    const total = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(userId)
    const sent = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND sent = 1').get(userId)
    const pending = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ? AND sent = 0').get(userId)
    return { total: total.count, sent: sent.count, pending: pending.count }
  }
}