// backend/routes/chat.js
const express = require('express');
const router = express.Router();
const db = require('../utils/db'); // Para persistir o contexto da sessão
const agendamentosRoutes = require('./agendamentos'); // Importar para usar as funcionalidades de agendamento se necessário

const REGIOES = ['São Paulo', 'Osasco', 'Porto Alegre', 'Rio de Janeiro', 'Belo Horizonte'];
const TIPOS_EXAME_COMUNS = ['Consulta Clínica', 'Exame de Sangue', 'Raio-X', 'Ultrassom', 'Ressonância Magnética']; // Exemplo de tipos de exame

// Estados da conversa (finito, para simplificar)
const CONTEXTO_INICIAL = 'aguardando_intencao';
const CONTEXTO_AGUARDANDO_REGIAO = 'aguardando_regiao';
const CONTEXTO_AGUARDANDO_TIPO_EXAME = 'aguardando_tipo_exame';
const CONTEXTO_AGUARDANDO_DATA = 'aguardando_data';
const CONTEXTO_AGUARDANDO_HORARIO = 'aguardando_horario';
const CONTEXTO_AGUARDANDO_CONFIRMACAO = 'aguardando_confirmacao';
const CONTEXTO_FINALIZADO = 'finalizado';

/**
 * Funções auxiliares para o chatbot
 */

// Salva o contexto da sessão no banco de dados
async function saveSessionContext(sessionId, context) {
    const contextoJson = JSON.stringify(context);
    return new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO sessoes_chatbot (session_id, contexto) VALUES (?, ?)`,
            [sessionId, contextoJson],
            function (err) {
                if (err) {
                    console.error('Erro ao salvar contexto da sessão:', err.message);
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

// Carrega o contexto da sessão do banco de dados
async function loadSessionContext(sessionId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT contexto FROM sessoes_chatbot WHERE session_id = ?`, [sessionId], (err, row) => {
            if (err) {
                console.error('Erro ao carregar contexto da sessão:', err.message);
                reject(err);
            } else if (row && row.contexto) {
                resolve(JSON.parse(row.contexto));
            } else {
                resolve({ estado: CONTEXTO_INICIAL, dados: {} }); // Estado inicial se não houver contexto
            }
        });
    });
}

// Processa a mensagem do usuário
async function processMessage(sessionId, userMessage) {
    let sessionContext = await loadSessionContext(sessionId);
    let botResponse = '';
    let nextState = sessionContext.estado;
    let dadosAgendamento = sessionContext.dados || {}; // Objeto para armazenar os dados do agendamento

    userMessage = userMessage.toLowerCase().trim();

    switch (sessionContext.estado) {
        case CONTEXTO_INICIAL:
            if (userMessage.includes('agendar') || userMessage.includes('marcar') || userMessage.includes('exame') || userMessage.includes('consulta')) {
                botResponse = `Olá! Parece que você quer agendar um exame. Para qual região você gostaria de agendar? As opções são: ${REGIOES.join(', ')}.`;
                nextState = CONTEXTO_AGUARDANDO_REGIAO;
            } else {
                botResponse = 'Olá! Eu sou um chatbot para agendamento de exames médicos. Você gostaria de agendar um exame?';
                nextState = CONTEXTO_INICIAL; // Permanece no estado inicial
            }
            break;

        case CONTEXTO_AGUARDANDO_REGIAO:
            const regiaoEncontrada = REGIOES.find(regiao => userMessage.includes(regiao.toLowerCase()));
            if (regiaoEncontrada) {
                dadosAgendamento.regiao = regiaoEncontrada;
                botResponse = `Ok, para ${regiaoEncontrada}. Agora, qual tipo de exame você gostaria de agendar? (Ex: ${TIPOS_EXAME_COMUNS.slice(0, 3).join(', ')}...)`;
                nextState = CONTEXTO_AGUARDANDO_TIPO_EXAME;
            } else {
                botResponse = `Desculpe, não entendi a região. Por favor, escolha uma das opções: ${REGIOES.join(', ')}.`;
                nextState = CONTEXTO_AGUARDANDO_REGIAO;
            }
            break;

        case CONTEXTO_AGUARDANDO_TIPO_EXAME:
            // Simplesmente aceitamos o que o usuário digitar como tipo de exame.
            // Em uma versão mais complexa, poderíamos ter uma lista validada de exames.
            dadosAgendamento.tipoExame = userMessage;
            botResponse = `Certo, um(a) ${userMessage}. Agora, para qual data você gostaria de agendar? (Formato: AAAA-MM-DD)`;
            nextState = CONTEXTO_AGUARDANDO_DATA;
            break;

        case CONTEXTO_AGUARDANDO_DATA:
            const dataMatch = userMessage.match(/(\d{4}-\d{2}-\d{2})|(\d{2}\/\d{2}\/\d{4})/); // AAAA-MM-DD ou DD/MM/AAAA
            let dataFormatada = null;

            if (dataMatch) {
                if (dataMatch[1]) { // AAAA-MM-DD
                    dataFormatada = dataMatch[1];
                } else if (dataMatch[2]) { // DD/MM/AAAA
                    const [dia, mes, ano] = dataMatch[2].split('/');
                    dataFormatada = `${ano}-${mes}-${dia}`;
                }
            }

            if (dataFormatada && !isNaN(new Date(dataFormatada))) {
                // Verificar se a data não é passada
                const hoje = new Date();
                const dataSelecionada = new Date(dataFormatada);
                hoje.setHours(0,0,0,0);
                dataSelecionada.setHours(0,0,0,0);

                if (dataSelecionada < hoje) {
                    botResponse = "Desculpe, não é possível agendar para uma data passada. Por favor, informe uma data futura. (Formato: AAAA-MM-DD)";
                    nextState = CONTEXTO_AGUARDANDO_DATA;
                    break;
                }

                dadosAgendamento.data = dataFormatada;

                // Agora, buscar horários disponíveis para a região e data
                try {
                    const response = await fetch(`http://localhost:3000/api/agendamentos/disponibilidade?regiao=${encodeURIComponent(dadosAgendamento.regiao)}&tipoExame=${encodeURIComponent(dadosAgendamento.tipoExame)}&data=${dadosAgendamento.data}`);
                    const data = await response.json();

                    if (data.disponiveis && data.disponiveis.length > 0) {
                        const horariosLista = data.disponiveis.map(h => h.split(' ')[1]).join(', '); // Exibe apenas a hora (HH:MM)
                        botResponse = `Ótimo! Temos os seguintes horários disponíveis para ${dadosAgendamento.tipoExame} em ${dadosAgendamento.regiao} no dia ${dadosAgendamento.data}: ${horariosLista}. Qual horário você prefere? (Ex: 09:30)`;
                        dadosAgendamento.horariosDisponiveis = data.disponiveis; // Guarda os horários completos
                        nextState = CONTEXTO_AGUARDANDO_HORARIO;
                    } else {
                        botResponse = `Desculpe, não há horários disponíveis para ${dadosAgendamento.tipoExame} em ${dadosAgendamento.regiao} no dia ${dadosAgendamento.data}. ${data.mensagem || 'Por favor, tente outra data.'}`;
                        nextState = CONTEXTO_AGUARDANDO_DATA; // Volta para pedir outra data
                    }
                } catch (error) {
                    console.error('Erro ao buscar horários:', error);
                    botResponse = 'Ocorreu um erro ao buscar os horários. Por favor, tente novamente mais tarde.';
                    nextState = CONTEXTO_AGUARDANDO_DATA;
                }
            } else {
                botResponse = 'Data inválida. Por favor, informe a data no formato AAAA-MM-DD.';
                nextState = CONTEXTO_AGUARDANDO_DATA;
            }
            break;

        case CONTEXTO_AGUARDANDO_HORARIO:
            const horaMinutoMatch = userMessage.match(/(\d{2}:\d{2})/);
            if (horaMinutoMatch) {
                const horarioEscolhido = `${dadosAgendamento.data} ${horaMinutoMatch[1]}`;
                if (dadosAgendamento.horariosDisponiveis && dadosAgendamento.horariosDisponiveis.includes(horarioEscolhido)) {
                    dadosAgendamento.dataHora = horarioEscolhido;
                    botResponse = `Excelente! Você deseja agendar um(a) **${dadosAgendamento.tipoExame}** em **${dadosAgendamento.regiao}** para o dia **${dadosAgendamento.data}** às **${horaMinutoMatch[1]}**? Por favor, informe seu **nome completo** para confirmar.`;
                    nextState = CONTEXTO_AGUARDANDO_CONFIRMACAO;
                } else {
                    botResponse = `Este horário não está disponível ou é inválido. Por favor, escolha um dos horários listados: ${dadosAgendamento.horariosDisponiveis.map(h => h.split(' ')[1]).join(', ')}.`;
                    nextState = CONTEXTO_AGUARDANDO_HORARIO;
                }
            } else {
                botResponse = 'Horário inválido. Por favor, informe o horário no formato HH:MM.';
                nextState = CONTEXTO_AGUARDANDO_HORARIO;
            }
            break;

        case CONTEXTO_AGUARDANDO_CONFIRMACAO:
            // Assumimos que a mensagem aqui é o nome do cliente
            if (userMessage.length > 2) { // Nome do cliente deve ter pelo menos 3 caracteres
                dadosAgendamento.nomeCliente = userMessage;

                try {
                    const response = await fetch('http://localhost:3000/api/agendamentos/agendar', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            nomeCliente: dadosAgendamento.nomeCliente,
                            regiao: dadosAgendamento.regiao,
                            tipoExame: dadosAgendamento.tipoExame,
                            dataHora: dadosAgendamento.dataHora,
                        }),
                    });

                    const result = await response.json();

                    if (response.ok) {
                        botResponse = `**Agendamento Confirmado!** Seu exame de **${dadosAgendamento.tipoExame}** em **${dadosAgendamento.regiao}** para o dia **${dadosAgendamento.data}** às **${dadosAgendamento.dataHora.split(' ')[1]}** foi agendado com sucesso para ${dadosAgendamento.nomeCliente}. Tenha um ótimo dia!`;
                        nextState = CONTEXTO_FINALIZADO;
                        dadosAgendamento = {}; // Limpar dados após o agendamento
                    } else {
                        botResponse = `Desculpe, não foi possível agendar: ${result.error}. Por favor, tente novamente ou escolha outro horário/data.`;
                        // Voltar para um estado anterior ou reiniciar
                        nextState = CONTEXTO_AGUARDANDO_DATA; // Volta para pedir nova data/horário
                    }
                } catch (error) {
                    console.error('Erro ao enviar agendamento:', error);
                    botResponse = 'Ocorreu um erro inesperado ao processar seu agendamento. Por favor, tente novamente mais tarde.';
                    nextState = CONTEXTO_INICIAL; // Reinicia a conversa em caso de erro grave
                }
            } else {
                botResponse = 'Nome inválido. Por favor, informe seu nome completo para confirmar o agendamento.';
                nextState = CONTEXTO_AGUARDANDO_CONFIRMACAO;
            }
            break;

        case CONTEXTO_FINALIZADO:
            botResponse = 'Seu agendamento já foi finalizado. Se precisar de algo mais, por favor, me diga "agendar" novamente.';
            // Resetar o contexto para permitir um novo agendamento
            nextState = CONTEXTO_INICIAL;
            break;

        default:
            botResponse = 'Desculpe, não entendi. Você gostaria de agendar um exame?';
            nextState = CONTEXTO_INICIAL;
            break;
    }

    // Salvar o novo estado e dados da sessão
    await saveSessionContext(sessionId, { estado: nextState, dados: dadosAgendamento });

    return botResponse;
}


// Endpoint principal do chatbot
router.post('/', async (req, res) => {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
        return res.status(400).json({ error: 'Mensagem e ID da sessão são obrigatórios.' });
    }

    try {
        const botResponse = await processMessage(sessionId, message);
        res.json({ response: botResponse });
    } catch (error) {
        console.error('Erro no processamento da mensagem do chatbot:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao processar a mensagem.' });
    }
});

module.exports = router;
