const { createClient } = require('@supabase/supabase-js')
const bcrypt = require('bcryptjs')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

module.exports = {
  // ===== USER FUNCTIONS =====

  createUser: async (id, username, password) => {
    const hash = bcrypt.hashSync(password, 10)
    const { error } = await supabase
      .from('users')
      .insert({ id, username, password_hash: hash })
    if (error) throw new Error(error.message)
  },

  findUser: async (username) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single()
    if (error) return null
    return data
  },

  findUserById: async (id) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return null
    return data
  },

  getAllUsers: async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, username')
    if (error) return []
    return data
  },

  verifyPassword: (password, hash) => {
    return bcrypt.compareSync(password, hash)
  },

  // ===== POSTS FUNCTIONS =====

  getPosts: async (userId) => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
    if (error) return []
    return data
  },

  createPost: async (id, userId, imageUrl, caption, date, time, groupId) => {
    const { error } = await supabase
      .from('posts')
      .insert({
        id,
        user_id: userId,
        image_url: imageUrl,
        caption,
        date,
        time,
        group_id: groupId,
        sent: false
      })
    if (error) throw new Error(error.message)
  },

  updatePost: async (id, imageUrl, caption, date, time, groupId) => {
    const { error } = await supabase
      .from('posts')
      .update({ image_url: imageUrl, caption, date, time, group_id: groupId })
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  deletePost: async (id) => {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  markSent: async (id) => {
    const { error } = await supabase
      .from('posts')
      .update({ sent: true })
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  getPendingPosts: async (date, time) => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('date', date)
      .eq('time', time)
      .eq('sent', false)
    if (error) return []
    return data
  },

  getStats: async (userId) => {
    const { data: allPosts } = await supabase
      .from('posts')
      .select('sent')
      .eq('user_id', userId)

    if (!allPosts) return { total: 0, sent: 0, pending: 0 }

    const total = allPosts.length
    const sent = allPosts.filter(p => p.sent).length
    const pending = allPosts.filter(p => !p.sent).length

    return { total, sent, pending }
  }
}
