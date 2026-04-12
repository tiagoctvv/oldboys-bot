require("dotenv").config();
const express = require('express');
const fs = require('fs'); // Módulo para gravar ficheiros
const app = express();
app.get('/', (req, res) => { res.send('OLD BOYS Bot - Online'); });
app.listen(process.env.PORT || 3000);

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, REST, Routes, SlashCommandBuilder, StringSelectMenuBuilder } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = 'ID_DO_TEU_CANAL_DE_LOGS'; // <--- VERIFICA O TEU ID AQUI

const CONFIG = {
  nome: "OLD BOYS TOURNAMENT 🏆",
  data: "18 de abril de 2026 às 21:00",
  maxJogadores: 44,
  maxCapitoes: 4,
  posicoes: ["GR", "DC", "ALA", "MDC", "MC", "MCO", "PL"]
};

// --- SISTEMA DE GRAVAÇÃO PARA NÃO PERDER DADOS ---
const PATH_DADOS = './dados_torneio.json';
let estado = { participantes: [], listaEspera: [], capitoes: [], posicoes: {}, canalId: null, mensagemPrincipalId: null, aAtualizar: false };

function guardarDados() {
    fs.writeFileSync(PATH_DADOS, JSON.stringify(estado, null, 2));
}

function carregarDados() {
    if (fs.existsSync(PATH_DADOS)) {
        const dadosRaw = fs.readFileSync(PATH_DADOS);
        estado = JSON.parse(dadosRaw);
        estado.aAtualizar = false; // Resetar trava de segurança ao ligar
    }
}

// Carrega os dados assim que o bot liga
carregarDados();

function criarEmbed() {
  const contagem = {}; CONFIG.posicoes.forEach(p => contagem[p] = 0);
  estado.participantes.forEach(id => { 
    const pos = estado.posicoes[id] ? estado.posicoes[id][0] : null;
    if (pos) contagem[pos]++;
  });

  const lista = estado.participantes.map((id, i) => {
    const p = estado.posicoes[id] ? `\`${estado.posicoes[id][0]}\`` : "*Sem posição*";
    const icon = estado.capitoes.includes(id) ? "⭐" : "🔹";
    return `> ${i + 1}. ${icon} <@${id}> — ${p}`;
  }).join("\n") || "_Nenhuma inscrição registada..._";

  return new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle(`🌟 ${CONFIG.nome}`)
    .setDescription(`📅 **Data:** \`${CONFIG.data}\`\n\n**LISTA DE ATLETAS:**\n${lista}`)
    .addFields(
      { name: "👥 Inscritos", value: `\`${estado.participantes.length}/${CONFIG.maxJogadores}\``, inline: true },
      { name: "⏳ Espera", value: `\`${estado.listaEspera.length}\``, inline: true },
      { name: "👑 Capitães", value: `\`${estado.capitoes.length}/${CONFIG.maxCapitoes}\``, inline: true },
      { name: "📊 Resumo de Posições", value: CONFIG.posicoes.map(p => `**${p}:** ${contagem[p]}`).join(" | "), inline: false }
    )
    .setFooter({ text: `OLD BOYS System • Última Atualização:` })
    .setTimestamp();
}

const rowPrincipal = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("entrar").setLabel("Inscrever").setStyle(ButtonStyle.Success).setEmoji("⚽"),
  new ButtonBuilder().setCustomId("sair").setLabel("Sair").setStyle(ButtonStyle.Danger).setEmoji("🚪"),
  new ButtonBuilder().setCustomId("mais_opcoes").setLabel("Mais Opções").setStyle(ButtonStyle.Secondary).setEmoji("⚙️")
);

async function enviarLog(texto) {
    if (!texto) return;
    try {
        const canal = await client.channels.fetch(LOG_CHANNEL_ID);
        if (canal) await canal.send(`📝 **[LOG]:** ${texto}`);
    } catch (e) { console.log("Erro log"); }
}

async function atualizarPainel() {
    if (estado.aAtualizar) return;
    estado.aAtualizar = true;
    guardarDados(); // Grava no ficheiro sempre que há alteração

    try {
        if (!estado.canalId || !estado.mensagemPrincipalId) { estado.aAtualizar = false; return; }
        const canal = client.channels.cache.get(estado.canalId) || await client.channels.fetch(estado.canalId);
        const msg = await canal.messages.fetch(estado.mensagemPrincipalId);
        await msg.edit({ embeds: [criarEmbed()], components: [rowPrincipal] });
    } catch (e) { 
        console.error("Erro painel, a tentar novamente..."); 
        setTimeout(async () => {
            try {
                const canal = await client.channels.fetch(estado.canalId);
                const msg = await canal.messages.fetch(estado.mensagemPrincipalId);
                await msg.edit({ embeds: [criarEmbed()], components: [rowPrincipal] });
            } catch (e2) { console.error("Falha final"); }
        }, 2000);
    } finally {
        estado.aAtualizar = false;
    }
}

client.once(Events.ClientReady, async () => {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const comandos = [
      new SlashCommandBuilder().setName("torneio").setDescription("Inicia o painel do torneio"),
      new SlashCommandBuilder().setName("reset").setDescription("Limpa todas as inscrições")
  ].map(c => c.toJSON());
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: comandos });
  console.log("Bot Pronto!");
});

client.on(Events.InteractionCreate, async int => {
  try {
    if (int.isChatInputCommand()) {
      if (int.commandName === "reset") {
          estado.participantes = []; estado.listaEspera = []; estado.capitoes = []; estado.posicoes = {};
          guardarDados();
          await int.reply({ content: "⚠️ Torneio resetado!", ephemeral: true });
          await atualizarPainel();
          return;
      }
      const msg = await int.reply({ embeds: [criarEmbed()], components: [rowPrincipal], fetchReply: true });
      estado.canalId = int.channelId; estado.mensagemPrincipalId = msg.id;
      guardarDados();
      return;
    }

    if (!int.isButton() && !int.isStringSelectMenu()) return;
    await int.deferUpdate().catch(() => {});
    const uid = int.user.id;

    if (int.customId === "entrar") {
      if (estado.participantes.includes(uid) || estado.listaEspera.includes(uid)) return;
      if (estado.participantes.length < CONFIG.maxJogadores) {
        estado.participantes.push(uid);
      } else {
        estado.listaEspera.push(uid);
      }
      await atualizarPainel();
      await enviarLog(`<@${uid}> inscreveu-se.`);
    } 
    else if (int.customId === "sair") {
      estado.participantes = estado.participantes.filter(id => id !== uid);
      estado.listaEspera = estado.listaEspera.filter(id => id !== uid);
      estado.capitoes = estado.capitoes.filter(id => id !== uid);
      delete estado.posicoes[uid];
      await atualizarPainel();
      await enviarLog(`<@${uid}> saiu.`);
    } 
    else if (int.customId === "mais_opcoes") {
        const extras = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ser_capitao").setLabel("Ser Capitão").setStyle(ButtonStyle.Primary).setEmoji("👑"),
            new ButtonBuilder().setCustomId("abrir_posicoes").setLabel("Posição").setStyle(ButtonStyle.Primary).setEmoji("📍"),
            new ButtonBuilder().setCustomId("ver_espera").setLabel("Lista de Espera").setStyle(ButtonStyle.Secondary).setEmoji("⏳"),
            new ButtonBuilder().setCustomId("regras").setLabel("Regras").setStyle(ButtonStyle.Secondary).setEmoji("📜")
        );
        await int.followUp({ content: "🔧 Configurações:", components: [extras], ephemeral: true });
    }
    else if (int.customId === "ver_espera") {
        const espera = estado.listaEspera.map((id, i) => `${i+1}. <@${id}>`).join("\n") || "Ninguém.";
        await int.followUp({ content: `⏳ Espera:\n${espera}`, ephemeral: true });
    }
    else if (int.customId === "regras") {
        await int.followUp({ content: "📜 Online 15min antes. Respeito.", ephemeral: true });
    }
    else if (int.customId === "ser_capitao") {
        if (estado.capitoes.length < CONFIG.maxCapitoes && estado.participantes.includes(uid) && !estado.capitoes.includes(uid)) {
            estado.capitoes.push(uid);
            await atualizarPainel();
            await enviarLog(`<@${uid}> é Capitão.`);
            await int.followUp({ content: "👑 És capitão!", ephemeral: true });
        }
    } 
    else if (int.customId === "abrir_posicoes") {
        const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("sel_pos").setPlaceholder("Posição").addOptions(CONFIG.posicoes.map(p => ({ label: p, value: p }))));
        await int.followUp({ content: "📍 Escolhe posição:", components: [menu], ephemeral: true });
    } 
    else if (int.customId === "sel_pos") {
        estado.posicoes[uid] = int.values;
        await atualizarPainel();
        await enviarLog(`<@${uid}>: ${int.values[0]}`);
        await int.followUp({ content: `✅ Guardado!`, ephemeral: true });
    }
  } catch (e) { console.error(e); }
});

client.login(TOKEN);
