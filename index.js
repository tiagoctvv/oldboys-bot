require("dotenv").config();
const express = require('express');
const app = express();
app.get('/', (req, res) => { res.send('Bot Online'); });
app.listen(process.env.PORT || 3000);

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, REST, Routes, SlashCommandBuilder, StringSelectMenuBuilder } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const CONFIG = {
  nome: "OLD BOYS Tournament",
  data: "18 de abril de 2026 às 21:00",
  maxJogadores: 44,
  maxCapitoes: 4,
  posicoes: ["GR", "DC", "ALA", "MDC", "MC", "MCO", "PL"]
};

let estado = { participantes: [], capitoes: [], posicoes: {}, canalId: null, mensagemPrincipalId: null };

// --- CONSTRUTOR DO EMBED ---
function criarEmbed() {
  const contagem = {}; CONFIG.posicoes.forEach(p => contagem[p] = 0);
  estado.participantes.forEach(id => { (estado.posicoes[id] || []).forEach(p => contagem[p]++); });

  const lista = estado.participantes.map((id, i) => {
    const p = estado.posicoes[id] ? estado.posicoes[id][0] : "Sem posição";
    return `${i + 1}. <@${id}> — ${p}${estado.capitoes.includes(id) ? " 👑" : ""}`;
  }).join("\n") || "Ainda não há participantes.";

  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🏆 ${CONFIG.nome}`)
    .setDescription(`**Participantes:**\n${lista}`)
    .addFields(
      { name: "👥 Inscritos", value: `${estado.participantes.length}/${CONFIG.maxJogadores}`, inline: true },
      { name: "👑 Capitães", value: `${estado.capitoes.length}/${CONFIG.maxCapitoes}`, inline: true },
      { name: "📊 Resumo", value: CONFIG.posicoes.map(p => `${p}: ${contagem[p]}`).join(" | "), inline: false }
    );
}

const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("entrar").setLabel("Entrar").setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId("sair").setLabel("Sair").setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId("mais_opcoes").setLabel("Mais Opções").setStyle(ButtonStyle.Secondary)
);

// --- ATUALIZAÇÃO DA MENSAGEM PRINCIPAL ---
async function atualizarPainel() {
    try {
        const canal = client.channels.cache.get(estado.canalId) || await client.channels.fetch(estado.canalId);
        const msg = await canal.messages.fetch(estado.mensagemPrincipalId);
        await msg.edit({ embeds: [criarEmbed()], components: [row] });
    } catch (e) { console.error("Erro ao editar painel:", e); }
}

client.once(Events.ClientReady, async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [new SlashCommandBuilder().setName("torneio").setDescription("Cria o torneio").toJSON()] });
  console.log("Bot Pronto!");
});

client.on(Events.InteractionCreate, async int => {
  try {
    if (int.isChatInputCommand()) {
      const msg = await int.reply({ embeds: [criarEmbed()], components: [row], fetchReply: true });
      estado.canalId = int.channelId; estado.mensagemPrincipalId = msg.id;
      return;
    }

    if (!int.isButton() && !int.isStringSelectMenu()) return;

    // Resposta imediata para evitar erro vermelho
    await int.deferUpdate().catch(() => {});
    const uid = int.user.id;

    if (int.customId === "entrar") {
      if (!estado.participantes.includes(uid) && estado.participantes.length < CONFIG.maxJogadores) {
        estado.participantes.push(uid);
        await atualizarPainel();
      }
    } 
    
    else if (int.customId === "sair") {
      estado.participantes = estado.participantes.filter(id => id !== uid);
      estado.capitoes = estado.capitoes.filter(id => id !== uid);
      delete estado.posicoes[uid];
      await atualizarPainel();
    } 
    
    else if (int.customId === "mais_opcoes") {
        const extras = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ser_capitao").setLabel("👑 Capitão").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("abrir_posicoes").setLabel("📍 Posição").setStyle(ButtonStyle.Primary)
        );
        // EDITA a mensagem efémera atual, não cria uma nova tabela
        await int.editReply({ content: "Configurações Individuais:", embeds: [], components: [extras], ephemeral: true });
    } 
    
    else if (int.customId === "ser_capitao") {
        if (estado.capitoes.length < 4 && estado.participantes.includes(uid) && !estado.capitoes.includes(uid)) {
            estado.capitoes.push(uid);
            await atualizarPainel();
            await int.editReply({ content: "✅ Agora és capitão!", components: [], ephemeral: true });
        }
    } 
    
    else if (int.customId === "abrir_posicoes") {
        const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("sel_pos").setPlaceholder("Escolhe a tua posição").addOptions(CONFIG.posicoes.map(p => ({ label: p, value: p }))));
        await int.editReply({ content: "Selecione a posição principal:", components: [menu], ephemeral: true });
    } 
    
    else if (int.customId === "sel_pos") {
        estado.posicoes[uid] = int.values;
        await atualizarPainel();
        await int.editReply({ content: `✅ Posição ${int.values[0]} guardada!`, components: [], ephemeral: true });
    }

  } catch (e) { console.error(e); }
});

client.login(TOKEN);
