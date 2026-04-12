require("dotenv").config();
const express = require('express');
const app = express();

// --- CONFIGURAÇÃO PARA O RENDER NÃO DESLIGAR ---
app.get('/', (req, res) => {
  res.send('Bot OLD BOYS está online e funcional!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de monitorização pronto na porta ${PORT}`);
});
// ----------------------------------------------

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("Erro: Falta o TOKEN ou o CLIENT_ID nas Environment Variables do Render.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CONFIG = {
  nome: "OLD BOYS Tournament",
  data: "18 de abril de 2026 às 21:00",
  plataforma: "Crossplay",
  tipo: "Pro Clubs Tournament",
  formato: "4 equipas de 11",
  maxJogadores: 44,
  maxCapitoes: 4,
  jogadoresPorEquipa: 11,
  prioridade: "@🌟 - PREMIUM",
  regras: "Sem ALT abuse",
  restricoes: "Aplicam-se as regras oficiais do torneio",
  maxPosicoesPorJogador: 3
};

const POSICOES_VALIDAS = [
  "GR",
  "DC",
  "ALA",
  "MDC",
  "MC",
  "MCO",
  "PL"
];

const estado = {
  participantes: [],
  listaEspera: [],
  capitoes: [],
  posicoes: {},
  equipas: {
    equipa1: [],
    equipa2: [],
    equipa3: [],
    equipa4: []
  },
  sorteioFeito: false,
  canalId: null,
  mensagemPrincipalId: null
};

const commands = [
  new SlashCommandBuilder()
    .setName("torneio")
    .setDescription("Cria a mensagem principal do torneio")
    .toJSON()
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registarComandos() {
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log("Comandos registados com sucesso.");
  } catch (error) {
    console.error("Erro ao registar comandos:", error);
  }
}

function baralharArray(array) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function resetarEquipas() {
  estado.equipas = {
    equipa1: [],
    equipa2: [],
    equipa3: [],
    equipa4: []
  };
  estado.sorteioFeito = false;
}

function limparJogador(userId) {
  estado.participantes = estado.participantes.filter(id => id !== userId);
  estado.listaEspera = estado.listaEspera.filter(id => id !== userId);
  estado.capitoes = estado.capitoes.filter(id => id !== userId);
  delete estado.posicoes[userId];

  Object.keys(estado.equipas).forEach(nomeEquipa => {
    estado.equipas[nomeEquipa] = estado.equipas[nomeEquipa].filter(id => id !== userId);
  });
}

function promoverDaListaEspera() {
  const promovidos = [];

  while (
    estado.participantes.length < CONFIG.maxJogadores &&
    estado.listaEspera.length > 0
  ) {
    const proximo = estado.listaEspera.shift();
    estado.participantes.push(proximo);
    promovidos.push(proximo);
  }

  return promovidos;
}

function utilizadorInscrito(userId) {
  return estado.participantes.includes(userId);
}

function utilizadorNaListaEspera(userId) {
  return estado.listaEspera.includes(userId);
}

function utilizadorCapitao(userId) {
  return estado.capitoes.includes(userId);
}

function obterPosicoes(userId) {
  return estado.posicoes[userId] || [];
}

function obterPosicaoPrincipal(userId) {
  const posicoes = obterPosicoes(userId);
  return posicoes.length ? posicoes[0] : "Sem posição";
}

function formatarPosicoes(userId) {
  const posicoes = obterPosicoes(userId);
  return posicoes.length ? posicoes.join(" / ") : "Sem posição";
}

function contarSemPosicao() {
  return estado.participantes.filter(id => !estado.posicoes[id] || estado.posicoes[id].length === 0).length;
}

function contarPosicoes() {
  const contagem = {};

  for (const posicao of POSICOES_VALIDAS) {
    contagem[posicao] = 0;
  }

  for (const userId of estado.participantes) {
    const posicoes = obterPosicoes(userId);

    for (const posicao of posicoes) {
      if (contagem[posicao] !== undefined) {
        contagem[posicao]++;
      }
    }
  }

  return contagem;
}

function formatarResumoPosicoes() {
  const contagem = contarPosicoes();
  return POSICOES_VALIDAS.map(posicao => `${posicao}: ${contagem[posicao]}`).join("\n");
}

function formatarParticipantes() {
  if (!estado.participantes.length) {
    return "Ainda não há participantes.";
  }

  const grupos = {};
  for (const posicao of POSICOES_VALIDAS) {
    grupos[posicao] = [];
  }

  const semPosicao = [];

  for (const id of estado.participantes) {
    const posicoes = obterPosicoes(id);
    const principal = posicoes.length ? posicoes[0] : null;

    if (!principal) {
      semPosicao.push(id);
    } else {
      if (!grupos[principal]) grupos[principal] = [];
      grupos[principal].push(id);
    }
  }

  const blocos = [];

  for (const posicao of POSICOES_VALIDAS) {
    if (grupos[posicao].length > 0) {
      const lista = grupos[posicao]
        .map((id, index) => {
          const posicoes = formatarPosicoes(id);
          const tagCapitao = utilizadorCapitao(id) ? " 👑" : "";
          return `${index + 1}. <@${id}> — ${posicoes}${tagCapitao}`;
        })
        .join("\n");

      blocos.push(`**${posicao}**\n${lista}`);
    }
  }

  if (semPosicao.length > 0) {
    const listaSemPosicao = semPosicao
      .map((id, index) => {
        const tagCapitao = utilizadorCapitao(id) ? " 👑" : "";
        return `${index + 1}. <@${id}> — Sem posição${tagCapitao}`;
      })
      .join("\n");

    blocos.push(`**Sem posição**\n${listaSemPosicao}`);
  }

  return blocos.join("\n\n");
}

function formatarListaEspera() {
  if (!estado.listaEspera.length) {
    return "Nenhum";
  }

  const grupos = {};
  for (const posicao of POSICOES_VALIDAS) {
    grupos[posicao] = [];
  }

  const semPosicao = [];

  for (const id of estado.listaEspera) {
    const posicoes = obterPosicoes(id);
    const principal = posicoes.length ? posicoes[0] : null;

    if (!principal) {
      semPosicao.push(id);
    } else {
      if (!grupos[principal]) grupos[principal] = [];
      grupos[principal].push(id);
    }
  }

  const blocos = [];

  for (const posicao of POSICOES_VALIDAS) {
    if (grupos[posicao].length > 0) {
      const lista = grupos[posicao]
        .map((id, index) => `${index + 1}. <@${id}> — ${formatarPosicoes(id)}`)
        .join("\n");

      blocos.push(`**${posicao}**\n${lista}`);
    }
  }

  if (semPosicao.length > 0) {
    const listaSemPosicao = semPosicao
      .map((id, index) => `${index + 1}. <@${id}> — Sem posição`)
      .join("\n");

    blocos.push(`**Sem posição**\n${listaSemPosicao}`);
  }

  return blocos.join("\n\n");
}

function formatarEquipa(listaIds) {
  if (!listaIds.length) return "Nenhum jogador.";

  return listaIds
    .map((id, index) => {
      const posicaoPrincipal = obterPosicaoPrincipal(id);
      const todasPosicoes = obterPosicoes(id);
      const posicoesExtras = todasPosicoes.length > 1
        ? ` (${todasPosicoes.join(" / ")})`
        : "";
      const tagCapitao = utilizadorCapitao(id) ? " 👑" : "";
      return `${index + 1}. <@${id}> — ${posicaoPrincipal}${posicoesExtras}${tagCapitao}`;
    })
    .join("\n");
}

function criarEmbedPrincipal() {
  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🏆 ${CONFIG.nome}`)
    .setDescription(`**Participantes por posição:**\n${formatarParticipantes()}`)
    .addFields(
      {
        name: "📅 Data",
        value: CONFIG.data,
        inline: false
      },
      {
        name: "🎮 Plataforma",
        value: CONFIG.plataforma,
        inline: true
      },
      {
        name: "🏆 Tipo",
        value: CONFIG.tipo,
        inline: true
      },
      {
        name: "⚔️ Formato",
        value: CONFIG.formato,
        inline: true
      },
      {
        name: "👥 Inscritos",
        value: `${estado.participantes.length}/${CONFIG.maxJogadores}`,
        inline: true
      },
      {
        name: "⏳ Lista de Espera",
        value: `${estado.listaEspera.length}`,
        inline: true
      },
      {
        name: "👑 Capitães",
        value: `${estado.capitoes.length}/${CONFIG.maxCapitoes}`,
        inline: true
      },
      {
        name: "📍 Sem posição",
        value: `${contarSemPosicao()}`,
        inline: true
      },
      {
        name: "📊 Resumo das Posições",
        value: formatarResumoPosicoes(),
        inline: false
      },
      {
        name: "⏳ Jogadores em Espera",
        value: formatarListaEspera(),
        inline: false
      },
      {
        name: "⭐ Prioridade",
        value: `Cargos com prioridade:\n${CONFIG.prioridade}`,
        inline: false
      },
      {
        name: "📜 Regras",
        value: CONFIG.regras,
        inline: false
      },
      {
        name: "🚧 Restrições",
        value: CONFIG.restricoes,
        inline: false
      }
    )
    .setFooter({ text: "OLD BOYS Bot" });
}

function criarEmbedSorteio() {
  return new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle("🎲 Sorteio das 4 Equipas")
    .addFields(
      {
        name: "🟥 Equipa 1",
        value: formatarEquipa(estado.equipas.equipa1),
        inline: false
      },
      {
        name: "🟦 Equipa 2",
        value: formatarEquipa(estado.equipas.equipa2),
        inline: false
      },
      {
        name: "🟩 Equipa 3",
        value: formatarEquipa(estado.equipas.equipa3),
        inline: false
      },
      {
        name: "🟨 Equipa 4",
        value: formatarEquipa(estado.equipas.equipa4),
        inline: false
      }
    )
    .setFooter({ text: "Sorteio concluído" });
}

function criarBotoesPrincipais() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("entrar")
      .setLabel("Entrar")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("sair")
      .setLabel("Sair")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("mais_opcoes")
      .setLabel("Mais Opções")
      .setStyle(ButtonStyle.Secondary)
  );
}

function criarBotoesMaisOpcoes() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ver_info")
      .setLabel("📋 Info")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("ver_participantes")
      .setLabel("👥 Participantes")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("ser_capitao")
      .setLabel("👑 Ser Capitão")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("abrir_posicoes")
      .setLabel("📍 Posições")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("fazer_sorteio")
      .setLabel("🎲 Sorteio")
      .setStyle(ButtonStyle.Danger)
  );
}

function criarMenuPosicoes() {
  const options = POSICOES_VALIDAS.map(posicao =>
    new StringSelectMenuOptionBuilder()
      .setLabel(posicao)
      .setValue(posicao)
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId("selecionar_posicoes")
    .setPlaceholder("Escolhe 1, 2 ou 3 posições")
    .setMinValues(1)
    .setMaxValues(CONFIG.maxPosicoesPorJogador)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

function criarBotoesConfirmacaoSaida() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confirmar_saida")
      .setLabel("Confirmar saída")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("cancelar_saida")
      .setLabel("Voltar")
      .setStyle(ButtonStyle.Secondary)
  );
}

function validarCondicoesSorteio() {
  if (estado.participantes.length !== CONFIG.maxJogadores) {
    return `É preciso ter exatamente ${CONFIG.maxJogadores} jogadores inscritos para fazer o sorteio.`;
  }

  if (estado.capitoes.length !== CONFIG.maxCapitoes) {
    return `É preciso haver exatamente ${CONFIG.maxCapitoes} capitães para fazer o sorteio.`;
  }

  const jogadoresSemPosicao = estado.participantes.filter(
    id => !estado.posicoes[id] || estado.posicoes[id].length === 0
  );

  if (jogadoresSemPosicao.length > 0) {
    return "Todos os jogadores têm de escolher pelo menos uma posição antes do sorteio.";
  }

  return null;
}

function criarGruposPorPosicao(listaJogadores) {
  const grupos = {};

  for (const posicao of POSICOES_VALIDAS) {
    grupos[posicao] = [];
  }

  for (const jogadorId of listaJogadores) {
    const posicaoPrincipal = obterPosicaoPrincipal(jogadorId);

    if (!grupos[posicaoPrincipal]) {
      grupos[posicaoPrincipal] = [];
    }

    grupos[posicaoPrincipal].push(jogadorId);
  }

  for (const posicao of Object.keys(grupos)) {
    grupos[posicao] = baralharArray(grupos[posicao]);
  }

  return grupos;
}

function equipasOrdenadasPorTamanho() {
  return Object.entries(estado.equipas)
    .sort((a, b) => a[1].length - b[1].length)
    .map(([nome]) => nome);
}

function fazerSorteio4Equipas() {
  resetarEquipas();

  const nomesEquipas = ["equipa1", "equipa2", "equipa3", "equipa4"];

  estado.capitoes.forEach((capitaoId, index) => {
    estado.equipas[nomesEquipas[index]].push(capitaoId);
  });

  const restantes = estado.participantes.filter(id => !estado.capitoes.includes(id));
  const grupos = criarGruposPorPosicao(restantes);

  for (const posicao of Object.keys(grupos)) {
    const jogadoresDaPosicao = grupos[posicao];

    for (const jogadorId of jogadoresDaPosicao) {
      const equipasOrdenadas = equipasOrdenadasPorTamanho();

      for (const nomeEquipa of equipasOrdenadas) {
        if (estado.equipas[nomeEquipa].length < CONFIG.jogadoresPorEquipa) {
          estado.equipas[nomeEquipa].push(jogadorId);
          break;
        }
      }
    }
  }

  const todosNasEquipas = Object.values(estado.equipas).flat();
  const emFalta = estado.participantes.filter(id => !todosNasEquipas.includes(id));

  for (const jogadorId of emFalta) {
    const equipasOrdenadas = equipasOrdenadasPorTamanho();

    for (const nomeEquipa of equipasOrdenadas) {
      if (estado.equipas[nomeEquipa].length < CONFIG.jogadoresPorEquipa) {
        estado.equipas[nomeEquipa].push(jogadorId);
        break;
      }
    }
  }

  estado.sorteioFeito = true;
}

async function encontrarMensagemPrincipal() {
  try {
    if (estado.canalId && estado.mensagemPrincipalId) {
      const canal = await client.channels.fetch(estado.canalId).catch(() => null);
      if (canal) {
        const mensagem = await canal.messages.fetch(estado.mensagemPrincipalId).catch(() => null);
        if (mensagem) return mensagem;
      }
    }

    if (!estado.canalId) return null;

    const canal = await client.channels.fetch(estado.canalId).catch(() => null);
    if (!canal) return null;

    const mensagens = await canal.messages.fetch({ limit: 50 }).catch(() => null);
    if (!mensagens) return null;

    const mensagem = mensagens.find(msg =>
      msg.author?.id === client.user.id &&
      msg.embeds?.length > 0 &&
      msg.embeds[0]?.title === `🏆 ${CONFIG.nome}`
    );

    if (mensagem) {
      estado.mensagemPrincipalId = mensagem.id;
      return mensagem;
    }

    return null;
  } catch (error) {
    console.error("Erro ao encontrar mensagem principal:", error);
    return null;
  }
}

async function atualizarMensagemPrincipal() {
  try {
    const mensagem = await encontrarMensagemPrincipal();
    if (!mensagem) {
      console.log("Mensagem principal não encontrada.");
      return;
    }

    await mensagem.edit({
      embeds: [criarEmbedPrincipal()],
      components: [criarBotoesPrincipais()]
    });
  } catch (error) {
    console.error("Erro ao atualizar a mensagem principal:", error);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot ligado como ${client.user.tag}`);
  await registarComandos();
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "torneio") {
        const resposta = await interaction.reply({
          embeds: [criarEmbedPrincipal()],
          components: [criarBotoesPrincipais()],
          fetchReply: true
        });

        estado.canalId = interaction.channelId;
        estado.mensagemPrincipalId = resposta.id;
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const userId = interaction.user.id;

      if (interaction.customId === "selecionar_posicoes") {
        if (!utilizadorInscrito(userId) && !utilizadorNaListaEspera(userId)) {
          return await interaction.reply({
            content: "Tens de estar inscrito no torneio ou na lista de espera antes de escolher posições.",
            ephemeral: true
          });
        }

        const posicoesEscolhidas = interaction.values.filter(pos =>
          POSICOES_VALIDAS.includes(pos)
        );

        estado.posicoes[userId] = posicoesEscolhidas;
        resetarEquipas();

        await interaction.update({
          content: `As tuas posições foram definidas como **${posicoesEscolhidas.join(" / ")}**.`,
          components: []
        });

        await atualizarMensagemPrincipal();
      }

      return;
    }

    if (!interaction.isButton()) return;

    const userId = interaction.user.id;

    if (!interaction.ephemeral && interaction.message) {
      if (
        interaction.message.author?.id === client.user.id &&
        interaction.message.embeds?.length > 0 &&
        interaction.message.embeds[0]?.title === `🏆 ${CONFIG.nome}`
      ) {
        estado.canalId = interaction.channelId;
        estado.mensagemPrincipalId = interaction.message.id;
      }
    }

    if (interaction.customId === "entrar") {
      if (utilizadorInscrito(userId) || utilizadorNaListaEspera(userId)) {
        return await interaction.reply({
          content: "Já estás inscrito neste torneio ou na lista de espera.",
          ephemeral: true
        });
      }

      let mensagemResposta = "Entraste no torneio.";

      if (estado.participantes.length >= CONFIG.maxJogadores) {
        estado.listaEspera.push(userId);
        mensagemResposta = `Os ${CONFIG.maxJogadores} lugares já estão preenchidos. Entraste na lista de espera.`;
      } else {
        estado.participantes.push(userId);
      }

      resetarEquipas();

      await interaction.update({
        embeds: [criarEmbedPrincipal()],
        components: [criarBotoesPrincipais()]
      });

      estado.canalId = interaction.channelId;
      estado.mensagemPrincipalId = interaction.message.id;

      await atualizarMensagemPrincipal();

      await interaction.followUp({
        content: mensagemResposta,
        ephemeral: true
      });

      return;
    }

    if (interaction.customId === "sair") {
      if (!utilizadorInscrito(userId) && !utilizadorNaListaEspera(userId)) {
        return await interaction.reply({
          content: "Tu não estás inscrito neste torneio nem na lista de espera.",
          ephemeral: true
        });
      }

      return await interaction.reply({
        content: "⚠️ Tens a certeza que queres sair do torneio?",
        components: [criarBotoesConfirmacaoSaida()],
        ephemeral: true
      });
    }

    if (interaction.customId === "confirmar_saida") {
      const estavaNosParticipantes = utilizadorInscrito(userId);

      limparJogador(userId);
      resetarEquipas();

      let promovidos = [];
      if (estavaNosParticipantes) {
        promovidos = promoverDaListaEspera();
      }

      let mensagemSaida = "Saíste do torneio com sucesso.";
      if (promovidos.length) {
        mensagemSaida += `\n✅ Entraram automaticamente da lista de espera: ${promovidos.map(id => `<@${id}>`).join(", ")}`;
      }

      await interaction.update({
        content: mensagemSaida,
        components: []
      });

      await atualizarMensagemPrincipal();
      return;
    }

    if (interaction.customId === "cancelar_saida") {
      return await interaction.update({
        content: "A saída foi cancelada.",
        components: []
      });
    }

    if (interaction.customId === "mais_opcoes") {
      return await interaction.reply({
        content: "Escolhe uma opção:",
        components: [criarBotoesMaisOpcoes()],
        ephemeral: true
      });
    }

    if (interaction.customId === "ver_info") {
      return await interaction.reply({
        content:
`📋 **Informações do Torneio**
• Nome: ${CONFIG.nome}
• Data: ${CONFIG.data}
• Plataforma: ${CONFIG.plataforma}
• Tipo: ${CONFIG.tipo}
• Formato: ${CONFIG.formato}
• Máximo de jogadores: ${CONFIG.maxJogadores}
• Capitães necessários: ${CONFIG.maxCapitoes}
• Jogadores por equipa: ${CONFIG.jogadoresPorEquipa}
• Posições por jogador: até ${CONFIG.maxPosicoesPorJogador}
• Posições válidas: ${POSICOES_VALIDAS.join(", ")}
• Prioridade: ${CONFIG.prioridade}
• Regras: ${CONFIG.regras}
• Restrições: ${CONFIG.restricoes}`,
        ephemeral: true
      });
    }

    if (interaction.customId === "ver_participantes") {
      return await interaction.reply({
        content:
`👥 **Participantes**
${formatarParticipantes()}

⏳ **Lista de Espera**
${formatarListaEspera()}

📊 **Resumo das Posições**
${formatarResumoPosicoes()}`,
        ephemeral: true
      });
    }

    if (interaction.customId === "ser_capitao") {
      if (!utilizadorInscrito(userId)) {
        return await interaction.reply({
          content: "Tens de estar nos 44 participantes principais para seres capitão.",
          ephemeral: true
        });
      }

      if (utilizadorCapitao(userId)) {
        return await interaction.reply({
          content: "Já estás marcado como capitão.",
          ephemeral: true
        });
      }

      if (estado.capitoes.length >= CONFIG.maxCapitoes) {
        return await interaction.reply({
          content: `Já existem ${CONFIG.maxCapitoes} capitães definidos.`,
          ephemeral: true
        });
      }

      estado.capitoes.push(userId);
      resetarEquipas();

      await interaction.reply({
        content: `👑 <@${userId}> foi definido como capitão.`,
        ephemeral: true
      });

      await atualizarMensagemPrincipal();
      return;
    }

    if (interaction.customId === "abrir_posicoes") {
      if (!utilizadorInscrito(userId) && !utilizadorNaListaEspera(userId)) {
        return await interaction.reply({
          content: "Tens de estar inscrito no torneio ou na lista de espera antes de escolher posições.",
          ephemeral: true
        });
      }

      return await interaction.reply({
        content: `Escolhe até ${CONFIG.maxPosicoesPorJogador} posições:`,
        components: [criarMenuPosicoes()],
        ephemeral: true
      });
    }

    if (interaction.customId === "fazer_sorteio") {
      const erro = validarCondicoesSorteio();

      if (erro) {
        return await interaction.reply({
          content: erro,
          ephemeral: true
        });
      }

      fazerSorteio4Equipas();
      await atualizarMensagemPrincipal();

      return await interaction.reply({
        embeds: [criarEmbedSorteio()]
      });
    }

  } catch (error) {
    console.error("Erro na interação:", error);

if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "Ocorreu um erro ao processar esta ação.",
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: "Ocorreu um erro ao processar esta ação.",
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("Erro na interação:", error);
  }
});

client.login(TOKEN);
