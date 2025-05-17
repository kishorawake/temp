// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: '*' } });

const upload = multer({ dest: 'uploads/' });
app.use(cors());
app.use(express.static('uploads'));
app.use(express.static(path.join(__dirname, '../frontend')));

const users = new Map(); // socketId -> user object

io.on('connection', (socket) => {

  socket.on('register user', ({ email, name, avatar }) => {
    db.prepare(`
      INSERT INTO users (email, name, avatar)
      VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        avatar = excluded.avatar,
        last_seen = strftime('%s', 'now')
    `).run(email, name, avatar);

    const user = db.prepare(`SELECT id, name, avatar FROM users WHERE email = ?`).get(email);
    users.set(socket.id, { ...user, socketId: socket.id, email });

    io.emit('user list', Array.from(users.values()));
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    io.emit('user list', Array.from(users.values()));
  });

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });

  socket.on('typing', (user) => {
    socket.broadcast.emit('typing', user);
  });

  socket.on('private typing', ({ to }) => {
    const receiver = [...users.values()].find(u => u.name === to);
    if (receiver) {
      socket.to(receiver.socketId).emit('private typing', { from: users.get(socket.id)?.name });
    }
  });

  socket.on('image upload', (data) => {
    io.emit('image upload', data);
  });

  socket.on('private message', ({ toSocketId, message }) => {
    const sender = users.get(socket.id);
    const receiver = users.get(toSocketId);

    if (sender && receiver) {
      db.prepare(`
        INSERT INTO private_messages (sender_id, receiver_id, message, timestamp)
        VALUES (?, ?, ?, ?)
      `).run(sender.id, receiver.id, message, Date.now());

      socket.to(toSocketId).emit('private message', {
        from: sender.name,
        message
      });
    }
  });

  socket.on('load private chat', ({ user1Email, user2Email }, callback) => {
    const user1 = db.prepare('SELECT id FROM users WHERE email = ?').get(user1Email);
    const user2 = db.prepare('SELECT id FROM users WHERE email = ?').get(user2Email);

    if (!user1 || !user2) return callback([]);

    const stmt = db.prepare(`
      SELECT pm.*, u1.name as sender_name, u1.avatar as sender_avatar,
             u2.name as receiver_name, u2.avatar as receiver_avatar
      FROM private_messages pm
      JOIN users u1 ON pm.sender_id = u1.id
      JOIN users u2 ON pm.receiver_id = u2.id
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY timestamp ASC
    `);
    const history = stmt.all(user1.id, user2.id, user2.id, user1.id);
    callback(history);
  });

  socket.on('find user by name', (name, callback) => {
    const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
    callback(user || null);
  });

  // ✅ WebRTC Signaling: Offer
  socket.on('call user', ({ to, offer }) => {
    const receiver = [...users.values()].find(u => u.name === to);
    if (receiver) {
      socket.to(receiver.socketId).emit('offer', { from: users.get(socket.id)?.name, offer });
    }
  });

  // ✅ WebRTC Signaling: Answer
  socket.on('answer', ({ to, answer }) => {
    const receiver = [...users.values()].find(u => u.name === to);
    if (receiver) {
      socket.to(receiver.socketId).emit('answer', { from: users.get(socket.id)?.name, answer });
    }
  });

  // ✅ WebRTC Signaling: ICE Candidate
  socket.on('ice-candidate', ({ to, candidate }) => {
    const receiver = [...users.values()].find(u => u.name === to);
    if (receiver) {
      socket.to(receiver.socketId).emit('ice-candidate', { from: users.get(socket.id)?.name, candidate });
    }
  });

  // ✅ WebRTC Signaling: Call Decline
  socket.on('call declined', ({ to }) => {
    const receiver = [...users.values()].find(u => u.name === to);
    if (receiver) {
      socket.to(receiver.socketId).emit('call declined', { from: users.get(socket.id)?.name });
    }
  });

});

app.post('/upload', upload.single('file'), (req, res) => {
  const filename = req.file.filename;
  const fileUrl = `${req.protocol}://${req.headers.host}/${filename}`;

  db.prepare(`
    INSERT INTO uploads (filename, timestamp)
    VALUES (?, ?)
  `).run(filename, Date.now());

  res.json({ fileUrl });
});

setInterval(() => {
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;

  db.prepare(`DELETE FROM private_messages WHERE timestamp < ?`).run(cutoff);

  const expiredFiles = db.prepare(`SELECT filename FROM uploads WHERE timestamp < ?`).all(cutoff);
  expiredFiles.forEach(({ filename }) => {
    fs.unlink(path.join(__dirname, 'uploads', filename), (err) => {
      if (!err) console.log(`🧹 Deleted expired file: ${filename}`);
    });
  });

  db.prepare(`DELETE FROM uploads WHERE timestamp < ?`).run(cutoff);
}, 3600000); // cleanup every hour

server.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
