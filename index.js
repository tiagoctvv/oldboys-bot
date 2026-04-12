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
  console.error("Erro: Falta o TOKEN ou o CLIENT_ID nas Environment Variables.");
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

const POSICOES_VALIDAS = ["GR", "DC", "ALA", "MDC", "MC", "MCO", "PL"];

const estado = {
  participantes: [],
  listaEspera: [],
  capitoes: [],
  posicoes: {},
  equipas: { equipa1: [], equipa2: [], equipa3: [], equipa4: [] },
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
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Comandos registados com sucesso.");
  } catch (error) {
    console.error("Erro ao registar comandos:", error);
  }
}

// --- FUNÇÕES DE UTILIDADE ---
function baralharArray(array) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function resetarEquipas() {
  estado.equipas = { equipa1: [], equipa2: [], equipa3: [], equipa4: [] };
  estado.sorteioFeito = false;
}

function limparJogador(userId) {
  estado.participantes = estado.participantes.filter(id => id !== userId);
  estado.listaEspera = estado.listaEspera.filter(id => id !== userId);
  estado.capitoes = estado.capitoes.filter(id => id !== userId);
  delete estado.posicoes[userId];
  Object.keys(estado.equipas).forEach(nome => {
    estado.equipas[nome] = estado.equipas[nome].filter(id => id !== userId);
  });
}

function promoverDaListaEspera() {
  const promovidos = [];
  while (estado.participantes.length < CONFIG.maxJogadores && estado.listaEspera.length > 0) {
    const proximo = estado.listaEspera.shift();
    estado.participantes.push(proximo);
    promovidos.push(proximo);
  }
  return promovidos;
}

function utilizadorInscrito(userId) { return estado.participantes.includes(userId); }
function utilizadorNaListaEspera(userId) { return estado.listaEspera.includes(userId); }
function utilizadorCapitao(userId) { return estado.capitoes.includes(userId); }
function obterPosicoes(userId) { return estado.posicoes[userId] || []; }
function obterPosicaoPrincipal(userId) { 
  const pos = obterPosicoes(userId);
  return pos.length ? pos[0] : "Sem posição";
}

function formatarPosicoes(userId) {
  const pos = obterPosicoes(userId);
  return pos.length ? pos.join(" / ") : "Sem posição";
}

function contarSemPosicao() {
  return estado.participantes.filter(id => !estado.posicoes[id] || estado.posicoes[id].length === 0).length;
}

function contarPosicoes() {
  const contagem = {};
  POSICOES_VALIDAS.forEach(p => contagem[p] = 0);
  estado.participantes.forEach(id => {
    obterPosicoes(id).forEach(p => { if (contagem[p] !== undefined) contagem[p]++; });
  });
  return contagem;
}

function formatarResumoPosicoes() {
  const contagem = contarPosicoes();
  return POSICOES_VALIDAS.map(p => `${p}: ${contagem[p]}`).join("\n");
}

function formatarParticipantes() {
  if (!estado.participantes.length) return "Ainda não há participantes.";
  const grupos = {};
  POSICOES_VALIDAS.forEach(p => grupos[p] = []);
  const semPosicao = [];

  estado.participantes.forEach(id => {
    const principal = obterPosicaoPrincipal(id);
    if (principal === "Sem posição") semPosicao.push(id);
    else grupos[principal].push(id);
  });

  let texto = POSICOES_VALIDAS.map(p => {
    if (!grupos[p].length) return null;
    const lista = grupos[p].map((id, i) => `${i + 1}. <@${id}> — ${formatarPosicoes(id)}${utilizadorCapitao(id) ? " 👑" : ""}`).join("\n");
    return `**${p}**\n${lista}`;
  }).filter(t => t).join("\n\n");

  if (semPosicao.length) {
    texto += `\n\n**Sem posição**\n` + semPosicao.map((id, i) => `${i + 1}. <@${id}> — Sem posição${utilizadorCapitao(id) ? " 👑" : ""}`).join("\n");
  }
  return texto;
}

function formatarListaEspera() {
  if (!estado.listaEspera.length) return "Nenhum";
  return estado.listaEspera.map((id, i) => `${i + 1}. <@${id}> — ${formatarPosicoes(id)}`).join("\n");
}

function formatarEquipa(listaIds) {
  if (!listaIds.length) return "Nenhum jogador.";
  return listaIds.map((id, i) => `${i + 1}. <@${id}> — ${obterPosicaoPrincipal(id)}${utilizadorCapitao(id) ? " 👑" : ""}`).join("\n");
}

// --- CRIAÇÃO DE EMBEDS E COMPONENTES ---
function criarEmbedPrincipal() {
  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🏆 ${CONFIG.nome}`)
    .setDescription(`**Participantes por posição:**\n${formatarParticipantes()}`)
    .addFields(
      { name: "📅 Data", value: CONFIG.data, inline: false },
      { name: "👥 Inscritos", value: `${estado.participantes.length}/${CONFIG.maxJogadores}`, inline: true },
      { name: "⏳ Lista de Espera", value: `${estado.listaEspera.length}`, inline: true },
      { name: "👑 Capitães", value: `${estado.capitoes.length}/${CONFIG.maxCapitoes}`, inline: true },
      { name: "📊 Resumo", value: formatarResumoPosicoes(), inline: false }
    )
    .setFooter({ text: "OLD BOYS Bot" });
}

function criarBotoesPrincipais() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("entrar").setLabel("Entrar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sair").setLabel("Sair").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("mais_opcoes").setLabel("Mais Opções").setStyle(ButtonStyle.Secondary)
  );
}

function criarBotoesMaisOpcoes() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ser_capitao").setLabel("👑 Ser Capitão").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("abrir_posicoes").setLabel("📍 Posições").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("fazer_sorteio").setLabel("🎲 Sorteio").setStyle(ButtonStyle.Danger)
  );
}

function criarMenuPosicoes() {
  const options = POSICOES_VALIDAS.map(p => new StringSelectMenuOptionBuilder().setLabel(p).setValue(p));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("selecionar_posicoes")
      .setPlaceholder("Escolhe as tuas posições")
      .setMinValues(1)
      .setMaxValues(CONFIG.maxPosicoesPorJogador)
      .addOptions(options)
  );
}

function fazerSorteio4Equipas() {
  resetarEquipas();
  const nomes = ["equipa1", "equipa2", "equipa3", "equipa4"];
  estado.capitoes.forEach((id, i) => estado.equipas[nomes[i]].push(id));
  
  const restantes = baralharArray(estado.participantes.filter(id => !estado.capitoes.includes(id)));
  restantes.forEach(id => {
    const alvo = nomes.sort((a, b) => estado.equipas[a].length - estado.equipas[b].length)[0];
    estado.equipas[alvo].push(id);
  });
  estado.sorteioFeito = true;
}

async function atualizarMensagemPrincipal() {
  try {
    if (!estado.canalId || !estado.mensagemPrincipalId) return;
    const canal = await client.channels.fetch(estado.canalId);
    const msg = await canal.messages.fetch(estado.mensagemPrincipalId);
    await msg.edit({ embeds: [criarEmbedPrincipal()], components: [criarBotoesPrincipais()] });
  } catch (e) { console.error("Erro ao atualizar:", e); }
}

// --- EVENTOS ---
client.once(Events.ClientReady, async () => {
  console.log(`Bot ligado como ${client.user.tag}`);
  await registarComandos();
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "torneio") {
      const resp = await interaction.reply({ embeds: [criarEmbedPrincipal()], components: [criarBotoesPrincipais()], fetchReply: true });
      estado.canalId = interaction.channelId;
      estado.mensagemPrincipalId = resp.id;
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "selecionar_posicoes") {
      estado.posicoes[interaction.user.id] = interaction.values;
      await interaction.update({ content: `Posições definidas: ${interaction.values.join("/")}`, components: [] });
      await atualizarMensagemPrincipal();
      return;
    }

    if (!interaction.isButton()) return;
    const userId = interaction.user.id;

    if (interaction.customId === "entrar") {
      if (utilizadorInscrito(userId)) return interaction.reply({ content: "Já estás inscrito.", ephemeral: true });
      estado.participantes.length < CONFIG.maxJogadores ? estado.participantes.push(userId) : estado.listaEspera.push(userId);
      await interaction.update({ embeds: [criarEmbedPrincipal()] });
      await atualizarMensagemPrincipal();
    } 
    
    else if (interaction.customId === "sair") {
      limparJogador(userId);
      promoverDaListaEspera();
      await interaction.update({ embeds: [criarEmbedPrincipal()] });
      await atualizarMensagemPrincipal();
    }

    else if (interaction.customId === "mais_opcoes") {
      await interaction.reply({ content: "Opções extras:", components: [criarBotoesMaisOpcoes()], ephemeral: true });
    }

    else if (interaction.customId === "abrir_posicoes") {
      await interaction.reply({ content: "Escolhe posições:", components: [criarMenuPosicoes()], ephemeral: true });
    }

    else if (interaction.customId === "ser_capitao") {
      if (estado.capitoes.length >= CONFIG.maxCapitoes) return interaction.reply({ content: "Limite de capitães atingido.", ephemeral: true });
      if (!estado.capitoes.includes(userId)) estado.capitoes.push(userId);
      await interaction.reply({ content: "Agora és capitão!", ephemeral: true });
      await atualizarMensagemPrincipal();
    }

    else if (interaction.customId === "fazer_sorteio") {
      if (estado.participantes.length < 4) return interaction.reply({ content: "Jogadores insuficientes.", ephemeral: true });
      fazerSorteio4Equipas();
      const embedSorteio = new EmbedBuilder().setTitle("🎲 Equipas Sorteadas")
        .addFields(
          { name: "Equipa 1", value: formatarEquipa(estado.equipas.equipa1) },
          { name: "Equipa 2", value: formatarEquipa(estado.equipas.equipa2) },
          { name: "Equipa 3", value: formatarEquipa(estado.equipas.equipa3) },
          { name: "Equipa 4", value: formatarEquipa(estado.equipas.equipa4) }
        );
      await interaction.reply({ embeds: [embedSorteio] });
    }

  } catch (error) {
    console.error("Erro:", error);
  }
});

client.login(TOKEN);
