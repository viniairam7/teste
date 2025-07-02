// backend/utils/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho para o arquivo do banco de dados SQLite
const dbPath = path.resolve(__dirname, '../data', 'agendamentos.db');

// Conecta ou cria o banco de dados
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite em:', dbPath);
        // Cria as tabelas se não existirem
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS agendamentos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome_cliente TEXT NOT NULL,
                    regiao TEXT NOT NULL,
                    tipo_exame TEXT NOT NULL,
                    data_hora DATETIME NOT NULL UNIQUE
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar a tabela agendamentos:', err.message);
                } else {
                    console.log('Tabela agendamentos verificada/criada com sucesso.');
                }
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS sessoes_chatbot (
                    session_id TEXT PRIMARY KEY,
                    contexto TEXT, -- JSON string para armazenar o estado da conversa
                    ultima_atualizacao DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar a tabela sessoes_chatbot:', err.message);
                } else {
                    console.log('Tabela sessoes_chatbot verificada/criada com sucesso.');
                }
            });
        });
    }
});

module.exports = db;
