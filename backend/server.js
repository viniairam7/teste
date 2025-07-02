// backend/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./utils/db'); // Inicializa o banco de dados
const chatRoutes = require('./routes/chat');
const agendamentosRoutes = require('./routes/agendamentos');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Permite requisições de outras origens (frontend)
app.use(bodyParser.json()); // Para parsear o corpo das requisições JSON

// Rotas da API
app.use('/api/chat', chatRoutes);
app.use('/api/agendamentos', agendamentosRoutes);

// Rota de teste
app.get('/', (req, res) => {
    res.send('Backend do Chatbot de Marcação de Exames está funcionando!');
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
});
