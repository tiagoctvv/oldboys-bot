require("dotenv").config();
const express = require('express');
const app = express();

// Mantém o Render acordado
app.get('/', (req, res) => { res.send('Bot OLD BOYS Online!'); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Servidor na porta ${PORT}`); });

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, REST, Routes, SlashCommandBuilder, StringSelectMenuBuilder } = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CONFIG = {
  nome: "OLD BOYS Tournament",
  data: "18 de abril de 2026 às 21:00",
  maxJogadores: 44,
  maxCapitoes: 4,
  posicoes: ["GR", "DC", "ALA", "MDC", "MC", "MCO", "PL"]
};

// Estado do bot (em memória)
let estado = { 
  participantes: [], 
  listaEspera: [], 
  capitoes: [], 
  posicoes: {}, 
  canalId: null, 
  mensagemPrincipalId: null 
};

// --- CONSTRUTOR DO EMBED ---
function criarEmbedPrincipal() {
  const contagem = {}; CONFIG.posicoes.forEach(p => contagem[p] = 0);
  estado.participantes.forEach(id => { 
    (estado.posicoes[id] || []).forEach(p => contagem[p]++); 
  });

  const lista = estado.participantes.length > 0 ? estado.participantes.map((id, i) => {
    const p = estado.posicoes[id] ? estado.posicoes[id].join("/") : "Sem posição";
    return `${i + 1}. <@${id}> — ${p}${estado.capitoes.includes(id) ? " 👑" : ""}`;
  }).join("\n") : "Ainda não há participantes.";

  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🏆 ${CONFIG.nome}`)
    .setDescription(`**Participantes por posição:**\n${lista}`)
    .addFields(
      { name: "📅 Data", value: CONFIG.data, inline: false },
      { name: "👥 Inscritos", value: `${estado.participantes.length}/${CONFIG.maxJogadores}`, inline: true },
      { name: "⏳ Lista de Espera", value: `${estado.listaEspera.length}`, inline: true },
      { name: "👑 Capitães", value: `${estado.capitoes.length}/${CONFIG.maxCapitoes}`, inline: true },
      { name: "📊 Resumo", value: CONFIG.posicoes.map(p => `${p}: ${contagem[p]}`).join(" | "), inline: false }
    ).setFooter({ text: "OLD BOYS Bot" });
}

// --- COMPONENTES ---
const botoes = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("entrar").setLabel("Entrar").setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId("sair").setLabel("Sair").setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId("mais_opcoes").setLabel("Mais Opções").setStyle(ButtonStyle.Secondary)
);

const extras = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("ser_capitao").setLabel("👑 Ser Capitão").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("abrir_posicoes").setLabel("📍 Posições").setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId("fazer_sorteio").setLabel("🎲 Sorteio").setStyle(ButtonStyle.Danger)
);

// --- LOGICA DO BOT ---
client.once(Events.ClientReady, async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { 
    body: [new SlashCommandBuilder().setName("torneio").setDescription("Cria o painel do torneio").toJSON()] 
  });
  console.log("Bot Online e Comandos Registados!");
});

client.on(Events.InteractionCreate, async int => {
  try {
    if (int.isChatInputCommand() && int.commandName === "torneio") {
      const msg = await int.reply({ embeds: [criarEmbedPrincipal()], components: [botoes], fetchReply: true });
      estado.canalId = int.channelId; 
      estado.mensagemPrincipalId = msg.id;
      return;
    }

    if (!int.isButton() && !int.isStringSelectMenu()) return;

    // ESTA LINHA É A SOLUÇÃO PARA O ERRO VERMELHO
    // Ela avisa o Discord que o bot recebeu o clique e está a processar.
    await int.deferUpdate().catch(() => {});

    const uid = int.user.id;

    if (int.customId === "entrar") {
      if (estado.participantes.includes(uid) || estado.listaEspera.includes(uid)) return;
      if (estado.participantes.length < CONFIG.maxJogadores) {
        estado.participantes.push(uid);
      } else {
        estado.listaEspera.push(uid);
      }
    }

    if (int.customId === "sair") {
      estado.participantes = estado.participantes.filter(id => id !== uid);
      estado.capitoes = estado.capitoes.filter(id => id !== uid);
      delete estado.posicoes[uid];
      if (estado.participantes.length < CONFIG.maxJogadores && estado.listaEspera.length > 0) {
        estado.participantes.push(estado.listaEspera.shift());
      }
    }

    if (int.customId === "mais_opcoes") {
      return await int.followUp({ content: "Opções extras para o torneio:", components: [extras], ephemeral: true });
    }

    if (int.customId === "ser_capitao") {
      if (estado.capitoes.length < CONFIG.maxCapitoes && estado.participantes.includes(uid) && !estado.capitoes.includes(uid)) {
        estado.capitoes.push(uid);
      } else {
        return await int.followUp({ content: "Não podes ser capitão (limite atingido ou não estás inscrito).", ephemeral: true });
      }
    }

    if (int.customId === "abrir_posicoes") {
      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("sel_pos")
          .setPlaceholder("Escolhe até 3 posições")
          .setMinValues(1)
          .setMaxValues(3)
          .addOptions(CONFIG.posicoes.map(p => ({ label: p, value: p })))
      );
      return await int.followUp({ content: "Define as tuas posições preferidas:", components: [menu], ephemeral: true });
    }

    if (int.customId === "sel_pos") {
      estado.posicoes[uid] = int.values;
    }

    if (int.customId === "fazer_sorteio") {
      if (estado.participantes.length < 4) return int.followUp({ content: "São necessários pelo menos 4 jogadores!", ephemeral: true });
      
      const players = [...estado.participantes].sort(() => Math.random() - 0.5);
      const teams = { e1: [], e2: [], e3: [], e4: [] };
      players.forEach((id, i) => teams[`e${(i % 4) + 1}`].push(id));

      const res = new EmbedBuilder().setTitle("🎲 Equipas Sorteadas").setColor(0x00FF00)
        .addFields(
          { name: "Equipa 1", value: teams.e1.map(id => `<@${id}>`).join("\n") || "Vazia" },
          { name: "Equipa 2", value: teams.e2.map(id => `<@${id}>`).join("\n") || "Vazia" },
          { name: "Equipa 3", value: teams.e3.map(id => `<@${id}>`).join("\n") || "Vazia" },
          { name: "Equipa 4", value: teams.e4.map(id => `<@${id}>`).join("\n") || "Vazia" }
        );
      return await int.followUp({ embeds: [res], ephemeral: false });
    }

    // Atualiza a mensagem principal no canal
    const canal = await client.channels.fetch(estado.canalId);
    const msg = await canal.messages.fetch(estado.mensagemPrincipalId);
    await msg.edit({ embeds: [criarEmbedPrincipal()] });

  } catch (e) { 
    console.error("Erro no processamento:", e); 
  }
});

client.login(TOKEN);
