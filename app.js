// frontend/app.js
document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chatbot-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const agendamentosFuturosDiv = document.getElementById('agendamentos-futuros');
    const refreshAgendamentosBtn = document.getElementById('refresh-agendamentos');

    // Gera um ID de sessão único para o usuário, ou recupera se já existir no localStorage
    let sessionId = localStorage.getItem('chatbotSessionId');
    if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('chatbotSessionId', sessionId);
    }

    // Função para adicionar mensagem ao chat
    function addMessage(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(sender === 'user' ? 'user-message' : 'bot-message');
        messageDiv.innerHTML = message; // Usar innerHTML para permitir negrito
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Rolar para a última mensagem
    }

    // Função para enviar mensagem ao backend do chatbot
    async function sendMessageToBot(message) {
        addMessage(message, 'user');
        userInput.value = ''; // Limpa o input

        try {
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: message, sessionId: sessionId })
            });
            const data = await response.json();
            if (response.ok) {
                addMessage(data.response, 'bot');
                // Se o agendamento foi confirmado, tenta atualizar a lista de agendamentos
                if (data.response.includes('Agendamento Confirmado!')) {
                    // Espera um pouco para o banco de dados ser atualizado
                    setTimeout(() => loadAgendamentosDoCliente('João da Silva'), 1000); // Substitua pelo nome do cliente real
                }
            } else {
                addMessage(`Erro do Chatbot: ${data.error || 'Ocorreu um erro.'}`, 'bot');
            }
        } catch (error) {
            console.error('Erro ao comunicar com o backend:', error);
            addMessage('Desculpe, não consegui me comunicar com o servidor. Tente novamente mais tarde.', 'bot');
        }
    }

    // Event listeners para o input e botão de envio
    sendButton.addEventListener('click', () => {
        const message = userInput.value.trim();
        if (message) {
            sendMessageToBot(message);
        }
    });

    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendButton.click();
        }
    });

    // Função para carregar e exibir agendamentos futuros
    async function loadAgendamentosDoCliente(nomeCliente) {
        try {
            const response = await fetch(`http://localhost:3000/api/agendamentos/cliente/${encodeURIComponent(nomeCliente)}`);
            const data = await response.json();

            agendamentosFuturosDiv.innerHTML = ''; // Limpa agendamentos anteriores

            if (data.agendamentos && data.agendamentos.length > 0) {
                data.agendamentos.forEach(agendamento => {
                    const agendamentoItem = document.createElement('div');
                    agendamentoItem.innerHTML = `
                        <strong>Exame:</strong> ${agendamento.tipo_exame}<br>
                        <strong>Região:</strong> ${agendamento.regiao}<br>
                        <strong>Data:</strong> ${new Date(agendamento.data_hora).toLocaleDateString('pt-BR')}<br>
                        <strong>Hora:</strong> ${new Date(agendamento.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    `;
                    agendamentosFuturosDiv.appendChild(agendamentoItem);
                });
            } else {
                agendamentosFuturosDiv.innerHTML = '<p>Nenhum agendamento futuro.</p>';
            }
        } catch (error) {
            console.error('Erro ao carregar agendamentos:', error);
            agendamentosFuturosDiv.innerHTML = '<p>Erro ao carregar agendamentos.</p>';
        }
    }

    // Carregar agendamentos ao carregar a página (com um nome de cliente fictício por enquanto)
    // Em um sistema real, o nome do cliente viria do login/sessão do usuário.
    loadAgendamentosDoCliente('João da Silva'); // TODO: Substituir por nome de cliente real, talvez vindo do chatbot após agendamento

    refreshAgendamentosBtn.addEventListener('click', () => {
        loadAgendamentosDoCliente('João da Silva'); // TODO: Substituir
    });
});
