// backend/routes/agendamentos.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db');

// Capacidade diária de atendimento e por horário
const CAPACIDADE_DIARIA_MIN = 60;
const CAPACIDADE_DIARIA_MAX = 100;
const CAPACIDADE_POR_HORARIO = 5; // Exemplo: 5 agendamentos por horário

// Função auxiliar para formatar datas (YYYY-MM-DD HH:MM)
const formatDateTime = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
};

// GET /api/agendamentos/disponibilidade
// Retorna horários disponíveis para uma região e tipo de exame específicos
router.get('/disponibilidade', (req, res) => {
    const { regiao, tipoExame, data } = req.query; // data no formato YYYY-MM-DD

    if (!regiao || !tipoExame || !data) {
        return res.status(400).json({ error: 'Região, tipo de exame e data são obrigatórios.' });
    }

    const startOfDay = `${data} 00:00:00`;
    const endOfDay = `${data} 23:59:59`;

    // Consulta os agendamentos existentes para a data e região
    db.all(`SELECT data_hora FROM agendamentos WHERE DATE(data_hora) = ? AND regiao = ?`, [data, regiao], (err, rows) => {
        if (err) {
            console.error('Erro ao consultar agendamentos existentes:', err.message);
            return res.status(500).json({ error: 'Erro interno do servidor ao verificar disponibilidade.' });
        }

        const agendamentosExistentes = rows.map(row => new Date(row.data_hora).getTime()); // Convertendo para timestamp

        // Gerar horários fictícios para o dia (ex: a cada 30 minutos das 08:00 às 17:00)
        const horariosPossiveis = [];
        const hoje = new Date();
        const dataParaAgendamento = new Date(data);

        // Não permitir agendamentos para o passado
        if (dataParaAgendamento.setHours(0,0,0,0) < hoje.setHours(0,0,0,0)) {
            return res.json({ disponiveis: [] }); // Nenhum horário disponível para datas passadas
        }

        for (let h = 8; h <= 17; h++) {
            for (let m = 0; m < 60; m += 30) {
                const horario = new Date(data);
                horario.setHours(h, m, 0, 0);

                // Se a data de agendamento for hoje, verificar se o horário já passou
                if (dataParaAgendamento.setHours(0,0,0,0) === hoje.setHours(0,0,0,0) && horario.getTime() <= hoje.getTime()) {
                    continue; // Pular horários que já passaram no dia atual
                }

                horariosPossiveis.push(horario);
            }
        }

        const horariosDisponiveis = {};

        horariosPossiveis.forEach(horario => {
            const horarioFormatado = formatDateTime(horario);
            const count = agendamentosExistentes.filter(agendamento => {
                const agendamentoDate = new Date(agendamento);
                return agendamentoDate.getTime() === horario.getTime();
            }).length;

            if (count < CAPACIDADE_POR_HORARIO) {
                // Adiciona o horário formatado como chave e o horário Date como valor
                horariosDisponiveis[horarioFormatado] = horario;
            }
        });

        // Contar agendamentos para o dia para verificar a capacidade diária
        db.get(`SELECT COUNT(*) as total FROM agendamentos WHERE DATE(data_hora) = ?`, [data], (err, result) => {
            if (err) {
                console.error('Erro ao contar agendamentos diários:', err.message);
                return res.status(500).json({ error: 'Erro interno do servidor ao verificar capacidade diária.' });
            }

            const totalAgendamentosDia = result.total;

            if (totalAgendamentosDia >= CAPACIDADE_DIARIA_MAX) {
                return res.json({ disponiveis: [], mensagem: 'Capacidade máxima de agendamentos para o dia atingida.' });
            }

            res.json({ disponiveis: Object.keys(horariosDisponiveis).sort() }); // Retorna apenas as chaves (strings) ordenadas
        });
    });
});

// POST /api/agendamentos/agendar
// Agenda um novo exame
router.post('/agendar', (req, res) => {
    const { nomeCliente, regiao, tipoExame, dataHora } = req.body;

    if (!nomeCliente || !regiao || !tipoExame || !dataHora) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios para o agendamento.' });
    }

    const dataHoraObj = new Date(dataHora);
    const dataFormatada = formatDateTime(dataHoraObj); // Garante o formato correto

    // 1. Verificar capacidade para o horário específico
    db.get(`SELECT COUNT(*) as count FROM agendamentos WHERE data_hora = ? AND regiao = ?`, [dataFormatada, regiao], (err, row) => {
        if (err) {
            console.error('Erro ao verificar capacidade por horário:', err.message);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }

        if (row.count >= CAPACIDADE_POR_HORARIO) {
            return res.status(409).json({ error: 'Capacidade máxima para este horário e região atingida. Escolha outro horário.' });
        }

        // 2. Verificar capacidade diária total
        const dataApenas = dataHora.split(' ')[0]; // Pega apenas a parte da data
        db.get(`SELECT COUNT(*) as total FROM agendamentos WHERE DATE(data_hora) = ?`, [dataApenas], (err, result) => {
            if (err) {
                console.error('Erro ao verificar capacidade diária:', err.message);
                return res.status(500).json({ error: 'Erro interno do servidor.' });
            }

            if (result.total >= CAPACIDADE_DIARIA_MAX) {
                return res.status(409).json({ error: 'Capacidade máxima de agendamentos para o dia atingida. Tente outro dia.' });
            }

            // 3. Inserir o agendamento
            db.run(`INSERT INTO agendamentos (nome_cliente, regiao, tipo_exame, data_hora) VALUES (?, ?, ?, ?)`,
                [nomeCliente, regiao, tipoExame, dataFormatada],
                function (err) {
                    if (err) {
                        console.error('Erro ao inserir agendamento:', err.message);
                        // Se for erro de UNIQUE constraint (mesmo horário agendado), retorna 409
                        if (err.message.includes('UNIQUE constraint failed')) {
                            return res.status(409).json({ error: 'Já existe um agendamento para este horário. Escolha outro.' });
                        }
                        return res.status(500).json({ error: 'Erro interno do servidor ao agendar.' });
                    }
                    res.status(201).json({
                        message: 'Agendamento realizado com sucesso!',
                        id: this.lastID,
                        agendamento: { nomeCliente, regiao, tipoExame, dataHora: dataFormatada }
                    });
                }
            );
        });
    });
});

// GET /api/agendamentos/cliente/:nomeCliente
// Retorna os próximos agendamentos de um cliente
router.get('/cliente/:nomeCliente', (req, res) => {
    const { nomeCliente } = req.params;
    const now = formatDateTime(new Date()); // Horário atual

    db.all(`SELECT * FROM agendamentos WHERE nome_cliente = ? AND data_hora >= ? ORDER BY data_hora ASC`, [nomeCliente, now], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar agendamentos do cliente:', err.message);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
        res.json({ agendamentos: rows });
    });
});

module.exports = router;
