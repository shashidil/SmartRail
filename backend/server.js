import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'data.json');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize Database
const initDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    const initialData = {
      users: [
        { id: 1, username: 'nirmal', password: 'user123', role: 'user', balance: 500 },
        { id: 2, username: 'admin', password: 'admin_rail_2024', role: 'admin' }
      ],
      transactions: [],
      routes: [
        { id: 1, name: 'Main Line', stations: 'Colombo Fort (0km) ⇄ Badulla (290km)', baseFare: 250, perKm: 5, totalKm: 290 },
        { id: 2, name: 'Coast Line', stations: 'Colombo Fort (0km) ⇄ Beliatta (187km)', baseFare: 150, perKm: 3, totalKm: 187 },
        { id: 3, name: 'Northern Line', stations: 'Polgahawela (72km) ⇄ KKS (411km)', baseFare: 400, perKm: 4, totalKm: 339 },
        { id: 4, name: 'Kelani Valley Line', stations: 'Maradana (2km) ⇄ Avissawella (59km)', baseFare: 100, perKm: 2, totalKm: 57 },
        { id: 5, name: 'Puttalam Line', stations: 'Ragama (13km) ⇄ Puttalam (133km)', baseFare: 180, perKm: 3, totalKm: 120 },
        { id: 6, name: 'Batticaloa Line', stations: 'Gal Oya (224km) ⇄ Batticaloa (347km)', baseFare: 300, perKm: 4, totalKm: 123 },
        { id: 7, name: 'Trincomalee Line', stations: 'Gal Oya (224km) ⇄ Trincomalee (295km)', baseFare: 300, perKm: 4, totalKm: 71 },
        { id: 8, name: 'Matale Line', stations: 'Peradeniya (113km) ⇄ Matale (146km)', baseFare: 80, perKm: 2, totalKm: 33 },
        { id: 9, name: 'Talaimannar Line', stations: 'Medawachchiya (229km) ⇄ Talaimannar (335km)', baseFare: 220, perKm: 3, totalKm: 106 },
      ]
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
  }
};

const getData = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const saveData = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

initDB();

// Routes
app.get('/', (req, res) => {
  res.send('SmartRail API Running with Persistence...');
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  const data = getData();
  const existingUser = data.users.find(u => u.username === username);

  if (existingUser) {
    return res.status(400).json({ success: false, message: 'Passenger ID already registered' });
  }

  const newUser = {
    id: data.users.length + 1,
    username,
    password, 
    role: 'user',
    balance: 0 
  };

  data.users.push(newUser);
  saveData(data);

  res.json({
    success: true,
    user: { id: newUser.id, username: newUser.username, role: newUser.role, balance: 0 },
    token: 'jwt-' + Math.random().toString(36).substring(7)
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const data = getData();
  const user = data.users.find(u => u.username === username && u.password === password);

  if (user) {
    res.json({
      success: true,
      user: { id: user.id, username: user.username, role: user.role, balance: user.balance || 0 },
      token: 'jwt-' + Date.now()
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.get('/api/history/:userId', (req, res) => {
  const data = getData();
  const history = data.transactions
    .filter(t => t.userId === parseInt(req.params.userId))
    .sort((a, b) => b.id - a.id)
    .slice(0, 10);
  res.json({ success: true, history });
});

app.get('/api/users', (req, res) => {
  const data = getData();
  const safeUsers = data.users.filter(u => u.role === 'user').map(({password, ...u}) => u);
  res.json({ success: true, users: safeUsers });
});

app.get('/api/routes', (req, res) => {
  const data = getData();
  res.json({ success: true, routes: data.routes });
});

app.put('/api/routes/:id', (req, res) => {
  const data = getData();
  const { baseFare, perKm } = req.body;
  const idx = data.routes.findIndex(r => r.id === parseInt(req.params.id));
  
  if (idx !== -1) {
    data.routes[idx].baseFare = Number(baseFare);
    data.routes[idx].perKm = Number(perKm);
    saveData(data);
    res.json({ success: true, route: data.routes[idx] });
  } else {
    res.status(404).json({ success: false, message: 'Route not found' });
  }
});

app.post('/api/topup', (req, res) => {
  const { userId, amount } = req.body;
  const data = getData();
  const userIdx = data.users.findIndex(u => u.id === userId);
  
  if (userIdx !== -1) {
    data.users[userIdx].balance = (data.users[userIdx].balance || 0) + Number(amount);
    
    data.transactions.push({
      id: Date.now(),
      userId,
      type: 'credit',
      title: 'Card Recharge',
      amount: Number(amount),
      date: new Date().toLocaleDateString() + ', ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    saveData(data);
    res.json({ success: true, balance: data.users[userIdx].balance });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

app.post('/api/rfid/tap', (req, res) => {
  const { userId, amount } = req.body; 
  const data = getData();
  const userIdx = data.users.findIndex(u => u.id === Number(userId));

  if (userIdx === -1) return res.status(404).json({ success: false, message: 'RFID unregistered' });
  if (data.users[userIdx].balance < amount) return res.status(402).json({ success: false, message: 'Insufficient funds' });

  data.users[userIdx].balance -= amount;
  
  data.transactions.push({
    id: Date.now(),
    userId: Number(userId),
    type: 'debit',
    title: 'Station Exit Tap',
    amount: Number(amount),
    date: new Date().toLocaleDateString() + ', ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  saveData(data);
  res.json({ success: true, message: 'Tap Approved', newBalance: data.users[userIdx].balance });
});

app.listen(PORT, () => {
  console.log(`🚀 SmartRail Backend running on http://localhost:${PORT}`);
});
